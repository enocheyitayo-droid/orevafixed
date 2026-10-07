import { randomUUID } from 'node:crypto';
import { ApiProblem, functionHandler, requireOwner, sendJson } from '../supabase-server.mjs';

export const config = { api: { bodyParser: false } };

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

export default functionHandler(async (req, res) => {
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
    headers: { apikey: key, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'image/webp', 'x-upsert': 'false', 'cache-control': 'public, max-age=31536000, immutable' },
    body: output,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new ApiProblem('Could not save the image. Apply the store media migration in Supabase and try again.', 502);
  const publicUrl = new URL(`/storage/v1/object/public/bagz-store-media/${name}`, endpoint).toString();
  sendJson(res, 200, { path: name, url: publicUrl });
});
