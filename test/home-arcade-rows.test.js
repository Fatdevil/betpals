import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mg = readFileSync(new URL('../src/components/minigames.js', import.meta.url), 'utf8');
const sv = readFileSync(new URL('../src/lang/sv.js', import.meta.url), 'utf8');
const roller = mg.slice(mg.indexOf('export function renderMinigamesRoller'), mg.indexOf('// ── 2. "All Games" Grid Modal'));
const attach = mg.slice(mg.indexOf('export function attachMinigamesListeners'), mg.indexOf('// Initialize global real-time duel incoming challenge listener'));

test('home game rows are swipe rows with titles, no auto-scroll loop', () => {
  assert.match(roller, /id="minigames-row-quick"/);
  assert.match(roller, /id="minigames-row-party"/);
  assert.match(roller, /t\('arcade\.rowQuick'\)/);
  assert.doesNotMatch(roller, /\[\.\.\.row1Games, \.\.\.row1Games, \.\.\.row1Games\]/);
  assert.doesNotMatch(attach, /requestAnimationFrame/);
  assert.doesNotMatch(attach, /window\.addEventListener\('mousemove'/);
});

test('Swedish labels for the game rows', () => {
  assert.match(sv, /title: 'Spel',/);
  assert.match(sv, /coinFlipTag: 'Krona \/ Klave',/);
  assert.match(sv, /mafiaTag: 'Bluffa & avslöja',/);
  assert.match(sv, /rowParty: 'Partyspel',/);
});
