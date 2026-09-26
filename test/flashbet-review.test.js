process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as db from '../server/db.js';

const js = readFileSync(new URL('../src/components/minigames.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const fb = js.slice(js.indexOf('export async function openFlashBetModal('), js.indexOf('export async function openReceiptModal('));

function makeUser(name) {
  const id = crypto.randomUUID();
  db.createUser(id, name + crypto.randomBytes(3).toString('hex'), crypto.randomUUID(), '🙂', name, '07' + String(crypto.randomInt(1e7, 9e7)), '1111');
  return db.getUserById(id);
}

test('a BlixtBet is never public: nobody to ask means it is refused', () => {
  assert.match(server, /if \(targetUserIds\.length === 0\) \{\s+return res\.status\(400\)/);
  assert.match(server, /const storedTargets = targetUserIds;/);
});

test('in an event, everyone in the event is asked (not only your friends)', () => {
  assert.match(server, /const eventPeople = new Set\(db\.getTournamentParticipantUserIds\(tv\.tournament\.id\)\);/);
});

test('stakes are whole kronor; the fake "your own vote" is gone', () => {
  assert.match(server, /const stake = Math\.round\(Math\.max\(5, Math\.min\(5000/);
  assert.doesNotMatch(fb, /Ditt eget val direkt/);
  assert.doesNotMatch(fb, /initialChoice/);
});

test('"no event" really means no event', () => {
  assert.match(fb, /const tournamentId = eventSelect \? \(eventSelect\.value \|\| null\) : null;/);
});

test('settling explains the money first; results stay visible for 12 hours', () => {
  assert.match(fb, /function settlePreview\(fb, winner\)/);
  assert.match(fb, /function renderSettledCard\(fb\)/);

  const host = makeUser('Host'), w = makeUser('Win'), l = makeUser('Lose'), other = makeUser('Other');
  const id = crypto.randomUUID();
  db.createFlashBet(id, host.id, null, 'Putt?', 60, new Date(Date.now() + 60000).toISOString(), 30, [w.id, l.id]);
  db.placeFlashBetEntry(crypto.randomUUID(), id, w.id, 'yes', 30);
  db.placeFlashBetEntry(crypto.randomUUID(), id, l.id, 'no', 30);
  db.settleFlashBet(id, 'yes', host.id);

  const forWinner = db.getActiveFlashBets(w.id).find(x => x.id === id);
  assert.ok(forWinner, 'the winner still sees the result');
  assert.equal(forWinner.settlementSummary.netAmount, 30);
  assert.equal(db.getActiveFlashBets(l.id).find(x => x.id === id).settlementSummary.netAmount, -30);
  assert.ok(db.getActiveFlashBets(host.id).some(x => x.id === id));
  assert.ok(!db.getActiveFlashBets(other.id).some(x => x.id === id), 'outsiders do not see it');
});
