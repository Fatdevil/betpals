process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

const originalAdminPin = db.getAdminPin();
process.env.ADMIN_PIN = 'beta-review-admin-secret';
const { server } = await import('../server/server.js');

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function call(method, path, body, token, extraHeaders = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-user-token': token } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}

function randomPhone() {
  return '07' + String(crypto.randomInt(0, 100000000)).padStart(8, '0');
}

async function registerUser(prefix) {
  const nickname = prefix + crypto.randomBytes(3).toString('hex');
  const res = await call('POST', '/api/users/register', {
    name: nickname + ' Testsson',
    nickname,
    swishNumber: randomPhone(),
    pin: '1111'
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

async function makeFriends(a, b) {
  await call('POST', '/api/friends', { friendId: b.id }, a.token);
  const res = await call('POST', `/api/friends/requests/${a.id}/accept`, {}, b.token);
  assert.equal(res.status, 200);
}

function clearLocalRateLimits() {
  for (const ip of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) {
    db.clearRateLimit('admin:' + ip);
    db.clearRateLimit('pinreset_ip:' + ip);
  }
}

test.after(() => {
  clearLocalRateLimits();
  if (originalAdminPin) db.setAdminPin(originalAdminPin);
  server.close();
});

test('Fix 1 — duel result needs confirmation from the other player', async () => {
  const alice = await registerUser('duelA');
  const bob = await registerUser('duelB');

  const created = await call('POST', '/api/duels', { gameType: 'dice', opponentId: bob.id, stakeAmount: 500 }, alice.token);
  const duelId = created.body.duel.id;
  await call('POST', `/api/duels/${duelId}/respond`, { accept: true }, bob.token);

  // Alice claims the win: not completed until Bob confirms
  const claim = await call('POST', `/api/duels/${duelId}/result`, { creatorScore: 12, opponentScore: 2 }, alice.token);
  assert.equal(claim.status, 200);
  assert.equal(claim.body.awaitingConfirmation, true);
  assert.equal(claim.body.duel.status, 'active');
  assert.equal(claim.body.duel.winner_id, null);

  // Bob reports a different result → rejected, still not completed
  const conflict = await call('POST', `/api/duels/${duelId}/result`, { creatorScore: 2, opponentScore: 12 }, bob.token);
  assert.equal(conflict.status, 409);
  assert.equal(db.getDuelById(duelId).status, 'active');

  // Bob confirms the same result → completed
  const confirm = await call('POST', `/api/duels/${duelId}/result`, { creatorScore: 12, opponentScore: 2 }, bob.token);
  assert.equal(confirm.status, 200);
  assert.equal(confirm.body.duel.status, 'completed');
  assert.equal(confirm.body.duel.winner_id, alice.id);
});

test('Fix 1 — a player conceding the loss completes the duel directly', async () => {
  const alice = await registerUser('concA');
  const bob = await registerUser('concB');
  const created = await call('POST', '/api/duels', { gameType: 'coin', opponentId: bob.id, stakeAmount: 50 }, alice.token);
  const duelId = created.body.duel.id;
  await call('POST', `/api/duels/${duelId}/respond`, { accept: true }, bob.token);

  const res = await call('POST', `/api/duels/${duelId}/result`, { creatorScore: 0, opponentScore: 1 }, alice.token);
  assert.equal(res.status, 200);
  assert.equal(res.body.duel.status, 'completed');
  assert.equal(res.body.duel.winner_id, bob.id);
});

test('Fix 2 — duel stake is capped', async () => {
  const alice = await registerUser('capA');
  const bob = await registerUser('capB');
  const huge = await call('POST', '/api/duels', { gameType: 'dice', opponentId: bob.id, stakeAmount: 1e9 }, alice.token);
  assert.equal(huge.status, 400);
  const negative = await call('POST', '/api/duels', { gameType: 'dice', opponentId: bob.id, stakeAmount: -5 }, alice.token);
  assert.equal(negative.status, 400);
  const ok = await call('POST', '/api/duels', { gameType: 'dice', opponentId: bob.id, stakeAmount: 100 }, alice.token);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.duel.stake_amount, 100);
});

test('Fix 3 — friendship requires consent and hides swish until accepted', async () => {
  const alice = await registerUser('frA');
  const carl = await registerUser('frC');

  const req = await call('POST', '/api/friends', { nickname: alice.nickname }, carl.token);
  assert.equal(req.status, 200);
  assert.equal(req.body.status, 'pending');
  assert.equal(req.body.friend.swishNumber, undefined);

  const carlFriends = (await call('GET', '/api/friends', null, carl.token)).body;
  assert.ok(!carlFriends.some(f => f.id === alice.id), 'No friendship before acceptance');

  // Carl cannot bill Alice before she accepts
  const bill = await call('POST', '/api/tab/expenses', { title: 'Middag', totalAmount: 400, participantIds: [alice.id] }, carl.token);
  assert.equal(bill.status, 403);

  const incoming = (await call('GET', '/api/friends/requests', null, alice.token)).body.incoming;
  assert.ok(incoming.some(r => r.id === carl.id));

  const accept = await call('POST', `/api/friends/requests/${carl.id}/accept`, {}, alice.token);
  assert.equal(accept.status, 200);
  const aliceFriends = (await call('GET', '/api/friends', null, alice.token)).body;
  assert.ok(aliceFriends.some(f => f.id === carl.id));
});

test('Fix 3 — signed invite link creates the friendship directly, unsigned does not', async () => {
  const host = await registerUser('invH');
  const guest = await registerUser('invG');
  const other = await registerUser('invO');

  const { token } = (await call('GET', '/api/friends/invite-token', null, host.token)).body;
  const viaLink = await call('POST', '/api/friends', { nickname: host.nickname, inviteToken: token }, guest.token);
  assert.equal(viaLink.body.status, 'accepted');

  const forged = await call('POST', '/api/friends', { nickname: host.nickname, inviteToken: 'f'.repeat(32) }, other.token);
  assert.equal(forged.body.status, 'pending');
});

test('Fix 3 — expenses are capped, payer can delete and participant can dispute', async () => {
  const payer = await registerUser('expP');
  const friendA = await registerUser('expA');
  const friendB = await registerUser('expB');
  await makeFriends(payer, friendA);
  await makeFriends(payer, friendB);

  const tooBig = await call('POST', '/api/tab/expenses', { title: 'Yacht', totalAmount: 200000, participantIds: [friendA.id] }, payer.token);
  assert.equal(tooBig.status, 400);

  const expense = (await call('POST', '/api/tab/expenses', { title: 'Middag', totalAmount: 300, participantIds: [friendA.id, friendB.id] }, payer.token)).body;

  // Friend A disputes their share: only their debt disappears
  const dispute = await call('DELETE', `/api/tab/expenses/${expense.id}`, null, friendA.token);
  assert.equal(dispute.status, 200);
  assert.equal(dispute.body.removed, 'share');
  const aSummary = (await call('GET', '/api/duels/settlements', null, friendA.token)).body;
  assert.ok(!aSummary.friends.some(f => f.friendId === payer.id));
  const bSummary = (await call('GET', '/api/duels/settlements', null, friendB.token)).body;
  assert.equal(bSummary.friends.find(f => f.friendId === payer.id)?.netAmount, -100);

  // An outsider cannot touch it
  const outsider = await registerUser('expX');
  const denied = await call('DELETE', `/api/tab/expenses/${expense.id}`, null, outsider.token);
  assert.equal(denied.status, 403);

  // Payer deletes the whole expense
  const removed = await call('DELETE', `/api/tab/expenses/${expense.id}`, null, payer.token);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.removed, 'expense');
  const bAfter = (await call('GET', '/api/duels/settlements', null, friendB.token)).body;
  assert.ok(!bAfter.friends.some(f => f.friendId === payer.id));
});

test('Fix 4 — admin PIN cannot be brute forced through event endpoints', async () => {
  clearLocalRateLimits();
  const owner = await registerUser('pinOwn');
  const event = (await call('POST', '/api/events', { name: 'Match PIN', players: ['P1', 'P2'] }, owner.token)).body;

  for (let i = 0; i < 5; i++) {
    const guess = await call('POST', `/api/events/${event.id}/lock`, { pin: 'wrong-guess-' + i });
    assert.equal(guess.status, 403);
  }
  // Even the correct PIN is refused from this IP while it is locked out
  const correct = await call('POST', `/api/events/${event.id}/lock`, { pin: process.env.ADMIN_PIN });
  assert.equal(correct.status, 403);
  const verify = await call('POST', '/api/admin/verify', { pin: process.env.ADMIN_PIN });
  assert.equal(verify.status, 429);

  clearLocalRateLimits();
  const afterReset = await call('POST', `/api/events/${event.id}/lock`, { pin: process.env.ADMIN_PIN });
  assert.equal(afterReset.status, 200);
});

test('Fix 4 — short admin PINs are rejected at setup and PIN in query string is ignored', async () => {
  clearLocalRateLimits();
  const setup = await call('POST', '/api/admin/setup', { pin: '1234' });
  assert.equal(setup.status, 403, 'PIN already set from ADMIN_PIN');

  const viaQuery = await call('GET', `/api/admin/backup/latest?pin=${encodeURIComponent(process.env.ADMIN_PIN)}`);
  assert.equal(viaQuery.status, 403);
  const viaHeader = await call('GET', '/api/admin/backup/latest', null, null, { 'x-admin-pin': process.env.ADMIN_PIN });
  assert.equal(viaHeader.status, 200);
});

test('Fix 5 — PIN reset code guessing is rate limited', async () => {
  clearLocalRateLimits();
  const victim = await registerUser('rst');
  const reset = await call('POST', `/api/admin/users/${victim.id}/reset-pin`, { pin: process.env.ADMIN_PIN });
  assert.equal(reset.status, 200);
  const realCode = reset.body.resetCode;
  const wrongCode = realCode === '100000' ? '100001' : '100000';

  for (let i = 0; i < 5; i++) {
    const guess = await call('POST', '/api/users/reset-pin', { identifier: victim.nickname, resetCode: wrongCode, newPin: '2222' });
    assert.equal(guess.status, 401);
  }
  const blocked = await call('POST', '/api/users/reset-pin', { identifier: victim.nickname, resetCode: realCode, newPin: '2222' });
  assert.equal(blocked.status, 429);

  // A fresh code from admin unlocks the account again
  clearLocalRateLimits();
  const reset2 = await call('POST', `/api/admin/users/${victim.id}/reset-pin`, { pin: process.env.ADMIN_PIN });
  const ok = await call('POST', '/api/users/reset-pin', { identifier: victim.nickname, resetCode: reset2.body.resetCode, newPin: '2222' });
  assert.equal(ok.status, 200);
});

test('Fix 6 — reopening a finished event never reopens betting', async () => {
  const host = await registerUser('reoH');
  const bettor = await registerUser('reoB');
  const event = (await call('POST', '/api/events', { name: 'Match Reopen', players: ['P1', 'P2'] }, host.token)).body;

  await call('POST', `/api/events/${event.id}/bets`, { playerId: event.players[0].id, amount: 100 }, bettor.token);
  await call('POST', `/api/events/${event.id}/finish`, { winnerId: event.players[1].id }, host.token);

  const reopen = await call('POST', `/api/events/${event.id}/reopen`, {}, host.token);
  assert.equal(reopen.body.status, 'locked');
  const lateBet = await call('POST', `/api/events/${event.id}/bets`, { playerId: event.players[1].id, amount: 100 }, host.token);
  assert.equal(lateBet.status, 400);

  // Reopening again still keeps betting closed
  const reopenAgain = await call('POST', `/api/events/${event.id}/reopen`, {}, host.token);
  assert.equal(reopenAgain.body.status, 'locked');

  // The result can still be corrected
  const corrected = await call('POST', `/api/events/${event.id}/finish`, { winnerId: event.players[0].id }, host.token);
  assert.equal(corrected.status, 200);
});

test('Fix 6 — a cancelled event cannot be finished', async () => {
  const host = await registerUser('cnl');
  const event = (await call('POST', '/api/events', { name: 'Match Cancel', players: ['P1', 'P2'] }, host.token)).body;
  await call('POST', `/api/events/${event.id}/cancel`, {}, host.token);
  const finish = await call('POST', `/api/events/${event.id}/finish`, { winnerId: event.players[0].id }, host.token);
  assert.equal(finish.status, 400);
});

test('Fix 6 — AnyBet participants cannot switch sides', async () => {
  const creator = await registerUser('abC');
  const friend = await registerUser('abF');
  await makeFriends(creator, friend);

  const bet = (await call('POST', '/api/anybets/create', { title: 'Regnar det?', betType: 'yes_no', stakeAmount: 100, participantIds: [friend.id] }, creator.token)).body.bet;
  const first = await call('POST', `/api/anybets/${bet.id}/join`, { choice: 'yes' }, friend.token);
  assert.equal(first.status, 200);
  const switched = await call('POST', `/api/anybets/${bet.id}/join`, { choice: 'no' }, friend.token);
  assert.equal(switched.status, 400);
});
