import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/components/minigames.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const anybet = js.slice(js.indexOf('export async function openAnyBetModal('), js.indexOf('export function showIncomingAnyBetModal('));

test('AnyBet stakes are whole kronor', () => {
  assert.match(server, /stake = Math\.round\(parsed\);/);
});

test('the judge must actively pick the result and sees who pays whom first', () => {
  assert.match(anybet, /let chosenWinnerId = null;\s+let chosenSide = null;/);
  assert.match(anybet, /id="btn-confirm-settle" disabled/);
  assert.match(anybet, /id="settle-summary"/);
});

test('yes/no pot counts only people who picked a side, and labels are Swedish', () => {
  assert.match(anybet, /const inPot = isYesNo \? acceptedParticipants\.filter\(p => p\.choice === 'yes' \|\| p\.choice === 'no'\)/);
  assert.doesNotMatch(anybet, /p\.choice\.toUpperCase\(\)/);
});

test('linking to an event is visible and optional; paying happens on The Tab', () => {
  assert.match(anybet, /id="anybet-link-event" checked/);
  assert.match(anybet, /linkEvent && linkChecked \? linkEvent : null/);
  assert.doesNotMatch(anybet, /swish-pay-btn/);
  assert.match(anybet, /btn-anybet-goto-tab/);
});

test('proof pictures are compressed and loaded safely', () => {
  assert.match(anybet, /compressImage\(file, 1000, 0\.8\)/);
  assert.doesNotMatch(anybet, /<img src="\$\{bet\.proof_image_url\}"/);
});
