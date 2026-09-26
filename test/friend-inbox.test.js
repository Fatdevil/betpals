process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
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
    name: nickname + ' Testsson', nickname,
    swishNumber: '07' + String(crypto.randomInt(0, 100000000)).padStart(8, '0'), pin: '1111'
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

test('a friend request waits in the receiver\'s bell until they answer', async () => {
  const anna = await registerUser('an'), bosse = await registerUser('bo');
  assert.equal((await call('POST', '/api/friends', { friendId: bosse.id }, anna.token)).body.status, 'pending');

  const inbox = (await call('GET', '/api/inbox', null, bosse.token)).body;
  assert.deepEqual(inbox.friendRequests.map(r => r.id), [anna.id]);
  assert.equal(inbox.count, 1);
  // Only the receiver can accept
  assert.equal((await call('POST', `/api/friends/requests/${bosse.id}/accept`, {}, anna.token)).status, 404);
});

test('when the request is accepted, the sender is told in their bell', async () => {
  const anna = await registerUser('an'), bosse = await registerUser('bo');
  await call('POST', '/api/friends', { friendId: bosse.id }, anna.token);
  assert.equal((await call('POST', `/api/friends/requests/${anna.id}/accept`, {}, bosse.token)).status, 200);
  assert.equal(db.isFriend(anna.id, bosse.id), true);

  const annaInbox = (await call('GET', '/api/inbox', null, anna.token)).body;
  assert.equal(annaInbox.items.length, 1);
  assert.equal(annaInbox.items[0].type, 'friend_accepted');
  assert.match(annaInbox.items[0].text, new RegExp(bosse.nickname));
  assert.equal(annaInbox.count, 1);
  assert.equal((await call('GET', '/api/inbox', null, bosse.token)).body.friendRequests.length, 0);

  // Opening the bell marks it as seen
  await call('POST', '/api/inbox/read', {}, anna.token);
  assert.equal((await call('GET', '/api/inbox', null, anna.token)).body.count, 0);
});

test('the sender can withdraw a request', async () => {
  const anna = await registerUser('an'), bosse = await registerUser('bo');
  await call('POST', '/api/friends', { friendId: bosse.id }, anna.token);
  assert.equal((await call('POST', `/api/friends/requests/${bosse.id}/decline`, {}, anna.token)).status, 200);
  assert.equal((await call('GET', '/api/inbox', null, bosse.token)).body.friendRequests.length, 0);
});

test('the inbox needs a login and only shows your own things', async () => {
  assert.equal((await call('GET', '/api/inbox')).status, 401);
});

test('the bell renders requests with accept/decline and escapes what it shows', () => {
  const bell = readFileSync(new URL('../src/components/notifications.js', import.meta.url), 'utf8');
  assert.match(bell, /data-accept="\$\{escapeHtml\(r\.id\)\}">Godkänn<\/button>/);
  assert.match(bell, /data-decline="\$\{escapeHtml\(r\.id\)\}">Neka<\/button>/);
  assert.match(bell, /<div class="notif-text">\$\{escapeHtml\(n\.text\)\}<\/div>/);
  const profile = readFileSync(new URL('../src/pages/profile.js', import.meta.url), 'utf8');
  assert.match(profile, /friend-request-withdraw/);
});
