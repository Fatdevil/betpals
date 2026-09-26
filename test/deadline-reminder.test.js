process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as db from '../server/db.js';

const { server, sendDeadlineReminders } = await import('../server/server.js');
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

async function gameClosingIn(minutes, remindBeforeMin = 15) {
  const host = await registerUser('rh'), a = await registerUser('ra'), b = await registerUser('rb');
  const tId = crypto.randomUUID();
  db.createTournament(tId, 'Hockeykväll', crypto.randomBytes(4).toString('hex').toUpperCase(), host.id, 'friends',
    [host, a, b].map(u => ({ name: u.nickname, userId: u.id })));
  const closesAt = new Date(Date.now() + minutes * 60000).toISOString();
  const res = await call('POST', `/api/tournaments/${tId}/sidebets`, { name: 'FBK – Löven', players: ['1', 'X', '2'], betAmount: 50, closesAt, remindBeforeMin }, host.token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const game = res.body.sideBets.find(g => g.name === 'FBK – Löven');
  return { host, a, b, ev: db.getFullEvent(game.id) };
}
const reminded = (u) => db.getInbox(u.id).items.filter(n => n.type === 'deadline_reminder');

test('the reminder goes out when its time comes, once, to those who have not bet', async () => {
  const { host, a, b, ev } = await gameClosingIn(20, 15);
  db.addBet(crypto.randomUUID(), ev.id, a.nickname, ev.players[0].id, 50, a.id);

  sendDeadlineReminders(Date.now()); // 20 min left, reminder at 15: not yet
  assert.equal(reminded(b).length, 0);

  sendDeadlineReminders(Date.now() + 6 * 60000); // 14 min left
  assert.equal(reminded(b).length, 1);
  assert.match(reminded(b)[0].text, /min kvar: FBK – Löven/);
  assert.equal(reminded(a).length, 0, 'already bet');
  assert.equal(reminded(host).length, 1, 'the host has not bet either');

  sendDeadlineReminders(Date.now() + 8 * 60000);
  assert.equal(reminded(b).length, 1, 'only once');
});

test('no reminder for a game without one, or after betting closed', async () => {
  const { b } = await gameClosingIn(20, 0);
  sendDeadlineReminders(Date.now() + 10 * 60000);
  assert.equal(reminded(b).length, 0);
  const late = await gameClosingIn(20, 15);
  sendDeadlineReminders(Date.now() + 25 * 60000); // already closed
  assert.equal(reminded(late.b).length, 0);
});

test('a new closing time gets a new reminder', async () => {
  const { host, b, ev } = await gameClosingIn(20, 15);
  sendDeadlineReminders(Date.now() + 6 * 60000);
  assert.equal(reminded(b).length, 1);
  const newClose = new Date(Date.now() + 60 * 60000).toISOString();
  assert.equal((await call('PUT', `/api/events/${ev.id}/deadline`, { closesAt: newClose, remindBeforeMin: 30 }, host.token)).status, 200);
  assert.equal(db.getFullEvent(ev.id).remindBeforeMin, 30);
  sendDeadlineReminders(Date.now() + 31 * 60000);
  assert.equal(reminded(b).length, 2);
});

test('the new-game form and the deadline dialog offer the reminder', () => {
  const t = readFileSync(new URL('../src/pages/tournament.js', import.meta.url), 'utf8');
  assert.match(t, /\{ min: 15, label: '15 min före' \}/);
  assert.match(t, /\.\.\.\(g\.closesAt && state\.remind > 0 \? \{ remindBeforeMin: state\.remind \} : \{\}\)/);
  const e = readFileSync(new URL('../src/pages/event.js', import.meta.url), 'utf8');
  assert.match(e, /modal-remind-btn/);
});

test('changing only the reminder keeps the deadline, and a reminder must fit before it', async () => {
  const { host, ev } = await gameClosingIn(20, 15);
  const tooLong = await call('PUT', `/api/events/${ev.id}/deadline`, { closesAt: ev.closesAt, remindBeforeMin: 60 }, host.token);
  assert.equal(tooLong.status, 400);
  assert.match(tooLong.body.error, /före spelstoppet/);
  assert.equal(db.getFullEvent(ev.id).remindBeforeMin, 15, 'unchanged');

  const tId = ev.tournamentId;
  const bad = await call('POST', `/api/tournaments/${tId}/sidebets`, {
    name: 'För sent', players: ['1', '2'], betAmount: 50,
    closesAt: new Date(Date.now() + 10 * 60000).toISOString(), remindBeforeMin: 30
  }, host.token);
  assert.equal(bad.status, 400);

  const e = readFileSync(new URL('../src/pages/event.js', import.meta.url), 'utf8');
  assert.match(e, /let newClosesAt = keepCurrent \? current\.toISOString\(\) : null;/);
  assert.match(e, /data-min="keep"/);
});

test('someone who left the event gets no reminder, even with an old cancelled bet', async () => {
  const { host, b, ev } = await gameClosingIn(20, 15);
  db.addBet(crypto.randomUUID(), ev.id, b.nickname, ev.players[0].id, 50, b.id);
  db.cancelEvent(ev.id);
  const part = db.getTournamentParticipants(ev.tournamentId).find(p => p.user_id === b.id);
  db.removeTournamentParticipant(ev.tournamentId, part.id);

  const closesAt = new Date(Date.now() + 20 * 60000).toISOString();
  const res = await call('POST', `/api/tournaments/${ev.tournamentId}/sidebets`, { name: 'Nästa match', players: ['1', '2'], betAmount: 50, closesAt, remindBeforeMin: 15 }, host.token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  sendDeadlineReminders(Date.now() + 6 * 60000);
  assert.equal(reminded(b).length, 0);
  assert.equal(reminded(host).length, 1, 'the host still gets it');
});

test('a game outside an event reminds the organiser and their friends who have not bet', async () => {
  const host = await registerUser('sh'), f1 = await registerUser('sf'), f2 = await registerUser('sg'), stranger = await registerUser('ss');
  db.addFriend(host.id, f1.id);
  db.addFriend(host.id, f2.id);
  const id = crypto.randomUUID();
  db.createEvent({ id, name: 'Fristående', isSideBet: false, creatorId: host.id, shareCode: crypto.randomBytes(3).toString('hex').toUpperCase(), closesAt: new Date(Date.now() + 20 * 60000).toISOString() },
    [{ id: crypto.randomUUID(), name: 'A' }, { id: crypto.randomUUID(), name: 'B' }]);
  db.setEventReminder(id, 15);
  const ev = db.getFullEvent(id);
  db.addBet(crypto.randomUUID(), id, f1.nickname, ev.players[0].id, 50, f1.id);

  sendDeadlineReminders(Date.now() + 6 * 60000);
  assert.equal(reminded(host).length, 1);
  assert.equal(reminded(f2).length, 1);
  assert.equal(reminded(f1).length, 0, 'already bet');
  assert.equal(reminded(stranger).length, 0, 'not a friend');
});

test('closing Not-Roulette mid-spin stops the animation', () => {
  const g = readFileSync(new URL('../src/components/minigames.js', import.meta.url), 'utf8');
  assert.match(g, /if \(!canvas\.isConnected\) \{\s*isSpinning = false;\s*return;/);
  assert.match(g, /resultEl\.querySelector\('#wheel-again-btn'\)/);
});
