import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { OAuth2Client } from 'google-auth-library';
import * as db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Serve frontend in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// ── HTTP server + WebSocket ──────────────────────────
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Track clients per event
const eventClients = new Map(); // eventId/code → Set<ws>

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const eventCode = url.searchParams.get('event');

  if (eventCode) {
    if (!eventClients.has(eventCode)) {
      eventClients.set(eventCode, new Set());
    }
    eventClients.get(eventCode).add(ws);

    ws.on('close', () => {
      eventClients.get(eventCode)?.delete(ws);
      if (eventClients.get(eventCode)?.size === 0) {
        eventClients.delete(eventCode);
      }
    });
  }

  ws.on('error', () => {});
});

function broadcastToEvent(shareCode, message) {
  const clients = eventClients.get(shareCode);
  if (!clients) return;
  const data = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  }
}

// ── Helpers ──────────────────────────────────────────
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function generateShareCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

function verifyPin(pin) {
  const stored = db.getAdminPin();
  return stored && hashPin(pin) === stored;
}

// Get user from request token
function getUserFromToken(req) {
  const token = req.headers['x-user-token'];
  if (!token) return null;
  return db.getUserByToken(token);
}

// Check if user is creator of event OR has valid PIN
function verifyEventAdmin(req, event) {
  // Check creator token first
  const user = getUserFromToken(req);
  if (user && event.creator_id === user.id) return true;
  // Fall back to PIN
  const { pin } = req.body;
  if (pin && verifyPin(pin)) return true;
  return false;
}

// ── Config ──────────────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID });
});

// ── Admin PIN ────────────────────────────────────────
app.post('/api/admin/setup', (req, res) => {
  const { pin } = req.body;
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN måste vara exakt 4 siffror' });
  }
  db.setAdminPin(hashPin(pin));
  res.json({ ok: true });
});

app.post('/api/admin/verify', (req, res) => {
  const { pin } = req.body;
  const stored = db.getAdminPin();
  if (!stored) return res.json({ verified: false, needsSetup: true });
  res.json({ verified: hashPin(pin) === stored });
});

app.get('/api/admin/status', (req, res) => {
  res.json({ hasPin: !!db.getAdminPin() });
});

// ── Users ────────────────────────────────────────────
app.post('/api/users/register', (req, res) => {
  const { nickname, avatarEmoji } = req.body;
  if (!nickname || nickname.trim().length < 2) {
    return res.status(400).json({ error: 'Nickname måste vara minst 2 tecken' });
  }

  const existing = db.getUserByNickname(nickname.trim());
  if (existing) {
    return res.status(400).json({ error: 'Det namnet är redan taget' });
  }

  const id = generateId();
  const token = crypto.randomBytes(32).toString('hex');
  const emoji = avatarEmoji || ['🎲','🎯','🏆','⚡','🔥','🎰','💎','🃏','🎱','🏌️'][Math.floor(Math.random() * 10)];

  db.createUser(id, nickname.trim(), token, emoji);

  res.json({ id, nickname: nickname.trim(), token, avatar: emoji, swishNumber: null });
});

app.post('/api/users/login', (req, res) => {
  const { nickname } = req.body;
  const user = db.getUserByNickname(nickname?.trim());
  if (!user) {
    return res.status(404).json({ error: 'Ingen användare med det namnet. Registrera dig först!' });
  }
  // Return token for the user (simple system — no passwords)
  res.json({ id: user.id, nickname: user.nickname, token: user.token, avatar: user.avatar_emoji, avatarUrl: user.avatar_url, email: user.email });
});

app.get('/api/users/me', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'Ej inloggad' });
  const user = db.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Ogiltig token' });
  res.json({ id: user.id, nickname: user.nickname, avatar: user.avatar_emoji, avatarUrl: user.avatar_url, email: user.email });
});

app.get('/api/users/me/bets', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'Ej inloggad' });
  const user = db.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Ogiltig token' });

  const bets = db.getUserBets(user.id);
  res.json(bets.map(b => ({
    id: b.id,
    eventName: b.event_name,
    eventCode: b.share_code,
    eventStatus: b.event_status,
    playerName: b.player_name,
    amount: b.amount,
    timestamp: b.timestamp,
    won: b.event_status === 'finished' && b.player_id === b.winner_id
  })));
});

app.put('/api/users/me/avatar', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'Ej inloggad' });
  const user = db.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Ogiltig token' });

  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'Emoji krävs' });
  db.updateUserAvatar(user.id, emoji);
  res.json({ ok: true, avatar: emoji });
});

// ── Google Auth ──────────────────────────────────────
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing credential' });
  if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google auth not configured' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    const token = crypto.randomBytes(32).toString('hex');
    const user = db.findOrCreateGoogleUser(googleId, email, name, picture, token);

    res.json({
      id: user.id,
      nickname: user.nickname,
      token: user.token,
      avatar: user.avatar_emoji || '🎲',
      avatarUrl: user.avatar_url,
      email: user.email,
      googleLinked: true
    });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// ── Photos ───────────────────────────────────────────
app.get('/api/events/:code/photos', (req, res) => {
  const event = db.getEventByCode(req.params.code);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const photos = db.getPhotosByEvent(event.id);
  res.json(photos.map(p => ({
    id: p.id,
    url: p.url,
    thumbnailUrl: p.thumbnail_url,
    caption: p.caption,
    uploaderName: p.uploader_name,
    uploaderAvatar: p.uploader_avatar,
    createdAt: p.created_at
  })));
});

app.post('/api/events/:code/photos', async (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Login required' });

  const event = db.getEventByCode(req.params.code);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const { imageData, caption } = req.body;
  if (!imageData) return res.status(400).json({ error: 'No image data' });

  try {
    // Upload to Cloudinary
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ error: 'Photo storage not configured' });
    }

    const timestamp = Math.round(Date.now() / 1000);
    const folder = `betpals/${event.share_code}`;
    const signStr = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(signStr).digest('hex');

    const formData = new URLSearchParams();
    formData.append('file', imageData);
    formData.append('folder', folder);
    formData.append('timestamp', timestamp);
    formData.append('api_key', apiKey);
    formData.append('signature', signature);

    const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData
    });

    if (!cloudRes.ok) throw new Error('Cloudinary upload failed');
    const cloudData = await cloudRes.json();

    const photoId = generateId();
    const url = cloudData.secure_url;
    const thumbUrl = url.replace('/upload/', '/upload/w_300,h_300,c_fill/');

    db.addPhoto(photoId, event.id, user.id, url, thumbUrl, caption);

    broadcastToEvent(event.share_code, {
      type: 'photo_added',
      photo: { id: photoId, url, thumbnailUrl: thumbUrl, caption, uploaderName: user.nickname }
    });

    res.json({ id: photoId, url, thumbnailUrl: thumbUrl });
  } catch (err) {
    console.error('Photo upload error:', err.message);
    res.status(500).json({ error: 'Photo upload failed' });
  }
});

app.delete('/api/events/:code/photos/:photoId', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Login required' });
  db.deletePhoto(req.params.photoId, user.id);
  res.json({ ok: true });
});

app.get('/api/users/me/stats', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'Ej inloggad' });
  const user = db.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Ogiltig token' });
  res.json(db.getUserStats(user.id));
});

// ── Leaderboard ──────────────────────────────────────
app.get('/api/leaderboard', (req, res) => {
  res.json(db.getLeaderboard());
});

// ── Events ───────────────────────────────────────────
app.get('/api/events', (req, res) => {
  const includeAll = req.query.all === '1';
  res.json(db.getEventSummaries(includeAll));
});

app.post('/api/events', (req, res) => {
  const { pin, name, date, payoutPercent, minBet, maxBet, players, swishNumber, tournamentId } = req.body;
  
  // Allow creation with user token OR admin PIN
  const user = getUserFromToken(req);
  const hasPin = pin && verifyPin(pin);
  if (!user && !hasPin) {
    return res.status(403).json({ error: 'Logga in eller ange admin-PIN för att skapa event' });
  }
  if (!name) return res.status(400).json({ error: 'Namn krävs' });

  const eventData = {
    id: generateId(),
    name,
    date: date || new Date().toISOString().split('T')[0],
    status: 'open',
    shareCode: generateShareCode(),
    payoutPercent: Math.min(100, Math.max(0, Number(payoutPercent) || 100)),
    minBet: Number(minBet) || 10,
    maxBet: Number(maxBet) || 10000,
    creatorId: user ? user.id : null,
    swishNumber: swishNumber ? swishNumber.replace(/[^0-9]/g, '') : null,
    tournamentId: tournamentId || null
  };

  const playerData = (players || []).map(p => ({ id: generateId(), name: p }));
  db.createEvent(eventData, playerData);

  const full = db.getFullEvent(eventData.id);
  res.json(full);
});

app.get('/api/events/:idOrCode', (req, res) => {
  const event = db.getFullEvent(req.params.idOrCode);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  res.json(event);
});

// ── QR Code ──────────────────────────────────────────
app.get('/api/events/:idOrCode/qr', async (req, res) => {
  const event = db.getFullEvent(req.params.idOrCode);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });

  const baseUrl = req.query.baseUrl || `${req.protocol}://${req.get('host').replace('3001', '5173')}`;
  const url = `${baseUrl}/?page=event&code=${event.shareCode}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: { dark: '#FFD700', light: '#07070e' }
    });
    res.json({ qr: qrDataUrl, url });
  } catch (err) {
    res.status(500).json({ error: 'Kunde inte generera QR-kod' });
  }
});

// Tournament QR
app.get('/api/tournaments/:code/qr', async (req, res) => {
  const tournament = db.getTournamentByCode(req.params.code);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });

  const baseUrl = req.query.baseUrl || `${req.protocol}://${req.get('host').replace('3001', '5173')}`;
  const url = `${baseUrl}/?page=tournament&code=${tournament.share_code}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: { dark: '#FFD700', light: '#07070e' }
    });
    res.json({ qr: qrDataUrl, url });
  } catch (err) {
    res.status(500).json({ error: 'Kunde inte generera QR-kod' });
  }
});

// ── Players ──────────────────────────────────────────
app.post('/api/events/:id/players', (req, res) => {
  const { pin, name } = req.body;
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (!verifyEventAdmin(req, event)) return res.status(403).json({ error: 'Ingen behörighet' });
  if (!name) return res.status(400).json({ error: 'Spelarnamn krävs' });

  const playerId = generateId();
  db.addPlayer(req.params.id, playerId, name);

  broadcastToEvent(event.share_code, { type: 'player_added', eventCode: event.share_code });
  res.json({ id: playerId, name });
});

app.delete('/api/events/:id/players/:playerId', (req, res) => {
  const { pin } = req.body;
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (!verifyEventAdmin(req, event)) return res.status(403).json({ error: 'Ingen behörighet' });

  db.removePlayer(req.params.id, req.params.playerId);
  broadcastToEvent(event.share_code, { type: 'player_removed', eventCode: event.share_code });
  res.json({ ok: true });
});

// ── Bets ─────────────────────────────────────────────
app.post('/api/events/:idOrCode/bets', (req, res) => {
  const event = db.getFullEvent(req.params.idOrCode);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (event.status !== 'open') {
    return res.status(400).json({ error: 'Bettning är stängd för detta event' });
  }

  const { bettorName, playerId, amount } = req.body;
  if (!bettorName) return res.status(400).json({ error: 'Ditt namn krävs' });
  if (!playerId) return res.status(400).json({ error: 'Välj en spelare' });
  if (!event.players.find(p => p.id === playerId)) {
    return res.status(400).json({ error: 'Spelare finns inte' });
  }

  const betAmount = Number(amount);
  if (!betAmount || betAmount <= 0) return res.status(400).json({ error: 'Ogiltigt belopp' });
  if (betAmount < event.minBet) return res.status(400).json({ error: `Minsta insats är ${event.minBet} kr` });
  if (betAmount > event.maxBet) return res.status(400).json({ error: `Högsta insats är ${event.maxBet} kr` });

  // Get user from token if provided
  let userId = null;
  const token = req.headers['x-user-token'];
  if (token) {
    const user = db.getUserByToken(token);
    if (user) userId = user.id;
  }

  const betId = generateId();
  db.addBet(betId, event.id, bettorName, playerId, betAmount, userId);

  // Broadcast updated odds + bet notification
  const updated = db.getFullEvent(event.shareCode);
  const playerName = event.players.find(p => p.id === playerId)?.name || '?';
  broadcastToEvent(event.shareCode, {
    type: 'odds_update',
    eventCode: event.shareCode,
    odds: updated.odds,
    totalPool: updated.totalPool,
    betCount: updated.bets.length,
    // Notification data
    notification: {
      type: 'bet_placed',
      bettor: bettorName,
      player: playerName,
      amount: betAmount
    }
  });

  res.json({ id: betId, bettorName, playerId, amount: betAmount });
});

app.post('/api/events/:id/bets/:betId/paid', (req, res) => {
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });

  // Allow: event admin OR the bettor themselves
  const user = getUserFromToken(req);
  const isAdmin = verifyEventAdmin(req, event);
  
  // Check if user is the bettor
  const full = db.getFullEvent(req.params.id);
  const bet = full?.bets.find(b => b.id === req.params.betId);
  const isBettor = user && bet && bet.userId === user.id;

  if (!isAdmin && !isBettor) {
    return res.status(403).json({ error: 'Ingen behörighet' });
  }

  const { paid } = req.body;
  db.markBetPaid(req.params.id, req.params.betId, !!paid);
  res.json({ ok: true, paid: !!paid });
});

app.delete('/api/events/:id/bets/:betId', (req, res) => {
  const { pin } = req.body;
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (!verifyEventAdmin(req, event)) return res.status(403).json({ error: 'Ingen behörighet' });

  db.removeBet(req.params.id, req.params.betId);

  const updated = db.getFullEvent(event.share_code);
  broadcastToEvent(event.share_code, {
    type: 'odds_update',
    eventCode: event.share_code,
    odds: updated.odds,
    totalPool: updated.totalPool,
    betCount: updated.bets.length
  });

  res.json({ ok: true });
});

// ── Event Actions ────────────────────────────────────
app.post('/api/events/:id/lock', (req, res) => {
  const { pin } = req.body;
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (!verifyEventAdmin(req, event)) return res.status(403).json({ error: 'Ingen behörighet' });

  db.lockEvent(req.params.id);
  broadcastToEvent(event.share_code, { type: 'event_locked', eventCode: event.share_code });
  res.json({ ok: true, status: 'locked' });
});

app.post('/api/events/:id/reopen', (req, res) => {
  const { pin } = req.body;
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (!verifyEventAdmin(req, event)) return res.status(403).json({ error: 'Ingen behörighet' });

  db.reopenEvent(req.params.id);
  broadcastToEvent(event.share_code, { type: 'event_reopened', eventCode: event.share_code });
  res.json({ ok: true, status: 'open' });
});

app.post('/api/events/:id/finish', (req, res) => {
  const { pin, winnerId } = req.body;
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (!verifyEventAdmin(req, event)) return res.status(403).json({ error: 'Ingen behörighet' });
  if (!db.playerExists(winnerId)) return res.status(400).json({ error: 'Ogiltig vinnare' });

  db.finishEvent(req.params.id, winnerId);

  // Calculate payouts
  const full = db.getFullEvent(req.params.id);
  const totalPool = full.totalPool;
  const effectivePool = totalPool * (full.payoutPercent / 100);
  const winnerBets = full.bets.filter(b => b.playerId === winnerId);
  const winnerPool = winnerBets.reduce((s, b) => s + b.amount, 0);
  const odds = winnerPool > 0 ? effectivePool / winnerPool : 0;

  const payouts = winnerBets.map(b => ({
    bettorName: b.bettorName,
    betAmount: b.amount,
    winnings: +(b.amount * odds).toFixed(2),
    profit: +(b.amount * odds - b.amount).toFixed(2)
  }));

  const winnerPlayer = full.players.find(p => p.id === winnerId);

  broadcastToEvent(event.share_code, {
    type: 'event_finished',
    eventCode: event.share_code,
    winner: winnerPlayer?.name
  });

  res.json({
    ok: true,
    status: 'finished',
    winner: winnerPlayer?.name,
    totalPool,
    effectivePool,
    odds: +odds.toFixed(2),
    payouts
  });
});

app.delete('/api/events/:id', (req, res) => {
  const { pin } = req.body;
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (!verifyEventAdmin(req, event)) return res.status(403).json({ error: 'Ingen behörighet' });

  db.deleteEvent(req.params.id);
  res.json({ ok: true });
});
// ── Tournaments ──────────────────────────────────────
app.get('/api/tournaments', (req, res) => {
  res.json(db.getAllTournaments());
});

app.post('/api/tournaments', (req, res) => {
  const user = getUserFromToken(req);
  const hasPin = req.body.pin && verifyPin(req.body.pin);
  if (!user && !hasPin) {
    return res.status(403).json({ error: 'Logga in för att skapa turnering' });
  }

  const { name, players } = req.body;
  if (!name) return res.status(400).json({ error: 'Namn krävs' });

  const id = generateId();
  const shareCode = generateShareCode();
  db.createTournament(id, name.trim(), shareCode, user ? user.id : null);

  // Create first round automatically
  const eventData = {
    id: generateId(),
    name: 'Rond 1',
    date: new Date().toISOString().split('T')[0],
    status: 'open',
    shareCode: generateShareCode(),
    payoutPercent: 100,
    minBet: Number(req.body.minBet) || 10,
    maxBet: Number(req.body.maxBet) || 10000,
    creatorId: user ? user.id : null,
    swishNumber: null,
    tournamentId: id
  };

  const playerData = (players || []).map(p => ({ id: generateId(), name: p }));
  db.createEvent(eventData, playerData);

  res.json(db.getFullTournament(id));
});

app.get('/api/tournaments/:code', (req, res) => {
  const tournament = db.getFullTournament(req.params.code);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });
  res.json(tournament);
});

app.post('/api/tournaments/:id/rounds', (req, res) => {
  const tournament = db.getTournamentById(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });

  const user = getUserFromToken(req);
  const isCreator = user && tournament.creator_id === user.id;
  const hasPin = req.body.pin && verifyPin(req.body.pin);
  if (!isCreator && !hasPin) {
    return res.status(403).json({ error: 'Ingen behörighet' });
  }

  // Get players from latest round to reuse
  const full = db.getFullTournament(tournament.id);
  const roundNumber = full.rounds.length + 1;
  const lastRound = full.rounds[full.rounds.length - 1];
  const playerNames = lastRound ? lastRound.players.map(p => p.name) : (req.body.players || []);

  const eventData = {
    id: generateId(),
    name: req.body.name || 'Rond ' + roundNumber,
    date: new Date().toISOString().split('T')[0],
    status: 'open',
    shareCode: generateShareCode(),
    payoutPercent: 100,
    minBet: Number(req.body.minBet) || lastRound?.minBet || 10,
    maxBet: Number(req.body.maxBet) || lastRound?.maxBet || 10000,
    creatorId: user ? user.id : null,
    swishNumber: null,
    tournamentId: tournament.id
  };

  const playerData = playerNames.map(name => ({ id: generateId(), name }));
  db.createEvent(eventData, playerData);

  res.json(db.getFullTournament(tournament.id));
});

app.post('/api/tournaments/:id/settle', (req, res) => {
  const tournament = db.getTournamentById(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });

  const user = getUserFromToken(req);
  const isCreator = user && tournament.creator_id === user.id;
  const hasPin = req.body.pin && verifyPin(req.body.pin);
  if (!isCreator && !hasPin) {
    return res.status(403).json({ error: 'Ingen behörighet' });
  }

  db.settleTournament(req.params.id);
  res.json({ ok: true });
});

// ── SPA fallback (must be after all API routes) ──────
import { existsSync } from 'fs';
const indexHtml = path.join(distPath, 'index.html');
if (existsSync(indexHtml)) {
  app.get('{*path}', (req, res) => {
    res.sendFile(indexHtml);
  });
}

// ── Start ────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎯 BetPals server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket ready on ws://localhost:${PORT}`);
  console.log(`💾 SQLite database active`);
});
