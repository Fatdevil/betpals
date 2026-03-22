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

  CREATE TABLE IF NOT EXISTS event_photos (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    caption TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_photos_event ON event_photos(event_id);

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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
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
`);

// ── Prepared Statements ──────────────────────────────
const stmts = {
  // Settings
  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),

  // Events
  getAllEvents: db.prepare('SELECT * FROM events ORDER BY created_at DESC'),
  getEventById: db.prepare('SELECT * FROM events WHERE id = ?'),
  getEventByCode: db.prepare('SELECT * FROM events WHERE share_code = ?'),
  insertEvent: db.prepare(`
    INSERT INTO events (id, name, date, status, share_code, payout_percent, min_bet, max_bet, creator_id, swish_number, tournament_id)
    VALUES (@id, @name, @date, @status, @shareCode, @payoutPercent, @minBet, @maxBet, @creatorId, @swishNumber, @tournamentId)
  `),
  updateEventStatus: db.prepare('UPDATE events SET status = ? WHERE id = ?'),
  updateEventWinner: db.prepare('UPDATE events SET status = ?, winner_id = ? WHERE id = ?'),
  resetEvent: db.prepare('UPDATE events SET status = ?, winner_id = NULL WHERE id = ?'),
  deleteEvent: db.prepare('DELETE FROM events WHERE id = ?'),

  // Players
  getPlayersByEvent: db.prepare('SELECT * FROM players WHERE event_id = ?'),
  getPlayerById: db.prepare('SELECT * FROM players WHERE id = ?'),
  insertPlayer: db.prepare('INSERT INTO players (id, event_id, name) VALUES (?, ?, ?)'),
  deletePlayer: db.prepare('DELETE FROM players WHERE id = ? AND event_id = ?'),

  // Bets
  getBetsByEvent: db.prepare('SELECT * FROM bets WHERE event_id = ? ORDER BY timestamp DESC'),
  getBetsByPlayer: db.prepare('SELECT * FROM bets WHERE event_id = ? AND player_id = ?'),
  getBetsByUser: db.prepare('SELECT b.*, e.name as event_name, e.share_code, e.status as event_status, e.winner_id, p.name as player_name FROM bets b JOIN events e ON b.event_id = e.id JOIN players p ON b.player_id = p.id WHERE b.user_id = ? ORDER BY b.timestamp DESC'),
  getTotalPool: db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE event_id = ?'),
  getPlayerPool: db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM bets WHERE event_id = ? AND player_id = ?'),
  getBetCount: db.prepare('SELECT COUNT(*) as count FROM bets WHERE event_id = ?'),
  getPlayerCount: db.prepare('SELECT COUNT(*) as count FROM players WHERE event_id = ?'),
  insertBet: db.prepare('INSERT INTO bets (id, event_id, bettor_name, player_id, user_id, amount) VALUES (?, ?, ?, ?, ?, ?)'),
  deleteBet: db.prepare('DELETE FROM bets WHERE id = ? AND event_id = ?'),
  deleteBetsByPlayer: db.prepare('DELETE FROM bets WHERE event_id = ? AND player_id = ?'),
  markBetPaid: db.prepare('UPDATE bets SET paid = ? WHERE id = ? AND event_id = ?'),

  // Users
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  getUserByToken: db.prepare('SELECT * FROM users WHERE token = ?'),
  getUserByNickname: db.prepare('SELECT * FROM users WHERE nickname = ?'),
  getUserByGoogleId: db.prepare('SELECT * FROM users WHERE google_id = ?'),
  getAllUsers: db.prepare('SELECT * FROM users ORDER BY created_at DESC'),
  insertUser: db.prepare('INSERT INTO users (id, nickname, token, avatar_emoji) VALUES (?, ?, ?, ?)'),
  insertGoogleUser: db.prepare('INSERT INTO users (id, nickname, token, google_id, email, avatar_url) VALUES (?, ?, ?, ?, ?, ?)'),
  updateUserGoogle: db.prepare('UPDATE users SET email = ?, avatar_url = ?, nickname = ? WHERE google_id = ?'),
  updateUserAvatar: db.prepare('UPDATE users SET avatar_emoji = ? WHERE id = ?'),

  // Photos
  getPhotosByEvent: db.prepare('SELECT p.*, u.nickname as uploader_name, u.avatar_url as uploader_avatar FROM event_photos p JOIN users u ON p.user_id = u.id WHERE p.event_id = ? ORDER BY p.created_at DESC'),
  insertPhoto: db.prepare('INSERT INTO event_photos (id, event_id, user_id, url, thumbnail_url, caption) VALUES (?, ?, ?, ?, ?, ?)'),
  deletePhoto: db.prepare('DELETE FROM event_photos WHERE id = ? AND user_id = ?'),

  // Tournaments
  insertTournament: db.prepare('INSERT INTO tournaments (id, name, share_code, creator_id) VALUES (?, ?, ?, ?)'),
  getTournamentById: db.prepare('SELECT * FROM tournaments WHERE id = ?'),
  getTournamentByCode: db.prepare('SELECT * FROM tournaments WHERE share_code = ?'),
  getAllTournaments: db.prepare('SELECT * FROM tournaments ORDER BY created_at DESC'),
  getEventsByTournament: db.prepare('SELECT * FROM events WHERE tournament_id = ? ORDER BY created_at ASC'),
  updateTournamentStatus: db.prepare('UPDATE tournaments SET status = ? WHERE id = ?'),
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
    players,
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
  stmts.insertEvent.run(eventData);
  for (const p of playerNames) {
    stmts.insertPlayer.run(p.id, eventData.id, p.name);
  }
});

export function addPlayer(eventId, playerId, name) {
  stmts.insertPlayer.run(playerId, eventId, name);
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

export function finishEvent(eventId, winnerId) {
  stmts.updateEventWinner.run('finished', winnerId, eventId);
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

// ── Users ────────────────────────────────────────────
export function createUser(id, nickname, token, avatarEmoji) {
  stmts.insertUser.run(id, nickname, token, avatarEmoji);
}

export function findOrCreateGoogleUser(googleId, email, name, avatarUrl, token) {
  const existing = stmts.getUserByGoogleId.get(googleId);
  if (existing) {
    stmts.updateUserGoogle.run(email, avatarUrl, name, googleId);
    return { ...existing, email, avatar_url: avatarUrl, nickname: name };
  }
  const id = crypto.randomUUID();
  stmts.insertGoogleUser.run(id, name, token, googleId, email, avatarUrl);
  return { id, nickname: name, token, google_id: googleId, email, avatar_url: avatarUrl };
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

export function getUserBets(userId) {
  return stmts.getBetsByUser.all(userId);
}

// ── Photos ───────────────────────────────────────────
export function getPhotosByEvent(eventId) {
  return stmts.getPhotosByEvent.all(eventId);
}

export function addPhoto(id, eventId, userId, url, thumbnailUrl, caption) {
  stmts.insertPhoto.run(id, eventId, userId, url, thumbnailUrl || null, caption || null);
}

export function deletePhoto(photoId, userId) {
  stmts.deletePhoto.run(photoId, userId);
}

export function getLeaderboard() {
  // For each user, calculate total bet, total won, profit, events participated
  const users = stmts.getAllUsers.all();
  const events = stmts.getAllEvents.all();

  return users.map(user => {
    const userBets = stmts.getBetsByUser.all(user.id);
    let totalBet = 0;
    let totalWon = 0;
    let wins = 0;
    let losses = 0;
    const eventsPlayed = new Set();

    for (const bet of userBets) {
      totalBet += bet.amount;
      eventsPlayed.add(bet.event_id);

      if (bet.event_status === 'finished') {
        if (bet.player_id === bet.winner_id) {
          // Won this bet — calculate winnings
          const event = events.find(e => e.id === bet.event_id);
          if (event) {
            const eventTotalPool = stmts.getTotalPool.get(event.id).total;
            const effectivePool = eventTotalPool * (event.payout_percent / 100);
            const winnerPool = stmts.getPlayerPool.get(event.id, bet.winner_id).total;
            const odds = winnerPool > 0 ? effectivePool / winnerPool : 0;
            totalWon += bet.amount * odds;
            wins++;
          }
        } else {
          losses++;
        }
      }
    }

    const profit = totalWon - totalBet;
    const roi = totalBet > 0 ? ((profit / totalBet) * 100) : 0;

    const finishedCount = wins + losses;
    const winRate = finishedCount > 0 ? Math.round((wins / finishedCount) * 100) : 0;

    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar_emoji,
      totalBet: Math.round(totalBet),
      totalWon: Math.round(totalWon),
      profit: Math.round(profit),
      roi: +roi.toFixed(1),
      wins,
      losses,
      winRate,
      eventsPlayed: eventsPlayed.size,
      totalBets: userBets.length
    };
  }).sort((a, b) => b.profit - a.profit);
}

export { db };

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
    const finishedRounds = rounds.filter(r => r.status === 'finished');
    return {
      id: t.id,
      name: t.name,
      shareCode: t.share_code,
      status: t.status,
      creatorId: t.creator_id,
      createdAt: t.created_at,
      roundCount: rounds.length,
      finishedCount: finishedRounds.length
    };
  });
}

export function getFullTournament(idOrCode) {
  let tournament = stmts.getTournamentById.get(idOrCode);
  if (!tournament) tournament = stmts.getTournamentByCode.get(idOrCode);
  if (!tournament) return null;

  const rawRounds = stmts.getEventsByTournament.all(tournament.id);
  const rounds = rawRounds.map(e => {
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
      betCount
    };
  });

  // Collect all unique player names across rounds
  const allPlayers = new Set();
  rounds.forEach(r => r.players.forEach(p => allPlayers.add(p.name)));

  return {
    id: tournament.id,
    name: tournament.name,
    shareCode: tournament.share_code,
    status: tournament.status,
    creatorId: tournament.creator_id,
    createdAt: tournament.created_at,
    rounds,
    players: [...allPlayers],
    settlement: getTournamentNetSettlement(tournament.id)
  };
}

export function getTournamentNetSettlement(tournamentId) {
  const rounds = stmts.getEventsByTournament.all(tournamentId);
  const finishedRounds = rounds.filter(r => r.status === 'finished' && r.winner_id);

  // Calculate net balance per user (by bettor_name since not all bettors may have accounts)
  const balances = {}; // { bettorName: net amount }

  for (const round of finishedRounds) {
    const bets = stmts.getBetsByEvent.all(round.id);
    const totalPool = stmts.getTotalPool.get(round.id).total;
    const effectivePool = totalPool * (round.payout_percent / 100);
    const winnerPool = stmts.getPlayerPool.get(round.id, round.winner_id).total;
    const odds = winnerPool > 0 ? effectivePool / winnerPool : 0;

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

      transfers.push({
        from: debtor.name,
        fromUserId: debtor.userId,
        to: creditor.name,
        toUserId: creditor.userId,
        amount: transfer,
        toSwish: swishNumber
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

export function settleTournament(tournamentId) {
  stmts.updateTournamentStatus.run('settled', tournamentId);
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
    netProfit: Math.round(totalWon - totalLost),
    streak: streak,
    streakType: streakType || 'none'
  };
}
