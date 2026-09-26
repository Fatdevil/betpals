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
const code = () => crypto.randomBytes(4).toString('hex').toUpperCase();

// Anna wins 50 kr from Bosse in a 1X2 game inside an event
function eventWithResult() {
  const a = makeUser('Anna'), b = makeUser('Bosse');
  const tId = uid();
  db.createTournament(tId, 'Team Adde vs Team Brolle', code(), a.id, 'friends',
    [a, b].map(u => ({ name: u.nickname, userId: u.id })));
  const ev = uid(), p1 = uid(), p2 = uid();
  db.createEvent({ id: ev, name: 'FBK – Löven', tournamentId: tId, creatorId: a.id }, [{ id: p1, name: '2 Färjestad' }, { id: p2, name: '1 Löven' }]);
  db.addBet(uid(), ev, a.nickname, p1, 50, a.id);
  db.addBet(uid(), ev, b.nickname, p2, 50, b.id);
  db.finishEvent(ev, p1);
  return { a, b, tId };
}

test('money in a running event is "live": it is not asked for yet', () => {
  const { a, b, tId } = eventWithResult();
  const bo = db.getUnifiedSettlementOverview(b.id);
  assert.equal(bo.totalOwed, 50);
  assert.equal(bo.readyOwed, 0);
  assert.equal(bo.liveNet, -50);
  const withAnna = bo.friends.find(f => f.friendId === a.id);
  assert.equal(withAnna.isLive, true);
  assert.deepEqual(withAnna.liveEvents.map(e => e.id), [tId]);
  assert.deepEqual(bo.liveEvents.map(e => [e.id, e.myNet]), [[tId, -50]]);
});

test('once the event ends, the same money is ready to swish', () => {
  const { a, b, tId } = eventWithResult();
  db.settleTournament(tId);
  const bo = db.getUnifiedSettlementOverview(b.id);
  assert.equal(bo.readyOwed, 50);
  assert.equal(bo.liveNet, 0);
  assert.equal(db.getUnifiedSettlementOverview(a.id).readyDue, 50);
});

test('a duel with someone in the same running event waits too (one swish per person)', () => {
  const { a, b } = eventWithResult();
  const other = makeUser('Cissi');
  for (const [loser, winner] of [[b, other], [b, a]]) {
    const duel = db.createDuel({ gameType: 'gimme', creatorId: loser.id, opponentId: winner.id, stakeAmount: 20, mode: 'online' });
    db.respondDuel(duel.id, winner.id, true);
    db.submitDuelResult({ duelId: duel.id, creatorScore: 0, opponentScore: 1, winnerId: winner.id });
  }
  const bo = db.getUnifiedSettlementOverview(b.id);
  // Owed to Cissi (not in the event) is ready; owed to Anna (same event) waits, duel included
  assert.equal(bo.readyOwed, 20);
  assert.equal(bo.liveNet, -70);
  assert.equal(bo.friends.find(f => f.friendId === a.id).isLive, true);
});

test('a quiet event with results reminds its host once', () => {
  const { tId } = eventWithResult();
  // Not quiet for 48 h yet
  assert.equal(db.getTournamentsNeedingSettleReminder(48).some(t => t.id === tId), false);
  assert.equal(db.getTournamentsNeedingSettleReminder(0).some(t => t.id === tId), true);
  db.markTournamentSettleReminded(tId);
  assert.equal(db.getTournamentsNeedingSettleReminder(0).some(t => t.id === tId), false);
});

test('home asks only for money that is ready; the event card shows where you stand', () => {
  const home = readFileSync(new URL('../src/pages/home.js', import.meta.url), 'utf8');
  assert.match(home, /const readyOwed = settlements \? \(settlements\.readyOwed \?\? settlements\.totalOwed\) : 0;/);
  assert.match(home, /showLiveStandings\(settlements, isEn\);/);
  const tab = readFileSync(new URL('../src/pages/leaderboard.js', import.meta.url), 'utf8');
  assert.match(tab, /const iOwe = friends\.filter\(f => !f\.isLive && f\.totalNet < 0\);/);
  assert.match(tab, /LÖPANDE – GÖRS UPP NÄR EVENTET ÄR SLUT/);
  const server = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
  assert.match(server, /Dags att göra upp: du ska swisha/);
});
