process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

test('Admin Broadcast Push — DB methods for push subscriptions', () => {
  // Test getAllPushSubscriptions exists and returns an array
  const initialSubs = db.getAllPushSubscriptions();
  assert.ok(Array.isArray(initialSubs), 'getAllPushSubscriptions should return an array');

  // Create a test user first to satisfy foreign key
  const testUserId = 'test-u-' + crypto.randomBytes(4).toString('hex');
  const nickname = 'PushUser' + crypto.randomBytes(3).toString('hex');
  db.createUser(testUserId, nickname, 'token-' + testUserId, '🎮', 'Test User', '0700000000', '1234');

  // Insert test subscription
  const testSubId = 'test-sub-' + crypto.randomBytes(4).toString('hex');
  const testEndpoint = 'https://fcm.googleapis.com/fcm/send/' + testSubId;

  db.savePushSubscription(testSubId, testUserId, testEndpoint, 'test-p256dh-key', 'test-auth-key');

  const updatedSubs = db.getAllPushSubscriptions();
  const found = updatedSubs.find(s => s.endpoint === testEndpoint);
  assert.ok(found, 'Should find inserted push subscription');
  assert.equal(found.endpoint, testEndpoint);
  assert.equal(found.user_id, testUserId);

  // Clean up subscription
  db.deletePushSubscriptionByEndpoint(testEndpoint);
  const afterDelete = db.getAllPushSubscriptions();
  assert.equal(afterDelete.some(s => s.endpoint === testEndpoint), false, 'Should delete subscription by endpoint');
});
