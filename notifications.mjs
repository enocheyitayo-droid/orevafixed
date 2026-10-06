import { queueEmail } from './email-queue.mjs';
import { supabaseService } from './supabase-server.mjs';

const money = cents => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Number(cents || 0) / 100);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function orderForEmail(orderId) {
  const id = encodeURIComponent(orderId);
  const orders = await supabaseService(`/rest/v1/bagz_orders?id=eq.${id}&select=id,number,token,name,email,phone,address,method,delivery,timeframe,instructions,total,payment_status,fulfilment,receipt&limit=1`);
  const order = Array.isArray(orders) ? orders[0] : null;
  if (!order?.id || !order.email) return null;
  const items = await supabaseService(`/rest/v1/bagz_order_items?order_id=eq.${id}&select=name,colour,size,quantity,price&order=id.asc`);
  return { ...order, items: Array.isArray(items) ? items : [] };
}

function fulfilmentCopy(order) {
  const delivery = order.method === 'delivery' || /^Delivery to /i.test(order.instructions || '');
  return delivery
    ? {
        title: 'Standard delivery anywhere in Nigeria',
        eta: order.timeframe || 'Contact the shop for your delivery estimate',
        detail: order.address ? `Delivery address: ${order.address}` : order.instructions,
      }
    : {
        title: 'Ajayi Crowther University pickup',
        eta: order.timeframe || '1–2 working days after payment',
        detail: order.instructions || 'Pickup instructions will be shared by the owner.',
      };
}

const sendResend = queueEmail;

export async function sendPaidOrderEmail(orderId, baseUrl) {
  try {
    const order = await orderForEmail(orderId);
    if (!order || order.payment_status !== 'paid') return { sent: false, reason: 'Order is not paid.' };
    const fulfil = fulfilmentCopy(order);
    const url = `${baseUrl.replace(/\/$/, '')}/order/${order.token}`;
    const itemRows = order.items.map(item => `<tr><td style="padding:10px 0;border-bottom:1px solid #ece7df">${esc(item.quantity)} × ${esc(item.name)}${item.colour ? `<br><span style="color:#777">${esc(item.colour)}${item.size ? ` · ${esc(item.size)}` : ''}</span>` : ''}</td><td style="padding:10px 0;border-bottom:1px solid #ece7df;text-align:right">${esc(money(item.price * item.quantity))}</td></tr>`).join('');
    const html = `<!doctype html><html><body style="margin:0;background:#f7f3eb;color:#171815;font-family:Arial,Helvetica,sans-serif"><div style="max-width:620px;margin:0 auto;padding:36px 22px"><div style="font-family:Georgia,serif;font-size:32px;margin-bottom:28px">Orẽva</div><p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#6c6a63;margin:0 0 12px">Payment receipt</p><h1 style="font-family:Georgia,serif;font-weight:400;font-size:38px;line-height:1.05;margin:0 0 18px">Payment receipt</h1><p style="font-size:16px;line-height:1.6">Hi ${esc(order.name)}, your payment for <strong>${esc(order.number)}</strong> has been verified.</p><div style="background:#fff;padding:22px;margin:26px 0;border:1px solid #e3ddd3"><h2 style="font-size:17px;margin:0 0 8px">${esc(fulfil.title)}</h2><p style="margin:0 0 6px"><strong>Expected:</strong> ${esc(fulfil.eta)}</p><p style="margin:0;color:#56534d;line-height:1.55">${esc(fulfil.detail)}</p></div><table style="width:100%;border-collapse:collapse">${itemRows}<tr><td style="padding:12px 0">${order.delivery ? 'Delivery' : 'Pickup'}</td><td style="padding:12px 0;text-align:right">${esc(money(order.delivery))}</td></tr><tr><td style="padding:14px 0;border-top:1px solid #171815;font-weight:700">Total</td><td style="padding:14px 0;border-top:1px solid #171815;text-align:right;font-weight:700">${esc(money(order.total))}</td></tr></table><p style="margin:28px 0 18px"><a href="${esc(url)}" style="display:inline-block;background:#171815;color:#fff;text-decoration:none;padding:14px 20px">View your order →</a></p><p style="font-size:13px;color:#6c6a63;line-height:1.55">Keep your private order link safe. We’ll use the contact details you provided if we need to reach you about fulfilment.</p></div></body></html>`;
    const text = `Orẽva\n\nPayment receipt\n\nHi ${order.name}, your payment for ${order.number} has been verified.\n\n${fulfil.title}\nExpected: ${fulfil.eta}\n${fulfil.detail}\n\nTotal: ${money(order.total)}\n\nView your order: ${url}`;
    const customerMessage = {
      to: order.email,
      subject: `Orẽva order confirmed · ${order.number}`,
      html,
      text,
      idempotencyKey: `oreva-order-paid-${order.id}`,
    };
    const messages = [customerMessage];
    const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL?.trim();
    if (ownerEmail) messages.push({
      to: ownerEmail,
      subject: `New paid order ? ${order.number}`,
      html: `<h1>New paid Or?va order</h1><p><strong>${esc(order.number)}</strong> ? payment verified.</p><p>Customer: ${esc(order.name)}<br>Email: ${esc(order.email)}<br>Phone: ${esc(order.phone)}</p><table style="width:100%">${itemRows}</table><p>Delivery / pickup: ${esc(money(order.delivery))}<br><strong>Total paid: ${esc(money(order.total))}</strong></p><p>${esc(fulfil.title)}<br>${esc(fulfil.detail)}<br>${esc(fulfil.eta)}</p><p><a href="${esc(baseUrl.replace(/\/$/, '') + '/admin')}">Open order administration</a></p>`,
      text: `New paid order: ${order.number}\nCustomer: ${order.name}\nEmail: ${order.email}\nPhone: ${order.phone}\n${order.items.map(item => `${item.quantity} x ${item.name} (${[item.colour,item.size].filter(Boolean).join(', ')}) ? ${money(item.price * item.quantity)}`).join('\n')}\nTotal paid: ${money(order.total)}\n${fulfil.title}\n${fulfil.detail}\n${fulfil.eta}`,
      idempotencyKey: `oreva-owner-paid-${order.id}`,
    });
    // A customer delivery failure must not prevent the owner notification.
    const results = await Promise.allSettled(messages.map(message => sendResend(message)));
    const result = entry => entry.status === 'fulfilled' ? entry.value : { sent: false, reason: 'Email could not be queued.' };
    return { ...result(results[0]), owner: results[1] ? result(results[1]) : { sent: false, reason: 'Owner notification address is not configured.' } };
  } catch (error) {
    console.error('Order confirmation email error', error);
    return { sent: false, reason: 'Email could not be sent.' };
  }
}
