import { randomUUID } from 'node:crypto';
import { Problem, integer, string, now } from './store.mjs';

// Additive schema: existing products, customer links and orders remain valid.
export function commerce(store) {
  const {db,get,all,run,tx}=store;
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_details(product_id TEXT PRIMARY KEY REFERENCES products(id),material TEXT NOT NULL DEFAULT '',care TEXT NOT NULL DEFAULT '',photos TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS stock_movements(id TEXT PRIMARY KEY,variant_id TEXT NOT NULL REFERENCES variants(id),delta INTEGER NOT NULL,reason TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS order_notes(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),body TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS store_content(id INTEGER PRIMARY KEY CHECK(id=1),about TEXT NOT NULL DEFAULT '',shipping TEXT NOT NULL DEFAULT '',returns TEXT NOT NULL DEFAULT '',privacy TEXT NOT NULL DEFAULT '',support_email TEXT NOT NULL DEFAULT '');
    INSERT OR IGNORE INTO store_content(id) VALUES(1);
    CREATE INDEX IF NOT EXISTS stock_movement_time ON stock_movements(created);
    CREATE INDEX IF NOT EXISTS order_note_order ON order_notes(order_id);
  `);
  const content=()=>get('SELECT about,shipping,returns,privacy,support_email FROM store_content WHERE id=1');
  const enrichProducts=products=>products.map(p=>{const d=get('SELECT * FROM product_details WHERE product_id=?',p.id);return {...p,material:d?.material||'',care:d?.care||'',photos:[...new Set([p.photo,...JSON.parse(d?.photos||'[]')].filter(Boolean))]};});
  function saveDetails(id,data) {
    if(!get('SELECT id FROM products WHERE id=?',id))throw new Problem('Product not found',404);
    const photos=data.photos??[];
    if(!Array.isArray(photos)||photos.length>8||photos.some(p=>typeof p!=='string'||!/^\/uploads\/[a-f0-9-]+\.webp$/.test(p)))throw new Problem('Use up to eight securely uploaded gallery images');
    run('INSERT INTO product_details VALUES(?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET material=excluded.material,care=excluded.care,photos=excluded.photos',id,string(data.material??'','material',300,true),string(data.care??'','care instructions',2000,true),JSON.stringify([...new Set(photos)]));
  }
  function adjustStock(data) {return tx(()=>{
    const v=get('SELECT * FROM variants WHERE id=?',string(data.variant,'variant',80));if(!v)throw new Problem('Variant not found',404);
    const delta=integer(data.delta,'stock adjustment',-100000,100000);if(!delta)throw new Problem('Enter a nonzero stock adjustment');
    if(v.stock+delta<0||v.stock+delta>100000||store.available(v.id)+delta<0)throw new Problem('Adjustment would remove stock reserved for checkout',409);
    const reason=string(data.reason,'reason',400);run('UPDATE variants SET stock=stock+? WHERE id=?',delta,v.id);
    run('INSERT INTO stock_movements VALUES(?,?,?,?,?)',randomUUID(),v.id,delta,reason,now());store.audit(`Stock adjustment: ${v.id}, ${delta>0?'+':''}${delta}; ${reason}`);return {stock:v.stock+delta,available:store.available(v.id)};
  });}
  function note(data) {const id=string(data.id,'order',80);if(!get('SELECT id FROM orders WHERE id=?',id))throw new Problem('Order not found',404);run('INSERT INTO order_notes VALUES(?,?,?,?)',randomUUID(),id,string(data.body,'note',2000),now());store.audit('Owner added a private note',id);}
  function timeline(id) {return all('SELECT event,created FROM audit WHERE order_id=? ORDER BY created,id',id).filter(e=>e.event.startsWith('Order created')||e.event.startsWith('Payment verified')||e.event.startsWith('Fulfilment:')||e.event.startsWith('Cancelled;')||e.event.startsWith('Provider-confirmed refund')||e.event==='Held payment resolved; stock allocated').map(e=>({created:e.created,label:e.event.startsWith('Order created')?'Order placed':e.event.startsWith('Payment verified')?'Payment verified':e.event.startsWith('Cancelled;')?'Order cancelled':e.event.startsWith('Provider-confirmed refund')?'Refund confirmed':e.event.startsWith('Fulfilment:')?e.event.slice(12):'Stock confirmed for your order'}));}
  function orderDetails(id) {const o=get('SELECT * FROM orders WHERE id=?',id);if(!o)throw new Problem('Order not found',404);return {...o,items:all('SELECT * FROM items WHERE order_id=?',id),notes:all('SELECT * FROM order_notes WHERE order_id=? ORDER BY created DESC',id),timeline:timeline(id),refunds:all('SELECT * FROM refunds WHERE order_id=?',id)};}
  function resolveHold(id,confirmed,baseUrl) {return tx(()=>{
    const o=get('SELECT * FROM orders WHERE id=?',id);if(!o||o.payment!=='paid'||o.allocated||o.cancelled||o.refunded)throw new Problem('Only an unallocated, unrefunded paid order can be resolved');
    if(confirmed!==true)throw new Problem('Confirm the items are physically available and the customer still wants this order');
    const lines=all('SELECT * FROM items WHERE order_id=?',id);for(const i of lines)if(i.variant_id&&store.available(i.variant_id,id)<i.quantity)throw new Problem('Stock is still unavailable',409);
    for(const i of lines)if(i.variant_id)run('UPDATE variants SET stock=stock-? WHERE id=?',i.quantity,i.variant_id);
    run("UPDATE orders SET allocated=1,fulfilment='Paid',exception='' WHERE id=?",id);store.audit('Held payment resolved; stock allocated',id);
    const updated=get('SELECT * FROM orders WHERE id=?',id);store.notify(updated,'Stock confirmed',baseUrl);return updated;
  });}
  function customers() {return all(`SELECT email,MAX(name) AS name,MAX(phone) AS phone,COUNT(*) AS orders,SUM(CASE WHEN payment='paid' THEN total-refunded ELSE 0 END) AS spent,MAX(created) AS last_order FROM orders GROUP BY email ORDER BY last_order DESC`);}
  function period(from,to) {let start=0,end=now()+1;const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;if(from){if(!valid(from))throw new Problem('Invalid start date');start=Date.parse(from+'T00:00:00+01:00');}if(to){if(!valid(to))throw new Problem('Invalid end date');end=Date.parse(to+'T00:00:00+01:00')+86400000;}if(end<=start)throw new Problem('End date must not precede start date');return {start,end};}
  function analytics(from='',to='') {
    const {start,end}=period(from,to),orders=all("SELECT * FROM orders WHERE payment='paid' AND paid_at>=? AND paid_at<? ORDER BY paid_at DESC",start,end);
    const gross=orders.reduce((s,o)=>s+o.total,0),refunds=orders.reduce((s,o)=>s+o.refunded,0),cost=orders.filter(o=>o.allocated&&!o.restocked).reduce((s,o)=>s+get('SELECT COALESCE(SUM(cost*quantity),0) AS total FROM items WHERE order_id=?',o.id).total,0),expenses=all('SELECT * FROM expenses WHERE created>=? AND created<? ORDER BY created DESC',start,end),expenseTotal=expenses.reduce((s,e)=>s+e.amount,0);
    const daily=new Map();for(const o of orders){const day=new Date(o.paid_at+3600000).toISOString().slice(0,10);daily.set(day,(daily.get(day)||0)+o.total-o.refunded);}
    return {from,to,orders:orders.length,gross,refunds,revenue:gross-refunds,cost,expenses:expenseTotal,estimatedProfit:gross-refunds-cost-expenseTotal,averageOrder:orders.length?Math.round(gross/orders.length):0,daily:[...daily].sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({date,value})),expenseRows:expenses,definition:'Paid-order cohort: orders paid in the selected WAT date range, with their current confirmed refunds and allocated supplier costs; expenses recorded in that date range. This is an estimate, not a cash-flow or tax statement.'};
  }
  const csvCell=v=>{let s=String(v??'');if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  function exportCsv(type,from='',to='') {const {start,end}=period(from,to);let rows;
    if(type==='orders')rows=[['Order','Created (UTC)','Customer','Email','Phone','Payment','Fulfilment','Total NGN','Confirmed refunds NGN','Payment reference'],...all('SELECT * FROM orders WHERE created>=? AND created<? ORDER BY created DESC',start,end).map(o=>[o.number,new Date(o.created).toISOString(),o.name,o.email,o.phone,o.payment,o.fulfilment,(o.total/100).toFixed(2),(o.refunded/100).toFixed(2),o.reference])];
    else if(type==='inventory')rows=[['Product','Category','Visible','Colour','Size','Physical quantity','Available quantity','Price NGN','Supplier cost NGN'],...store.catalogue(true).flatMap(p=>p.variants.map(v=>[p.name,p.category,p.visible?'Yes':'No',v.colour,v.size,v.stock,v.available,(v.price/100).toFixed(2),(v.cost/100).toFixed(2)]))];
    else if(type==='expenses')rows=[['Recorded (UTC)','Description','Amount NGN'],...all('SELECT * FROM expenses WHERE created>=? AND created<? ORDER BY created DESC',start,end).map(e=>[new Date(e.created).toISOString(),e.description,(e.amount/100).toFixed(2)])];
    else throw new Problem('Unknown export type');return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
  }
  function saveContent(data) {const clean={};for(const key of ['about','shipping','returns','privacy'])clean[key]=string(data[key]??'',key,10000,true);clean.support_email=string(data.support_email??'','support email',254,true);if(clean.support_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.support_email))throw new Problem('Invalid support email');run('UPDATE store_content SET about=?,shipping=?,returns=?,privacy=?,support_email=? WHERE id=1',clean.about,clean.shipping,clean.returns,clean.privacy,clean.support_email);return clean;}
  function overview(config,env) {const products=store.catalogue(true),s=store.settings(),orders=all('SELECT * FROM orders ORDER BY created DESC'),notifications=get("SELECT COUNT(*) AS count FROM notifications WHERE channel='dashboard' AND read=0").count;return {unread:notifications,queue:{paid:orders.filter(o=>o.payment==='paid'&&o.fulfilment==='Paid'&&!o.cancelled).length,preparing:orders.filter(o=>o.fulfilment==='Preparing').length,ready:orders.filter(o=>['Ready for pickup','Out for delivery'].includes(o.fulfilment)).length,held:orders.filter(o=>o.payment==='paid'&&!o.allocated&&!o.cancelled&&o.refunded<o.total).length,notificationsFailed:get("SELECT COUNT(*) AS count FROM notifications WHERE status='failed'").count},lowStock:products.filter(p=>p.visible).flatMap(p=>p.variants.filter(v=>v.available<=s.lowStock).map(v=>({...v,name:p.name,productId:p.id}))),readiness:[{label:'Private owner account',ready:!!get('SELECT id FROM owner WHERE id=1')},{label:'Real, visible inventory with photos',ready:products.some(p=>!p.sample&&p.visible&&p.photo&&p.variants.some(v=>v.available>0))},{label:'Business WhatsApp number',ready:!!s.whatsapp},{label:'Paystack test integration',ready:config.payment==='paystack'},{label:'Verified email service configured',ready:config.email==='resend'&&!!env.RESEND_API_KEY&&!!env.EMAIL_FROM&&!!s.ownerEmail},{label:'Owner-written returns and privacy information',ready:!!content().returns&&!!content().privacy},{label:'HTTPS deployment origin',ready:config.baseUrl.startsWith('https://')}],recent:orders.slice(0,5).map(o=>({id:o.id,number:o.number,total:o.total,payment:o.payment,fulfilment:o.fulfilment,created:o.created})),audit:all('SELECT * FROM audit ORDER BY id DESC LIMIT 30')};}
  return {content,enrichProducts,saveDetails,adjustStock,note,timeline,orderDetails,resolveHold,customers,analytics,exportCsv,saveContent,overview};
}
