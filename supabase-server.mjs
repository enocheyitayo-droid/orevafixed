import { randomBytes, timingSafeEqual } from 'node:crypto';

export class ApiProblem extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function sendJson(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new ApiProblem('Supabase is not configured in Vercel.', 503);
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.username || origin.password) {
    throw new ApiProblem('SUPABASE_URL must be a plain HTTPS project URL.', 500);
  }
  return { origin, key };
}

export async function supabase(path, { method = 'GET', accessToken, body, headers = {} } = {}) {
  const { origin, key } = config();
  const response = await fetch(new URL(path, origin), {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken || key}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiProblem('Supabase returned an invalid response.', 502);
  }
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? response.status : 502;
    const code = typeof data?.code === 'string' ? data.code : '';
    let message = status === 401 ? 'Please sign in again.' : status === 403 ? 'Owner access is required.' : 'Supabase request failed.';
    if (code === 'PGRST202' || code === '42883') {
      message = 'Supabase is missing a required store function. Apply migration 003_store_media_and_settings.sql in the Supabase SQL Editor, then retry.';
    } else if (code === '42501') {
      message = 'Supabase denied this store change. Confirm your account is designated as an owner and migration 003_store_media_and_settings.sql is applied.';
    } else if (code === '23514' || code === '22P02') {
      message = 'Supabase rejected one of the store settings or image paths. Remove the invalid image and upload it again.';
    }
    throw new ApiProblem(message, status);
  }
  return data;
}

export async function supabaseService(path, { method = 'GET', body, headers = {} } = {}) {
  const { origin } = config();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new ApiProblem('Checkout is not configured. Add the Supabase service-role key to Vercel server environment variables.', 503);
  const response = await fetch(new URL(path, origin), {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; }
  catch { throw new ApiProblem('Supabase returned an invalid checkout response.', 502); }
  if (!response.ok) {
    const code = typeof data?.code === 'string' ? data.code : '';
    const message = code === 'PGRST202' || code === '42883'
      ? 'Supabase is missing checkout migration 004_test_checkout.sql. Apply it in the Supabase SQL Editor.'
      : code === '42501'
        ? 'Supabase denied checkout. Confirm the service-role key is configured correctly in Vercel.'
        : typeof data?.message === 'string' && !/secret|token|key|authorization/i.test(data.message)
          ? data.message.slice(0, 240)
          : 'Supabase checkout request failed.';
    throw new ApiProblem(message, response.status >= 500 ? 502 : 400);
  }
  return data;
}

export function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { throw new ApiProblem('Invalid JSON request.'); }
  }
  return {};
}

function safeDecode(value) { try { return decodeURIComponent(value); } catch { return ''; } }

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(pair => {
    const index = pair.indexOf('=');
    return index < 0 ? ['', ''] : [pair.slice(0, index).trim(), safeDecode(pair.slice(index + 1).trim())];
  }).filter(([name]) => name));
}

function cookie(name, value, maxAge, httpOnly = true) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Strict${httpOnly ? '; HttpOnly' : ''}`;
}

export function setSessionCookies(res, session, csrf) {
  const maxAge = Math.max(60, Math.min(Number(session.expires_in) || 3600, 86400));
  res.setHeader('Set-Cookie', [
    cookie('oreva_access', session.access_token, maxAge),
    cookie('oreva_refresh', session.refresh_token, 60 * 60 * 24 * 30),
    cookie('oreva_csrf', csrf, maxAge, false),
  ]);
}

export function clearSessionCookies(res) {
  res.setHeader('Set-Cookie', [
    cookie('oreva_access', '', 0),
    cookie('oreva_refresh', '', 0),
    cookie('oreva_csrf', '', 0, false),
  ]);
}

function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b || a.length > 256 || b.length > 256) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function requireOwner(req, res, { mutation = false } = {}) {
  const expectedOrigin = process.env.SITE_ORIGIN || 'https://oreva-ashy.vercel.app';
  if (mutation && req.headers.origin !== expectedOrigin) throw new ApiProblem('Request origin not allowed.', 403);

  const cookies = parseCookies(req);
  if (mutation && !sameToken(req.headers['x-csrf-token'], cookies.oreva_csrf)) {
    throw new ApiProblem('Refresh the page and try again.', 403);
  }

  let accessToken = cookies.oreva_access;
  let currentCsrf = cookies.oreva_csrf || randomBytes(24).toString('hex');
  if (!accessToken && cookies.oreva_refresh) {
    const session = await supabase('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: cookies.oreva_refresh } });
    accessToken = session.access_token;
    setSessionCookies(res, session, currentCsrf);
  }
  if (!accessToken) throw new ApiProblem('Owner sign-in required.', 401);

  try {
    const user = await supabase('/auth/v1/user', { accessToken });
    const isOwner = await supabase('/rest/v1/rpc/bagz_is_owner', { method: 'POST', accessToken, body: {} });
    if (isOwner !== true) throw new ApiProblem('Owner access is required.', 403);
    return { accessToken, user, csrf: currentCsrf };
  } catch (error) {
    if (error.status === 401 && cookies.oreva_refresh) {
      const session = await supabase('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: cookies.oreva_refresh } });
      const user = await supabase('/auth/v1/user', { accessToken: session.access_token });
      const isOwner = await supabase('/rest/v1/rpc/bagz_is_owner', { method: 'POST', accessToken: session.access_token, body: {} });
      if (isOwner !== true) throw new ApiProblem('Owner access is required.', 403);
      const csrf = cookies.oreva_csrf || randomBytes(24).toString('hex');
      setSessionCookies(res, session, csrf);
      return { accessToken: session.access_token, user, csrf };
    }
    throw error;
  }
}

export function csrfToken() {
  return randomBytes(24).toString('hex');
}

export function mediaUrl(path) {
  if (!path || path.startsWith('/')) return path || '';
  const { origin } = config();
  return new URL(`/storage/v1/object/public/bagz-store-media/${encodeURIComponent(path)}`, origin).toString();
}

export function mediaPath(value) {
  if (!value) return '';
  if (['/oreva-logo.jpg', '/brand-logo.png'].includes(value)) return value;
  if (/^[a-f0-9-]+\.webp$/.test(value)) return value;
  const { origin } = config();
  const url = new URL(value);
  const prefix = '/storage/v1/object/public/bagz-store-media/';
  if (url.origin !== origin.origin || !url.pathname.startsWith(prefix)) {
    throw new ApiProblem('Use an image uploaded to this store.');
  }
  const path = decodeURIComponent(url.pathname.slice(prefix.length));
  if (!/^[a-f0-9-]+\.webp$/.test(path)) throw new ApiProblem('Invalid store image path.');
  return path;
}

export function functionHandler(handler) {
  return async function wrapped(req, res) {
    try {
      await handler(req, res);
    } catch (error) {
      sendJson(res, error instanceof ApiProblem ? error.status : 500, {
        error: error instanceof ApiProblem ? error.message : 'Request could not be completed.',
      });
    }
  };
}

export function currentBrand(settings) {
 const result = {...settings};
 if (['BAGZ & CO.','Bagz and co'].includes(result.brand)) result.brand='Orẽva';
 if (result.logo==='/brand-logo.png') result.logo='/oreva-logo.jpg';
 if (result.tagline==='Carry your story.') result.tagline='Timeless elegance.';
 return result;
}
