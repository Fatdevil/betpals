process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

const { server } = await import('../server/server.js');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-user-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

async function registerUser(prefix) {
  const nickname = prefix + crypto.randomBytes(3).toString('hex');
  const res = await call('POST', '/api/users/register', {
    name: nickname + ' Testsson',
    nickname,
    swishNumber: '07' + String(crypto.randomInt(0, 100000000)).padStart(8, '0'),
    pin: '1111'
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

// A syntactically valid browser subscription (real P-256 key) pointing at a dead endpoint
function fakeSubscription() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `https://127.0.0.1:9/push/${crypto.randomUUID()}`,
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: crypto.randomBytes(16).toString('base64url')
    }
  };
}

test('Test notification reports missing subscriptions', async () => {
  const user = await registerUser('pushNone');
  const res = await call('POST', '/api/support/test-push', {}, user.token);
  assert.equal(res.status, 400);
});

test('Test notification reports a failed delivery instead of claiming success', async () => {
  const user = await registerUser('pushFail');
  const sub = fakeSubscription();
  assert.equal((await call('POST', '/api/push/subscribe', sub, user.token)).status, 200);

  const res = await call('POST', '/api/support/test-push', {}, user.token);
  assert.equal(res.status, 502, JSON.stringify(res.body));
  assert.equal(res.body.result.sent, 0);
  assert.equal(res.body.result.failed.length, 1);
  assert.match(res.body.error, /kunde inte levereras/);
});

test('Re-subscribing the same device moves it to the account that is logged in now', async () => {
  const first = await registerUser('pushA');
  const second = await registerUser('pushB');
  const sub = fakeSubscription();
  await call('POST', '/api/push/subscribe', sub, first.token);
  await call('POST', '/api/push/subscribe', sub, second.token);

  assert.equal(db.getPushSubscriptionsForUsers([first.id]).length, 0);
  assert.equal(db.getPushSubscriptionsForUsers([second.id]).length, 1);
});

test('The public VAPID key is served for the client-side key check', async () => {
  const res = await call('GET', '/api/push/vapid-public-key');
  assert.equal(res.status, 200);
  assert.match(res.body.publicKey, /^[A-Za-z0-9_-]{80,}$/);
});
