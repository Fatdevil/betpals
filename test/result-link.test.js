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

test('a result photo over 1 MB reaches the reader, and readings are rate-limited', async () => {
  const { host, tId } = await golfEvent();
  const res = await call('POST', `/api/tournaments/${tId}/sidebets`, { name: 'Runda 2', players: ['Anna', 'Bosse'], betAmount: 20 }, host.token);
  const game = res.body.sideBets.find(g => g.name === 'Runda 2');
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(1.6 * 1024 * 1024);

  // Past the 1 MB default parser: the AI is off, so the route itself answers
  const off = await call('POST', `/api/events/${game.id}/read-result`, { image: big }, host.token);
  assert.equal(off.status, 503, 'not 413 from the global parser');

  process.env.GEMINI_API_KEY = 'test-key';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => String(url).includes('generativelanguage.googleapis.com')
    ? { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"winners":["Anna"],"reason":"lägst slag"}' }] } }] }) }
    : realFetch(url, opts);
  try {
    const ok = await call('POST', `/api/events/${game.id}/read-result`, { image: big }, host.token);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.winnerIds.length, 1);
    let status = 200;
    for (let i = 0; i < 6 && status === 200; i++) status = (await call('POST', `/api/events/${game.id}/read-result`, { image: PNG }, host.token)).status;
    assert.equal(status, 429, 'at most 6 readings per 10 minutes per organiser');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GEMINI_API_KEY;
  }
});

test('overlapping option names pick the right one, and PIN-only organisers are told about the reader', async () => {
  const opts = [{ id: 'jon', name: 'Jon' }, { id: 'jonas', name: 'Jonas' }, { id: 'jonathan', name: 'Jonathan' }];
  assert.deepEqual(matchOptions(['Jonas Andersson'], opts), ['jonas'], 'longest option inside the name');
  assert.deepEqual(matchOptions(['Jonathan L'], opts), ['jonathan']);
  assert.deepEqual(matchOptions(['Jon'], opts), ['jon'], 'exact first');
  assert.deepEqual(matchOptions(['Jona'], opts), [], 'ambiguous: no guess');
  assert.deepEqual(matchOptions(['Anna A'], [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Anni' }]), ['a']);

  const { host, tId } = await golfEvent();
  const res = await call('POST', `/api/tournaments/${tId}/sidebets`, { name: 'Runda 3', players: ['Anna', 'Bosse'], betAmount: 20 }, host.token);
  const game = res.body.sideBets.find(g => g.name === 'Runda 3');
  const anon = await call('GET', `/api/events/${game.id}`);
  if (anon.status === 200) assert.equal(anon.body.canReadResultPhoto, false);
  const src = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
  assert.match(src, /const out = user \? event : publicEventView\(event\);\s*out\.canReadResultPhoto = canReadResults\(\);/);
});

test('an answer for a photo that is no longer the chosen one is dropped', () => {
  const fin = readFileSync(new URL('../src/components/finish-event-modal.js', import.meta.url), 'utf8');
  assert.match(fin, /function photoReader\(event, pin, btn, apply\)/);
  assert.match(fin, /if \(image !== current\) \{\s*if \(current\) run\(\);\s*else idle\(\);\s*return;/);
  assert.match(fin, /reader\?\.cancel\(\);\s*clearSuggestion\(\);/);
  assert.match(fin, /if \(pick === photoPick\) pickReader\.read\(image\);/);
});

test('a replaced suggestion undoes its tie ticks, and an older photo never overtakes a newer pick', () => {
  const fin = readFileSync(new URL('../src/components/finish-event-modal.js', import.meta.url), 'utf8');
  assert.match(fin, /if \(aiTicked\.length\) \{\s*checkboxes\.forEach\(cb => \{ if \(aiTicked\.includes\(cb\.dataset\.id\)\) cb\.checked = false; \}\);/);
  assert.match(fin, /const compressed = await compressImage\(file, 1000, 0\.8\);\s*if \(pick !== photoPick\) return;/);
  assert.match(fin, /const image = await compressImage\(file, 1000, 0\.8\);\s*if \(pick === photoPick\) pickReader\.read\(image\);/);
});

test('choosing another photo takes the old suggestion away at once (nothing stale to save)', () => {
  const fin = readFileSync(new URL('../src/components/finish-event-modal.js', import.meta.url), 'utf8');
  assert.match(fin, /const pick = \+\+photoPick;\s*\/\/[^\n]*\n\s*reader\?\.cancel\(\);\s*clearSuggestion\(\);/);
  assert.match(fin, /pickReader\.cancel\(\);\s*note\.style\.display = 'none';\s*if \(pickAiTicked\.length\) \{\s*boxes\.forEach\(b => \{ if \(pickAiTicked\.includes\(b\.value\)\) b\.checked = false; \}\);\s*pickAiTicked = \[\];\s*refreshSave\(\);/);
});

test('the old photo is never sent as proof while its replacement compresses', () => {
  const fin = readFileSync(new URL('../src/components/finish-event-modal.js', import.meta.url), 'utf8');
  const handler = fin.slice(fin.indexOf("proofInput?.addEventListener('change'"), fin.indexOf('const compressed = await compressImage'));
  assert.match(handler, /selectedWinnerProof = null;/);
  assert.match(handler, /proofPreviewWrapper\.style\.display = 'none';/);
});

test('a changed or removed leaderboard link reaches viewers already on the game page', () => {
  const ev = readFileSync(new URL('../src/pages/event.js', import.meta.url), 'utf8');
  assert.match(ev, /msg\.type === 'event_updated'[\s\S]{0,300}syncResultLink\(fresh/);
  assert.match(ev, /function syncResultLink\(event, links\) \{[\s\S]*?\.game-link-live'\)\?\.remove\(\);[\s\S]*?insertAdjacentHTML/);
});

test('a game page joins live updates by the game code, only with access to the game', async () => {
  const { WebSocket } = await import('ws');
  const { host, guest, tId } = await golfEvent();
  const outsider = await registerUser('go');
  const res = await call('POST', `/api/tournaments/${tId}/sidebets`, { name: 'Live-länk', players: ['Anna', 'Bosse'], betAmount: 20 }, host.token);
  const game = res.body.sideBets.find(g => g.name === 'Live-länk');
  const listen = (token) => new Promise(resolve => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/?event=${game.shareCode}`);
    const got = [];
    ws.on('message', m => got.push(JSON.parse(m).type));
    ws.on('open', () => { ws.send(JSON.stringify({ type: 'auth', token })); setTimeout(() => resolve({ ws, got }), 150); });
  });
  const [inside, outside] = await Promise.all([listen(guest.token), listen(outsider.token)]);
  assert.equal((await call('PUT', `/api/events/${game.id}/result-url`, { url: 'https://www.golfgamebook.com/x' }, host.token)).status, 200);
  await new Promise(r => setTimeout(r, 200));
  inside.ws.close(); outside.ws.close();
  assert.ok(inside.got.includes('event_updated'), inside.got.join());
  assert.ok(!outside.got.includes('event_updated'), outside.got.join());
});

test('a logged-out viewer of a standalone game gets its live updates too', async () => {
  const { WebSocket } = await import('ws');
  const host = await registerUser('sh');
  const res = await call('POST', '/api/events', { name: 'Fristående', players: ['Anna', 'Bosse'], betAmount: 20 }, host.token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const game = db.getFullEvent(res.body.id || res.body.event?.id || res.body.shareCode);
  const got = [];
  const ws = new WebSocket(`${base.replace('http', 'ws')}/?event=${game.shareCode}`);
  ws.on('message', m => got.push(JSON.parse(m).type));
  await new Promise(r => ws.on('open', r));
  await new Promise(r => setTimeout(r, 100));
  assert.equal((await call('PUT', `/api/events/${game.id}/result-url`, { url: 'https://www.golfgamebook.com/y' }, host.token)).status, 200);
  await new Promise(r => setTimeout(r, 200));
  ws.close();
  assert.ok(got.includes('event_updated'), got.join());
});
