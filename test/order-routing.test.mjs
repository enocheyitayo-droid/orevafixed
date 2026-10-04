import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import order from '../api/order.js';
import missing from '../api/not-found.js';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.body=JSON.parse(body)}});
const routes=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url))).routes;
function route(path){for(const r of routes){if(!r.src)continue;const re=new RegExp('^'+r.src+'$');if(re.test(path))return path.replace(re,r.dest)}}
test('private order paths reach API before SPA fallback',()=>{
 const token='a'.repeat(64);
 assert.equal(route('/api/order/'+token),'/api/order?token='+token);
 assert.equal(route('/api/order/'+token+'/verify'),'/api/order?token='+token+'&action=verify');
 assert.equal(route('/api/order/'+token+'/pay'),'/api/order?token='+token+'&action=pay');
 assert.equal(route('/api/order/invalid'),'/api/not-found');
 assert.equal(route('/order/'+token),'/index.html');
});
test('invalid order and missing API return JSON errors',async()=>{
 let res=response(); await order({method:'GET',url:'/api/order',query:{token:'bad'}},res);assert.equal(res.statusCode,404);assert.match(res.body.error,/Invalid order/);
 res=response();missing({},res);assert.equal(res.statusCode,404);assert.match(res.headers['Content-Type'],/json/);
});
test('order dispatcher returns stored state, never treats callback as proof of payment',async()=>{
 const oldFetch=globalThis.fetch, old={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test'});
 let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.match(String(url),/bagz_public_order$/);assert.equal(JSON.parse(options.body).order_token,'a'.repeat(64));return new Response(JSON.stringify({id:'order',payment:'pending'}))};
 try{const res=response();await order({method:'GET',url:'/api/order?trxref=fake',query:{token:'a'.repeat(64)},headers:{}},res);assert.equal(res.statusCode,200);assert.equal(res.body.payment,'pending');assert.equal(calls,1);}finally{globalThis.fetch=oldFetch;for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY']){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key]}}
});
