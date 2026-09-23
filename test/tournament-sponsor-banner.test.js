import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

// Test isValidImageUrl helper behavior
function isValidImageUrl(str) {
  if (typeof str !== 'string') return false;
  const s = str.trim();
  if (!s || s.length > 15000000) return false;
  if (s.startsWith('data:image/')) {
    const cleaned = s.replace(/[\r\n\s]+/g, '');
    if (/[<>"'\0]/.test(cleaned)) return false;
    return /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml|heic|heif|avif);base64,[A-Za-z0-9+/=]+$/.test(cleaned);
  }
  if (/[<>"'\r\n\0]/.test(s)) return false;
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
  db.createUser(creatorId, 'Org_' + r().slice(0, 6), 'tok_' + r(), '🏌️', 'Organizer', '070' + Math.floor(1000000 + Math.random() * 9000000));

  const tourId = 'tour_spon_' + r();
  const shareCode = 'SP' + r().replace(/-/g, '').slice(0, 8).toUpperCase();
  db.createTournament(tourId, 'Sponsor Test Tournament', shareCode, creatorId, 'friends');

  // Simulated compressed mobile camera image (e.g. 150KB JPEG in base64)
  const base64Content = Buffer.from('simulated-compressed-jpeg-pixel-bytes'.repeat(100)).toString('base64');
  const validDataUrl = `data:image/jpeg;base64,${base64Content}`;

  assert.equal(isValidImageUrl(validDataUrl), true, 'Compressed JPEG data URL should be valid');
  assert.equal(isValidImageUrl('data:image/jpeg;base64,' + base64Content.slice(0, 50) + '\r\n' + base64Content.slice(50)), true, 'Base64 with newlines should be accepted and valid');
  assert.equal(isValidImageUrl('data:image/heic;base64,' + base64Content), true, 'HEIC base64 data URL should be valid');
  assert.equal(isValidImageUrl('data:image/heif;base64,' + base64Content), true, 'HEIF base64 data URL should be valid');
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

test('Tournament Sponsor Banner: getFullEvent includes parent tournament banners for betting page', () => {
  const r = () => crypto.randomUUID();
  const creatorId = 'u_creator_' + r();
  db.createUser(creatorId, 'Org_' + r().slice(0, 6), 'tok_' + r(), '🏌️', 'Organizer', '070' + Math.floor(1000000 + Math.random() * 9000000));

  const tourId = 'tour_spon_' + r();
  const shareCode = 'SP' + r().replace(/-/g, '').slice(0, 8).toUpperCase();
  db.createTournament(tourId, 'Sponsor Event Test', shareCode, creatorId, 'friends');

  const bannerId1 = 'ban_' + r();
  const base64Content = Buffer.from('test-banner-img-1').toString('base64');
  const validDataUrl = `data:image/png;base64,${base64Content}`;
  db.addBanner(bannerId1, tourId, validDataUrl, 'https://sponsor-a.com', 'Huvudsponsor 2026', 0);

  const bannerId2 = 'ban_' + r();
  db.addBanner(bannerId2, tourId, validDataUrl, 'https://sponsor-b.com', 'Silverpartner', 1);

  // Add round (match/game) to tournament
  const roundEventId = 'ev_round_' + r();
  const roundCode = 'RND' + Date.now().toString(36) + crypto.randomInt(1000, 9999);
  db.createEvent({
    id: roundEventId,
    name: 'Final Match 18 Hål',
    shareCode: roundCode,
    creatorId,
    tournamentId: tourId,
    minBet: 10,
    maxBet: 500,
    payoutPercent: 100
  }, ['Alice', 'Bob']);

  // Fetch full event (as used by the betting page /api/events/:code)
  const fullRound = db.getFullEvent(roundCode);
  assert.ok(fullRound, 'Full round event should be retrieved');
  assert.equal(fullRound.tournamentId, tourId, 'Event should be linked to tournament');
  assert.ok(Array.isArray(fullRound.banners), 'Event should have banners array');
  assert.equal(fullRound.banners.length, 2, 'Betting page should receive both tournament sponsor banners');
  assert.equal(fullRound.banners[0].id, bannerId1);
  assert.equal(fullRound.banners[0].label, 'Huvudsponsor 2026');
  assert.equal(fullRound.banners[0].linkUrl, 'https://sponsor-a.com');
  assert.equal(fullRound.banners[1].id, bannerId2);
  assert.equal(fullRound.banners[1].label, 'Silverpartner');

  // Verify standalone event (not in tournament) has empty banners array
  const standEventId = 'ev_stand_' + r();
  const standCode = 'STD' + crypto.randomInt(1000, 9999);
  db.createEvent({
    id: standEventId,
    name: 'Standalone Bet',
    shareCode: standCode,
    creatorId,
    minBet: 10,
    maxBet: 500,
    payoutPercent: 100
  }, ['Option 1', 'Option 2']);

  const fullStand = db.getFullEvent(standCode);
  assert.ok(fullStand, 'Standalone event should be retrieved');
  assert.ok(Array.isArray(fullStand.banners), 'Standalone event should have banners array');
  assert.equal(fullStand.banners.length, 0, 'Standalone event should have empty banners');
});

test('Tournament Sponsor Banner: renderSponsorCarousel markup generation', async () => {
  const { renderSponsorCarousel } = await import('../src/components/sponsor-carousel.js');

  // Empty banners
  assert.equal(renderSponsorCarousel([]), '');
  assert.equal(renderSponsorCarousel(null), '');

  // Single banner
  const single = [{
    id: 'b1',
    imageData: 'data:image/png;base64,abc',
    linkUrl: 'https://example.com',
    label: 'Main Sponsor'
  }];
  const htmlSingle = renderSponsorCarousel(single, { isCreator: true, carouselId: 'test-single' });
  assert.ok(htmlSingle.includes('id="test-single"'), 'Should render container with ID');
  assert.ok(htmlSingle.includes('class="sponsor-slide"'), 'Should render slide');
  assert.ok(htmlSingle.includes('href="https://example.com"'), 'Should render safe link');
  assert.ok(htmlSingle.includes('Main Sponsor'), 'Should render label');
  assert.ok(htmlSingle.includes('sponsor-delete-btn'), 'Should render delete button for creator');
  assert.ok(!htmlSingle.includes('sponsor-dots'), 'Single banner should not render navigation dots');

  // Multiple banners
  const multi = [
    { id: 'b1', imageData: 'data:image/png;base64,abc', linkUrl: 'https://sponsor1.se', label: 'Sponsor 1' },
    { id: 'b2', imageData: 'data:image/png;base64,def', linkUrl: null, label: 'Sponsor 2' }
  ];
  const htmlMulti = renderSponsorCarousel(multi, { isCreator: false, carouselId: 'test-multi' });
  assert.ok(htmlMulti.includes('class="sponsor-dots"'), 'Multiple banners should render navigation dots');
  assert.ok(htmlMulti.includes('data-index="0"'), 'Should have index 0 dot');
  assert.ok(htmlMulti.includes('data-index="1"'), 'Should have index 1 dot');
  assert.ok(!htmlMulti.includes('sponsor-delete-btn'), 'Non-creator should not see delete button');
});

test('Tournament Sponsor Banner: initSponsorCarousel lifecycle and touch handlers', async () => {
  const { initSponsorCarousel } = await import('../src/components/sponsor-carousel.js');

  const listeners = {};
  const mockTrack = {
    scrollLeft: 0,
    style: {},
    addEventListener: (ev, fn) => { listeners[ev] = fn; },
    removeEventListener: (ev) => { delete listeners[ev]; },
    querySelectorAll: (sel) => {
      if (sel === '.sponsor-slide') {
        return [
          { offsetLeft: 0, offsetParent: mockTrack, getBoundingClientRect: () => ({ left: 20, width: 300 }) },
          { offsetLeft: 308, offsetParent: mockTrack, getBoundingClientRect: () => ({ left: 328, width: 300 }) }
        ];
      }
      return [];
    },
    getBoundingClientRect: () => ({ left: 20, width: 350 }),
    scrollTo: () => {}
  };

  const mockDots = [
    { classList: { toggle: () => {} }, setAttribute: () => {}, removeAttribute: () => {}, addEventListener: () => {} },
    { classList: { toggle: () => {} }, setAttribute: () => {}, removeAttribute: () => {}, addEventListener: () => {} }
  ];

  const mockContainer = {
    querySelector: (sel) => sel === '.sponsor-carousel' ? mockTrack : null,
    querySelectorAll: (sel) => sel === '.sponsor-dot' ? mockDots : []
  };

  const banners = [{ id: '1' }, { id: '2' }];
  const cleanup = initSponsorCarousel(mockContainer, banners, 10000);

  assert.ok(typeof cleanup === 'function', 'Cleanup should be a function');
  assert.ok(typeof listeners['touchstart'] === 'function', 'Touchstart listener should be registered');
  assert.ok(typeof listeners['touchend'] === 'function', 'Touchend listener should be registered');
  assert.ok(typeof listeners['touchcancel'] === 'function', 'Touchcancel listener should be registered');
  assert.ok(typeof listeners['scroll'] === 'function', 'Scroll listener should be registered');

  // Verify cleanup removes listeners
  cleanup();
  assert.equal(listeners['touchstart'], undefined, 'Touchstart should be cleaned up');
  assert.equal(listeners['touchend'], undefined, 'Touchend should be cleaned up');
  assert.equal(listeners['touchcancel'], undefined, 'Touchcancel should be cleaned up');
  assert.equal(listeners['scroll'], undefined, 'Scroll should be cleaned up');
});
