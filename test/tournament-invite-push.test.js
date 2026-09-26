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
  const id = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const token = `tok_${id}`;
  db.createUser(id, nickname, token, '🏌️', `${nickname} Svensson`, '070' + Math.floor(1000000 + Math.random() * 9000000));
  return { id, nickname, token };
}

test('VIP Friend Invitations: push & feed inclusion without QR code', async () => {
  const host = createTestUser('u-vip-host', 'HostVIP');
  const friend1 = createTestUser('u-vip-f1', 'Friend1');
  const friend2 = createTestUser('u-vip-f2', 'Friend2');
  const stranger = createTestUser('u-vip-str', 'StrangerVIP');

  // Establish friendships
  db.addFriend(host.id, friend1.id);
  db.addFriend(friend1.id, host.id);
  db.addFriend(host.id, friend2.id);
  db.addFriend(friend2.id, host.id);

  // 1. Host creates a private tournament and invites friend1 directly
  const resCreate = await invoke('POST', '/api/tournaments', {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      name: 'Marbella VIP Masters',
      visibility: 'private',
      invitedFriendIds: [friend1.id]
    }
  });

  assert.equal(resCreate.status, 200);
  const tournament = resCreate.body;
  assert.equal(tournament.name, 'Marbella VIP Masters');
  assert.equal(tournament.visibility, 'private');

  // 2. Verify friend1 is already in tournament_participants and sees it in feed immediately
  const feedFriend1 = db.getAllTournaments(friend1.id);
  assert.ok(
    feedFriend1.some(t => t.id === tournament.id),
    'Invited friend1 should have event in feed WITHOUT scanning QR'
  );

  // 3. Friend1 visits tournament -> 200 OK (no bouncer)
  const resAccessF1 = await invoke('GET', `/api/tournaments/${tournament.shareCode}`, {
    headers: { Authorization: `Bearer ${friend1.token}` }
  });
  assert.equal(resAccessF1.status, 200, 'Invited friend1 accesses directly');

  // 4. Stranger (not invited) does NOT see private event in feed before visiting
  const feedStrangerBefore = db.getAllTournaments(stranger.id);
  assert.ok(!feedStrangerBefore.some(t => t.id === tournament.id), 'Stranger should not see private tournament in feed');

  // 5. Host uses POST /api/tournaments/:id/invite to invite friend2 after event creation
  const resInviteF2 = await invoke('POST', `/api/tournaments/${tournament.id}/invite`, {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      friendIds: [friend2.id]
    }
  });
  assert.equal(resInviteF2.status, 200);
  assert.equal(resInviteF2.body.invitedCount, 1);

  // 6. Verify friend2 now sees the event in their feed and can access without QR
  const feedFriend2 = db.getAllTournaments(friend2.id);
  assert.ok(
    feedFriend2.some(t => t.id === tournament.id),
    'Later-invited friend2 should have event in feed WITHOUT scanning QR'
  );

  const resAccessF2 = await invoke('GET', `/api/tournaments/${tournament.shareCode}`, {
    headers: { Authorization: `Bearer ${friend2.token}` }
  });
  assert.equal(resAccessF2.status, 200, 'Friend2 accesses directly after invite');

  // 7. Verify VIP invite on friends-only tournament: stranger is blocked until VIP invited
  const resCreateFriendsOnly = await invoke('POST', '/api/tournaments', {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      name: 'Friends Only Exclusive',
      visibility: 'friends'
    }
  });
  const friendsTournament = resCreateFriendsOnly.body;

  // Stranger tries to access -> 403 blocked
  const resStrangerBlocked = await invoke('GET', `/api/tournaments/${friendsTournament.shareCode}`, {
    headers: { Authorization: `Bearer ${stranger.token}` }
  });
  assert.equal(resStrangerBlocked.status, 403, 'Stranger without friend connection is blocked');
  assert.equal(resStrangerBlocked.body.error, 'ACCESS_RESTRICTED');

  // A stranger cannot be pulled in (or pushed) by id: invites are for friends only
  const resInviteStrangerDenied = await invoke('POST', `/api/tournaments/${friendsTournament.id}/invite`, {
    headers: { Authorization: `Bearer ${host.token}` },
    body: { friendIds: [stranger.id] }
  });
  assert.equal(resInviteStrangerDenied.status, 403, 'Only friends can be invited');

  // Once they are friends, the VIP invite works
  db.addFriend(host.id, stranger.id);
  const resInviteStranger = await invoke('POST', `/api/tournaments/${friendsTournament.id}/invite`, {
    headers: { Authorization: `Bearer ${host.token}` },
    body: {
      friendIds: [stranger.id]
    }
  });
  assert.equal(resInviteStranger.status, 200);

  // Now stranger has VIP access and can enter without being blocked!
  const resStrangerAllowed = await invoke('GET', `/api/tournaments/${friendsTournament.shareCode}`, {
    headers: { Authorization: `Bearer ${stranger.token}` }
  });
  assert.equal(resStrangerAllowed.status, 200, 'Stranger with VIP invite bypasses friends-only restriction');
});
