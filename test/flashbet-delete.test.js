import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../server/db.js';

// Setup test users
const creator = {
  id: 'test-delete-creator-' + Date.now(),
  nickname: 'DeleteCreator',
  real_name: 'Delete Creator',
  swish_number: '0709991111'
};

const friend = {
  id: 'test-delete-friend-' + Date.now(),
  nickname: 'DeleteFriend',
  real_name: 'Delete Friend',
  swish_number: '0709992222'
};

const otherUser = {
  id: 'test-delete-other-' + Date.now(),
  nickname: 'DeleteOther',
  real_name: 'Delete Other',
  swish_number: '0709993333'
};

// Seed users
db.createUser(creator.id, creator.nickname, 'token-' + creator.id, '🏌️', creator.real_name, creator.swish_number);
db.createUser(friend.id, friend.nickname, 'token-' + friend.id, '⛳', friend.real_name, friend.swish_number);
db.createUser(otherUser.id, otherUser.nickname, 'token-' + otherUser.id, '🎯', otherUser.real_name, otherUser.swish_number);

test('Delete FlashBet — Creator can delete bet when nobody has voted', () => {
  const fbId = 'fb-del-empty-' + Date.now();
  const durationSeconds = 120;
  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

  db.createFlashBet(fbId, creator.id, null, 'Kommer han att missa putten?', durationSeconds, expiresAt, 20);

  const activeBefore = db.getActiveFlashBets(creator.id);
  assert.ok(activeBefore.some(b => b.id === fbId), 'Bet is initially active');

  const result = db.deleteFlashBet(fbId, creator.id);
  assert.equal(result.success, true);
  assert.equal(result.id, fbId);

  const activeAfter = db.getActiveFlashBets(creator.id);
  assert.ok(!activeAfter.some(b => b.id === fbId), 'Bet is no longer active');

  const fetched = db.getFlashBet(fbId, creator.id);
  assert.equal(fetched, null, 'Deleted bet returns null on get');
});

test('Delete FlashBet — Non-creator cannot delete the bet', () => {
  const fbId = 'fb-del-unauth-' + Date.now();
  const durationSeconds = 120;
  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

  db.createFlashBet(fbId, creator.id, null, 'Träffar bollen trädet?', durationSeconds, expiresAt, 20);

  assert.throws(() => {
    db.deleteFlashBet(fbId, otherUser.id);
  }, /Endast skaparen kan ta bort vadet/);

  // Still active
  const active = db.getActiveFlashBets(creator.id);
  assert.ok(active.some(b => b.id === fbId), 'Bet still exists after unauthorized attempt');
});

test('Delete FlashBet — Can delete while only one friend has voted (the vote is removed too)', () => {
  const fbId = 'fb-del-onevote-' + Date.now();
  const durationSeconds = 120;
  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

  db.createFlashBet(fbId, creator.id, null, 'Går bollen i vattnet?', durationSeconds, expiresAt, 20);
  db.placeFlashBetEntry('entry-' + Date.now(), fbId, friend.id, 'yes', 20);

  const result = db.deleteFlashBet(fbId, creator.id);
  assert.equal(result.success, true);
  assert.deepEqual(result.removedEntryUserIds, [friend.id]);
  assert.equal(db.getFlashBet(fbId, creator.id), null);
});

test('Delete FlashBet — Cannot delete bet after two or more friends have voted', () => {
  const fbId = 'fb-del-voted-' + Date.now();
  const durationSeconds = 120;
  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

  db.createFlashBet(fbId, creator.id, null, 'Går bollen i vattnet?', durationSeconds, expiresAt, 20);
  db.placeFlashBetEntry('entry-a-' + Date.now(), fbId, friend.id, 'yes', 20);
  db.placeFlashBetEntry('entry-b-' + Date.now(), fbId, otherUser.id, 'no', 20);

  assert.throws(() => {
    db.deleteFlashBet(fbId, creator.id);
  }, /flera redan har lagt bet/);

  // Bet remains intact
  const fetched = db.getFlashBet(fbId, creator.id);
  assert.ok(fetched !== null);
  assert.equal(fetched.entriesCount, 2);
});

test('Delete FlashBet — Cannot delete already settled bet', () => {
  const fbId = 'fb-del-settled-' + Date.now();
  const durationSeconds = 120;
  const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

  db.createFlashBet(fbId, creator.id, null, 'Sänker han på 1 slag?', durationSeconds, expiresAt, 20);
  db.placeFlashBetEntry('entry-settle-' + Date.now(), fbId, friend.id, 'yes', 20);
  db.settleFlashBet(fbId, 'yes', creator.id);

  assert.throws(() => {
    db.deleteFlashBet(fbId, creator.id);
  }, /Vadet är redan avgjort och kan inte tas bort/);
});
