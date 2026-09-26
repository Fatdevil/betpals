import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const eventPage = readFileSync(new URL('../src/pages/event.js', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/pages/admin.js', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/components/finish-event-modal.js', import.meta.url), 'utf8');

test('the organiser can settle a game straight from the game page', () => {
  assert.match(eventPage, /id="creator-finish-btn">🏆 Avgör matchen<\/button>/);
  assert.match(eventPage, /getElementById\('creator-finish-btn'\)\?\.addEventListener\('click', \(\) => \{\s+openFinishEventModal\(event,/);
});

test('the event organiser counts as the game organiser (as on the server)', () => {
  assert.match(eventPage, /tournamentCreatorById\[event\.tournamentId\] === currentUser\.id/);
});

test('admin shows "Avgör" without having to close betting first', () => {
  assert.match(admin, /ev\.status === 'open' \|\| ev\.status === 'locked' \? `\s+<button class="btn btn-sm btn-success admin-finish-btn"/);
  assert.match(admin, /openFinishEventModal\(event, \{/);
});

test('the settle dialog asks before paying out and escapes names and images', () => {
  assert.match(modal, /if \(!confirm\(`Sätta \$\{label\} som vinnare/);
  assert.match(modal, /escapeHtml\(event\.name\)/);
  assert.match(modal, /safeImageSrc\(p\.imageUrl\)/);
  assert.match(modal, /if \(busy\) return;/);
});
