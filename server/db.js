import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path resolution:
// 1. Explicit DB_PATH / DATABASE_PATH environment variable
// 2. Railway volume mount path (RAILWAY_VOLUME_MOUNT_PATH or DATA_DIR)
// 3. Fallback to local betpals.db in server directory
let DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR;
if (!DB_DIR && fs.existsSync('/data')) {
  DB_DIR = '/data';
}
const DB_PATH = process.env.DB_PATH || process.env.DATABASE_PATH || (DB_DIR ? join(DB_DIR, 'betpals.db') : join(__dirname, 'betpals.db'));

if (DB_DIR) {
  if (!fs.existsSync(DB_DIR)) {
    try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch (e) {}
  }
  const sourceDb = join(__dirname, 'betpals.db');
  if (DB_PATH !== sourceDb && !fs.existsSync(DB_PATH) && fs.existsSync(sourceDb)) {
    try {
      fs.copyFileSync(sourceDb, DB_PATH);
      console.log('Copied existing database to persistent volume at', DB_PATH);
    } catch (e) {
      console.warn('Could not copy existing database to volume:', e);
    }
  }
}

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
    real_name TEXT,
    swish_number TEXT,
    token_created_at TEXT DEFAULT (datetime('now')),
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

  CREATE TABLE IF NOT EXISTS tournament_participants (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    name TEXT NOT NULL,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_participants_tourney ON tournament_participants(tournament_id);

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
    closes_at TEXT,
    last_boosted_at TEXT,
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
  CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);

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
try { db.exec("UPDATE tournaments SET visibility = 'friends' WHERE visibility = 'public'"); } catch {}
try { db.exec('ALTER TABLE events ADD COLUMN linked_round_id TEXT'); } catch {}
try { db.exec('ALTER TABLE events ADD COLUMN bet_mode TEXT NOT NULL DEFAULT \'open\''); } catch {}
try { db.exec('ALTER TABLE events ADD COLUMN image_url TEXT'); } catch {}
try { db.exec('ALTER TABLE events ADD COLUMN winner_image_url TEXT'); } catch {}
try { db.exec('ALTER TABLE events ADD COLUMN closes_at TEXT'); } catch {}
try { db.exec('ALTER TABLE events ADD COLUMN last_boosted_at TEXT'); } catch {}
try { db.exec('ALTER TABLE players ADD COLUMN image_url TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN swish_number TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN real_name TEXT'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_users_swish ON users(swish_number)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_users_real_name ON users(real_name)'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN pin_hash TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN pin_salt TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN needs_pin_reset INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN reset_code TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN reset_code_expires TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN notify_flashbets INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN notify_duels INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN notify_tournaments INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN notify_support INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN token_created_at TEXT'); } catch { /* Column already exists */ }
try { db.exec('ALTER TABLE users ADD COLUMN is_guest INTEGER DEFAULT 0'); } catch {}

// Rate limiting table (persistent across restarts)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
} catch {}
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
      from_user_id TEXT,
      to_user_id TEXT,
      paid_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_receipts_tournament ON tournament_settlement_receipts(tournament_id);
  `);
} catch {}
try { db.exec('ALTER TABLE tournament_settlement_receipts ADD COLUMN from_user_id TEXT'); } catch {}
try { db.exec('ALTER TABLE tournament_settlement_receipts ADD COLUMN to_user_id TEXT'); } catch {}
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS atomic_clearings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      expected_amount INTEGER NOT NULL,
      total_cleared INTEGER NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, idempotency_key)
    );
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
      expense_id TEXT,
      custom_title TEXT,
      receipt_image TEXT,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (opponent_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_duels_creator ON minigame_duels(creator_id);
    CREATE INDEX IF NOT EXISTS idx_duels_opponent ON minigame_duels(opponent_id);
    CREATE INDEX IF NOT EXISTS idx_duels_status ON minigame_duels(status);
  `);
} catch {}
try { db.exec('ALTER TABLE minigame_duels ADD COLUMN expense_id TEXT'); } catch {}
try { db.exec('ALTER TABLE minigame_duels ADD COLUMN custom_title TEXT'); } catch {}
try { db.exec('ALTER TABLE minigame_duels ADD COLUMN receipt_image TEXT'); } catch {}
try { db.exec('ALTER TABLE minigame_duels ADD COLUMN tournament_id TEXT'); } catch {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lotto_draws (
      id TEXT PRIMARY KEY,
      draw_number INTEGER NOT NULL,
      draw_date TEXT NOT NULL,
      jackpot_amount REAL NOT NULL,
      rollover_amount REAL DEFAULT 0,
      winning_main TEXT,
      winning_stars TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_lotto_draws_status ON lotto_draws(status);

    CREATE TABLE IF NOT EXISTS lotto_syndicates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      creator_id TEXT NOT NULL,
      stake_per_person REAL DEFAULT 25,
      members TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_lotto_syndicates_code ON lotto_syndicates(code);

    CREATE TABLE IF NOT EXISTS lotto_tickets (
      id TEXT PRIMARY KEY,
      draw_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      syndicate_id TEXT,
      main_numbers TEXT NOT NULL,
      star_numbers TEXT NOT NULL,
      matches_main INTEGER DEFAULT 0,
      matches_stars INTEGER DEFAULT 0,
      prize_tier INTEGER DEFAULT 0,
      prize_amount REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (draw_id) REFERENCES lotto_draws(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (syndicate_id) REFERENCES lotto_syndicates(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lotto_tickets_draw ON lotto_tickets(draw_id);
    CREATE INDEX IF NOT EXISTS idx_lotto_tickets_user ON lotto_tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_lotto_tickets_syndicate ON lotto_tickets(syndicate_id);
  `);
} catch {}

try { db.exec('ALTER TABLE lotto_draws ADD COLUMN title TEXT'); } catch {}
try { db.exec('ALTER TABLE lotto_draws ADD COLUMN creator_id TEXT'); } catch {}
try { db.exec('ALTER TABLE lotto_draws ADD COLUMN creator_name TEXT'); } catch {}
try { db.exec('ALTER TABLE lotto_draws ADD COLUMN stake_amount REAL DEFAULT 25'); } catch {}
try { db.exec('ALTER TABLE lotto_draws ADD COLUMN target_user_ids TEXT'); } catch {}
try { db.exec('ALTER TABLE lotto_draws ADD COLUMN winner_id TEXT'); } catch {}
try { db.exec('ALTER TABLE lotto_draws ADD COLUMN winner_nickname TEXT'); } catch {}
try { db.exec('ALTER TABLE lotto_draws ADD COLUMN winner_hits INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE lotto_draws ADD COLUMN is_tie INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE lotto_draws ADD COLUMN tied_winners TEXT'); } catch {}
try { db.exec('ALTER TABLE lotto_tickets ADD COLUMN user_nickname TEXT'); } catch {}

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
      tournament_id TEXT,
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
try { db.exec('ALTER TABLE anybets ADD COLUMN tournament_id TEXT'); } catch (e) { /* Column already exists – expected on existing databases */ }
try { db.exec('ALTER TABLE flash_bets ADD COLUMN target_user_ids TEXT'); } catch (e) { /* Column already exists – expected on existing databases */ }

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
      target_user_ids TEXT,
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

    CREATE TABLE IF NOT EXISTS flash_live_streams (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL,
      host_name TEXT NOT NULL,
      host_avatar TEXT,
      question TEXT NOT NULL,
      has_bet INTEGER NOT NULL DEFAULT 1,
      stake_amount INTEGER NOT NULL DEFAULT 20,
      duration_seconds INTEGER NOT NULL DEFAULT 60,
      expires_at TEXT,
      target_user_ids TEXT,
      flash_bet_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (flash_bet_id) REFERENCES flash_bets(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_flash_live_host ON flash_live_streams(host_id);
    CREATE INDEX IF NOT EXISTS idx_flash_live_status ON flash_live_streams(status);
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
      tournament_id TEXT,
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
try { db.exec('ALTER TABLE tab_expenses ADD COLUMN tournament_id TEXT'); } catch (e) { /* Column already exists – expected on existing databases */ }

// Duel results require both parties to agree: first report is stored here until confirmed
try { db.exec('ALTER TABLE minigame_duels ADD COLUMN reported_by TEXT'); } catch {}
try { db.exec('ALTER TABLE minigame_duels ADD COLUMN reported_creator_score INTEGER'); } catch {}
try { db.exec('ALTER TABLE minigame_duels ADD COLUMN reported_opponent_score INTEGER'); } catch {}
try { db.exec('ALTER TABLE minigame_duels ADD COLUMN reported_winner_id TEXT'); } catch {}

// Once a result has been revealed, an event may never be opened for betting again
try { db.exec('ALTER TABLE events ADD COLUMN was_finished INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec("UPDATE events SET was_finished = 1 WHERE status = 'finished'"); } catch {}

// Friendships require consent: requests live here until accepted
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (from_user_id, to_user_id),
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id);
  `);
} catch {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shl_fantasy_leagues (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      round_id TEXT NOT NULL,
      stake_amount INTEGER NOT NULL DEFAULT 50,
      mode TEXT NOT NULL DEFAULT 'swish',
      status TEXT NOT NULL DEFAULT 'open',
      winner_id TEXT,
      simulation_data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_shl_league_code ON shl_fantasy_leagues(code);
    CREATE INDEX IF NOT EXISTS idx_shl_league_creator ON shl_fantasy_leagues(creator_id);

    CREATE TABLE IF NOT EXISTS shl_fantasy_entries (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      avatar_emoji TEXT DEFAULT '🏒',
      swish_number TEXT,
      lineup TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      is_paid INTEGER NOT NULL DEFAULT 0,
      is_locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (league_id) REFERENCES shl_fantasy_leagues(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(league_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_shl_entries_league ON shl_fantasy_entries(league_id);
    CREATE INDEX IF NOT EXISTS idx_shl_entries_user ON shl_fantasy_entries(user_id);
  `);
} catch {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS loven_games (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      opponent_team TEXT NOT NULL,
      is_home INTEGER NOT NULL DEFAULT 1,
      match_date TEXT NOT NULL,
      stake_amount REAL NOT NULL DEFAULT 20,
      status TEXT NOT NULL DEFAULT 'open',
      tournament_id TEXT,
      result_loven_goals INTEGER,
      result_opponent_goals INTEGER,
      result_last_scorer TEXT,
      result_shots_on_goal INTEGER,
      winner_user_ids TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      settled_at TEXT,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_loven_games_creator ON loven_games(creator_id);
    CREATE INDEX IF NOT EXISTS idx_loven_games_status ON loven_games(status);

    CREATE TABLE IF NOT EXISTS loven_game_entries (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      pred_loven_goals INTEGER NOT NULL,
      pred_opponent_goals INTEGER NOT NULL,
      pred_last_scorer TEXT NOT NULL,
      pred_shots_on_goal INTEGER NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      pts_result INTEGER NOT NULL DEFAULT 0,
      pts_scorer INTEGER NOT NULL DEFAULT 0,
      pts_shots INTEGER NOT NULL DEFAULT 0,
      is_winner INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (game_id) REFERENCES loven_games(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(game_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_loven_entries_game ON loven_game_entries(game_id);
    CREATE INDEX IF NOT EXISTS idx_loven_entries_user ON loven_game_entries(user_id);
  `);
} catch {}

try { db.exec('ALTER TABLE shl_fantasy_leagues ADD COLUMN simulation_data TEXT'); } catch {}
try { db.exec('ALTER TABLE shl_fantasy_entries ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0'); } catch {}

// One-time data cleanup: normalize existing swish_number in the users table
try {
  const usersWithSwish = db.prepare("SELECT id, swish_number FROM users WHERE swish_number IS NOT NULL AND swish_number != ''").all();
  const updateSwishStmt = db.prepare("UPDATE users SET swish_number = ? WHERE id = ?");
  for (const u of usersWithSwish) {
    const norm = normalizePhone(u.swish_number);
    if (norm && norm !== u.swish_number) {
      try { updateSwishStmt.run(norm, u.id); } catch {}
    }
  }
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
    INSERT INTO events (id, name, date, status, min_bet, max_bet, payout_percent, share_code, creator_id, swish_number, tournament_id, is_side_bet, linked_round_id, bet_mode, image_url, winner_image_url, closes_at, last_boosted_at)
    VALUES (@id, @name, @date, COALESCE(@status, 'open'), @minBet, @maxBet, @payoutPercent, @shareCode, @creatorId, @swishNumber, @tournamentId, @isSideBet, @linkedRoundId, @betMode, @imageUrl, @winnerImageUrl, @closesAt, @lastBoostedAt)
  `),
  getEventById: db.prepare('SELECT * FROM events WHERE id = ?'),
  getEventByCode: db.prepare('SELECT * FROM events WHERE share_code = ?'),
  getAllEvents: db.prepare('SELECT * FROM events ORDER BY created_at DESC'),
  getOpenEvents: db.prepare('SELECT * FROM events WHERE status = \'open\' ORDER BY created_at DESC'),
  updateEventStatus: db.prepare('UPDATE events SET status = ? WHERE id = ?'),
  updateEventWinner: db.prepare('UPDATE events SET winner_id = ?, winner_image_url = COALESCE(?, winner_image_url), status = \'finished\', was_finished = 1 WHERE id = ?'),
  updateEventImage: db.prepare('UPDATE events SET image_url = ? WHERE id = ?'),
  updateEventClosesAt: db.prepare('UPDATE events SET closes_at = ? WHERE id = ?'),
  updateEventLastBoosted: db.prepare('UPDATE events SET last_boosted_at = ? WHERE id = ?'),
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
  getUserByToken: db.prepare('SELECT * FROM users WHERE token = ? AND (token_created_at IS NULL OR datetime(token_created_at, \'+30 days\') > datetime(\'now\'))'),
  getUserByNickname: db.prepare('SELECT * FROM users WHERE LOWER(nickname) = LOWER(?)'),
  getUserByRealName: db.prepare('SELECT * FROM users WHERE LOWER(real_name) = LOWER(?)'),
  getUserByEmail: db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)'),
  getUserBySwish: db.prepare(`
    SELECT * FROM users 
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(swish_number, ' ', ''), '-', ''), '+', ''), '.', ''), '(', ''), ')', '') = ?
       OR swish_number = ?
  `),
  getUserByGoogleId: db.prepare('SELECT * FROM users WHERE google_id = ?'),
  getAllUsers: db.prepare('SELECT id, nickname, real_name, swish_number, avatar_emoji, avatar_url, email, needs_pin_reset, CASE WHEN pin_hash IS NOT NULL THEN 1 ELSE 0 END as has_pin, created_at FROM users ORDER BY created_at DESC'),
  insertUser: db.prepare('INSERT INTO users (id, nickname, token, avatar_emoji, real_name, swish_number, token_created_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'),
  insertUserWithPin: db.prepare('INSERT INTO users (id, nickname, token, avatar_emoji, real_name, swish_number, pin_hash, pin_salt, token_created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))'),
  setUserPin: db.prepare('UPDATE users SET pin_hash = ?, pin_salt = ?, needs_pin_reset = 0, reset_code = NULL, reset_code_expires = NULL, token = coalesce(?, token), token_created_at = CASE WHEN ? IS NOT NULL THEN datetime(\'now\') ELSE token_created_at END WHERE id = ?'),
  updateUserToken: db.prepare('UPDATE users SET token = ?, token_created_at = datetime(\'now\') WHERE id = ?'),
  resetUserPin: db.prepare('UPDATE users SET pin_hash = NULL, pin_salt = NULL, needs_pin_reset = 1, reset_code = ?, reset_code_expires = ? WHERE id = ?'),
  insertGoogleUser: db.prepare('INSERT INTO users (id, nickname, token, google_id, email, avatar_url) VALUES (?, ?, ?, ?, ?, ?)'),
  updateUserGoogle: db.prepare('UPDATE users SET email = ?, avatar_url = ?, nickname = ? WHERE google_id = ?'),
  updateUserAvatar: db.prepare('UPDATE users SET avatar_emoji = ? WHERE id = ?'),
  updateUserAvatarUrl: db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?'),
  updateUserSwish: db.prepare('UPDATE users SET swish_number = ? WHERE id = ?'),
  updateUserRealName: db.prepare('UPDATE users SET real_name = ? WHERE id = ?'),
  updateUserNickname: db.prepare('UPDATE users SET nickname = ? WHERE id = ?'),

  // Rate Limiting (persistent)
  getRateLimit: db.prepare('SELECT * FROM rate_limits WHERE key = ?'),
  upsertRateLimit: db.prepare('INSERT INTO rate_limits (key, count, locked_until, updated_at) VALUES (?, ?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET count = ?, locked_until = ?, updated_at = datetime(\'now\')'),
  deleteRateLimit: db.prepare('DELETE FROM rate_limits WHERE key = ?'),
  cleanupExpiredRateLimits: db.prepare('DELETE FROM rate_limits WHERE locked_until IS NOT NULL AND datetime(locked_until) < datetime(\'now\')'),

  // Credentials (WebAuthn / FaceID / TouchID)
  insertCredential: db.prepare('INSERT INTO user_credentials (id, user_id, credential_id, public_key) VALUES (?, ?, ?, ?)'),
  getCredentialsByUser: db.prepare('SELECT * FROM user_credentials WHERE user_id = ? ORDER BY created_at DESC'),
  getCredentialById: db.prepare('SELECT c.*, u.id as user_id, u.nickname, u.real_name, u.swish_number, u.token, u.avatar_emoji, u.avatar_url, u.email, u.needs_pin_reset FROM user_credentials c JOIN users u ON c.user_id = u.id WHERE c.credential_id = ?'),
  deleteCredential: db.prepare('DELETE FROM user_credentials WHERE id = ? AND user_id = ?'),

  // Tournament Photos
  getPhotosByTournament: db.prepare(`
    SELECT p.*,
           COALESCE(u.nickname, 'Deltagare') as uploader_name,
           u.avatar_url as uploader_avatar,
           u.avatar_emoji as uploader_emoji,
           (SELECT COUNT(*) FROM tournament_photo_likes l WHERE l.photo_id = p.id) as like_count
    FROM tournament_photos p
    LEFT JOIN users u ON p.user_id = u.id
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
  getUserTournamentPhotos: db.prepare(`
    SELECT p.*,
           t.name as tournament_name,
           t.share_code as tournament_code,
           COALESCE(u.nickname, 'Deltagare') as uploader_name,
           u.avatar_url as uploader_avatar,
           u.avatar_emoji as uploader_emoji,
           (SELECT COUNT(*) FROM tournament_photo_likes l WHERE l.photo_id = p.id) as like_count,
           EXISTS(SELECT 1 FROM tournament_photo_likes l WHERE l.photo_id = p.id AND l.user_id = ?) as user_liked
    FROM tournament_photos p
    JOIN tournaments t ON p.tournament_id = t.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE t.creator_id = ?
       OR p.user_id = ?
       OR t.id IN (
         SELECT e.tournament_id FROM events e
         JOIN players pl ON pl.event_id = e.id
         JOIN users us ON (
           LOWER(pl.name) = LOWER(us.real_name)
           OR LOWER(pl.name) = LOWER(us.nickname)
         )
         WHERE us.id = ?
       )
    ORDER BY p.created_at DESC
  `),

  // Tournaments
  insertTournament: db.prepare('INSERT INTO tournaments (id, name, share_code, creator_id, visibility) VALUES (?, ?, ?, ?, ?)'),
  getTournamentById: db.prepare('SELECT * FROM tournaments WHERE id = ?'),
  getTournamentByCode: db.prepare('SELECT * FROM tournaments WHERE share_code = ?'),
  getAllTournaments: db.prepare('SELECT * FROM tournaments ORDER BY created_at DESC'),
  getEventsByTournament: db.prepare('SELECT * FROM events WHERE tournament_id = ? ORDER BY created_at ASC'),
  updateTournamentStatus: db.prepare('UPDATE tournaments SET status = ? WHERE id = ?'),
  getTournamentParticipants: db.prepare('SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY created_at ASC'),
  insertTournamentParticipant: db.prepare('INSERT OR IGNORE INTO tournament_participants (id, tournament_id, name, user_id) VALUES (?, ?, ?, ?)'),
  deleteTournamentParticipant: db.prepare('DELETE FROM tournament_participants WHERE tournament_id = ? AND name = ?'),

  // Tournament Banners
  getBannersByTournament: db.prepare('SELECT * FROM tournament_banners WHERE tournament_id = ? ORDER BY sort_order ASC, created_at ASC'),
  insertBanner: db.prepare('INSERT INTO tournament_banners (id, tournament_id, image_data, link_url, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)'),
  deleteBanner: db.prepare('DELETE FROM tournament_banners WHERE id = ? AND tournament_id = ?'),

  // Settlement Receipts
  getSettlementReceipts: db.prepare('SELECT * FROM tournament_settlement_receipts WHERE tournament_id = ? ORDER BY paid_at ASC'),
  getSettlementReceipt: db.prepare('SELECT * FROM tournament_settlement_receipts WHERE tournament_id = ? AND from_name = ? AND to_name = ?'),
  getSettlementReceiptByUserIds: db.prepare('SELECT * FROM tournament_settlement_receipts WHERE tournament_id = ? AND from_user_id = ? AND to_user_id = ?'),
  getSettlementReceiptById: db.prepare('SELECT * FROM tournament_settlement_receipts WHERE id = ?'),
  insertSettlementReceipt: db.prepare('INSERT INTO tournament_settlement_receipts (id, tournament_id, from_name, to_name, amount, from_user_id, to_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)'),
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
  insertFriendRequest: db.prepare('INSERT OR IGNORE INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)'),
  getFriendRequest: db.prepare('SELECT * FROM friend_requests WHERE from_user_id = ? AND to_user_id = ?'),
  deleteFriendRequest: db.prepare('DELETE FROM friend_requests WHERE from_user_id = ? AND to_user_id = ?'),
  deleteFriendRequestsBetween: db.prepare('DELETE FROM friend_requests WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)'),
  getIncomingFriendRequests: db.prepare(`
    SELECT u.id, u.nickname, u.real_name, u.avatar_emoji, u.avatar_url, r.created_at
    FROM friend_requests r JOIN users u ON r.from_user_id = u.id
    WHERE r.to_user_id = ? ORDER BY r.created_at DESC
  `),
  getOutgoingFriendRequests: db.prepare(`
    SELECT u.id, u.nickname, u.real_name, u.avatar_emoji, u.avatar_url, r.created_at
    FROM friend_requests r JOIN users u ON r.to_user_id = u.id
    WHERE r.from_user_id = ? ORDER BY r.created_at DESC
  `),
  deleteFriend: db.prepare('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)'),
  searchUsers: db.prepare(`
    SELECT id, nickname, real_name, avatar_emoji, avatar_url
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
    INSERT INTO minigame_duels (id, game_type, creator_id, opponent_id, stake_amount, mode, status, tournament_id)
    VALUES (@id, @game_type, @creator_id, @opponent_id, @stake_amount, @mode, @status, @tournament_id)
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
  updateDuelReport: db.prepare(`
    UPDATE minigame_duels
    SET reported_by = @reported_by,
        reported_creator_score = @reported_creator_score,
        reported_opponent_score = @reported_opponent_score,
        reported_winner_id = @reported_winner_id
    WHERE id = @id
  `),
  updateDuelResult: db.prepare(`
    UPDATE minigame_duels
    SET creator_score = @creator_score,
        opponent_score = @opponent_score,
        winner_id = @winner_id,
        status = @status
    WHERE id = @id AND status IN ('active', 'pending')
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
      AND (d.tournament_id IS NULL OR d.tournament_id = '')
    ORDER BY d.created_at DESC
  `),
  settleDuel: db.prepare(`UPDATE minigame_duels SET is_settled = 1, settled_at = datetime('now') WHERE id = ?`),
  settleDuelsBetweenUsers: db.prepare(`
    UPDATE minigame_duels
    SET is_settled = 1, settled_at = datetime('now')
    WHERE ((creator_id = ? AND opponent_id = ?) OR (creator_id = ? AND opponent_id = ?))
      AND status = 'completed'
      AND is_settled = 0
      AND (tournament_id IS NULL OR tournament_id = '')
      AND stake_amount > 0
      AND winner_id != 'tie'
  `),

  // AnyBets
  insertAnyBet: db.prepare(`
    INSERT INTO anybets (id, title, description, creator_id, judge_id, stake_amount, bet_type, deadline, status, tournament_id)
    VALUES (@id, @title, @description, @creator_id, @judge_id, @stake_amount, @bet_type, @deadline, @status, @tournament_id)
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
  declineAnyBetParticipant: db.prepare(`
    UPDATE anybet_participants SET status = 'declined' WHERE bet_id = ? AND user_id = ?
  `),
  cancelAnyBet: db.prepare(`
    UPDATE anybets SET status = 'cancelled' WHERE id = ? AND creator_id = ?
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
    WHERE (b.creator_id = ? OR b.judge_id = ? OR (p.user_id = ? AND p.status != 'declined'))
      AND b.status != 'cancelled'
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
  getAllPushSubscriptions: db.prepare('SELECT * FROM push_subscriptions'),
  getUserNotificationPrefs: db.prepare('SELECT notify_flashbets, notify_duels, notify_tournaments, notify_support FROM users WHERE id = ?'),
  updateUserNotificationPrefs: db.prepare('UPDATE users SET notify_flashbets = ?, notify_duels = ?, notify_tournaments = ?, notify_support = ? WHERE id = ?'),

  // Flash Bets
  insertFlashBet: db.prepare(`
    INSERT INTO flash_bets (id, creator_id, tournament_id, question, duration_seconds, expires_at, status, stake_amount, target_user_ids)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
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
    WHERE fb.status IN ('open', 'locked')
    ORDER BY fb.created_at DESC
  `),
  updateFlashBetStatus: db.prepare('UPDATE flash_bets SET status = ? WHERE id = ?'),
  updateFlashBetSettle: db.prepare('UPDATE flash_bets SET status = \'settled\', winning_choice = ? WHERE id = ?'),
  deleteFlashBet: db.prepare('DELETE FROM flash_bets WHERE id = ?'),

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

  // Flash Live Streams
  insertFlashLiveStream: db.prepare(`
    INSERT INTO flash_live_streams (id, host_id, host_name, host_avatar, question, has_bet, stake_amount, duration_seconds, expires_at, target_user_ids, flash_bet_id, status)
    VALUES (@id, @hostId, @hostName, @hostAvatar, @question, @hasBet, @stakeAmount, @durationSeconds, @expiresAt, @targetUserIds, @flashBetId, @status)
  `),
  getActiveFlashLiveStreams: db.prepare(`
    SELECT * FROM flash_live_streams WHERE status = 'active' ORDER BY created_at DESC
  `),
  getFlashLiveStreamById: db.prepare(`
    SELECT * FROM flash_live_streams WHERE id = ?
  `),
  updateFlashLiveStreamStatus: db.prepare(`
    UPDATE flash_live_streams SET status = ? WHERE id = ?
  `),
  updateFlashLiveStreamBet: db.prepare(`
    UPDATE flash_live_streams SET question = COALESCE(?, question), flash_bet_id = ?, has_bet = 1, stake_amount = ?, duration_seconds = ?, expires_at = ? WHERE id = ?
  `),

  // Tab Expenses & Even Steven
  insertTabExpense: db.prepare(`
    INSERT INTO tab_expenses (id, payer_id, title, notes, total_amount, mode, loser_id, receipt_image, tournament_id)
    VALUES (@id, @payer_id, @title, @notes, @total_amount, @mode, @loser_id, @receipt_image, @tournament_id)
  `),
  insertTabExpenseParticipant: db.prepare(`
    INSERT INTO tab_expense_participants (id, expense_id, user_id, amount)
    VALUES (@id, @expense_id, @user_id, @amount)
  `),
  insertTabExpenseDuel: db.prepare(`
    INSERT INTO minigame_duels (id, game_type, creator_id, opponent_id, stake_amount, mode, status, winner_id, creator_score, opponent_score, is_settled, expense_id, custom_title, receipt_image, tournament_id)
    VALUES (@id, @game_type, @creator_id, @opponent_id, @stake_amount, @mode, 'completed', @winner_id, 1, 0, 0, @expense_id, @custom_title, @receipt_image, @tournament_id)
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

  // Löven Game
  insertLovenGame: db.prepare(`
    INSERT INTO loven_games (id, creator_id, opponent_team, is_home, match_date, stake_amount, status, tournament_id)
    VALUES (@id, @creator_id, @opponent_team, @is_home, @match_date, @stake_amount, @status, @tournament_id)
  `),
  getLovenGameById: db.prepare(`
    SELECT g.*,
           c.nickname as creator_nickname, c.real_name as creator_real_name, c.avatar_emoji as creator_avatar_emoji, c.avatar_url as creator_avatar_url
    FROM loven_games g
    LEFT JOIN users c ON g.creator_id = c.id
    WHERE g.id = ?
  `),
  getLovenGamesList: db.prepare(`
    SELECT DISTINCT g.*,
           c.nickname as creator_nickname, c.real_name as creator_real_name, c.avatar_emoji as creator_avatar_emoji, c.avatar_url as creator_avatar_url,
           (SELECT COUNT(*) FROM loven_game_entries e WHERE e.game_id = g.id) as participant_count,
           (SELECT GROUP_CONCAT(u2.real_name || ' (' || e2.points || 'p)', ' & ')
            FROM loven_game_entries e2
            JOIN users u2 ON e2.user_id = u2.id
            WHERE e2.game_id = g.id AND e2.is_winner = 1) as winner_summary
    FROM loven_games g
    LEFT JOIN users c ON g.creator_id = c.id
    ORDER BY g.created_at DESC
    LIMIT 50
  `),
  insertLovenEntry: db.prepare(`
    INSERT OR REPLACE INTO loven_game_entries (id, game_id, user_id, pred_loven_goals, pred_opponent_goals, pred_last_scorer, pred_shots_on_goal)
    VALUES (@id, @game_id, @user_id, @pred_loven_goals, @pred_opponent_goals, @pred_last_scorer, @pred_shots_on_goal)
  `),
  getLovenEntriesByGame: db.prepare(`
    SELECT e.*,
           u.nickname, u.real_name, u.avatar_emoji, u.avatar_url
    FROM loven_game_entries e
    JOIN users u ON e.user_id = u.id
    WHERE e.game_id = ?
    ORDER BY e.points DESC, e.created_at ASC
  `),
  updateLovenGameStatus: db.prepare(`
    UPDATE loven_games SET status = ? WHERE id = ?
  `),
  updateLovenGameResult: db.prepare(`
    UPDATE loven_games
    SET status = 'settled',
        result_loven_goals = @result_loven_goals,
        result_opponent_goals = @result_opponent_goals,
        result_last_scorer = @result_last_scorer,
        result_shots_on_goal = @result_shots_on_goal,
        winner_user_ids = @winner_user_ids,
        settled_at = datetime('now')
    WHERE id = @id
  `),
  updateLovenEntryScore: db.prepare(`
    UPDATE loven_game_entries
    SET points = @points,
        pts_result = @pts_result,
        pts_scorer = @pts_scorer,
        pts_shots = @pts_shots,
        is_winner = @is_winner
    WHERE id = @id
  `),
  insertLovenDuel: db.prepare(`
    INSERT INTO minigame_duels (id, game_type, creator_id, opponent_id, stake_amount, mode, status, winner_id, creator_score, opponent_score, is_settled, custom_title, tournament_id)
    VALUES (@id, 'loven_game', @creator_id, @opponent_id, @stake_amount, 'loven_game', 'completed', @winner_id, @creator_score, @opponent_score, 0, @custom_title, @tournament_id)
  `),
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

export function getMonthlySearchCount() {
  const monthKey = 'search_count_' + new Date().toISOString().slice(0, 7);
  const val = getSetting(monthKey);
  return val ? parseInt(val, 10) || 0 : 0;
}

export function incrementMonthlySearchCount(delta = 1) {
  const monthKey = 'search_count_' + new Date().toISOString().slice(0, 7);
  const current = getMonthlySearchCount();
  const next = current + Math.max(1, Number(delta) || 1);
  setSetting(monthKey, next);
  return next;
}

export function resetMonthlySearchCount() {
  const monthKey = 'search_count_' + new Date().toISOString().slice(0, 7);
  setSetting(monthKey, 0);
  return 0;
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
    tournamentId: e.tournament_id,
    imageUrl: e.image_url || null,
    winnerImageUrl: e.winner_image_url || null,
    closesAt: e.closes_at || null,
    lastBoostedAt: e.last_boosted_at || null,
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

  let tournamentId = event.tournament_id || event.tournamentId || null;
  if (!tournamentId && event.linked_round_id) {
    try {
      const parentRound = stmts.getEventById.get(event.linked_round_id);
      if (parentRound?.tournament_id) tournamentId = parentRound.tournament_id;
    } catch (_) {}
  }

  const banners = tournamentId
    ? stmts.getBannersByTournament.all(tournamentId).map(b => ({
        id: b.id,
        imageData: b.image_data,
        linkUrl: b.link_url || null,
        label: b.label || null
      }))
    : [];

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
    winnerIds: (event.winner_id || '').split(',').map(s => s.trim()).filter(Boolean),
    isTie: (event.winner_id || '').split(',').map(s => s.trim()).filter(Boolean).length > 1,
    creatorId: event.creator_id,
    swishNumber: event.swish_number,
    tournamentId: event.tournament_id,
    banners,
    isSideBet: !!event.is_side_bet,
    linkedRoundId: event.linked_round_id,
    betMode: event.bet_mode || 'open',
    imageUrl: event.image_url || null,
    winnerImageUrl: event.winner_image_url || null,
    closesAt: event.closes_at || null,
    lastBoostedAt: event.last_boosted_at || null,
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
  const winnerIdsList = (event.winner_id || '').split(',').map(s => s.trim()).filter(Boolean);
  if (event.status === 'finished' && winnerIdsList.length > 0) {
    // Find any winning bet with a user_id to get winner's swish
    const winnerBets = bets.filter(b => winnerIdsList.includes(b.player_id) && b.user_id);
    if (winnerBets.length > 0) {
      const winnerUser = stmts.getUserById.get(winnerBets[0].user_id);
      if (winnerUser) {
        if (winnerUser.swish_number) {
          result.winnerSwishNumber = winnerUser.swish_number;
        }
        if (winnerUser.nickname) {
          result.winnerNickname = winnerUser.nickname;
        }
      }
    }
  }

  return result;
}

export const createEvent = db.transaction((eventData, playerNames) => {
  stmts.insertEvent.run({
    date: new Date().toISOString().split('T')[0],
    status: 'open',
    minBet: 10,
    maxBet: 10000,
    payoutPercent: 100,
    shareCode: crypto.randomBytes(3).toString('hex').toUpperCase(),
    creatorId: null,
    swishNumber: null,
    tournamentId: null,
    isSideBet: 0,
    linkedRoundId: null,
    betMode: 'open',
    imageUrl: null,
    winnerImageUrl: null,
    closesAt: null,
    lastBoostedAt: null,
    ...eventData,
    date: eventData.date || new Date().toISOString().split('T')[0],
    status: eventData.status || 'open',
    tournamentId: eventData.tournamentId ?? eventData.tournament_id ?? null,
    payoutPercent: eventData.payoutPercent ?? eventData.payout_percent ?? 100,
    shareCode: eventData.shareCode ?? eventData.share_code ?? crypto.randomBytes(3).toString('hex').toUpperCase(),
    creatorId: eventData.creatorId ?? eventData.creator_id ?? null,
    minBet: eventData.minBet ?? eventData.min_bet ?? 10,
    maxBet: eventData.maxBet ?? eventData.max_bet ?? 10000,
    isSideBet: (eventData.isSideBet || eventData.is_side_bet) ? 1 : 0,
    linkedRoundId: eventData.linkedRoundId ?? eventData.linked_round_id ?? null,
    betMode: eventData.betMode ?? eventData.bet_mode ?? 'open',
    imageUrl: eventData.imageUrl || null,
    winnerImageUrl: eventData.winnerImageUrl || null,
    closesAt: eventData.closesAt ?? eventData.closes_at ?? null,
    lastBoostedAt: eventData.lastBoostedAt ?? eventData.last_boosted_at ?? null
  });
  for (const p of playerNames) {
    const pId = typeof p === 'string' ? crypto.randomUUID() : (p.id || crypto.randomUUID());
    const pName = typeof p === 'string' ? p : p.name;
    const pImage = typeof p === 'string' ? null : (p.imageUrl || null);
    stmts.insertPlayer.run(pId, eventData.id, pName, pImage);
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

// Reopening an event whose result has been revealed only unlocks the result for
// correction; betting stays closed so nobody can bet on a known outcome.
export function reopenEvent(eventId) {
  const event = stmts.getEventById.get(eventId);
  const newStatus = event && (event.was_finished || event.status === 'finished') ? 'locked' : 'open';
  stmts.resetEvent.run(newStatus, eventId);
  if (newStatus === 'open') stmts.updateEventClosesAt.run(null, eventId);
  return newStatus;
}

export function cancelEvent(eventId) {
  stmts.updateEventStatus.run('cancelled', eventId);
}

export function finishEvent(eventId, winnerId, winnerImageUrl = null) {
  stmts.updateEventWinner.run(winnerId, winnerImageUrl, eventId);
}

export function updateEventClosesAt(eventId, closesAt) {
  stmts.updateEventClosesAt.run(closesAt || null, eventId);
}

export function updateEventLastBoosted(eventId) {
  stmts.updateEventLastBoosted.run(new Date().toISOString(), eventId);
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
  stmts.setUserPin.run(hash, salt, newToken, newToken, userId);
}

export function updateUserToken(userId, newToken) {
  stmts.updateUserToken.run(newToken, userId);
}

export function resetUserPin(userId, resetCode, expiresIso = null) {
  const expires = expiresIso || new Date(Date.now() + 15 * 60 * 1000).toISOString();
  stmts.resetUserPin.run(resetCode, expires, userId);
}

export function getAllUsers() {
  return stmts.getAllUsers.all();
}

// ── Rate Limiting (Persistent) ────────────────────────
export function checkRateLimit(key) {
  const row = stmts.getRateLimit.get(key);
  if (!row) return { allowed: true };
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    const minutesLeft = Math.max(1, Math.ceil((new Date(row.locked_until) - new Date()) / 60000));
    return { allowed: false, minutesLeft };
  }
  if (row.locked_until) {
    stmts.deleteRateLimit.run(key);
    return { allowed: true };
  }
  return { allowed: true, count: row.count };
}

export function recordFailedAttempt(key, maxAttempts = 5, lockoutMinutes = 15) {
  const row = stmts.getRateLimit.get(key) || { count: 0 };
  const newCount = row.count + 1;
  const lockedUntil = newCount >= maxAttempts
    ? new Date(Date.now() + lockoutMinutes * 60000).toISOString()
    : null;
  stmts.upsertRateLimit.run(key, newCount, lockedUntil, newCount, lockedUntil);
  return { count: newCount, locked: newCount >= maxAttempts };
}

export function clearRateLimit(key) {
  stmts.deleteRateLimit.run(key);
}

export function cleanupExpiredRateLimits() {
  stmts.cleanupExpiredRateLimits.run();
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

export function normalizePhone(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/[^0-9]/g, '');
  if (!digits) return '';

  if (digits.startsWith('0046') && digits.length >= 10) {
    digits = '0' + digits.slice(4);
  } else if (digits.startsWith('460') && digits.length >= 10) {
    digits = digits.slice(2);
  } else if (digits.startsWith('46') && digits.length >= 9 && digits.length <= 13) {
    digits = '0' + digits.slice(2);
  } else if (digits.length === 9 && digits.startsWith('7')) {
    digits = '0' + digits;
  }
  return digits;
}

export function getUserByRealName(realName) {
  if (!realName) return null;
  return stmts.getUserByRealName.get(String(realName).trim());
}

export function getUserByEmail(email) {
  if (!email) return null;
  return stmts.getUserByEmail.get(String(email).trim());
}

export function getUserBySwish(swishNumber) {
  if (!swishNumber) return null;
  const clean = String(swishNumber).trim();
  if (!clean) return null;

  const norm = normalizePhone(clean);
  if (norm) {
    let u = stmts.getUserBySwish.get(norm, norm);
    if (u) return u;
    const intl = '46' + norm.replace(/^0/, '');
    u = stmts.getUserBySwish.get(intl, intl);
    if (u) return u;
  }

  const rawDigits = clean.replace(/[^0-9]/g, '');
  if (rawDigits && rawDigits !== norm) {
    let u = stmts.getUserBySwish.get(rawDigits, rawDigits);
    if (u) return u;
  }

  return stmts.getUserBySwish.get(clean, clean);
}

export function getUserByNicknameOrSwish(identifier) {
  if (!identifier) return null;
  const clean = String(identifier).trim();
  if (!clean) return null;

  // 1. Direct nickname match
  let user = stmts.getUserByNickname.get(clean);
  if (user) return user;

  // 2. Stripped @ prefix for nickname
  if (clean.startsWith('@')) {
    const withoutAt = clean.slice(1).trim();
    if (withoutAt) {
      user = stmts.getUserByNickname.get(withoutAt);
      if (user) return user;
    }
  }

  // 3. Email match if containing @
  if (clean.includes('@')) {
    user = stmts.getUserByEmail.get(clean);
    if (user) return user;
  }

  // 4. Real name match
  user = stmts.getUserByRealName.get(clean);
  if (user) return user;

  // 5. Phone / Swish match (normalized Swedish, international 46, raw digits)
  const norm = normalizePhone(clean);
  if (norm && norm.length >= 6) {
    user = stmts.getUserBySwish.get(norm, norm);
    if (user) return user;

    const intl = '46' + norm.replace(/^0/, '');
    user = stmts.getUserBySwish.get(intl, intl);
    if (user) return user;
  }

  const rawDigits = clean.replace(/[^0-9]/g, '');
  if (rawDigits && rawDigits.length >= 6) {
    user = stmts.getUserBySwish.get(rawDigits, rawDigits);
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

export function getUserTournamentPhotos(userId) {
  if (!userId) return [];
  const rows = stmts.getUserTournamentPhotos.all(userId, userId, userId, userId);
  return rows.map(p => ({
    id: p.id,
    tournamentId: p.tournament_id,
    tournamentName: p.tournament_name,
    tournamentCode: p.tournament_code,
    url: p.url,
    thumbnailUrl: p.thumbnail_url || p.url,
    caption: p.caption,
    userId: p.user_id,
    uploaderName: p.uploader_name,
    uploaderAvatar: p.uploader_avatar,
    uploaderEmoji: p.uploader_emoji,
    createdAt: p.created_at,
    likeCount: p.like_count || 0,
    userLiked: !!p.user_liked
  }));
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
export function createTournament(id, name, shareCode, creatorId, visibility = 'friends', participants = []) {
  stmts.insertTournament.run(id, name, shareCode, creatorId, visibility);
  if (Array.isArray(participants)) {
    participants.forEach(p => {
      const pName = typeof p === 'string' ? p.trim() : (p?.name || '').trim();
      const pUserId = (typeof p === 'object' && p?.userId) ? p.userId : null;
      if (pName) {
        stmts.insertTournamentParticipant.run(crypto.randomUUID(), id, pName, pUserId);
      }
    });
  }
}

export function addTournamentParticipant(tournamentId, name, userId = null) {
  const pName = (name || '').trim();
  if (!pName) return false;
  if (userId) {
    const existing = db.prepare('SELECT id, user_id FROM tournament_participants WHERE tournament_id = ? AND (user_id = ? OR LOWER(name) = LOWER(?))').get(tournamentId, userId, pName);
    if (existing) {
      if (!existing.user_id) {
        db.prepare('UPDATE tournament_participants SET user_id = ? WHERE id = ?').run(userId, existing.id);
      }
      return true;
    }
  }
  stmts.insertTournamentParticipant.run(crypto.randomUUID(), tournamentId, pName, userId);
  return true;
}

export function isFriend(userId, targetUserId) {
  if (!userId || !targetUserId || userId === targetUserId) return false;
  const row = db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(userId, targetUserId);
  return Boolean(row);
}

export function isFriendOrFriendOfFriend(userId, targetUserId) {
  if (!userId || !targetUserId) return false;
  if (userId === targetUserId) return true;
  const direct = db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(userId, targetUserId);
  if (direct) return true;
  const fof = db.prepare(`
    SELECT 1 FROM friends f1
    JOIN friends f2 ON f1.friend_id = f2.user_id
    WHERE f1.user_id = ? AND f2.friend_id = ?
    LIMIT 1
  `).get(userId, targetUserId);
  return Boolean(fof);
}

export function canUserAccessTournament(tournament, userId = null) {
  if (!tournament) return false;
  const vis = tournament.visibility || 'friends';
  // Link/private allows anyone with the link/code
  if (vis === 'private' || vis === 'link') {
    return true;
  }
  if (!userId) {
    return false;
  }
  const creatorId = tournament.creatorId || tournament.creator_id;
  if (creatorId && creatorId === userId) {
    return true;
  }
  // Already a participant
  const isPart = db.prepare(`
    SELECT 1 FROM tournament_participants tp
    JOIN users u ON (
      tp.user_id = u.id 
      OR LOWER(tp.name) = LOWER(u.real_name)
      OR LOWER(tp.name) = LOWER(u.nickname)
    )
    WHERE tp.tournament_id = ? AND u.id = ?
    LIMIT 1
  `).get(tournament.id, userId);
  if (isPart) return true;

  // Already placed a bet
  const hasBet = db.prepare(`
    SELECT 1 FROM bets b
    JOIN events e ON b.event_id = e.id
    WHERE e.tournament_id = ? AND b.user_id = ?
    LIMIT 1
  `).get(tournament.id, userId);
  if (hasBet) return true;

  if (!creatorId) return true;

  if (vis === 'friends') {
    return isFriend(userId, creatorId);
  }

  if (vis === 'friends_of_friends') {
    return isFriendOrFriendOfFriend(userId, creatorId);
  }

  return true;
}

export function getTournamentParticipants(tournamentId) {
  return stmts.getTournamentParticipants.all(tournamentId);
}

export function getTournamentByCode(code) {
  return stmts.getTournamentByCode.get(code);
}

export function getTournamentById(id) {
  return stmts.getTournamentById.get(id);
}

export function getAllTournaments(userId = null) {
  if (!userId) {
    return [];
  }

  const tournaments = db.prepare(`
    SELECT DISTINCT t.* FROM tournaments t
    WHERE t.creator_id = ?
       OR t.id IN (
         SELECT tp.tournament_id FROM tournament_participants tp
         JOIN users u ON (
           tp.user_id = u.id
           OR LOWER(tp.name) = LOWER(u.real_name)
           OR LOWER(tp.name) = LOWER(u.nickname)
         )
         WHERE u.id = ?
       )
       OR t.id IN (
         SELECT e.tournament_id FROM events e
         JOIN bets b ON b.event_id = e.id
         WHERE b.user_id = ?
       )
       OR t.id IN (
         SELECT e.tournament_id FROM events e
         JOIN players p ON p.event_id = e.id
         JOIN users u ON (
           LOWER(p.name) = LOWER(u.real_name)
           OR LOWER(p.name) = LOWER(u.nickname)
         )
         WHERE u.id = ?
       )
       OR (
         COALESCE(t.visibility, 'friends') IN ('friends', 'friends_of_friends') AND (
           t.creator_id IN (SELECT friend_id FROM friends WHERE user_id = ?)
         )
       )
       OR (
         COALESCE(t.visibility, 'friends') = 'friends_of_friends' AND (
           t.creator_id IN (
             SELECT f2.friend_id FROM friends f1
             JOIN friends f2 ON f1.friend_id = f2.user_id
             WHERE f1.user_id = ?
           )
         )
       )
    ORDER BY t.created_at DESC
  `).all(userId, userId, userId, userId, userId, userId);

  return tournaments.map(t => {
    const rounds = stmts.getEventsByTournament.all(t.id);
    const finishedRounds = rounds.filter(r => r.status === 'finished');
    const banners = stmts.getBannersByTournament.all(t.id);
    return {
      id: t.id,
      name: t.name,
      shareCode: t.share_code,
      status: t.status,
      creatorId: t.creator_id,
      visibility: t.visibility || 'friends',
      createdAt: t.created_at,
      roundCount: rounds.length,
      finishedCount: finishedRounds.length,
      bannerCount: banners.length,
      banners: banners.map(b => ({ id: b.id, imageData: b.image_data, linkUrl: b.link_url, label: b.label }))
    };
  });
}

export function getActiveTournamentForUser(userId) {
  if (!userId) return null;
  const t = db.prepare(`
    SELECT DISTINCT t.* FROM tournaments t
    WHERE (t.status = 'active' OR t.status IS NULL)
      AND (
        t.creator_id = ?
        OR t.id IN (
          SELECT e.tournament_id FROM events e
          JOIN bets b ON b.event_id = e.id
          WHERE b.user_id = ?
        )
        OR t.id IN (
          SELECT e.tournament_id FROM events e
          JOIN players p ON p.event_id = e.id
          JOIN users u ON (LOWER(p.name) = LOWER(u.real_name) OR LOWER(p.name) = LOWER(u.nickname))
          WHERE u.id = ?
        )
        OR t.id IN (
          SELECT tournament_id FROM minigame_duels
          WHERE (creator_id = ? OR opponent_id = ?) AND tournament_id IS NOT NULL
        )
        OR t.id IN (
          SELECT tournament_id FROM anybets
          WHERE (creator_id = ? OR id IN (SELECT bet_id FROM anybet_participants WHERE user_id = ?))
            AND tournament_id IS NOT NULL
        )
      )
    ORDER BY t.created_at DESC
    LIMIT 1
  `).get(userId, userId, userId, userId, userId, userId, userId);

  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    shareCode: t.share_code,
    status: t.status,
    creatorId: t.creator_id
  };
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
    const winnerIds = (e.winner_id || '').split(',').map(s => s.trim()).filter(Boolean);
    const winnerPlayers = winnerIds.map(wId => players.find(p => p.id === wId)).filter(Boolean);
    const winnerName = winnerPlayers.length > 0 ? winnerPlayers.map(p => p.name).join(', ') : null;
    return {
      id: e.id,
      name: e.name,
      date: e.date,
      status: e.status,
      shareCode: e.share_code,
      winnerId: e.winner_id,
      winnerIds,
      isTie: winnerIds.length > 1,
      winnerName,
      players: players.map(p => ({ id: p.id, name: p.name })),
      totalPool,
      betCount,
      isSideBet: !!e.is_side_bet,
      linkedRoundId: e.linked_round_id,
      betMode: e.bet_mode || 'open',
      minBet: e.min_bet,
      maxBet: e.max_bet,
      closesAt: e.closes_at || null,
      lastBoostedAt: e.last_boosted_at || null
    };
  };

  const allEvents = rawRounds.map(mapEvent);
  const rounds = allEvents.filter(e => !e.isSideBet);
  const sideBets = allEvents.filter(e => e.isSideBet);

  // Collect all unique player names across rounds and tournament participants
  const allPlayers = new Set();
  const rawParticipants = stmts.getTournamentParticipants.all(tournament.id);
  rawParticipants.forEach(p => allPlayers.add(p.name));
  rounds.forEach(r => r.players.forEach(p => allPlayers.add(p.name)));
  sideBets.forEach(s => s.players.forEach(p => allPlayers.add(p.name)));

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
    participants: rawParticipants.map(p => ({
      id: p.id,
      name: p.name,
      userId: p.user_id
    })),
    banners: banners.map(b => ({ id: b.id, imageData: b.image_data, linkUrl: b.link_url, label: b.label })),
    settlement: getTournamentNetSettlement(tournament.id)
  };
}

export function getTournamentNetSettlement(tournamentId) {
  const events = stmts.getEventsByTournament.all(tournamentId);
  const mainRounds = events.filter(r => !r.is_side_bet);
  const sideBets = events.filter(r => !!r.is_side_bet);
  const finishedMainRounds = mainRounds.filter(r => r.status === 'finished').length;
  const totalMainRounds = mainRounds.length;
  const finishedSideBets = sideBets.filter(r => r.status === 'finished').length;
  const totalSideBets = sideBets.length;

  const finishedEvents = events.filter(r => (r.status === 'finished' && r.winner_id) || r.status === 'cancelled');

  // Balances and audit trail per person, keyed by unique identity (user:ID or guest:name)
  const players = {};
  const auditTrail = {};

  const getPlayerKey = (name, userId) => {
    if (userId) return `user:${userId}`;
    return `guest:${(name || 'okand').trim().toLowerCase()}`;
  };

  const ensurePlayer = (name, userId) => {
    const key = getPlayerKey(name, userId);
    if (!players[key]) {
      players[key] = { key, name: name || 'Spelare', amount: 0, rawTotal: 0, totalPaid: 0, totalReceived: 0, userId: userId || null };
    } else {
      if (userId && !players[key].userId) players[key].userId = userId;
      if (name && (!players[key].name || players[key].name === 'Spelare')) players[key].name = name;
    }
    if (!auditTrail[key]) auditTrail[key] = [];
    return key;
  };

  const findPlayerKey = (name, userId) => {
    if (userId) {
      const uKey = `user:${userId}`;
      if (players[uKey]) return uKey;
      // userId exists but no player entry yet — check if any guest entry has this userId
      for (const p of Object.values(players)) {
        if (p.userId === userId) return p.key;
      }
    }
    // No userId match found — create/find by key (never merge by name alone)
    return ensurePlayer(name, userId);
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

    // If event is cancelled, refund all bets (net 0)
    if (ev.status === 'cancelled') {
      for (const bet of bets) {
        const name = bet.bettor_name;
        const key = ensurePlayer(name, bet.user_id);
        const item = {
          type: ev.is_side_bet ? 'sidebet' : 'round',
          title: ev.name + ' (Inställd – Återbetald)',
          eventId: ev.id,
          won: false,
          isRefund: true,
          amount: 0,
          betAmount: bet.amount,
          payout: bet.amount,
          timestamp: bet.created_at || ev.created_at
        };
        auditTrail[key].push(item);
      }
      continue;
    }

    const winnerIds = (ev.winner_id || '').split(',').map(s => s.trim()).filter(Boolean);
    if (winnerIds.length === 0) continue;

    const totalPool = stmts.getTotalPool.get(ev.id).total;
    const effectivePool = totalPool * (ev.payout_percent / 100);
    const houseEdge = totalPool - effectivePool;

    // Check pools for each winner
    const winningPools = {};
    let totalBackedWinners = 0;
    for (const wId of winnerIds) {
      const p = stmts.getPlayerPool.get(ev.id, wId).total;
      winningPools[wId] = p;
      if (p > 0) totalBackedWinners++;
    }

    // If nobody bet on any of the winners, refund all bets (net 0)
    if (totalBackedWinners === 0) {
      for (const bet of bets) {
        const name = bet.bettor_name;
        const key = ensurePlayer(name, bet.user_id);
        const item = {
          type: ev.is_side_bet ? 'sidebet' : 'round',
          title: ev.name + ' (Ingen vinnare – Återbetald)',
          eventId: ev.id,
          won: false,
          isRefund: true,
          amount: 0,
          betAmount: bet.amount,
          payout: bet.amount,
          timestamp: bet.created_at || ev.created_at
        };
        auditTrail[key].push(item);
      }
      continue;
    }

    const sharePerWinner = effectivePool / totalBackedWinners;
    const oddsMap = {};
    for (const wId of winnerIds) {
      oddsMap[wId] = winningPools[wId] > 0 ? (sharePerWinner / winningPools[wId]) : 0;
    }

    if (houseEdge > 0) {
      const key = ensurePlayer(creatorName, creatorUserId);
      players[key].amount += houseEdge;
      players[key].rawTotal += houseEdge;
      const item = {
        type: 'house_edge',
        title: ev.name + ' (Husmarginal)',
        isSideBet: Boolean(ev.is_side_bet),
        amount: Math.round(houseEdge),
        timestamp: ev.created_at
      };
      auditTrail[key].push(item);
    }

    for (const bet of bets) {
      const name = bet.bettor_name;
      const key = ensurePlayer(name, bet.user_id);

      const won = winnerIds.includes(bet.player_id);
      if (won) {
        const odds = oddsMap[bet.player_id] || 0;
        const winnings = bet.amount * odds;
        const netWinnings = winnings - bet.amount;
        players[key].amount += netWinnings;
        players[key].rawTotal += netWinnings;
        const item = {
          type: ev.is_side_bet ? 'sidebet' : 'round',
          title: ev.name + (winnerIds.length > 1 ? ' (Delad seger 🤝)' : ''),
          eventId: ev.id,
          won: true,
          amount: Math.round(netWinnings),
          betAmount: bet.amount,
          payout: Math.round(winnings),
          timestamp: bet.created_at || ev.created_at
        };
        auditTrail[key].push(item);
      } else {
        players[key].amount -= bet.amount;
        players[key].rawTotal -= bet.amount;
        const item = {
          type: ev.is_side_bet ? 'sidebet' : 'round',
          title: ev.name,
          eventId: ev.id,
          won: false,
          amount: -Math.round(bet.amount),
          betAmount: bet.amount,
          timestamp: bet.created_at || ev.created_at
        };
        auditTrail[key].push(item);
      }
    }
  }

  // Absorb minigame duels tied to this tournament/event
  const tournamentDuels = db.prepare(`
    SELECT d.*,
           cu.nickname as creator_nickname, cu.real_name as creator_real_name,
           ou.nickname as opponent_nickname, ou.real_name as opponent_real_name
    FROM minigame_duels d
    LEFT JOIN users cu ON d.creator_id = cu.id
    LEFT JOIN users ou ON d.opponent_id = ou.id
    WHERE d.tournament_id = ? AND d.status = 'completed'
  `).all(tournamentId);

  for (const d of tournamentDuels) {
    const stake = Number(d.stake_amount) || 0;
    if (stake <= 0) continue;
    if (!d.winner_id || d.winner_id === 'tie') continue;

    const isCreatorWinner = d.winner_id === d.creator_id;
    const winnerId = isCreatorWinner ? d.creator_id : d.opponent_id;
    const loserId = isCreatorWinner ? d.opponent_id : d.creator_id;
    const winnerName = isCreatorWinner ? (d.creator_real_name || d.creator_nickname) : (d.opponent_real_name || d.opponent_nickname);
    const loserName = isCreatorWinner ? (d.opponent_real_name || d.opponent_nickname) : (d.creator_real_name || d.creator_nickname);

    const winnerKey = ensurePlayer(winnerName, winnerId);
    const loserKey = ensurePlayer(loserName, loserId);

    const isExpense = d.game_type === 'even_steven' || Boolean(d.expense_id);
    const itemType = isExpense ? 'expense' : 'minigame';
    const displayTitle = d.custom_title || (isExpense ? 'Utlägg' : `Minispel (${d.game_type})`);

    players[winnerKey].amount += stake;
    players[winnerKey].rawTotal += stake;
    auditTrail[winnerKey].push({
      type: itemType,
      title: isExpense ? `Utlägg: ${displayTitle}` : displayTitle,
      duelId: d.id,
      expenseId: d.expense_id || null,
      hasReceipt: Boolean(d.receipt_image),
      won: true,
      amount: Math.round(stake),
      timestamp: d.created_at
    });

    players[loserKey].amount -= stake;
    players[loserKey].rawTotal -= stake;
    auditTrail[loserKey].push({
      type: itemType,
      title: isExpense ? `Utlägg: ${displayTitle}` : displayTitle,
      duelId: d.id,
      expenseId: d.expense_id || null,
      hasReceipt: Boolean(d.receipt_image),
      won: false,
      amount: -Math.round(stake),
      timestamp: d.created_at
    });
  }

  // Fetch marked receipts (delbetalningar mitt i resan / kvitteringar)
  const receipts = stmts.getSettlementReceipts.all(tournamentId);
  for (const r of receipts) {
    if (r.amount > 0) {
      const fromKey = findPlayerKey(r.from_name, r.from_user_id || null);
      const toKey = findPlayerKey(r.to_name, r.to_user_id || null);

      // Debtor paid: debt reduced (balance increases)
      players[fromKey].amount += r.amount;
      players[fromKey].totalPaid += r.amount;

      // Creditor received: credit reduced (balance decreases)
      players[toKey].amount -= r.amount;
      players[toKey].totalReceived += r.amount;

      const sentItem = {
        type: 'payment_sent',
        receiptId: r.id,
        title: `📱 Inbetald delbetalning till ${r.to_name}`,
        to: r.to_name,
        amount: Math.round(r.amount),
        timestamp: r.paid_at
      };
      auditTrail[fromKey].push(sentItem);

      const receivedItem = {
        type: 'payment_received',
        receiptId: r.id,
        title: `📱 Mottagen delbetalning från ${r.from_name}`,
        from: r.from_name,
        amount: -Math.round(r.amount),
        timestamp: r.paid_at
      };
      auditTrail[toKey].push(receivedItem);
    }
  }

  // Deterministic whole-kronor balancing (Hamilton's largest-remainder method)
  // Ensures sum(roundedNet) === 0 exactly, avoiding orphaned crowns.
  const playerEntries = Object.values(players).map(p => {
    const raw = p.amount;
    const rounded = Math.round(raw);
    return {
      p,
      raw,
      rounded,
      remainder: raw - rounded
    };
  });

  let sumRounded = playerEntries.reduce((sum, e) => sum + e.rounded, 0);

  if (sumRounded !== 0 && playerEntries.length > 0) {
    if (sumRounded > 0) {
      playerEntries.sort((a, b) => a.remainder - b.remainder);
      for (let i = 0; i < playerEntries.length && sumRounded > 0; i++) {
        playerEntries[i].rounded -= 1;
        sumRounded -= 1;
      }
    } else {
      playerEntries.sort((a, b) => b.remainder - a.remainder);
      for (let i = 0; i < playerEntries.length && sumRounded < 0; i++) {
        playerEntries[i].rounded += 1;
        sumRounded += 1;
      }
    }
  }

  // Calculate minimal transfers (remaining debt to be settled)
  const people = playerEntries
    .map(e => ({
      key: e.p.key,
      name: e.p.name,
      amount: e.rounded,
      userId: e.p.userId
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
      // Fas 2: Removed name-based Swish lookup — never guess Swish number by name

      transfers.push({
        from: debtor.name,
        fromUserId: debtor.userId,
        fromKey: debtor.key,
        to: creditor.name,
        toUserId: creditor.userId,
        toKey: creditor.key,
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

  // Backward compatibility: expose auditTrail[name] only when name is unique across participants
  const nameToKeys = {};
  for (const key of Object.keys(players)) {
    const p = players[key];
    if (p.name) {
      if (!nameToKeys[p.name]) nameToKeys[p.name] = [];
      nameToKeys[p.name].push(key);
    }
  }
  for (const [pName, pKeys] of Object.entries(nameToKeys)) {
    if (pKeys.length === 1 && !auditTrail[pName]) {
      auditTrail[pName] = auditTrail[pKeys[0]];
    }
  }

  return {
    balances: playerEntries.map(e => ({
      key: e.p.key,
      name: e.p.name,
      net: e.rounded,
      rawTotal: Math.round(e.p.rawTotal || 0),
      totalPaid: Math.round(e.p.totalPaid || 0),
      totalReceived: Math.round(e.p.totalReceived || 0),
      isDebtFree: Math.abs(e.rounded) < 1,
      userId: e.p.userId
    })),
    transfers,
    receipts: receipts.map(r => ({
      id: r.id,
      fromName: r.from_name,
      toName: r.to_name,
      fromUserId: r.from_user_id || null,
      toUserId: r.to_user_id || null,
      amount: r.amount,
      paidAt: r.paid_at
    })),
    auditTrail,
    finishedMainRounds,
    totalMainRounds,
    finishedSideBets,
    totalSideBets,
    finishedRounds: finishedMainRounds + finishedSideBets,
    totalRounds: totalMainRounds + totalSideBets
  };
}

export function createSettlementReceipt(id, tournamentId, fromName, toName, amount, fromUserId = null, toUserId = null) {
  stmts.insertSettlementReceipt.run(id, tournamentId, fromName, toName, amount, fromUserId, toUserId);
  return { isPaid: true, id };
}

export function toggleSettlementReceipt(id, tournamentId, fromName, toName, amount, fromUserId = null, toUserId = null) {
  // Fas 2: Prefer userId-based lookup, fallback to name for legacy data
  let existing = null;
  if (fromUserId && toUserId) {
    existing = stmts.getSettlementReceiptByUserIds.get(tournamentId, fromUserId, toUserId);
  }
  if (!existing) {
    existing = stmts.getSettlementReceipt.get(tournamentId, fromName, toName);
  }
  if (existing) {
    stmts.deleteSettlementReceiptById.run(existing.id);
    return { isPaid: false, deletedId: existing.id };
  } else {
    stmts.insertSettlementReceipt.run(id, tournamentId, fromName, toName, amount, fromUserId, toUserId);
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
  try {
    db.prepare("UPDATE minigame_duels SET is_settled = 1, settled_at = datetime('now') WHERE tournament_id = ?").run(tournamentId);
  } catch {}
}

export function reopenTournament(tournamentId) {
  stmts.updateTournamentStatus.run('active', tournamentId);
  try {
    db.prepare("UPDATE minigame_duels SET is_settled = 0 WHERE tournament_id = ?").run(tournamentId);
  } catch {}
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

    const winnerIds = (bet.winner_id || '').split(',').map(s => s.trim()).filter(Boolean);
    if (winnerIds.includes(bet.player_id)) {
      u.wins++;
      const full = getFullEvent(bet.event_id);
      if (full) {
        const effectivePool = full.totalPool * (full.payoutPercent / 100);
        const winningPool = full.bets.filter(b => b.playerId === bet.player_id).reduce((s, b) => s + b.amount, 0);
        const sharePerWinner = winnerIds.length > 0 ? effectivePool / winnerIds.length : effectivePool;
        const odds = winningPool > 0 ? (sharePerWinner / winningPool) : 0;
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

// Friend requests: a friendship is only created when the receiver accepts
// (or when both users have requested each other).
export function requestFriend(fromUserId, toUserId) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return { status: 'invalid' };
  if (isFriend(fromUserId, toUserId)) return { status: 'already_friends' };
  if (stmts.getFriendRequest.get(toUserId, fromUserId)) {
    acceptFriendRequest(toUserId, fromUserId);
    return { status: 'accepted' };
  }
  stmts.insertFriendRequest.run(fromUserId, toUserId);
  return { status: 'pending' };
}

export function acceptFriendRequest(fromUserId, toUserId) {
  if (!stmts.getFriendRequest.get(fromUserId, toUserId)) return false;
  const tx = db.transaction(() => {
    addFriend(fromUserId, toUserId);
    stmts.deleteFriendRequestsBetween.run(fromUserId, toUserId, toUserId, fromUserId);
  });
  tx();
  return true;
}

export function declineFriendRequest(fromUserId, toUserId) {
  return stmts.deleteFriendRequest.run(fromUserId, toUserId).changes > 0;
}

export function getFriendRequests(userId) {
  const mapUser = u => ({
    id: u.id,
    nickname: u.nickname,
    realName: u.real_name,
    avatarEmoji: u.avatar_emoji,
    avatarUrl: u.avatar_url,
    createdAt: u.created_at
  });
  return {
    incoming: stmts.getIncomingFriendRequests.all(userId).map(mapUser),
    outgoing: stmts.getOutgoingFriendRequests.all(userId).map(mapUser)
  };
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
export function createDuel({ id: customId, gameType, creatorId, opponentId, stakeAmount, mode, tournamentId = null }) {
  const id = customId || crypto.randomUUID();
  const status = (mode === 'table' || mode === 'party') ? 'active' : (opponentId ? 'pending' : 'active');
  stmts.insertDuel.run({
    id,
    game_type: gameType || 'dice',
    creator_id: creatorId,
    opponent_id: opponentId || null,
    stake_amount: typeof stakeAmount === 'number' ? Math.max(0, stakeAmount) : 1,
    mode: mode || 'online',
    status,
    tournament_id: tournamentId || null
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

// Records one participant's result report. The duel only completes when the other
// participant confirms the same result, or when the reporter concedes the loss.
export function reportDuelResult({ duelId, reporterId, creatorScore, opponentScore, winnerId }) {
  const duel = stmts.getDuelById.get(duelId);
  if (!duel) return { error: 'not_found' };

  const loserId = winnerId ? (winnerId === duel.creator_id ? duel.opponent_id : duel.creator_id) : null;
  const reporterConcedes = Boolean(winnerId) && reporterId === loserId;
  const hasOtherReport = duel.reported_by && duel.reported_by !== reporterId;

  if (hasOtherReport) {
    const matches = duel.reported_creator_score === creatorScore &&
      duel.reported_opponent_score === opponentScore &&
      (duel.reported_winner_id || null) === (winnerId || null);
    if (!matches) return { error: 'mismatch', duel };
  }

  if (hasOtherReport || reporterConcedes) {
    const completed = submitDuelResult({ duelId, creatorScore, opponentScore, winnerId });
    return { duel: completed, confirmed: true };
  }

  stmts.updateDuelReport.run({
    id: duelId,
    reported_by: reporterId,
    reported_creator_score: creatorScore,
    reported_opponent_score: opponentScore,
    reported_winner_id: winnerId || null
  });
  return { duel: stmts.getDuelById.get(duelId), confirmed: false };
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

export function getUnifiedSettlementOverview(userId) {
  if (!userId) return { friends: [], totalNet: 0, totalOwed: 0, totalDue: 0 };

  const duelSummary = getDuelSettlementSummary(userId);
  const friendsMap = new Map();

  for (const f of (duelSummary.friends || [])) {
    friendsMap.set(f.friendId, {
      friendId: f.friendId,
      friendName: f.friendName,
      friendNickname: f.friendNickname,
      friendSwish: f.friendSwish,
      friendAvatarEmoji: f.friendAvatarEmoji,
      friendAvatarUrl: f.friendAvatarUrl,
      duelNet: f.netAmount || 0,
      tournamentNet: 0,
      totalNet: f.netAmount || 0,
      duelsCount: f.duelsCount || 0,
      duelIds: f.duelIds || [],
      details: (f.duels || []).map(d => ({
        type: d.expenseId ? 'expense' : 'duel',
        title: d.customTitle || (d.expenseId ? 'Utlägg/Nota' : `Duell (${d.gameType || '1v1'})`),
        amount: d.youWon ? d.stakeAmount : -d.stakeAmount,
        date: d.createdAt
      }))
    });
  }

  const userTournaments = getAllTournaments(userId);
  const currentUser = getUserById(userId);
  const myNick = currentUser ? currentUser.nickname : null;
  const myName = currentUser ? currentUser.real_name : null;

  for (const t of userTournaments) {
    let settlement;
    try {
      settlement = getTournamentNetSettlement(t.id);
    } catch {
      continue;
    }
    if (!settlement || !Array.isArray(settlement.transfers)) continue;

    for (const tr of settlement.transfers) {
      if (tr.isPaid) continue;

      const isMeFrom = tr.fromUserId === userId || (!tr.fromUserId && myNick && tr.from === myNick) || (!tr.fromUserId && myName && tr.from === myName);
      const isMeTo = tr.toUserId === userId || (!tr.toUserId && myNick && tr.to === myNick) || (!tr.toUserId && myName && tr.to === myName);

      if (!isMeFrom && !isMeTo) continue;

      const otherUserId = isMeFrom ? tr.toUserId : tr.fromUserId;
      const otherName = isMeFrom ? tr.to : tr.from;
      const otherSwish = isMeFrom ? tr.toSwish : null;

      let key = otherUserId || otherName;
      if (!key) continue;

      if (!friendsMap.has(key)) {
        // Fas 2: Only look up counterparty by userId — never guess by name
        let otherUser = otherUserId ? getUserById(otherUserId) : null;

        friendsMap.set(key, {
          friendId: otherUser ? otherUser.id : key,
          friendName: otherUser ? (otherUser.nickname || otherUser.real_name) : otherName,
          friendNickname: otherUser ? otherUser.nickname : otherName,
          friendSwish: otherUser ? otherUser.swish_number : otherSwish,
          friendAvatarEmoji: otherUser ? otherUser.avatar_emoji : '👤',
          friendAvatarUrl: otherUser ? otherUser.avatar_url : null,
          duelNet: 0,
          tournamentNet: 0,
          totalNet: 0,
          duelsCount: 0,
          duelIds: [],
          details: []
        });
      }

      const item = friendsMap.get(key);
      const amountChange = isMeTo ? tr.amount : -tr.amount;
      item.tournamentNet += amountChange;
      item.totalNet += amountChange;
      item.details.push({
        type: 'tournament',
        title: `🏆 ${t.name}`,
        amount: amountChange,
        tournamentId: t.id
      });
    }
  }

  const friends = Array.from(friendsMap.values())
    .filter(f => f.totalNet !== 0 || f.details.length > 0)
    .sort((a, b) => a.totalNet - b.totalNet);

  let totalNet = 0;
  let totalOwed = 0;
  let totalDue = 0;

  for (const f of friends) {
    totalNet += f.totalNet;
    if (f.totalNet < 0) totalOwed += Math.abs(f.totalNet);
    if (f.totalNet > 0) totalDue += f.totalNet;
  }

  return { friends, totalNet, totalOwed, totalDue };
}

/**
 * Atomisk Saldo-clearing: settlar alla skulder mellan userId och friendId
 * i en enda transaktion. Hanterar bilateral nettning korrekt.
 *
 * @param {string} userId - Den inloggade användaren (måste vara borgenär)
 * @param {string} friendId - Motpartens userId (måste finnas)
 * @param {number} expectedAmount - Förväntat nettosaldo (stale-state-skydd)
 * @param {string} idempotencyKey - Klient-genererad UUID (idempotens)
 * @returns {{ clearedDuels, clearedTournaments, totalCleared, receiptsCreated }}
 */
export function atomicSettleWithFriend(userId, friendId, expectedAmount, idempotencyKey) {
  if (!userId || !friendId) throw new Error('userId och friendId krävs');
  if (userId === friendId) throw new Error('Kan inte cleara med dig själv');

  // Idempotency check — look for existing clearing with this key
  const existingClearing = db.prepare(
    `SELECT * FROM atomic_clearings WHERE user_id = ? AND idempotency_key = ?`
  ).get(userId, idempotencyKey);
  if (existingClearing) {
    return JSON.parse(existingClearing.result_json);
  }

  // Get current unified overview to verify stale state and authorization
  const overview = getUnifiedSettlementOverview(userId);
  const friendEntry = (overview.friends || []).find(f => f.friendId === friendId);

  if (!friendEntry || friendEntry.totalNet === 0) {
    throw new Error('Inga öppna skulder med denna person');
  }

  // Must be creditor (totalNet > 0 means friend owes you)
  if (friendEntry.totalNet <= 0) {
    throw new Error('Endast borgenären kan kvittera en skuld');
  }

  // Stale state protection
  const actualAmount = Math.round(friendEntry.totalNet);
  if (Math.abs(actualAmount - expectedAmount) > 1) {
    const err = new Error(`Saldot har ändrats. Förväntat: ${expectedAmount} kr, aktuellt: ${actualAmount} kr. Ladda om och försök igen.`);
    err.statusCode = 409;
    throw err;
  }

  // Check that friend has a real userId (no guest clearing)
  const friendUser = getUserById(friendId);
  if (!friendUser) {
    throw new Error('Motparten måste vara en registrerad användare för atomisk clearing');
  }

  const currentUser = getUserById(userId);
  const myNick = currentUser ? currentUser.nickname : null;
  const myName = currentUser ? currentUser.real_name : null;

  // Execute atomic clearing in a single transaction
  const result = db.transaction(() => {
    let clearedDuels = 0;
    let clearedTournaments = 0;
    let receiptsCreated = [];

    // Step 1: Settle ALL standalone duels between the two users (both directions)
    const duelResult = stmts.settleDuelsBetweenUsers.run(userId, friendId, friendId, userId);
    clearedDuels = duelResult.changes;

    // Step 2: For each tournament, create receipts for transfers between us
    const userTournaments = getAllTournaments(userId);

    for (const t of userTournaments) {
      let settlement;
      try {
        settlement = getTournamentNetSettlement(t.id);
      } catch {
        continue;
      }
      if (!settlement || !Array.isArray(settlement.transfers)) continue;

      for (const tr of settlement.transfers) {
        if (tr.isPaid) continue;

        const isMeFrom = tr.fromUserId === userId || (myNick && tr.from === myNick) || (myName && tr.from === myName);
        const isMeTo = tr.toUserId === userId || (myNick && tr.to === myNick) || (myName && tr.to === myName);

        if (!isMeFrom && !isMeTo) continue;

        const otherUserId = isMeFrom ? tr.toUserId : tr.fromUserId;
        const otherName = isMeFrom ? tr.to : tr.from;

        // Only process transfers involving our friend
        if (otherUserId !== friendId) {
          // Fallback name match only if userId missing
          if (otherUserId || !otherName) continue;
          const otherUser = getUserByNicknameOrSwish(otherName);
          if (!otherUser || otherUser.id !== friendId) continue;
        }

        // Create receipt for this transfer
        const receiptId = `ac-${crypto.randomUUID()}`;
        stmts.insertSettlementReceipt.run(
          receiptId,
          t.id,
          tr.from,
          tr.to,
          tr.amount,
          tr.fromUserId || null,
          tr.toUserId || null
        );

        receiptsCreated.push({
          receiptId,
          tournamentId: t.id,
          tournamentName: t.name,
          from: tr.from,
          to: tr.to,
          amount: tr.amount
        });
        clearedTournaments++;
      }
    }

    const totalCleared = actualAmount;
    const resultData = { clearedDuels, clearedTournaments, totalCleared, receiptsCreated };

    // Store for idempotency
    db.prepare(
      `INSERT INTO atomic_clearings (id, user_id, friend_id, idempotency_key, expected_amount, total_cleared, result_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      `ac-${crypto.randomUUID()}`,
      userId,
      friendId,
      idempotencyKey,
      expectedAmount,
      totalCleared,
      JSON.stringify(resultData)
    );

    return resultData;
  })();

  return result;
}

// ── AnyBet Public API ─────────────────────────────────

export function isDeadlinePassed(deadline) {
  if (!deadline) return false;
  let deadlineTime;
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    deadlineTime = new Date(`${deadline}T23:59:59.999`).getTime();
  } else {
    deadlineTime = new Date(deadline).getTime();
  }
  if (isNaN(deadlineTime)) return false;
  return Date.now() > deadlineTime;
}

export function createAnyBet({ title, description, creatorId, judgeId, stakeAmount, betType, deadline, participantIds, tournamentId = null }) {
  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new Error('Ange vad bettet handlar om');
  }
  const cleanTitle = title.trim();
  if (cleanTitle.length > 120) {
    throw new Error('Rubriken får vara högst 120 tecken');
  }

  const cleanDescription = description && typeof description === 'string' ? description.trim() : null;
  if (cleanDescription && cleanDescription.length > 500) {
    throw new Error('Beskrivningen får vara högst 500 tecken');
  }

  const validTypes = ['winner_takes_all', 'yes_no'];
  const normalizedType = betType || 'winner_takes_all';
  if (!validTypes.includes(normalizedType)) {
    throw new Error(`Ogiltig vadtyp: ${betType}. Måste vara winner_takes_all eller yes_no`);
  }

  let stake = 0;
  if (stakeAmount !== undefined && stakeAmount !== null) {
    const parsed = typeof stakeAmount === 'number' ? stakeAmount : parseFloat(stakeAmount);
    if (!Number.isFinite(parsed) || isNaN(parsed) || parsed < 0) {
      throw new Error('Insatsen måste vara ett giltigt positivt tal');
    }
    if (parsed > 10000) {
      throw new Error('Insatsen får vara högst 10 000 kr');
    }
    stake = Math.round(parsed * 100) / 100;
  }

  let cleanDeadline = null;
  if (deadline) {
    let dlTime = /^\d{4}-\d{2}-\d{2}$/.test(deadline)
      ? new Date(`${deadline}T23:59:59.999`).getTime()
      : new Date(deadline).getTime();
    if (isNaN(dlTime)) {
      throw new Error('Ogiltigt datumformat för deadline');
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (dlTime < startOfToday.getTime()) {
      throw new Error('Deadline kan inte vara i dåtid');
    }
    cleanDeadline = deadline;
  }

  if (tournamentId) {
    const t = stmts.getTournamentById.get(tournamentId);
    if (!t) {
      throw new Error('Turneringen hittades inte');
    }
  }

  const betId = crypto.randomUUID();

  stmts.insertAnyBet.run({
    id: betId,
    title: cleanTitle,
    description: cleanDescription,
    creator_id: creatorId,
    judge_id: judgeId || creatorId,
    stake_amount: stake,
    bet_type: normalizedType,
    deadline: cleanDeadline,
    status: 'open',
    tournament_id: tournamentId || null
  });

  // Ensure creator is included in participants
  const allParticipantIds = Array.from(new Set([
    String(creatorId),
    ...(participantIds || []).map(String)
  ]));

  for (const uid of allParticipantIds) {
    stmts.insertAnyBetParticipant.run({
      id: crypto.randomUUID(),
      bet_id: betId,
      user_id: uid,
      choice: uid === String(creatorId) ? 'creator' : 'participant',
      status: uid === String(creatorId) ? 'accepted' : 'invited'
    });
  }

  return getAnyBetById(betId, creatorId);
}

export function getAnyBetSettlement(bet, userId) {
  if (!bet || bet.status !== 'completed') return null;

  const currentPart = (bet.participants || []).find(p => String(p.user_id) === String(userId));
  const isAccepted = currentPart?.status === 'accepted';
  const isDeclined = currentPart?.status === 'declined';

  if (!currentPart || isDeclined) {
    return { outcome: 'declined', amountOwed: 0, amountWon: 0, creditors: [], debtors: [] };
  }
  if (!isAccepted) {
    return { outcome: 'not_accepted', amountOwed: 0, amountWon: 0, creditors: [], debtors: [] };
  }

  const accepted = (bet.participants || []).filter(p => p.status === 'accepted');
  const stake = bet.stake_amount || 0;

  if (bet.bet_type === 'winner_takes_all') {
    const isWinner = String(bet.winner_id) === String(userId);
    if (isWinner) {
      const losers = accepted.filter(p => String(p.user_id) !== String(bet.winner_id));
      const totalWon = losers.length * stake;
      const debtors = losers.map(l => ({
        userId: l.user_id,
        nickname: l.nickname,
        realName: l.real_name,
        amount: stake
      }));
      return { outcome: 'winner', amountOwed: 0, amountWon: totalWon, creditors: [], debtors };
    } else {
      // Current user is loser
      const winner = accepted.find(p => String(p.user_id) === String(bet.winner_id));
      const creditors = (stake > 0 && winner) ? [{
        userId: winner.user_id,
        nickname: winner.nickname,
        realName: winner.real_name,
        swishNumber: winner.swish_number || null,
        amount: stake
      }] : [];
      return { outcome: 'loser', amountOwed: stake, amountWon: 0, creditors, debtors: [] };
    }
  } else if (bet.bet_type === 'yes_no') {
    const winningSide = bet.winning_side;
    const opposingSide = winningSide === 'yes' ? 'no' : 'yes';
    const winners = accepted.filter(p => p.choice === winningSide);
    const losers = accepted.filter(p => p.choice === opposingSide);

    const isWinner = currentPart.choice === winningSide;
    const isLoser = currentPart.choice === opposingSide;

    if (isWinner) {
      if (losers.length === 0 || winners.length === 0 || stake <= 0) {
        return { outcome: 'winner', amountOwed: 0, amountWon: 0, creditors: [], debtors: [] };
      }
      const perWinnerStake = Math.round((stake / winners.length) * 100) / 100;
      const totalWon = Math.round(perWinnerStake * losers.length * 100) / 100;
      const debtors = losers.map(l => ({
        userId: l.user_id,
        nickname: l.nickname,
        realName: l.real_name,
        amount: perWinnerStake
      }));
      return { outcome: 'winner', amountOwed: 0, amountWon: totalWon, creditors: [], debtors };
    } else if (isLoser) {
      if (winners.length === 0 || stake <= 0) {
        return { outcome: 'loser', amountOwed: 0, amountWon: 0, creditors: [], debtors: [] };
      }
      const perWinnerStake = Math.round((stake / winners.length) * 100) / 100;
      const creditors = winners.map(w => ({
        userId: w.user_id,
        nickname: w.nickname,
        realName: w.real_name,
        swishNumber: w.swish_number || null,
        amount: perWinnerStake
      }));
      const totalOwed = Math.round(perWinnerStake * winners.length * 100) / 100;
      return { outcome: 'loser', amountOwed: totalOwed, amountWon: 0, creditors, debtors: [] };
    } else {
      // Neutral (never chose yes or no)
      return { outcome: 'neutral', amountOwed: 0, amountWon: 0, creditors: [], debtors: [] };
    }
  }

  return { outcome: 'neutral', amountOwed: 0, amountWon: 0, creditors: [], debtors: [] };
}

export function getAnyBetById(id, currentUserId = null) {
  const bet = stmts.getAnyBetById.get(id);
  if (!bet) return null;
  const participants = stmts.getAnyBetParticipants.all(id);
  const fullBet = {
    ...bet,
    tournamentId: bet.tournament_id || null,
    participants: participants.map(p => ({
      ...p,
      realName: p.real_name,
      avatarEmoji: p.avatar_emoji,
      avatarUrl: p.avatar_url
    }))
  };
  if (currentUserId) {
    fullBet.settlement = getAnyBetSettlement(fullBet, currentUserId);
  }
  return fullBet;
}

export function getAnyBetsForUser(userId) {
  const bets = stmts.getAnyBetsForUser.all(userId, userId, userId);
  return bets.map(b => {
    const participants = stmts.getAnyBetParticipants.all(b.id);
    const fullBet = {
      ...b,
      tournamentId: b.tournament_id || null,
      participants: participants.map(p => ({
        ...p,
        realName: p.real_name,
        avatarEmoji: p.avatar_emoji,
        avatarUrl: p.avatar_url
      }))
    };
    fullBet.settlement = getAnyBetSettlement(fullBet, userId);
    return fullBet;
  });
}

export function updateAnyBetChoice(betId, userId, choice) {
  const bet = getAnyBetById(betId);
  if (!bet) throw new Error('Bettet hittades inte');
  if (bet.status !== 'open' && bet.status !== 'active') throw new Error('Bettet är inte aktivt');

  if (isDeadlinePassed(bet.deadline)) {
    throw new Error('Deadlinen för att delta eller ändra val i detta vad har passerat');
  }

  const existingPart = (bet.participants || []).find(p => String(p.user_id) === String(userId));
  if (!existingPart) {
    throw new Error('Du är inte inbjuden till detta AnyBet');
  }
  if (existingPart.status === 'declined') {
    throw new Error('Du har tidigare avböjt detta vad');
  }

  let normalizedChoice;
  if (bet.bet_type === 'yes_no') {
    if (choice !== 'yes' && choice !== 'no') {
      if (existingPart.choice === 'yes' || existingPart.choice === 'no') {
        throw new Error('Du har redan valt sida och kan inte återgå till neutral deltagare');
      }
      normalizedChoice = 'participant';
    } else {
      if ((existingPart.choice === 'yes' || existingPart.choice === 'no') && existingPart.choice !== choice) {
        throw new Error('Du har redan valt sida och kan inte byta');
      }
      normalizedChoice = choice;
    }
  } else {
    normalizedChoice = 'participant';
  }

  const info = stmts.updateAnyBetParticipantChoice.run(normalizedChoice, betId, String(userId));
  if (info.changes === 0) {
    throw new Error('Du är inte inbjuden till detta AnyBet');
  }
  return getAnyBetById(betId, userId);
}

export function declineAnyBet(betId, userId) {
  const bet = getAnyBetById(betId);
  if (!bet) throw new Error('Bettet hittades inte');
  if (bet.status !== 'open' && bet.status !== 'active') {
    throw new Error('Bettet är inte längre öppet');
  }

  const part = (bet.participants || []).find(p => String(p.user_id) === String(userId));
  if (!part) {
    throw new Error('Du är inte inbjuden till detta AnyBet');
  }
  if (String(bet.creator_id) === String(userId)) {
    throw new Error('Skaparen kan inte avböja sitt eget vad. Du kan avbryta det istället.');
  }
  if (part.status === 'accepted') {
    throw new Error('Du har redan accepterat detta vad');
  }

  stmts.declineAnyBetParticipant.run(betId, String(userId));
  return getAnyBetById(betId, userId);
}

export function cancelAnyBet(betId, userId) {
  const bet = getAnyBetById(betId);
  if (!bet) throw new Error('Bettet hittades inte');
  if (String(bet.creator_id) !== String(userId)) {
    throw new Error('Endast skaparen kan avbryta bettet');
  }
  if (bet.status === 'completed') {
    throw new Error('Bettet är redan avgjort och kan inte avbrytas');
  }
  if (bet.status === 'cancelled') {
    throw new Error('Bettet är redan avbrutet');
  }

  stmts.cancelAnyBet.run(betId, String(userId));
  return getAnyBetById(betId, userId);
}

export function acceptAnyBet(betId, userId) {
  return updateAnyBetChoice(betId, userId, 'participant');
}

export function settleAnyBet({ betId, judgeId, winnerId, winningSide, proofImageUrl }) {
  const bet = getAnyBetById(betId);
  if (!bet) throw new Error('Bettet hittades inte');
  if (String(bet.judge_id) !== String(judgeId)) {
    throw new Error('Endast utsedd domare kan avgöra bettet');
  }
  if (bet.status === 'completed') {
    throw new Error('Bettet är redan avgjort');
  }
  if (bet.status === 'cancelled') {
    throw new Error('Bettet är avbrutet och kan inte avgöras');
  }

  const acceptedParticipants = (bet.participants || []).filter(p => p.status === 'accepted');

  if (bet.bet_type === 'winner_takes_all') {
    if (!winnerId) throw new Error('Vinnare måste anges');
    const isWinnerAccepted = acceptedParticipants.some(p => p.user_id === winnerId);
    if (!isWinnerAccepted) {
      throw new Error('Vald vinnare måste vara en godkänd deltagare i vadet');
    }
  } else if (bet.bet_type === 'yes_no') {
    if (winningSide !== 'yes' && winningSide !== 'no') {
      throw new Error('Vinnande sida måste vara ja eller nej');
    }
  } else {
    throw new Error(`Okänd vadtyp: ${bet.bet_type}`);
  }

  const settleTx = db.transaction(() => {
    stmts.settleAnyBet.run({
      id: betId,
      winner_id: winnerId || null,
      winning_side: winningSide || null,
      proof_image_url: proofImageUrl || null
    });

    // If there is money on the line, settle debts in minigame_duels for Notan & Swish!
    if (bet.stake_amount > 0) {
      if (bet.bet_type === 'winner_takes_all' && winnerId) {
        const losers = acceptedParticipants.filter(p => p.user_id !== winnerId);
        for (const loser of losers) {
          const duelId = crypto.randomUUID();
          stmts.insertDuel.run({
            id: duelId,
            game_type: 'anybet',
            creator_id: winnerId,
            opponent_id: loser.user_id,
            stake_amount: bet.stake_amount,
            mode: 'anybet',
            status: 'completed',
            tournament_id: bet.tournament_id || null
          });
          stmts.updateDuelResult.run({
            id: duelId,
            creator_score: 1,
            opponent_score: 0,
            winner_id: winnerId,
            status: 'completed'
          });
        }
      } else if (bet.bet_type === 'yes_no' && winningSide) {
        const opposingSide = winningSide === 'yes' ? 'no' : 'yes';
        const winners = acceptedParticipants.filter(p => p.choice === winningSide);
        const losers = acceptedParticipants.filter(p => p.choice === opposingSide);

        if (winners.length > 0 && losers.length > 0) {
          for (const loser of losers) {
            for (const winner of winners) {
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
                status: 'completed',
                tournament_id: bet.tournament_id || null
              });
              stmts.updateDuelResult.run({
                id: duelId,
                creator_score: 1,
                opponent_score: 0,
                winner_id: winner.user_id,
                status: 'completed'
              });
            }
          }
        }
      }
    }
  });

  settleTx();

  return getAnyBetById(betId, judgeId);
}

// ── Push Subscriptions API ───────────────────────────

export function savePushSubscription(idOrUserId, userIdOrSub, endpoint, p256dh, auth) {
  if (typeof userIdOrSub === 'object' && userIdOrSub !== null) {
    const userId = idOrUserId;
    const sub = userIdOrSub;
    const id = crypto.randomUUID();
    stmts.insertPushSubscription.run(id, userId, sub.endpoint, sub.keys?.p256dh || '', sub.keys?.auth || '');
    return;
  }
  stmts.insertPushSubscription.run(idOrUserId, userIdOrSub, endpoint, p256dh, auth);
}

export function deletePushSubscriptionByEndpoint(endpoint) {
  stmts.deletePushSubscriptionByEndpoint.run(endpoint);
}

export function getAllPushSubscriptions() {
  return stmts.getAllPushSubscriptions.all();
}

export function getUserNotificationPrefs(userId) {
  const row = stmts.getUserNotificationPrefs.get(userId);
  if (!row) {
    return { notifyFlashbets: true, notifyDuels: true, notifyTournaments: true, notifySupport: true };
  }
  return {
    notifyFlashbets: row.notify_flashbets !== 0,
    notifyDuels: row.notify_duels !== 0,
    notifyTournaments: row.notify_tournaments !== 0,
    notifySupport: row.notify_support !== 0
  };
}

export function updateUserNotificationPrefs(userId, prefs = {}) {
  const current = getUserNotificationPrefs(userId);
  const flash = prefs.notifyFlashbets !== undefined ? (prefs.notifyFlashbets ? 1 : 0) : (current.notifyFlashbets ? 1 : 0);
  const duels = prefs.notifyDuels !== undefined ? (prefs.notifyDuels ? 1 : 0) : (current.notifyDuels ? 1 : 0);
  const tourneys = prefs.notifyTournaments !== undefined ? (prefs.notifyTournaments ? 1 : 0) : (current.notifyTournaments ? 1 : 0);
  const support = prefs.notifySupport !== undefined ? (prefs.notifySupport ? 1 : 0) : (current.notifySupport ? 1 : 0);
  stmts.updateUserNotificationPrefs.run(flash, duels, tourneys, support, userId);
  return getUserNotificationPrefs(userId);
}

const supportPushCooldowns = new Map();
const SUPPORT_PUSH_COOLDOWN_MS = 3 * 60 * 1000; // 3 min throttle to prevent spam

export function canSendSupportPush(userId, force = false) {
  if (force) return true;
  const last = supportPushCooldowns.get(userId);
  if (!last) return true;
  return (Date.now() - last) >= SUPPORT_PUSH_COOLDOWN_MS;
}

export function recordSupportPushSent(userId) {
  supportPushCooldowns.set(userId, Date.now());
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
      if (category === 'support' && !prefs.notifySupport) continue;
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
    if (t.visibility === 'friends' || t.visibility === 'friends_of_friends') {
      const friendRows = db.prepare('SELECT friend_id FROM friends WHERE user_id = ?').all(t.creator_id);
      for (const f of friendRows) {
        if (f.friend_id) userIds.add(f.friend_id);
      }
    }
  }
  // Add registered participants with an associated user_id
  const partRows = db.prepare(`
    SELECT DISTINCT user_id FROM tournament_participants
    WHERE tournament_id = ? AND user_id IS NOT NULL
  `).all(tournamentId);
  for (const p of partRows) {
    if (p.user_id) userIds.add(p.user_id);
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

export function createFlashBet(id, creatorId, tournamentId, question, durationSeconds, expiresAt, stakeAmount = 20, targetUserIds = null) {
  const targetJson = (Array.isArray(targetUserIds) && targetUserIds.length > 0) ? JSON.stringify(targetUserIds) : null;
  stmts.insertFlashBet.run(id, creatorId, tournamentId || null, question, durationSeconds, expiresAt, stakeAmount, targetJson);
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

  let targetUserIds = null;
  if (fb.target_user_ids) {
    try {
      targetUserIds = JSON.parse(fb.target_user_ids);
    } catch {}
  }

  // Build settlement summary if bet is settled
  let settlementSummary = null;
  if (status === 'settled' && fb.winning_choice) {
    const winners = entries.filter(e => e.choice === fb.winning_choice);
    const losers = entries.filter(e => e.choice !== fb.winning_choice);
    const isWinner = myEntry ? myEntry.choice === fb.winning_choice : false;
    const isLoser = myEntry ? myEntry.choice !== fb.winning_choice : false;

    let debts = [];
    if (isLoser && winners.length > 0) {
      const perWinnerAmount = Math.round((myEntry.amount / winners.length) * 100) / 100;
      debts = winners.map(w => ({
        winnerId: w.user_id,
        winnerName: w.nickname || w.real_name || 'Vinnare',
        winnerAvatar: w.avatar_emoji || '🏆',
        winnerSwish: w.swish_number || null,
        amount: perWinnerAmount
      }));
    }

    settlementSummary = {
      winningChoice: fb.winning_choice,
      isWinner,
      isLoser,
      hasVoted: !!myEntry,
      winnersCount: winners.length,
      losersCount: losers.length,
      debts
    };
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
    targetUserIds,
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
      swishNumber: (status === 'settled' || e.user_id === currentUserId) ? (e.swish_number || null) : null,
      createdAt: e.created_at
    })),
    myEntry,
    myChoice: myEntry ? myEntry.choice : null,
    settlementSummary
  };
}

export function getActiveFlashBets(userId = null, tournamentId = null) {
  const active = stmts.getActiveFlashBets.all();
  return active
    .map(fb => getFlashBet(fb.id, userId))
    .filter(fb => {
      if (!fb) return false;
      if (fb.status === 'settled' || fb.status === 'cancelled') return false;
      if (tournamentId && (fb.tournamentId || fb.tournament_id) !== tournamentId) return false;
      // Targeted bet filter: only creator and targetUserIds can see it
      if (fb.targetUserIds && Array.isArray(fb.targetUserIds) && fb.targetUserIds.length > 0) {
        if (!userId) return false;
        if (fb.creatorId !== userId && !fb.targetUserIds.includes(userId)) return false;
      }
      // Active and time left: everyone (or allowed target) sees it
      if (fb.status === 'open' && fb.secondsLeft > 0) return true;
      // Pending settlement (time expired or locked): creator sees it to settle, and participants who voted see it
      if (userId && (fb.creatorId === userId || fb.myEntry)) return true;
      return false;
    });
}

export function placeFlashBetEntry(id, flashBetId, userId, choice, amount) {
  const fb = stmts.getFlashBetById.get(flashBetId);
  if (!fb) throw new Error('BlixtBet hittades inte');

  if (fb.creator_id === userId) {
    throw new Error('Som skapare av vadet kan du inte rösta i det');
  }

  if (fb.target_user_ids) {
    try {
      const targets = JSON.parse(fb.target_user_ids);
      if (Array.isArray(targets) && targets.length > 0 && !targets.includes(userId)) {
        throw new Error('Du är inte inbjuden till detta BlixtBet');
      }
    } catch (err) {
      if (err.message === 'Du är inte inbjuden till detta BlixtBet') throw err;
    }
  }

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

export function cancelFlashBet(flashBetId, userId, isAdmin = false) {
  const fb = stmts.getFlashBetById.get(flashBetId);
  if (!fb) throw new Error('BlixtBet hittades inte');
  if (fb.creator_id !== userId && !isAdmin) throw new Error('Endast skaparen kan avbryta vadet');
  if (fb.status === 'settled') throw new Error('Vadet är redan avgjort');
  if (fb.status === 'cancelled') return getFlashBet(flashBetId, userId);
  stmts.updateFlashBetStatus.run('cancelled', fb.id);
  return getFlashBet(flashBetId, userId);
}

export function deleteFlashBet(flashBetId, userId) {
  const fb = stmts.getFlashBetById.get(flashBetId);
  if (!fb) throw new Error('BlixtBet hittades inte');
  if (fb.creator_id !== userId) throw new Error('Endast skaparen kan ta bort vadet');
  if (fb.status === 'settled') throw new Error('Vadet är redan avgjort och kan inte tas bort');

  const entries = stmts.getFlashBetEntries.all(flashBetId);
  if (entries.length > 0) {
    throw new Error('Det går inte att ta bort vadet eftersom någon redan har lagt ett bet');
  }

  stmts.deleteFlashBet.run(flashBetId);

  let targetUserIds = null;
  if (fb.target_user_ids) {
    try {
      targetUserIds = JSON.parse(fb.target_user_ids);
    } catch {}
  }

  return {
    success: true,
    id: flashBetId,
    tournamentId: fb.tournament_id,
    targetUserIds
  };
}

export function settleFlashBet(flashBetId, winningChoice, settleUserId) {
  const fb = stmts.getFlashBetById.get(flashBetId);
  if (!fb) throw new Error('BlixtBet hittades inte');
  if (fb.status === 'settled') throw new Error('Detta BlixtBet är redan avgjort');
  if (fb.status === 'cancelled') throw new Error('Detta BlixtBet har avbrutits och kan inte avgöras');
  if (fb.status !== 'open' && fb.status !== 'locked') throw new Error('Vadet kan inte avgöras i dess nuvarande status');
  if (winningChoice !== 'yes' && winningChoice !== 'no') {
    throw new Error('Vinnande val måste vara ja eller nej');
  }

  // Verify authorization: creator or tournament creator can settle
  let isAllowed = fb.creator_id === settleUserId;
  if (!isAllowed && fb.tournament_id) {
    const t = stmts.getTournamentById.get(fb.tournament_id);
    if (t && t.creator_id === settleUserId) isAllowed = true;
  }
  if (!isAllowed) throw new Error('Endast skaparen kan avgöra detta BlixtBet');

  const entries = stmts.getFlashBetEntries.all(flashBetId);
  const winners = entries.filter(e => e.choice === winningChoice);
  const losers = entries.filter(e => e.choice !== winningChoice);

  const settleTx = db.transaction(() => {
    stmts.updateFlashBetSettle.run(winningChoice, flashBetId);

    // Settlement and debt logging
    if (winners.length > 0 && losers.length > 0) {
      for (const loser of losers) {
        for (const winner of winners) {
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
            status: 'completed',
            tournament_id: fb.tournament_id || null
          });
          stmts.updateDuelResult.run({
            id: duelId,
            creator_score: 1,
            opponent_score: 0,
            winner_id: winner.user_id,
            status: 'completed'
          });
        }
      }
    }
  });

  settleTx();

  return getFlashBet(flashBetId, settleUserId);
}

// ── Flash Live Streams Public API ─────────────────────

export function createFlashLiveStream(session) {
  stmts.insertFlashLiveStream.run({
    id: session.id,
    hostId: session.hostId,
    hostName: session.hostName,
    hostAvatar: session.hostAvatar || '🏌️‍♂️',
    question: session.question,
    hasBet: session.hasBet ? 1 : 0,
    stakeAmount: session.stakeAmount || 0,
    durationSeconds: session.durationSeconds || 0,
    expiresAt: session.expiresAt || null,
    targetUserIds: JSON.stringify(session.targetUserIds || []),
    flashBetId: session.flashBetId || null,
    status: session.status || 'active'
  });
}

export function getActiveFlashLiveStreams() {
  const rows = stmts.getActiveFlashLiveStreams.all();
  return rows.map(r => ({
    id: r.id,
    hostId: r.host_id,
    hostName: r.host_name,
    hostAvatar: r.host_avatar,
    question: r.question,
    hasBet: !!r.has_bet,
    stakeAmount: r.stake_amount,
    durationSeconds: r.duration_seconds,
    expiresAt: r.expires_at,
    targetUserIds: r.target_user_ids ? JSON.parse(r.target_user_ids) : [],
    flashBetId: r.flash_bet_id,
    status: r.status,
    createdAt: r.created_at
  }));
}

export function getFlashLiveStream(id) {
  const r = stmts.getFlashLiveStreamById.get(id);
  if (!r) return null;
  return {
    id: r.id,
    hostId: r.host_id,
    hostName: r.host_name,
    hostAvatar: r.host_avatar,
    question: r.question,
    hasBet: !!r.has_bet,
    stakeAmount: r.stake_amount,
    durationSeconds: r.duration_seconds,
    expiresAt: r.expires_at,
    targetUserIds: r.target_user_ids ? JSON.parse(r.target_user_ids) : [],
    flashBetId: r.flash_bet_id,
    status: r.status,
    createdAt: r.created_at
  };
}

export function updateFlashLiveStreamStatus(id, status) {
  stmts.updateFlashLiveStreamStatus.run(status, id);
}

export function updateFlashLiveStreamBet(id, flashBetId, stakeAmount, durationSeconds, expiresAt, question = null) {
  stmts.updateFlashLiveStreamBet.run(question || null, flashBetId, stakeAmount, durationSeconds, expiresAt, id);
}

// ── Tab Expenses & Even Steven Public API ─────────────

export function createTabExpense({ payerId, title, notes, totalAmount, mode, participantIds = [], loserId = null, receiptImage = null, customShares = null, tournamentId = null }) {
  if (!payerId) throw new Error('Payer is required');
  const amount = parseFloat(totalAmount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Giltigt totalbelopp krävs');

  const cleanTitle = (title && title.trim()) ? title.trim() : 'Dela nota';
  const cleanNotes = (notes && notes.trim()) ? notes.trim() : null;
  const expenseId = crypto.randomUUID();

  // Ensure unique list of participant user IDs including the payer
  const allParticipantSet = new Set(participantIds.map(String));
  allParticipantSet.add(String(payerId));
  const allParticipants = Array.from(allParticipantSet);

  if (allParticipants.length < 2) {
    throw new Error('Minst 2 personer krävs för att dela ett utlägg');
  }

  const tx = db.transaction(() => {
    // 1. Insert tab expense record
    stmts.insertTabExpense.run({
      id: expenseId,
      payer_id: payerId,
      title: cleanTitle,
      notes: cleanNotes,
      total_amount: amount,
      mode: 'even_steven',
      loser_id: null,
      receipt_image: receiptImage || null,
      tournament_id: tournamentId || null
    });

    // Even Steven: either custom individual shares or split evenly
    let userShares = {};
    const hasCustomShares = customShares && typeof customShares === 'object' && Object.keys(customShares).length > 0;

      if (hasCustomShares) {
        let allocatedCents = 0;
        for (const uid of allParticipants) {
          const val = parseFloat(customShares[uid]);
          const share = (Number.isFinite(val) && val >= 0) ? Math.round(val * 100) / 100 : 0;
          userShares[uid] = share;
          allocatedCents += Math.round(share * 100);
        }

        // Validate sum against total amount (tolerance: exact to the cent)
        const totalCents = Math.round(amount * 100);
        if (allocatedCents !== totalCents) {
          throw new Error(`Summan av deltagarnas belopp (${(allocatedCents / 100).toFixed(2)} kr) matchar inte totalbeloppet (${(totalCents / 100).toFixed(2)} kr)`);
        }
      } else {
        const totalCents = Math.round(amount * 100);
        const n = allParticipants.length;
        const baseCents = Math.floor(totalCents / n);
        const remainderCents = totalCents % n;

        for (let i = 0; i < n; i++) {
          const uid = allParticipants[i];
          const cents = baseCents + (i < remainderCents ? 1 : 0);
          userShares[uid] = cents / 100;
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
            receipt_image: receiptImage || null,
            tournament_id: tournamentId || null
          });
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
    tournamentId: expense.tournament_id || null,
    participants: participants.map(p => ({
      ...p,
      realName: p.real_name,
      avatarEmoji: p.avatar_emoji,
      avatarUrl: p.avatar_url
    }))
  };
}

// Payer removes the whole expense; any other participant disputes (removes) only
// their own share. Shares that are already settled (paid) cannot be removed.
export function removeTabExpenseForUser(expenseId, userId) {
  const expense = stmts.getTabExpenseById.get(expenseId);
  if (!expense) throw new Error('Notan hittades inte');

  if (expense.tournament_id) {
    const t = stmts.getTournamentById.get(expense.tournament_id);
    if (t && t.status === 'settled') {
      throw new Error('Turneringen är avslutad. Återöppna den för att ändra notan.');
    }
  }

  const duels = db.prepare('SELECT * FROM minigame_duels WHERE expense_id = ?').all(expenseId);
  const isPayer = String(expense.payer_id) === String(userId);

  // In a tournament, payments are recorded as net settlement receipts rather than on the
  // debt itself. If an affected person already has a receipt, the debt may already be paid.
  const hasTournamentReceiptFor = (affectedUserIds) => {
    if (!expense.tournament_id) return false;
    const receipts = stmts.getSettlementReceipts.all(expense.tournament_id);
    if (receipts.length === 0) return false;
    const ids = new Set(affectedUserIds.map(String));
    const names = new Set();
    for (const id of ids) {
      const u = stmts.getUserById.get(id);
      if (u?.nickname) names.add(u.nickname.toLowerCase());
      if (u?.real_name) names.add(u.real_name.toLowerCase());
    }
    return receipts.some(r =>
      ids.has(String(r.from_user_id)) || ids.has(String(r.to_user_id)) ||
      names.has(String(r.from_name || '').toLowerCase()) || names.has(String(r.to_name || '').toLowerCase())
    );
  };

  if (isPayer) {
    const participantIds = db.prepare('SELECT user_id FROM tab_expense_participants WHERE expense_id = ?').all(expenseId).map(r => r.user_id);
    if (duels.some(d => d.is_settled)) {
      throw new Error('Någon har redan kvitterat sin del. Notan kan inte tas bort.');
    }
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM minigame_duels WHERE expense_id = ?').run(expenseId);
      db.prepare('DELETE FROM tab_expense_participants WHERE expense_id = ?').run(expenseId);
      db.prepare('DELETE FROM tab_expenses WHERE id = ?').run(expenseId);
    });
    tx();
    return { removed: 'expense', expense, participantIds };
  }

  const isParticipant = db.prepare('SELECT 1 FROM tab_expense_participants WHERE expense_id = ? AND user_id = ?').get(expenseId, String(userId));
  if (!isParticipant) throw new Error('Du deltar inte i denna nota');

  const myDuels = duels.filter(d => String(d.opponent_id) === String(userId));
  if (myDuels.some(d => d.is_settled)) {
    throw new Error('Din del är redan kvitterad och kan inte bestridas');
  }
  const disputedShare = myDuels.reduce((sum, d) => sum + Number(d.stake_amount), 0);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM minigame_duels WHERE expense_id = ? AND opponent_id = ?').run(expenseId, String(userId));
    db.prepare('DELETE FROM tab_expense_participants WHERE expense_id = ? AND user_id = ?').run(expenseId, String(userId));
    if (disputedShare > 0) {
      db.prepare('UPDATE tab_expenses SET total_amount = total_amount - ? WHERE id = ?').run(disputedShare, expenseId);
    }
  });
  tx();
  return { removed: 'share', expense };
}

export function getTabExpensesForUser(userId) {
  if (!userId) return [];
  return stmts.getTabExpensesForUser.all(userId, userId, userId);
}

export function getMyTabExpenses(userId) {
  if (!userId) return [];
  const list = stmts.getMyTabExpenses.all(userId);
  return list.map(e => getTabExpenseById(e.id)).filter(Boolean);
}

// ── Healthcheck & Database Backup Operations ─────────
export function isHealthy() {
  try {
    const row = db.prepare('SELECT 1 as alive').get();
    return row && row.alive === 1;
  } catch (e) {
    return false;
  }
}

export async function backupDatabase(customDir = null) {
  const targetDir = customDir || join(dirname(DB_PATH), 'backups');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `betpals-backup-${timestamp}.db`;
  const targetPath = join(targetDir, filename);

  await db.backup(targetPath);

  // Prune backups older than 7 days, keep at most 7 newest
  try {
    const files = fs.readdirSync(targetDir)
      .filter(f => f.startsWith('betpals-backup-') && f.endsWith('.db'))
      .map(f => ({ name: f, path: join(targetDir, f), time: fs.statSync(join(targetDir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 30) {
      for (const oldFile of files.slice(30)) {
        try { fs.unlinkSync(oldFile.path); } catch (e) {}
      }
    }
  } catch (err) {
    console.warn('Could not prune old backups:', err);
  }

  const stat = fs.statSync(targetPath);
  return {
    filename,
    path: targetPath,
    sizeBytes: stat.size,
    timestamp: new Date().toISOString()
  };
}

export function getLatestBackup(customDir = null) {
  const targetDir = customDir || join(dirname(DB_PATH), 'backups');
  if (!fs.existsSync(targetDir)) return null;

  const files = fs.readdirSync(targetDir)
    .filter(f => f.startsWith('betpals-backup-') && f.endsWith('.db'))
    .map(f => ({ name: f, path: join(targetDir, f), time: fs.statSync(join(targetDir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  return files.length > 0 ? files[0] : null;
}

// ── Löven Game (Björklöven Matchtips 4-3-2p) ────────────

/**
 * Validates that a value is a finite integer within [min, max].
 * Throws an informative Error instead of silently clamping.
 */
function validateResultInt(value, label, min = 0, max = 30) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${label}: måste vara ett heltal (fick: ${value})`);
  }
  if (n < min || n > max) {
    throw new Error(`${label}: måste vara mellan ${min} och ${max} (fick: ${n})`);
  }
  return n;
}

export function normalizePlayerName(name) {
  if (!name) return '';
  return name
    .replace(/^#?\d+\s*/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isScorerMatch(pred, actual) {
  const p = normalizePlayerName(pred);
  const a = normalizePlayerName(actual);
  if (!p || !a) return false;
  if (p === a) return true;

  // Flexible shutout / no goals handling
  const noGoalsTokens = ['inga mal', 'nollade', 'nollad', 'ingen', '0 mal', '0-0', 'inga mål'];
  const pIsNoGoals = noGoalsTokens.some(tok => p.includes(normalizePlayerName(tok)));
  const aIsNoGoals = noGoalsTokens.some(tok => a.includes(normalizePlayerName(tok)));
  if (pIsNoGoals && aIsNoGoals) {
    return true;
  }
  if (pIsNoGoals || aIsNoGoals) {
    return false;
  }

  // Surname-only match (e.g. "Wallmark" matches "Lucas Wallmark" or vice-versa)
  if (p.endsWith(' ' + a) || a.endsWith(' ' + p)) {
    return true;
  }

  return false;
}

export function createLovenGame({
  id = crypto.randomUUID(),
  creatorId,
  opponentTeam,
  isHome = 1,
  matchDate,
  stakeAmount = 20,
  tournamentId = null
}) {
  if (!creatorId) throw new Error('Skapare saknas');
  if (!opponentTeam || !opponentTeam.trim()) throw new Error('Motståndare saknas');
  if (!matchDate) throw new Error('Matchdatum saknas');

  const matchTime = new Date(matchDate).getTime();
  if (isNaN(matchTime) || matchTime <= Date.now()) {
    throw new Error('Matchdatumet måste vara ett giltigt datum i framtiden');
  }

  const cleanOpponent = opponentTeam.trim().slice(0, 60);
  const stake = Math.max(0, Math.min(10000, Number(stakeAmount) || 0));

  stmts.insertLovenGame.run({
    id,
    creator_id: creatorId,
    opponent_team: cleanOpponent,
    is_home: isHome ? 1 : 0,
    match_date: new Date(matchTime).toISOString(),
    stake_amount: stake,
    status: 'open',
    tournament_id: tournamentId || null
  });

  return getLovenGame(id);
}

export function getLovenGame(id) {
  if (!id) return null;
  const game = stmts.getLovenGameById.get(id);
  if (!game) return null;

  const entries = stmts.getLovenEntriesByGame.all(id);

  let winnerUserIds = [];
  if (game.winner_user_ids) {
    try {
      winnerUserIds = JSON.parse(game.winner_user_ids);
    } catch {}
  }

  return {
    ...game,
    is_home: Boolean(game.is_home),
    winner_user_ids: winnerUserIds,
    entries
  };
}

export function getLovenGames() {
  const games = stmts.getLovenGamesList.all();
  return games.map(g => ({
    ...g,
    is_home: Boolean(g.is_home)
  }));
}

export function submitLovenEntry(gameId, userId, {
  predLovenGoals,
  predOpponentGoals,
  predLastScorer,
  predShotsOnGoal
}) {
  const game = stmts.getLovenGameById.get(gameId);
  if (!game) throw new Error('Matchen hittades inte');
  if (game.status !== 'open') throw new Error('Matchen är inte öppen för tips');

  const matchTime = new Date(game.match_date).getTime();
  if (Date.now() >= matchTime) {
    throw new Error('Spelstopp har passerat för denna match');
  }

  if (predLovenGoals === undefined || predLovenGoals === null || isNaN(Number(predLovenGoals))) {
    throw new Error('Ange Lövens mål');
  }
  if (predOpponentGoals === undefined || predOpponentGoals === null || isNaN(Number(predOpponentGoals))) {
    throw new Error('Ange motståndarens mål');
  }
  if (predShotsOnGoal === undefined || predShotsOnGoal === null || isNaN(Number(predShotsOnGoal))) {
    throw new Error('Ange skott på mål');
  }
  const pScorer = (predLastScorer || '').trim();
  if (!pScorer) {
    throw new Error('Välj eller ange sista målskytt');
  }

  const pLoven = Math.max(0, Math.min(30, Math.floor(Number(predLovenGoals))));
  const pOpp = Math.max(0, Math.min(30, Math.floor(Number(predOpponentGoals))));
  const pShots = Math.max(0, Math.min(150, Math.floor(Number(predShotsOnGoal))));

  const entryId = crypto.randomUUID();
  stmts.insertLovenEntry.run({
    id: entryId,
    game_id: gameId,
    user_id: userId,
    pred_loven_goals: pLoven,
    pred_opponent_goals: pOpp,
    pred_last_scorer: pScorer.slice(0, 60),
    pred_shots_on_goal: pShots
  });

  return getLovenGame(gameId);
}

export function lockLovenGame(gameId, requesterId, isAdmin = false) {
  const game = stmts.getLovenGameById.get(gameId);
  if (!game) throw new Error('Matchen hittades inte');
  if (game.creator_id !== requesterId && !isAdmin) {
    throw new Error('Endast skaparen kan låsa matchen');
  }
  if (game.status !== 'open') {
    throw new Error('Endast öppna matcher kan låsas');
  }
  stmts.updateLovenGameStatus.run('locked', gameId);
  return getLovenGame(gameId);
}

export function settleLovenGame(gameId, {
  resultLovenGoals,
  resultOpponentGoals,
  resultLastScorer,
  resultShotsOnGoal
}, requesterId, isAdmin = false) {
  const game = stmts.getLovenGameById.get(gameId);
  if (!game) throw new Error('Matchen hittades inte');
  if (game.creator_id !== requesterId && !isAdmin) {
    throw new Error('Endast skaparen kan rätta matchen');
  }
  if (game.status !== 'open' && game.status !== 'locked') {
    throw new Error('Endast öppna eller låsta matcher kan rättas');
  }

  const resLoven = validateResultInt(resultLovenGoals, 'Lövens mål', 0, 30);
  const resOpp   = validateResultInt(resultOpponentGoals, 'Motståndarens mål', 0, 30);
  const resShots = validateResultInt(resultShotsOnGoal, 'Skott på mål', 0, 150);
  const resScorer = (resultLastScorer || '').trim();
  if (!resScorer) throw new Error('Sista målskytt saknas');

  const entries = stmts.getLovenEntriesByGame.all(gameId);
  if (entries.length === 0) {
    stmts.updateLovenGameResult.run({
      id: gameId,
      result_loven_goals: resLoven,
      result_opponent_goals: resOpp,
      result_last_scorer: resScorer,
      result_shots_on_goal: resShots,
      winner_user_ids: '[]'
    });
    return getLovenGame(gameId);
  }

  // 1. Calculate diff for shots to find minimum diff
  let minDiff = Infinity;
  for (const e of entries) {
    const diff = Math.abs(Number(e.pred_shots_on_goal) - resShots);
    if (diff < minDiff) minDiff = diff;
  }

  // 2. Score each entry according to 4 - 3 - 2 rules:
  // Q1: 4p for exact result
  // Q2: 3p for last scorer
  // Q3: 2p for closest to shots on goal (diff === minDiff)
  const scoredEntries = entries.map(e => {
    const ptsResult = (Number(e.pred_loven_goals) === resLoven && Number(e.pred_opponent_goals) === resOpp) ? 4 : 0;
    const ptsScorer = isScorerMatch(e.pred_last_scorer, resScorer) ? 3 : 0;
    const diff = Math.abs(Number(e.pred_shots_on_goal) - resShots);
    const ptsShots = (diff === minDiff) ? 2 : 0;
    const totalPoints = ptsResult + ptsScorer + ptsShots;
    return {
      ...e,
      pts_result: ptsResult,
      pts_scorer: ptsScorer,
      pts_shots: ptsShots,
      points: totalPoints
    };
  });

  const maxPoints = Math.max(...scoredEntries.map(e => e.points));
  const winners = scoredEntries.filter(e => e.points === maxPoints);
  const winnerIds = winners.map(w => w.user_id);
  const losers = scoredEntries.filter(e => e.points < maxPoints);

  const settleTx = db.transaction(() => {
    // Update each entry
    for (const e of scoredEntries) {
      const isWinner = e.points === maxPoints ? 1 : 0;
      stmts.updateLovenEntryScore.run({
        id: e.id,
        points: e.points,
        pts_result: e.pts_result,
        pts_scorer: e.pts_scorer,
        pts_shots: e.pts_shots,
        is_winner: isWinner
      });
    }

    // Insert duels into minigame_duels if money is on the line and there are both winners and losers
    const stake = Number(game.stake_amount) || 0;
    if (stake > 0 && winners.length > 0 && losers.length > 0) {
      const numWinners = winners.length;
      const baseCent = Math.floor((stake * 100) / numWinners) / 100;
      const remainderCents = Math.round((stake - (baseCent * numWinners)) * 100);

      for (const loser of losers) {
        let remainingRemainder = remainderCents;
        for (let i = 0; i < numWinners; i++) {
          let share = baseCent;
          if (i < remainingRemainder) {
            share = Math.round((share + 0.01) * 100) / 100;
          }
          if (share <= 0) continue;

          const duelId = crypto.randomUUID();
          stmts.insertLovenDuel.run({
            id: duelId,
            creator_id: winners[i].user_id,
            opponent_id: loser.user_id,
            stake_amount: share,
            winner_id: winners[i].user_id,
            creator_score: winners[i].points,
            opponent_score: loser.points,
            custom_title: `Löven Game: Björklöven vs ${game.opponent_team}`,
            tournament_id: game.tournament_id || null
          });
        }
      }
    }

    // Update game record
    stmts.updateLovenGameResult.run({
      id: gameId,
      result_loven_goals: resLoven,
      result_opponent_goals: resOpp,
      result_last_scorer: resScorer,
      result_shots_on_goal: resShots,
      winner_user_ids: JSON.stringify(winnerIds)
    });
  });

  settleTx();

  return getLovenGame(gameId);
}

export function cancelLovenGame(gameId, requesterId, isAdmin = false) {
  const game = stmts.getLovenGameById.get(gameId);
  if (!game) throw new Error('Matchen hittades inte');
  if (game.creator_id !== requesterId && !isAdmin) {
    throw new Error('Endast skaparen kan avbryta matchen');
  }
  if (game.status !== 'open' && game.status !== 'locked') {
    throw new Error('Endast öppna eller låsta matcher kan avbrytas');
  }
  stmts.updateLovenGameStatus.run('cancelled', gameId);
  return getLovenGame(gameId);
}


// ── Admin Debt Management ───────────────────────────

export function getAllUnsettledDuels() {
  return db.prepare(`
    SELECT d.id, d.game_type, d.stake_amount, d.status, d.is_settled,
      d.winner_id, d.creator_id, d.opponent_id, d.tournament_id,
      d.created_at, d.settled_at,
      c.nickname as creator_nickname, c.real_name as creator_name,
      o.nickname as opponent_nickname, o.real_name as opponent_name,
      w.nickname as winner_nickname, w.real_name as winner_name
    FROM minigame_duels d
    LEFT JOIN users c ON d.creator_id = c.id
    LEFT JOIN users o ON d.opponent_id = o.id
    LEFT JOIN users w ON d.winner_id = w.id
    WHERE d.status = 'completed' AND d.stake_amount > 0
    ORDER BY d.is_settled ASC, d.created_at DESC
    LIMIT 200
  `).all();
}

export function adminDeleteDuel(duelId) {
  const duel = getDuelById(duelId);
  if (!duel) throw new Error('Duellen hittades inte');
  db.prepare('DELETE FROM minigame_duels WHERE id = ?').run(duelId);
  return duel;
}

export function adminUnsettleDuel(duelId) {
  const duel = getDuelById(duelId);
  if (!duel) throw new Error('Duellen hittades inte');
  db.prepare('UPDATE minigame_duels SET is_settled = 0, settled_at = NULL WHERE id = ?').run(duelId);
  return getDuelById(duelId);
}



