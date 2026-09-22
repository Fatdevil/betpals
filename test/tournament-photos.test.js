import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as db from '../server/db.js';

test('Tournament Photos: upload, like toggling, retrieval and deletion', () => {
  const r = () => crypto.randomUUID();
  const creatorId = 'u_creator_' + r();
  db.createUser(creatorId, 'Fotografen_' + r().slice(0, 5), 'tok_' + r(), '📸', 'Foto Fotograf', '070' + crypto.randomInt(1000000, 9999999));

  const tourId = 'tour_photo_' + r();
  const shareCode = 'FOTO' + crypto.randomInt(1000, 9999);
  db.createTournament(tourId, 'Fototävling', shareCode, creatorId, 'friends');

  const photoId = 'ph_' + r();
  const photoUrl = 'https://res.cloudinary.com/demo/image/upload/v12345/test.jpg';
  const thumbUrl = 'https://res.cloudinary.com/demo/image/upload/w_400,h_400,c_fill/v12345/test.jpg';
  const caption = 'Kolla in detta ögonblick!';

  // 1. Add photo
  db.addTournamentPhoto(photoId, tourId, creatorId, photoUrl, thumbUrl, caption);

  // 2. Fetch photos
  let photos = db.getPhotosByTournament(tourId, creatorId);
  assert.equal(photos.length, 1, 'Should find 1 photo');
  assert.equal(photos[0].id, photoId);
  assert.equal(photos[0].caption, caption);
  assert.equal(photos[0].url, photoUrl);
  assert.ok(photos[0].uploader_name.startsWith('Fotografen_'));
  assert.equal(photos[0].uploader_emoji, '📸');
  assert.equal(photos[0].like_count, 0);
  assert.equal(photos[0].user_liked, false);

  // 3. User 2 likes the photo
  const user2Id = 'u_fan_' + r();
  db.createUser(user2Id, 'Hejaklacken_' + r().slice(0, 5), 'tok_' + r(), '🎉', 'Fan Fansson', '070' + crypto.randomInt(1000000, 9999999));

  const isLiked1 = db.togglePhotoLike(photoId, user2Id);
  assert.equal(isLiked1, true, 'First toggle should like photo');

  // Verify like count and user2 liked status
  const photosAfterLike = db.getPhotosByTournament(tourId, user2Id);
  assert.equal(photosAfterLike[0].like_count, 1, 'Like count should be 1');
  assert.equal(photosAfterLike[0].user_liked, true, 'user2 should see user_liked = true');

  // Verify creator sees like count 1 but user_liked = false
  const photosForCreator = db.getPhotosByTournament(tourId, creatorId);
  assert.equal(photosForCreator[0].like_count, 1, 'Creator should see like count 1');
  assert.equal(photosForCreator[0].user_liked, false, 'Creator should see user_liked = false');

  // 4. User 2 unlikes the photo
  const isLiked2 = db.togglePhotoLike(photoId, user2Id);
  assert.equal(isLiked2, false, 'Second toggle should unlike photo');

  const photosAfterUnlike = db.getPhotosByTournament(tourId, user2Id);
  assert.equal(photosAfterUnlike[0].like_count, 0, 'Like count should revert to 0');
  assert.equal(photosAfterUnlike[0].user_liked, false, 'user2 should see user_liked = false');

  // 5. Test getUserTournamentPhotos
  const userPhotos = db.getUserTournamentPhotos(creatorId);
  const found = userPhotos.find(p => p.id === photoId);
  assert.ok(found, 'Photo should appear in creators tournament photos');
  assert.equal(found.tournamentCode, shareCode);
  assert.ok(found.uploaderName.startsWith('Fotografen_'));
  assert.equal(found.uploaderEmoji, '📸');

  // 6. Delete photo
  db.deleteTournamentPhoto(photoId);
  const photosAfterDelete = db.getPhotosByTournament(tourId);
  assert.equal(photosAfterDelete.length, 0, 'Photo should be deleted');
});
