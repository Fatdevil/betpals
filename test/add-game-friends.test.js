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
