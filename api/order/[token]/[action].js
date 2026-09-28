import { ApiProblem, functionHandler, parseBody, sendJson, supabaseService } from '../../../supabase-server.mjs';
import { initializePaystack, verifyPaystack } from '../../../paystack.mjs';

function params(req) {
  const parts = new URL(req.url, 'https://vercel.invalid').pathname.split('/').filter(Boolean);
  const token = req.query?.token || parts.at(-2);
  const action = req.query?.action || parts.at(-1);
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new ApiProblem('Invalid order link.', 404);
  return { token, action };
}

export default functionHandler(async (req, res) => {
  if (req.method !== 'POST') throw new ApiProblem('Method not allowed.', 405);
  const { token, action } = params(req);
  if (action === 'pay') {
    const result = await supabaseService('/rest/v1/rpc/bagz_public_order', { method: 'POST', body: { order_token: token } });
    if (!result?.id) throw new ApiProblem('Order not found.', 404);
    const identity = await supabaseService('/rest/v1/rpc/bagz_order_payment_identity', { method: 'POST', body: { order_token: token } });
    if (!identity?.reference || result.payment !== 'pending' || result.expires <= Date.now()) throw new ApiProblem('This checkout has expired or is no longer payable.', 409);
    if (identity.checkout_url) return sendJson(res, 200, { checkout: identity.checkout_url });
    const payment = await initializePaystack({ id: identity.id, token, reference: identity.reference, total: result.total, email: identity.email });
    await supabaseService('/rest/v1/rpc/bagz_attach_checkout_url', { method: 'POST', body: { order_id: identity.id, order_token: token, checkout_url: payment.url } });
    return sendJson(res, 200, { checkout: payment.url });
  }
  if (action === 'verify') {
    parseBody(req);
    const identity = await supabaseService('/rest/v1/rpc/bagz_order_payment_identity', { method: 'POST', body: { order_token: token } });
    if (!identity?.id || !identity.reference) throw new ApiProblem('Order not found.', 404);
    const transaction = await verifyPaystack(identity.reference);
    if (String(transaction.metadata?.order_id) !== String(identity.id)) throw new ApiProblem('Payment verification did not match this order.', 409);
    await supabaseService('/rest/v1/rpc/bagz_confirm_payment', { method: 'POST', body: { order_id: identity.id, transaction } });
    const order = await supabaseService('/rest/v1/rpc/bagz_public_order', { method: 'POST', body: { order_token: token } });
    return sendJson(res, 200, order);
  }
  throw new ApiProblem('Unknown order action.', 404);
});
