import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as db from '../server/db.js';

const home = readFileSync(new URL('../src/pages/home.js', import.meta.url), 'utf8');

test('home event card: tappable, no share code, clear action, ads do not open the event', () => {
  assert.match(home, /class="home-event-card card-clickable/);
  assert.match(home, /class="home-event-chevron"/);
  assert.doesNotMatch(home, /t\('home\.code'\)/);
  assert.match(home, /spel öppna för bets/);
  assert.match(home, /Betta nu/);
  assert.match(home, /\.home-event-sponsors'\)\.forEach\(el => \{\s*el\.addEventListener\('click', e => e\.stopPropagation\(\)\);/);
});

test('tournament list tells how many open games the user has not bet on', () => {
  const stamp = Date.now();
  const host = { id: 'hec-host-' + stamp };
  const friend = { id: 'hec-friend-' + stamp };
  db.createUser(host.id, 'hechost' + stamp, 'hec-token-h-' + stamp, '🎲', 'Host', '0701230001');
  db.createUser(friend.id, 'hecfriend' + stamp, 'hec-token-f-' + stamp, '🎲', 'Friend', '0701230002');
  const tId = 'hec-t-' + stamp;
  db.createTournament(tId, 'Kortets event', 'HEC' + String(stamp).slice(-6), host.id);
  db.addTournamentParticipant(tId, 'Friend', friend.id);
  const mkGame = (suffix) => {
    const id = `hec-e-${suffix}-${stamp}`;
    db.createEvent({ id, name: 'Spel ' + suffix, date: '2026-09-26', status: 'open', shareCode: `H${suffix}${String(stamp).slice(-5)}`, payoutPercent: 100, minBet: 20, maxBet: 200, creatorId: host.id, swishNumber: null, tournamentId: tId, isSideBet: 1, linkedRoundId: null, betMode: 'open', imageUrl: null, closesAt: null }, [{ id: id + '-p1', name: 'A' }, { id: id + '-p2', name: 'B' }]);
    return id;
  };
  const g1 = mkGame('1');
  mkGame('2');
  db.addBet('hec-b-' + stamp, g1, 'Friend', g1 + '-p1', 50, friend.id);

  const mine = db.getAllTournaments(friend.id).find(t => t.id === tId);
  assert.equal(mine.openGameCount, 2);
  assert.equal(mine.openUnbetCount, 1);
  assert.equal(mine.participantCount, 2);
  assert.equal(mine.totalPool, 50);
});
