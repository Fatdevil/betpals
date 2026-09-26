process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

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
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function register() {
  const nickname = 'sb' + crypto.randomBytes(3).toString('hex');
  const res = await call('POST', '/api/users/register', {
    name: nickname + ' Test', nickname,
    swishNumber: '07' + String(crypto.randomInt(0, 100000000)).padStart(8, '0'), pin: '1111'
  });
  return res.body;
}

test('solo score without a started round is refused; a round can be used once', async () => {
  const u = await register();
  const noRound = await call('POST', '/api/space/solo-score', { score: 150, aliensKilled: 5, waveReached: 1 }, u.token);
  assert.equal(noRound.status, 400);

  const { body: { roundId } } = await call('POST', '/api/space/solo-start', {}, u.token);
  // Right after starting, a big score cannot have happened yet
  const tooFast = await call('POST', '/api/space/solo-score', { roundId, score: 2000, aliensKilled: 60, waveReached: 3 }, u.token);
  assert.equal(tooFast.status, 400);
  const reused = await call('POST', '/api/space/solo-score', { roundId, score: 0, aliensKilled: 0, waveReached: 1 }, u.token);
  assert.equal(reused.status, 400, 'the round was already used');

  const { body: r2 } = await call('POST', '/api/space/solo-start', {}, u.token);
  const ok = await call('POST', '/api/space/solo-score', { roundId: r2.roundId, score: 0, aliensKilled: 0, waveReached: 1 }, u.token);
  assert.equal(ok.status, 200);
});

test('the server clock is available for offset measurement', async () => {
  const r = await call('GET', '/api/time');
  assert.equal(typeof r.body.now, 'number');
});
