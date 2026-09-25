import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('Party invitation notifications link straight into the room', () => {
  const server = read('server/server.js');
  const inviteStart = server.indexOf("app.post('/api/minigames/party/:id/invite'");
  const inviteBlock = server.slice(inviteStart, server.indexOf('\n});', inviteStart));
  assert.match(inviteBlock, /url: `\/\?party=\$\{encodeURIComponent\(room\.code\)\}`/);
  assert.doesNotMatch(inviteBlock, /url: '\/#arcade'/);
});

test('Tapping a notification lets an open app navigate itself (no WindowClient.navigate)', () => {
  const sw = read('public/sw.js');
  const clickHandler = sw.slice(sw.indexOf("addEventListener('notificationclick'"));
  assert.match(clickHandler, /postMessage\(\{ type: 'open-url'/);
  assert.doesNotMatch(clickHandler, /client\.navigate\(/);

  const main = read('src/main.js');
  assert.match(main, /e\.data\?\.type !== 'open-url'/);
  assert.match(main, /handlePartyRoomDeepLink\(partyCode\)/);
  assert.match(main, /hash === 'arcade'/);
});

test('API requests time out instead of hanging on "Laddar..."', () => {
  const api = read('src/api.js');
  assert.match(api, /new AbortController\(\)/);
  assert.match(api, /REQUEST_TIMEOUT_MS = 20000/);
});

test('Every notification link points to a route the app handles', () => {
  const sources = ['server/server.js', 'server/support.js'].map(read).join('\n');
  // Every quoted path on a `url:` line, including both branches of a ternary
  const urlLines = sources.split('\n').filter(line => /^\s*url: /.test(line));
  const urls = urlLines.flatMap(line => [...line.matchAll(/['`](\/[^'`]*)['`]/g)].map(m => m[1]));
  assert.ok(urls.length > 15, `expected many notification links, found ${urls.length}`);

  const supported = [
    /^\/$/,
    /^\/\?party=/,
    /^\/\?live=/,
    /^\/#(arcade|swishlist|leaderboard|profile|home|loven)$/,
    /^\/#(tournament|event|flashbet|anybet)\/\$\{/
  ];
  const unsupported = urls.filter(u => !supported.some(re => re.test(u)));
  assert.deepEqual(unsupported, [], `Notification links the app cannot open: ${unsupported.join(', ')}`);
});

test('AnyBet invitations and results send push notifications', () => {
  const server = read('server/server.js');
  assert.match(server, /title: '🤝 Nytt AnyBet!'[\s\S]{0,300}url: `\/#anybet\/\$\{bet\.id\}`/);
  assert.match(server, /title: '🏁 AnyBet avgjort!'[\s\S]{0,300}url: `\/#anybet\/\$\{settledBet\.id\}`/);
});

test('The app routes every notification target', () => {
  const main = read('src/main.js');
  for (const route of ["hash.startsWith('flashbet/')", "hash.startsWith('anybet/')", "hash === 'loven'", "hash === 'the-tab'", "hash.startsWith('tournament?code=')", "'/duels': '#arcade'"]) {
    assert.ok(main.includes(route), `missing route: ${route}`);
  }
});
