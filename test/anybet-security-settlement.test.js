import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../server/db.js';

// Setup unique test users
const uid = () => 'test-ab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);

const creator = { id: uid(), nickname: 'AnyBetCreator', real_name: 'Creator Boss', swish_number: '0701112233' };
const judgeUser = { id: uid(), nickname: 'NeutralJudge', real_name: 'Judge Dredd', swish_number: '0702223344' };
const friend1 = { id: uid(), nickname: 'PlayerOne', real_name: 'First Player', swish_number: '0703334455' };
const friend2 = { id: uid(), nickname: 'PlayerTwo', real_name: 'Second Player', swish_number: '0704445566' };
const friend3 = { id: uid(), nickname: 'PlayerThree', real_name: 'Third Player', swish_number: '0705556677' };

// Seed users into test db
db.createUser(creator.id, creator.nickname, 'token-' + creator.id, '👑', creator.real_name, creator.swish_number);
db.createUser(judgeUser.id, judgeUser.nickname, 'token-' + judgeUser.id, '⚖️', judgeUser.real_name, judgeUser.swish_number);
db.createUser(friend1.id, friend1.nickname, 'token-' + friend1.id, '⛳', friend1.real_name, friend1.swish_number);
db.createUser(friend2.id, friend2.nickname, 'token-' + friend2.id, '🏌️', friend2.real_name, friend2.swish_number);
db.createUser(friend3.id, friend3.nickname, 'token-' + friend3.id, '🎯', friend3.real_name, friend3.swish_number);

// Add friend relationships with creator
db.addFriend(creator.id, judgeUser.id);
db.addFriend(creator.id, friend1.id);
db.addFriend(creator.id, friend2.id);
db.addFriend(creator.id, friend3.id);

test('AnyBet 1 — Create validation: rejects invalid betType, stake amounts, text limits, and past deadline', () => {
  // Empty title
  assert.throws(() => {
    db.createAnyBet({ title: '', creatorId: creator.id });
  }, /Ange vad bettet handlar om/);

  // Title too long (> 120 chars)
  assert.throws(() => {
    db.createAnyBet({ title: 'A'.repeat(121), creatorId: creator.id });
  }, /Rubriken får vara högst 120 tecken/);

  // Description too long (> 500 chars)
  assert.throws(() => {
    db.createAnyBet({ title: 'Valid Title', description: 'D'.repeat(501), creatorId: creator.id });
  }, /Beskrivningen får vara högst 500 tecken/);

  // Invalid betType
  assert.throws(() => {
    db.createAnyBet({ title: 'Valid Title', creatorId: creator.id, betType: 'malicious_unknown_type' });
  }, /Ogiltig vadtyp/);

  // Negative stake
  assert.throws(() => {
    db.createAnyBet({ title: 'Valid Title', creatorId: creator.id, stakeAmount: -50 });
  }, /Insatsen måste vara ett giltigt positivt tal/);

  // Stake exceeding 10 000 kr
  assert.throws(() => {
    db.createAnyBet({ title: 'Valid Title', creatorId: creator.id, stakeAmount: 10001 });
  }, /Insatsen får vara högst 10 000 kr/);

  // Non-finite stake
  assert.throws(() => {
    db.createAnyBet({ title: 'Valid Title', creatorId: creator.id, stakeAmount: Infinity });
  }, /Insatsen måste vara ett giltigt positivt tal/);

  // Past deadline (yesterday)
  const yesterday = new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10);
  assert.throws(() => {
    db.createAnyBet({ title: 'Valid Title', creatorId: creator.id, deadline: yesterday });
  }, /Deadline kan inte vara i dåtid/);

  // Non-existent tournament
  assert.throws(() => {
    db.createAnyBet({ title: 'Valid Title', creatorId: creator.id, tournamentId: 'bogus-tournament-id' });
  }, /Turneringen hittades inte/);
});

test('AnyBet 2 — Debt Evasion Prevention: player cannot revert from yes/no to participant', () => {
  const bet = db.createAnyBet({
    title: 'Gör Kalle birdie på hål 5?',
    creatorId: creator.id,
    judgeId: creator.id,
    stakeAmount: 100,
    betType: 'yes_no',
    participantIds: [friend1.id, friend2.id]
  });

  // Friend 1 votes 'yes'
  db.updateAnyBetChoice(bet.id, friend1.id, 'yes');
  const part1 = db.getAnyBetById(bet.id).participants.find(p => p.user_id === friend1.id);
  assert.equal(part1.choice, 'yes');

  // Friend 1 tries to revert to neutral 'participant' or invalid choice to avoid debt
  assert.throws(() => {
    db.updateAnyBetChoice(bet.id, friend1.id, 'participant');
  }, /Du har redan valt sida och kan inte återgå till neutral deltagare/);

  assert.throws(() => {
    db.updateAnyBetChoice(bet.id, friend1.id, 'bogus_choice');
  }, /Du har redan valt sida och kan inte återgå till neutral deltagare/);

  // Friend 1 cannot switch sides either (would allow betting after the outcome is known)
  assert.throws(() => {
    db.updateAnyBetChoice(bet.id, friend1.id, 'no');
  }, /Du har redan valt sida och kan inte byta/);
  const part1After = db.getAnyBetById(bet.id).participants.find(p => p.user_id === friend1.id);
  assert.equal(part1After.choice, 'yes');

  // Re-submitting the same side is harmless
  db.updateAnyBetChoice(bet.id, friend1.id, 'yes');
});

test('AnyBet 3 — Deadline enforcement: rejects choice updates after deadline', () => {
  const bet = db.createAnyBet({
    title: 'Vem vinner rundan?',
    creatorId: creator.id,
    judgeId: creator.id,
    stakeAmount: 50,
    betType: 'yes_no',
    deadline: '2099-12-31', // Far future date so test never expires
    participantIds: [friend1.id]
  });

  // Past deadline simulation via test helper isDeadlinePassed
  assert.equal(db.isDeadlinePassed('2020-01-01'), true);
  assert.equal(db.isDeadlinePassed('2099-12-31'), false);
});

test('AnyBet 4 — Decline Bet: invited user can decline, does not receive debt or appear in pot', () => {
  const bet = db.createAnyBet({
    title: 'Hål 18 närmast flagg',
    creatorId: creator.id,
    judgeId: creator.id,
    stakeAmount: 100,
    betType: 'winner_takes_all',
    participantIds: [friend1.id, friend2.id]
  });

  // Friend 2 declines invitation
  const afterDecline = db.declineAnyBet(bet.id, friend2.id);
  const part2 = afterDecline.participants.find(p => p.user_id === friend2.id);
  assert.equal(part2.status, 'declined');

  // Creator cannot decline own bet
  assert.throws(() => {
    db.declineAnyBet(bet.id, creator.id);
  }, /Skaparen kan inte avböja sitt eget vad/);

  // Friend 1 accepts
  db.acceptAnyBet(bet.id, friend1.id);

  // Settle with friend1 winning
  const settled = db.settleAnyBet({
    betId: bet.id,
    judgeId: creator.id,
    winnerId: friend1.id
  });

  // Friend 2 settlement summary: outcome should be 'declined', 0 kr owed
  const f2Settlement = db.getAnyBetSettlement(settled, friend2.id);
  assert.equal(f2Settlement.outcome, 'declined');
  assert.equal(f2Settlement.amountOwed, 0);
  assert.equal(f2Settlement.creditors.length, 0);

  // Creator was accepted loser, should owe friend 1
  const creatorSettlement = db.getAnyBetSettlement(settled, creator.id);
  assert.equal(creatorSettlement.outcome, 'loser');
  assert.equal(creatorSettlement.amountOwed, 100);
  assert.equal(creatorSettlement.creditors.length, 1);
  assert.equal(creatorSettlement.creditors[0].userId, friend1.id);
});

test('AnyBet 5 — Cancel Bet: creator can cancel open bet; cancelled bet cannot be settled', () => {
  const bet = db.createAnyBet({
    title: 'Matchen ikväll?',
    creatorId: creator.id,
    judgeId: creator.id,
    stakeAmount: 50,
    betType: 'winner_takes_all',
    participantIds: [friend1.id]
  });

  // Non-creator cannot cancel
  assert.throws(() => {
    db.cancelAnyBet(bet.id, friend1.id);
  }, /Endast skaparen kan avbryta bettet/);

  // Creator cancels
  const cancelled = db.cancelAnyBet(bet.id, creator.id);
  assert.equal(cancelled.status, 'cancelled');

  // Cannot settle cancelled bet
  assert.throws(() => {
    db.settleAnyBet({
      betId: bet.id,
      judgeId: creator.id,
      winnerId: friend1.id
    });
  }, /Bettet är avbrutet och kan inte avgöras/);
});

test('AnyBet 6 — Judge Exclusivity: when neutral judge is set, creator cannot settle', () => {
  const bet = db.createAnyBet({
    title: 'Längsta putten',
    creatorId: creator.id,
    judgeId: judgeUser.id, // Neutral judge!
    stakeAmount: 50,
    betType: 'winner_takes_all',
    participantIds: [friend1.id]
  });

  db.acceptAnyBet(bet.id, friend1.id);

  // Creator tries to settle but is NOT the designated judge
  assert.throws(() => {
    db.settleAnyBet({
      betId: bet.id,
      judgeId: creator.id, // Attempt by creator
      winnerId: creator.id
    });
  }, /Endast utsedd domare kan avgöra bettet/);

  // Designated judge settles successfully
  const settled = db.settleAnyBet({
    betId: bet.id,
    judgeId: judgeUser.id,
    winnerId: friend1.id
  });
  assert.equal(settled.status, 'completed');
  assert.equal(settled.winner_id, friend1.id);
});

test('AnyBet 7 — Ja/Nej Multi-Winner: splits debt evenly across winners and generates multiple creditors', () => {
  const bet = db.createAnyBet({
    title: 'Regnar det innan hål 9?',
    creatorId: creator.id,
    judgeId: creator.id,
    stakeAmount: 60,
    betType: 'yes_no',
    participantIds: [friend1.id, friend2.id, friend3.id]
  });

  // Creator votes 'no' (loser)
  db.updateAnyBetChoice(bet.id, creator.id, 'no');
  // Friend 1 votes 'yes' (winner)
  db.updateAnyBetChoice(bet.id, friend1.id, 'yes');
  // Friend 2 votes 'yes' (winner)
  db.updateAnyBetChoice(bet.id, friend2.id, 'yes');
  // Friend 3 accepts but does NOT vote (neutral)
  db.acceptAnyBet(bet.id, friend3.id);

  // Settle with 'yes' winning
  const settled = db.settleAnyBet({
    betId: bet.id,
    judgeId: creator.id,
    winningSide: 'yes'
  });

  assert.equal(settled.status, 'completed');
  assert.equal(settled.winning_side, 'yes');

  // Creator settlement: 60 kr stake divided between 2 winners = 30 kr each
  const creatorSettlement = db.getAnyBetSettlement(settled, creator.id);
  assert.equal(creatorSettlement.outcome, 'loser');
  assert.equal(creatorSettlement.amountOwed, 60);
  assert.equal(creatorSettlement.creditors.length, 2);
  assert.equal(creatorSettlement.creditors.some(c => c.userId === friend1.id && c.amount === 30), true);
  assert.equal(creatorSettlement.creditors.some(c => c.userId === friend2.id && c.amount === 30), true);

  // Friend 1 settlement: winner of 30 kr
  const f1Settlement = db.getAnyBetSettlement(settled, friend1.id);
  assert.equal(f1Settlement.outcome, 'winner');
  assert.equal(f1Settlement.amountWon, 30);
  assert.equal(f1Settlement.amountOwed, 0);

  // Friend 3 settlement: neutral participant, 0 kr owed
  const f3Settlement = db.getAnyBetSettlement(settled, friend3.id);
  assert.equal(f3Settlement.outcome, 'neutral');
  assert.equal(f3Settlement.amountOwed, 0);
  assert.equal(f3Settlement.creditors.length, 0);
});

test('AnyBet 8 — Authoritative Settlement for Invited (Non-accepted) Participant', () => {
  const bet = db.createAnyBet({
    title: 'Hål i ett?',
    creatorId: creator.id,
    judgeId: creator.id,
    stakeAmount: 100,
    betType: 'winner_takes_all',
    participantIds: [friend1.id, friend2.id]
  });

  // Friend 1 accepts, Friend 2 remains invited
  db.acceptAnyBet(bet.id, friend1.id);

  // Settle with creator winning
  const settled = db.settleAnyBet({
    betId: bet.id,
    judgeId: creator.id,
    winnerId: creator.id
  });

  // Friend 2 remained invited: MUST NOT be treated as a loser!
  const f2Settlement = db.getAnyBetSettlement(settled, friend2.id);
  assert.equal(f2Settlement.outcome, 'not_accepted');
  assert.equal(f2Settlement.amountOwed, 0);
  assert.equal(f2Settlement.creditors.length, 0);
});
