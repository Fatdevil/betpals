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
    visibility TEXT NOT NULL DEFAULT 'friends',
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
try { db.exec("ALTER TABLE tournaments ADD COLUMN visibility TEXT NOT NULL DEFAULT 'friends'"); } catch {}
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
try { db.exec('ALTER TABLE users ADD COLUMN notify_flashbets INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN notify_duels INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN notify_tournaments INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE minigame_duels ADD COLUMN expense_id TEXT'); } catch {}
try { db.exec('ALTER TABLE minigame_duels ADD COLUMN custom_title TEXT'); } catch {}
try { db.exec('ALTER TABLE minigame_duels ADD COLUMN receipt_image TEXT'); } catch {}
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

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS minigame_duels (
      id TEXT PRIMARY KEY,
      game_type TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      opponent_id TEXT,
      stake_amount REAL DEFAULT 1,
      mode TEXT DEFAULT 'online',
      status TEXT NOT NULL,
      creator_score INTEGER,
      opponent_score INTEGER,
      winner_id TEXT,
      is_settled INTEGER DEFAULT 0,
      settled_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (opponent_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_duels_creator ON minigame_duels(creator_id);
    CREATE INDEX IF NOT EXISTS idx_duels_opponent ON minigame_duels(opponent_id);
    CREATE INDEX IF NOT EXISTS idx_duels_status ON minigame_duels(status);
  `);
} catch {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS anybets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      creator_id TEXT NOT NULL,
      judge_id TEXT NOT NULL,
      stake_amount REAL NOT NULL DEFAULT 0,
      bet_type TEXT NOT NULL DEFAULT 'winner_takes_all',
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      winner_id TEXT,
      winning_side TEXT,
      proof_image_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (judge_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_anybets_creator ON anybets(creator_id);
    CREATE INDEX IF NOT EXISTS idx_anybets_judge ON anybets(judge_id);
    CREATE INDEX IF NOT EXISTS idx_anybets_status ON anybets(status);

    CREATE TABLE IF NOT EXISTS anybet_participants (
      id TEXT PRIMARY KEY,
      bet_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      choice TEXT DEFAULT 'participant',
      status TEXT NOT NULL DEFAULT 'accepted',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (bet_id) REFERENCES anybets(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(bet_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_anybet_part_bet ON anybet_participants(bet_id);
    CREATE INDEX IF NOT EXISTS idx_anybet_part_user ON anybet_participants(user_id);
  `);
} catch {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

    CREATE TABLE IF NOT EXISTS flash_bets (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      tournament_id TEXT,
      question TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 60,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      winning_choice TEXT,
      stake_amount INTEGER NOT NULL DEFAULT 20,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_flash_creator ON flash_bets(creator_id);
    CREATE INDEX IF NOT EXISTS idx_flash_tourney ON flash_bets(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_flash_status ON flash_bets(status);

    CREATE TABLE IF NOT EXISTS flash_bet_entries (
      id TEXT PRIMARY KEY,
      flash_bet_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      choice TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (flash_bet_id) REFERENCES flash_bets(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(flash_bet_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_flash_entries_bet ON flash_bet_entries(flash_bet_id);
    CREATE INDEX IF NOT EXISTS idx_flash_entries_user ON flash_bet_entries(user_id);
  `);
} catch {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tab_expenses (
      id TEXT PRIMARY KEY,
      payer_id TEXT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      total_amount REAL NOT NULL,
      mode TEXT NOT NULL,
      loser_id TEXT,
      receipt_image TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (payer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (loser_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tab_exp_payer ON tab_expenses(payer_id);

    CREATE TABLE IF NOT EXISTS tab_expense_participants (
      id TEXT PRIMARY KEY,
      expense_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES tab_expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tab_part_exp ON tab_expense_participants(expense_id);
    CREATE INDEX IF NOT EXISTS idx_tab_part_user ON tab_expense_participants(user_id);
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
  insertTournament: db.prepare('INSERT INTO tournaments (id, name, share_code, creator_id, visibility) VALUES (?, ?, ?, ?, ?)'),
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
  getSettlementReceipts: db.prepare('SELECT * FROM tournament_settlement_receipts WHERE tournament_id = ? ORDER BY paid_at ASC'),
  getSettlementReceipt: db.prepare('SELECT * FROM tournament_settlement_receipts WHERE tournament_id = ? AND from_name = ? AND to_name = ?'),
  getSettlementReceiptById: db.prepare('SELECT * FROM tournament_settlement_receipts WHERE id = ?'),
  insertSettlementReceipt: db.prepare('INSERT INTO tournament_settlement_receipts (id, tournament_id, from_name, to_name, amount) VALUES (?, ?, ?, ?, ?)'),
  deleteSettlementReceipt: db.prepare('DELETE FROM tournament_settlement_receipts WHERE tournament_id = ? AND from_name = ? AND to_name = ?'),
  deleteSettlementReceiptById: db.prepare('DELETE FROM tournament_settlement_receipts WHERE id = ?'),
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

  // Minigame Duels
  insertDuel: db.prepare(`
    INSERT INTO minigame_duels (id, game_type, creator_id, opponent_id, stake_amount, mode, status)
    VALUES (@id, @game_type, @creator_id, @opponent_id, @stake_amount, @mode, @status)
  `),
  getDuelById: db.prepare(`
    SELECT d.*,
           c.nickname as creator_nickname, c.real_name as creator_real_name, c.avatar_emoji as creator_avatar_emoji, c.avatar_url as creator_avatar_url, c.swish_number as creator_swish,
           o.nickname as opponent_nickname, o.real_name as opponent_real_name, o.avatar_emoji as opponent_avatar_emoji, o.avatar_url as opponent_avatar_url, o.swish_number as opponent_swish
    FROM minigame_duels d
    LEFT JOIN users c ON d.creator_id = c.id
    LEFT JOIN users o ON d.opponent_id = o.id
    WHERE d.id = ?
  `),
  updateDuelStatus: db.prepare('UPDATE minigame_duels SET status = ? WHERE id = ?'),
  updateDuelResult: db.prepare(`
    UPDATE minigame_duels
    SET creator_score = @creator_score,
        opponent_score = @opponent_score,
        winner_id = @winner_id,
        status = @status
    WHERE id = @id
  `),
  getPendingDuelsForUser: db.prepare(`
    SELECT d.*,
           c.nickname as creator_nickname, c.real_name as creator_real_name, c.avatar_emoji as creator_avatar_emoji, c.avatar_url as creator_avatar_url, c.swish_number as creator_swish
    FROM minigame_duels d
    JOIN users c ON d.creator_id = c.id
    WHERE d.opponent_id = ? AND d.status = 'pending'
    ORDER BY d.created_at DESC
  `),
  getUserDuels: db.prepare(`
    SELECT d.*,
           c.nickname as creator_nickname, c.real_name as creator_real_name, c.avatar_emoji as creator_avatar_emoji, c.avatar_url as creator_avatar_url, c.swish_number as creator_swish,
           o.nickname as opponent_nickname, o.real_name as opponent_real_name, o.avatar_emoji as opponent_avatar_emoji, o.avatar_url as opponent_avatar_url, o.swish_number as opponent_swish
    FROM minigame_duels d
    LEFT JOIN users c ON d.creator_id = c.id
    LEFT JOIN users o ON d.opponent_id = o.id
    WHERE (d.creator_id = ? OR d.opponent_id = ?)
    ORDER BY d.created_at DESC
    LIMIT 40
  `),
  getUnsettledDuelsForUser: db.prepare(`
    SELECT d.*,
           c.nickname as creator_nickname, c.real_name as creator_real_name, c.swish_number as creator_swish, c.avatar_emoji as creator_avatar_emoji, c.avatar_url as creator_avatar_url,
           o.nickname as opponent_nickname, o.real_name as opponent_real_name, o.swish_number as opponent_swish, o.avatar_emoji as opponent_avatar_emoji, o.avatar_url as opponent_avatar_url
    FROM minigame_duels d
    LEFT JOIN users c ON d.creator_id = c.id
    LEFT JOIN users o ON d.opponent_id = o.id
    WHERE (d.creator_id = ? OR d.opponent_id = ?)
      AND d.status = 'completed'
      AND d.stake_amount > 0
      AND d.is_settled = 0
      AND d.winner_id != 'tie'
    ORDER BY d.created_at DESC
  `),
  settleDuel: db.prepare(`UPDATE minigame_duels SET is_settled = 1, settled_at = datetime('now') WHERE id = ?`),
  settleDuelsBetweenUsers: db.prepare(`
    UPDATE minigame_duels
    SET is_settled = 1, settled_at = datetime('now')
    WHERE ((creator_id = ? AND opponent_id = ?) OR (creator_id = ? AND opponent_id = ?))
      AND status = 'completed'
      AND is_settled = 0
  `),

  // AnyBets
  insertAnyBet: db.prepare(`
    INSERT INTO anybets (id, title, description, creator_id, judge_id, stake_amount, bet_type, deadline, status)
    VALUES (@id, @title, @description, @creator_id, @judge_id, @stake_amount, @bet_type, @deadline, @status)
  `),
  insertAnyBetParticipant: db.prepare(`
    INSERT OR REPLACE INTO anybet_participants (id, bet_id, user_id, choice, status)
    VALUES (@id, @bet_id, @user_id, @choice, @status)
  `),
  getAnyBetById: db.prepare(`
    SELECT b.*,
           c.nickname as creator_nickname, c.real_name as creator_real_name, c.avatar_emoji as creator_avatar_emoji, c.avatar_url as creator_avatar_url,
           j.nickname as judge_nickname, j.real_name as judge_real_name, j.avatar_emoji as judge_avatar_emoji, j.avatar_url as judge_avatar_url,
           w.nickname as winner_nickname, w.real_name as winner_real_name, w.avatar_emoji as winner_avatar_emoji, w.avatar_url as winner_avatar_url, w.swish_number as winner_swish
    FROM anybets b
    LEFT JOIN users c ON b.creator_id = c.id
    LEFT JOIN users j ON b.judge_id = j.id
    LEFT JOIN users w ON b.winner_id = w.id
    WHERE b.id = ?
  `),
  getAnyBetParticipants: db.prepare(`
    SELECT p.*,
           u.nickname, u.real_name, u.swish_number, u.avatar_emoji, u.avatar_url
    FROM anybet_participants p
    JOIN users u ON p.user_id = u.id
    WHERE p.bet_id = ?
    ORDER BY p.created_at ASC
  `),
  updateAnyBetParticipantChoice: db.prepare(`
    UPDATE anybet_participants SET choice = ?, status = 'accepted' WHERE bet_id = ? AND user_id = ?
  `),
  settleAnyBet: db.prepare(`
    UPDATE anybets
    SET status = 'completed', winner_id = @winner_id, winning_side = @winning_side, proof_image_url = @proof_image_url
    WHERE id = @id
  `),
  getAnyBetsForUser: db.prepare(`
    SELECT DISTINCT b.*,
           c.nickname as creator_nickname, c.avatar_emoji as creator_avatar_emoji,
           j.nickname as judge_nickname, j.avatar_emoji as judge_avatar_emoji,
           w.nickname as winner_nickname, w.avatar_emoji as winner_avatar_emoji
    FROM anybets b
    LEFT JOIN users c ON b.creator_id = c.id
    LEFT JOIN users j ON b.judge_id = j.id
    LEFT JOIN users w ON b.winner_id = w.id
    LEFT JOIN anybet_participants p ON b.id = p.bet_id
    WHERE b.creator_id = ? OR b.judge_id = ? OR p.user_id = ?
    ORDER BY b.created_at DESC
    LIMIT 50
  `),

  // Push Subscriptions
  insertPushSubscription: db.prepare(`
    INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      created_at = datetime('now')
  `),
  deletePushSubscriptionByEndpoint: db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?'),
  deletePushSubscriptionsByUser: db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?'),
  getPushSubscriptionsByUser: db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?'),
  getUserNotificationPrefs: db.prepare('SELECT notify_flashbets, notify_duels, notify_tournaments FROM users WHERE id = ?'),
  updateUserNotificationPrefs: db.prepare('UPDATE users SET notify_flashbets = ?, notify_duels = ?, notify_tournaments = ? WHERE id = ?'),

  // Flash Bets
  insertFlashBet: db.prepare(`
    INSERT INTO flash_bets (id, creator_id, tournament_id, question, duration_seconds, expires_at, status, stake_amount)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
  `),
  getFlashBetById: db.prepare(`
    SELECT fb.*, u.nickname as creator_nickname, u.real_name as creator_real_name, u.avatar_emoji as creator_avatar, u.avatar_url as creator_avatar_url
    FROM flash_bets fb
    JOIN users u ON fb.creator_id = u.id
    WHERE fb.id = ?
  `),
  getActiveFlashBets: db.prepare(`
    SELECT fb.*, u.nickname as creator_nickname, u.real_name as creator_real_name, u.avatar_emoji as creator_avatar, u.avatar_url as creator_avatar_url
    FROM flash_bets fb
    JOIN users u ON fb.creator_id = u.id
    WHERE fb.status = 'open' AND datetime(fb.expires_at) > datetime('now')
    ORDER BY fb.created_at DESC
  `),
  updateFlashBetStatus: db.prepare('UPDATE flash_bets SET status = ? WHERE id = ?'),
  updateFlashBetSettle: db.prepare('UPDATE flash_bets SET status = \'settled\', winning_choice = ? WHERE id = ?'),
  
  // Flash Bet Entries
  insertFlashBetEntry: db.prepare(`
    INSERT INTO flash_bet_entries (id, flash_bet_id, user_id, choice, amount)
    VALUES (?, ?, ?, ?, ?)
  `),
  getFlashBetEntries: db.prepare(`
    SELECT fe.*, u.nickname, u.real_name, u.avatar_emoji, u.avatar_url, u.swish_number
    FROM flash_bet_entries fe
    JOIN users u ON fe.user_id = u.id
    WHERE fe.flash_bet_id = ?
    ORDER BY fe.created_at ASC
  `),
  getFlashBetEntryForUser: db.prepare(`
    SELECT * FROM flash_bet_entries WHERE flash_bet_id = ? AND user_id = ?
  `),

  // Tab Expenses & Even Steven
  insertTabExpense: db.prepare(`
    INSERT INTO tab_expenses (id, payer_id, title, notes, total_amount, mode, loser_id, receipt_image)
    VALUES (@id, @payer_id, @title, @notes, @total_amount, @mode, @loser_id, @receipt_image)
  `),
  insertTabExpenseParticipant: db.prepare(`
    INSERT INTO tab_expense_participants (id, expense_id, user_id, amount)
    VALUES (@id, @expense_id, @user_id, @amount)
  `),
  insertTabExpenseDuel: db.prepare(`
    INSERT INTO minigame_duels (id, game_type, creator_id, opponent_id, stake_amount, mode, status, winner_id, creator_score, opponent_score, is_settled, expense_id, custom_title, receipt_image)
    VALUES (@id, @game_type, @creator_id, @opponent_id, @stake_amount, @mode, 'completed', @winner_id, 1, 0, 0, @expense_id, @custom_title, @receipt_image)
  `),
  getTabExpenseById: db.prepare(`
    SELECT e.*,
           p.nickname as payer_nickname, p.real_name as payer_real_name, p.avatar_emoji as payer_avatar_emoji, p.avatar_url as payer_avatar_url, p.swish_number as payer_swish,
           l.nickname as loser_nickname, l.real_name as loser_real_name, l.avatar_emoji as loser_avatar_emoji, l.avatar_url as loser_avatar_url
    FROM tab_expenses e
    LEFT JOIN users p ON e.payer_id = p.id
    LEFT JOIN users l ON e.loser_id = l.id
    WHERE e.id = ?
  `),
  getTabExpenseParticipants: db.prepare(`
    SELECT ep.*,
           u.nickname, u.real_name, u.avatar_emoji, u.avatar_url, u.swish_number
    FROM tab_expense_participants ep
    LEFT JOIN users u ON ep.user_id = u.id
    WHERE ep.expense_id = ?
  `),
  getTabExpensesForUser: db.prepare(`
    SELECT DISTINCT e.*,
           p.nickname as payer_nickname, p.real_name as payer_real_name, p.avatar_emoji as payer_avatar_emoji, p.avatar_url as payer_avatar_url,
           l.nickname as loser_nickname, l.real_name as loser_real_name
    FROM tab_expenses e
    LEFT JOIN users p ON e.payer_id = p.id
    LEFT JOIN users l ON e.loser_id = l.id
    LEFT JOIN tab_expense_participants ep ON ep.expense_id = e.id
    WHERE e.payer_id = ? OR ep.user_id = ? OR e.loser_id = ?
    ORDER BY e.created_at DESC
    LIMIT 30
  `),
  deleteExpenseDuels: db.prepare('DELETE FROM minigame_duels WHERE expense_id = ?'),
  updateTabExpenseMode: db.prepare("UPDATE tab_expenses SET mode = 'even_steven' WHERE id = ?"),
  updateTabExpenseParticipantAmount: db.prepare('UPDATE tab_expense_participants SET amount = ? WHERE expense_id = ? AND user_id = ?'),
};

// ── Public API ───────────────────────────────────────

export function getSetting(key) {
  const row = stmts.getSetting.get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  stmts.setSetting.run(key, String(value));
}

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
export function createTournament(id, name, shareCode, creatorId, visibility = 'friends') {
  stmts.insertTournament.run(id, name, shareCode, creatorId, visibility);
}

export function getTournamentByCode(code) {
  return stmts.getTournamentByCode.get(code);
}

export function getTournamentById(id) {
  return stmts.getTournamentById.get(id);
}

export function getAllTournaments(userId = null) {
  let tournaments;
  if (!userId) {
    tournaments = db.prepare(`
      SELECT * FROM tournaments 
      WHERE COALESCE(visibility, 'friends') = 'public' 
      ORDER BY created_at DESC
    `).all();
  } else {
    tournaments = db.prepare(`
      SELECT DISTINCT t.* FROM tournaments t
      WHERE COALESCE(t.visibility, 'friends') = 'public'
         OR t.creator_id = ?
         OR (
           COALESCE(t.visibility, 'friends') = 'friends' AND (
             t.creator_id IN (SELECT friend_id FROM friends WHERE user_id = ?)
             OR t.id IN (
               SELECT e.tournament_id FROM events e
               JOIN players p ON p.event_id = e.id
               JOIN users u ON (
                 LOWER(p.name) = LOWER(u.real_name) 
                 OR LOWER(p.name) = LOWER(u.nickname)
               )
               WHERE u.id = ?
             )
           )
         )
      ORDER BY t.created_at DESC
    `).all(userId, userId, userId);
  }

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
      visibility: t.visibility || 'friends',
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
    visibility: tournament.visibility || 'friends',
    createdAt: tournament.created_at,
    rounds,
    sideBets,
    players: [...allPlayers],
    banners: banners.map(b => ({ id: b.id, imageData: b.image_data, linkUrl: b.link_url, label: b.label })),
    settlement: getTournamentNetSettlement(tournament.id)
  };
}

export function getTournamentNetSettlement(tournamentId) {
  const events = stmts.getEventsByTournament.all(tournamentId);
  const finishedEvents = events.filter(r => r.status === 'finished' && r.winner_id);

  // Balances and audit trail per person
  const balances = {}; // { [name]: { amount: 0, rawTotal: 0, totalPaid: 0, totalReceived: 0, userId: null } }
  const auditTrail = {}; // { [name]: Array<any> }

  const ensurePlayer = (name, userId) => {
    if (!balances[name]) {
      balances[name] = { amount: 0, rawTotal: 0, totalPaid: 0, totalReceived: 0, userId: userId || null };
    } else if (userId && !balances[name].userId) {
      balances[name].userId = userId;
    }
    if (!auditTrail[name]) auditTrail[name] = [];
  };

  const tournament = stmts.getTournamentById.get(tournamentId);
  let creatorName = 'Hus/Skapare';
  let creatorUserId = tournament ? tournament.creator_id : null;
  if (creatorUserId) {
    const u = stmts.getUserById.get(creatorUserId);
    if (u) creatorName = u.nickname;
  }

  for (const ev of finishedEvents) {
    const bets = stmts.getBetsByEvent.all(ev.id);
    const totalPool = stmts.getTotalPool.get(ev.id).total;
    const effectivePool = totalPool * (ev.payout_percent / 100);
    const houseEdge = totalPool - effectivePool;
    const winnerPool = stmts.getPlayerPool.get(ev.id, ev.winner_id).total;
    const odds = winnerPool > 0 ? effectivePool / winnerPool : 0;

    if (houseEdge > 0) {
      ensurePlayer(creatorName, creatorUserId);
      balances[creatorName].amount += houseEdge;
      balances[creatorName].rawTotal += houseEdge;
      auditTrail[creatorName].push({
        type: 'house_edge',
        title: ev.name + ' (Husmarginal)',
        isSideBet: Boolean(ev.is_side_bet),
        amount: Math.round(houseEdge),
        timestamp: ev.created_at
      });
    }

    for (const bet of bets) {
      const name = bet.bettor_name;
      ensurePlayer(name, bet.user_id);

      const won = bet.player_id === ev.winner_id;
      if (won) {
        const winnings = bet.amount * odds;
        const netWinnings = winnings - bet.amount;
        balances[name].amount += netWinnings;
        balances[name].rawTotal += netWinnings;
        auditTrail[name].push({
          type: ev.is_side_bet ? 'sidebet' : 'round',
          title: ev.name,
          eventId: ev.id,
          won: true,
          amount: Math.round(netWinnings),
          betAmount: bet.amount,
          payout: Math.round(winnings),
          timestamp: bet.created_at || ev.created_at
        });
      } else {
        balances[name].amount -= bet.amount;
        balances[name].rawTotal -= bet.amount;
        auditTrail[name].push({
          type: ev.is_side_bet ? 'sidebet' : 'round',
          title: ev.name,
          eventId: ev.id,
          won: false,
          amount: -Math.round(bet.amount),
          betAmount: bet.amount,
          timestamp: bet.created_at || ev.created_at
        });
      }
    }
  }

  // Fetch marked receipts (delbetalningar mitt i resan / kvitteringar)
  const receipts = stmts.getSettlementReceipts.all(tournamentId);
  for (const r of receipts) {
    if (r.amount > 0) {
      ensurePlayer(r.from_name, null);
      ensurePlayer(r.to_name, null);

      // Debtor paid: debt reduced (balance increases)
      balances[r.from_name].amount += r.amount;
      balances[r.from_name].totalPaid += r.amount;

      // Creditor received: credit reduced (balance decreases)
      balances[r.to_name].amount -= r.amount;
      balances[r.to_name].totalReceived += r.amount;

      auditTrail[r.from_name].push({
        type: 'payment_sent',
        receiptId: r.id,
        title: `📱 Inbetald delbetalning till ${r.to_name}`,
        to: r.to_name,
        amount: Math.round(r.amount),
        timestamp: r.paid_at
      });

      auditTrail[r.to_name].push({
        type: 'payment_received',
        receiptId: r.id,
        title: `📱 Mottagen delbetalning från ${r.from_name}`,
        from: r.from_name,
        amount: -Math.round(r.amount),
        timestamp: r.paid_at
      });
    }
  }

  // Calculate minimal transfers (remaining debt to be settled)
  const people = Object.entries(balances)
    .map(([name, data]) => ({
      name,
      amount: Math.round(data.amount),
      userId: data.userId
    }))
    .filter(p => Math.abs(p.amount) >= 1);

  const debtors = people.filter(p => p.amount < 0).sort((a, b) => a.amount - b.amount);
  const creditors = people.filter(p => p.amount > 0).sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let di = 0, ci = 0;

  const debtorWork = debtors.map(d => ({ ...d }));
  const creditorWork = creditors.map(c => ({ ...c }));

  while (di < debtorWork.length && ci < creditorWork.length) {
    const debtor = debtorWork[di];
    const creditor = creditorWork[ci];
    const transfer = Math.min(-debtor.amount, creditor.amount);

    if (transfer > 0) {
      let swishNumber = null;
      if (creditor.userId) {
        const user = stmts.getUserById.get(creditor.userId);
        if (user) swishNumber = user.swish_number;
      }
      if (!swishNumber && creditor.name) {
        const userByNick = stmts.getUserByNickname.get(creditor.name);
        if (userByNick) swishNumber = userByNick.swish_number;
      }

      transfers.push({
        from: debtor.name,
        fromUserId: debtor.userId,
        to: creditor.name,
        toUserId: creditor.userId,
        amount: transfer,
        toSwish: swishNumber,
        isPaid: false
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
      rawTotal: Math.round(data.rawTotal || 0),
      totalPaid: Math.round(data.totalPaid || 0),
      totalReceived: Math.round(data.totalReceived || 0),
      isDebtFree: Math.abs(Math.round(data.amount)) < 1,
      userId: data.userId
    })),
    transfers,
    receipts: receipts.map(r => ({
      id: r.id,
      fromName: r.from_name,
      toName: r.to_name,
      amount: r.amount,
      paidAt: r.paid_at
    })),
    auditTrail,
    finishedRounds: finishedEvents.length,
    totalRounds: events.length
  };
}

export function toggleSettlementReceipt(id, tournamentId, fromName, toName, amount) {
  const existing = stmts.getSettlementReceipt.get(tournamentId, fromName, toName);
  if (existing) {
    stmts.deleteSettlementReceipt.run(tournamentId, fromName, toName);
    return { isPaid: false, deletedId: existing.id };
  } else {
    stmts.insertSettlementReceipt.run(id, tournamentId, fromName, toName, amount);
    return { isPaid: true, id };
  }
}

export function getSettlementReceiptById(receiptId) {
  return stmts.getSettlementReceiptById.get(receiptId);
}

export function deleteSettlementReceiptById(receiptId) {
  return stmts.deleteSettlementReceiptById.run(receiptId);
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

// ── Minigame Duels API ─────────────────────────────────
export function createDuel({ gameType, creatorId, opponentId, stakeAmount, mode }) {
  const id = crypto.randomUUID();
  const status = mode === 'table' ? 'active' : (opponentId ? 'pending' : 'active');
  stmts.insertDuel.run({
    id,
    game_type: gameType || 'dice',
    creator_id: creatorId,
    opponent_id: opponentId || null,
    stake_amount: typeof stakeAmount === 'number' ? Math.max(0, stakeAmount) : 1,
    mode: mode || 'online',
    status
  });
  return getDuelById(id);
}

export function getDuelById(id) {
  return stmts.getDuelById.get(id);
}

export function respondDuel(id, opponentId, accept) {
  const duel = stmts.getDuelById.get(id);
  if (!duel) return null;
  if (duel.opponent_id !== opponentId) return null;
  if (duel.status !== 'pending') return duel;

  const newStatus = accept ? 'active' : 'declined';
  stmts.updateDuelStatus.run(newStatus, id);
  return stmts.getDuelById.get(id);
}

export function submitDuelResult({ duelId, creatorScore, opponentScore, winnerId }) {
  stmts.updateDuelResult.run({
    id: duelId,
    creator_score: creatorScore ?? null,
    opponent_score: opponentScore ?? null,
    winner_id: winnerId ?? null,
    status: 'completed'
  });
  return stmts.getDuelById.get(duelId);
}

export function getPendingDuelsForUser(userId) {
  if (!userId) return [];
  return stmts.getPendingDuelsForUser.all(userId);
}

export function getUserDuels(userId) {
  if (!userId) return [];
  return stmts.getUserDuels.all(userId, userId);
}

export function getDuelSettlementSummary(userId) {
  if (!userId) return { friends: [], totalNet: 0 };
  const unsettles = stmts.getUnsettledDuelsForUser.all(userId, userId);

  const friendsMap = new Map();

  for (const d of unsettles) {
    const isCreator = d.creator_id === userId;
    const friendId = isCreator ? d.opponent_id : d.creator_id;
    if (!friendId) continue;

    const friendName = isCreator ? (d.opponent_real_name || d.opponent_nickname) : (d.creator_real_name || d.creator_nickname);
    const friendNickname = isCreator ? d.opponent_nickname : d.creator_nickname;
    const friendSwish = isCreator ? d.opponent_swish : d.creator_swish;
    const friendAvatarEmoji = isCreator ? d.opponent_avatar_emoji : d.creator_avatar_emoji;
    const friendAvatarUrl = isCreator ? d.opponent_avatar_url : d.creator_avatar_url;

    if (!friendsMap.has(friendId)) {
      friendsMap.set(friendId, {
        friendId,
        friendName,
        friendNickname,
        friendSwish,
        friendAvatarEmoji,
        friendAvatarUrl,
        netAmount: 0,
        duelsCount: 0,
        duelIds: [],
        duels: [],
        expenseIds: []
      });
    }

    const item = friendsMap.get(friendId);
    item.duelsCount++;
    item.duelIds.push(d.id);
    if (!item.duels) item.duels = [];
    if (!item.expenseIds) item.expenseIds = [];

    const youWon = d.winner_id === userId;
    item.duels.push({
      id: d.id,
      gameType: d.game_type,
      stakeAmount: Number(d.stake_amount) || 0,
      winnerId: d.winner_id,
      youWon,
      expenseId: d.expense_id || null,
      customTitle: d.custom_title || null,
      hasReceipt: !!d.receipt_image,
      createdAt: d.created_at
    });

    if (d.expense_id && !item.expenseIds.includes(d.expense_id)) {
      item.expenseIds.push(d.expense_id);
    }

    if (youWon) {
      item.netAmount += Number(d.stake_amount) || 0;
    } else {
      item.netAmount -= Number(d.stake_amount) || 0;
    }
  }

  let totalNet = 0;
  const friends = Array.from(friendsMap.values()).map(f => {
    f.netAmount = Math.round(f.netAmount * 100) / 100;
    totalNet += f.netAmount;
    return f;
  });

  return { friends, totalNet: Math.round(totalNet * 100) / 100 };
}

export function settleDuelById(duelId) {
  stmts.settleDuel.run(duelId);
  return true;
}

export function settleDuelsBetweenUsers(userId, friendId) {
  stmts.settleDuelsBetweenUsers.run(userId, friendId, friendId, userId);
  return true;
}

// ── AnyBet Public API ─────────────────────────────────

export function createAnyBet({ title, description, creatorId, judgeId, stakeAmount, betType, deadline, participantIds }) {
  const betId = crypto.randomUUID();
  const stake = typeof stakeAmount === 'number' ? Math.max(0, stakeAmount) : (parseFloat(stakeAmount) || 0);

  stmts.insertAnyBet.run({
    id: betId,
    title: title.trim(),
    description: description ? description.trim() : null,
    creator_id: creatorId,
    judge_id: judgeId || creatorId,
    stake_amount: stake,
    bet_type: betType || 'winner_takes_all',
    deadline: deadline || null,
    status: 'open'
  });

  // Ensure creator is included in participants
  const allParticipantIds = new Set(participantIds || []);
  allParticipantIds.add(creatorId);

  for (const pUserId of allParticipantIds) {
    stmts.insertAnyBetParticipant.run({
      id: crypto.randomUUID(),
      bet_id: betId,
      user_id: pUserId,
      choice: 'participant',
      status: pUserId === creatorId ? 'accepted' : 'invited'
    });
  }

  return getAnyBetById(betId);
}

export function getAnyBetById(id) {
  const bet = stmts.getAnyBetById.get(id);
  if (!bet) return null;
  const participants = stmts.getAnyBetParticipants.all(id);
  return { ...bet, participants };
}

export function getAnyBetsForUser(userId) {
  const bets = stmts.getAnyBetsForUser.all(userId, userId, userId);
  return bets.map(b => {
    const participants = stmts.getAnyBetParticipants.all(b.id);
    return { ...b, participants };
  });
}

export function updateAnyBetChoice(betId, userId, choice) {
  stmts.updateAnyBetParticipantChoice.run(choice, betId, userId);
  return getAnyBetById(betId);
}

export function settleAnyBet({ betId, judgeId, winnerId, winningSide, proofImageUrl }) {
  const bet = getAnyBetById(betId);
  if (!bet) throw new Error('Bettet hittades inte');
  if (bet.judge_id !== judgeId && bet.creator_id !== judgeId) {
    throw new Error('Endast domaren kan avgöra bettet');
  }
  if (bet.status === 'completed') {
    throw new Error('Bettet är redan avgjort');
  }

  stmts.settleAnyBet.run({
    id: betId,
    winner_id: winnerId || null,
    winning_side: winningSide || null,
    proof_image_url: proofImageUrl || null
  });

  // If there is money on the line, settle debts in minigame_duels for Notan & Swish!
  if (bet.stake_amount > 0) {
    const acceptedParticipants = bet.participants.filter(p => p.status === 'accepted');

    if (bet.bet_type === 'winner_takes_all' && winnerId) {
      const losers = acceptedParticipants.filter(p => p.user_id !== winnerId);
      for (const loser of losers) {
        try {
          const duelId = crypto.randomUUID();
          stmts.insertDuel.run({
            id: duelId,
            game_type: 'anybet',
            creator_id: winnerId,
            opponent_id: loser.user_id,
            stake_amount: bet.stake_amount,
            mode: 'anybet',
            status: 'completed'
          });
          stmts.updateDuelResult.run({
            id: duelId,
            creator_score: 1,
            opponent_score: 0,
            winner_id: winnerId,
            status: 'completed'
          });
        } catch (e) {
          console.error('Failed to log anybet debt settlement:', e);
        }
      }
    } else if (bet.bet_type === 'yes_no' && winningSide) {
      const winners = acceptedParticipants.filter(p => p.choice === winningSide);
      const losers = acceptedParticipants.filter(p => p.choice && p.choice !== winningSide);

      if (winners.length > 0 && losers.length > 0) {
        for (const loser of losers) {
          for (const winner of winners) {
            try {
              const perWinnerStake = Math.round((bet.stake_amount / winners.length) * 100) / 100;
              if (perWinnerStake <= 0) continue;
              const duelId = crypto.randomUUID();
              stmts.insertDuel.run({
                id: duelId,
                game_type: 'anybet',
                creator_id: winner.user_id,
                opponent_id: loser.user_id,
                stake_amount: perWinnerStake,
                mode: 'anybet',
                status: 'completed'
              });
              stmts.updateDuelResult.run({
                id: duelId,
                creator_score: 1,
                opponent_score: 0,
                winner_id: winner.user_id,
                status: 'completed'
              });
            } catch (e) {
              console.error('Failed to log anybet yes/no debt settlement:', e);
            }
          }
        }
      }
    }
  }

  return getAnyBetById(betId);
}

// ── Push Subscriptions API ───────────────────────────

export function savePushSubscription(id, userId, endpoint, p256dh, auth) {
  stmts.insertPushSubscription.run(id, userId, endpoint, p256dh, auth);
}

export function deletePushSubscriptionByEndpoint(endpoint) {
  stmts.deletePushSubscriptionByEndpoint.run(endpoint);
}

export function getUserNotificationPrefs(userId) {
  const row = stmts.getUserNotificationPrefs.get(userId);
  if (!row) {
    return { notifyFlashbets: true, notifyDuels: true, notifyTournaments: true };
  }
  return {
    notifyFlashbets: row.notify_flashbets !== 0,
    notifyDuels: row.notify_duels !== 0,
    notifyTournaments: row.notify_tournaments !== 0
  };
}

export function updateUserNotificationPrefs(userId, prefs = {}) {
  const current = getUserNotificationPrefs(userId);
  const flash = prefs.notifyFlashbets !== undefined ? (prefs.notifyFlashbets ? 1 : 0) : (current.notifyFlashbets ? 1 : 0);
  const duels = prefs.notifyDuels !== undefined ? (prefs.notifyDuels ? 1 : 0) : (current.notifyDuels ? 1 : 0);
  const tourneys = prefs.notifyTournaments !== undefined ? (prefs.notifyTournaments ? 1 : 0) : (current.notifyTournaments ? 1 : 0);
  stmts.updateUserNotificationPrefs.run(flash, duels, tourneys, userId);
  return getUserNotificationPrefs(userId);
}

export function getPushSubscriptionsForUsers(userIds = [], category = null) {
  if (!userIds || userIds.length === 0) return [];
  const subs = [];
  for (const uid of userIds) {
    if (category) {
      const prefs = getUserNotificationPrefs(uid);
      if (category === 'flashbets' && !prefs.notifyFlashbets) continue;
      if (category === 'duels' && !prefs.notifyDuels) continue;
      if (category === 'tournaments' && !prefs.notifyTournaments) continue;
    }
    const userSubs = stmts.getPushSubscriptionsByUser.all(uid);
    subs.push(...userSubs);
  }
  return subs;
}

export function getTournamentParticipantUserIds(tournamentId) {
  const t = stmts.getTournamentById.get(tournamentId);
  const userIds = new Set();
  if (t && t.creator_id) {
    userIds.add(t.creator_id);
    if (t.visibility === 'friends') {
      const friendRows = db.prepare('SELECT friend_id FROM friends WHERE user_id = ?').all(t.creator_id);
      for (const f of friendRows) {
        if (f.friend_id) userIds.add(f.friend_id);
      }
    }
  }
  // Add users who have placed bets in this tournament
  const bettorRows = db.prepare(`
    SELECT DISTINCT b.user_id
    FROM bets b
    JOIN events e ON b.event_id = e.id
    WHERE e.tournament_id = ? AND b.user_id IS NOT NULL
  `).all(tournamentId);
  for (const row of bettorRows) {
    if (row.user_id) userIds.add(row.user_id);
  }
  return Array.from(userIds);
}

// ── Flash Bets (BlixtBet) API ────────────────────────

export function createFlashBet(id, creatorId, tournamentId, question, durationSeconds, expiresAt, stakeAmount = 20) {
  stmts.insertFlashBet.run(id, creatorId, tournamentId || null, question, durationSeconds, expiresAt, stakeAmount);
  return getFlashBet(id);
}

export function getFlashBet(id, currentUserId = null) {
  const fb = stmts.getFlashBetById.get(id);
  if (!fb) return null;

  // Auto-lock if expired and still open
  const now = new Date();
  const expires = new Date(fb.expires_at);
  let status = fb.status;
  if (status === 'open' && now >= expires) {
    status = 'locked';
    stmts.updateFlashBetStatus.run('locked', fb.id);
  }

  const entries = stmts.getFlashBetEntries.all(fb.id);
  const yesEntries = entries.filter(e => e.choice === 'yes');
  const noEntries = entries.filter(e => e.choice === 'no');
  const totalPool = entries.reduce((sum, e) => sum + e.amount, 0);

  const secondsLeft = Math.max(0, Math.floor((expires.getTime() - now.getTime()) / 1000));

  let myEntry = null;
  if (currentUserId) {
    const found = entries.find(e => e.user_id === currentUserId);
    if (found) {
      myEntry = {
        id: found.id,
        choice: found.choice,
        amount: found.amount,
        createdAt: found.created_at
      };
    }
  }

  return {
    id: fb.id,
    creatorId: fb.creator_id,
    creatorNickname: fb.creator_nickname,
    creatorRealName: fb.creator_real_name,
    creatorAvatar: fb.creator_avatar,
    creatorAvatarUrl: fb.creator_avatar_url,
    tournamentId: fb.tournament_id,
    question: fb.question,
    title: fb.question,
    durationSeconds: fb.duration_seconds,
    expiresAt: fb.expires_at,
    status,
    winningChoice: fb.winning_choice,
    stakeAmount: fb.stake_amount,
    createdAt: fb.created_at,
    secondsLeft,
    totalPool,
    yesCount: yesEntries.length,
    noCount: noEntries.length,
    entriesCount: entries.length,
    betCount: entries.length,
    entries: entries.map(e => ({
      id: e.id,
      userId: e.user_id,
      nickname: e.nickname,
      realName: e.real_name,
      avatar: e.avatar_emoji,
      avatarUrl: e.avatar_url,
      choice: e.choice,
      amount: e.amount,
      createdAt: e.created_at
    })),
    myEntry
  };
}

export function getActiveFlashBets(userId = null) {
  const active = stmts.getActiveFlashBets.all();
  return active.map(fb => getFlashBet(fb.id, userId)).filter(fb => fb && fb.status === 'open');
}

export function placeFlashBetEntry(id, flashBetId, userId, choice, amount) {
  const fb = stmts.getFlashBetById.get(flashBetId);
  if (!fb) throw new Error('BlixtBet hittades inte');

  const now = new Date();
  const expires = new Date(fb.expires_at);
  if (now >= expires || fb.status !== 'open') {
    stmts.updateFlashBetStatus.run('locked', fb.id);
    throw new Error('Tiden har gått ut för detta BlixtBet!');
  }

  const existing = stmts.getFlashBetEntryForUser.get(flashBetId, userId);
  if (existing) {
    throw new Error('Du har redan lagt ditt val i detta BlixtBet');
  }

  stmts.insertFlashBetEntry.run(id, flashBetId, userId, choice, amount);
  return getFlashBet(flashBetId, userId);
}

export function settleFlashBet(flashBetId, winningChoice, settleUserId) {
  const fb = stmts.getFlashBetById.get(flashBetId);
  if (!fb) throw new Error('BlixtBet hittades inte');
  if (fb.status === 'settled') throw new Error('Detta BlixtBet är redan avgjort');

  // Verify authorization: creator or tournament creator can settle
  let isAllowed = fb.creator_id === settleUserId;
  if (!isAllowed && fb.tournament_id) {
    const t = stmts.getTournamentById.get(fb.tournament_id);
    if (t && t.creator_id === settleUserId) isAllowed = true;
  }
  if (!isAllowed) throw new Error('Endast skaparen kan avgöra detta BlixtBet');

  stmts.updateFlashBetSettle.run(winningChoice, flashBetId);

  // Settlement and debt logging
  const entries = stmts.getFlashBetEntries.all(flashBetId);
  const winners = entries.filter(e => e.choice === winningChoice);
  const losers = entries.filter(e => e.choice !== winningChoice);

  if (winners.length > 0 && losers.length > 0) {
    for (const loser of losers) {
      for (const winner of winners) {
        try {
          const perWinnerStake = Math.round((loser.amount / winners.length) * 100) / 100;
          if (perWinnerStake <= 0) continue;
          const duelId = crypto.randomUUID();
          stmts.insertDuel.run({
            id: duelId,
            game_type: 'flashbet',
            creator_id: winner.user_id,
            opponent_id: loser.user_id,
            stake_amount: perWinnerStake,
            mode: 'flashbet',
            status: 'completed'
          });
          stmts.updateDuelResult.run({
            id: duelId,
            creator_score: 1,
            opponent_score: 0,
            winner_id: winner.user_id,
            status: 'completed'
          });
        } catch (e) {
          console.error('Failed to log flash bet debt duel:', e);
        }
      }
    }
  }

  return getFlashBet(flashBetId, settleUserId);
}

// ── Tab Expenses & Even Steven Public API ─────────────

export function createTabExpense({ payerId, title, notes, totalAmount, mode, participantIds = [], loserId = null, receiptImage = null, customShares = null }) {
  if (!payerId) throw new Error('Payer is required');
  const amount = parseFloat(totalAmount);
  if (isNaN(amount) || amount <= 0) throw new Error('Giltigt totalbelopp krävs');
  
  const cleanTitle = (title && title.trim()) ? title.trim() : (mode === 'roulette' ? 'Not-Roulette' : 'Dela nota');
  const cleanNotes = (notes && notes.trim()) ? notes.trim() : null;
  const expenseId = crypto.randomUUID();

  // Ensure unique list of participant user IDs including the payer
  const allParticipantSet = new Set(participantIds.map(String));
  allParticipantSet.add(String(payerId));
  const allParticipants = Array.from(allParticipantSet);

  if (allParticipants.length < 2) {
    throw new Error('Minst 2 personer krävs för att dela eller spela om en nota');
  }

  const tx = db.transaction(() => {
    // 1. Insert tab expense record
    stmts.insertTabExpense.run({
      id: expenseId,
      payer_id: payerId,
      title: cleanTitle,
      notes: cleanNotes,
      total_amount: amount,
      mode: mode === 'roulette' ? 'roulette' : 'even_steven',
      loser_id: mode === 'roulette' ? (loserId ? String(loserId) : null) : null,
      receipt_image: receiptImage || null
    });

    if (mode === 'roulette') {
      const actualLoser = loserId ? String(loserId) : null;
      if (!actualLoser) throw new Error('En förlorare måste väljas för Not-Roulette');

      // Record participants
      for (const uid of allParticipants) {
        stmts.insertTabExpenseParticipant.run({
          id: crypto.randomUUID(),
          expense_id: expenseId,
          user_id: uid,
          amount: uid === actualLoser ? amount : 0
        });
      }

      // If loser is not the payer, create debt duel where payer is winner and loser is opponent
      if (actualLoser !== String(payerId)) {
        const duelId = crypto.randomUUID();
        stmts.insertTabExpenseDuel.run({
          id: duelId,
          game_type: 'not_roulette',
          creator_id: payerId,
          opponent_id: actualLoser,
          stake_amount: amount,
          mode: 'roulette',
          winner_id: payerId,
          expense_id: expenseId,
          custom_title: cleanTitle,
          receipt_image: receiptImage || null
        });
      }
    } else {
      // Even Steven: either custom individual shares or split evenly
      let userShares = {};
      const hasCustomShares = customShares && typeof customShares === 'object' && Object.keys(customShares).length > 0;

      if (hasCustomShares) {
        let allocatedSum = 0;
        for (const uid of allParticipants) {
          const val = parseFloat(customShares[uid]);
          const share = (!isNaN(val) && val >= 0) ? Math.round(val * 100) / 100 : 0;
          userShares[uid] = share;
          allocatedSum += share;
        }

        // Validate sum against total amount (tolerance: 1 kr)
        allocatedSum = Math.round(allocatedSum * 100) / 100;
        const diff = Math.abs(allocatedSum - amount);
        if (diff > 1.0) {
          throw new Error(`Summan av deltagarnas belopp (${allocatedSum} kr) matchar inte totalbeloppet (${amount} kr)`);
        }
      } else {
        const splitAmount = Math.round((amount / allParticipants.length) * 100) / 100;
        for (const uid of allParticipants) {
          userShares[uid] = splitAmount;
        }
      }

      for (const uid of allParticipants) {
        const share = userShares[uid] ?? 0;

        stmts.insertTabExpenseParticipant.run({
          id: crypto.randomUUID(),
          expense_id: expenseId,
          user_id: uid,
          amount: share
        });

        // For every participant who is NOT the payer and has a debt > 0, create debt duel to payer
        if (uid !== String(payerId) && share > 0) {
          const duelId = crypto.randomUUID();
          stmts.insertTabExpenseDuel.run({
            id: duelId,
            game_type: 'even_steven',
            creator_id: payerId,
            opponent_id: uid,
            stake_amount: share,
            mode: 'even_steven',
            winner_id: payerId,
            expense_id: expenseId,
            custom_title: cleanTitle,
            receipt_image: receiptImage || null
          });
        }
      }
    }

    return expenseId;
  });

  const createdId = tx();
  return getTabExpenseById(createdId);
}

export function getTabExpenseById(id) {
  if (!id) return null;
  const expense = stmts.getTabExpenseById.get(id);
  if (!expense) return null;
  const participants = stmts.getTabExpenseParticipants.all(id);
  return {
    ...expense,
    participants
  };
}

export function getTabExpensesForUser(userId) {
  if (!userId) return [];
  return stmts.getTabExpensesForUser.all(userId, userId, userId);
}

export function convertTabExpenseToEvenSteven(expenseId, requestingUserId) {
  if (!expenseId) throw new Error('Expense ID is required');
  const expense = getTabExpenseById(expenseId);
  if (!expense) throw new Error('Nota / utlägg hittades inte');

  if (expense.mode !== 'roulette') {
    throw new Error('Endast Not-Roulette kan göras om till Even Steven');
  }

  // Authorization: only the loser or the payer can trigger this safety valve
  const isLoser = String(expense.loser_id) === String(requestingUserId);
  const isPayer = String(expense.payer_id) === String(requestingUserId);
  if (!isLoser && !isPayer) {
    throw new Error('Endast förloraren eller den som lade ut kan göra om notan till Even Steven');
  }

  const allExpenseDuels = db.prepare('SELECT * FROM minigame_duels WHERE expense_id = ?').all(expenseId);
  const isAlreadySettled = allExpenseDuels.some(d => d.is_settled === 1);
  if (isAlreadySettled) {
    throw new Error('Notan är redan kvitterad och kan inte ändras');
  }

  const participants = expense.participants || [];
  if (participants.length < 2) {
    throw new Error('För få deltagare för att dela');
  }

  const splitAmount = Math.round((expense.total_amount / participants.length) * 100) / 100;

  const tx = db.transaction(() => {
    // 1. Delete old roulette duel(s)
    stmts.deleteExpenseDuels.run(expenseId);

    // 2. Update tab_expenses mode to 'even_steven'
    stmts.updateTabExpenseMode.run(expenseId);

    // 3. Update participant amounts and insert new even_steven duels
    for (const p of participants) {
      stmts.updateTabExpenseParticipantAmount.run(splitAmount, expenseId, p.user_id);

      if (String(p.user_id) !== String(expense.payer_id)) {
        const duelId = crypto.randomUUID();
        stmts.insertTabExpenseDuel.run({
          id: duelId,
          game_type: 'even_steven',
          creator_id: expense.payer_id,
          opponent_id: p.user_id,
          stake_amount: splitAmount,
          mode: 'even_steven',
          winner_id: expense.payer_id,
          expense_id: expenseId,
          custom_title: expense.title,
          receipt_image: expense.receipt_image || null
        });
      }
    }
  });

  tx();
  return getTabExpenseById(expenseId);
}



