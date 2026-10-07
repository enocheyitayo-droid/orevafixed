import test from 'node:test';
import assert from 'node:assert/strict';
import {queueEmail,deliverEmail} from '../email-queue.mjs';
test('email retry uses claimed payload and records provider acceptance; test mail is never redirected',async()=>{
 const keys=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','EMAIL_FROM','EMAIL_TEST_RECIPIENT'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
 Object.assign(process.env,{SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'service',RESEND_API_KEY:'test',EMAIL_FROM:'Shop <shop@example.test>',EMAIL_TEST_RECIPIENT:'owner@example.test'});
 const calls=[];let claimed=true;globalThis.fetch=async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body),headers:options.headers});if(String(url).endsWith('oreva_claim_email'))return new Response(JSON.stringify(claimed?{payload:{to:['owner@example.test'],subject:'Receipt'}}:null));if(String(url).startsWith('https://api.resend.com'))return new Response('{"id":"provider-id"}');return new Response('null')};
 try{const blocked=await queueEmail({to:'customer@example.test',subject:'Receipt',html:'receipt',text:'receipt',idempotencyKey:'order-paid'});assert.equal(blocked.sent,false);assert.equal(calls.length,0);
 assert.equal((await queueEmail({to:'owner@example.test',subject:'Receipt',html:'receipt',text:'receipt',idempotencyKey:'order-paid'})).sent,true);assert.deepEqual(calls.find(c=>c.url.startsWith('https://api.resend.com')).body.to,['owner@example.test']);assert.equal(calls.at(-1).body.new_status,'accepted');assert.equal(calls.at(-1).body.provider_id,'provider-id');claimed=false;const before=calls.length;assert.equal((await deliverEmail('order-paid')).sent,false);assert.equal(calls.length,before+1);
 }finally{globalThis.fetch=originalFetch;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}}
});
