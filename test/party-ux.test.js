process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const { server } = await import('../server/server.js');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
test.after(() => server.close());

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-user-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function registerUser(prefix) {
  const nickname = prefix + crypto.randomBytes(3).toString('hex');
  const res = await call('POST', '/api/users/register', {
    name: nickname + ' Testsson', nickname,
    swishNumber: '07' + String(crypto.randomInt(0, 100000000)).padStart(8, '0'), pin: '1111'
  });
  return res.body;
}

test('Re-opening the invitation mid-round does not send everyone back to the lobby', async () => {
  const host = await registerUser('uxH');
  const guest = await registerUser('uxG');
  const room = (await call('POST', '/api/minigames/party/create', { gameType: 'blind10', stakeAmount: 0 }, host.token)).body.room;
  await call('POST', '/api/minigames/party/join', { roomId: room.id }, guest.token);

  const received = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}?party=${room.id}`);
  await new Promise(resolve => ws.on('open', resolve));
  ws.on('message', m => received.push(JSON.parse(m).type));
  ws.send(JSON.stringify({ type: 'auth', token: host.token }));
  ws.send(JSON.stringify({ action: 'join_party', partyId: room.id }));
  await new Promise(r => setTimeout(r, 200));

  await call('POST', `/api/minigames/party/${room.id}/start`, {}, host.token);
  const rejoin = await call('POST', '/api/minigames/party/join', { roomId: room.id }, guest.token);
  assert.equal(rejoin.status, 200);
  await new Promise(r => setTimeout(r, 300));
  ws.close();

  assert.ok(received.includes('party_started'));
  assert.ok(!received.includes('party_updated'), `unexpected party_updated: ${received.join(', ')}`);
});

test('Automatic pop-ups never replace a game in progress', () => {
  const modal = read('src/components/modal.js');
  assert.match(modal, /export function isGameInProgress\(\)/);
  const main = read('src/main.js');
  assert.match(main, /if \(isGameInProgress\(\)\) \{\s*setTimeout\(offerInstall, 30000\)/);
  assert.match(main, /Ask later instead of interrupting a game in progress\s*\n\s*if \(isGameInProgress\(\)\) return;/);
  const games = read('src/components/minigames.js');
  assert.match(games, /export function showIncomingPartyModal\(room\) \{[\s\S]{0,120}if \(isGameInProgress\(\)\)/);
  assert.match(games, /export function showIncomingAnyBetModal\(bet\) \{[\s\S]{0,120}if \(isGameInProgress\(\)\)/);
});

test('Blind 10 results are never covered by the "waiting" screen and have a polling fallback', () => {
  const games = read('src/components/minigames.js');
  assert.match(games, /\/\/ The round may already be decided[^\n]*\n\s*if \(resultsShown\) return;/);
  assert.match(games, /data\.type === 'party_pot_split'/);
  assert.match(games, /waitingPollId = setInterval\(async \(\) => \{/);
  assert.match(games, /if \(data\.room\.status === 'lobby'\) renderPartyLobbyView\(\);/);
});
