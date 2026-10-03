import test from 'node:test';
import assert from 'node:assert/strict';
import {requireOwner,currentBrand} from '../supabase-server.mjs';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;}});
test('expired browser access cookie refreshes and returns usable CSRF on first request',async()=>{
 const original=globalThis.fetch;const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;
 process.env.SUPABASE_URL='https://project.supabase.co';process.env.SUPABASE_ANON_KEY='test-key';
 globalThis.fetch=async(url)=>new Response(JSON.stringify(String(url).includes('/token?')?{access_token:'new-access',refresh_token:'new-refresh',expires_in:3600}:String(url).endsWith('/user')?{id:'owner'}:true));
 try{const res=response();const owner=await requireOwner({headers:{cookie:'oreva_refresh=valid-refresh'}},res);assert.equal(owner.accessToken,'new-access');assert.match(owner.csrf,/^[a-f0-9]{48}$/);assert.ok(res.headers['Set-Cookie'].some(c=>c.startsWith('oreva_csrf='+owner.csrf)));}
 finally{globalThis.fetch=original;if(url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=url;if(key===undefined)delete process.env.SUPABASE_ANON_KEY;else process.env.SUPABASE_ANON_KEY=key;}
});
test('malformed cookie does not produce internal error',async()=>{
 await assert.rejects(requireOwner({headers:{cookie:'oreva_access=%ZZ'}},response()),e=>e.status===401);
});
test('empty double-submit CSRF tokens never authorize a mutation',async()=>{
 await assert.rejects(requireOwner({headers:{origin:process.env.SITE_ORIGIN||'https://oreva-ashy.vercel.app',cookie:'oreva_csrf=','x-csrf-token':''}},response(),{mutation:true}),e=>e.status===403);
});
test('legacy branding migrates for presentation while owner custom branding is preserved',()=>{
 assert.deepEqual(currentBrand({brand:'BAGZ & CO.',logo:'/brand-logo.png',tagline:'Carry your story.'}),{brand:'Orẽva',logo:'/oreva-logo.jpg',tagline:'Timeless elegance.'});
 const custom={brand:'My shop',logo:'custom.webp',tagline:'My words'};assert.deepEqual(currentBrand(custom),custom);
});
