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

const RUNNERS = ['Adde', 'Brolle', 'Calle', 'Dino', 'Eddie', 'Figge'];

// An event with a "pick 2 of 6" game; host + 3 friends
async function pickGame({ closesAt = null, visibility = 'friends' } = {}) {
  const host = await registerUser('ph');
  const friends = [await registerUser('pa'), await registerUser('pb'), await registerUser('pc')];
  for (const f of friends) db.addFriend(host.id, f.id);
  const tId = crypto.randomUUID();
  db.createTournament(tId, 'Loppkväll', crypto.randomBytes(4).toString('hex').toUpperCase(), host.id, visibility,
    [host, ...friends].map(u => ({ name: u.nickname, userId: u.id })));
  const res = await call('POST', `/api/tournaments/${tId}/sidebets`, { name: 'Vilka 2 kommer sist?', players: RUNNERS, betMode: 'picks', pickCount: 2, betAmount: 50, closesAt }, host.token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const game = res.body.sideBets.find(g => g.name === 'Vilka 2 kommer sist?');
  const ev = db.getFullEvent(game.id);
  const id = (name) => ev.players.find(p => p.name === name).id;
  return { host, friends, tId, ev, id };
}
const tip = (ev, user, picks) => call('POST', `/api/events/${ev.id}/picks`, { picks }, user.token);

test('you must pick exactly N of the game\'s options', async () => {
  const { friends, ev, id } = await pickGame();
  assert.equal((await tip(ev, friends[0], [id('Adde')])).status, 400);
  assert.equal((await tip(ev, friends[0], [id('Adde'), 'not-an-option'])).status, 400);
  assert.equal((await tip(ev, friends[0], [id('Adde'), id('Brolle')])).status, 200);
  // Normal bets are not how you join
  assert.equal((await call('POST', `/api/events/${ev.id}/bets`, { playerId: id('Adde'), amount: 50 }, friends[1].token)).status, 400);
});

test('others\' tips are hidden until betting closes; changing a tip keeps one stake', async () => {
  const { friends, ev, id } = await pickGame();
  await tip(ev, friends[0], [id('Adde'), id('Brolle')]);
  await tip(ev, friends[0], [id('Calle'), id('Dino')]);
  await tip(ev, friends[1], [id('Adde'), id('Eddie')]);

  const seen = (await call('GET', `/api/events/${ev.shareCode}`, null, friends[1].token)).body;
  assert.equal(seen.players.length, RUNNERS.length, 'only the options are listed');
  assert.equal(seen.entries.find(e => e.userId === friends[0].id).picks, null);
  assert.deepEqual(seen.entries.find(e => e.userId === friends[1].id).picks.length, 2);
  assert.equal(seen.totalPool, 100);
});

test('most correct takes the pot; a tie shares it; it all reaches The Tab', async () => {
  const { host, friends, tId, ev, id } = await pickGame();
  const [a, b, c] = friends;
  await tip(ev, a, [id('Adde'), id('Brolle')]); // 2 right
  await tip(ev, b, [id('Adde'), id('Calle')]);  // 1 right
  await tip(ev, c, [id('Dino'), id('Eddie')]);  // 0 right
  const fin = await call('POST', `/api/events/${ev.id}/finish`, { resultIds: [id('Adde'), id('Brolle')] }, host.token);
  assert.equal(fin.status, 200, JSON.stringify(fin.body));
  assert.equal(fin.body.winner, a.nickname);

  const done = db.getFullEvent(ev.id);
  assert.deepEqual(done.entries.map(e => [e.userId, e.correct]).sort(), [[a.id, 2], [b.id, 1], [c.id, 0]].sort());
  const net = (u) => db.getUnifiedSettlementOverview(u.id).friends.reduce((s, f) => s + f.totalNet, 0);
  assert.equal(net(a), 100);
  assert.equal(net(b), -50);
  assert.equal(net(c), -50);
  assert.equal(db.getInbox(a.id).items.find(n => n.type === 'game_result').detail, 'Du hade 2 rätt – du vann 100 kr');

  // Tie: two with 1 right share
  const g2 = await pickGame();
  await tip(g2.ev, g2.friends[0], [g2.id('Adde'), g2.id('Dino')]);
  await tip(g2.ev, g2.friends[1], [g2.id('Brolle'), g2.id('Eddie')]);
  await tip(g2.ev, g2.friends[2], [g2.id('Calle'), g2.id('Figge')]);
  const tie = await call('POST', `/api/events/${g2.ev.id}/finish`, { resultIds: [g2.id('Adde'), g2.id('Brolle')] }, g2.host.token);
  assert.equal(tie.body.isTie, true);
  const n2 = (u) => db.getUnifiedSettlementOverview(u.id).friends.reduce((s, f) => s + f.totalNet, 0);
  assert.equal(n2(g2.friends[0]) + n2(g2.friends[1]), 50);
  assert.equal(n2(g2.friends[2]), -50);
});

test('if nobody got any right, everyone gets their stake back', async () => {
  const { host, friends, ev, id } = await pickGame();
  await tip(ev, friends[0], [id('Adde'), id('Brolle')]);
  await tip(ev, friends[1], [id('Calle'), id('Dino')]);
  await call('POST', `/api/events/${ev.id}/finish`, { resultIds: [id('Eddie'), id('Figge')] }, host.token);
  for (const f of friends.slice(0, 2)) {
    assert.equal(db.getUnifiedSettlementOverview(f.id).friends.reduce((s, x) => s + x.totalNet, 0), 0);
  }
});

test('the result must be exactly N options, and the game rules are set up right', async () => {
  const { host, friends, ev, id } = await pickGame();
  await tip(ev, friends[0], [id('Adde'), id('Brolle')]);
  assert.equal((await call('POST', `/api/events/${ev.id}/finish`, { resultIds: [id('Adde')] }, host.token)).status, 400);
  assert.equal(db.getFullEvent(ev.id).minBet, 50);
  assert.equal(db.getFullEvent(ev.id).maxBet, 50);
  const bad = await call('POST', `/api/tournaments/${ev.tournamentId}/sidebets`, { name: 'Alla?', players: ['A', 'B'], betMode: 'picks', pickCount: 2, betAmount: 50 }, host.token);
  assert.equal(bad.status, 400);
});

test('a game with tips cannot be deleted; cancelling refunds; closed tips can\'t change', async () => {
  const { host, friends, ev, id } = await pickGame({ closesAt: new Date(Date.now() + 60000).toISOString() });
  await tip(ev, friends[0], [id('Adde'), id('Brolle')]);
  assert.equal((await call('DELETE', `/api/events/${ev.id}`, {}, host.token)).status, 400);
  db.lockEvent ? db.lockEvent(ev.id) : null;
  assert.equal((await call('POST', `/api/events/${ev.id}/cancel`, {}, host.token)).status, 200);
  assert.equal(db.getUnifiedSettlementOverview(friends[0].id).friends.reduce((s, x) => s + x.totalNet, 0), 0);
  assert.equal((await tip(ev, friends[0], [id('Calle'), id('Dino')])).status, 400);
});

test('the UI: new game type, pick grid, host result dialog', () => {
  const t = readFileSync(new URL('../src/pages/tournament.js', import.meta.url), 'utf8');
  assert.match(t, /\{ id: 'picks', icon: '🎯', title: 'Välj flera'/);
  assert.match(t, /\.\.\.\(isPicks\(\) \? \{ pickCount: state\.pickCount \} : \{\}\)/);
  const e = readFileSync(new URL('../src/pages/event.js', import.meta.url), 'utf8');
  assert.match(e, /function renderPicksSection\(/);
  assert.match(e, /🔒 dolt till spelstopp/);
  const m = readFileSync(new URL('../src/components/finish-event-modal.js', import.meta.url), 'utf8');
  assert.match(m, /if \(event\.betMode === 'picks'\) return openPickResultModal\(event, \{ pin, onDone \}\);/);
});

test('a deleted account\'s tip still counts (their stake is in the pot)', async () => {
  const { host, friends, ev, id } = await pickGame();
  const [a, b] = friends;
  await tip(ev, a, [id('Adde'), id('Brolle')]); // 2 right, then deletes the account
  await tip(ev, b, [id('Adde'), id('Calle')]);  // 1 right
  db.deleteUser(a.id);
  const fin = await call('POST', `/api/events/${ev.id}/finish`, { resultIds: [id('Adde'), id('Brolle')] }, host.token);
  assert.equal(fin.status, 200);
  const entry = db.getFullEvent(ev.id).entries.find(e => e.correct === 2);
  assert.ok(entry, 'the deleted person\'s tip is still scored');
  assert.equal(db.getUnifiedSettlementOverview(b.id).friends.reduce((s, f) => s + f.totalNet, 0), -50);
});

test('anonymous viewers never get account ids of those who tipped', async () => {
  const { friends, ev, id } = await pickGame({ visibility: 'link' });
  await tip(ev, friends[0], [id('Adde'), id('Brolle')]);
  const res = await call('GET', `/api/events/${ev.shareCode}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.entries.length, 1);
  assert.ok(res.body.entries.every(e => !('userId' in e)));
  assert.equal(res.body.entries[0].picks, null, 'hidden while open');
});

test('the event\'s game card shows what the viewer picked, not "?"', async () => {
  const { friends, ev, id, tId } = await pickGame();
  await tip(ev, friends[0], [id('Brolle'), id('Adde')]);
  const t = (await call('GET', `/api/tournaments/${db.getTournamentById(tId).share_code}`, null, friends[0].token)).body;
  const label = t.sideBets.find(g => g.id === ev.id).myBets[0].playerName;
  assert.deepEqual(label.split(', ').sort(), ['Adde', 'Brolle']);
});
