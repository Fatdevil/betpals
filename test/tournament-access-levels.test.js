import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';

process.env.NODE_ENV = 'test';

const { app } = await import('../server/server.js');
import * as db from '../server/db.js';

function invoke(method, url, { body = {}, headers = {} } = {}) {
  return new Promise((resolve) => {
    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }
    if (!normalizedHeaders['content-type']) {
      normalizedHeaders['content-type'] = 'application/json';
    }

    const req = Object.assign(new EventEmitter(), {
      method: method.toUpperCase(),
      url,
      headers: normalizedHeaders,
      body,
      query: {},
      params: {},
      unpipe() {},
      pipe() {},
      resume() {},
      pause() {}
    });

    let statusCode = 200;
    const resHeaders = {};
    const res = Object.assign(new EventEmitter(), {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resolve({ status: statusCode, body: data });
      },
      send(data) {
        resolve({ status: statusCode, body: data });
      },
      end(data) {
        resolve({ status: statusCode, body: data });
      },
      setHeader(k, v) { resHeaders[k.toLowerCase()] = v; },
      getHeader(k) { return resHeaders[k.toLowerCase()]; },
      removeHeader(k) { delete resHeaders[k.toLowerCase()]; },
      hasHeader(k) { return k.toLowerCase() in resHeaders; },
      writeHead(code) { statusCode = code; }
    });

    app.handle(req, res);
  });
}

function createTestUser(prefix, nickname) {
  const id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const token = `token-${id}`;
  try {
    db.createUser(id, nickname, token, '👤', nickname, '070' + Math.floor(1000000 + Math.random() * 9000000));
  } catch (e) {}
  return { id, nickname, token };
}

test('Access Control: Level 1 — Friends Only (Bara mina vänner)', async () => {
  const host = createTestUser('u-vis-h1', 'HostFriends');
  const friend = createTestUser('u-vis-f1', 'Friend1');
  const stranger = createTestUser('u-vis-s1', 'Stranger1');

  // Make host and friend friends
  db.addFriend(host.id, friend.id);

  // Host creates friends-only tournament without needing 2 initial players
  const resCreate = await invoke('POST', '/api/tournaments', {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      name: 'Friends Only Cup',
      players: [],
      visibility: 'friends'
    }
  });
  assert.equal(resCreate.status, 200, 'Creation without initial players should succeed');
  const tour = resCreate.body;
  assert.equal(tour.visibility, 'friends');

  // Friend accesses via code -> 200 allowed & auto-joined
  const resFriend = await invoke('GET', `/api/tournaments/${tour.shareCode}`, {
    headers: { Authorization: `Bearer ${friend.token}` }
  });
  assert.equal(resFriend.status, 200, 'Friend should have access');
  assert.ok(resFriend.body.players.includes(friend.nickname), 'Friend should be auto-registered as participant');

  // Stranger accesses via code -> 403 ACCESS_RESTRICTED
  const resStranger = await invoke('GET', `/api/tournaments/${tour.shareCode}`, {
    headers: { Authorization: `Bearer ${stranger.token}` }
  });
  assert.equal(resStranger.status, 403, 'Stranger should be blocked');
  assert.equal(resStranger.body.error, 'ACCESS_RESTRICTED');
  assert.equal(resStranger.body.restriction, 'friends');
  assert.equal(resStranger.body.creatorName, host.nickname);
});

test('Access Control: Level 2 — Friends of Friends (Vänners vänner)', async () => {
  const host = createTestUser('u-vis-h2', 'HostFoF');
  const friend1 = createTestUser('u-vis-f2a', 'Friend2A');
  const friendOfFriend = createTestUser('u-vis-f2b', 'Friend2B');
  const stranger = createTestUser('u-vis-s2', 'Stranger2');

  // Host <-> Friend1, and Friend1 <-> FriendOfFriend
  db.addFriend(host.id, friend1.id);
  db.addFriend(friend1.id, friendOfFriend.id);

  // Verify direct relationships: FriendOfFriend is NOT friend with Host
  assert.equal(db.isFriend(friendOfFriend.id, host.id), false);
  assert.equal(db.isFriendOrFriendOfFriend(friendOfFriend.id, host.id), true);

  // Host creates friends_of_friends tournament
  const resCreate = await invoke('POST', '/api/tournaments', {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      name: 'Marbella Open 2026',
      visibility: 'friends_of_friends'
    }
  });
  assert.equal(resCreate.status, 200);
  const tour = resCreate.body;

  // FriendOfFriend accesses via code -> 200 allowed
  const resFoF = await invoke('GET', `/api/tournaments/${tour.shareCode}`, {
    headers: { Authorization: `Bearer ${friendOfFriend.token}` }
  });
  assert.equal(resFoF.status, 200, 'Friend of friend should be allowed in');

  // Unrelated stranger accesses via code -> 403 blocked
  const resStranger = await invoke('GET', `/api/tournaments/${tour.shareCode}`, {
    headers: { Authorization: `Bearer ${stranger.token}` }
  });
  assert.equal(resStranger.status, 403, 'Stranger without friend connection should be blocked');
  assert.equal(resStranger.body.error, 'ACCESS_RESTRICTED');
});

test('Access Control: Level 3 — Private Link (Alla med länk/QR) & Auto-join retention', async () => {
  const host = createTestUser('u-vis-h3', 'HostPriv');
  const stranger = createTestUser('u-vis-s3', 'StrangerPriv');

  // Host creates private link tournament
  const resCreate = await invoke('POST', '/api/tournaments', {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      name: 'Secret Villa Betting',
      visibility: 'private'
    }
  });
  assert.equal(resCreate.status, 200);
  const tour = resCreate.body;

  // Before scanning/visiting: stranger should NOT see it in their feed
  const feedBefore = db.getAllTournaments(stranger.id);
  assert.ok(!feedBefore.some(t => t.id === tour.id), 'Should not be in stranger feed before visiting');

  // Stranger scans QR / opens link -> 200 allowed and auto-joined
  const resVisit = await invoke('GET', `/api/tournaments/${tour.shareCode}`, {
    headers: { Authorization: `Bearer ${stranger.token}` }
  });
  assert.equal(resVisit.status, 200, 'Anyone with private link/QR should be allowed');

  // After visiting/auto-join: stranger MUST see it in getAllTournaments even if phone restarts
  const feedAfter = db.getAllTournaments(stranger.id);
  assert.ok(feedAfter.some(t => t.id === tour.id), 'Stranger who scanned QR must retain event in feed');
});
