import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const src = readFileSync(new URL('../src/pages/tournament.js', import.meta.url), 'utf8');

test('event page has a hero card with status pill and participants row', () => {
  assert.match(src, /<div class="event-hero">/);
  assert.match(src, /class="event-status \$\{t\.status === 'active' \? 'live' : 'done'\}"/);
  assert.match(src, /id="event-people-btn"/);
});

test('empty state uses the gold chips image and a separate text for friends', () => {
  assert.match(src, /\/malta-chips-gold-sm\.webp/);
  assert.match(src, /Snart kör vi!/);
  assert.ok(statSync(new URL('../public/malta-chips-gold-sm.webp', import.meta.url)).size < 80 * 1024);
});

test('delete button lives at the bottom of the page, not next to "Dela event"', () => {
  const hero = src.slice(src.indexOf('<div class="event-hero">'), src.indexOf('<!-- Rounds -->'));
  assert.doesNotMatch(hero, /delete-tournament-btn/);
  assert.match(src, /<div class="event-danger-zone">[\s\S]*?id="delete-tournament-btn"/);
});
