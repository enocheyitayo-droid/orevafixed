import { queueEmail } from './email-queue.mjs';
import { supabaseService } from './supabase-server.mjs';

const money = cents => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(Number(cents || 0) / 100);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanBase = value => String(value || '').replace(/\/$/, '');

function publicProductImage(path) {
  if (!path || !process.env.SUPABASE_URL) return '';
  return `${cleanBase(process.env.SUPABASE_URL)}/storage/v1/object/public/bagz-store-media/${encodeURIComponent(path)}`;
}

async function decorateItemImages(items) {
  const variantIds = [...new Set(items.map(item => item.variant_id).filter(Boolean))];
  if (!variantIds.length) return items;
  const variantFilter = encodeURIComponent(variantIds.join(','));
  const variants = await supabaseService(`/rest/v1/bagz_variants?id=in.(${variantFilter})&select=id,product_id`);
  const variantToProduct = new Map((Array.isArray(variants) ? variants : []).map(v => [v.id, v.product_id]));
  const productIds = [...new Set([...variantToProduct.values()].filter(Boolean))];
  if (!productIds.length) return items;
  const productFilter = encodeURIComponent(productIds.join(','));
  const products = await supabaseService(`/rest/v1/bagz_products?id=in.(${productFilter})&select=id,photos`);
  const productToPhoto = new Map((Array.isArray(products) ? products : []).map(p => [p.id, Array.isArray(p.photos) ? p.photos[0] : '']));
  return items.map(item => ({ ...item, image: publicProductImage(productToPhoto.get(variantToProduct.get(item.variant_id))) }));
}

async function orderForEmail(orderId) {
  const id = encodeURIComponent(orderId);
  const orders = await supabaseService(`/rest/v1/bagz_orders?id=eq.${id}&select=id,number,token,reference,transaction_id,name,email,phone,address,method,delivery,timeframe,instructions,total,payment_status,fulfilment,receipt&limit=1`);
  const order = Array.isArray(orders) ? orders[0] : null;
  if (!order?.id || !order.email) return null;
  const rows = await supabaseService(`/rest/v1/bagz_order_items?order_id=eq.${id}&select=variant_id,name,colour,size,quantity,price&order=id.asc`);
  const items = await decorateItemImages(Array.isArray(rows) ? rows : []);
  return { ...order, items };
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

function itemImage(item, width = 220) {
  if (!item.image) return '';
  return `<div style="margin:0 0 14px;text-align:center"><img src="${esc(item.image)}" alt="${esc(item.name)}" width="${width}" style="display:inline-block;width:${width}px;max-width:100%;height:auto;border:0;border-radius:8px;background:#f7f3eb"></div>`;
}

function customerItemCards(items) {
  return items.map(item => `<div style="background:#fff;border:1px solid #e8e1d7;padding:18px;margin:0 0 14px">${itemImage(item, 280)}<div style="font-size:18px;font-weight:700;color:#171815;margin-bottom:6px">${esc(item.name)}</div><div style="font-size:14px;color:#777;line-height:1.55">${esc(item.colour || '')}${item.size ? ` · ${esc(item.size)}` : ''}${item.quantity ? ` · Qty ${esc(item.quantity)}` : ''}</div><div style="font-size:17px;color:#171815;margin-top:10px">${esc(money(item.price * item.quantity))}</div></div>`).join('');
}

function ownerItemCards(items) {
  return items.map(item => `<div style="border-top:1px solid #e7e1d8;padding:16px 0">${itemImage(item, 180)}<strong>${esc(item.quantity)} × ${esc(item.name)}</strong>${item.colour || item.size ? `<br><span style="color:#6c6a63">${esc(item.colour || '')}${item.size ? ` · ${esc(item.size)}` : ''}</span>` : ''}<br><span>${esc(money(item.price * item.quantity))}</span></div>`).join('');
}

async function configuredOwnerEmail() {
  const env = process.env.OWNER_NOTIFICATION_EMAIL?.trim();
  if (env) return env;
  try {
    const rows = await supabaseService('/rest/v1/bagz_settings?id=eq.true&select=value&limit=1');
    const email = Array.isArray(rows) ? rows[0]?.value?.ownerEmail : '';
    return typeof email === 'string' ? email.trim() : '';
  } catch {
    return '';
  }
}

const sendResend = queueEmail;

export async function sendPaidOrderEmail(orderId, baseUrl) {
  try {
    const order = await orderForEmail(orderId);
    if (!order || order.payment_status !== 'paid') return { sent: false, reason: 'Order is not paid.' };
    const base = cleanBase(baseUrl);
    const fulfil = fulfilmentCopy(order);
    const url = `${base}/order/${order.token}`;
    const logoUrl = `${base}/images/oreva-email-logo.jpg`;
    const itemCards = customerItemCards(order.items);
    const html = `<!doctype html><html><body style="margin:0;background:#f6f3ee;color:#171815;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">Your Orẽva order ${esc(order.number)} is confirmed.</div><div style="max-width:640px;margin:0 auto;padding:28px 14px"><div style="background:#000;text-align:center;padding:28px 20px"><img src="${esc(logoUrl)}" alt="Orẽva" width="250" style="display:block;width:250px;max-width:80%;height:auto;margin:0 auto;border:0"></div><div style="background:#fff;padding:32px 26px;border:1px solid #e8e1d7;border-top:0"><p style="font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:#777;margin:0 0 12px">Order confirmed</p><h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:38px;line-height:1.06;margin:0 0 16px;color:#171815">Your order has been placed.</h1><p style="font-size:16px;line-height:1.65;color:#4d4a45;margin:0 0 26px">Hi ${esc(order.name)}, your payment has been verified and your order is now with Orẽva.</p>${itemCards}<div style="background:#f7f3eb;padding:20px;margin:24px 0"><div style="font-size:16px;font-weight:700;margin-bottom:8px">${esc(fulfil.title)}</div><div style="font-size:14px;line-height:1.55"><strong>Expected:</strong> ${esc(fulfil.eta)}<br>${esc(fulfil.detail)}</div></div><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px"><tr><td style="padding:8px 0;color:#777">Order</td><td style="padding:8px 0;text-align:right">${esc(order.number)}</td></tr>${order.receipt ? `<tr><td style="padding:8px 0;color:#777">Receipt</td><td style="padding:8px 0;text-align:right">${esc(order.receipt)}</td></tr>` : ''}<tr><td style="padding:8px 0;color:#777">${order.delivery ? 'Delivery' : 'Pickup'}</td><td style="padding:8px 0;text-align:right">${esc(money(order.delivery))}</td></tr><tr><td style="padding:14px 0;border-top:1px solid #171815;font-size:17px;font-weight:700">Total paid</td><td style="padding:14px 0;border-top:1px solid #171815;text-align:right;font-size:17px;font-weight:700">${esc(money(order.total))}</td></tr></table><div style="text-align:center;margin:28px 0 12px"><a href="${esc(url)}" style="display:inline-block;background:#171815;color:#fff;text-decoration:none;padding:15px 24px;font-weight:700">View your order</a></div><p style="font-size:12px;color:#777;line-height:1.55;text-align:center;margin:24px 0 0">Timeless elegance · Orẽva</p></div></div></body></html>`;
    const text = `Orẽva\n\nYour order has been placed.\n\nHi ${order.name}, your payment for ${order.number} has been verified.\n\n${order.items.map(item => `${item.quantity} x ${item.name}${item.colour ? ` - ${item.colour}` : ''}${item.size ? ` / ${item.size}` : ''} - ${money(item.price * item.quantity)}`).join('\n')}\n\n${fulfil.title}\nExpected: ${fulfil.eta}\n${fulfil.detail}\n\nTotal paid: ${money(order.total)}\n\nView your order: ${url}`;
    const customerMessage = {
      to: order.email,
      subject: `Your Orẽva order is confirmed · ${order.number}`,
      html,
      text,
      idempotencyKey: `oreva-order-paid-${order.id}`,
    };
    const messages = [customerMessage];
    const ownerEmail = await configuredOwnerEmail();
    if (ownerEmail) messages.push({
      to: ownerEmail,
      subject: `New Orẽva order · ${order.number} · ${money(order.total)}`,
      html: `<!doctype html><html><body style="margin:0;background:#f6f3ee;color:#171815;font-family:Arial,Helvetica,sans-serif"><div style="max-width:620px;margin:0 auto;padding:28px 14px"><div style="background:#000;text-align:center;padding:22px"><img src="${esc(logoUrl)}" alt="Orẽva" width="210" style="display:block;width:210px;max-width:75%;height:auto;margin:0 auto;border:0"></div><div style="background:#fff;padding:28px;border:1px solid #e8e1d7;border-top:0"><p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#777;margin:0 0 10px">New paid order</p><h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;margin:0 0 20px">${esc(order.number)}</h1><p style="line-height:1.65"><strong>Customer:</strong> ${esc(order.name)}<br><strong>Email:</strong> ${esc(order.email)}<br><strong>Phone:</strong> ${esc(order.phone)}${order.address ? `<br><strong>Address:</strong> ${esc(order.address)}` : ''}</p>${ownerItemCards(order.items)}<div style="background:#f7f3eb;padding:18px;margin:20px 0;line-height:1.6"><strong>${esc(fulfil.title)}</strong><br>${esc(fulfil.detail)}<br>Expected: ${esc(fulfil.eta)}</div><p style="font-size:18px"><strong>Total paid: ${esc(money(order.total))}</strong></p><p style="font-size:13px;color:#666">Paystack reference: ${esc(order.reference || '')}${order.transaction_id ? `<br>Transaction ID: ${esc(order.transaction_id)}` : ''}</p><p style="margin-top:24px"><a href="${esc(base + '/admin')}" style="display:inline-block;background:#171815;color:#fff;text-decoration:none;padding:14px 20px">Open order administration</a></p></div></div></body></html>`,
      text: `New paid Orẽva order\nOrder: ${order.number}\nCustomer: ${order.name}\nEmail: ${order.email}\nPhone: ${order.phone}${order.address ? `\nAddress: ${order.address}` : ''}\n\n${order.items.map(item => `${item.quantity} x ${item.name} (${[item.colour,item.size].filter(Boolean).join(', ')}) - ${money(item.price * item.quantity)}`).join('\n')}\n\nTotal paid: ${money(order.total)}\n${fulfil.title}\n${fulfil.detail}\n${fulfil.eta}\nPaystack reference: ${order.reference || ''}`,
      idempotencyKey: `oreva-owner-paid-${order.id}`,
    });
    const results = await Promise.allSettled(messages.map(message => sendResend(message)));
    const result = entry => entry.status === 'fulfilled' ? entry.value : { sent: false, reason: 'Email could not be queued.' };
    return { ...result(results[0]), owner: results[1] ? result(results[1]) : { sent: false, reason: 'Owner notification address is not configured.' } };
  } catch (error) {
    console.error('Order confirmation email error', error);
    return { sent: false, reason: 'Email could not be sent.' };
  }
}
