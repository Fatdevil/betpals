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
  assert.match(nav, /bindOnce\('top-header-logo-btn', \(\) => openAppQrModal\(\)\);/);
});

test('back steps through in-app history, else goes to the parent, and never leaves the app', () => {
  const main = read('src/main.js');
  assert.match(main, /function goBack\(\) \{\s*if \(interceptBack\(\)\) return;\s*if \(historyDepth\(\) > 0\) \{\s*window\.history\.back\(\);/);
  assert.match(main, /const parent = getBackParent\(\) \|\| \{ page: 'home', params: \{\} \};\s*navigate\(parent\.page, parent\.params, \{ replace: true \}\);/);
  assert.match(main, /\} else \{\s*window\.history\.pushState\(\{ depth: historyDepth\(\) \+ 1 \}, '', url\);/);
  // The phone's back closes an open slip and stays on the game
  assert.match(main, /if \(goingBack && interceptBack\(\)\) \{\s*window\.history\.pushState\(\{ depth: historyDepth\(\) \+ 1 \}, '', pageUrl\(currentPage, currentParams\)\);\s*shownDepth = historyDepth\(\);\s*return;/);
  // Opening a notification link straight into a game: nothing underneath, back goes to the parent
  assert.match(main, /if \(window\.location\.hash\) handleHashRoute\(true\);/);
});

test('a game goes back to its event and closes the bet slip first', () => {
  const ev = read('src/pages/event.js');
  assert.match(ev, /if \(event\.tournamentId\) setBackParent\('tournament', \{ code: event\.tournamentCode \|\| event\.tournamentId \}\);/);
  assert.match(ev, /setBackInterceptor\(\(\) => \{\s*\/\/[^\n]*\n\s*if \(!slip\.isConnected \|\| slip\.hidden\) return false;\s*closeSlip\(\);\s*return true;/);
  assert.doesNotMatch(ev, /game-crumb|game-back-btn/);
});

test('header buttons are bound once even when the header is drawn twice in a row', () => {
  const nav = read('src/components/navbar.js');
  assert.match(nav, /function bindOnce\(id, handler\) \{\s*const el = document\.getElementById\(id\);\s*if \(!el \|\| el\.dataset\.bound\) return;/);
  assert.match(nav, /bindOnce\('top-header-back-btn', requestBack\);/);
  assert.doesNotMatch(nav, /getElementById\('top-header-back-btn'\)\?\.addEventListener/);
  const bell = read('src/components/notifications.js');
  assert.match(bell, /if \(bell\.dataset\.bound\) return;\s*bell\.dataset\.bound = '1';\s*bell\.addEventListener\('click'/);
});

test('a page opened directly gets a guard entry, so the phone\'s back stays in the app', () => {
  const main = read('src/main.js');
  assert.match(main, /function guardSubPage\(\) \{\s*if \(!SUB_PAGES\.has\(currentPage\) \|\| historyDepth\(\) > 0\) return;[\s\S]*?replaceState\(\{ depth: 0, guard: true \}, '', url\);\s*window\.history\.pushState\(\{ depth: 1 \}, '', url\);/);
  assert.match(main, /if \(window\.history\.state\?\.guard\) \{\s*const parent = getBackParent\(\) \|\| \{ page: 'home', params: \{\} \};\s*navigate\(parent\.page, parent\.params, \{ replace: true \}\);/);
  assert.match(main, /guardSubPage\(\);\s*shownDepth = historyDepth\(\);\s*renderApp\(\);/);
});

test('a page that was still loading never draws over the page shown now', async () => {
  const { isShowing } = await import('../src/backNav.js');
  globalThis.window = { location: { href: 'https://x.test/?page=tournament&code=GOLF26' } };
  try {
    assert.equal(isShowing('tournament', 'GOLF26'), true);
    assert.equal(isShowing('event', 'ABC'), false, 'user went back from the game');
    assert.equal(isShowing('tournament', 'OTHER'), false);
  } finally {
    delete globalThis.window;
  }
  const ev = read('src/pages/event.js');
  assert.match(ev, /const event = await getEvent\(code\);\s*if \(!isShowing\('event', code\)\) return;/);
  assert.match(ev, /export async function renderEvent\(params = \{\}\) \{\s*const code = params\.code;\s*\/\/ A delayed refresh[^\n]*\n\s*if \(code && !isShowing\('event', code\)\) return;/);
  const tour = read('src/pages/tournament.js');
  assert.match(tour, /getActiveFlashBets\(t\.id\)\.catch\(\(\) => \[\]\)\s*\]\);\s*if \(!isShowing\('tournament', code\)\) return;/);
  assert.doesNotMatch(tour, /renderTournament\(\{ code: t\.shareCode \}\)/);
});

test('only going back closes the slip; forward still goes forward', () => {
  const main = read('src/main.js');
  assert.match(main, /const goingBack = historyDepth\(\) < shownDepth;\s*if \(goingBack && interceptBack\(\)\) \{/);
  assert.match(main, /window\.history\.pushState\(\{ depth: historyDepth\(\) \+ 1 \}, '', url\);\s*\}\s*shownDepth = historyDepth\(\);/);
});

test('a slip removed by a refresh never swallows back', () => {
  const ev = read('src/pages/event.js');
  assert.match(ev, /setBackInterceptor\(\(\) => \{[^}]*?if \(!slip\.isConnected \|\| slip\.hidden\) return false;/);
  assert.match(ev, /removeBetslip\(\);\s*\/\/[^\n]*\n\s*setBackInterceptor\(null\);\s*\}/);
});
