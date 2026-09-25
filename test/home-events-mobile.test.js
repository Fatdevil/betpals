import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const homeSource = readFileSync(new URL('../src/pages/home.js', import.meta.url), 'utf8');

test('home keeps Events above the arcade on small screens', () => {
  const templateStart = homeSource.indexOf('content.innerHTML = `');
  const eventsPosition = homeSource.indexOf('<div id="events-list">', templateStart);
  const arcadePosition = homeSource.indexOf('${renderMinigamesRoller()}', templateStart);

  assert.ok(eventsPosition > templateStart, 'Events list must exist in the home template');
  assert.ok(eventsPosition < arcadePosition, 'Events must be discoverable before the tall arcade feed');
});

test('home renders Events independently when another feed request fails', () => {
  assert.match(homeSource, /Promise\.allSettled\(\[getEvents\(\), getTournaments\(\)\]\)/);
  assert.match(homeSource, /eventsResult\.status === 'fulfilled'/);
  assert.match(homeSource, /tournamentsResult\.status === 'fulfilled'/);
  assert.match(homeSource, /eventsError\.status === 401/);
});

test('standalone matches always have a visible section heading', () => {
  assert.match(homeSource, /const evHeader = `/);
  assert.doesNotMatch(homeSource, /const evHeader = tournaments\.length > 0/);
  assert.match(homeSource, /<span>\$\{t\('home\.events'\)\}<\/span>/);
});
