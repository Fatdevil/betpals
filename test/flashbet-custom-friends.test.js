import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../server/db.js';

// Setup test users
const creator = {
  id: 'test-custom-creator-' + Date.now(),
  nickname: 'FlashCreator',
  real_name: 'Flash Creator',
  swish_number: '0709990001'
};

const friend1 = {
  id: 'test-custom-friend1-' + Date.now(),
  nickname: 'InvitedFriend1',
  real_name: 'Invited Friend One',
  swish_number: '0709990002'
};

const friend2 = {
  id: 'test-custom-friend2-' + Date.now(),
  nickname: 'InvitedFriend2',
  real_name: 'Invited Friend Two',
  swish_number: '0709990003'
};

const stranger = {
  id: 'test-custom-stranger-' + Date.now(),
  nickname: 'UninvitedStranger',
  real_name: 'Uninvited Stranger',
  swish_number: '0709990004'
};

// Seed users
db.createUser(creator.id, creator.nickname, 'token-' + creator.id, '🏌️', creator.real_name, creator.swish_number);
db.createUser(friend1.id, friend1.nickname, 'token-' + friend1.id, '⛳', friend1.real_name, friend1.swish_number);
db.createUser(friend2.id, friend2.nickname, 'token-' + friend2.id, '🦅', friend2.real_name, friend2.swish_number);
db.createUser(stranger.id, stranger.nickname, 'token-' + stranger.id, '🎯', stranger.real_name, stranger.swish_number);

test('Custom Minutes — FlashBet supports custom minute duration up to 24h', () => {
  const fbId = 'fb-mins-' + Date.now();
  const durationMinutes = 15;
  const durationSeconds = durationMinutes * 60; // 900 seconds
  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

  const created = db.createFlashBet(fbId, creator.id, null, 'Sätter han eagle på hål 9?', durationSeconds, expiresAt, 50);

  assert.equal(created.durationSeconds, 900, 'Duration is 900 seconds (15 minutes)');
  assert.ok(created.secondsLeft > 850 && created.secondsLeft <= 900, 'Seconds left reflects 15 minutes');
  assert.equal(created.status, 'open', 'Bet is open');

  const fetched = db.getFlashBet(fbId, creator.id);
  assert.equal(fetched.durationSeconds, 900);
});

test('Target Friends — FlashBet restricted to selected targetUserIds', () => {
  const fbId = 'fb-target-' + Date.now();
  const durationSeconds = 120; // 2 minutes
  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
  const targetUserIds = [friend1.id, friend2.id];

  const created = db.createFlashBet(fbId, creator.id, null, 'Träffar bollen bunkern?', durationSeconds, expiresAt, 20, targetUserIds);

  assert.deepEqual(created.targetUserIds, targetUserIds, 'Stored targetUserIds match invited friends');

  // Creator can see it in active bets
  const creatorActive = db.getActiveFlashBets(creator.id);
  assert.ok(creatorActive.some(b => b.id === fbId), 'Creator sees targeted FlashBet');

  // Invited friend 1 can see it
  const friend1Active = db.getActiveFlashBets(friend1.id);
  assert.ok(friend1Active.some(b => b.id === fbId), 'Invited friend 1 sees targeted FlashBet');

  // Invited friend 2 can see it
  const friend2Active = db.getActiveFlashBets(friend2.id);
  assert.ok(friend2Active.some(b => b.id === fbId), 'Invited friend 2 sees targeted FlashBet');

  // Non-invited stranger CANNOT see it in active bets
  const strangerActive = db.getActiveFlashBets(stranger.id);
  assert.ok(!strangerActive.some(b => b.id === fbId), 'Uninvited stranger does NOT see targeted FlashBet');

  // Unauthenticated user CANNOT see it
  const unauthActive = db.getActiveFlashBets(null);
  assert.ok(!unauthActive.some(b => b.id === fbId), 'Unauthenticated user does NOT see targeted FlashBet');

  // Non-invited user cannot place an entry
  assert.throws(() => {
    db.placeFlashBetEntry('entry-stranger-' + Date.now(), fbId, stranger.id, 'yes', 20);
  }, /inte inbjuden/);

  // Invited user can place an entry
  const updated = db.placeFlashBetEntry('entry-friend1-' + Date.now(), fbId, friend1.id, 'yes', 20);
  assert.equal(updated.yesCount, 1, 'Friend 1 vote registered successfully');
});

test('Untargeted FlashBet — Open to everyone when targetUserIds is null or empty', () => {
  const fbId = 'fb-open-' + Date.now();
  const durationSeconds = 60;
  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

  db.createFlashBet(fbId, creator.id, null, 'Allmän fråga för alla?', durationSeconds, expiresAt, 20, null);

  const strangerActive = db.getActiveFlashBets(stranger.id);
  assert.ok(strangerActive.some(b => b.id === fbId), 'Anyone can see open FlashBet');

  const unauthActive = db.getActiveFlashBets(null);
  assert.ok(unauthActive.some(b => b.id === fbId), 'Public list shows open FlashBet');

  // Stranger can vote
  const voted = db.placeFlashBetEntry('entry-open-' + Date.now(), fbId, stranger.id, 'no', 20);
  assert.equal(voted.noCount, 1, 'Vote registered on open bet');
});
