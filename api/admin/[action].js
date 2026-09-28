import { randomUUID } from 'node:crypto';
import {
  ApiProblem,
  clearSessionCookies,
  currentBrand,
  functionHandler,
  mediaPath,
  mediaUrl,
  parseBody,
  requireOwner,
  sendJson,
  supabase,
} from '../../supabase-server.mjs';

export const config = { api: { bodyParser: false } };

const defaults = {
  brand: 'Orẽva', logo: '/oreva-logo.jpg', tagline: 'Timeless elegance.', ownerEmail: '', whatsapp: '',
  pickupInstructions: 'Pickup instructions will be shared by the owner.', pickupTime: '1–2 working days after payment',
  deliveryAreas: [], lowStock: 3, emailEnabled: false, pushEnabled: false, bagDisplay: '', shoeDisplay: '',
};

function actionFrom(req) {
  if (typeof req.query?.action === 'string') return req.query.action;
  const path = new URL(req.url || '/', 'https://vercel.invalid').pathname.split('/').filter(Boolean);
  return path.at(-1) || '';
}

function text(value, name, max, optional = false) {
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max) throw new ApiProblem(`Invalid ${name}.`);
  return value.trim();
}

async function readImage(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw new ApiProblem('Image must be 4 MB or smaller.', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function me(req, res) {
  if (req.method !== 'GET') throw new ApiProblem('Method not allowed.', 405);
  const owner = await requireOwner(req, res);
  sendJson(res, 200, { csrf: owner.csrf, pushKey: '', mode: 'disabled' });
}

async function overview(req, res) {
  if (req.method !== 'GET') throw new ApiProblem('Method not allowed.', 405);
  const { accessToken } = await requireOwner(req, res);
  const [products, variants, settingsRows] = await Promise.all([
    supabase('/rest/v1/bagz_products?select=id,name,description,category,visible,material,care,photos,created_at&archived=eq.false&order=created_at.desc', { accessToken }),
    supabase('/rest/v1/bagz_variants?select=id,product_id,colour,size,price,cost,stock,reserved', { accessToken }),
    supabase('/rest/v1/bagz_settings?select=value&id=eq.true', { accessToken }),
  ]);
  if (!Array.isArray(products) || !Array.isArray(variants)) throw new ApiProblem('Supabase returned invalid product data.', 502);
  const byProduct = new Map();
  for (const variant of variants) {
    const list = byProduct.get(variant.product_id) || [];
    list.push({ ...variant, available: variant.stock - variant.reserved });
    byProduct.set(variant.product_id, list);
  }
  const mapped = products.map(product => ({
    ...product,
    photo: mediaUrl(product.photos?.[0] || ''),
    photos: (product.photos || []).map(mediaUrl),
    sample: false,
    variants: (byProduct.get(product.id) || []).map(variant => ({
      ...variant,
      size: product.category === 'Bags' ? '' : variant.size,
    })),
  }));
  const rawSettings = currentBrand({ ...defaults, ...(settingsRows?.[0]?.value || {}) });
  const settings = {
    ...rawSettings,
    logo: mediaUrl(rawSettings.logo),
    bagDisplay: mediaUrl(rawSettings.bagDisplay),
    shoeDisplay: mediaUrl(rawSettings.shoeDisplay),
    displayGallery: (rawSettings.displayGallery || []).map(mediaUrl),
  };
  sendJson(res, 200, {
    products: mapped,
    capabilities: { payments: false, orders: false, reports: false },
    settings,
    orders: [], notifications: [], expenses: [], refunds: [],
    report: { gross: 0, refunds: 0, revenue: 0, cost: 0, expenses: 0, estimatedProfit: 0, outstanding: 0 },
  });
}

async function product(req, res) {
  if (req.method !== 'POST') throw new ApiProblem('Method not allowed.', 405);
  const { accessToken } = await requireOwner(req, res, { mutation: true });
  const data = parseBody(req);
  if (!Array.isArray(data.variants) || data.variants.length < 1 || data.variants.length > 60) throw new ApiProblem('Add between 1 and 60 product options.');
  const item = {
    ...(typeof data.id === 'string' && data.id ? { id: data.id } : {}),
    name: data.name,
    description: data.description,
    category: data.category,
    visible: data.visible === true,
    material: data.material || '',
    care: data.care || '',
    photos: [...new Set([data.photo, ...(Array.isArray(data.photos) ? data.photos : [])].filter(Boolean).map(mediaPath))].slice(0, 8),
    variants: data.variants.map(variant => ({
      ...(typeof variant.id === 'string' && variant.id ? { id: variant.id } : {}),
      colour: variant.colour,
      size: data.category === 'Bags' ? 'One size' : variant.size,
      price: variant.price,
      cost: variant.cost,
      stock: variant.stock,
    })),
  };
  const id = await supabase('/rest/v1/rpc/bagz_save_product', { method: 'POST', accessToken, body: { item } });
  sendJson(res, 200, { id });
}

async function deleteProduct(req, res) {
  if (req.method !== 'POST') throw new ApiProblem('Method not allowed.', 405);
  const { accessToken } = await requireOwner(req, res, { mutation: true });
  const { id } = parseBody(req);
  if (typeof id !== 'string' || !id) throw new ApiProblem('Choose a product to archive.');
  await supabase('/rest/v1/rpc/bagz_delete_product', { method: 'POST', accessToken, body: { product: id } });
  sendJson(res, 200, { ok: true });
}

async function settings(req, res) {
  if (req.method !== 'POST') throw new ApiProblem('Method not allowed.', 405);
  const { accessToken } = await requireOwner(req, res, { mutation: true });
  const input = parseBody(req);
  const email = input.ownerEmail ? text(input.ownerEmail, 'owner email', 254, true).toLowerCase() : '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiProblem('Enter a valid owner email.');
  const whatsapp = text(input.whatsapp || '', 'WhatsApp number', 20, true);
  if (whatsapp && !/^234[789]\d{9}$/.test(whatsapp)) throw new ApiProblem('Use 234 followed by 10 digits for WhatsApp.');
  if (!Array.isArray(input.deliveryAreas) || input.deliveryAreas.length > 30) throw new ApiProblem('Invalid delivery areas.');
  const ids = new Set();
  const deliveryAreas = input.deliveryAreas.map(area => {
    const id = text(area.id, 'delivery area ID', 80);
    if (id === 'pickup' || ids.has(id)) throw new ApiProblem('Delivery area IDs must be unique.');
    ids.add(id);
    if (!Number.isSafeInteger(area.fee) || area.fee < 0 || area.fee > 10000000) throw new ApiProblem('Invalid delivery fee.');
    return { id, name: text(area.name, 'delivery area name', 120), fee: area.fee, timeframe: text(area.timeframe, 'delivery timeframe', 160) };
  });
  if (!Number.isInteger(input.lowStock) || input.lowStock < 0 || input.lowStock > 100) throw new ApiProblem('Invalid low-stock threshold.');
  const value = {
    brand: text(input.brand, 'store name', 80),
    logo: mediaPath(input.logo),
    tagline: text(input.tagline, 'tagline', 180),
    ownerEmail: email,
    whatsapp,
    pickupInstructions: text(input.pickupInstructions, 'pickup instructions', 1000),
    pickupTime: text(input.pickupTime, 'pickup timeframe', 160),
    lowStock: input.lowStock,
    emailEnabled: input.emailEnabled === true,
    deliveryAreas,
    bagDisplay: mediaPath(input.bagDisplay),
    shoeDisplay: mediaPath(input.shoeDisplay),
    displayGallery: Array.isArray(input.displayGallery) ? [...new Set(input.displayGallery.map(mediaPath).filter(Boolean))].slice(0, 8) : [],
  };
  const saved = await supabase('/rest/v1/rpc/bagz_save_settings', { method: 'POST', accessToken, body: { settings: value } });
  sendJson(res, 200, saved);
}

async function upload(req, res) {
  if (req.method !== 'POST') throw new ApiProblem('Method not allowed.', 405);
  const { accessToken } = await requireOwner(req, res, { mutation: true });
  const input = await readImage(req);
  let output;
  try {
    const { default: sharp } = await import('sharp');
    const image = sharp(input, { limitInputPixels: 24000000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || metadata.pages > 1) throw new Error('Unsupported image.');
    output = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new ApiProblem('Upload a valid JPEG, PNG or WebP image up to 4 MB and 24 megapixels.');
  }
  const endpoint = new URL(process.env.SUPABASE_URL);
  const key = process.env.SUPABASE_ANON_KEY;
  const name = `${randomUUID()}.webp`;
  const response = await fetch(new URL(`/storage/v1/object/bagz-store-media/${name}`, endpoint), {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'image/webp',
      'x-upsert': 'false',
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body: output,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new ApiProblem('Could not save the image. Apply the store media migration in Supabase and try again.', 502);
  const publicUrl = new URL(`/storage/v1/object/public/bagz-store-media/${name}`, endpoint).toString();
  sendJson(res, 200, { path: name, url: publicUrl });
}

async function logout(req, res) {
  if (req.method !== 'POST') throw new ApiProblem('Method not allowed.', 405);
  const { accessToken } = await requireOwner(req, res, { mutation: true });
  try {
    await supabase('/auth/v1/logout', { method: 'POST', accessToken, body: {} });
  } finally {
    clearSessionCookies(res);
  }
  sendJson(res, 200, { ok: true });
}

const handlers = {
  me,
  overview,
  product,
  'delete-product': deleteProduct,
  settings,
  upload,
  logout,
};

export default functionHandler(async (req, res) => {
  const action = actionFrom(req);
  const handler = handlers[action];
  if (!handler) throw new ApiProblem('Admin action not found.', 404);
  await handler(req, res);
});
