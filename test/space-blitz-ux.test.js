import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/components/minigames.js', import.meta.url), 'utf8');
const engine = js.slice(js.indexOf('function initSpaceEngine({ onGameOver })'), js.indexOf('// ── 13. Is it a Gimme?'));
const modal = js.slice(js.indexOf('export function openSpaceInvadersModal('), js.indexOf('function initSpaceEngine({ onGameOver })'));

test('the game runs at the same speed on every screen (frame-time scaled)', () => {
  assert.match(engine, /const dt = lastFrameAt === null \? 1 : Math\.min\(3, \(now - lastFrameAt\) \/ \(1000 \/ 60\)\);/);
  assert.match(engine, /b\.y -= b\.speed \* dt;/);
  assert.match(engine, /alienMoveTimer \+= dt;/);
  assert.doesNotMatch(engine, /alienMoveTimer\+\+;/);
});

test('the canvas is drawn at the screen pixel density', () => {
  assert.match(engine, /canvas\.width = width \* dpr;/);
  assert.match(engine, /ctx\.setTransform\(dpr, 0, 0, dpr, 0, 0\);/);
});

test('no dead "1v1" tab, no promise of chips, and losers pay on The Tab', () => {
  assert.doesNotMatch(modal, /data-tab="duel"/);
  assert.doesNotMatch(modal, /Tjäna Chips/);
  assert.doesNotMatch(modal, /winner\.swishNumber/);
  assert.match(modal, /btn-space-goto-tab/);
});

import crypto from 'node:crypto';
process.env.NODE_ENV = 'test';
const db = await import('../server/db.js');
const server = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');

function makeUser(name) {
  const id = crypto.randomUUID();
  db.createUser(id, name + crypto.randomBytes(3).toString('hex'), crypto.randomUUID(), '🙂', name, '07' + String(crypto.randomInt(1e7, 9e7)), '1111');
  return db.getUserById(id);
}

test('solo leaderboard: keeps your best and shows only you and your friends', () => {
  const me = makeUser('Me'), friend = makeUser('Friend'), stranger = makeUser('Stranger');
  db.addFriend(me.id, friend.id);
  assert.equal(db.recordSpaceSoloScore(me.id, 900, 2).isNewBest, true);
  assert.equal(db.recordSpaceSoloScore(me.id, 500, 1).isNewBest, false);
  db.recordSpaceSoloScore(friend.id, 1200, 2);
  db.recordSpaceSoloScore(stranger.id, 5000, 4);
  const lb = db.getSpaceSoloLeaderboard(me.id);
  assert.equal(lb.myBest, 900);
  assert.deepEqual(lb.players.map(p => p.userId), [friend.id, me.id]);
});

test('solo scores need a server-timed round, used once, checked against the real time', () => {
  const route = server.slice(server.indexOf("app.post('/api/space/solo-score'"), server.indexOf("app.get('/api/space/leaderboard'"));
  assert.match(route, /spaceSoloRounds\.delete\(roundId\);/);
  assert.match(route, /const elapsedMs = Date\.now\(\) - round\.startedAt;/);
  assert.match(route, /spaceBlitzImplausibilityReason\(\{ score, aliensKilled, wave: waveReached, elapsedMs \}\)/);
});

test('a new player in a finished room reopens the lobby; spectators poll; clock offset is measured', () => {
  assert.match(server, /if \(!player && room\.status === 'completed'\) \{\s+\/\/[^\n]*\n\s+room\.status = 'lobby';/);
  assert.match(modal, /pollForPartyResult\(\);\n\s+return;/);
  assert.match(modal, /offset: r\.now \+ rtt \/ 2 - receivedAt/);
});

test('rounds count down to the server start time; ties are decided by the host', () => {
  assert.match(server, /startTime: room\.startTime,\s+serverNow: Date\.now\(\)/);
  assert.match(modal, /function countdownFromServer\(data\)/);
  assert.match(modal, /data\.type === 'party_sudden_death_start'/);
  assert.match(modal, /id="btn-space-sudden-death"/);
  assert.match(modal, /resolveTie\('split_pot'\)/);
});

test('pressure rises during the round and hits give feedback', () => {
  assert.match(engine, /const fireChance = Math\.min\(0\.7,/);
  assert.match(engine, /function hitFeedback\(ms\)/);
});
