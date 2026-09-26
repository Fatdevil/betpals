import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/pages/tournament.js', import.meta.url), 'utf8');
const serverSrc = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const form = src.slice(src.indexOf('function showAddGameModal('));

test('new game sheet lists event participants and friends not yet in the event', () => {
  assert.match(form, /\(t\.participants \|\| \[\]\)\.forEach\(p => addPerson\(\{[^}]*selected: true/);
  assert.match(form, /getFriends\(\)\.then\(friends =>/);
  assert.match(form, /inEvent: false, selected: false/);
});

test('picked friends are invited to the event before the game is created', () => {
  const invite = form.indexOf('await inviteFriendsToTournament(t.id');
  const create = form.indexOf('const updated = await createSideBet(t.id, {');
  assert.ok(invite > 0 && invite < create);
});

test('one clean type picker: no numbered titles, no duplicate quick picks', () => {
  assert.match(form, /Vad ska ni betta på\?/);
  assert.doesNotMatch(form, /Snabbval/);
  assert.doesNotMatch(form, /Minsta insats/);
  assert.doesNotMatch(form, /Spelare 1/);
});

test('stake can be fixed or free (min–max), winner-takes-all is always fixed', () => {
  assert.match(form, /data-mode="fixed">Fast</);
  assert.match(form, /data-mode="free">Fri</);
  assert.match(form, /if \(fixedOnly\) state\.stakeMode = 'fixed';/);
  assert.match(serverSrc, /if \(betMode !== 'self' && req\.body\.minBet !== undefined && req\.body\.maxBet !== undefined\)/);
});

test('1X2 builds name and options from the two teams', () => {
  assert.match(form, /players = \[`1 \$\{home\}`, 'X Oavgjort', `2 \$\{away\}`\];/);
});
