process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as db from '../server/db.js';

const uid = () => crypto.randomUUID();
function makeUser(name) {
  const id = uid();
  db.createUser(id, name + crypto.randomBytes(3).toString('hex'), uid(), '🙂', name, '07' + String(crypto.randomInt(1e7, 9e7)), '1111');
  return db.getUserById(id);
}
function game(tId, bets, winners) {
  const ev = uid();
  const ids = [uid(), uid(), uid()];
  db.createEvent({ id: ev, name: 'Spel', tournamentId: tId, isSideBet: true }, ids.map((id, i) => ({ id, name: 'Val ' + i })));
  for (const [u, opt, amount] of bets) db.addBet(uid(), ev, u.nickname, ids[opt], amount, u.id);
  if (winners) db.finishEvent(ev, winners.map(w => ids[w]).join(','));
  return ev;
}

test('profile stats follow The Tab: shared wins count as wins, refunds are not losses', () => {
  const a = makeUser('Anna'), b = makeUser('Bosse'), c = makeUser('Cissi');
  const tId = uid();
  db.createTournament(tId, 'Test', crypto.randomBytes(3).toString('hex').toUpperCase(), a.id, 'friends', []);
  game(tId, [[a, 0, 100], [b, 1, 100], [c, 2, 100]], [0, 1]); // shared win: A and B split 300
  game(tId, [[a, 2, 50], [b, 2, 50]], [0]); // nobody backed the winner: refunded
  game(tId, [[a, 0, 20]]); // still open

  const sa = db.getUserStats(a.id);
  assert.equal(sa.wins, 1);
  assert.equal(sa.losses, 0);
  assert.equal(sa.pending, 1);
  assert.equal(sa.netProfit, 50);

  const sc = db.getUserStats(c.id);
  assert.equal(sc.losses, 1);
  assert.equal(sc.netProfit, -100);

  const tab = db.getTournamentNetSettlement(tId);
  const byUser = Object.fromEntries(tab.balances.map(x => [x.userId, x.net]));
  assert.equal(sa.netProfit, byUser[a.id]);
  assert.equal(sc.netProfit, byUser[c.id]);
});

test('a BlixtBet lost against three winners counts as one loss', () => {
  const host = makeUser('Host'), loser = makeUser('Loser');
  const winners = [makeUser('W1'), makeUser('W2'), makeUser('W3')];
  const fb = uid();
  db.createFlashBet(fb, host.id, null, 'Regn?', 60, new Date(Date.now() + 60000).toISOString(), 90);
  for (const w of winners) db.placeFlashBetEntry(uid(), fb, w.id, 'yes', 90);
  db.placeFlashBetEntry(uid(), fb, loser.id, 'no', 90);
  db.settleFlashBet(fb, 'yes', host.id);

  const s = db.getUserStats(loser.id);
  assert.equal(s.losses, 1);
  assert.equal(s.netProfit, -90);
  assert.equal(db.getUserStats(winners[0].id).wins, 1);
});

test('profile escapes editable fields and loads images through safeImageSrc', () => {
  const js = readFileSync(new URL('../src/pages/profile.js', import.meta.url), 'utf8');
  assert.match(js, /value="\$\{escapeHtml\(user\.realName \|\| ''\)\}"/);
  assert.match(js, /value="\$\{escapeHtml\(user\.nickname \|\| ''\)\}"/);
  assert.doesNotMatch(js, /sanitizeUrl\(user\.avatarUrl\)/);
  assert.doesNotMatch(js, /<img src="\$\{f\.avatarUrl\}"/);
  assert.match(js, /detachPushFromAccount/);
});

test('profile fits on a short page: settings live in sheets, logout asks first', () => {
  const js = readFileSync(new URL('../src/pages/profile.js', import.meta.url), 'utf8');
  for (const id of ['row-notifications', 'row-install', 'row-pin', 'row-support', 'row-language']) {
    assert.match(js, new RegExp(`id="${id}"`));
  }
  assert.match(js, /bets\.slice\(0, 3\)\.map\(betRow\)/);
  assert.match(js, /if \(!confirm\(isEn \? 'Log out/);
  const page = js.slice(js.indexOf('function renderProfileContent'), js.indexOf('function groupPhotoAlbums'));
  assert.doesNotMatch(page, /profile-chip\.png/);
  assert.doesNotMatch(page, /FaceID \/ TouchID/);
});
