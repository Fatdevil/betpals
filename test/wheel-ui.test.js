import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/components/minigames.js', import.meta.url), 'utf8');
const wheel = src.slice(src.indexOf('function openWheelModal()'), src.indexOf('📱 PARTY ROOM QR CODE MODAL'));

test('Not-Roulette draws sharp, upright labels and lands on a fair random sector', () => {
  assert.match(wheel, /canvas\.width = SIZE \* dpr/);
  assert.match(wheel, /const flip = Math\.cos\(mid\) < 0;/);
  assert.match(wheel, /crypto\.getRandomValues/);
  assert.match(wheel, /winnerIndex = sectorAt\(rotation, n\)/);
});

test('Not-Roulette settles on the spot, never on THE TAB', () => {
  assert.match(wheel, /fram med kortet/);
  assert.doesNotMatch(wheel, /settle|createBill|THE TAB|duel/i);
  assert.doesNotMatch(wheel, /wheelWinnerTab'\)\}! 💳/, 'no doubled "! 💳"');
});

test('automatic install prompt never replaces an open dialog', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /isGameInProgress\(\) \|\| document\.getElementById\('modal-root'\)\?\.childElementCount/);
});
