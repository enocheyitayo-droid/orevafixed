import { randomUUID } from 'node:crypto';
import { supabaseService } from './supabase-server.mjs';

const rpc = (name, body) => supabaseService('/rest/v1/rpc/' + name, { method: 'POST', body });
export async function deliverEmail(key) {
  const claim = randomUUID();
  const job = await rpc('oreva_claim_email', { job_key: key, claim_id: claim });
  if (!job) return { sent: false, reason: 'Already sent, processing, or requires review.' };
  let status = 'failed', reason = '', providerId = null;
  try {
    if (!process.env.RESEND_API_KEY) throw Error('Email service is not configured.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(job.payload), signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error(`Email provider returned ${response.status}.`);
    const result = await response.json();
    if (!result.id) throw Error('Email provider returned no message ID.');
    providerId = result.id;
    status = 'accepted';
  } catch (error) { reason = error.message; }
  await rpc('oreva_finish_email', { job_key: key, claim_id: claim, new_status: status, failure: reason, provider_id: providerId });
  return { sent: status === 'accepted', reason };
}
export async function queueEmail({to,subject,html,text,idempotencyKey}) {
  // Test recipient must be the Resend account owner's address. Never silently redirect customer mail.
  const allowed = process.env.EMAIL_TEST_RECIPIENT?.trim().toLowerCase();
  if (allowed && to.toLowerCase() !== allowed) return { sent: false, reason: 'Customer email is unavailable until a sending domain is verified.' };
  const from = process.env.EMAIL_FROM;
  if (!from) return { sent: false, reason: 'Sender address is not configured.' };
  await rpc('oreva_enqueue_email', { job_key: idempotencyKey, message: { from, to: [to], subject, html, text } });
  return deliverEmail(idempotencyKey);
}
