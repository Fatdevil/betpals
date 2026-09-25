import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../server/db.js';
import { parseDateSafe, formatDeadline, formatDate, formatTime } from '../src/utils.js';

test('Apple / Mobile date parsing & deadline tests', () => {
  // Safari WebKit fails on "YYYY-MM-DD HH:mm:ss", parseDateSafe must handle it cleanly
  const sqlDate = '2026-09-25 20:00:00';
  const parsed = parseDateSafe(sqlDate);
  assert.ok(parsed instanceof Date);
  assert.equal(isNaN(parsed.getTime()), false);

  const isoDate = '2026-09-25T20:00:00.000Z';
  const parsedIso = parseDateSafe(isoDate);
  assert.ok(parsedIso instanceof Date);
  assert.equal(isNaN(parsedIso.getTime()), false);

  assert.equal(parseDateSafe(null), null);
  assert.equal(parseDateSafe(undefined), null);
  assert.equal(parseDateSafe(''), null);
  assert.equal(parseDateSafe('not-a-date'), null);

  // formatDeadline with ISO format must work
  const futureIsoDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const dl = formatDeadline(futureIsoDate);
  assert.ok(dl !== null, 'formatDeadline must not return null for valid future date');
  assert.equal(dl.isExpired, false);
  assert.ok(dl.text.includes('min kvar'));

  // formatDeadline with space separator and Z (or UTC)
  const futureSpaceDate = futureIsoDate.replace('T', ' ');
  const dl2 = formatDeadline(futureSpaceDate);
  assert.ok(dl2 !== null, 'formatDeadline must not return null for space-separated date');
  assert.equal(dl2.isExpired, false);

  // formatDeadline expired
  const pastSqlDate = '2020-01-01 12:00:00';
  const dlExpired = formatDeadline(pastSqlDate);
  assert.ok(dlExpired !== null);
  assert.equal(dlExpired.isExpired, true);

  // formatDate and formatTime must work with SQL format
  const formattedD = formatDate('2026-09-25 12:30:00');
  assert.ok(formattedD.includes('2026') || formattedD.includes('sep'));
  const formattedT = formatTime('2026-09-25 12:30:00');
  assert.ok(formattedT.includes(':'));
});

test('Database event summaries include tournament events by default', () => {
  const summaries = db.getEventSummaries(true);
  assert.ok(Array.isArray(summaries));
  assert.ok(summaries.length > 0, 'There should be event summaries');
});

test('Public access to GET /api/events and GET /api/events/:code without authentication', async () => {
  process.env.NODE_ENV = 'test';
  const { server } = await import('../server/server.js');
  if (!server.listening) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  }
  const base = `http://127.0.0.1:${server.address().port}`;

  // Create a clean open event
  const testEventId = 'apple_test_' + Date.now();
  const testCode = 'APL' + Math.floor(Math.random() * 900 + 100);
  const p1Id = 'p1_' + Date.now();
  const p2Id = 'p2_' + Date.now();
  db.createEvent({
    id: testEventId,
    name: 'Apple Mobile Test Event',
    date: new Date().toISOString().split('T')[0],
    status: 'open',
    shareCode: testCode,
    payoutPercent: 100,
    minBet: 10,
    maxBet: 1000,
    creatorId: null,
    swishNumber: '0701234567',
    tournamentId: null,
    isSideBet: 0,
    linkedRoundId: null,
    betMode: 'open',
    imageUrl: null,
    closesAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  }, [
    { id: p1Id, name: 'Spelare A' },
    { id: p2Id, name: 'Spelare B' }
  ]);

  // 1. GET /api/events without auth header
  const eventsRes = await fetch(`${base}/api/events`);
  assert.equal(eventsRes.status, 200);
  assert.ok(eventsRes.headers.get('cache-control')?.includes('no-store'));
  const events = await eventsRes.json();
  assert.ok(Array.isArray(events));
  assert.ok(events.some(e => e.shareCode === testCode), 'Should include newly created event in public list');

  // 2. GET /api/events/:code without auth header
  const singleRes = await fetch(`${base}/api/events/${testCode}`);
  assert.equal(singleRes.status, 200);
  assert.ok(singleRes.headers.get('cache-control')?.includes('no-store'));
  const eventDetails = await singleRes.json();
  assert.equal(eventDetails.shareCode, testCode);
  assert.equal(eventDetails.players.length, 2);

  // 3. Placing bet without auth MUST still be rejected (401)
  const betRes = await fetch(`${base}/api/events/${testCode}/bets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: p1Id, amount: 20 })
  });
  assert.equal(betRes.status, 401, 'Placing bet without authentication must be rejected');

  server.close();
});

