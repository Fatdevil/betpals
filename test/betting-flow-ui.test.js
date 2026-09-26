import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const eventSrc = readFileSync(new URL('../src/pages/event.js', import.meta.url), 'utf8');
const tourSrc = readFileSync(new URL('../src/pages/tournament.js', import.meta.url), 'utf8');
const i18nSrc = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
const serverSrc = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');

test('game cards have a clear call to action and show the viewer\'s own bets', () => {
  assert.match(tourSrc, /const renderGameCard = \(g, nested = false\) =>/);
  assert.match(tourSrc, /<span class="game-card-cta">Betta →<\/span>/);
  assert.match(tourSrc, /✓ Du bettade:/);
  assert.match(tourSrc, /👥 Alla med/);
  assert.match(tourSrc, /class="game-card-menu"/);
  assert.match(serverSrc, /g\.myBets = mine/);
});

test('game page: options first, bet slip instead of the old form, no sponsors', () => {
  assert.match(eventSrc, /function renderGameOptions\(/);
  assert.match(eventSrc, /id="betslip"/);
  assert.match(eventSrc, /document\.body\.appendChild\(slip\)/);
  assert.doesNotMatch(eventSrc, /id="bet-form"/);
  assert.doesNotMatch(eventSrc, /renderSponsorCarousel/);
  assert.match(eventSrc, /<details class="game-host">/);
});

test('the app defaults to Swedish regardless of the phone language', () => {
  assert.match(i18nSrc, /function detectLanguage\(\) \{\s*return 'sv';\s*\}/);
});
