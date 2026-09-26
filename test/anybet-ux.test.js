import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/components/minigames.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const anybet = js.slice(js.indexOf('export async function openAnyBetModal('), js.indexOf('export function showIncomingAnyBetModal('));

test('AnyBet stakes are whole kronor', () => {
  assert.match(server, /stake = Math\.round\(parsed\);/);
});

test('the judge must actively pick the result and sees who pays whom first', () => {
  assert.match(anybet, /let chosenWinnerId = null;\s+let chosenSide = null;/);
  assert.match(anybet, /id="btn-confirm-settle" disabled/);
  assert.match(anybet, /id="settle-summary"/);
});

test('yes/no pot counts only people who picked a side, and labels are Swedish', () => {
  assert.match(anybet, /const inPot = isYesNo \? acceptedParticipants\.filter\(p => p\.choice === 'yes' \|\| p\.choice === 'no'\)/);
  assert.doesNotMatch(anybet, /p\.choice\.toUpperCase\(\)/);
});

test('linking to an event is visible and optional; paying happens on The Tab', () => {
  assert.match(anybet, /id="anybet-link-event" checked/);
  assert.match(anybet, /linkEvent && linkChecked \? linkEvent : null/);
  assert.doesNotMatch(anybet, /swish-pay-btn/);
  assert.match(anybet, /btn-anybet-goto-tab/);
});

test('proof pictures are compressed and loaded safely', () => {
  assert.match(anybet, /compressImage\(file, 1000, 0\.8\)/);
  assert.doesNotMatch(anybet, /<img src="\$\{bet\.proof_image_url\}"/);
});

import crypto from 'node:crypto';
process.env.NODE_ENV = 'test';
const db = await import('../server/db.js');

function makeUser(name) {
  const id = crypto.randomUUID();
  db.createUser(id, name + crypto.randomBytes(3).toString('hex'), crypto.randomUUID(), '🙂', name, '07' + String(crypto.randomInt(1e7, 9e7)), '1111');
  return db.getUserById(id);
}

test('yes/no: the judge decides the answer and cannot pick a side', () => {
  const a = makeUser('Anna'), b = makeUser('Bosse'), judge = makeUser('Cissi');
  const bet = db.createAnyBet({ title: 'Regnar det?', creatorId: a.id, judgeId: judge.id, stakeAmount: 20, betType: 'yes_no', participantIds: [b.id, judge.id] });
  assert.throws(() => db.updateAnyBetChoice(bet.id, judge.id, 'yes'), /Domaren/);
  db.updateAnyBetChoice(bet.id, b.id, 'no');
});

test('the creator can organise without playing', () => {
  const a = makeUser('Anna'), b = makeUser('Bosse'), c = makeUser('Cissi');
  const bet = db.createAnyBet({ title: 'Vem vinner?', creatorId: a.id, judgeId: a.id, stakeAmount: 50, betType: 'winner_takes_all', participantIds: [b.id, c.id], creatorPlays: false });
  assert.equal(bet.participants.some(p => p.user_id === a.id), false);
  db.acceptAnyBet(bet.id, b.id);
  db.acceptAnyBet(bet.id, c.id);
  const settled = db.settleAnyBet({ betId: bet.id, judgeId: a.id, winnerId: b.id });
  assert.equal(db.getAnyBetSettlement(settled, a.id).outcome, 'observer');
  assert.equal(db.getAnyBetSettlement(settled, c.id).amountOwed, 50);
  assert.ok(db.getAnyBetsForUser(a.id).some(x => x.id === bet.id), 'the organiser still sees the bet');
});

test('the create form offers "I play myself" and explains the judge rule', () => {
  assert.match(anybet, /id="anybet-creator-plays" checked/);
  assert.match(anybet, /Domaren avgör svaret och väljer ingen sida/);
  assert.match(anybet, /Domaren spelar själv/);
  assert.match(server, /Bjud in minst två personer när du inte spelar själv/);
});
