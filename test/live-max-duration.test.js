import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as db from '../server/db.js';

process.env.NODE_ENV = 'test';
process.env.LIVEKIT_URL = 'wss://example.invalid';
process.env.LIVEKIT_API_KEY = 'test-key';
process.env.LIVEKIT_API_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';

const { server, activeFlashLiveStreams } = await import('../server/server.js');
const liveSource = readFileSync(new URL('../src/components/livestream.js', import.meta.url), 'utf8');

const stamp = Date.now();
const host = { id: 'lmd-host-' + stamp, token: 'lmd-token-host-' + stamp };
const friend = { id: 'lmd-friend-' + stamp, token: 'lmd-token-friend-' + stamp };
db.createUser(host.id, 'lmdhost' + stamp, host.token, '🎥', 'Live Host', '0701112233');
db.createUser(friend.id, 'lmdfriend' + stamp, friend.token, '👀', 'Live Friend', '0701112244');
db.addFriend(host.id, friend.id);

async function call(base, method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-user-token': token },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

test('live streams stop after 15 minutes and new bets cannot extend them', async () => {
  if (!server.listening) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const start = await call(base, 'POST', '/flashlive/start', host.token, { streamWithoutBet: true, notifyAllFriends: true, streamTitle: 'Test' });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    const live = start.body.live;
    assert.equal(new Date(live.endsAt) - new Date(live.createdAt), 15 * 60 * 1000);

    // 13.5 minutes in: a 60 s bet plus settle time no longer fits
    const session = activeFlashLiveStreams.get(live.id);
    session.createdAt = new Date(Date.now() - 13.5 * 60 * 1000).toISOString();
    const bet = await call(base, 'POST', `/flashlive/${live.id}/bet`, host.token, { question: 'Putt?', durationSeconds: 60 });
    assert.equal(bet.status, 400);
    assert.match(bet.body.error, /stoppas automatiskt/);

    // Past 15 minutes the stream is ended for everyone
    session.createdAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    session.lastHeartbeat = Date.now();
    const view = await call(base, 'GET', `/flashlive/${live.id}`, friend.token);
    assert.equal(view.status, 404);
    assert.equal(activeFlashLiveStreams.has(live.id), false);
    const hb = await call(base, 'POST', `/flashlive/${live.id}/heartbeat`, host.token);
    assert.equal(hb.status, 404);
  } finally {
    server.close();
  }
});

test('live client counts down, stops on heartbeat 404 and cannot be replaced by pop-ups', () => {
  assert.match(liveSource, /id="live-time-left"/);
  assert.match(liveSource, /res\.status === 404 && streamActive && activeLiveId === liveId/);
  assert.match(liveSource, /isGame: true,\s*confirmClose: false,\s*isBusy: \(\) => streamActive/);
  assert.match(liveSource, /Max 15 min per sändning/);
});
