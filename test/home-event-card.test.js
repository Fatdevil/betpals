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

test('Enter on a game row opens only the game, not the event first', () => {
  const home = readFileSync(new URL('../src/pages/home.js', import.meta.url), 'utf8');
  assert.match(home, /if \(e\.key === 'Enter' && e\.target === card\) navigate\('tournament'/);
});

test('yellow "bet" lives on the game rows only; "Visa alla ›" in the heading, no big button', () => {
  const home = readFileSync(new URL('../src/pages/home.js', import.meta.url), 'utf8');
  assert.match(home, /sectionHead\(isEn \? 'Open games' : 'Öppna spel', tr\.openGameCount, true\)/);
  assert.match(home, /'See all' : 'Visa alla'\} ›/);
  assert.doesNotMatch(home, /Bet now|Betta nu|Alla spel i eventet/, 'no big button that only opens the event');
  assert.match(home, /\} else if \(gamesHtml\) \{\s*action = '';/, 'no footer row under the game rows');
});

test('closed games you are in wait for their result with what you bet; your standing sits in the info line', () => {
  const host = user('wh');
  const me = user('wm');
  const tId = 'tour_' + r();
  db.createTournament(tId, 'Golfhelg', 'HW' + r().slice(0, 6).toUpperCase(), host, 'friends', [{ name: 'Me', userId: me }]);
  const locked = game(tId, host, 'Vem vinner rundan?');
  const expired = game(tId, host, 'Längsta drive', { closesAt: new Date(Date.now() - 60000).toISOString() });
  const notMine = game(tId, host, 'Inte min');
  const done = game(tId, host, 'Klart');
  db.addBet('b_' + r(), locked.id, 'Me', locked.players[1].id, 30, me);
  db.addBet('b_' + r(), locked.id, 'Me', locked.players[1].id, 20, me);
  bet(expired, me, 10);
  bet(notMine, host, 40);
  bet(done, me, 50);
  db.lockEvent(locked.id);
  db.lockEvent(notMine.id);
  db.finishEvent(done.id, done.players[0].id);

  const card = db.getAllTournaments(me).find(t => t.id === tId);
  assert.equal(card.waitingCount, 2, 'only closed, unsettled games you are in');
  const byName = Object.fromEntries(card.waiting.map(w => [w.name, w]));
  assert.deepEqual(Object.keys(byName).sort(), ['Längsta drive', 'Vem vinner rundan?']);
  assert.deepEqual([byName['Vem vinner rundan?'].label, byName['Vem vinner rundan?'].stake], ['Bosse', 50], 'two bets on one option, one line');
  assert.equal(byName['Längsta drive'].label, 'Anna');

  const home = readFileSync(new URL('../src/pages/home.js', import.meta.url), 'utf8');
  assert.match(home, /class="home-game-row is-waiting"/);
  assert.match(home, /'Your bet' : 'Ditt bet'\}: \$\{escapeHtml\(g\.label\)\}/);
  assert.match(home, /class="home-event-me /, '"Du: +50 kr" in the info line, not a box');
  assert.doesNotMatch(home, /home-event-standing/);
});

test('the event page shows your standing at the top and marks your row in the settlement', () => {
  const t = readFileSync(new URL('../src/pages/tournament.js', import.meta.url), 'utf8');
  assert.match(t, /id="event-my-standing-btn"/);
  assert.match(t, /getElementById\('net-settlement'\)\?\.scrollIntoView/);
  assert.match(t, /<span class="swish-me">\(du\)<\/span>/);
  assert.match(t, /av \$\{t\.settlement\.totalSideBets \?\? t\.settlement\.totalRounds\} spel/, 'no "0 av 0 ronder"');
});
