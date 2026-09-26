process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as db from '../server/db.js';

const adminJs = readFileSync(new URL('../src/pages/admin.js', import.meta.url), 'utf8');
const apiJs = readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
const serverJs = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');

const uid = () => crypto.randomUUID();
function makeUser(nick, realName) {
  const id = uid();
  db.createUser(id, nick + crypto.randomBytes(3).toString('hex'), uid(), '🙂', realName, '07' + String(crypto.randomInt(1e7, 9e7)), '1111');
  return db.getUserById(id);
}

test('push to everyone sends the admin PIN (it was always refused with 403)', () => {
  assert.match(apiJs, /getAdminPushStats = \(pin\) => request\('\/admin\/push-stats', \{ headers: \{ 'x-admin-pin'/);
  assert.match(adminJs, /sendAdminBroadcastPush\(\{ title, body, url, pin: getPin\(\) \}\)/);
  assert.doesNotMatch(adminJs, /class="form-control"/);
});

test('admin lists events, not every game of every event as loose matches', () => {
  assert.doesNotMatch(adminJs, /api\.getAllEvents\(\)/);
  assert.doesNotMatch(adminJs, /function showCreateEventModal/);
  assert.match(adminJs, /function renderTournamentCard/);
  assert.match(serverJs, /app\.post\('\/api\/admin\/tournaments', \(req, res\) => \{\s+if \(!requireAdminPin\(req, res\)\) return;/);
});

test('admin escapes names and image links', () => {
  assert.match(adminJs, /<strong>\$\{escapeHtml\(btn\.dataset\.name\)\}<\/strong>/);
  assert.doesNotMatch(adminJs, /<img src="\$\{ev\.imageUrl\}"/);
  assert.doesNotMatch(adminJs, /<img src="\$\{f\.avatarUrl\}"/);
});

test('sharing a real name or a game option name gives no access to a stranger\'s event', () => {
  const host = makeUser('host', 'Host Hostsson');
  const erik1 = makeUser('erik', 'Erik Andersson');
  const erik2 = makeUser('erik', 'Erik Andersson');
  const tId = uid();
  db.createTournament(tId, 'Privat middag', crypto.randomBytes(3).toString('hex').toUpperCase(), host.id, 'friends',
    [{ name: 'Erik Andersson' }]); // guest row that happens to share a real name
  db.createEvent({ id: uid(), name: 'Vem vinner?', tournamentId: tId, isSideBet: true }, ['Erik Andersson', 'Host']);

  const t = db.getTournamentById(tId);
  assert.equal(db.canUserAccessTournament(t, erik1.id), false);
  assert.equal(db.getAllTournaments(erik2.id).some(x => x.id === tId), false);

  db.addFriend(host.id, erik1.id);
  assert.equal(db.canUserAccessTournament(t, erik1.id), true);
});

test('superadmin sees every event with its organiser', () => {
  const host = makeUser('org', 'Org Orgsson');
  const tId = uid();
  db.createTournament(tId, 'Hemligt event', crypto.randomBytes(3).toString('hex').toUpperCase(), host.id, 'friends', []);
  const row = db.getAllTournamentsForAdmin().find(x => x.id === tId);
  assert.ok(row);
  assert.equal(row.creatorName, host.nickname);
});
