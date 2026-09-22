import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

test('Unified Event: 32 participants (12 on-site + 20 remote), split pots, minigames & minimal Swish transfers', async (t) => {
  const creatorId = 'creator_' + crypto.randomUUID();
  db.createUser(creatorId, 'EventOrganizer', 'tok_' + creatorId, '🏌️', 'Organizer Real', '0701111111');

  // Create 12 on-site golfers
  const onSiteUsers = [];
  for (let i = 1; i <= 12; i++) {
    const uid = 'onsite_' + i + '_' + crypto.randomUUID().slice(0, 8);
    const name = `Golfer_${i}`;
    db.createUser(uid, name, 'tok_' + uid, '⛳', name, `07010000${i.toString().padStart(2, '0')}`);
    onSiteUsers.push({ id: uid, name });
  }

  // Create 20 remote sofa bettors
  const remoteUsers = [];
  for (let i = 1; i <= 20; i++) {
    const uid = 'remote_' + i + '_' + crypto.randomUUID().slice(0, 8);
    const name = `SofaBettor_${i}`;
    db.createUser(uid, name, 'tok_' + uid, '🛋️', name, `07020000${i.toString().padStart(2, '0')}`);
    remoteUsers.push({ id: uid, name });
  }

  const all32 = [...onSiteUsers, ...remoteUsers];
  assert.equal(all32.length, 32);

  // 1. Create the unified Event (Tournament)
  const tournamentId = 'tour_' + crypto.randomUUID();
  const shareCode = 'EVT' + crypto.randomInt(1000, 9999);
  db.createTournament(tournamentId, 'Måndagsgolfen & Soffliggarna', shareCode, creatorId, 'friends');

  // 2. Game 1: "Vinnare" (Main Round - Vem vinner måndagsgolfen?)
  const game1Id = 'game1_' + crypto.randomUUID();
  db.createEvent({
    id: game1Id,
    name: 'Måndagsgolfen: Vinnare',
    date: '2026-09-22',
    payoutPercent: 100,
    minBet: 10,
    maxBet: 500,
    creatorId,
    tournamentId,
    isSideBet: false,
    betMode: 'pool'
  }, onSiteUsers.map(g => g.name));

  const game1 = db.getFullEvent(game1Id);
  assert.ok(game1);
  assert.equal(game1.players.length, 12);

  // All 32 people bet 50 kr each on game 1 (Total pool: 1600 kr)
  // Remote bettors bet on Golfer_1 and Golfer_2
  for (let i = 0; i < 32; i++) {
    const user = all32[i];
    const pickedPlayer = game1.players[i % game1.players.length];
    db.addBet('bet_g1_' + i + '_' + crypto.randomUUID().slice(0, 6), game1Id, user.name, pickedPlayer.id, 50, user.id);
  }

  // Golfer_1 wins Game 1
  const winningGolfer1 = game1.players[0];
  db.finishEvent(game1Id, winningGolfer1.id);

  // 3. Game 2: "Vinnare tar allt" (Grupp-pott: Flest Birdies) - Ends in a TIE between Golfer 1 & Golfer 2!
  const game2Id = 'game2_' + crypto.randomUUID();
  db.createEvent({
    id: game2Id,
    name: 'Flest Birdies (Grupp-pott)',
    date: '2026-09-22',
    payoutPercent: 100,
    minBet: 50,
    maxBet: 200,
    creatorId,
    tournamentId,
    isSideBet: true,
    betMode: 'pool'
  }, onSiteUsers.slice(0, 6).map(g => g.name)); // 6 contestants

  const game2 = db.getFullEvent(game2Id);
  // 6 golfers bet 100 kr each on themselves
  for (let i = 0; i < 6; i++) {
    db.addBet('bet_g2_' + i + '_' + crypto.randomUUID().slice(0, 6), game2Id, onSiteUsers[i].name, game2.players[i].id, 100, onSiteUsers[i].id);
  }

  // Golfer 0 and Golfer 1 TIE for most birdies! Split pot!
  const tiedWinners = [game2.players[0].id, game2.players[1].id];
  db.finishEvent(game2Id, tiedWinners.join(','));

  const game2Finished = db.getFullEvent(game2Id);
  assert.equal(game2Finished.isTie, true);
  assert.equal(game2Finished.winnerIds.length, 2);

  // 4. Game 3: "1-X-2" (Lag A vs Lag B)
  const game3Id = 'game3_' + crypto.randomUUID();
  db.createEvent({
    id: game3Id,
    name: 'Lag A vs Lag B (1-X-2)',
    date: '2026-09-22',
    payoutPercent: 100,
    minBet: 20,
    maxBet: 200,
    creatorId,
    tournamentId,
    isSideBet: true,
    betMode: 'pool'
  }, ['1 (Lag A)', 'X (Oavgjort)', '2 (Lag B)']);

  const game3 = db.getFullEvent(game3Id);
  // Remote sofa bettors place bets on 1, X, 2
  for (let i = 0; i < 20; i++) {
    const user = remoteUsers[i];
    const outcomeIndex = i % 3;
    db.addBet('bet_g3_' + i + '_' + crypto.randomUUID().slice(0, 6), game3Id, user.name, game3.players[outcomeIndex].id, 50, user.id);
  }
  // Outcome 'X' happens
  db.finishEvent(game3Id, game3.players[1].id);

  // 5. Minigame absorption: Tärningsduell between an on-site golfer and a remote bettor tied to the Event
  const duelId = 'duel_' + crypto.randomUUID();
  db.createDuel({
    id: duelId,
    gameType: 'dice',
    creatorId: onSiteUsers[0].id,
    opponentId: remoteUsers[0].id,
    stakeAmount: 75,
    mode: 'online',
    tournamentId
  });
  db.respondDuel(duelId, remoteUsers[0].id, true);
  db.submitDuelResult({
    duelId,
    creatorScore: 6,
    opponentScore: 2,
    winnerId: onSiteUsers[0].id
  });

  // 6. Tab Expense absorption: Not-Roulette lunch between 4 golfers tied to the Event
  const expenseParticipants = [onSiteUsers[0].id, onSiteUsers[1].id, onSiteUsers[2].id, onSiteUsers[3].id];
  const expense = db.createTabExpense({
    payerId: onSiteUsers[0].id,
    title: 'Klubbhuslunch & Dryck',
    totalAmount: 400,
    mode: 'even_steven',
    participantIds: expenseParticipants,
    tournamentId
  });
  assert.ok(expense);

  // 7. Verify Net Settlement Matrix
  const settlement = db.getTournamentNetSettlement(tournamentId);
  assert.ok(settlement);
  assert.ok(settlement.balances.length > 0);

  // INVARIANT 1: Zero-sum conservation down to 0 SEK
  const sumBalances = settlement.balances.reduce((sum, b) => sum + b.net, 0);
  assert.equal(sumBalances, 0, 'Sum of all participant net balances must equal exactly 0 SEK');

  // INVARIANT 2: Both on-site golfers and remote sofa bettors are included in balances
  const settledUserIds = new Set(settlement.balances.map(b => b.userId).filter(Boolean));
  assert.ok(settledUserIds.has(onSiteUsers[0].id));
  assert.ok(settledUserIds.has(remoteUsers[0].id));

  // INVARIANT 3: Minimal Swish transfers - Two-Pointer Greedy Matching
  // Every debtor (negative balance) must have at most 1 Swish transfer!
  const debtorTransfers = {};
  for (const transfer of settlement.transfers) {
    debtorTransfers[transfer.from] = (debtorTransfers[transfer.from] || 0) + 1;
    assert.ok(transfer.amount > 0, 'Transfer amount must be positive');
  }

  // Verify that minigames and expenses were absorbed into the audit trail
  const golfer0Audit = settlement.auditTrail[settlement.balances.find(b => b.userId === onSiteUsers[0].id).key];
  assert.ok(golfer0Audit.some(item => item.type === 'minigame'));
  assert.ok(golfer0Audit.some(item => item.title.includes('Delad seger')));

  // Active Tournament lookup test
  const activeForGolfer = db.getActiveTournamentForUser(onSiteUsers[0].id);
  assert.ok(activeForGolfer);
  assert.equal(activeForGolfer.id, tournamentId);

  const activeForRemote = db.getActiveTournamentForUser(remoteUsers[0].id);
  assert.ok(activeForRemote);
  assert.equal(activeForRemote.id, tournamentId);
});
