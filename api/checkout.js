import { createHash } from 'node:crypto';
import { ApiProblem, functionHandler, parseBody, sendJson, supabaseService } from '../supabase-server.mjs';
import { initializePaystack, paystackSecret } from '../paystack.mjs';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validate(data) {
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 120) throw new ApiProblem('Enter your full name.');
  if (typeof data.email !== 'string' || !emailPattern.test(data.email.trim()) || data.email.length > 254) throw new ApiProblem('Enter a valid email address.');
  if (typeof data.phone !== 'string' || !data.phone.trim() || data.phone.length > 30) throw new ApiProblem('Enter a contact phone number.');
  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 30) throw new ApiProblem('Your bag must contain between 1 and 30 options.');
  if (typeof data.idempotency !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.idempotency)) throw new ApiProblem('Refresh checkout and try again.');
  if (typeof data.method !== 'string' || data.method.length > 80) throw new ApiProblem('Choose pickup or a delivery area.');
  for (const item of data.items) {
    if (typeof item.variant !== 'string' || !/^[0-9a-f-]{36}$/i.test(item.variant) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) throw new ApiProblem('Your bag has an invalid product option or quantity.');
  }
  if (data.method !== 'pickup' && (typeof data.address !== 'string' || !data.address.trim() || data.address.length > 500)) throw new ApiProblem('Enter your delivery address.');
}

export default functionHandler(async (req, res) => {
  if (req.method !== 'POST') throw new ApiProblem('Method not allowed.', 405);
  if (req.headers.origin !== (process.env.SITE_ORIGIN || 'https://oreva-ashy.vercel.app')) throw new ApiProblem('Request origin not allowed.', 403);
  paystackSecret();
  const data = parseBody(req);
  validate(data);
  const requestHash = createHash('sha256').update(JSON.stringify({
    name: data.name.trim(), email: data.email.trim().toLowerCase(), phone: data.phone.trim(), method: data.method,
    address: data.address || '', items: data.items.map(item => ({ variant: item.variant, quantity: item.quantity })),
  })).digest('hex');
  const created = await supabaseService('/rest/v1/rpc/bagz_create_checkout', {
    method: 'POST', body: { checkout: { ...data, request_hash: requestHash } },
  });
  if (!created?.id || !created.token || !created.reference || !Number.isSafeInteger(created.total)) throw new ApiProblem('Supabase returned an incomplete order.', 502);
  let checkoutUrl = created.checkout;
  if (!checkoutUrl) {
    const payment = await initializePaystack({ ...created, email: data.email.trim().toLowerCase() });
    await supabaseService('/rest/v1/rpc/bagz_attach_checkout_url', {
      method: 'POST', body: { order_id: created.id, order_token: created.token, checkout_url: payment.url },
    });
    checkoutUrl = payment.url;
  }
  sendJson(res, 200, {
    statusUrl: `/order/${created.token}`,
    order: { id: created.id, number: created.number, payment: 'pending', total: created.total },
    checkoutUrl,
  });
});
