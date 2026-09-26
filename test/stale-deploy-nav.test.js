import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const swSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('a page that fails to load after a new deploy reloads once instead of keeping the old page', () => {
  assert.match(mainSource, /mod = await loader\(\);\s*\} catch \(err\)/);
  assert.match(mainSource, /if \(!reloadForNewVersion\(\)\) renderPageLoadError\(\);/);
  assert.match(mainSource, /if \(seq !== renderSeq\) return;/);
});

test('missing build files 404 instead of falling back to index.html', () => {
  assert.match(serverSource, /app\.use\('\/assets', \(req, res\) => res\.status\(404\)\.end\(\)\);/);
  assert.ok(serverSource.indexOf("app.use('/assets'") < serverSource.indexOf("app.get('{*path}'"));
});

test('service worker never caches HTML under a script URL', () => {
  assert.match(swSource, /!isHtml \|\| event\.request\.mode === 'navigate'/);
});
