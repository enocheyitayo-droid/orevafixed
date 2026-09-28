import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiProblem, functionHandler, sendJson, supabaseService } from '../../supabase-server.mjs';
import { paystackSecret, verifyPaystack } from '../../paystack.mjs';

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new ApiProblem('Webhook request too large.', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function signatureValid(raw, signature) {
  const secret = paystackSecret();
  if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(raw).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export default functionHandler(async (req, res) => {
  if (req.method !== 'POST') throw new ApiProblem('Method not allowed.', 405);
  const raw = await rawBody(req);
  if (!signatureValid(raw, req.headers['x-paystack-signature'])) throw new ApiProblem('Invalid webhook signature.', 401);
  let event;
  try { event = JSON.parse(raw.toString('utf8')); }
  catch { throw new ApiProblem('Invalid webhook JSON.'); }
  if (event.event !== 'charge.success') return sendJson(res, 200, { received: true });
  const reference = event.data?.reference;
  const transaction = await verifyPaystack(reference);
  const orderId = transaction.metadata?.order_id;
  if (typeof orderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(orderId)) throw new ApiProblem('Payment metadata did not identify an order.', 409);
  await supabaseService('/rest/v1/rpc/bagz_confirm_payment', {
    method: 'POST', body: { order_id: orderId, transaction },
  });
  return sendJson(res, 200, { received: true });
});
