import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tournamentSource = readFileSync(new URL('../src/pages/tournament.js', import.meta.url), 'utf8');
const tabSource = readFileSync(new URL('../src/components/delaUtlagg.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('camera and gallery buttons are labels bound to the file inputs (reliable on iPhone)', () => {
  for (const kind of ['photo', 'banner']) {
    assert.match(tournamentSource, new RegExp(`<label for="${kind}-camera-input"`));
    assert.match(tournamentSource, new RegExp(`<label for="${kind}-file-input"`));
    assert.match(tournamentSource, new RegExp(`capture="environment" id="${kind}-camera-input" class="file-input-hidden"`));
  }
  assert.doesNotMatch(tournamentSource, /cameraInput\?\.click\(\)/);
  assert.match(tabSource, /<label for="utlagg-receipt-file"/);
  assert.doesNotMatch(tabSource, /#utlagg-receipt-file'\)\?\.click\(\)/);
});

test('hidden file inputs stay in the layout and icon buttons have no browser default look', () => {
  assert.match(css, /\.file-input-hidden \{[^}]*opacity: 0;/);
  assert.doesNotMatch(css.match(/\.file-input-hidden \{[^}]*\}/)[0], /display: none/);
  assert.match(css, /\.btn-icon \{[^}]*appearance: none;/);
  assert.match(tournamentSource, /class="btn-icon photo-delete-x delete-photo-btn"/);
});
