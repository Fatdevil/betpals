import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('bottom nav uses line icons instead of four look-alike chip images', () => {
  const nav = read('src/components/navbar.js');
  assert.doesNotMatch(nav, /-nav\.png|nav-chip\.png/);
  assert.equal((nav.match(/class="nav-svg"/g) || []).length, 4);
});

test('section headers use a gold bar, not the chip image', () => {
  assert.doesNotMatch(read('src/pages/home.js'), /chip-malta-transparent/);
  assert.doesNotMatch(read('src/components/minigames.js'), /chip-malta-transparent/);
  assert.match(read('src/style.css'), /\.section-header-title::before,\s*\.minigames-title::before \{/);
});

test('the 1.6 MB chip PNG is no longer loaded; small icons use the webp', () => {
  for (const f of ['src/components/maltaSupport.js', 'src/pages/profile.js']) {
    const src = read(f);
    assert.doesNotMatch(src, /chip-malta-transparent/);
    assert.match(src, /malta-chip-sm\.webp/);
  }
});
