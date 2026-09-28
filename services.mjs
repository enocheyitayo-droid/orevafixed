import { createHmac, timingSafeEqual } from 'node:crypto';
import { Problem, now } from './store.mjs';

export function validSignature(raw,signature,secret) { if(!secret||typeof signature!=='string'||!/^[a-f0-9]{128}$/.test(signature))return false;return timingSafeEqual(Buffer.from(signature,'hex'),createHmac('sha512',secret).update(raw).digest()); }
export function configuration(env=process.env) {
  const production=env.NODE_ENV==='production',payment=env.PAYMENT_ADAPTER||'development',baseUrl=env.BASE_URL||'http://127.0.0.1:3100';
  if(!['development','paystack','disabled'].includes(payment))throw new Error('Unknown payment adapter');
  if(env.PAYSTACK_SECRET_KEY?.startsWith('sk_live'))throw new Error('Live payments are deliberately disabled in this build.');
  if(payment==='paystack'&&!env.PAYSTACK_SECRET_KEY?.startsWith('sk_test_'))throw new Error('Paystack requires an sk_test_ secret key');
  if(production&&(!baseUrl.startsWith('https://')||payment==='development'||(payment==='paystack'&&(env.EMAIL_ADAPTER!=='resend'||!env.RESEND_API_KEY||!env.EMAIL_FROM))))throw new Error('Production requires HTTPS, Paystack test mode, and configured Resend email');
  return {production,payment,baseUrl:new URL(baseUrl).origin,secret:env.PAYSTACK_SECRET_KEY,email:env.EMAIL_ADAPTER||'development'};
}
export function services(store,config,env=process.env) {
  async function paystack(path,body) { const r=await fetch('https://api.paystack.co'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${config.secret}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)}); const data=await r.json();if(!r.ok||!data.status)throw new Problem('Paystack could not complete the request. Retry or ask the owner to reconcile.',502);return data.data; }
  async function initialize(o) {
    if(config.payment==='disabled')throw new Problem('Checkout is not open yet',503);
    if(o.payment!=='pending'||o.cancelled||o.expires<=now())throw new Problem('This checkout has expired or is no longer payable',409);
    if(config.payment==='development')return `/dev-pay/${o.token}`;
    if(o.checkout_url)return o.checkout_url;
    const data=await paystack('/transaction/initialize',{email:o.email,amount:o.total,currency:'NGN',reference:o.reference,callback_url:`${config.baseUrl}/order/${o.token}`,metadata:{order_id:o.id}});
    if(data.reference!==o.reference||new URL(data.authorization_url).hostname!=='checkout.paystack.com')throw new Problem('Unexpected checkout response',502);
    store.run('UPDATE orders SET checkout_url=? WHERE id=?',data.authorization_url,o.id);return data.authorization_url;
  }
  async function verify(o) {if(config.payment!=='paystack')return o;try{const data=await paystack('/transaction/verify/'+encodeURIComponent(o.reference));const result=store.finalize(o.reference,data,config.baseUrl);store.run("UPDATE orders SET payment_checked=?,payment_check_error='' WHERE id=?",now(),o.id);return result;}catch(e){store.run('UPDATE orders SET payment_checked=?,payment_check_error=? WHERE id=?',now(),String(e.message).slice(0,300),o.id);throw e;}}
  let working=false;
  async function processNotifications() {
    if(working)return;working=true;
    try {const jobs=store.all("SELECT * FROM notifications WHERE channel<>'dashboard' AND (status='pending' OR (status='sending' AND locked_until<?)) ORDER BY created LIMIT 20",now());
      for(const job of jobs){const claimed=store.run("UPDATE notifications SET status='sending',locked_until=?,attempts=attempts+1 WHERE id=? AND (status='pending' OR (status='sending' AND locked_until<?))",now()+60000,job.id,now());if(!claimed.changes)continue;
        try {
          if(job.channel==='email') {
            if(config.email==='development') {store.run("UPDATE notifications SET status='development',error='Development outbox only; no email sent' WHERE id=?",job.id);continue;}
            if(!job.recipient||!env.RESEND_API_KEY||!env.EMAIL_FROM)throw new Error('Email recipient or Resend configuration missing');
            // Provider idempotency expires after 24 hours. Do not blindly resend an ambiguous old attempt.
            if(job.attempts>0&&now()-job.created>23*3600000)throw new Error('Delivery uncertain after provider idempotency window; check Resend before any manual resend');
            const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':job.id},body:JSON.stringify({from:env.EMAIL_FROM,to:[job.recipient],subject:job.subject,text:job.body}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Email provider rejected delivery (HTTP '+r.status+')');
          } else if(job.channel==='push') {
            if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_SUBJECT)throw new Error('Web Push VAPID keys are missing');
            const {default:push}=await import('web-push');push.setVapidDetails(env.VAPID_SUBJECT,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
            const subs=store.all('SELECT * FROM subscriptions');if(!subs.length)throw new Error('No subscribed owner device');
            for(const sub of subs){try{await push.sendNotification(JSON.parse(sub.json),JSON.stringify({title:'Store update',body:'An order needs your attention.',tag:job.id,url:'/admin'}),{TTL:3600,timeout:10000});}catch(e){if([404,410].includes(e.statusCode))store.run('DELETE FROM subscriptions WHERE endpoint=?',sub.endpoint);throw new Error('Push delivery failed; subscription may need renewal');}}
          }
          store.run("UPDATE notifications SET status='sent',error='' WHERE id=?",job.id);
        }catch(e){store.run("UPDATE notifications SET status='failed',error=? WHERE id=?",String(e.message).slice(0,500),job.id);}
      }
    } finally {working=false;}
  }
  return {paystack,initialize,verify,processNotifications};
}
