process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

test('Superadmin deleteUser: removes user and cascades relationships safely', () => {
  const r = () => crypto.randomBytes(4).toString('hex');

  // 1. Create two test users
  const userAId = 'u_del_a_' + r();
  const userBId = 'u_del_b_' + r();
  const nickA = 'DelUserA_' + r();
  const nickB = 'DelUserB_' + r();

  db.createUser(userAId, nickA, 'tok_' + userAId, '🎯', 'User A RealName', '0701111111', '1234');
  db.createUser(userBId, nickB, 'tok_' + userBId, '🎲', 'User B RealName', '0702222222', '1234');

  // 2. Add push subscription for user A
  const subId = 'sub_' + r();
  const endpoint = 'https://fcm.googleapis.com/fcm/send/' + subId;
  db.savePushSubscription(subId, userAId, endpoint, 'p256dh_key', 'auth_key');

  // 3. Add friends relationship between A and B
  db.addFriend(userAId, userBId);
  db.addFriend(userBId, userAId);
  assert.equal(db.getFriends(userAId).length, 1, 'User A should have 1 friend');
  assert.equal(db.getFriends(userBId).length, 1, 'User B should have 1 friend');

  // 4. Create an event with players, and a bet from User A
  const eventId = 'ev_' + r();
  const shareCode = 'EV' + crypto.randomInt(1000, 9999);
  db.createEvent({
    id: eventId,
    name: 'Event For Delete Test',
    date: '2026-10-01',
    shareCode,
    payoutPercent: 100,
    minBet: 10,
    maxBet: 1000,
    creatorId: userAId
  }, ['Player 1', 'Player 2']);

  const fullEventBefore = db.getFullEvent(eventId);
  assert.ok(fullEventBefore.players.length >= 2, 'Event should have at least 2 players');
  const playerId = fullEventBefore.players[0].id;

  const betId = 'bet_' + r();
  db.addBet(betId, eventId, 'User A Bettor', playerId, 50, userAId);

  // 5. Add a tournament with User A as participant
  const tourneyId = 'tour_' + r();
  const tourneyCode = 'TR' + crypto.randomInt(1000, 9999);
  db.createTournament(tourneyId, 'Tourney For Delete Test', tourneyCode, userBId, 'friends', []);
  db.addTournamentParticipant(tourneyId, 'Participant A', userAId);

  // 6. Record a rate limit for User A
  db.recordFailedAttempt('pinreset:' + userAId, 5, 15);

  // Verify before deletion
  assert.ok(db.getUserById(userAId), 'User A should exist before delete');

  // 7. Perform deleteUser(userAId)
  const deleted = db.deleteUser(userAId);
  assert.equal(deleted, true, 'deleteUser should return true on success');

  // 8. Verify User A is deleted
  assert.equal(db.getUserById(userAId), undefined, 'User A should be gone');
  assert.equal(db.getUserByToken('tok_' + userAId), undefined, 'User A token should be invalidated');

  // 9. Verify User B no longer has User A in friends list
  const userBFriends = db.getFriends(userBId);
  assert.equal(userBFriends.some(f => f.id === userAId), false, 'User B should no longer have User A as friend');

  // 10. Verify push subscription is gone
  const pushSubs = db.getAllPushSubscriptions();
  assert.equal(pushSubs.some(s => s.user_id === userAId), false, 'Push subscription for User A should be cascade deleted');

  // 11. Verify bet is kept but user_id is set to NULL
  const fullEventAfter = db.getFullEvent(eventId);
  const userABet = fullEventAfter.bets.find(b => b.id === betId);
  assert.ok(userABet, 'Bet row should still exist to preserve pool totals');
  assert.equal(userABet.userId, null, 'Bet userId should be set to NULL');
  assert.equal(userABet.bettorName, 'User A Bettor', 'Bettor name must be preserved');

  // 12. Verify tournament participant row is kept with user_id NULL
  const tourneyParts = db.getTournamentParticipants(tourneyId);
  const partRow = tourneyParts.find(p => p.name === 'Participant A');
  assert.ok(partRow, 'Participant row should still exist');
  assert.equal(partRow.user_id, null, 'Participant user_id should be NULL');

  // 13. Verify event creator is set to NULL
  const ev = db.getEventById(eventId);
  assert.equal(ev.creator_id, null, 'Event creator_id should be SET NULL');

  // 14. Verify delete of non-existent user returns false
  assert.equal(db.deleteUser('non_existent_id_' + r()), false, 'Deleting non-existent user returns false');
  assert.equal(db.deleteUser(null), false, 'Deleting null returns false');

  // Cleanup event and tournament
  db.deleteEvent(eventId);
  db.deleteTournament(tourneyId);
  db.deleteUser(userBId);
});
