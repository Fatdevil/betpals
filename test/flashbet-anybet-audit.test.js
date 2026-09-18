import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../server/db.js';

// Setup test users if not existing
const testCreator = {
  id: 'test-creator-' + Date.now(),
  nickname: 'GolfCreator',
  real_name: 'Creator Name',
  swish_number: '0701111111'
};

const testUser1 = {
  id: 'test-user1-' + Date.now(),
  nickname: 'GolferOne',
  real_name: 'Golfer One',
  swish_number: '0702222222'
};

const testUser2 = {
  id: 'test-user2-' + Date.now(),
  nickname: 'GolferTwo',
  real_name: 'Golfer Two',
  swish_number: '0703333333'
};

const testUser3 = {
  id: 'test-user3-' + Date.now(),
  nickname: 'GolferThree',
  real_name: 'Golfer Three',
  swish_number: '0704444444'
};

// Seed users into test db
db.createUser(testCreator.id, testCreator.nickname, 'token-' + testCreator.id, '🏌️', testCreator.real_name, testCreator.swish_number);
db.createUser(testUser1.id, testUser1.nickname, 'token-' + testUser1.id, '⛳', testUser1.real_name, testUser1.swish_number);
db.createUser(testUser2.id, testUser2.nickname, 'token-' + testUser2.id, '🦅', testUser2.real_name, testUser2.swish_number);
db.createUser(testUser3.id, testUser3.nickname, 'token-' + testUser3.id, '🎯', testUser3.real_name, testUser3.swish_number);

test('Finding 1 — AnyBet with status "open" allows invited users to pick side', () => {
  const bet = db.createAnyBet({
    title: 'Hål 1 birdie?',
    description: 'Klarar han birdien på ettan?',
    creatorId: testCreator.id,
    judgeId: testCreator.id,
    stakeAmount: 50,
    betType: 'yes_no',
    deadline: '2026-09-30',
    participantIds: [testUser1.id, testUser2.id]
  });

  assert.equal(bet.status, 'open', 'New bet has status open');

  // Invited user updates choice to 'yes'
  const updated = db.updateAnyBetChoice(bet.id, testUser1.id, 'yes');
  const part1 = updated.participants.find(p => p.user_id === testUser1.id);
  assert.equal(part1.choice, 'yes');
  assert.equal(part1.status, 'accepted', 'Participant is marked accepted after choosing');
});

test('Finding 4 — Winner-takes-all AnyBet accepts invitations cleanly', () => {
  const bet = db.createAnyBet({
    title: 'Vem sätter närmast pinnen?',
    description: 'Hål 7 korthål',
    creatorId: testCreator.id,
    judgeId: testCreator.id,
    stakeAmount: 100,
    betType: 'winner_takes_all',
    deadline: '2026-09-30',
    participantIds: [testUser1.id, testUser2.id]
  });

  const initialPart1 = bet.participants.find(p => p.user_id === testUser1.id);
  assert.equal(initialPart1.status, 'invited', 'Starts as invited');

  const afterAccept = db.acceptAnyBet(bet.id, testUser1.id);
  const acceptedPart1 = afterAccept.participants.find(p => p.user_id === testUser1.id);
  assert.equal(acceptedPart1.status, 'accepted', 'Becomes accepted after acceptAnyBet');
});

test('Finding 3 — Settle AnyBet rejects invalid or unaccepted winners', () => {
  const bet = db.createAnyBet({
    title: 'Längsta drive hål 14',
    creatorId: testCreator.id,
    judgeId: testCreator.id,
    stakeAmount: 50,
    betType: 'winner_takes_all',
    participantIds: [testUser1.id, testUser2.id]
  });

  // testUser1 accepts, testUser2 remains invited
  db.acceptAnyBet(bet.id, testUser1.id);

  // Attempt to settle with arbitrary outside user
  assert.throws(() => {
    db.settleAnyBet({
      betId: bet.id,
      judgeId: testCreator.id,
      winnerId: 'non-existent-user-id'
    });
  }, /Vald vinnare måste vara en godkänd deltagare i vadet/);

  // Attempt to settle with testUser2 who has not accepted
  assert.throws(() => {
    db.settleAnyBet({
      betId: bet.id,
      judgeId: testCreator.id,
      winnerId: testUser2.id
    });
  }, /Vald vinnare måste vara en godkänd deltagare i vadet/);

  // Settling with testUser1 who is accepted succeeds
  const settled = db.settleAnyBet({
    betId: bet.id,
    judgeId: testCreator.id,
    winnerId: testUser1.id
  });

  assert.equal(settled.status, 'completed');
  assert.equal(settled.winner_id, testUser1.id);
});

test('Finding 5 — Ja/Nej AnyBet does NOT treat unvoted participants as losers', () => {
  const bet = db.createAnyBet({
    title: 'Vattenhinder på hål 4?',
    creatorId: testCreator.id,
    judgeId: testCreator.id,
    stakeAmount: 50,
    betType: 'yes_no',
    participantIds: [testUser1.id, testUser2.id, testUser3.id]
  });

  // User 1 votes 'yes'
  db.updateAnyBetChoice(bet.id, testUser1.id, 'yes');
  // User 2 votes 'no'
  db.updateAnyBetChoice(bet.id, testUser2.id, 'no');
  // User 3 accepts invitation but does NOT vote (choice remains 'participant')
  db.acceptAnyBet(bet.id, testUser3.id);

  // Judge settles with 'yes' winning
  const settled = db.settleAnyBet({
    betId: bet.id,
    judgeId: testCreator.id,
    winningSide: 'yes'
  });

  assert.equal(settled.status, 'completed');
  assert.equal(settled.winning_side, 'yes');

  // Verify that User 3 was NOT assigned a debt
  const u3Summary = db.getDuelSettlementSummary(testUser3.id);
  // User 3 should not owe any money
  assert.equal(u3Summary.totalNet, 0, 'Non-voting participant totalNet is 0 (no debt)');
});

test('Finding 2 — Expired Flash Bets remain visible to creator for settlement', async () => {
  const fbId = 'test-fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  // Create FlashBet that expires in 500ms
  const expiresAt = new Date(Date.now() + 500).toISOString();
  db.createFlashBet(fbId, testCreator.id, null, 'Sätter Kalle putten?', 1, expiresAt, 20);

  // User1 votes yes
  db.placeFlashBetEntry('entry-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), fbId, testUser1.id, 'yes', 20);

  // Wait 700ms for expiration
  await new Promise(r => setTimeout(r, 700));

  // Fetch active flashbets for creator: should include the expired/pending settlement bet
  const creatorBets = db.getActiveFlashBets(testCreator.id);
  const foundForCreator = creatorBets.find(b => b.id === fbId);
  assert.ok(foundForCreator, 'Creator can still see expired bet to settle it');
  assert.equal(foundForCreator.status, 'locked', 'Bet is locked when expired');

  // Fetch for an unauthenticated / uninvolved user: should NOT be returned
  const strangerBets = db.getActiveFlashBets(testUser3.id);
  const foundForStranger = strangerBets.find(b => b.id === fbId);
  assert.equal(foundForStranger, undefined, 'Uninvolved user does not see locked expired bet');

  // Creator can settle it cleanly
  const settled = db.settleFlashBet(fbId, 'yes', testCreator.id);
  assert.equal(settled.status, 'settled');
  assert.equal(settled.winningChoice, 'yes');
});

test('Finding 7 — Tournament FlashBet has matching tournamentId property', () => {
  const fbId = 'test-tourn-fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const tournId = 'tourn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const shareCode = 'T' + Math.floor(Math.random() * 90000 + 10000);
  db.createTournament(tournId, 'Test Cup', shareCode, testCreator.id);

  const expiresAt = new Date(Date.now() + 60000).toISOString();
  db.createFlashBet(fbId, testCreator.id, tournId, 'Green in regulation?', 60, expiresAt, 20);

  const fb = db.getFlashBet(fbId);
  assert.equal(fb.tournamentId, tournId, 'fb.tournamentId is populated');
  // Client check: (fb.tournamentId || fb.tournament_id) === tournId
  assert.equal((fb.tournamentId || fb.tournament_id), tournId, 'Filter check matches tournament id');
});

test('Finding 8 & 10 — Swish numbers in entries are masked for uninvolved users', () => {
  const fbId = 'test-priv-fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const expiresAt = new Date(Date.now() + 60000).toISOString();
  db.createFlashBet(fbId, testCreator.id, null, 'Eagle på hål 18?', 60, expiresAt, 50);

  const entryId = 'priv-entry-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  db.placeFlashBetEntry(entryId, fbId, testUser1.id, 'yes', 50);

  // Fetch as testUser2 (who is not testUser1 and bet is not settled)
  const fbForUser2 = db.getFlashBet(fbId, testUser2.id);
  const user1Entry = fbForUser2.entries.find(e => e.userId === testUser1.id);
  assert.equal(user1Entry.swishNumber, null, 'Swish number is hidden from other users during bet');

  // Fetch as testUser1 themselves
  const fbForUser1 = db.getFlashBet(fbId, testUser1.id);
  const selfEntry = fbForUser1.entries.find(e => e.userId === testUser1.id);
  assert.equal(selfEntry.swishNumber, testUser1.swish_number, 'User can see their own Swish number');
});
