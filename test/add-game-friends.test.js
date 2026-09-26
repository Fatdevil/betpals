import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tournamentSource = readFileSync(new URL('../src/pages/tournament.js', import.meta.url), 'utf8');

test('add-game form fetches the friend list fresh every time the picker opens', () => {
  const start = tournamentSource.indexOf("getElementById('game-pick-friends-btn')");
  assert.ok(start > 0, 'friend picker button must exist');
  const handler = tournamentSource.slice(start, tournamentSource.indexOf('function applyGameType', start));
  assert.match(handler, /friends = await getFriends\(\);/);
  assert.doesNotMatch(handler, /friendsLoaded/);
});

test('friends picked for a game are invited to the event before the game is created', () => {
  const invite = tournamentSource.indexOf('await inviteFriendsToTournament(t.id, inviteIds, pin)');
  const create = tournamentSource.indexOf('const updated = await createSideBet(t.id, {');
  assert.ok(invite > 0 && invite < create);
});

test('add-game form separates "in the game" from the friend list', () => {
  assert.match(tournamentSource, /id="game-player-heading"/);
  assert.match(tournamentSource, /✅ Med i spelet/);
  assert.match(tournamentSource, /Förifyllt med eventets deltagare/);
  assert.match(tournamentSource, /👥 Lägg till fler från vänlistan/);
});

test('friend picker lists friends not yet in the game first and gets a search box for long lists', () => {
  assert.match(tournamentSource, /\.sort\(\(a, b\) => \(a\.added - b\.added\) \|\| \(a\.i - b\.i\)\)/);
  assert.match(tournamentSource, /if \(friends\.length > 10\) friendsSearch\.style\.display = 'block';/);
});
