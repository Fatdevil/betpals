process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as db from '../server/db.js';

const uid = () => crypto.randomUUID();
function makeUser(name) {
  const id = uid();
  db.createUser(id, name + crypto.randomBytes(3).toString('hex'), uid(), '🙂', name, '07' + String(crypto.randomInt(1e7, 9e7)), '1111');
  return db.getUserById(id);
}
const soon = () => new Date(Date.now() + 60000).toISOString();
const net = (userId) => db.getUnifiedSettlementOverview(userId);

test('BlixtBet results reach The Tab (debt rows get a winner)', () => {
  const host = makeUser('Host'), win = makeUser('Win'), lose = makeUser('Lose');
  const fb = uid();
  db.createFlashBet(fb, host.id, null, 'Birdie?', 60, soon(), 40);
  db.placeFlashBetEntry(uid(), fb, win.id, 'yes', 40);
  db.placeFlashBetEntry(uid(), fb, lose.id, 'no', 40);
  db.settleFlashBet(fb, 'yes', host.id);

  assert.equal(net(win.id).totalDue, 40);
  assert.equal(net(lose.id).totalOwed, 40);
});

test('AnyBet results reach The Tab', () => {
  const judge = makeUser('Judge'), a = makeUser('Alfa'), b = makeUser('Beta');
  const bet = db.createAnyBet({ title: 'Vem vinner?', creatorId: judge.id, judgeId: judge.id, stakeAmount: 50, betType: 'winner_takes_all', participantIds: [a.id, b.id] });
  for (const u of [a, b]) db.acceptAnyBet(bet.id, u.id);
  const accepted = (db.getAnyBetById(bet.id, judge.id).participants || []).filter(p => p.status === 'accepted');
  db.settleAnyBet({ betId: bet.id, judgeId: judge.id, winnerId: a.id });
  assert.equal(net(a.id).totalDue, 50 * (accepted.length - 1));
  assert.equal(net(b.id).totalOwed, 50);
});

test('split wins are whole kronor and both sides see the same number', () => {
  const host = makeUser('Host'), loser = makeUser('Loser');
  const winners = [makeUser('W1'), makeUser('W2'), makeUser('W3')];
  const fb = uid();
  db.createFlashBet(fb, host.id, null, 'Regn?', 60, soon(), 100);
  for (const w of winners) db.placeFlashBetEntry(uid(), fb, w.id, 'yes', 100);
  db.placeFlashBetEntry(uid(), fb, loser.id, 'no', 100);
  db.settleFlashBet(fb, 'yes', host.id);

  const lo = net(loser.id);
  assert.equal(lo.totalOwed, 99);
  for (const f of lo.friends) assert.ok(Number.isInteger(f.totalNet), `whole kronor, got ${f.totalNet}`);
  for (const w of winners) {
    const mine = net(w.id);
    assert.equal(mine.totalDue, 33);
    assert.equal(mine.friends.find(f => f.friendId === loser.id).totalNet, -lo.friends.find(f => f.friendId === w.id).totalNet);
  }
});

test('tournament balances always sum to zero and BlixtBets in the event are included', () => {
  const a = makeUser('Anna'), b = makeUser('Bosse'), c = makeUser('Cissi');
  const tId = uid();
  db.createTournament(tId, 'Golfhelg', crypto.randomBytes(3).toString('hex').toUpperCase(), a.id, 'friends',
    [a, b, c].map(u => ({ name: u.nickname, userId: u.id })));
  const ev = uid(), p1 = uid(), px = uid();
  db.createEvent({ id: ev, name: 'Match', tournamentId: tId, isSideBet: true, creatorId: a.id }, [{ id: p1, name: '1' }, { id: px, name: 'X' }]);
  db.addBet(uid(), ev, a.nickname, p1, 100, a.id);
  db.addBet(uid(), ev, b.nickname, px, 50, b.id);
  db.addBet(uid(), ev, c.nickname, p1, 50, c.id);
  db.finishEvent(ev, p1);
  const fb = uid();
  db.createFlashBet(fb, a.id, tId, 'Birdie?', 60, soon(), 30);
  db.placeFlashBetEntry(uid(), fb, c.id, 'yes', 30);
  db.placeFlashBetEntry(uid(), fb, b.id, 'no', 30);
  db.settleFlashBet(fb, 'yes', a.id);

  const s = db.getTournamentNetSettlement(tId);
  const byUser = Object.fromEntries(s.balances.map(x => [x.userId, x.net]));
  assert.equal(s.balances.reduce((sum, x) => sum + x.net, 0), 0);
  assert.equal(byUser[b.id], -80);
  assert.equal(byUser[a.id] + byUser[c.id], 80);
  assert.equal(s.transfers.reduce((sum, t) => sum + t.amount, 0), 80);
  // The same event debts must not also show up as standalone duels
  assert.equal(db.getDuelSettlementSummary(b.id).friends.length, 0);
});

test('startup repairs old BlixtBet/AnyBet rows that were saved without a winner', () => {
  const src = readFileSync(new URL('../server/db.js', import.meta.url), 'utf8');
  assert.match(src, /SET winner_id = creator_id, creator_score = 1, opponent_score = 0\s+WHERE game_type IN \('flashbet', 'anybet'\)/);
});
