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
