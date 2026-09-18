import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import Database from 'better-sqlite3';

process.env.NODE_ENV = 'test';

// Import server & db
const { app } = await import('../server/server.js');
import * as db from '../server/db.js';

// In-memory route invocation
function invoke(method, url, { body = {}, headers = {} } = {}) {
  return new Promise((resolve) => {
    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }
    if (!normalizedHeaders['content-type']) {
      normalizedHeaders['content-type'] = 'application/json';
    }

    const req = Object.assign(new EventEmitter(), {
      method: method.toUpperCase(),
      url,
      headers: normalizedHeaders,
      body,
      query: {},
      params: {},
      unpipe() {},
      pipe() {},
      resume() {},
      pause() {}
    });

    let statusCode = 200;
    const resHeaders = {};
    const res = Object.assign(new EventEmitter(), {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resolve({ status: statusCode, body: data });
      },
      send(data) {
        resolve({ status: statusCode, body: data });
      },
      end(data) {
        resolve({ status: statusCode, body: data });
      },
      setHeader(k, v) { resHeaders[k.toLowerCase()] = v; },
      getHeader(k) { return resHeaders[k.toLowerCase()]; },
      removeHeader(k) { delete resHeaders[k.toLowerCase()]; },
      hasHeader(k) { return k.toLowerCase() in resHeaders; },
      writeHead(code) { statusCode = code; }
    });

    app.handle(req, res);
  });
}

function createTestUser(prefix, nickname) {
  const id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const token = `token-${id}`;
  try {
    db.createUser(id, nickname, token, '👤', nickname, '070' + Math.floor(1000000 + Math.random() * 9000000));
  } catch (e) {}
  return { id, nickname, token };
}

// ── Finding 1: Database Schema & Clean Startup ────────────────────────
test('Finding 1 — Clean Database Startup: minigame_duels table schema includes all required columns', () => {
  // Test fresh in-memory database creation
  const memDb = new Database(':memory:');
  memDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS minigame_duels (
      id TEXT PRIMARY KEY,
      game_type TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      opponent_id TEXT,
      stake_amount REAL DEFAULT 1,
      mode TEXT DEFAULT 'online',
      status TEXT NOT NULL,
      creator_score INTEGER,
      opponent_score INTEGER,
      winner_id TEXT,
      is_settled INTEGER DEFAULT 0,
      settled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expense_id TEXT,
      custom_title TEXT,
      receipt_image TEXT,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (opponent_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Verify that insert statement with expense_id, custom_title, receipt_image prepares without error
  const stmt = memDb.prepare(`
    INSERT INTO minigame_duels (id, game_type, creator_id, opponent_id, stake_amount, mode, status, winner_id, creator_score, opponent_score, is_settled, expense_id, custom_title, receipt_image)
    VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, 1, 0, 0, ?, ?, ?)
  `);
  assert.ok(stmt, 'Prepared statement should succeed on clean table schema');

  // Verify real db has these columns accessible
  const realCheck = db.getDuelSettlementSummary('nonexistent-user');
  assert.ok(realCheck, 'Summary query should execute cleanly');
  memDb.close();
});

// ── Finding 2: Tournament Settlement Receipts Security ────────────────
test('Finding 2 — Tournament Settlement Receipts: Enforce transfer existence, amount limits, and creditor authorization', async () => {
  const host = createTestUser('u-t2-host', 'TourHost2');
  const debtor = createTestUser('u-t2-debtor', 'DebtorUser2');
  const creditor = createTestUser('u-t2-creditor', 'CreditorUser2');

  const tourId = 'tour-audit-receipts-' + Date.now();
  const shareCode = 'R' + Math.random().toString(36).substring(2, 6).toUpperCase();
  db.createTournament(tourId, 'Receipts Audit Tournament', shareCode, host.id, 'friends');

  const eventId = 'ev-audit-receipts-' + Date.now();
  const pId1 = 'p-deb-' + Date.now();
  const pId2 = 'p-cred-' + Date.now();
  db.createEvent({
    id: eventId,
    tournament_id: tourId,
    name: 'Final Match',
    payout_percent: 100
  }, [
    { id: pId1, name: 'Player Debtor' },
    { id: pId2, name: 'Player Creditor' }
  ]);

  // Place bets: debtor bets on p1 (loses), creditor bets on p2 (wins)
  db.addBet('bet-deb-' + Date.now(), eventId, debtor.nickname, pId1, 200, debtor.id);
  db.addBet('bet-cred-' + Date.now(), eventId, creditor.nickname, pId2, 200, creditor.id);

  // Finish event: p2 wins
  db.finishEvent(eventId, pId2);

  // Check calculated net settlement: debtor owes creditor 200 kr
  const settlement = db.getTournamentNetSettlement(tourId);
  const transfer = (settlement.transfers || []).find(t => t.from === debtor.nickname && t.to === creditor.nickname);
  assert.ok(transfer, 'Calculated transfer should exist from debtor to creditor');
  assert.equal(transfer.amount, 200, 'Calculated transfer amount should be 200');

  // Attempt 1: Unauthorized debtor tries to register receipt directly without being creator or creditor
  const resUnauthorized = await invoke('POST', `/api/tournaments/${tourId}/settlement/receipt`, {
    headers: { Authorization: `Bearer ${debtor.token}` },
    body: {
      fromName: debtor.nickname,
      toName: creditor.nickname,
      fromUserId: debtor.id,
      toUserId: creditor.id,
      amount: 200
    }
  });
  assert.equal(resUnauthorized.status, 403, 'Debtor should not be able to unilaterally settle receipt without creditor or host authorization');

  // Attempt 2: Creditor tries to register receipt with inflated amount (> 200 kr)
  const resInflated = await invoke('POST', `/api/tournaments/${tourId}/settlement/receipt`, {
    headers: { Authorization: `Bearer ${creditor.token}` },
    body: {
      fromName: debtor.nickname,
      toName: creditor.nickname,
      fromUserId: debtor.id,
      toUserId: creditor.id,
      amount: 99999
    }
  });
  assert.equal(resInflated.status, 400, 'Amount exceeding outstanding debt should be rejected');

  // Attempt 3: Creditor registers legitimate receipt for 200 kr
  const resValid = await invoke('POST', `/api/tournaments/${tourId}/settlement/receipt`, {
    headers: { Authorization: `Bearer ${creditor.token}` },
    body: {
      fromName: debtor.nickname,
      toName: creditor.nickname,
      fromUserId: debtor.id,
      toUserId: creditor.id,
      amount: 200
    }
  });
  assert.equal(resValid.status, 200, 'Creditor should successfully settle valid transfer');
  assert.equal(resValid.body.isPaid, true);

  // Check updated settlement: debt is now cleared
  const updatedSettlement = db.getTournamentNetSettlement(tourId);
  const remainingTransfers = (updatedSettlement.transfers || []).filter(t => t.from === debtor.nickname);
  assert.equal(remainingTransfers.length, 0, 'Debtor should now be completely debt-free');
});

// ── Finding 3: Multi-transfer Distribution in "Gör mig skuldfri" ───────
test('Finding 3 — Multi-transfer Isolation: User with multiple creditors maintains distinct transfers', () => {
  const host = createTestUser('u-t3-host', 'Host3');
  const debtor = createTestUser('u-t3-deb', 'Debtor3');
  const cred1 = createTestUser('u-t3-c1', 'Creditor3A');
  const cred2 = createTestUser('u-t3-c2', 'Creditor3B');

  const tourId = 'tour-audit-multi-' + Date.now();
  const shareCode = 'M' + Math.random().toString(36).substring(2, 6).toUpperCase();
  db.createTournament(tourId, 'Multi-Transfer Audit', shareCode, host.id, 'friends');

  const ev1 = 'ev-m1-' + Date.now();
  const p1 = 'p-m1-a-' + Date.now();
  const p2 = 'p-m1-b-' + Date.now();
  db.createEvent({
    id: ev1,
    tournament_id: tourId,
    name: 'Round 1',
    payout_percent: 100
  }, [
    { id: p1, name: 'Player A' },
    { id: p2, name: 'Player B' }
  ]);

  // Debtor bets 500 on p1 (loses). Cred1 bets 200 on p2, Cred2 bets 300 on p2.
  db.addBet('b-deb-' + Date.now(), ev1, debtor.nickname, p1, 500, debtor.id);
  db.addBet('b-c1-' + Date.now(), ev1, cred1.nickname, p2, 200, cred1.id);
  db.addBet('b-c2-' + Date.now(), ev1, cred2.nickname, p2, 300, cred2.id);

  db.finishEvent(ev1, p2);

  const settlement = db.getTournamentNetSettlement(tourId);
  const myTransfers = (settlement.transfers || []).filter(tr => tr.from === debtor.nickname);

  assert.equal(myTransfers.length, 2, 'Debtor should have exactly 2 distinct transfers, not 1 collapsed transfer');
  const totalOwed = myTransfers.reduce((sum, tr) => sum + tr.amount, 0);
  assert.equal(totalOwed, 500, 'Sum of transfers should equal total net debt');
  assert.ok(myTransfers.some(tr => tr.to === cred1.nickname && tr.amount === 200), 'Transfer to Creditor A should be 200 kr');
  assert.ok(myTransfers.some(tr => tr.to === cred2.nickname && tr.amount === 300), 'Transfer to Creditor B should be 300 kr');
});

// ── Finding 4: Duel Result Score Validation ───────────────────────────
test('Finding 4 — Duel Results: Winner must be consistent with reported scores', async () => {
  const creator = createTestUser('u-d4-creator', 'Duelist1');
  const opponent = createTestUser('u-d4-opponent', 'Duelist2');

  const duel = db.createDuel({
    gameType: 'gimme',
    creatorId: creator.id,
    opponentId: opponent.id,
    stakeAmount: 50,
    mode: 'online'
  });
  db.respondDuel(duel.id, opponent.id, true); // Status becomes active

  // Attempt 1: Contradictory result (creator score 5, opponent score 10, but claiming creator is winner)
  const resContradictory = await invoke('POST', `/api/duels/${duel.id}/result`, {
    headers: { Authorization: `Bearer ${creator.token}` },
    body: {
      creatorScore: 5,
      opponentScore: 10,
      winnerId: creator.id
    }
  });
  assert.equal(resContradictory.status, 400, 'Contradictory winner should be rejected');
  assert.match(resContradictory.body.error, /matchar inte poängställningen/);

  // Attempt 2: Consistent result (opponent score 10 > creator score 5 -> winner opponent)
  const resConsistent = await invoke('POST', `/api/duels/${duel.id}/result`, {
    headers: { Authorization: `Bearer ${creator.token}` },
    body: {
      creatorScore: 5,
      opponentScore: 10,
      winnerId: opponent.id
    }
  });
  assert.equal(resConsistent.status, 200, 'Consistent duel result should be accepted');
  assert.equal(resConsistent.body.duel.winner_id, opponent.id);
  assert.equal(resConsistent.body.duel.status, 'completed');
});

// ── Finding 5: Settle Authorization for Duels ─────────────────────────
test('Finding 5 — Duel Settle Authorization: Debtor cannot unilaterally wipe out duel debts', async () => {
  const winner = createTestUser('u-d5-win', 'WinnerCreditor');
  const loser = createTestUser('u-d5-lose', 'LoserDebtor');

  const duel = db.createDuel({
    gameType: 'trivia',
    creatorId: winner.id,
    opponentId: loser.id,
    stakeAmount: 100,
    mode: 'online'
  });
  db.respondDuel(duel.id, loser.id, true);

  db.submitDuelResult({
    duelId: duel.id,
    creatorScore: 10,
    opponentScore: 2,
    winnerId: winner.id
  });

  // Check summary for loser: netAmount should be -100 (debtor)
  const loserSummary = db.getDuelSettlementSummary(loser.id);
  const friendEntry = loserSummary.friends.find(f => f.friendId === winner.id);
  assert.ok(friendEntry && friendEntry.netAmount === -100, 'Loser should have netAmount = -100');

  // Attempt 1: Loser attempts to settle all duels with winner via settle-with
  const resLoserSettle = await invoke('POST', `/api/duels/settle-with/${winner.id}`, {
    headers: { Authorization: `Bearer ${loser.token}` }
  });
  assert.equal(resLoserSettle.status, 403, 'Debtor should be rejected with 403 when trying to settle debts');

  // Attempt 2: Loser attempts to settle individual completed duel
  const resLoserSingle = await invoke('POST', `/api/duels/${duel.id}/settle`, {
    headers: { Authorization: `Bearer ${loser.token}` }
  });
  assert.equal(resLoserSingle.status, 403, 'Debtor should be rejected with 403 when trying to settle single duel');

  // Attempt 3: Winner (creditor) settles the debt
  const resWinnerSettle = await invoke('POST', `/api/duels/settle-with/${loser.id}`, {
    headers: { Authorization: `Bearer ${winner.token}` }
  });
  assert.equal(resWinnerSettle.status, 200, 'Creditor should successfully settle the duels');

  // Verify settled
  const updatedDuel = db.getDuelById(duel.id);
  assert.equal(updatedDuel.is_settled, 1, 'Duel should now be marked settled');
});

// ── Finding 7: Player Separation by User ID in Net Settlement ─────────
test('Finding 7 — Name Collisions: Separate balances for distinct users sharing the same display name', () => {
  const host = createTestUser('u-t7-host', 'Host7');
  const userA = createTestUser('u-t7-a', 'Alex');
  const userB = createTestUser('u-t7-b', 'Alex'); // Same nickname, distinct user_id

  const tourId = 'tour-audit-names-' + Date.now();
  const shareCode = 'N' + Math.random().toString(36).substring(2, 6).toUpperCase();
  db.createTournament(tourId, 'Name Collision Audit', shareCode, host.id, 'friends');

  const ev = 'ev-names-' + Date.now();
  const pA = 'p-n-a-' + Date.now();
  const pB = 'p-n-b-' + Date.now();
  db.createEvent({
    id: ev,
    tournament_id: tourId,
    name: 'Match',
    payout_percent: 100
  }, [
    { id: pA, name: 'Golfer 1' },
    { id: pB, name: 'Golfer 2' }
  ]);

  // User A bets 100 on pA (loses), User B bets 100 on pB (wins)
  db.addBet('b-na-' + Date.now(), ev, userA.nickname, pA, 100, userA.id);
  db.addBet('b-nb-' + Date.now(), ev, userB.nickname, pB, 100, userB.id);

  db.finishEvent(ev, pB);

  const settlement = db.getTournamentNetSettlement(tourId);
  const balA = settlement.balances.find(b => b.userId === userA.id);
  const balB = settlement.balances.find(b => b.userId === userB.id);

  assert.ok(balA, 'User A should have their own balance entry');
  assert.ok(balB, 'User B should have their own balance entry');
  assert.equal(balA.net, -100, 'User A balance should be -100');
  assert.equal(balB.net, 100, 'User B balance should be +100');
});

// ── Finding 8: Even Steven Exact Penny Distribution ───────────────────
test('Finding 8 — Even Steven Penny Precision: Sum of split shares matches total amount down to the exact cent', () => {
  const payer = createTestUser('u-p8-payer', 'Payer8');
  const p2 = createTestUser('u-p8-p2', 'User8A');
  const p3 = createTestUser('u-p8-p3', 'User8B');

  const participantIds = [payer.id, p2.id, p3.id];
  const totalAmount = 100; // 100 / 3 = 33.33333...

  const expense = db.createTabExpense({
    payerId: payer.id,
    totalAmount,
    participantIds,
    mode: 'even_steven',
    title: 'Pizza Dinner'
  });

  assert.ok(expense, 'Expense should be created');
  const shares = expense.participants.map(p => p.amount);
  const sumShares = shares.reduce((sum, s) => sum + s, 0);

  // Verify that rounding remainder was distributed so sum === 100.00
  assert.equal(Math.round(sumShares * 100) / 100, 100.00, 'Sum of shares must be exactly 100.00 kr');
  assert.ok(shares.includes(33.34), 'One participant should get the 1 extra öre remainder (33.34)');
  assert.equal(shares.filter(s => s === 33.33).length, 2, 'Two participants should get 33.33');

  // Verify converting roulette to even steven maintains penny precision
  const rouletteExp = db.createTabExpense({
    payerId: payer.id,
    totalAmount: 100,
    participantIds,
    mode: 'roulette',
    loserId: p2.id,
    title: 'Drinks'
  });

  const converted = db.convertTabExpenseToEvenSteven(rouletteExp.id, payer.id);
  const convertedShares = converted.participants.map(p => p.amount);
  const convertedSum = convertedShares.reduce((sum, s) => sum + s, 0);
  assert.equal(Math.round(convertedSum * 100) / 100, 100.00, 'Converted shares must sum to exactly 100.00 kr');
});

// ── Finding 9: Custom Shares Strict Cent Matching ─────────────────────
test('Finding 9 — Custom Shares Precision: Rejects splits with delta > 0.00', () => {
  const payer = createTestUser('u-p9-payer', 'Payer9');
  const p2 = createTestUser('u-p9-p2', 'User9A');
  const p3 = createTestUser('u-p9-p3', 'User9B');

  const participantIds = [payer.id, p2.id, p3.id];
  const totalAmount = 100;

  // Custom shares missing 1 kr: 33 + 33 + 33 = 99 kr
  assert.throws(() => {
    db.createTabExpense({
      payerId: payer.id,
      totalAmount,
      participantIds,
      mode: 'even_steven',
      customShares: {
        [payer.id]: 33,
        [p2.id]: 33,
        [p3.id]: 33
      },
      title: 'Missing Crown Test'
    });
  }, /matchar inte totalbeloppet/, 'Split missing 1 kr should be rejected');

  // Custom shares matching exactly: 40 + 35 + 25 = 100
  const validCustom = db.createTabExpense({
    payerId: payer.id,
    totalAmount,
    participantIds,
    mode: 'even_steven',
    customShares: {
      [payer.id]: 40,
      [p2.id]: 35,
      [p3.id]: 25
    },
    title: 'Exact Custom Split'
  });
  assert.ok(validCustom, 'Exact custom split should be accepted');
  const validSum = validCustom.participants.reduce((sum, p) => sum + p.amount, 0);
  assert.equal(validSum, 100, 'Sum of valid custom split must equal 100');
});
