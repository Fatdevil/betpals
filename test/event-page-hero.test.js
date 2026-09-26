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

test('delete sits behind the host "⋯" at the top: never a bare button next to "Dela event", never below the photos', () => {
  const hero = src.slice(src.indexOf('<div class="event-hero">'), src.indexOf('<!-- Rounds -->'));
  assert.match(hero, /id="event-host-menu-btn"/);
  assert.doesNotMatch(hero, /Radera eventet/);
  assert.match(src, /data-host-action="delete">🗑️ Radera eventet/);
  assert.doesNotMatch(src, /event-danger-zone/);
});

test('the live feed shows the newest photos and the rest on request', () => {
  assert.match(src, /const PHOTOS_SHOWN = 6;/);
  assert.match(src, /📸 Visa alla \$\{photos\.length\} bilder/);
});

test('a game in an event has no big picture on its own page', () => {
  const ev = readFileSync(new URL('../src/pages/event.js', import.meta.url), 'utf8');
  assert.match(ev, /\$\{event\.imageUrl && !event\.tournamentId \? `\s*<div class="event-hero-banner"/);
});
