import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profileSource = readFileSync(new URL('../src/pages/profile.js', import.meta.url), 'utf8');

test('Friends list UX: No dangerous naked unfriend cross in the list row', () => {
  // Ensure the old dangerous button is gone from the friend row template
  assert.doesNotMatch(
    profileSource,
    /<button class="btn btn-sm remove-friend-btn"[^>]*>\s*✕\s*<\/button>/,
    'The dangerous naked ✕ button should not exist on the friend list item'
  );

  // Ensure the friendly "Mer ▾" options button and clickable row exist
  assert.match(
    profileSource,
    /class="friend-item[^"]*"[^>]*data-id="\$\{f\.id\}"[^>]*role="button"/,
    'Friend item row must be an interactive button element'
  );
  assert.match(
    profileSource,
    /class="btn btn-sm btn-secondary friend-manage-btn"/,
    'Friend row must have a friend-manage-btn with options indicator'
  );
});

test('Friends UX: Dedicated friend options modal with 2-step unfriend safety', () => {
  assert.match(profileSource, /function showFriendOptionsModal\(friend\)/);
  assert.match(profileSource, /id="friend-unfriend-confirm-box"/);
  assert.match(profileSource, /id="btn-cancel-unfriend"/);
  assert.match(profileSource, /id="btn-confirm-unfriend"/);
  assert.match(profileSource, /await removeFriend\(friend\.id\)/);

  // Ensure browser confirm() is no longer used for unfriend
  assert.doesNotMatch(
    profileSource,
    /confirm\(`Vill du ta bort @\$\{friendName\} från dina vänner\?`\)/,
    'Native browser confirm() alert must not be used for unfriending'
  );
});
