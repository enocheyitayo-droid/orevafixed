import test from 'node:test';
import assert from 'node:assert/strict';
import admin from '../api/admin.js';
const response=()=>({setHeader(){},end(s){this.body=JSON.parse(s)}});
test('cloud content editor protects writes, validates contact and preserves literal policy text',async()=>{
 const names=['SUPABASE_URL','SUPABASE_ANON_KEY','SITE_ORIGIN'],old=Object.fromEntries(names.map(k=>[k,process.env[k]])),fetchOld=globalThis.fetch;
 Object.assign(process.env,{SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'test',SITE_ORIGIN:'https://oreva-ashy.vercel.app'});let saved;
 globalThis.fetch=async(url,options)=>{if(String(url).endsWith('/user'))return new Response('{"id":"owner"}');if(String(url).includes('bagz_is_owner'))return new Response('true');saved=JSON.parse(options.body).content;return new Response(JSON.stringify(saved));};
 const req={method:'POST',query:{action:'content'},headers:{origin:process.env.SITE_ORIGIN,cookie:'oreva_access=token; oreva_csrf=csrf','x-csrf-token':'csrf'},body:{about:'Our store',shipping:'',returns:'Owner-approved policy <text>',privacy:'',support_email:'shop@example.test'}};
 try{let res=response();await admin({...req,headers:{}},res);assert.equal(res.statusCode,403);res=response();await admin({...req,body:{...req.body,support_email:'bad'}},res);assert.equal(res.statusCode,400);assert.equal(saved,undefined);res=response();await admin(req,res);assert.equal(res.statusCode,200);assert.equal(saved.returns,req.body.returns);assert.equal(saved.shipping,'');}finally{globalThis.fetch=fetchOld;for(const k of names){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}}
});
