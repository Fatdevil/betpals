import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/pages/leaderboard.js', import.meta.url), 'utf8');

test('The Tab has three tabs and old Dueller links land on "Att göra"', () => {
  assert.match(js, /data-tab="overview">\$\{isEn \? 'To do' : 'Att göra'\}/);
  assert.match(js, /data-tab="tournaments"/);
  assert.match(js, /data-tab="history"/);
  assert.doesNotMatch(js, /data-tab="swishlist"/);
  assert.match(js, /if \(tabParam === 'swishlist'\) tabParam = 'overview';/);
});

test('paying happens in one place: the event tab has no own Swish links', () => {
  assert.equal((js.match(/createSwishUrl\(/g) || []).length, 1);
  assert.match(js, /Betala under Att göra →/);
});

test('every person shows why they owe, and undecided games are flagged', () => {
  assert.match(js, /class="tabx-why"/);
  assert.match(js, /undecidedCount/);
  assert.match(js, /spel är inte \$\{undecided === 1 \? 'avgjort' : 'avgjorda'\} än/);
});

test('split a bill uses a picker instead of window.prompt', () => {
  assert.doesNotMatch(js, /prompt\(/);
  assert.match(js, /function openSplitPicker/);
});
