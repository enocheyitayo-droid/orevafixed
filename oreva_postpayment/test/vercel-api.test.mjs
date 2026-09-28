import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/shop.js';
import health from '../api/health.js';

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; },
  };
}

test('Vercel health endpoint responds with JSON', () => {
  const res = response();
  health({}, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true, backend: 'vercel-function' });
});

test('Vercel catalogue endpoint reads the public Supabase RPC', async () => {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY, fetch: globalThis.fetch };
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'public-test-key';
  const requests = [];
  globalThis.fetch = async (url, options) => {
    const current = { url: String(url), options };
    requests.push(current);
    const data = current.url.endsWith('/bagz_storefront_gallery')
      ? ['gallery-image.webp']
      : { settings: { brand: 'Orẽva' }, products: [], mode: 'disabled' };
    return new Response(JSON.stringify(data), { status: 200 });
  };
  try {
    const res = response();
    await handler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(requests.map(request => request.url), [
      'https://project.supabase.co/rest/v1/rpc/bagz_catalogue',
      'https://project.supabase.co/rest/v1/rpc/bagz_storefront_gallery',
    ]);
    assert.equal(requests[0].options.headers.apikey, 'public-test-key');
    assert.deepEqual(JSON.parse(res.body), {
      settings: { brand: 'Orẽva', logo: '', bagDisplay: '', shoeDisplay: '', displayGallery: ['https://project.supabase.co/storage/v1/object/public/bagz-store-media/gallery-image.webp'] },
      products: [],
      mode: 'disabled',
    });
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previous.key;
  }
});

test('Vercel catalogue endpoint returns JSON when Supabase is not configured', async () => {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  try {
    const res = response();
    await handler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 503);
    assert.match(res.headers['Content-Type'], /application\/json/);
    assert.match(JSON.parse(res.body).error, /not configured/i);
  } finally {
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previous.key;
  }
});

test('catalog remains available before the optional storefront gallery migration is applied', async () => {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY, fetch: globalThis.fetch };
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'public-test-key';
  globalThis.fetch = async url => {
    if (String(url).endsWith('/bagz_storefront_gallery')) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ settings: { brand: 'Orẽva' }, products: [], mode: 'disabled' }), { status: 200 });
  };
  try {
    const res = response();
    await handler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body).settings.displayGallery, []);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previous.key;
  }
});