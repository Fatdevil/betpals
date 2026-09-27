process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as db from '../server/db.js';

const r = () => crypto.randomUUID();
function user(prefix) {
  const id = prefix + r();
  db.createUser(id, prefix + r().slice(0, 6), 'tok_' + id, '⛳', prefix, '070' + crypto.randomInt(1000000, 9999999));
  return id;
}
function game(tId, creatorId, name, { closesAt = null, betMode = 'open' } = {}) {
  const id = 'g_' + r();
  db.createEvent({ id, name, shareCode: 'H' + r().replace(/-/g, '').slice(0, 9).toUpperCase(), creatorId, tournamentId: tId, isSideBet: 1, closesAt, betMode }, ['Anna', 'Bosse']);
  return db.getFullEvent(id);
}
const bet = (ev, uid, amount) => db.addBet('b_' + r(), ev.id, 'X', ev.players[0].id, amount, uid);

test('the home card counts only money still in play, and lists up to three open games', () => {
  const host = user('hh');
  const me = user('hm');
  const tId = 'tour_' + r();
  db.createTournament(tId, 'Golfhelg', 'HC' + r().slice(0, 6).toUpperCase(), host, 'friends', [{ name: 'Me', userId: me }]);

  const soon = new Date(Date.now() + 10 * 60000).toISOString();
  const later = new Date(Date.now() + 5 * 3600000).toISOString();
  const done = game(tId, host, 'Avgjort');
  const stopped = game(tId, host, 'Avbrutet');
  const betOn = game(tId, host, 'Redan med', { closesAt: soon });
  const late = game(tId, host, 'Stänger sent', { closesAt: later });
  const early = game(tId, host, 'Stänger snart', { closesAt: soon });
  const noDeadline = game(tId, host, 'Utan spelstopp');
  const closed = game(tId, host, 'Låst');
  bet(done, host, 500);
  bet(stopped, host, 300);
  bet(betOn, me, 50);
  bet(late, host, 20);
  bet(closed, host, 40);
  db.finishEvent(done.id, done.players[0].id);
  db.cancelEvent(stopped.id);
  db.lockEvent(closed.id);

  const card = db.getAllTournaments(me).find(t => t.id === tId);
  assert.equal(card.totalPool, 910, 'everything ever bet, as before');
  assert.equal(card.livePool, 110, 'finished and cancelled games are not "in play"');
  assert.deepEqual(card.upNext.map(g => g.name), ['Stänger snart', 'Stänger sent', 'Utan spelstopp'],
    'games you have not bet on first, closing soonest first');
  assert.equal(card.upNext[1].pool, 20);
  assert.equal(card.openGameCount, 4, 'the locked game is not open');

  // Once everything open has your bet, those show, soonest first, marked as yours
  for (const ev of [late, early, noDeadline]) bet(ev, me, 10);
  const after = db.getAllTournaments(me).find(t => t.id === tId);
  assert.deepEqual(after.upNext.map(g => [g.name, g.hasBet]), [['Redan med', true], ['Stänger snart', true], ['Stänger sent', true]]);
});

test('the card shows the open games and "in play now" instead of the lifetime pot', () => {
  const home = readFileSync(new URL('../src/pages/home.js', import.meta.url), 'utf8');
  assert.match(home, /isActive && tr\.livePool > 0 \? `💰/);
  assert.doesNotMatch(home, /tr\.totalPool > 0/, 'the lifetime pot is gone from the card');
  assert.match(home, /class="home-game-row" data-game-code=/);
  assert.match(home, /navigate\('event', \{ code: row\.dataset\.gameCode \}\)/);
  assert.match(home, /e\.stopPropagation\(\);\s*navigate\('event'/, 'a row opens the game, not the event');
  assert.match(home, /isEn \? \(events\.length === 1 \? 'MATCH' : 'MATCHES'\) : 'SPEL'/);
});

test('the card\'s pools come from one grouped query per event, not one per game', () => {
  const src = readFileSync(new URL('../server/db.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('function summarizeTournaments'), src.indexOf('export function', src.indexOf('function summarizeTournaments')));
  assert.match(fn, /poolsByTournament\.all\(t\.id\)/);
  assert.doesNotMatch(fn, /getTotalPool/, 'no per-game pool query left');
});
