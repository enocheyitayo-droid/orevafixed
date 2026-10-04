import publicOrder from '../public-order.mjs';
import orderAction from '../order-actions.mjs';
export default function handler(req, res) {
  return req.query?.action ? orderAction(req, res) : publicOrder(req, res);
}
