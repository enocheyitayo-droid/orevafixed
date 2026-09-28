import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiProblem } from './supabase-server.mjs';

export function paystackMode() {
  const secret = process.env.PAYSTACK_SECRET_KEY || '';
  if (secret.startsWith('sk_live_')) return 'live';
  if (secret.startsWith('sk_test_')) return 'test';
  return 'disabled';
}

export function paystackSecret() {
  const secret = process.env.PAYSTACK_SECRET_KEY || '';
  if (!/^sk_(test|live)_/.test(secret)) {
    throw new ApiProblem('Checkout is not open. Add a valid Paystack secret key in Vercel to enable checkout.', 503);
  }
  return secret;
}

export async function paystack(path, body) {
  const secret = paystackSecret();
  const response = await fetch(`https://api.paystack.co${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  let result;
  try { result = await response.json(); }
  catch { throw new ApiProblem('Paystack returned an invalid response.', 502); }
  if (!response.ok || result.status !== true) {
    throw new ApiProblem('Paystack test checkout could not be completed. Please retry or contact the store.', 502);
  }
  return result.data;
}

export async function initializePaystack(order) {
  const origin = process.env.SITE_ORIGIN || 'https://oreva-ashy.vercel.app';
  const data = await paystack('/transaction/initialize', {
    email: order.email,
    amount: order.total,
    currency: 'NGN',
    reference: order.reference,
    callback_url: `${origin}/order/${order.token}`,
    metadata: { order_id: order.id, order_token: order.token },
  });
  if (data.reference !== order.reference) {
    throw new ApiProblem('Paystack returned an unexpected test checkout.', 502);
  }
  let checkout;
  try { checkout = new URL(data.authorization_url); }
  catch { throw new ApiProblem('Paystack returned an invalid checkout link.', 502); }
  if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.paystack.com') {
    throw new ApiProblem('Paystack returned an unexpected checkout link.', 502);
  }
  return { url: checkout.toString(), accessCode: data.access_code };
}

export async function verifyPaystack(reference) {
  if (typeof reference !== 'string' || !/^ore_[a-f0-9]{40}$/.test(reference)) {
    throw new ApiProblem('Invalid payment reference.', 400);
  }
  const data = await paystack('/transaction/verify/' + encodeURIComponent(reference));
  const expectedDomain = paystackMode();
  if (data.reference !== reference || data.domain !== expectedDomain) {
    throw new ApiProblem('Paystack verification did not match this store payment mode.', 409);
  }
  return data;
}

export function validPaystackSignature(raw, signature) {
  const secret = paystackSecret();
  if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(raw).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
