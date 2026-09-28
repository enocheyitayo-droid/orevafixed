import test from 'node:test';
import assert from 'node:assert/strict';
import login from '../api/login.js';
import admin from '../api/admin/[action].js';

const me = (req, res) => admin({ ...req, query: { ...(req.query || {}), action: 'me' } }, res);
const overview = (req, res) => admin({ ...req, query: { ...(req.query || {}), action: 'overview' } }, res);
const saveProduct = (req, res) => admin({ ...req, query: { ...(req.query || {}), action: 'product' } }, res);
import { supabase } from '../supabase-server.mjs';

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; },
  };
}

const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status });

async function withSupabaseMock(run, mockFetch) {
  const previous = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    origin: process.env.SITE_ORIGIN,
    fetch: globalThis.fetch,
  };
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'public-test-key';
  process.env.SITE_ORIGIN = 'https://oreva-ashy.vercel.app';
  globalThis.fetch = mockFetch;
  try { await run(); }
  finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previous.key;
    if (previous.origin === undefined) delete process.env.SITE_ORIGIN; else process.env.SITE_ORIGIN = previous.origin;
  }
}

test('admin endpoint returns JSON 401 for a visitor without a session', async () => {
  const res = response();
  await me({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.match(res.headers['Content-Type'], /application\/json/);
  assert.match(JSON.parse(res.body).error, /sign-in/i);
});

test('owner login issues secure cookies only after Supabase confirms owner membership', async () => {
  await withSupabaseMock(async () => {
    const res = response();
    await login({ method: 'POST', headers: { origin: 'https://oreva-ashy.vercel.app' }, body: { email: 'owner@example.test', password: 'private-password' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).csrf.length, 48);
    assert.ok(res.headers['Set-Cookie'].some(value => value.startsWith('oreva_access=') && value.includes('HttpOnly')));
    assert.ok(res.headers['Set-Cookie'].some(value => value.startsWith('oreva_csrf=') && !value.includes('HttpOnly')));
  }, async url => {
    if (String(url).includes('/auth/v1/token')) return jsonResponse({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600 });
    if (String(url).includes('/rpc/bagz_is_owner')) return jsonResponse(true);
    throw new Error('Unexpected Supabase request: ' + url);
  });
});

test('admin rejects a valid Supabase user who is not designated as an owner', async () => {
  await withSupabaseMock(async () => {
    const res = response();
    await overview({ method: 'GET', headers: { cookie: 'oreva_access=access-token' } }, res);
    assert.equal(res.statusCode, 403);
    assert.match(JSON.parse(res.body).error, /Owner access/);
  }, async url => {
    if (String(url).endsWith('/auth/v1/user')) return jsonResponse({ id: 'not-an-owner' });
    if (String(url).includes('/rpc/bagz_is_owner')) return jsonResponse(false);
    throw new Error('Unexpected Supabase request: ' + url);
  });
});

test('owner product save uses the Supabase transactional RPC and CSRF protection', async () => {
  await withSupabaseMock(async () => {
    const res = response();
    await saveProduct({
      method: 'POST',
      headers: { origin: 'https://oreva-ashy.vercel.app', cookie: 'oreva_access=access-token; oreva_csrf=csrf-token', 'x-csrf-token': 'csrf-token' },
      body: { name: 'Everyday bag', description: 'Owner-entered item', category: 'Bags', visible: true, photo: '', photos: [], variants: [{ colour: 'Black', size: 'Large', price: 2500000, cost: 1200000, stock: 4 }] },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { id: 'product-id' });
  }, async (url, options) => {
    if (String(url).endsWith('/auth/v1/user')) return jsonResponse({ id: 'owner-id' });
    if (String(url).includes('/rpc/bagz_is_owner')) return jsonResponse(true);
    if (String(url).includes('/rpc/bagz_save_product')) {
      const item = JSON.parse(options.body).item;
      assert.equal(item.name, 'Everyday bag');
      assert.equal(item.variants[0].stock, 4);
      assert.equal(item.variants[0].size, 'One size');
      assert.equal(options.headers.Authorization, 'Bearer access-token');
      return jsonResponse('product-id');
    }
    throw new Error('Unexpected Supabase request: ' + url);
  });
});

test('shoe product saves preserve the owner-entered shoe size', async () => {
  await withSupabaseMock(async () => {
    const res = response();
    await saveProduct({
      method: 'POST',
      headers: { origin: 'https://oreva-ashy.vercel.app', cookie: 'oreva_access=access-token; oreva_csrf=csrf-token', 'x-csrf-token': 'csrf-token' },
      body: { name: 'Everyday shoes', description: 'Owner-entered shoes', category: 'Shoes', visible: true, photo: '', photos: [], variants: [{ colour: 'Black', size: '38', price: 2500000, cost: 1200000, stock: 4 }] },
    }, res);
    assert.equal(res.statusCode, 200);
  }, async (url, options) => {
    if (String(url).endsWith('/auth/v1/user')) return jsonResponse({ id: 'owner-id' });
    if (String(url).includes('/rpc/bagz_is_owner')) return jsonResponse(true);
    if (String(url).includes('/rpc/bagz_save_product')) {
      assert.equal(JSON.parse(options.body).item.variants[0].size, '38');
      return jsonResponse('shoe-product-id');
    }
    throw new Error('Unexpected Supabase request: ' + url);
  });
});

test('missing Supabase settings RPC explains which migration to apply', async () => {
  await withSupabaseMock(async () => {
    await assert.rejects(
      supabase('/rest/v1/rpc/bagz_save_settings', { method: 'POST', body: { settings: {} } }),
      /Apply migration 003_store_media_and_settings\.sql/,
    );
  }, async () => jsonResponse({ code: 'PGRST202', message: 'function does not exist' }, 404));
});
