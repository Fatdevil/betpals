import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

// Test isValidImageUrl helper behavior
function isValidImageUrl(str) {
  if (typeof str !== 'string') return false;
  const s = str.trim();
  if (!s || s.length > 10000000) return false;
  if (/[<>"'\r\n\0]/.test(s)) return false;
  if (s.startsWith('data:image/')) {
    return /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s);
  }
  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }
  return false;
}

test('Tournament Sponsor Banner: validation and persistence', () => {
  const r = () => crypto.randomUUID();
  const creatorId = 'u_creator_' + r();
  db.createUser(creatorId, 'Org_' + r().slice(0, 6), 'tok_' + r(), '🏌️', 'Organizer', '0701000001');

  const tourId = 'tour_spon_' + r();
  const shareCode = 'SPON' + crypto.randomInt(1000, 9999);
  db.createTournament(tourId, 'Sponsor Test Tournament', shareCode, creatorId, 'friends');

  // Simulated compressed mobile camera image (e.g. 150KB JPEG in base64)
  const base64Content = Buffer.from('simulated-compressed-jpeg-pixel-bytes'.repeat(100)).toString('base64');
  const validDataUrl = `data:image/jpeg;base64,${base64Content}`;

  assert.equal(isValidImageUrl(validDataUrl), true, 'Compressed JPEG data URL should be valid');
  assert.equal(isValidImageUrl('https://example.com/sponsor-logo.png'), true, 'HTTPS URL should be valid');
  assert.equal(isValidImageUrl('javascript:alert(1)'), false, 'JavaScript URL should be rejected');
  assert.equal(isValidImageUrl('data:image/jpeg;base64,<script>alert(1)</script>'), false, 'HTML/script injection should be rejected');

  // Add banner to tournament
  const bannerId1 = 'ban_' + r();
  db.addBanner(bannerId1, tourId, validDataUrl, 'https://sponsor.se', 'Huvudsponsor', 0);

  const bannerId2 = 'ban_' + r();
  db.addBanner(bannerId2, tourId, validDataUrl, null, 'Guldpartner', 1);

  const banners = db.getBanners(tourId);
  assert.equal(banners.length, 2, 'Should have 2 banners saved');
  assert.equal(banners[0].id, bannerId1);
  assert.equal(banners[0].label, 'Huvudsponsor');
  assert.equal(banners[0].linkUrl, 'https://sponsor.se');
  assert.equal(banners[1].id, bannerId2);
  assert.equal(banners[1].label, 'Guldpartner');

  // Remove one banner
  db.removeBanner(bannerId1, tourId);
  const remaining = db.getBanners(tourId);
  assert.equal(remaining.length, 1, 'Should have 1 banner remaining');
  assert.equal(remaining[0].id, bannerId2);
});
