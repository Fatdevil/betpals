process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

const { server, partyRooms } = await import('../server/server.js');

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const js = readFileSync(new URL('../src/components/minigames.js', import.meta.url), 'utf8');
const blind10 = js.slice(js.indexOf('export async function openBlind10Modal('), js.indexOf('// ── PASS & PLAY LOGIC'));
const passPlay = js.slice(js.indexOf('// ── PASS & PLAY LOGIC'), js.indexOf("function finishPassAndPlayRun") + 9000);

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

async function lobby(count) {
  const users = [];
  for (let i = 0; i < count; i++) users.push(await registerUser('b10'));
  const room = (await call('POST', '/api/minigames/party/create', { gameType: 'blind10', stakeAmount: 20 }, users[0].token)).body.room;
  for (const u of users.slice(1)) await call('POST', '/api/minigames/party/join', { roomId: room.id }, u.token);
  return { users, roomId: room.id };
}

test('leaving the lobby removes you from the room, so you are not counted in the next round', async () => {
  const { users, roomId } = await lobby(3);
  const res = await call('POST', `/api/minigames/party/${roomId}/leave`, {}, users[2].token);
  assert.equal(res.status, 200);
  assert.equal(partyRooms.get(roomId).players.length, 2);
  assert.ok(!partyRooms.get(roomId).players.some(p => p.id === users[2].id));
});

test('when the host leaves, the next player becomes host; an empty room is removed', async () => {
  const { users, roomId } = await lobby(2);
  await call('POST', `/api/minigames/party/${roomId}/leave`, {}, users[0].token);
  const room = partyRooms.get(roomId);
  assert.equal(room.hostId, users[1].id);
  assert.equal(room.players[0].isHost, true);
  await call('POST', `/api/minigames/party/${roomId}/leave`, {}, users[1].token);
  assert.equal(partyRooms.has(roomId), false);
});

test('you cannot leave in the middle of a round (that counts as not finishing)', async () => {
  const { users, roomId } = await lobby(2);
  assert.equal((await call('POST', `/api/minigames/party/${roomId}/start`, {}, users[0].token)).status, 200);
  const res = await call('POST', `/api/minigames/party/${roomId}/leave`, {}, users[1].token);
  assert.equal(res.status, 400);
  assert.equal(partyRooms.get(roomId).players.length, 2);
});

test('leaving needs a login', async () => {
  const { roomId } = await lobby(2);
  assert.equal((await call('POST', `/api/minigames/party/${roomId}/leave`, {})).status, 401);
});

test('the client leaves the room on the server: lobby button, results button and closing the modal', () => {
  assert.match(blind10, /id="btn-party-leave-after"/);
  assert.equal((blind10.match(/leavePartyRoom\(/g) || []).length >= 3, true);
});

test('only the tied players play the sudden death; the rest watch', () => {
  assert.match(blind10, /const inRound = user && \(data\.room\.tiedPlayerIds \|\| \[\]\)\.includes\(user\.id\);/);
  assert.match(blind10, /renderWaitingForOthers\(null, null, false, \{ spectator: true \}\)/);
});

test('the stop button reacts when the finger lands, once', () => {
  assert.match(blind10, /stopBtn\?\.addEventListener\('pointerdown', onStop\);/);
  assert.match(blind10, /if \(isStopped\) return;\s+isStopped = true;/);
});

test('the custom stake matches the server limit of 500 kr', () => {
  assert.match(blind10, /max="500"/);
  assert.doesNotMatch(blind10, /max="1000"/);
  assert.match(blind10, /Math\.min\(500, /);
});

test('"New round" restarts the same room instead of sending everyone back to setup', () => {
  const handler = blind10.slice(blind10.indexOf("getElementById('btn-party-play-again')"));
  assert.match(handler.slice(0, 300), /await startPartyGame\(room\.id\);/);
});

test('pass & play: a sudden death keeps everyone else in the pot', () => {
  assert.match(passPlay, /function startPassAndPlayRun\(players, stake, alreadyPlaced = \[\]\)/);
  assert.match(passPlay, /const results = \[\.\.\.roundResults, \.\.\.alreadyPlaced/);
  assert.match(passPlay, /blind10-pay-list/);
});

test('the results Close button leaves the room; a new host gets the "new round" button', () => {
  const close = blind10.slice(blind10.indexOf("getElementById('btn-party-close')"));
  assert.match(close.slice(0, 200), /leavePartyRoom\(room\.id\)/);
  assert.match(blind10, /data\.room\.status === 'completed' && resultsShown && hostChanged && lastResultsRoom/);
  assert.match(blind10, /renderPartyResultsView\(\{ \.\.\.lastResultsRoom, hostId: data\.room\.hostId \}, false, \[\]\)/);
});
