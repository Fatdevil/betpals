import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

test('Dela utlägg: Custom shares split (Petter 400 kr, others 200 kr) within Event settlement', () => {
  const r = () => crypto.randomUUID();
  const creatorId = 'u_creator_' + r();
  db.createUser(creatorId, 'Org_' + r().slice(0, 6), 'tok_' + r(), '🏌️', 'Organizer', '0701000001');

  const tourId = 'tour_exp_' + r();
  const shareCode = 'EXP' + crypto.randomInt(1000, 9999);
  db.createTournament(tourId, 'Golfhelg med utlägg', shareCode, creatorId, 'friends');

  // 4 friends: Payer (Me), Petter, Erik, Johan
  const payer = { id: 'u_payer_' + r(), name: 'PayerMe' };
  const petter = { id: 'u_petter_' + r(), name: 'Petter' };
  const erik = { id: 'u_erik_' + r(), name: 'Erik' };
  const johan = { id: 'u_johan_' + r(), name: 'Johan' };

  [payer, petter, erik, johan].forEach((u, i) => {
    db.createUser(u.id, u.name, 'tok_' + r(), '🏌️', u.name, '070300000' + (i + 1));
  });

  // Payer paid total 1000 kr for dinner/beer:
  // Petter drank 5 beers -> 400 kr
  // Erik -> 200 kr
  // Johan -> 200 kr
  // Payer -> 200 kr (paid 1000, his share is 200, so he is owed 800)
  const expense = db.createTabExpense({
    payerId: payer.id,
    title: 'Middag & Bärs Klubbhus',
    totalAmount: 1000,
    mode: 'even_steven',
    participantIds: [payer.id, petter.id, erik.id, johan.id],
    customShares: {
      [petter.id]: 400,
      [erik.id]: 200,
      [johan.id]: 200,
      [payer.id]: 200
    },
    tournamentId: tourId
  });

  assert.ok(expense, 'Expense should be created');
  assert.equal(expense.total_amount, 1000);

  // Check tournament net settlement
  const settlement = db.getTournamentNetSettlement(tourId);
  assert.ok(settlement);

  const balPayer = settlement.balances.find(b => b.userId === payer.id);
  const balPetter = settlement.balances.find(b => b.userId === petter.id);
  const balErik = settlement.balances.find(b => b.userId === erik.id);
  const balJohan = settlement.balances.find(b => b.userId === johan.id);

  assert.equal(balPayer.net, 800, 'Payer should be +800 kr');
  assert.equal(balPetter.net, -400, 'Petter should be -400 kr');
  assert.equal(balErik.net, -200, 'Erik should be -200 kr');
  assert.equal(balJohan.net, -200, 'Johan should be -200 kr');

  // Verify Zero-Sum
  const sumNet = settlement.balances.reduce((sum, b) => sum + b.net, 0);
  assert.equal(sumNet, 0, 'Net balances must sum to exactly 0 SEK');

  // Verify Audit Trail labelling
  const payerAudit = settlement.auditTrail[balPayer.key];
  const petterAudit = settlement.auditTrail[balPetter.key];

  assert.ok(payerAudit.every(item => item.type === 'expense'), 'All dinner items should be tagged as expense');
  assert.ok(petterAudit.some(item => item.type === 'expense' && item.amount === -400), 'Petter should have -400 kr expense item');
  assert.ok(petterAudit.some(item => item.title.includes('Middag & Bärs Klubbhus')));

  // Verify transfers: 3 people pay Payer directly (minimal Swish transfers)
  assert.equal(settlement.transfers.length, 3);
  assert.ok(settlement.transfers.some(t => t.from === petter.name && t.to === payer.name && t.amount === 400));
  assert.ok(settlement.transfers.some(t => t.from === erik.name && t.to === payer.name && t.amount === 200));
  assert.ok(settlement.transfers.some(t => t.from === johan.name && t.to === payer.name && t.amount === 200));
});
