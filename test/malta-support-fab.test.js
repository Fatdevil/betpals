import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/components/maltaSupport.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('support button is a small round button; the name only shows on the first visit', () => {
  assert.match(css, /\.malta-fab-btn \{[^}]*width: 46px;[^}]*height: 46px;/);
  assert.match(css, /\.malta-fab-label \{[^}]*display: none;/);
  assert.match(css, /\.malta-fab-btn\.intro \.malta-fab-label \{\s*display: inline;/);
  assert.match(js, /localStorage\.setItem\('malta_fab_intro_seen', 'true'\)/);
  assert.doesNotMatch(js, /malta-fab-toggle-btn/);
});
