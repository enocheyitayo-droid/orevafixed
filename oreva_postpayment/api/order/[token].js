import { ApiProblem, functionHandler, sendJson, supabaseService } from '../../supabase-server.mjs';

export default functionHandler(async (req, res) => {
  const token = req.query?.token || new URL(req.url, 'https://vercel.invalid').pathname.split('/').filter(Boolean).at(-1);
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new ApiProblem('Invalid order link.', 404);
  if (req.method === 'GET') {
    const order = await supabaseService('/rest/v1/rpc/bagz_public_order', { method: 'POST', body: { order_token: token } });
    if (!order || !order.id) throw new ApiProblem('Order not found.', 404);
    return sendJson(res, 200, order);
  }
  throw new ApiProblem('Method not allowed.', 405);
});
