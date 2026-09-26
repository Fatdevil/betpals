import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setBackParent, getBackParent, setBackInterceptor, interceptBack, resetBack } from '../src/backNav.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('a page can name its parent and intercept back once', () => {
  resetBack();
  assert.equal(getBackParent(), null);
  assert.equal(interceptBack(), false);
  setBackParent('tournament', { code: 'GOLF26' });
  assert.deepEqual(getBackParent(), { page: 'tournament', params: { code: 'GOLF26' } });
  let open = true;
  setBackInterceptor(() => { if (!open) return false; open = false; return true; });
  assert.equal(interceptBack(), true, 'closes the slip');
  assert.equal(interceptBack(), false, 'then lets back through');
  setBackInterceptor(() => { throw new Error('boom'); });
  assert.equal(interceptBack(), false, 'a broken handler never blocks back');
  resetBack();
  assert.equal(getBackParent(), null);
});

test('sub pages show "‹" where the QR button sits; the logo still opens the QR code', () => {
  const nav = read('src/components/navbar.js');
  assert.match(nav, /const SUB_PAGES = new Set\(\['event', 'tournament'\]\);/);
  assert.match(nav, /SUB_PAGES\.has\(activePage\) \? `[\s\S]*?id="top-header-back-btn"/);
  assert.match(nav, /top-header-logo-btn'\)\?\.addEventListener\('click', \(\) => \{\s*openAppQrModal\(\);/);
});

test('back steps through in-app history, else goes to the parent, and never leaves the app', () => {
  const main = read('src/main.js');
  assert.match(main, /function goBack\(\) \{\s*if \(interceptBack\(\)\) return;\s*if \(historyDepth\(\) > 0\) \{\s*window\.history\.back\(\);/);
  assert.match(main, /const parent = getBackParent\(\) \|\| \{ page: 'home', params: \{\} \};\s*navigate\(parent\.page, parent\.params, \{ replace: true \}\);/);
  assert.match(main, /else window\.history\.pushState\(\{ depth: historyDepth\(\) \+ 1 \}, '', url\);/);
  // The phone's back closes an open slip and stays on the game
  assert.match(main, /if \(interceptBack\(\)\) \{\s*window\.history\.pushState\(\{ depth: historyDepth\(\) \+ 1 \}, '', pageUrl\(currentPage, currentParams\)\);\s*return;/);
  // Opening a notification link straight into a game: nothing underneath, back goes to the parent
  assert.match(main, /if \(window\.location\.hash\) handleHashRoute\(true\);/);
});

test('a game goes back to its event and closes the bet slip first', () => {
  const ev = read('src/pages/event.js');
  assert.match(ev, /if \(event\.tournamentId\) setBackParent\('tournament', \{ code: event\.tournamentCode \|\| event\.tournamentId \}\);/);
  assert.match(ev, /setBackInterceptor\(\(\) => \{\s*if \(slip\.hidden\) return false;\s*closeSlip\(\);\s*return true;/);
  assert.doesNotMatch(ev, /game-crumb|game-back-btn/);
});
