process.env.NODE_ENV = 'test';
delete process.env.GEMINI_API_KEY;

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as db from '../server/db.js';
import { readResultFromImage, matchOptions, parseImageDataUrl } from '../server/resultReader.js';

const { server } = await import('../server/server.js');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-user-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
}
async function registerUser(prefix) {
  const nickname = prefix + crypto.randomBytes(3).toString('hex');
  const res = await call('POST', '/api/users/register', {
    name: nickname + ' Testsson', nickname,
    swishNumber: '07' + String(crypto.randomInt(0, 100000000)).padStart(8, '0'), pin: '1111'
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}
async function golfEvent() {
  const host = await registerUser('gh'), guest = await registerUser('gg');
  const tId = crypto.randomUUID();
  db.createTournament(tId, 'Golfhelg', crypto.randomBytes(4).toString('hex').toUpperCase(), host.id, 'friends',
    [host, guest].map(u => ({ name: u.nickname, userId: u.id })));
  return { host, guest, tId };
}
const PNG = 'data:image/png;base64,' + Buffer.from('fake-image-bytes').toString('base64');

test('a game can carry a https link to its live leaderboard', async () => {
  const { host, guest, tId } = await golfEvent();
  const url = 'https://www.golfgamebook.com/live/abc123';
  const res = await call('POST', `/api/tournaments/${tId}/sidebets`, { name: 'Närmast hål 7', players: ['Anna', 'Bosse'], betAmount: 20, resultUrl: url }, host.token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const game = res.body.sideBets.find(g => g.name === 'Närmast hål 7');
  assert.equal(game.resultUrl, url);
  assert.equal(db.getFullEvent(game.id).resultUrl, url);

  // Only https links; only the organiser changes it; an empty value removes it
  const bad = await call('POST', `/api/tournaments/${tId}/sidebets`, { name: 'X', players: ['A', 'B'], betAmount: 20, resultUrl: 'javascript:alert(1)' }, host.token);
  assert.equal(bad.status, 400);
  assert.equal((await call('PUT', `/api/events/${game.id}/result-url`, { url: 'http://insecure.example' }, host.token)).status, 400);
  assert.equal((await call('PUT', `/api/events/${game.id}/result-url`, { url: 'https://other.example/x' }, guest.token)).status, 403);
  assert.equal((await call('PUT', `/api/events/${game.id}/result-url`, { url: '' }, host.token)).status, 200);
  assert.equal(db.getFullEvent(game.id).resultUrl, null);
});

test('reading a result photo is organiser-only and says so when the AI is off', async () => {
  const { host, guest, tId } = await golfEvent();
  const res = await call('POST', `/api/tournaments/${tId}/sidebets`, { name: 'Vinnare runda 1', players: ['Anna', 'Bosse'], betAmount: 20 }, host.token);
  const game = res.body.sideBets.find(g => g.name === 'Vinnare runda 1');
  assert.equal((await call('POST', `/api/events/${game.id}/read-result`, { image: PNG }, guest.token)).status, 403);
  const off = await call('POST', `/api/events/${game.id}/read-result`, { image: PNG }, host.token);
  assert.equal(off.status, 503);
  assert.match(off.body.error, /inte påslagen/);
  const ev = await call('GET', `/api/events/${game.id}`, null, host.token);
  assert.equal(ev.body.canReadResultPhoto, false);
});

test('the AI suggestion only ever names the game\'s own options', async () => {
  const event = { name: 'Vinnare runda 1', betMode: 'open', players: [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Bosse' }, { id: 'c', name: 'Cissi' }] };
  process.env.GEMINI_API_KEY = 'test-key';
  try {
    let sent = null;
    const fake = async (url, opts) => {
      sent = { url, opts };
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"winners": ["Bosse Bengtsson", "Someone Else"], "reason": "Bosse har lägst slag (72)"}' }] } }] }) };
    };
    const res = await readResultFromImage(event, PNG, { fetchImpl: fake });
    assert.deepEqual(res, { ok: true, winnerIds: ['b'], reason: 'Bosse har lägst slag (72)' });
    assert.equal(sent.opts.headers['x-goog-api-key'], 'test-key', 'key in a header');
    assert.doesNotMatch(sent.url, /test-key/, 'never in the URL');
    const body = JSON.parse(sent.opts.body);
    assert.equal(body.contents[0].parts[0].inline_data.mime_type, 'image/png');
    assert.match(body.contents[0].parts[1].text, /- Anna\n- Bosse\n- Cissi/);

    // Pick N: at most N, in order
    const picks = { ...event, betMode: 'picks', pickCount: 2 };
    const fake3 = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '```json\n{"winners":["cissi","anna","bosse"]}\n```' }] } }] }) });
    assert.deepEqual((await readResultFromImage(picks, PNG, { fetchImpl: fake3 })).winnerIds, ['c', 'a']);

    // A failing API: an honest error, no guess
    const down = async () => ({ ok: false, json: async () => ({}) });
    assert.equal((await readResultFromImage(event, PNG, { fetchImpl: down })).ok, false);
    assert.equal((await readResultFromImage(event, 'data:text/html;base64,PGI+', { fetchImpl: fake })).ok, false, 'images only');
  } finally {
    delete process.env.GEMINI_API_KEY;
  }
  assert.deepEqual(matchOptions(['12', 'x'], [{ id: 1, name: '1' }, { id: 2, name: 'X' }, { id: 3, name: '2' }]), [2], 'no loose matching of short options');
  assert.equal(parseImageDataUrl('data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024)), null, 'size limit');
});

test('the game page, the new-game form and the result dialog offer the link and the photo reading', () => {
  const ev = readFileSync(new URL('../src/pages/event.js', import.meta.url), 'utf8');
  assert.match(ev, /game-link-live" href="\$\{escapeHtml\(sanitizeUrl\(event\.resultUrl\)\)\}" target="_blank" rel="noopener noreferrer"/);
  assert.match(ev, /id="creator-result-url-btn"/);
  const form = readFileSync(new URL('../src/pages/tournament.js', import.meta.url), 'utf8');
  assert.match(form, /id="ng-result-url"/);
  assert.match(form, /\.\.\.\(resultUrl \? \{ resultUrl \} : \{\}\)/);
  const fin = readFileSync(new URL('../src/components/finish-event-modal.js', import.meta.url), 'utf8');
  assert.match(fin, /\$\{leaderboardLink\(event\)\}/);
  assert.match(fin, /id="finish-read-btn"/);
  assert.match(fin, /id="pick-photo-input"/);
});
