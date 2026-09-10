// ── SQLite Database Layer ─────────────────────────────
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, 'betpals.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ───────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    google_id TEXT UNIQUE,
    email TEXT,
    avatar_url TEXT,
    avatar_emoji TEXT DEFAULT '🎲',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tournament_photos (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    caption TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_photos_tournament ON tournament_photos(tournament_id);

  CREATE TABLE IF NOT EXISTS tournament_photo_likes (
    photo_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (photo_id, user_id),
    FOREIGN KEY (photo_id) REFERENCES tournament_photos(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    share_code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    creator_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    share_code TEXT UNIQUE NOT NULL,
    payout_percent INTEGER NOT NULL DEFAULT 100,
    min_bet INTEGER NOT NULL DEFAULT 10,
    max_bet INTEGER NOT NULL DEFAULT 10000,
    winner_id TEXT,
    creator_id TEXT,
    swish_number TEXT,
    tournament_id TEXT,
    is_side_bet INTEGER NOT NULL DEFAULT 0,
    linked_round_id TEXT,
    bet_mode TEXT NOT NULL DEFAULT 'open',
    image_url TEXT,
    winner_image_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    image_url TEXT,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bets (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    bettor_name TEXT NOT NULL,
    player_id TEXT NOT NULL,
    user_id TEXT,
    amount INTEGER NOT NULL,
    paid INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_players_event ON players(event_id);
  CREATE INDEX IF NOT EXISTS idx_bets_event ON bets(event_id);
  CREATE INDEX IF NOT EXISTS idx_bets_player ON bets(player_id);
  CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id);
  CREATE INDEX IF NOT EXISTS idx_events_share_code ON events(share_code);
  CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);

  CREATE TABLE IF NOT EXISTS tournament_banners (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    image_data TEXT NOT NULL,
    link_url TEXT,
    label TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_banners_tournament ON tournament_banners(tournament_id);
`);

try { db.exec('ALTER TABLE events ADD COLUMN is_side_bet INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE events ADD COLUMN linked_round_id TEXT'); } catch {}
try { db.exec('ALTER TABLE events ADD COLUMN bet_mode TEXT NOT NULL DEFAULT \'open\''); } catch {}
try { db.exec('ALTER TABLE events ADD COLUMN image_url TEXT'); } catch {}
try { db.exec('ALTER TABLE events ADD COLUMN winner_image_url TEXT'); } catch {}
try { db.exec('ALTER TABLE players ADD COLUMN image_url TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN swish_number TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN real_name TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN pin_hash TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN pin_salt TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN needs_pin_reset INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN reset_code TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN reset_code_expires TEXT'); } catch {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      credential_id TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_cred_user ON user_credentials(user_id);
    CREATE INDEX IF NOT EXISTS idx_cred_id ON user_credentials(credential_id);
  `);
} catch {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_settlement_receipts (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      from_name TEXT NOT NULL,
      to_name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      paid_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_receipts_tournament ON tournament_settlement_receipts(tournament_id);
  `);
} catch {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS friends (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, friend_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
    CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);
  `);
} catch {}

// ── Prepared Statements ──────────────
const stmts = {
  // Settings
  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
  getAdminPin: db.prepare('SELECT value FROM settings WHERE key = \'admin_pin\''),
  setAdminPin: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (\'admin_pin\', ?)'),

  // Events
  insertEvent: db.prepare(`
    INSERT INTO events (id, name, date, status, min_bet, max_bet, payout_percent, share_code, creator_id, swish_number, tournament_id, is_side_bet, linked_round_id, bet_mode, image_url, winner_image_url)
    VALUES (@id, @name, @date, COALESCE(@status, 'open'), @minBet, @maxBet, @payoutPercent, @shareCode, @creatorId, @swishNumber, @tournamentId, @isSideBet, @linkedRoundId, @betMode, @imageUrl, @winnerImageUrl)
  `),
  getEventById: db.prepare('SELECT * FROM events WHERE id = ?'),
  getEventByCode: db.prepare('SELECT * FROM events WHERE share_code = ?'),
  getAllEvents: db.prepare('SELECT * FROM events ORDER BY created_at DESC'),
  getOpenEvents: db.prepare('SELECT * FROM events WHERE status = \'open\' ORDER BY created_at DESC'),
  updateEventStatus: db.prepare('UPDATE events SET status = ? WHERE id = ?'),
  updateEventWinner: db.prepare('UPDATE events SET winner_id = ?, winner_image_url = COALESCE(?, winner_image_url), status = \'finished\' WHERE id = ?'),
  updateEventImage: db.prepare('UPDATE events SET image_url = ? WHERE id = ?'),
  resetEvent: db.prepare('UPDATE events SET status = ?, winner_id = NULL WHERE id = ?'),
  deleteEvent: db.prepare('DELETE FROM events WHERE id = ?'),

  // Players
  insertPlayer: db.prepare('INSERT INTO players (id, event_id, name, image_url) VALUES (?, ?, ?, ?)'),
  updatePlayerImage: db.prepare('UPDATE players SET image_url = ? WHERE id = ?'),
  getPlayersByEvent: db.prepare('SELECT * FROM players WHERE event_id = ?'),
  getPlayerById: db.prepare('SELECT * FROM players WHERE id = ?'),
  getPlayerCount: db.prepare('SELECT COUNT(*) as count FROM players WHERE event_id = ?'),
  deletePlayer: db.prepare('DELETE FROM players WHERE id = ? AND event_id = ?'),

  // Bets
  insertBet: db.prepare('INSERT INTO bets (id, event_id, bettor_name, player_id, user_id, amount) VALUES (?, ?, ?, ?, ?, ?)'),
  getBetsByEvent: db.prepare('SELECT * FROM bets WHERE event_id = ? ORDER BY timestamp ASC'),
  getBetsByUser: db.prepare(`
    SELECT b.*, e.name as event_name, e.share_code, e.status as event_status, e.winner_id, p.name as player_name
    FROM bets b
    JOIN events e ON b.event_id = e.id
    JOIN players p ON b.player_id = p.id
    WHERE b.user_id = ?
    ORDER BY b.timestamp DESC
  `),
  getTotalPool: db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE event_id = ?'),
  getTotalPoolByEvent: db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE event_id = ?'),
  getBetCount: db.prepare('SELECT COUNT(*) as count FROM bets WHERE event_id = ?'),
  getPlayerPool: db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE event_id = ? AND player_id = ?'),
  getBetsByPlayer: db.prepare('SELECT * FROM bets WHERE event_id = ? AND player_id = ?'),
  deleteBet: db.prepare('DELETE FROM bets WHERE id = ? AND event_id = ?'),
  deleteBetsByPlayer: db.prepare('DELETE FROM bets WHERE event_id = ? AND player_id = ?'),
  markBetPaid: db.prepare('UPDATE bets SET paid = ? WHERE id = ? AND event_id = ?'),

  // Users
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  getUserByToken: db.prepare('SELECT * FROM users WHERE token = ?'),
  getUserByNickname: db.prepare('SELECT * FROM users WHERE LOWER(nickname) = LOWER(?)'),
  getUserBySwish: db.prepare('SELECT * FROM users WHERE REPLACE(REPLACE(swish_number, \' \', \'\'), \'-\', \'\') = ?'),
  getUserByGoogleId: db.prepare('SELECT * FROM users WHERE google_id = ?'),
  getAllUsers: db.prepare('SELECT id, nickname, real_name, swish_number, token, avatar_emoji, avatar_url, email, needs_pin_reset, CASE WHEN pin_hash IS NOT NULL THEN 1 ELSE 0 END as has_pin, created_at FROM users ORDER BY created_at DESC'),
  insertUser: db.prepare('INSERT INTO users (id, nickname, token, avatar_emoji, real_name, swish_number) VALUES (?, ?, ?, ?, ?, ?)'),
  insertUserWithPin: db.prepare('INSERT INTO users (id, nickname, token, avatar_emoji, real_name, swish_number, pin_hash, pin_salt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  setUserPin: db.prepare('UPDATE users SET pin_hash = ?, pin_salt = ?, needs_pin_reset = 0, reset_code = NULL, reset_code_expires = NULL, token = coalesce(?, token) WHERE id = ?'),
  resetUserPin: db.prepare('UPDATE users SET pin_hash = NULL, pin_salt = NULL, needs_pin_reset = 1, reset_code = ?, reset_code_expires = ? WHERE id = ?'),
  insertGoogleUser: db.prepare('INSERT INTO users (id, nickname, token, google_id, email, avatar_url) VALUES (?, ?, ?, ?, ?, ?)'),
  updateUserGoogle: db.prepare('UPDATE users SET email = ?, avatar_url = ?, nickname = ? WHERE google_id = ?'),
  updateUserAvatar: db.prepare('UPDATE users SET avatar_emoji = ? WHERE id = ?'),
  updateUserAvatarUrl: db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?'),
  updateUserSwish: db.prepare('UPDATE users SET swish_number = ? WHERE id = ?'),
  updateUserRealName: db.prepare('UPDATE users SET real_name = ? WHERE id = ?'),
  updateUserNickname: db.prepare('UPDATE users SET nickname = ? WHERE id = ?'),

  // Credentials (WebAuthn / FaceID / TouchID)
  insertCredential: db.prepare('INSERT INTO user_credentials (id, user_id, credential_id, public_key) VALUES (?, ?, ?, ?)'),
  getCredentialsByUser: db.prepare('SELECT * FROM user_credentials WHERE user_id = ? ORDER BY created_at DESC'),
  getCredentialById: db.prepare('SELECT c.*, u.id as user_id, u.nickname, u.real_name, u.swish_number, u.token, u.avatar_emoji, u.avatar_url, u.email, u.needs_pin_reset FROM user_credentials c JOIN users u ON c.user_id = u.id WHERE c.credential_id = ?'),
  deleteCredential: db.prepare('DELETE FROM user_credentials WHERE id = ? AND user_id = ?'),

  // Tournament Photos
  getPhotosByTournament: db.prepare(`
    SELECT p.*, 
           u.nickname as uploader_name, 
           u.avatar_url as uploader_avatar,
           (SELECT COUNT(*) FROM tournament_photo_likes l WHERE l.photo_id = p.id) as like_count
    FROM tournament_photos p 
    JOIN users u ON p.user_id = u.id 
    WHERE p.tournament_id = ? 
    ORDER BY p.created_at DESC
  `),
  getPhotoLikesByUser: db.prepare(`
    SELECT photo_id 
    FROM tournament_photo_likes 
    WHERE user_id = ? AND photo_id IN (
      SELECT id FROM tournament_photos WHERE tournament_id = ?
    )
  `),
  insertPhoto: db.prepare('INSERT INTO tournament_photos (id, tournament_id, user_id, url, thumbnail_url, caption) VALUES (?, ?, ?, ?, ?, ?)'),
  deletePhoto: db.prepare('DELETE FROM tournament_photos WHERE id = ?'),
  insertPhotoLike: db.prepare('INSERT OR IGNORE INTO tournament_photo_likes (photo_id, user_id) VALUES (?, ?)'),
  deletePhotoLike: db.prepare('DELETE FROM tournament_photo_likes WHERE photo_id = ? AND user_id = ?'),

  // Tournaments
  insertTournament: db.prepare('INSERT INTO tournaments (id, name, share_code, creator_id) VALUES (?, ?, ?, ?)'),
  getTournamentById: db.prepare('SELECT * FROM tournaments WHERE id = ?'),
  getTournamentByCode: db.prepare('SELECT * FROM tournaments WHERE share_code = ?'),
  getAllTournaments: db.prepare('SELECT * FROM tournaments ORDER BY created_at DESC'),
  getEventsByTournament: db.prepare('SELECT * FROM events WHERE tournament_id = ? ORDER BY created_at ASC'),
  updateTournamentStatus: db.prepare('UPDATE tournaments SET status = ? WHERE id = ?'),

  // Tournament Banners
  getBannersByTournament: db.prepare('SELECT * FROM tournament_banners WHERE tournament_id = ? ORDER BY sort_order ASC, created_at ASC'),
  insertBanner: db.prepare('INSERT INTO tournament_banners (id, tournament_id, image_data, link_url, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)'),
  deleteBanner: db.prepare('DELETE FROM tournament_banners WHERE id = ? AND tournament_id = ?'),

  // Settlement Receipts
  getSettlementReceipts: db.prepare('SELECT * FROM tournament_settlement_receipts WHERE tournament_id = ?'),
  getSettlementReceipt: db.prepare('SELECT * FROM tournament_settlement_receipts WHERE tournament_id = ? AND from_name = ? AND to_name = ?'),
  insertSettlementReceipt: db.prepare('INSERT INTO tournament_settlement_receipts (id, tournament_id, from_name, to_name, amount) VALUES (?, ?, ?, ?, ?)'),
  deleteSettlementReceipt: db.prepare('DELETE FROM tournament_settlement_receipts WHERE tournament_id = ? AND from_name = ? AND to_name = ?'),
  deleteTournamentReceipts: db.prepare('DELETE FROM tournament_settlement_receipts WHERE tournament_id = ?'),
  deleteTournamentBanners: db.prepare('DELETE FROM tournament_banners WHERE tournament_id = ?'),
  deleteTournamentPhotosByTournament: db.prepare('DELETE FROM tournament_photos WHERE tournament_id = ?'),
  deleteTournament: db.prepare('DELETE FROM tournaments WHERE id = ?'),

  // Friends
  getFriends: db.prepare(`
    SELECT u.id, u.nickname, u.real_name, u.avatar_emoji, u.avatar_url, u.swish_number, f.created_at as friendship_date
    FROM friends f
    JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = ?
    ORDER BY u.nickname ASC
  `),
  insertFriend: db.prepare('INSERT OR IGNORE INTO friends (id, user_id, friend_id) VALUES (?, ?, ?)'),
  deleteFriend: db.prepare('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'),
  searchUsers: db.prepare(`
    SELECT id, nickname, real_name, avatar_emoji, avatar_url, swish_number
    FROM users
    WHERE id != ? AND (
      nickname LIKE ? OR 
      real_name LIKE ? OR 
      (swish_number IS NOT NULL AND swish_number LIKE ?)
    )
    ORDER BY nickname ASC
    LIMIT 15
  `),
};

// ── Public API ───────────────────────────────────────

export function getAdminPin() {
  const row = stmts.getSetting.get('admin_pin');
  return row ? row.value : null;
}

export function setAdminPin(hashedPin) {
  stmts.setSetting.run('admin_pin', hashedPin);
}

export function getEventSummaries(includeTournamentEvents = false) {
  const events = stmts.getAllEvents.all();
  return events
    .filter(e => includeTournamentEvents || !e.tournament_id)
    .map(e => ({
    id: e.id,
    name: e.name,
    date: e.date,
    status: e.status,
    shareCode: e.share_code,
    payoutPercent: e.payout_percent,
    minBet: e.min_bet,
    maxBet: e.max_bet,
    winnerId: e.winner_id,
    creatorId: e.creator_id,
    swishNumber: e.swish_number,
    tournamentId: e.tournament_id,
    imageUrl: e.image_url || null,
    winnerImageUrl: e.winner_image_url || null,
    playerCount: stmts.getPlayerCount.get(e.id).count,
    betCount: stmts.getBetCount.get(e.id).count,
    totalPool: stmts.getTotalPool.get(e.id).total
  }));
}

export function getFullEvent(idOrCode) {
  let event = stmts.getEventById.get(idOrCode);
  if (!event) event = stmts.getEventByCode.get(idOrCode);
  if (!event) return null;

  const players = stmts.getPlayersByEvent.all(event.id);
  const bets = stmts.getBetsByEvent.all(event.id);
  const totalPool = stmts.getTotalPool.get(event.id).total;
  const effectivePool = totalPool * (event.payout_percent / 100);

  // Calculate odds
  const odds = {};
  for (const player of players) {
    const playerPool = stmts.getPlayerPool.get(event.id, player.id).total;
    odds[player.id] = {
      totalBet: playerPool,
      odds: playerPool > 0 ? +(effectivePool / playerPool).toFixed(2) : null,
      impliedProbability: totalPool > 0 ? +((playerPool / totalPool) * 100).toFixed(1) : 0
    };
  }

  const mappedPlayers = players.map(p => ({
    id: p.id,
    eventId: p.event_id,
    name: p.name,
    imageUrl: p.image_url || null
  }));

  const result = {
    id: event.id,
    name: event.name,
    date: event.date,
    status: event.status,
    shareCode: event.share_code,
    payoutPercent: event.payout_percent,
    minBet: event.min_bet,
    maxBet: event.max_bet,
    winnerId: event.winner_id,
    creatorId: event.creator_id,
    swishNumber: event.swish_number,
    tournamentId: event.tournament_id,
    isSideBet: !!event.is_side_bet,
    linkedRoundId: event.linked_round_id,
    betMode: event.bet_mode || 'open',
    imageUrl: event.image_url || null,
    winnerImageUrl: event.winner_image_url || null,
    players: mappedPlayers,
    bets: bets.map(b => ({
      id: b.id,
      bettorName: b.bettor_name,
      playerId: b.player_id,
      userId: b.user_id,
      amount: b.amount,
      paid: !!b.paid,
      timestamp: b.timestamp
    })),
    odds,
    totalPool,
    effectivePool
  };

  // If event is finished and has a winner, include winner's swish number
  if (event.status === 'finished' && event.winner_id) {
    // Find any winning bet with a user_id to get winner's swish
    const winnerBets = bets.filter(b => b.player_id === event.winner_id && b.user_id);
    if (winnerBets.length > 0) {
      const winnerUser = stmts.getUserById.get(winnerBets[0].user_id);
      if (winnerUser && winnerUser.swish_number) {
        result.winnerSwish = winnerUser.swish_number;
        result.winnerNickname = winnerUser.nickname;
      }
    }
  }

  return result;
}

export const createEvent = db.transaction((eventData, playerNames) => {
  stmts.insertEvent.run({
    ...eventData,
    imageUrl: eventData.imageUrl || null,
    winnerImageUrl: eventData.winnerImageUrl || null
  });
  for (const p of playerNames) {
    stmts.insertPlayer.run(p.id, eventData.id, p.name, p.imageUrl || null);
  }
});

export function addPlayer(eventId, playerId, name, imageUrl = null) {
  stmts.insertPlayer.run(playerId, eventId, name, imageUrl);
}

export function updatePlayerImage(playerId, imageUrl) {
  stmts.updatePlayerImage.run(imageUrl, playerId);
}

export function updateEventImage(eventId, imageUrl) {
  stmts.updateEventImage.run(imageUrl, eventId);
}

export const removePlayer = db.transaction((eventId, playerId) => {
  stmts.deleteBetsByPlayer.run(eventId, playerId);
  stmts.deletePlayer.run(playerId, eventId);
});

export function addBet(id, eventId, bettorName, playerId, amount, userId = null) {
  stmts.insertBet.run(id, eventId, bettorName, playerId, userId, amount);
}

export function removeBet(eventId, betId) {
  stmts.deleteBet.run(betId, eventId);
}

export function markBetPaid(eventId, betId, paid) {
  stmts.markBetPaid.run(paid ? 1 : 0, betId, eventId);
}

export function lockEvent(eventId) {
  stmts.updateEventStatus.run('locked', eventId);
}

export function reopenEvent(eventId) {
  stmts.resetEvent.run('open', eventId);
}

export function finishEvent(eventId, winnerId, winnerImageUrl = null) {
  stmts.updateEventWinner.run(winnerId, winnerImageUrl, eventId);
}

export function deleteEvent(eventId) {
  stmts.deleteEvent.run(eventId);
}

export function getEventById(id) {
  return stmts.getEventById.get(id);
}

export function getEventByCode(code) {
  return stmts.getEventByCode.get(code);
}

export function playerExists(playerId) {
  return !!stmts.getPlayerById.get(playerId);
}

export function getPlayerById(playerId) {
  return stmts.getPlayerById.get(playerId);
}

// ── Users ────────────────────────────────────────────
export function hashUserPin(pin, salt) {
  return crypto.pbkdf2Sync(pin, salt, 10000, 32, 'sha256').toString('hex');
}

export function createUser(id, nickname, token, avatarEmoji, realName = null, swishNumber = null, pin = null) {
  if (pin) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashUserPin(pin, salt);
    stmts.insertUserWithPin.run(id, nickname, token, avatarEmoji || '👤', realName, swishNumber, hash, salt);
  } else {
    stmts.insertUser.run(id, nickname, token, avatarEmoji || '👤', realName, swishNumber);
  }
}

export function verifyUserPin(user, pin) {
  if (!user) return false;
  // If user has no PIN configured yet, allow login or force setup
  if (!user.pin_hash || !user.pin_salt) return true;
  const hash = hashUserPin(pin, user.pin_salt);
  return hash === user.pin_hash;
}

export function setUserPin(userId, pin, newToken = null) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashUserPin(pin, salt);
  stmts.setUserPin.run(hash, salt, newToken, userId);
}

export function resetUserPin(userId, resetCode, expiresIso = null) {
  const expires = expiresIso || new Date(Date.now() + 15 * 60 * 1000).toISOString();
  stmts.resetUserPin.run(resetCode, expires, userId);
}

export function getAllUsers() {
  return stmts.getAllUsers.all();
}

// ── WebAuthn / FaceID / TouchID Credentials ──────────
export function saveCredential(id, userId, credentialId, publicKey) {
  stmts.insertCredential.run(id, userId, credentialId, publicKey);
}

export function getCredentialsByUser(userId) {
  return stmts.getCredentialsByUser.all(userId);
}

export function getCredentialById(credentialId) {
  return stmts.getCredentialById.get(credentialId);
}

export function deleteCredential(credentialId, userId) {
  stmts.deleteCredential.run(credentialId, userId);
}

export function getUserBySwish(swishNumber) {
  if (!swishNumber) return null;
  const clean = swishNumber.replace(/[\s\-]/g, '');
  if (!clean) return null;
  return stmts.getUserBySwish.get(clean);
}

export function getUserByNicknameOrSwish(identifier) {
  if (!identifier) return null;
  const clean = identifier.trim();
  // check nickname first
  let user = stmts.getUserByNickname.get(clean);
  if (user) return user;
  // check swish (digits only)
  const digits = clean.replace(/[\s\-]/g, '');
  if (digits.length >= 6) {
    user = stmts.getUserBySwish.get(digits);
    if (user) return user;
  }
  return null;
}

export function findOrCreateGoogleUser(googleId, email, name, avatarUrl, token) {
  const existing = stmts.getUserByGoogleId.get(googleId);
  if (existing) {
    let finalName = name;
    let collision = stmts.getUserByNickname.get(finalName);
    while (collision && collision.google_id !== googleId) {
      finalName = name + '_' + crypto.randomBytes(2).toString('hex');
      collision = stmts.getUserByNickname.get(finalName);
    }
    stmts.updateUserGoogle.run(email, avatarUrl, finalName, googleId);
    return { ...existing, email, avatar_url: avatarUrl, nickname: finalName };
  }
  
  let finalName = name;
  let collision = stmts.getUserByNickname.get(finalName);
  while (collision) {
    finalName = name + '_' + crypto.randomBytes(2).toString('hex');
    collision = stmts.getUserByNickname.get(finalName);
  }
  const id = crypto.randomUUID();
  stmts.insertGoogleUser.run(id, finalName, token, googleId, email, avatarUrl);
  return { id, nickname: finalName, token, google_id: googleId, email, avatar_url: avatarUrl };
}

export function getUserByToken(token) {
  return stmts.getUserByToken.get(token);
}

export function getUserById(id) {
  return stmts.getUserById.get(id);
}

export function getUserByNickname(nickname) {
  return stmts.getUserByNickname.get(nickname);
}

export function updateUserAvatar(userId, emoji) {
  stmts.updateUserAvatar.run(emoji, userId);
}

export function updateUserAvatarUrl(userId, url) {
  stmts.updateUserAvatarUrl.run(url, userId);
}

export function updateUserSwish(userId, swishNumber) {
  stmts.updateUserSwish.run(swishNumber, userId);
}

export function updateUserRealName(userId, realName) {
  stmts.updateUserRealName.run(realName, userId);
}

export function updateUserNickname(userId, nickname) {
  stmts.updateUserNickname.run(nickname, userId);
}

export function getUserBets(userId) {
  return stmts.getBetsByUser.all(userId);
}

// ── Tournament Photos ─────────────────────────────────
export function getPhotosByTournament(tournamentId, userId) {
  const photos = stmts.getPhotosByTournament.all(tournamentId);
  if (!userId) return photos.map(p => ({ ...p, user_liked: false }));
  
  const userLikes = new Set(stmts.getPhotoLikesByUser.all(userId, tournamentId).map(l => l.photo_id));
  return photos.map(p => ({
    ...p,
    user_liked: userLikes.has(p.id)
  }));
}

export function addTournamentPhoto(id, tournamentId, userId, url, thumbnailUrl, caption) {
  stmts.insertPhoto.run(id, tournamentId, userId, url, thumbnailUrl || null, caption || null);
}

export function deleteTournamentPhoto(photoId) {
  stmts.deletePhoto.run(photoId);
}

export function togglePhotoLike(photoId, userId) {
  const info = stmts.deletePhotoLike.run(photoId, userId);
  if (info.changes === 0) {
    stmts.insertPhotoLike.run(photoId, userId);
    return true; // Liked
  }
  return false; // Unliked
}


export { db };

// ── Tournament Banners ──────────────────────────────
export function addBanner(id, tournamentId, imageData, linkUrl, label, sortOrder = 0) {
  stmts.insertBanner.run(id, tournamentId, imageData, linkUrl, label, sortOrder);
}

export function removeBanner(bannerId, tournamentId) {
  stmts.deleteBanner.run(bannerId, tournamentId);
}

export function getBanners(tournamentId) {
  return stmts.getBannersByTournament.all(tournamentId).map(b => ({
    id: b.id, imageData: b.image_data, linkUrl: b.link_url, label: b.label
  }));
}

// ── Tournaments ─────────────────────────────────────
export function createTournament(id, name, shareCode, creatorId) {
  stmts.insertTournament.run(id, name, shareCode, creatorId);
}

export function getTournamentByCode(code) {
  return stmts.getTournamentByCode.get(code);
}

export function getTournamentById(id) {
  return stmts.getTournamentById.get(id);
}

export function getAllTournaments() {
  const tournaments = stmts.getAllTournaments.all();
  return tournaments.map(t => {
    const rounds = stmts.getEventsByTournament.all(t.id);
    const mainRounds = rounds.filter(r => !r.is_side_bet);
    const finishedRounds = mainRounds.filter(r => r.status === 'finished');
    const banners = stmts.getBannersByTournament.all(t.id);
    return {
      id: t.id,
      name: t.name,
      shareCode: t.share_code,
      status: t.status,
      creatorId: t.creator_id,
      createdAt: t.created_at,
      roundCount: mainRounds.length,
      finishedCount: finishedRounds.length,
      bannerCount: banners.length,
      banners: banners.map(b => ({ id: b.id, imageData: b.image_data, linkUrl: b.link_url, label: b.label }))
    };
  });
}

export function getFullTournament(idOrCode) {
  let tournament = stmts.getTournamentById.get(idOrCode);
  if (!tournament) tournament = stmts.getTournamentByCode.get(idOrCode);
  if (!tournament) return null;

  const rawRounds = stmts.getEventsByTournament.all(tournament.id);
  const mapEvent = (e) => {
    const players = stmts.getPlayersByEvent.all(e.id);
    const totalPool = stmts.getTotalPool.get(e.id).total;
    const betCount = stmts.getBetCount.get(e.id).count;
    const winnerPlayer = e.winner_id ? players.find(p => p.id === e.winner_id) : null;
    return {
      id: e.id,
      name: e.name,
      date: e.date,
      status: e.status,
      shareCode: e.share_code,
      winnerId: e.winner_id,
      winnerName: winnerPlayer?.name || null,
      players: players.map(p => ({ id: p.id, name: p.name })),
      totalPool,
      betCount,
      isSideBet: !!e.is_side_bet,
      linkedRoundId: e.linked_round_id,
      betMode: e.bet_mode || 'open',
      minBet: e.min_bet,
      maxBet: e.max_bet
    };
  };

  const allEvents = rawRounds.map(mapEvent);
  const rounds = allEvents.filter(e => !e.isSideBet);
  const sideBets = allEvents.filter(e => e.isSideBet);

  // Collect all unique player names across rounds
  const allPlayers = new Set();
  rounds.forEach(r => r.players.forEach(p => allPlayers.add(p.name)));

  const banners = stmts.getBannersByTournament.all(tournament.id);

  return {
    id: tournament.id,
    name: tournament.name,
    shareCode: tournament.share_code,
    status: tournament.status,
    creatorId: tournament.creator_id,
    createdAt: tournament.created_at,
    rounds,
    sideBets,
    players: [...allPlayers],
    banners: banners.map(b => ({ id: b.id, imageData: b.image_data, linkUrl: b.link_url, label: b.label })),
    settlement: getTournamentNetSettlement(tournament.id)
  };
}

export function getTournamentNetSettlement(tournamentId) {
  const rounds = stmts.getEventsByTournament.all(tournamentId);
  const finishedRounds = rounds.filter(r => r.status === 'finished' && r.winner_id);

  // Calculate net balance per user (by bettor_name since not all bettors may have accounts)
  const balances = {}; // { bettorName: net amount }

  const tournament = stmts.getTournamentById.get(tournamentId);
  let creatorName = 'Hus/Skapare';
  let creatorUserId = tournament ? tournament.creator_id : null;
  if (creatorUserId) {
    const u = stmts.getUserById.get(creatorUserId);
    if (u) creatorName = u.nickname;
  }

  for (const round of finishedRounds) {
    const bets = stmts.getBetsByEvent.all(round.id);
    const totalPool = stmts.getTotalPool.get(round.id).total;
    const effectivePool = totalPool * (round.payout_percent / 100);
    const houseEdge = totalPool - effectivePool;
    const winnerPool = stmts.getPlayerPool.get(round.id, round.winner_id).total;
    const odds = winnerPool > 0 ? effectivePool / winnerPool : 0;

    if (houseEdge > 0) {
      if (!balances[creatorName]) balances[creatorName] = { amount: 0, userId: creatorUserId };
      balances[creatorName].amount += houseEdge;
    }

    for (const bet of bets) {
      const name = bet.bettor_name;
      if (!balances[name]) balances[name] = { amount: 0, userId: bet.user_id };

      if (bet.player_id === round.winner_id) {
        // Winner: gains (winnings - original bet)
        const winnings = bet.amount * odds;
        balances[name].amount += (winnings - bet.amount);
      } else {
        // Loser: loses entire bet
        balances[name].amount -= bet.amount;
      }
      // Keep latest userId
      if (bet.user_id) balances[name].userId = bet.user_id;
    }
  }

  // Fetch marked receipts
  const receipts = stmts.getSettlementReceipts.all(tournamentId);

  // Calculate minimal transfers (debt simplification)
  const people = Object.entries(balances)
    .map(([name, data]) => ({ name, amount: Math.round(data.amount), userId: data.userId }))
    .filter(p => Math.abs(p.amount) >= 1); // Ignore tiny rounding diffs

  const debtors = people.filter(p => p.amount < 0).sort((a, b) => a.amount - b.amount); // most negative first
  const creditors = people.filter(p => p.amount > 0).sort((a, b) => b.amount - a.amount); // most positive first

  const transfers = [];
  let di = 0, ci = 0;

  while (di < debtors.length && ci < creditors.length) {
    const debtor = debtors[di];
    const creditor = creditors[ci];
    const transfer = Math.min(-debtor.amount, creditor.amount);

    if (transfer > 0) {
      // Look up creditor's swish number
      let swishNumber = null;
      if (creditor.userId) {
        const user = stmts.getUserById.get(creditor.userId);
        if (user) swishNumber = user.swish_number;
      }
      if (!swishNumber && creditor.name) {
        const userByNick = stmts.getUserByNickname.get(creditor.name);
        if (userByNick) swishNumber = userByNick.swish_number;
      }

      const isPaid = receipts.some(r => r.from_name === debtor.name && r.to_name === creditor.name);

      transfers.push({
        from: debtor.name,
        fromUserId: debtor.userId,
        to: creditor.name,
        toUserId: creditor.userId,
        amount: transfer,
        toSwish: swishNumber,
        isPaid
      });
    }

    debtor.amount += transfer;
    creditor.amount -= transfer;

    if (debtor.amount === 0) di++;
    if (creditor.amount === 0) ci++;
  }

  return {
    balances: Object.entries(balances).map(([name, data]) => ({
      name,
      net: Math.round(data.amount),
      userId: data.userId
    })),
    transfers,
    finishedRounds: finishedRounds.length,
    totalRounds: rounds.length
  };
}

export function toggleSettlementReceipt(id, tournamentId, fromName, toName, amount) {
  const existing = stmts.getSettlementReceipt.get(tournamentId, fromName, toName);
  if (existing) {
    stmts.deleteSettlementReceipt.run(tournamentId, fromName, toName);
    return { isPaid: false };
  } else {
    stmts.insertSettlementReceipt.run(id, tournamentId, fromName, toName, amount);
    return { isPaid: true };
  }
}

export const deleteTournament = db.transaction((tournamentId) => {
  const events = stmts.getEventsByTournament.all(tournamentId);
  for (const e of events) {
    stmts.deleteEvent.run(e.id);
  }
  stmts.deleteTournamentReceipts.run(tournamentId);
  stmts.deleteTournamentBanners.run(tournamentId);
  stmts.deleteTournamentPhotosByTournament.run(tournamentId);
  stmts.deleteTournament.run(tournamentId);
});

export function settleTournament(tournamentId) {
  stmts.updateTournamentStatus.run('settled', tournamentId);
}

export function getLeaderboard() {
  const finishedBets = db.prepare(`
    SELECT b.*, e.payout_percent, e.winner_id, e.id AS event_id,
           COALESCE(u.nickname, b.bettor_name) AS display_name,
           u.avatar_emoji, u.avatar_url
    FROM bets b
    JOIN events e ON b.event_id = e.id
    LEFT JOIN users u ON b.user_id = u.id
    WHERE e.status = 'finished'
  `).all();

  const usersMap = {};
  for (const bet of finishedBets) {
    const key = bet.display_name;
    if (!usersMap[key]) {
      usersMap[key] = {
        name: key,
        avatarEmoji: bet.avatar_emoji || '👤',
        avatarUrl: bet.avatar_url || null,
        totalBets: 0,
        wins: 0,
        totalStaked: 0,
        totalWon: 0,
        bestOdds: 0
      };
    }

    const u = usersMap[key];
    u.totalBets++;
    u.totalStaked += bet.amount;

    if (bet.player_id === bet.winner_id) {
      u.wins++;
      const full = getFullEvent(bet.event_id);
      if (full) {
        const effectivePool = full.totalPool * (full.payoutPercent / 100);
        const winnerPool = full.bets.filter(b => b.playerId === full.winnerId).reduce((s, b) => s + b.amount, 0);
        const odds = winnerPool > 0 ? (effectivePool / winnerPool) : 0;
        const winnings = +(bet.amount * odds).toFixed(2);
        u.totalWon += winnings;
        if (odds > u.bestOdds) {
          u.bestOdds = +odds.toFixed(2);
        }
      }
    }
  }

  const list = Object.values(usersMap).map(u => {
    const profit = Math.round(u.totalWon - u.totalStaked);
    const losses = u.totalBets - u.wins;
    const roi = u.totalStaked > 0 ? Math.round((profit / u.totalStaked) * 100) : 0;
    return {
      nickname: u.name,
      avatar: u.avatarEmoji || '👤',
      avatarUrl: u.avatarUrl,
      totalBets: u.totalBets,
      totalBet: u.totalStaked,
      wins: u.wins,
      losses,
      profit,
      roi,
      winRate: u.totalBets > 0 ? Math.round((u.wins / u.totalBets) * 100) : 0,
      bestOdds: u.bestOdds
    };
  });

  list.sort((a, b) => b.profit - a.profit);
  return list;
}

// ── User Stats ────────────────────────────────────────
export function getUserStats(userId) {
  const bets = db.prepare(`
    SELECT b.*, e.status AS event_status, e.winner_id, e.payout_percent,
           p.name AS player_name
    FROM bets b
    JOIN events e ON b.event_id = e.id
    JOIN players p ON b.player_id = p.id
    WHERE b.user_id = ?
    ORDER BY b.timestamp DESC
  `).all(userId);

  const finishedBets = bets.filter(b => b.event_status === 'finished');
  const wins = finishedBets.filter(b => b.player_id === b.winner_id);
  const losses = finishedBets.filter(b => b.player_id !== b.winner_id);

  const totalBet = bets.reduce((s, b) => s + b.amount, 0);
  const totalFinishedBetStake = finishedBets.reduce((s, b) => s + b.amount, 0);
  const totalLost = losses.reduce((s, b) => s + b.amount, 0);

  // Calculate winnings (same logic as finish endpoint)
  let totalWon = 0;
  const eventWinnings = {};
  for (const bet of wins) {
    if (!eventWinnings[bet.event_id]) {
      const full = getFullEvent(bet.event_id);
      if (full) {
        const effectivePool = full.totalPool * (full.payoutPercent / 100);
        const winnerBets = full.bets.filter(b => b.playerId === full.winnerId);
        const winnerPool = winnerBets.reduce((s, b) => s + b.amount, 0);
        eventWinnings[bet.event_id] = winnerPool > 0 ? effectivePool / winnerPool : 0;
      }
    }
    const odds = eventWinnings[bet.event_id] || 0;
    totalWon += bet.amount * odds;
  }

  // Streak
  let streak = 0;
  let streakType = null;
  for (const b of finishedBets) {
    const won = b.player_id === b.winner_id;
    if (streakType === null) {
      streakType = won ? 'win' : 'loss';
      streak = 1;
    } else if ((won && streakType === 'win') || (!won && streakType === 'loss')) {
      streak++;
    } else {
      break;
    }
  }

  return {
    totalBets: bets.length,
    finishedBets: finishedBets.length,
    wins: wins.length,
    losses: losses.length,
    pending: bets.length - finishedBets.length,
    winRate: finishedBets.length > 0 ? Math.round((wins.length / finishedBets.length) * 100) : 0,
    totalBet: Math.round(totalBet),
    totalWon: Math.round(totalWon),
    totalLost: Math.round(totalLost),
    netProfit: Math.round(totalWon - totalFinishedBetStake),
    streak: streak,
    streakType: streakType || 'none'
  };
}

// ── Friends API ───────────────────────────────────────
export function getFriends(userId) {
  const list = stmts.getFriends.all(userId);
  return list.map(f => {
    const stats = getUserStats(f.id);
    return {
      id: f.id,
      nickname: f.nickname,
      realName: f.real_name,
      avatarEmoji: f.avatar_emoji,
      avatarUrl: f.avatar_url,
      swishNumber: f.swish_number,
      streak: stats.streak || 0,
      streakType: stats.streakType || 'none',
      wins: stats.wins || 0,
      totalBets: stats.totalBets || 0,
      friendshipDate: f.friendship_date
    };
  });
}

export function addFriend(userId, friendId) {
  if (!userId || !friendId || userId === friendId) return false;
  const id1 = crypto.randomUUID();
  const id2 = crypto.randomUUID();
  // Mutual friendship
  stmts.insertFriend.run(id1, userId, friendId);
  stmts.insertFriend.run(id2, friendId, userId);
  return true;
}

export function removeFriend(userId, friendId) {
  if (!userId || !friendId) return false;
  stmts.deleteFriend.run(userId, friendId, friendId, userId);
  return true;
}

export function searchUsers(query, excludeUserId) {
  if (!query || String(query).trim().length < 1) return [];
  const raw = String(query).trim();
  const clean = `%${raw}%`;
  const digits = raw.replace(/\D/g, '');
  const phonePattern = digits.length >= 4 ? `%${digits}%` : clean;
  return stmts.searchUsers.all(excludeUserId || '', clean, clean, phonePattern).map(u => ({
    id: u.id,
    nickname: u.nickname,
    realName: u.real_name,
    avatarEmoji: u.avatar_emoji,
    avatarUrl: u.avatar_url
  }));
}

