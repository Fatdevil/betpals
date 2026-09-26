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
    session.lastViewerAt = Date.now(); // keep the no-viewers stop out of this test
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
  } catch (err) {
    server.close();
    throw err;
  }
});

test('a stream nobody watches stops after 3 minutes', { timeout: 20000 }, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const start = await call(base, 'POST', '/flashlive/start', host.token, { streamWithoutBet: true, notifyAllFriends: true, streamTitle: 'Tomt' });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    const session = activeFlashLiveStreams.get(start.body.live.id);
    session.createdAt = new Date(Date.now() - 3.2 * 60 * 1000).toISOString();
    // The cleanup loop runs every 5 s
    const deadline = Date.now() + 12000;
    while (activeFlashLiveStreams.has(session.id) && Date.now() < deadline) {
      session.lastHeartbeat = Date.now();
      await new Promise(r => setTimeout(r, 500));
    }
    assert.equal(activeFlashLiveStreams.has(session.id), false, 'idle stream was stopped');
  } catch (err) {
    server.close();
    throw err;
  }
});

test('the bet survives the end of the stream and can be settled afterwards', async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const start = await call(base, 'POST', '/flashlive/start', host.token, { question: 'Sätter han putten?', stakeAmount: 50, durationSeconds: 30, notifyAllFriends: true });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    const betId = start.body.flashBet.id;
    const vote = await call(base, 'POST', `/flashbets/${betId}/bet`, friend.token, { choice: 'no' });
    assert.equal(vote.status, 200, JSON.stringify(vote.body));

    const stop = await call(base, 'POST', `/flashlive/${start.body.live.id}/stop`, host.token, {});
    assert.equal(stop.body.pendingBetId, betId);
    assert.equal(stop.body.cancelledBet, false);

    const settle = await call(base, 'POST', `/flashbets/${betId}/settle`, host.token, { winningChoice: 'yes' });
    assert.equal(settle.status, 200, JSON.stringify(settle.body));
    assert.equal(settle.body.status, 'settled');
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
