import test from 'node:test';
import assert from 'node:assert/strict';
import admin from '../api/admin.js';
const response=()=>({setHeader(){},end(s){this.body=JSON.parse(s)}});
test('order management requires owner and CSRF; paid orders advance one stage with concurrency check',async()=>{
 const oldFetch=globalThis.fetch;const keys=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SITE_ORIGIN'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));Object.assign(process.env,{SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'service',SITE_ORIGIN:'https://oreva-ashy.vercel.app'});
 let payment='paid',patches=0;globalThis.fetch=async(url,options)=>{url=String(url);if(url.endsWith('/user'))return new Response('{"id":"owner"}');if(url.includes('bagz_is_owner'))return new Response('true');if(options.method==='PATCH'){patches++;assert.match(url,/fulfilment=eq.Paid/);assert.deepEqual(JSON.parse(options.body),{fulfilment:'Preparing'});return new Response('[{"id":"order"}]')}return new Response(JSON.stringify([{id:'order',method:'pickup',payment_status:payment,allocated:true,exception:'',fulfilment:'Paid'}]));};
 const req={method:'POST',query:{action:'orders'},headers:{origin:process.env.SITE_ORIGIN,cookie:'oreva_access=token; oreva_csrf=csrf','x-csrf-token':'csrf'},body:{id:'a'.repeat(8)+'-aaaa-aaaa-aaaa-'+ 'a'.repeat(12),state:'Preparing'}};
 try{let res=response();await admin({...req,headers:{}},res);assert.equal(res.statusCode,403);res=response();await admin(req,res);assert.equal(res.statusCode,200);assert.equal(patches,1);payment='pending';res=response();await admin(req,res);assert.equal(res.statusCode,409);assert.equal(patches,1);payment='paid';res=response();await admin({...req,body:{...req.body,state:'Completed'}},res);assert.equal(res.statusCode,409);}finally{globalThis.fetch=oldFetch;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}}
});
