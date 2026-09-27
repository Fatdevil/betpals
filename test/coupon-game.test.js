process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

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

// Three matchplay matches; the last is a knock-out with no draw
const MATCHES = [
  { home: 'Anna/Bosse', away: 'Cissi/Dani' },
  { home: 'Erik', away: 'Fia' },
  { home: 'Gustav', away: 'Hanna', draw: false }
];

async function couponGame({ matches = MATCHES } = {}) {
  const host = await registerUser('ch');
  const friends = [await registerUser('ca'), await registerUser('cb'), await registerUser('cc')];
  for (const f of friends) db.addFriend(host.id, f.id);
  const tId = crypto.randomUUID();
  db.createTournament(tId, 'Matchspel', crypto.randomBytes(4).toString('hex').toUpperCase(), host.id, 'friends',
    [host, ...friends].map(u => ({ name: u.nickname, userId: u.id })));
  const res = await call('POST', `/api/tournaments/${tId}/sidebets`, { name: 'Lördagens matcher', betMode: 'coupon', matches, betAmount: 50 }, host.token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const game = res.body.sideBets.find(g => g.name === 'Lördagens matcher');
  const ev = db.getFullEvent(game.id);
  // The option for a sign in a match, e.g. sign(1, 'X')
  const sign = (no, s) => ev.coupon.matches.find(m => m.no === no).options[s];
  return { host, friends, tId, ev, sign, game };
}
const tip = (ev, user, picks) => call('POST', `/api/events/${ev.id}/picks`, { picks }, user.token);
const setResult = (ev, host, match, result) => call('PUT', `/api/events/${ev.id}/coupon-result`, { match, result }, host.token);

test('a coupon is created as matches with 1 / X / 2, a draw only where allowed', async () => {
  const { ev, game } = await couponGame();
  assert.equal(ev.betMode, 'picks');
  assert.equal(ev.pickCount, 3);
  assert.deepEqual(ev.coupon.matches.map(m => [m.no, m.home, m.away, m.draw, Object.keys(m.options).sort().join('')]), [
    [1, 'Anna/Bosse', 'Cissi/Dani', true, '12X'],
    [2, 'Erik', 'Fia', true, '12X'],
    [3, 'Gustav', 'Hanna', false, '12']
  ]);
  assert.equal(ev.minBet, 50);
  assert.equal(ev.maxBet, 50);
  assert.deepEqual({ ...game.coupon, matches: game.coupon.matches.length }, { matchCount: 3, decided: 0, matches: 3 }, 'the event\'s game list knows it is a coupon');
  assert.deepEqual(game.coupon.matches[0], { home: 'Anna/Bosse', away: 'Cissi/Dani' });
});

test('a coupon needs 2–13 matches with two different sides', async () => {
  const { host, tId } = await couponGame();
  const make = (matches) => call('POST', `/api/tournaments/${tId}/sidebets`, { name: 'Fel', betMode: 'coupon', matches, betAmount: 50 }, host.token);
  assert.equal((await make([{ home: 'A', away: 'B' }])).status, 400, 'one match');
  assert.equal((await make([{ home: 'A', away: 'B' }, { home: 'C', away: 'c' }])).status, 400, 'same side twice');
  assert.equal((await make([{ home: 'A', away: 'B' }, { home: '', away: 'D' }])).status, 400, 'a side missing');
  assert.equal((await make(Array.from({ length: 14 }, (_, i) => ({ home: `H${i}`, away: `B${i}` })))).status, 400, '14 matches');
  assert.equal((await make(Array.from({ length: 13 }, (_, i) => ({ home: `H${i}`, away: `B${i}` })))).status, 200, '13 matches');
});

test('a tip is exactly one sign in every match', async () => {
  const { friends, ev, sign } = await couponGame();
  const [a] = friends;
  assert.equal((await tip(ev, a, [sign(1, '1'), sign(2, '1')])).status, 400, 'a match left out');
  assert.equal((await tip(ev, a, [sign(1, '1'), sign(1, '2'), sign(3, '1')])).status, 400, 'two signs in one match');
  assert.equal((await tip(ev, a, [sign(1, '1'), sign(2, 'X'), sign(3, '2')])).status, 200);
  assert.equal((await tip(ev, a, [sign(1, '2'), sign(2, 'X'), sign(3, '2')])).status, 200, 'changed before any result');
  assert.equal(db.getFullEvent(ev.id).totalPool, 50, 'one stake per person');
});

test('the first result closes the tips; others\' rows show once closed, scored live', async () => {
  const { host, friends, ev, sign } = await couponGame();
  const [a, b, c] = friends;
  await tip(ev, a, [sign(1, '1'), sign(2, 'X'), sign(3, '2')]);
  await tip(ev, b, [sign(1, '2'), sign(2, 'X'), sign(3, '1')]);
  const hidden = (await call('GET', `/api/events/${ev.shareCode}`, null, b.token)).body;
  assert.equal(hidden.entries.find(e => e.userId === a.id).picks, null, 'hidden while open');

  assert.equal((await setResult(ev, a, 1, '1')).status, 403, 'organiser only');
  const r = await setResult(ev, host, 1, '1');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.locked, true);
  assert.equal((await tip(ev, c, [sign(1, '1'), sign(2, 'X'), sign(3, '2')])).status, 400, 'no tips once a result is known');

  const live = (await call('GET', `/api/events/${ev.shareCode}`, null, b.token)).body;
  assert.equal(live.status, 'locked');
  assert.equal(live.entries.find(e => e.userId === a.id).picks.length, 3, 'shown once closed');
  assert.deepEqual(live.entries.map(e => [e.userId, e.correct]).sort(), [[a.id, 1], [b.id, 0]].sort());
  assert.equal(live.coupon.decided, 1);

  // A result can be changed or cleared; X is refused where a draw is impossible
  assert.equal((await setResult(ev, host, 1, '2')).status, 200);
  assert.deepEqual(db.getFullEvent(ev.id).entries.map(e => [e.userId, e.correct]).sort(), [[a.id, 0], [b.id, 1]].sort());
  assert.equal((await setResult(ev, host, 3, 'X')).status, 400);
  assert.equal((await setResult(ev, host, 9, '1')).status, 400, 'no such match');
  assert.equal((await setResult(ev, host, 1, null)).status, 200);
  assert.equal(db.getFullEvent(ev.id).coupon.decided, 0);
});

test('most correct takes the pot, a tie shares it, a struck match counts for nobody', async () => {
  const { host, friends, ev, sign } = await couponGame();
  const [a, b, c] = friends;
  await tip(ev, a, [sign(1, '1'), sign(2, 'X'), sign(3, '2')]);
  await tip(ev, b, [sign(1, '1'), sign(2, '1'), sign(3, '2')]);
  await tip(ev, c, [sign(1, '2'), sign(2, '2'), sign(3, '1')]);
  await setResult(ev, host, 1, '1');
  await setResult(ev, host, 2, 'X');
  const early = await call('POST', `/api/events/${ev.id}/finish`, {}, host.token);
  assert.equal(early.status, 400, 'every match needs a result first');
  assert.match(early.body.error, /1 kvar/);

  await setResult(ev, host, 3, 'void');
  assert.equal(db.getFullEvent(ev.id).coupon.matches[2].result, 'void');
  const fin = await call('POST', `/api/events/${ev.id}/finish`, {}, host.token);
  assert.equal(fin.status, 200, JSON.stringify(fin.body));
  assert.equal(fin.body.winner, a.nickname);
  const net = (u) => db.getUnifiedSettlementOverview(u.id).friends.reduce((s, f) => s + f.totalNet, 0);
  assert.equal(net(a), 100);
  assert.equal(net(b), -50);
  assert.equal(net(c), -50);
  assert.equal(db.getInbox(a.id).items.find(n => n.type === 'game_result').detail, 'Du hade 2 rätt – du vann 100 kr');
  assert.equal((await setResult(ev, host, 3, '1')).status, 400, 'a settled coupon is reopened before correcting');

  // Tie: two with the same number right share the pot
  const g = await couponGame();
  await tip(g.ev, g.friends[0], [g.sign(1, '1'), g.sign(2, '2'), g.sign(3, '1')]);
  await tip(g.ev, g.friends[1], [g.sign(1, '2'), g.sign(2, '1'), g.sign(3, '1')]);
  await tip(g.ev, g.friends[2], [g.sign(1, 'X'), g.sign(2, 'X'), g.sign(3, '1')]);
  for (const [no, s] of [[1, '1'], [2, '1'], [3, '2']]) await setResult(g.ev, g.host, no, s);
  const tie = await call('POST', `/api/events/${g.ev.id}/finish`, {}, g.host.token);
  assert.equal(tie.body.isTie, true);
  const n2 = (u) => db.getUnifiedSettlementOverview(u.id).friends.reduce((s, f) => s + f.totalNet, 0);
  assert.equal(n2(g.friends[0]) + n2(g.friends[1]), 50);
  assert.equal(n2(g.friends[2]), -50);
});

test('nobody right gives everyone their stake back; reopening keeps the results and the tips closed', async () => {
  const { host, friends, ev, sign } = await couponGame();
  await tip(ev, friends[0], [sign(1, '1'), sign(2, '1'), sign(3, '1')]);
  await tip(ev, friends[1], [sign(1, '1'), sign(2, '1'), sign(3, '1')]);
  for (const no of [1, 2, 3]) await setResult(ev, host, no, '2');
  assert.equal((await call('POST', `/api/events/${ev.id}/finish`, {}, host.token)).status, 200);
  for (const f of friends.slice(0, 2)) {
    assert.equal(db.getUnifiedSettlementOverview(f.id).friends.reduce((s, x) => s + x.totalNet, 0), 0);
  }

  const re = await call('POST', `/api/events/${ev.id}/reopen`, {}, host.token);
  assert.equal(re.body.status, 'locked');
  assert.equal(db.getFullEvent(ev.id).coupon.decided, 3, 'results kept for correcting one by one');
  assert.equal((await setResult(ev, host, 1, '1')).status, 200);

  // Before any result, reopening a closed coupon opens it for tips again
  const g = await couponGame();
  await call('POST', `/api/events/${g.ev.id}/lock`, {}, g.host.token);
  assert.equal((await call('POST', `/api/events/${g.ev.id}/reopen`, {}, g.host.token)).body.status, 'open');
});

test('a coupon\'s matches cannot be changed through the option routes', async () => {
  const { host, ev, sign } = await couponGame();
  assert.equal((await call('POST', `/api/events/${ev.id}/players`, { name: 'Ny' }, host.token)).status, 400);
  assert.equal((await call('DELETE', `/api/events/${ev.id}/players/${sign(1, 'X')}`, {}, host.token)).status, 400);
  assert.equal(db.getFullEvent(ev.id).coupon.matches[0].draw, true);
});

test('the new-game sheet, the game page and the result dialog offer the coupon', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  const t = read('pages/tournament.js');
  assert.match(t, /\{ id: 'coupon', icon: '📋', title: 'Tipsrad'/);
  assert.match(t, /betMode: [^\n]*isCoupon\(\) \? 'coupon'/);
  assert.match(t, /\.\.\.\(isCoupon\(\) \? \{ matches: couponRows\(\) \} : \{\}\)/);
  assert.match(t, /class="ng-match-x/, 'X can be turned off per match');
  const e = read('pages/event.js');
  assert.match(e, /event\.coupon\s*\? renderCouponSection\(event, couponView\(event\)\)/);
  assert.match(e, /b\.classList\.toggle\('on', on && b === btn\)/, 'one sign per match');
  assert.match(e, /Första rättningen stänger tippningen för alla/);
  assert.match(e, /if \(fresh\.coupon && !content\.querySelector\('\[data-coupon\]'\)\) refreshCoupon/, 'live standings, but a row being filled in is left alone');
  const m = read('components/finish-event-modal.js');
  assert.match(m, /if \(event\.betMode === 'picks' && event\.coupon\) return openCouponFinishModal/);
  assert.match(read('api.js'), /\/coupon-result`, \{ method: 'PUT'/);
});
