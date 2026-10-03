import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { paystackSecret, verifyPaystack, validPaystackSignature, initializePaystack } from '../paystack.mjs';

async function withEnvironment(values, run) {
  const names = ['PAYSTACK_SECRET_KEY', 'SITE_ORIGIN'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, values);
  try { await run(); }
  finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
}

const response = (data, status = 200) => new Response(JSON.stringify({ status: status < 400, data }), { status, headers: { 'Content-Type': 'application/json' } });

test('checkout rejects missing keys and accepts test or live Paystack keys', async () => {
  await withEnvironment({}, async () => assert.throws(() => paystackSecret(), /valid Paystack secret key/));
  await withEnvironment({ PAYSTACK_SECRET_KEY: 'sk_test_fixture' }, async () => assert.equal(paystackSecret(), 'sk_test_fixture'));
  await withEnvironment({ PAYSTACK_SECRET_KEY: 'sk_live_fixture' }, async () => assert.equal(paystackSecret(), 'sk_live_fixture'));
});

test('Paystack initialize accepts only hosted checkout URLs and matching reference', async () => {
  const original = globalThis.fetch;
  await withEnvironment({ PAYSTACK_SECRET_KEY: 'sk_test_fixture', SITE_ORIGIN: 'https://oreva-ashy.vercel.app' }, async () => {
    globalThis.fetch = async (_url, options) => {
      assert.match(options.headers.Authorization, /^Bearer sk_test_/);
      const body = JSON.parse(options.body);
      assert.equal(body.amount, 2500000);
      assert.equal(body.metadata.order_id, 'order-id');
      return response({ reference: 'ore_test_reference', authorization_url: 'https://checkout.paystack.com/session', access_code: 'access' });
    };
    try {
      const result = await initializePaystack({ email: 'buyer@example.test', total: 2500000, id: 'order-id', token: 't'.repeat(64), reference: 'ore_test_reference' });
      assert.equal(result.url, 'https://checkout.paystack.com/session');
    } finally { globalThis.fetch = original; }
  });
});

test('verification rejects live-domain transactions even with a test key', async () => {
  const original = globalThis.fetch;
  await withEnvironment({ PAYSTACK_SECRET_KEY: 'sk_test_fixture' }, async () => {
    globalThis.fetch = async () => response({ reference: 'ore_'+'a'.repeat(40), domain: 'live', status: 'success' });
    try { await assert.rejects(verifyPaystack('ore_'+'a'.repeat(40)), /payment mode/); }
    finally { globalThis.fetch = original; }
  });
});

test('webhook signature verifies raw request bytes with the configured test key', async () => {
  await withEnvironment({ PAYSTACK_SECRET_KEY: 'sk_test_fixture' }, async () => {
    const raw = Buffer.from('{"event":"charge.success"}');
    const signature = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(raw).digest('hex');
    assert.equal(validPaystackSignature(raw, signature), true);
    assert.equal(validPaystackSignature(Buffer.from('{}'), signature), false);
    assert.equal(validPaystackSignature(raw, 'f'.repeat(128)), false);
  });
});


test('verification accepts a live-domain transaction with a live key', async () => {
  const original = globalThis.fetch;
  await withEnvironment({ PAYSTACK_SECRET_KEY: 'sk_live_fixture' }, async () => {
    globalThis.fetch = async () => response({ reference: 'ore_'+'b'.repeat(40), domain: 'live', status: 'success' });
    try {
      const result = await verifyPaystack('ore_'+'b'.repeat(40));
      assert.equal(result.domain, 'live');
    } finally { globalThis.fetch = original; }
  });
});
