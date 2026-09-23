import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

function makeUser(nickname, realName, swish) {
  const id = crypto.randomUUID();
  const token = 'tok_' + id;
  db.createUser(id, nickname, token, '🏒', realName, swish);
  return db.getUserById(id);
}

test('Löven Game — Lifecycle, 4-3-2p Scoring, Tie-Splitting & THE TAB Integration', async (t) => {

  await t.test('1. Create Löven Game', () => {
    const creator = makeUser('Creator1_' + Date.now(), 'Lars Löven', '0701111111');
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const game = db.createLovenGame({
      creatorId: creator.id,
      opponentTeam: 'MoDo Hockey',
      isHome: 1,
      matchDate: futureDate,
      stakeAmount: 50
    });

    assert.ok(game.id, 'Game should have an ID');
    assert.equal(game.creator_id, creator.id);
    assert.equal(game.opponent_team, 'MoDo Hockey');
    assert.equal(game.is_home, true);
    assert.equal(game.stake_amount, 50);
    assert.equal(game.status, 'open');
  });

  await t.test('2. Submit Tips (Predictions)', () => {
    const creator = makeUser('Creator2_' + Date.now(), 'Lars Löven', '0701111112');
    const playerA = makeUser('PelleA2_' + Date.now(), 'Pelle Andersson', '0702222222');
    const playerB = makeUser('BosseB2_' + Date.now(), 'Bosse Bengtsson', '0703333333');
    const playerC = makeUser('CalleC2_' + Date.now(), 'Calle Carlsson', '0704444444');

    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const game = db.createLovenGame({
      creatorId: creator.id,
      opponentTeam: 'Djurgårdens IF',
      isHome: 1,
      matchDate: futureDate,
      stakeAmount: 50
    });

    // Player A tips: 4-2, #32 Lucas Wallmark, 31 shots
    db.submitLovenEntry(game.id, playerA.id, {
      predLovenGoals: 4,
      predOpponentGoals: 2,
      predLastScorer: '#32 Lucas Wallmark',
      predShotsOnGoal: 31
    });

    // Player B tips: 3-1, Lucas Wallmark, 34 shots
    db.submitLovenEntry(game.id, playerB.id, {
      predLovenGoals: 3,
      predOpponentGoals: 1,
      predLastScorer: 'Lucas Wallmark',
      predShotsOnGoal: 34
    });

    // Player C tips: 1-4, Marcus Nilsson, 20 shots
    db.submitLovenEntry(game.id, playerC.id, {
      predLovenGoals: 1,
      predOpponentGoals: 4,
      predLastScorer: 'Marcus Nilsson',
      predShotsOnGoal: 20
    });

    const updated = db.getLovenGame(game.id);
    assert.equal(updated.entries.length, 3);
  });

  await t.test('3. Settle Authorization: Non-creator cannot settle', () => {
    const creator = makeUser('Creator3_' + Date.now(), 'Lars Löven', '0701111113');
    const playerA = makeUser('PelleA3_' + Date.now(), 'Pelle Andersson', '0702222223');
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const game = db.createLovenGame({
      creatorId: creator.id,
      opponentTeam: 'AIK',
      isHome: 0,
      matchDate: futureDate,
      stakeAmount: 50
    });

    assert.throws(() => {
      db.settleLovenGame(game.id, {
        resultLovenGoals: 3,
        resultOpponentGoals: 1,
        resultLastScorer: 'Lucas Wallmark',
        resultShotsOnGoal: 30
      }, playerA.id, false);
    }, /Endast skaparen kan rätta/);
  });

  await t.test('4. Settle Match with 4-3-2 Scoring Rules (Single Winner)', () => {
    const creator = makeUser('Creator4_' + Date.now(), 'Lars Löven', '0701111114');
    const playerA = makeUser('PelleA4_' + Date.now(), 'Pelle Andersson', '0702222224');
    const playerB = makeUser('BosseB4_' + Date.now(), 'Bosse Bengtsson', '0703333334');
    const playerC = makeUser('CalleC4_' + Date.now(), 'Calle Carlsson', '0704444444');

    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const game = db.createLovenGame({
      creatorId: creator.id,
      opponentTeam: 'Södertälje SK',
      isHome: 1,
      matchDate: futureDate,
      stakeAmount: 50
    });

    // Player A: Q1: 4-2 (exact), Q2: Lucas Wallmark (correct), Q3: 28 (diff 5 from 33)
    // Points = 4 + 3 + 0 = 7p
    db.submitLovenEntry(game.id, playerA.id, {
      predLovenGoals: 4,
      predOpponentGoals: 2,
      predLastScorer: 'Lucas Wallmark',
      predShotsOnGoal: 28
    });

    // Player B: Q1: 2-1 (wrong), Q2: Axel Ottosson (wrong), Q3: 32 (diff 1 from 33 -> closest!)
    // Points = 0 + 0 + 2 = 2p
    db.submitLovenEntry(game.id, playerB.id, {
      predLovenGoals: 2,
      predOpponentGoals: 1,
      predLastScorer: 'Axel Ottosson',
      predShotsOnGoal: 32
    });

    // Player C: Q1: 0-3 (wrong), Q2: Emil Alba (wrong), Q3: 22 (diff 11)
    // Points = 0 + 0 + 0 = 0p
    db.submitLovenEntry(game.id, playerC.id, {
      predLovenGoals: 0,
      predOpponentGoals: 3,
      predLastScorer: 'Emil Alba',
      predShotsOnGoal: 22
    });

    // Actual result: Löven 4 - 2 SSK, Last Scorer: #32 Lucas Wallmark, Shots: 33
    const settled = db.settleLovenGame(game.id, {
      resultLovenGoals: 4,
      resultOpponentGoals: 2,
      resultLastScorer: '#32 Lucas Wallmark',
      resultShotsOnGoal: 33
    }, creator.id);

    assert.equal(settled.status, 'settled');
    assert.deepEqual(settled.winner_user_ids, [playerA.id]);

    const entryA = settled.entries.find(e => e.user_id === playerA.id);
    const entryB = settled.entries.find(e => e.user_id === playerB.id);
    const entryC = settled.entries.find(e => e.user_id === playerC.id);

    assert.equal(entryA.pts_result, 4, 'Player A got 4p for exact result');
    assert.equal(entryA.pts_scorer, 3, 'Player A got 3p for last scorer');
    assert.equal(entryA.pts_shots, 0, 'Player A did not get shots pts');
    assert.equal(entryA.points, 7);
    assert.equal(entryA.is_winner, 1);

    assert.equal(entryB.pts_result, 0);
    assert.equal(entryB.pts_scorer, 0);
    assert.equal(entryB.pts_shots, 2, 'Player B got 2p for being closest to 33 shots (32 vs 33)');
    assert.equal(entryB.points, 2);
    assert.equal(entryB.is_winner, 0);

    assert.equal(entryC.points, 0);
    assert.equal(entryC.is_winner, 0);

    // Verify THE TAB settlement debts created for playerB and playerC to playerA
    const summaryA = db.getDuelSettlementSummary(playerA.id);
    const friendB = summaryA.friends.find(f => f.friendId === playerB.id);
    const friendC = summaryA.friends.find(f => f.friendId === playerC.id);

    assert.ok(friendB, 'Player B should have a settlement debt to Player A');
    assert.ok(friendC, 'Player C should have a settlement debt to Player A');
    assert.equal(friendB.netAmount, 50, 'Player B owes Player A 50 kr');
    assert.equal(friendC.netAmount, 50, 'Player C owes Player A 50 kr');
  });

  await t.test('5. Tie-Breaker: Split Pot Even Steven between multiple winners', () => {
    const creator = makeUser('Creator5_' + Date.now(), 'Lars Löven', '0701111115');
    const playerA = makeUser('PelleA5_' + Date.now(), 'Pelle Andersson', '0702222225');
    const playerB = makeUser('BosseB5_' + Date.now(), 'Bosse Bengtsson', '0703333335');
    const playerC = makeUser('CalleC5_' + Date.now(), 'Calle Carlsson', '0704444445');

    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const game = db.createLovenGame({
      creatorId: creator.id,
      opponentTeam: 'Mora IK',
      isHome: 1,
      matchDate: futureDate,
      stakeAmount: 50
    });

    // Player A: 4p (result)
    db.submitLovenEntry(game.id, playerA.id, {
      predLovenGoals: 5,
      predOpponentGoals: 1,
      predLastScorer: 'Marcus Nilsson',
      predShotsOnGoal: 20
    });

    // Player B: 4p (result)
    db.submitLovenEntry(game.id, playerB.id, {
      predLovenGoals: 5,
      predOpponentGoals: 1,
      predLastScorer: 'Marcus Björk',
      predShotsOnGoal: 20
    });

    // Player C: 0p
    db.submitLovenEntry(game.id, playerC.id, {
      predLovenGoals: 1,
      predOpponentGoals: 3,
      predLastScorer: 'Alfred Barklund',
      predShotsOnGoal: 15
    });

    // Actual result: Löven 5 - 1 Mora, Last scorer: Lucas Wallmark, Shots: 40
    const settled = db.settleLovenGame(game.id, {
      resultLovenGoals: 5,
      resultOpponentGoals: 1,
      resultLastScorer: 'Lucas Wallmark',
      resultShotsOnGoal: 40
    }, creator.id);

    assert.equal(settled.winner_user_ids.length, 2);
    assert.ok(settled.winner_user_ids.includes(playerA.id));
    assert.ok(settled.winner_user_ids.includes(playerB.id));

    // Player C owes 50 kr split between 2 winners: 25 kr to A, 25 kr to B!
    const summaryC = db.getDuelSettlementSummary(playerC.id);
    const debtToA = summaryC.friends.find(f => f.friendId === playerA.id);
    const debtToB = summaryC.friends.find(f => f.friendId === playerB.id);

    assert.ok(debtToA);
    assert.ok(debtToB);
    assert.equal(debtToA.netAmount, -25, 'Player C owes 25 kr to Winner A');
    assert.equal(debtToB.netAmount, -25, 'Player C owes 25 kr to Winner B');
  });

  await t.test('6. Shutout (Nollade) Match Handling', () => {
    const creator = makeUser('Creator6_' + Date.now(), 'Lars Löven', '0701111116');
    const playerA = makeUser('PelleA6_' + Date.now(), 'Pelle Andersson', '0702222226');

    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const game = db.createLovenGame({
      creatorId: creator.id,
      opponentTeam: 'BIK Karlskoga',
      isHome: 0,
      matchDate: futureDate,
      stakeAmount: 20
    });

    db.submitLovenEntry(game.id, playerA.id, {
      predLovenGoals: 0,
      predOpponentGoals: 3,
      predLastScorer: 'Inga mål (Löven nollade)',
      predShotsOnGoal: 25
    });

    const settled = db.settleLovenGame(game.id, {
      resultLovenGoals: 0,
      resultOpponentGoals: 3,
      resultLastScorer: 'Inga mål',
      resultShotsOnGoal: 25
    }, creator.id);

    const entryA = settled.entries.find(e => e.user_id === playerA.id);
    assert.equal(entryA.pts_result, 4);
    assert.equal(entryA.pts_scorer, 3, 'Matches Inga mål correctly');
    assert.equal(entryA.pts_shots, 2);
    assert.equal(entryA.points, 9, 'Max 9 points achieved');
  });

  await t.test('7. Cancelled match is terminal — cannot settle, lock or re-cancel', () => {
    const creator = makeUser('Creator7_' + Date.now(), 'Lars Löven', '0701111117');
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const game = db.createLovenGame({
      creatorId: creator.id,
      opponentTeam: 'Almtuna IS',
      isHome: 1,
      matchDate: futureDate,
      stakeAmount: 20
    });

    const cancelled = db.cancelLovenGame(game.id, creator.id);
    assert.equal(cancelled.status, 'cancelled');

    // Attempting to settle a cancelled game must throw
    assert.throws(() => {
      db.settleLovenGame(game.id, {
        resultLovenGoals: 3,
        resultOpponentGoals: 2,
        resultLastScorer: 'Lucas Wallmark',
        resultShotsOnGoal: 30
      }, creator.id);
    }, /Endast öppna eller låsta matcher kan rättas/);

    // Attempting to lock a cancelled game must throw
    assert.throws(() => {
      db.lockLovenGame(game.id, creator.id);
    }, /Endast öppna matcher kan låsas/);

    // Attempting to re-cancel must throw
    assert.throws(() => {
      db.cancelLovenGame(game.id, creator.id);
    }, /Endast öppna eller låsta matcher kan avbrytas/);
  });

  await t.test('8. Settled match is terminal — cannot lock or cancel', () => {
    const creator = makeUser('Creator8_' + Date.now(), 'Lars Löven', '0701111118');
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const game = db.createLovenGame({
      creatorId: creator.id,
      opponentTeam: 'Tingsryds AIF',
      isHome: 1,
      matchDate: futureDate,
      stakeAmount: 0
    });

    db.settleLovenGame(game.id, {
      resultLovenGoals: 2,
      resultOpponentGoals: 1,
      resultLastScorer: 'Axel Ottosson',
      resultShotsOnGoal: 28
    }, creator.id);

    // Locking settled game must throw
    assert.throws(() => {
      db.lockLovenGame(game.id, creator.id);
    }, /Endast öppna matcher kan låsas/);

    // Cancelling settled game must throw
    assert.throws(() => {
      db.cancelLovenGame(game.id, creator.id);
    }, /Endast öppna eller låsta matcher kan avbrytas/);
  });

  await t.test('9. Future date and input validation', () => {
    const creator = makeUser('Creator9_' + Date.now(), 'Lars Löven', '0701111119');
    const pastDate = new Date(Date.now() - 3600000).toISOString();

    // Rejects past date
    assert.throws(() => {
      db.createLovenGame({
        creatorId: creator.id,
        opponentTeam: 'Vimmerby HC',
        isHome: 1,
        matchDate: pastDate,
        stakeAmount: 20
      });
    }, /giltigt datum i framtiden/);

    // Rejects invalid date string
    assert.throws(() => {
      db.createLovenGame({
        creatorId: creator.id,
        opponentTeam: 'Vimmerby HC',
        isHome: 1,
        matchDate: 'not-a-date',
        stakeAmount: 20
      });
    }, /giltigt datum i framtiden/);

    const validDate = new Date(Date.now() + 3600000).toISOString();
    const validGame = db.createLovenGame({
      creatorId: creator.id,
      opponentTeam: 'Vimmerby HC',
      isHome: 1,
      matchDate: validDate,
      stakeAmount: 20
    });

    // Rejects missing goals
    assert.throws(() => {
      db.submitLovenEntry(validGame.id, creator.id, {
        predLastScorer: 'Lucas Wallmark',
        predShotsOnGoal: 30
      });
    }, /Ange Lövens mål/);

    // Rejects missing shots
    assert.throws(() => {
      db.submitLovenEntry(validGame.id, creator.id, {
        predLovenGoals: 3,
        predOpponentGoals: 2,
        predLastScorer: 'Lucas Wallmark'
      });
    }, /Ange skott på mål/);

    // Rejects missing scorer
    assert.throws(() => {
      db.submitLovenEntry(validGame.id, creator.id, {
        predLovenGoals: 3,
        predOpponentGoals: 2,
        predLastScorer: '',
        predShotsOnGoal: 30
      });
    }, /Välj eller ange sista målskytt/);
  });

  await t.test('10. Robust scorer matching (surnames, accents & shutout tokens)', () => {
    assert.equal(db.isScorerMatch('Wallmark', '#32 Lucas Wallmark'), true, 'Surname alone matches full name with number');
    assert.equal(db.isScorerMatch('#32 Lucas Wallmark', 'Wallmark'), true, 'Full name matches surname alone');
    assert.equal(db.isScorerMatch('Topi Niemela', 'Topi Niemelä'), true, 'Matches despite accent difference (e vs ä)');
    assert.equal(db.isScorerMatch('Reunanen', '#11 Tarmo Reunanen'), true, 'Reunanen matches #11 Tarmo Reunanen');
    assert.equal(db.isScorerMatch('0 mål', 'Inga mål (Löven nollade)'), true, 'Shutout token 0 mål matches Inga mål');
    assert.equal(db.isScorerMatch('Nollade', 'inga mål'), true, 'Nollade matches inga mål');
    assert.equal(db.isScorerMatch('Lucas Wallmark', 'Marcus Nilsson'), false, 'Different players do not match');
  });

  await t.test('11. THE TAB multi-winner zero-sum settlement and receipt clearing', () => {
    const creator = makeUser('Creator11_' + Date.now(), 'Lars Löven', '0701111120');
    const p1 = makeUser('Winner1_' + Date.now(), 'Anna Vinnare', '0701111121');
    const p2 = makeUser('Winner2_' + Date.now(), 'Bengt Vinnare', '0701111122');
    const p3 = makeUser('Winner3_' + Date.now(), 'Clara Vinnare', '0701111123');
    const loser = makeUser('Loser1_' + Date.now(), 'David Förlorare', '0701111124');

    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const game = db.createLovenGame({
      creatorId: creator.id,
      opponentTeam: 'Kalmar HC',
      isHome: 1,
      matchDate: futureDate,
      stakeAmount: 30
    });

    // 3 winners with 4p each (exact score 4-1)
    db.submitLovenEntry(game.id, p1.id, { predLovenGoals: 4, predOpponentGoals: 1, predLastScorer: 'Wallmark', predShotsOnGoal: 20 });
    db.submitLovenEntry(game.id, p2.id, { predLovenGoals: 4, predOpponentGoals: 1, predLastScorer: 'Nilsson', predShotsOnGoal: 20 });
    db.submitLovenEntry(game.id, p3.id, { predLovenGoals: 4, predOpponentGoals: 1, predLastScorer: 'Ottosson', predShotsOnGoal: 20 });

    // 1 loser with 0p
    db.submitLovenEntry(game.id, loser.id, { predLovenGoals: 1, predOpponentGoals: 5, predLastScorer: 'Alba', predShotsOnGoal: 45 });

    // Result: 4 - 1, shots 30 (everyone equally diff 10, but 3 winners got 4p from result)
    const settled = db.settleLovenGame(game.id, {
      resultLovenGoals: 4,
      resultOpponentGoals: 1,
      resultLastScorer: 'Marcus Björk',
      resultShotsOnGoal: 30
    }, creator.id);

    assert.equal(settled.winner_user_ids.length, 3);
    assert.ok(settled.winner_user_ids.includes(p1.id));
    assert.ok(settled.winner_user_ids.includes(p2.id));
    assert.ok(settled.winner_user_ids.includes(p3.id));

    // Check summaries in THE TAB
    const sP1 = db.getDuelSettlementSummary(p1.id);
    const sP2 = db.getDuelSettlementSummary(p2.id);
    const sP3 = db.getDuelSettlementSummary(p3.id);
    const sLoser = db.getDuelSettlementSummary(loser.id);

    // Stake 30 kr / 3 winners = 10 kr each
    assert.equal(sP1.totalNet, 10, 'Winner 1 is owed 10 kr');
    assert.equal(sP2.totalNet, 10, 'Winner 2 is owed 10 kr');
    assert.equal(sP3.totalNet, 10, 'Winner 3 is owed 10 kr');
    assert.equal(sLoser.totalNet, -30, 'Loser owes 30 kr total');

    const sumNets = sP1.totalNet + sP2.totalNet + sP3.totalNet + sLoser.totalNet;
    assert.equal(sumNets, 0, 'Sum of all nets in THE TAB is exactly 0 kr');

    // Settle debt between Winner 1 and Loser (Swish payment verified)
    db.settleDuelsBetweenUsers(p1.id, loser.id);
    const sP1After = db.getDuelSettlementSummary(p1.id);
    const sLoserAfter = db.getDuelSettlementSummary(loser.id);

    assert.equal(sP1After.totalNet, 0, 'Winner 1 is fully settled');
    assert.equal(sLoserAfter.totalNet, -20, 'Loser now owes remaining 20 kr (10 kr to p2, 10 kr to p3)');
  });

  await t.test('12. settleLovenGame avvisar ogiltiga resultatvärden', () => {
    const creator = makeUser('Creator12_' + Date.now(), 'Test Krea', '07012test');
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const game = db.createLovenGame({
      creatorId: creator.id,
      opponentTeam: 'Ogiltighets HC',
      isHome: 1,
      matchDate: futureDate,
      stakeAmount: 0
    });
    assert.throws(() => db.settleLovenGame(game.id, {
      resultLovenGoals: 'abc', resultOpponentGoals: 1, resultLastScorer: 'X', resultShotsOnGoal: 20
    }, creator.id), /heltal/, 'Sträng som mål ska ge valideringsfel');
    assert.throws(() => db.settleLovenGame(game.id, {
      resultLovenGoals: -1, resultOpponentGoals: 1, resultLastScorer: 'X', resultShotsOnGoal: 20
    }, creator.id), /heltal|mellan/, 'Negativt mål ska ge valideringsfel');
    assert.throws(() => db.settleLovenGame(game.id, {
      resultLovenGoals: Infinity, resultOpponentGoals: 1, resultLastScorer: 'X', resultShotsOnGoal: 20
    }, creator.id), /heltal/, 'Infinity ska ge valideringsfel');
    assert.throws(() => db.settleLovenGame(game.id, {
      resultLovenGoals: 2.5, resultOpponentGoals: 1, resultLastScorer: 'X', resultShotsOnGoal: 20
    }, creator.id), /heltal/, 'Decimaltal ska ge valideringsfel');
    assert.throws(() => db.settleLovenGame(game.id, {
      resultLovenGoals: 999, resultOpponentGoals: 1, resultLastScorer: 'X', resultShotsOnGoal: 20
    }, creator.id), /mellan/, 'Värde utanför intervall ska ge valideringsfel');
    assert.throws(() => db.settleLovenGame(game.id, {
      resultLovenGoals: 3, resultOpponentGoals: 1, resultLastScorer: null, resultShotsOnGoal: 20
    }, creator.id), /målskytt/, 'Null-scorer ska ge valideringsfel');
  });

  await t.test('13. submitLovenEntry rådata saknar swish_number efter SQL-fix', () => {
    const creator = makeUser('Creator13_' + Date.now(), 'Skapare Tre', '070013x');
    const playerA = makeUser('PlayerA13_' + Date.now(), 'Spelare A13', '070013a');
    const playerB = makeUser('PlayerB13_' + Date.now(), 'Spelare B13', '070013b');
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const game = db.createLovenGame({
      creatorId: creator.id,
      opponentTeam: 'Maskeringstest HC',
      isHome: 1,
      matchDate: futureDate,
      stakeAmount: 10
    });
    db.submitLovenEntry(game.id, playerA.id, {
      predLovenGoals: 3, predOpponentGoals: 1, predLastScorer: 'Hemligt Wallmark', predShotsOnGoal: 30
    });
    const rawFromDb = db.submitLovenEntry(game.id, playerB.id, {
      predLovenGoals: 2, predOpponentGoals: 0, predLastScorer: 'Mitt Eget Tips', predShotsOnGoal: 25
    });
    const entryA = rawFromDb.entries.find(e => e.user_id === playerA.id);
    assert.ok(entryA, 'Entry för playerA finns i råsvaret från db-lagret');
    assert.ok(!('swish_number' in entryA), 'swish_number ska inte finnas i entry-objektet efter SQL-fix');
    assert.ok(typeof entryA.pred_loven_goals === 'number', 'DB-lagret exponerar rådata: maskeringen sker i server.js/sanitizeLovenGame');
  });

});
