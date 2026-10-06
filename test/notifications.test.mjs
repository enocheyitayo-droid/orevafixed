import test from 'node:test';
import assert from 'node:assert/strict';
import { sendPaidOrderEmail } from '../notifications.mjs';
test('only verified paid orders queue separate customer receipts and owner alerts, independently', async () => {
 const keys = ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','EMAIL_FROM','EMAIL_TEST_RECIPIENT','OWNER_NOTIFICATION_EMAIL'];
 const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
 const original = globalThis.fetch;
 Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test',EMAIL_FROM:'orders@example.test',EMAIL_TEST_RECIPIENT:'',OWNER_NOTIFICATION_EMAIL:'owner@example.test'});
 let paid = false; const messages=[];
 globalThis.fetch = async (url, options={}) => {
  const path = new URL(url).pathname;
  if(path.endsWith('/bagz_orders')) return Response.json([{id:'order1',token:'private',number:'ORE-1',name:'A <B>',email:'customer@example.test',phone:'123',payment_status:paid?'paid':'expired',total:200000,delivery:0,method:'pickup'}]);
  if(path.endsWith('/bagz_order_items')) return Response.json([{name:'Bag',colour:'Black',size:'M',quantity:2,price:100000}]);
  if(path.endsWith('/oreva_enqueue_email')) { const body=JSON.parse(options.body);messages.push(body);if(body.job_key==='oreva-order-paid-order1') return new Response('{}',{status:500}); }
  return Response.json(null);
 };
 try {
  assert.equal((await sendPaidOrderEmail('order1','https://shop.example')).sent,false);
  assert.equal(messages.length,0);
  paid=true; const result=await sendPaidOrderEmail('order1','https://shop.example');
  assert.equal(result.sent,false);assert.equal(messages.length,2);
  assert.deepEqual(messages.map(m=>m.message.to[0]),['customer@example.test','owner@example.test']);
  assert.notEqual(messages[0].job_key,messages[1].job_key);
  assert.match(messages[0].message.html,/Payment receipt/);
  assert.match(messages[1].message.html,/A &lt;B&gt;/);
  assert.match(messages[1].message.text,/2 x Bag/);
 } finally {globalThis.fetch=original;for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
