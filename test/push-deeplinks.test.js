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
