import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import webpush from 'web-push';
import * as db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve frontend in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// ── HTTP server + WebSocket ──────────────────────────
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Track clients per event, user, and duel room
const eventClients = new Map(); // eventId/code → Set<ws>
const userClients = new Map();  // userId → Set<ws>
const duelClients = new Map();  // duelId → Set<ws>
const partyRooms = new Map();   // partyId → room object
const partyClients = new Map(); // partyId → Set<ws>
const partyCodeToId = new Map();// 4-char code → partyId

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const eventCode = url.searchParams.get('event');
  const userToken = url.searchParams.get('token');
  const duelId = url.searchParams.get('duel');
  const partyId = url.searchParams.get('party');

  let boundUserId = null;
  let boundEventCode = eventCode || null;
  const subscribedDuels = new Set();
  const subscribedParties = new Set();

  if (userToken) {
    const user = db.getUserByToken(userToken);
    if (user) {
      boundUserId = user.id;
      if (!userClients.has(user.id)) userClients.set(user.id, new Set());
      userClients.get(user.id).add(ws);
    }
  }

  function tryJoinDuel(dId) {
    if (!dId) return false;
    const duel = db.getDuelById(dId);
    if (!duel) return false;
    // Allow join if duel is table mode or caller is a participant
    if (duel.mode === 'table' || (boundUserId && (boundUserId === duel.creator_id || boundUserId === duel.opponent_id))) {
      subscribedDuels.add(dId);
      if (!duelClients.has(dId)) duelClients.set(dId, new Set());
      duelClients.get(dId).add(ws);
      return true;
    }
    return false;
  }

  function tryJoinParty(pId) {
    if (!pId) return false;
    const room = partyRooms.get(pId);
    if (!room) return false;
    // Allow join if user is in room.players
    if (boundUserId && room.players.some(p => p.id === boundUserId)) {
      subscribedParties.add(pId);
      if (!partyClients.has(pId)) partyClients.set(pId, new Set());
      partyClients.get(pId).add(ws);
      return true;
    }
    return false;
  }

  if (eventCode) {
    if (!eventClients.has(eventCode)) eventClients.set(eventCode, new Set());
    eventClients.get(eventCode).add(ws);
  }

  if (duelId) {
    tryJoinDuel(duelId);
  }

  if (partyId) {
    tryJoinParty(partyId);
  }

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'auth' && msg.token) {
        const user = db.getUserByToken(msg.token);
        if (user) {
          boundUserId = user.id;
          if (!userClients.has(user.id)) userClients.set(user.id, new Set());
          userClients.get(user.id).add(ws);
        }
      } else if ((msg.type === 'join_duel' || msg.action === 'join_duel') && (msg.duelId || msg.id)) {
        const dId = msg.duelId || msg.id;
        tryJoinDuel(dId);
      } else if ((msg.type === 'leave_duel' || msg.action === 'leave_duel') && (msg.duelId || msg.id)) {
        const dId = msg.duelId || msg.id;
        subscribedDuels.delete(dId);
        duelClients.get(dId)?.delete(ws);
        if (duelClients.get(dId)?.size === 0) duelClients.delete(dId);
      } else if ((msg.type === 'join_party' || msg.action === 'join_party') && (msg.partyId || msg.id)) {
        const pId = msg.partyId || msg.id;
        tryJoinParty(pId);
      } else if ((msg.type === 'leave_party' || msg.action === 'leave_party') && (msg.partyId || msg.id)) {
        const pId = msg.partyId || msg.id;
        subscribedParties.delete(pId);
        partyClients.get(pId)?.delete(ws);
        if (partyClients.get(pId)?.size === 0) partyClients.delete(pId);
      } else if (msg.type === 'duel_live_roll' && msg.duelId) {
        const duel = db.getDuelById(msg.duelId);
        if (duel && boundUserId && (boundUserId === duel.creator_id || boundUserId === duel.opponent_id)) {
          broadcastToDuel(msg.duelId, {
            type: 'duel_live_roll',
            duelId: msg.duelId,
            rollerId: boundUserId,
            rollerRole: msg.rollerRole,
            diceValues: msg.diceValues,
            total: msg.total
          }, ws); // exclude sender
        }
      } else if (msg.type === 'duel_live_flip' && msg.duelId) {
        const duel = db.getDuelById(msg.duelId);
        if (duel && boundUserId && (boundUserId === duel.creator_id || boundUserId === duel.opponent_id)) {
          broadcastToDuel(msg.duelId, {
            type: 'duel_live_flip',
            duelId: msg.duelId,
            flipperId: boundUserId,
            outcome: msg.outcome,
            targetDeg: msg.targetDeg
          }, ws); // exclude sender
        }
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    if (boundEventCode) {
      eventClients.get(boundEventCode)?.delete(ws);
      if (eventClients.get(boundEventCode)?.size === 0) eventClients.delete(boundEventCode);
    }
    if (boundUserId) {
      userClients.get(boundUserId)?.delete(ws);
      if (userClients.get(boundUserId)?.size === 0) userClients.delete(boundUserId);
    }
    for (const dId of subscribedDuels) {
      duelClients.get(dId)?.delete(ws);
      if (duelClients.get(dId)?.size === 0) duelClients.delete(dId);
    }
    subscribedDuels.clear();

    for (const pId of subscribedParties) {
      partyClients.get(pId)?.delete(ws);
      if (partyClients.get(pId)?.size === 0) partyClients.delete(pId);
    }
    subscribedParties.clear();
  });

  ws.on('error', () => {});
});

function broadcastToEvent(shareCode, message) {
  const clients = eventClients.get(shareCode);
  if (!clients) return;
  const data = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function broadcastToUser(userId, message) {
  const clients = userClients.get(userId);
  if (!clients) return;
  const data = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function broadcastToDuel(duelId, message, excludeWs = null) {
  const clients = duelClients.get(duelId);
  if (!clients) return;
  const data = JSON.stringify(message);
  for (const ws of clients) {
    if (ws !== excludeWs && ws.readyState === 1) ws.send(data);
  }
}

function broadcastToParty(partyId, message, excludeWs = null) {
  const clients = partyClients.get(partyId);
  if (!clients) return;
  const data = JSON.stringify(message);
  for (const ws of clients) {
    if (ws !== excludeWs && ws.readyState === 1) ws.send(data);
  }
}

function broadcastGlobal(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try { client.send(data); } catch {}
    }
  }
}

// ── Web Push Setup (VAPID) ───────────────────────────
let vapidPublicKey = db.getSetting('vapid_public_key');
let vapidPrivateKey = db.getSetting('vapid_private_key');

if (!vapidPublicKey || !vapidPrivateKey) {
  const generated = webpush.generateVAPIDKeys();
  vapidPublicKey = generated.publicKey;
  vapidPrivateKey = generated.privateKey;
  db.setSetting('vapid_public_key', vapidPublicKey);
  db.setSetting('vapid_private_key', vapidPrivateKey);
}

webpush.setVapidDetails(
  'mailto:support@betpals.se',
  vapidPublicKey,
  vapidPrivateKey
);

async function sendPushToUsers(userIds, payload) {
  if (!userIds || userIds.length === 0) return;
  const subscriptions = db.getPushSubscriptionsForUsers(userIds);
  if (!subscriptions || subscriptions.length === 0) return;

  const jsonPayload = JSON.stringify(payload);

  for (const sub of subscriptions) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    };
    try {
      await webpush.sendNotification(pushSub, jsonPayload);
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        db.deletePushSubscriptionByEndpoint(sub.endpoint);
      }
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
  let token = req.headers['x-user-token'];
  if (!token && req.headers['authorization']) {
    const parts = req.headers['authorization'].split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }
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
  res.json({});
});

// ── Admin PIN ────────────────────────────────────────
app.post('/api/admin/setup', (req, res) => {
  if (db.getAdminPin()) {
    return res.status(403).json({ error: 'PIN är redan satt' });
  }
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

// Get all users (Superadmin only)
app.post('/api/admin/users', (req, res) => {
  const { pin } = req.body;
  if (!pin || !verifyPin(pin)) return res.status(403).json({ error: 'Ingen behörighet (fel PIN)' });
  const users = db.getAllUsers();
  res.json(users);
});

// Reset user PIN (Superadmin only)
app.post('/api/admin/users/:id/reset-pin', (req, res) => {
  const { pin } = req.body;
  if (!pin || !verifyPin(pin)) return res.status(403).json({ error: 'Ingen behörighet (fel PIN)' });
  const targetUser = db.getUserById(req.params.id);
  if (!targetUser) return res.status(404).json({ error: 'Användare hittades inte' });
  
  const resetCode = String(crypto.randomInt(100000, 1000000));
  db.resetUserPin(targetUser.id, resetCode);
  res.json({
    ok: true,
    resetCode,
    message: `PIN nollställd för ${targetUser.nickname}. Engångskod: ${resetCode}`
  });
});

// ── Users ────────────────────────────────────────────
app.post('/api/users/register', (req, res) => {
  const { name, realName, nickname, swishNumber, pin, avatarEmoji } = req.body;
  const finalName = (name || realName || '').trim();
  const finalNickname = (nickname || '').trim();

  if (!finalName || finalName.length < 2) {
    return res.status(400).json({ error: 'Ange ditt riktiga för- och efternamn (minst 2 tecken)' });
  }

  if (!finalNickname || finalNickname.length < 2) {
    return res.status(400).json({ error: 'Bettarnamnet måste vara minst 2 tecken' });
  }

  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'Välj en 4-siffrig personlig PIN-kod (exakt 4 siffror)' });
  }

  const existingNick = db.getUserByNickname(finalNickname);
  if (existingNick) {
    return res.status(400).json({ error: 'Detta bettarnamn är redan taget. Välj ett annat!' });
  }

  const cleanSwish = swishNumber ? swishNumber.replace(/[^0-9]/g, '') : null;
  if (cleanSwish) {
    if (cleanSwish.length < 8) {
      return res.status(400).json({ error: 'Ogiltigt Swish-nummer' });
    }
    const existingSwish = db.getUserBySwish(cleanSwish);
    if (existingSwish) {
      return res.status(400).json({ error: 'Detta Swish-nummer är redan registrerat på en användare' });
    }
  }

  const id = generateId();
  const token = crypto.randomBytes(32).toString('hex');
  const emoji = avatarEmoji || '👤';

  db.createUser(id, finalNickname, token, emoji, finalName, cleanSwish, pin);

  res.json({
    id,
    nickname: finalNickname,
    realName: finalName,
    swishNumber: cleanSwish,
    token,
    avatar: emoji,
    avatarUrl: null
  });
});

// Rate limiting for PIN verification (in-memory tracker with 15 min lockout after 5 fails)
const pinAttempts = new Map(); // userId -> { count: number, lockedUntil: number }

function checkPinRateLimit(userId) {
  const record = pinAttempts.get(userId);
  if (!record) return { allowed: true };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const minutesLeft = Math.max(1, Math.ceil((record.lockedUntil - Date.now()) / 60000));
    return { allowed: false, minutesLeft };
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    pinAttempts.delete(userId);
    return { allowed: true };
  }
  return { allowed: true, count: record.count };
}

function recordFailedPinAttempt(userId) {
  const record = pinAttempts.get(userId) || { count: 0, lockedUntil: 0 };
  record.count++;
  if (record.count >= 5) {
    record.lockedUntil = Date.now() + 15 * 60 * 1000;
  }
  pinAttempts.set(userId, record);
  return record;
}

function clearPinAttempts(userId) {
  pinAttempts.delete(userId);
}

// URL & Image Sanitization Helpers
function isValidImageUrl(str) {
  if (typeof str !== 'string') return false;
  const s = str.trim();
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

function isValidHttpUrl(str) {
  if (typeof str !== 'string') return false;
  const s = str.trim();
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

app.post('/api/users/login', (req, res) => {
  const { identifier, nickname, swishNumber, pin } = req.body;
  const query = (identifier || nickname || swishNumber || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Ange ditt Bettarnamn eller mobilnummer' });
  }

  const user = db.getUserByNicknameOrSwish(query);
  if (!user) {
    return res.status(404).json({ error: 'Ingen användare hittades med det namnet eller mobilnumret. Skapa profil först!' });
  }

  // Check if admin reset the PIN
  if (user.needs_pin_reset) {
    return res.status(200).json({
      needsPinReset: true,
      nickname: user.nickname,
      message: 'Din PIN-kod har nollställts av admin. Ange din 6-siffriga engångskod och välj en ny PIN!'
    });
  }

  // Check PIN if user has a PIN configured
  if (user.pin_hash) {
    const limitCheck = checkPinRateLimit(user.id);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: `För många felaktiga PIN-försök. Kontot är tillfälligt spärrat i ${limitCheck.minutesLeft} minuter.`
      });
    }

    if (!pin || !db.verifyUserPin(user, pin)) {
      const rec = recordFailedPinAttempt(user.id);
      if (rec.count >= 5) {
        return res.status(429).json({
          error: 'För många felaktiga PIN-försök. Kontot har spärrats i 15 minuter.'
        });
      }
      return res.status(401).json({ error: 'Felaktig 4-siffrig PIN-kod. Försök igen!' });
    }

    clearPinAttempts(user.id);
  }

  res.json({
    id: user.id,
    nickname: user.nickname,
    realName: user.real_name,
    swishNumber: user.swish_number,
    token: user.token,
    avatar: user.avatar_emoji,
    avatarUrl: user.avatar_url,
    email: user.email
  });
});

// Complete PIN reset after admin reset
app.post('/api/users/reset-pin', (req, res) => {
  const { identifier, userId, resetCode, newPin } = req.body;
  const cleanCode = (resetCode !== undefined && resetCode !== null) ? String(resetCode).trim() : '';
  const cleanPin = (newPin !== undefined && newPin !== null) ? String(newPin).trim() : '';

  if (!cleanCode || !/^\d{6}$/.test(cleanCode)) {
    return res.status(400).json({ error: 'Ange den 6-siffriga engångskoden från admin' });
  }
  if (!cleanPin || !/^\d{4}$/.test(cleanPin)) {
    return res.status(400).json({ error: 'Ny PIN måste vara exakt 4 siffror' });
  }

  let user = null;
  if (identifier) {
    user = db.getUserByNicknameOrSwish(String(identifier).trim());
  } else if (userId) {
    user = db.getUserById(userId);
  }

  if (!user) return res.status(404).json({ error: 'Användare hittades inte' });
  if (!user.needs_pin_reset) {
    return res.status(400).json({ error: 'Kontot är inte i återställningsläge' });
  }

  if (!user.reset_code || user.reset_code !== cleanCode) {
    return res.status(401).json({ error: 'Felaktig 6-siffrig engångskod' });
  }

  if (user.reset_code_expires && new Date(user.reset_code_expires) < new Date()) {
    return res.status(400).json({ error: 'Engångskoden har löpt ut. Be admin nollställa PIN på nytt.' });
  }

  const newToken = crypto.randomUUID();
  db.setUserPin(user.id, cleanPin, newToken);
  clearPinAttempts(user.id);
  const updated = db.getUserById(user.id);
  res.json({
    id: updated.id,
    nickname: updated.nickname,
    realName: updated.real_name,
    swishNumber: updated.swish_number,
    token: updated.token,
    avatar: updated.avatar_emoji,
    avatarUrl: updated.avatar_url,
    email: updated.email
  });
});

// Change PIN when logged in
app.post('/api/users/change-pin', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'Ej inloggad' });
  const user = db.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Ogiltig token' });

  const { currentPin, newPin } = req.body;
  if (!newPin || !/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ error: 'Ny PIN måste vara exakt 4 siffror' });
  }

  if (user.pin_hash) {
    const limitCheck = checkPinRateLimit(user.id);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: `För många felaktiga PIN-försök. Kontot är tillfälligt spärrat i ${limitCheck.minutesLeft} minuter.`
      });
    }

    if (!currentPin || !db.verifyUserPin(user, currentPin)) {
      const rec = recordFailedPinAttempt(user.id);
      if (rec.count >= 5) {
        return res.status(429).json({
          error: 'För många felaktiga PIN-försök. Kontot har spärrats i 15 minuter.'
        });
      }
      return res.status(401).json({ error: 'Nuvarande PIN-kod är felaktig' });
    }

    clearPinAttempts(user.id);
  }

  db.setUserPin(user.id, newPin);
  res.json({ ok: true, message: 'PIN-koden har ändrats! 🔒' });
});

// WebAuthn / FaceID / TouchID (Disabled temporarily for security hardening)
const webauthnChallenges = new Map();

app.post('/api/auth/webauthn/register-options', (req, res) => {
  res.status(503).json({ error: 'Biometrisk registrering (FaceID / TouchID) uppdateras för utökad FIDO2-säkerhet och är tillfälligt inaktiverad. Använd PIN-kod.' });
});

app.post('/api/auth/webauthn/register-verify', (req, res) => {
  res.status(503).json({ error: 'Biometrisk registrering är tillfälligt inaktiverad av säkerhetsskäl.' });
});

app.post('/api/auth/webauthn/login-options', (req, res) => {
  res.status(503).json({ error: 'Biometrisk inloggning är tillfälligt inaktiverad av säkerhetsskäl.' });
});

app.post('/api/auth/webauthn/login-verify', (req, res) => {
  res.status(503).json({ error: 'Biometrisk inloggning (FaceID / TouchID) uppdateras för högre säkerhet och är tillfälligt inaktiverad. Vänligen logga in med din 4-siffriga PIN-kod eller lösenord.' });
});

app.get('/api/users/me/credentials', (req, res) => {
  res.json({ count: 0, hasBiometric: false, disabledForSecurity: true });
});

app.put('/api/users/me/profile', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'Ej inloggad' });
  const user = db.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Ogiltig token' });

  const { name, realName, nickname, swishNumber } = req.body;
  if (name || realName) {
    db.updateUserRealName(user.id, (name || realName).trim());
  }
  if (nickname && nickname.trim().length >= 2) {
    const existing = db.getUserByNickname(nickname.trim());
    if (existing && existing.id !== user.id) {
      return res.status(400).json({ error: 'Detta bettarnamn är redan upptaget' });
    }
    db.updateUserNickname(user.id, nickname.trim());
  }
  if (swishNumber !== undefined && swishNumber !== null && String(swishNumber).trim() !== '') {
    const cleanSwish = String(swishNumber).replace(/[^0-9]/g, '');
    if (cleanSwish.length < 8) {
      return res.status(400).json({ error: 'Ogiltigt Swish-nummer (minst 8 siffror)' });
    }
    const existingSwish = db.getUserBySwish(cleanSwish);
    if (existingSwish && existingSwish.id !== user.id) {
      return res.status(400).json({ error: 'Detta Swish-nummer är redan registrerat på en annan användare' });
    }
    db.updateUserSwish(user.id, cleanSwish);
  } else if (swishNumber === null || (swishNumber !== undefined && String(swishNumber).trim() === '')) {
    db.updateUserSwish(user.id, null);
  }

  const updated = db.getUserById(user.id);
  res.json({
    ok: true,
    user: {
      id: updated.id,
      nickname: updated.nickname,
      realName: updated.real_name,
      swishNumber: updated.swish_number,
      avatar: updated.avatar_emoji,
      avatarUrl: updated.avatar_url
    }
  });
});

app.put('/api/users/me/swish', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'Ej inloggad' });
  const user = db.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Ogiltig token' });

  const raw = req.body.swishNumber;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const cleanSwish = String(raw).replace(/[^0-9]/g, '');
    if (cleanSwish.length < 8) {
      return res.status(400).json({ error: 'Ogiltigt Swish-nummer (minst 8 siffror)' });
    }
    const existingSwish = db.getUserBySwish(cleanSwish);
    if (existingSwish && existingSwish.id !== user.id) {
      return res.status(400).json({ error: 'Detta Swish-nummer är redan registrerat på en annan användare' });
    }
    db.updateUserSwish(user.id, cleanSwish);
    res.json({ ok: true, swishNumber: cleanSwish });
  } else {
    db.updateUserSwish(user.id, null);
    res.json({ ok: true, swishNumber: null });
  }
});

app.get('/api/users/me', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'Ej inloggad' });
  const user = db.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Ogiltig token' });
  res.json({
    id: user.id,
    nickname: user.nickname,
    realName: user.real_name,
    swishNumber: user.swish_number,
    avatar: user.avatar_emoji,
    avatarUrl: user.avatar_url,
    email: user.email
  });
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

app.put('/api/users/me/avatar', async (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'Ej inloggad' });
  const user = db.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Ogiltig token' });

  const { imageData } = req.body;
  if (!imageData) return res.status(400).json({ error: 'Bilddata saknas' });
  if (!isValidImageUrl(imageData)) {
    return res.status(400).json({ error: 'Ogiltigt bildformat. Måste vara data:image/ eller giltig http/https-URL.' });
  }

  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    
    let url = '';

    if (cloudName && apiKey && apiSecret) {
      const timestamp = Math.round(Date.now() / 1000);
      const folder = `betpals/avatars`;
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

      if (!cloudRes.ok) {
        const errText = await cloudRes.text();
        console.error('Cloudinary Error Data:', errText);
        throw new Error('Cloudinary fel: ' + errText);
      }
      const cloudData = await cloudRes.json();
      // Use Cloudinary transformation for a perfect square avatar thumbnail natively
      url = cloudData.secure_url.replace('/upload/', '/upload/w_200,h_200,c_fill,g_face/');
    } else {
      // Fallback
      url = imageData;
    }

    db.updateUserAvatarUrl(user.id, url);
    res.json({ ok: true, avatarUrl: url });
  } catch (err) {
    console.error('Avatar upload error:', err.message);
    res.status(500).json({ error: 'Kunde inte uppdatera profilbilden' });
  }
});

// ── Tournament Photos ─────────────────────────────────
app.get('/api/tournaments/:id/photos', (req, res) => {
  const tournament = db.getFullTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });
  const user = getUserFromToken(req); // Optional for fetching likes
  
  const photos = db.getPhotosByTournament(tournament.id, user ? user.id : null);
  res.json(photos.map(p => ({
    id: p.id,
    url: p.url,
    thumbnailUrl: p.thumbnail_url,
    caption: p.caption,
    userId: p.user_id,
    uploaderName: p.uploader_name,
    uploaderAvatar: p.uploader_avatar,
    createdAt: p.created_at,
    likeCount: p.like_count || 0,
    userLiked: !!p.user_liked
  })));
});

app.post('/api/tournaments/:id/photos', async (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs för att ladda upp bilder' });

  const tournament = db.getFullTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });

  const { imageData, caption } = req.body;
  if (!imageData) return res.status(400).json({ error: 'Ingen bild skickades' });
  if (!isValidImageUrl(imageData)) {
    return res.status(400).json({ error: 'Ogiltigt bildformat. Måste vara data:image/ eller giltig http/https-URL.' });
  }

  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    
    let url = '';
    let thumbUrl = '';

    // If Cloudinary is configured, use it. Otherwise, fallback to base64 inline (not recommended for prod, but good for test).
    if (cloudName && apiKey && apiSecret) {
      const timestamp = Math.round(Date.now() / 1000);
      const folder = `betpals/tournaments/${tournament.share_code}`;
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

      if (!cloudRes.ok) {
        const errText = await cloudRes.text();
        console.error('Cloudinary Error Data (Feed):', errText);
        throw new Error('Cloudinary fel: ' + errText);
      }
      const cloudData = await cloudRes.json();
      url = cloudData.secure_url;
      thumbUrl = url.replace('/upload/', '/upload/w_400,h_400,c_fill/');
    } else {
      // Fallback: Just save the raw Base64 string directly
      url = imageData;
      thumbUrl = imageData; // no thumbnailing for base64 fallback
    }

    const photoId = generateId();
    db.addTournamentPhoto(photoId, tournament.id, user.id, url, thumbUrl, caption);

    res.json({ id: photoId, url, thumbnailUrl: thumbUrl, caption, uploaderName: user.nickname, userId: user.id });
  } catch (err) {
    console.error('Photo upload error:', err.message);
    res.status(500).json({ error: 'Uppladdningen misslyckades' });
  }
});

app.delete('/api/tournaments/:id/photos/:photoId', (req, res) => {
  const user = getUserFromToken(req);
  const tournament = db.getFullTournament(req.params.id);
  
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });
  
  // Verify ownership or super admin
  const hasPin = req.body?.pin && verifyPin(req.body.pin);
  const isCreator = tournament.creatorId === user.id;
  
  // Actually, we must check if the user is the one who uploaded the photo, or if they are admin.
  // We'll let `deleteTournamentPhoto` just delete it by db logic for the user if not admin.
  // But wait, the DB delete photo statement just takes photoId.
  // We should do a fast check:
  const photos = db.getPhotosByTournament(tournament.id);
  const photo = photos.find(p => p.id === req.params.photoId);
  if (!photo) return res.status(404).json({ error: 'Bilden hittades inte' });
  
  if (photo.user_id !== user.id && !isCreator && !hasPin) {
    return res.status(403).json({ error: 'Ingen behörighet att ta bort denna bild' });
  }
  
  db.deleteTournamentPhoto(req.params.photoId);
  res.json({ ok: true });
});

app.post('/api/tournaments/:id/photos/:photoId/like', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs för att gilla bilder' });
  
  const liked = db.togglePhotoLike(req.params.photoId, user.id);
  res.json({ liked });
});

app.get('/api/users/me/stats', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.status(401).json({ error: 'Ej inloggad' });
  const user = db.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Ogiltig token' });
  res.json(db.getUserStats(user.id));
});

// ── Friends ──────────────────────────────────────────
app.get('/api/friends', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Ej inloggad' });
  res.json(db.getFriends(user.id));
});

app.post('/api/friends', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Ej inloggad' });

  const { friendId, nickname } = req.body || {};
  let target = null;
  if (friendId) {
    target = db.getUserById(friendId);
  } else if (nickname) {
    target = db.getUserByNicknameOrSwish(String(nickname).trim());
  }

  if (!target) {
    return res.status(404).json({ error: 'Kunde inte hitta användaren' });
  }

  if (target.id === user.id) {
    return res.status(400).json({ error: 'Du kan inte lägga till dig själv som vän' });
  }

  db.addFriend(user.id, target.id);
  res.json({
    ok: true,
    message: `${target.nickname} har lagts till som vän! 👥`,
    friend: {
      id: target.id,
      nickname: target.nickname,
      realName: target.real_name,
      avatarEmoji: target.avatar_emoji,
      avatarUrl: target.avatar_url
    }
  });
});

app.delete('/api/friends/:friendId', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Ej inloggad' });

  db.removeFriend(user.id, req.params.friendId);
  res.json({ ok: true, message: 'Vän borttagen' });
});

app.get('/api/users/search', (req, res) => {
  const user = getUserFromToken(req);
  const query = req.query.q || '';
  const results = db.searchUsers(query, user ? user.id : '');
  res.json(results);
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
  const { pin, name, date, payoutPercent, minBet, maxBet, players, swishNumber, tournamentId, imageUrl } = req.body || {};
  
  // Allow creation with user token OR admin PIN
  const user = getUserFromToken(req);
  const hasPin = pin && verifyPin(pin);
  if (!user && !hasPin) {
    return res.status(403).json({ error: 'Logga in eller ange admin-PIN för att skapa match' });
  }

  // If adding to a tournament, verify that the caller is tournament creator or superadmin
  if (tournamentId) {
    const tournament = db.getFullTournament(tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Turneringen hittades inte' });
    }
    const isTournamentCreator = user && tournament.creatorId === user.id;
    if (!isTournamentCreator && !hasPin) {
      return res.status(403).json({ error: 'Du har inte behörighet att lägga till matcher i denna turnering' });
    }
  }

  const finalName = (name || '').trim();
  if (!finalName || finalName.length < 2) {
    return res.status(400).json({ error: 'Ett matchnamn krävs (minst 2 tecken)' });
  }

  // Parse and deduplicate players (supports both string names and objects with imageUrl)
  const playerData = [];
  const seenNames = new Set();
  for (const p of (players || [])) {
    const pName = (typeof p === 'string' ? p : (p?.name || '')).trim();
    const pImg = (typeof p === 'object' && p?.imageUrl) ? p.imageUrl : null;
    if (pName && !seenNames.has(pName.toLowerCase())) {
      seenNames.add(pName.toLowerCase());
      playerData.push({ id: generateId(), name: pName, imageUrl: pImg });
    }
  }

  if (playerData.length < 2) {
    return res.status(400).json({ error: 'Minst 2 deltagare krävs för att skapa en match' });
  }

  const min = Math.max(1, Number(minBet) || 10);
  const max = Math.max(min, Number(maxBet) || 10000);
  const payout = payoutPercent !== undefined ? Math.min(100, Math.max(0, Number(payoutPercent))) : 100;
  const swish = swishNumber ? swishNumber.replace(/[^0-9]/g, '') : (user?.swish_number || null);

  const eventData = {
    id: generateId(),
    name: finalName,
    date: date || new Date().toISOString().split('T')[0],
    status: 'open',
    shareCode: generateShareCode(),
    payoutPercent: payout,
    minBet: min,
    maxBet: max,
    creatorId: user ? user.id : null,
    swishNumber: swish,
    tournamentId: tournamentId || null,
    isSideBet: 0,
    linkedRoundId: null,
    betMode: 'open',
    imageUrl: imageUrl || null
  };

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
  const { pin, name, imageUrl } = req.body;
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (!verifyEventAdmin(req, event)) return res.status(403).json({ error: 'Ingen behörighet' });
  
  const cleanName = (name || '').trim();
  if (!cleanName) return res.status(400).json({ error: 'Spelarnamn krävs' });

  const existingPlayers = db.getPlayersByEvent(event.id);
  if (existingPlayers.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
    return res.status(400).json({ error: 'En spelare med detta namn finns redan i matchen' });
  }

  const playerId = generateId();
  db.addPlayer(req.params.id, playerId, cleanName, imageUrl || null);

  broadcastToEvent(event.share_code, { type: 'player_added', eventCode: event.share_code });
  res.json({ id: playerId, name: cleanName, imageUrl: imageUrl || null });
});

app.put('/api/events/:id/players/:playerId/image', (req, res) => {
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (!verifyEventAdmin(req, event)) return res.status(403).json({ error: 'Ingen behörighet' });

  const player = db.getPlayerById(req.params.playerId);
  if (!player || player.event_id !== event.id) return res.status(404).json({ error: 'Spelaren hittades inte' });

  const { imageUrl } = req.body;
  db.updatePlayerImage(player.id, imageUrl || null);

  broadcastToEvent(event.share_code, { type: 'player_updated', eventCode: event.share_code });
  res.json({ ok: true, id: player.id, imageUrl: imageUrl || null });
});

app.delete('/api/events/:id/players/:playerId', (req, res) => {
  const { pin } = req.body;
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (!verifyEventAdmin(req, event)) return res.status(403).json({ error: 'Ingen behörighet' });

  const player = db.getPlayerById(req.params.playerId);
  if (!player || player.event_id !== event.id) {
    return res.status(404).json({ error: 'Spelaren hittades inte i denna match' });
  }

  db.removePlayer(req.params.id, req.params.playerId);
  broadcastToEvent(event.share_code, { type: 'player_removed', eventCode: event.share_code });
  
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

// ── Bets ─────────────────────────────────────────────
app.post('/api/events/:idOrCode/bets', (req, res) => {
  const event = db.getFullEvent(req.params.idOrCode);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (event.status !== 'open') {
    return res.status(400).json({ error: 'Bettning är stängd för detta event' });
  }

  const { playerId, amount } = req.body;
  if (!playerId) return res.status(400).json({ error: 'Välj en spelare' });
  if (!event.players.find(p => p.id === playerId)) {
    return res.status(400).json({ error: 'Spelare finns inte' });
  }

  const betAmount = Number(amount);
  if (!betAmount || betAmount <= 0) return res.status(400).json({ error: 'Ogiltigt belopp' });
  if (betAmount < event.minBet) return res.status(400).json({ error: `Minsta insats är ${event.minBet} kr` });
  if (betAmount > event.maxBet) return res.status(400).json({ error: `Högsta insats är ${event.maxBet} kr` });

  // Require user authentication
  const loggedInUser = getUserFromToken(req);
  if (!loggedInUser) {
    return res.status(401).json({ error: 'Du måste vara inloggad för att lägga ett bet' });
  }

  if (!loggedInUser.swish_number) {
    return res.status(400).json({ error: 'Du behöver ange ett Swish-nummer i din profil för att kunna lägga bets' });
  }

  const cleanBettor = (loggedInUser.real_name || loggedInUser.nickname || '').trim();
  if (!cleanBettor) {
    return res.status(400).json({ error: 'Profilen saknar namn' });
  }
  const userId = loggedInUser.id;

  const betId = generateId();
  db.addBet(betId, event.id, cleanBettor, playerId, betAmount, userId);

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
      bettor: cleanBettor,
      player: playerName,
      amount: betAmount
    }
  });

  if (event.tournamentId) {
    const t = db.getTournamentById(event.tournamentId);
    if (t) {
      broadcastToEvent(t.share_code, { type: 'tournament_updated', tournamentCode: t.share_code });
    }
  }

  res.json({ id: betId, bettorName: cleanBettor, playerId, amount: betAmount });
});

app.post('/api/events/:id/bets/:betId/paid', (req, res) => {
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });

  const full = db.getFullEvent(event.id);
  const bet = full?.bets.find(b => b.id === req.params.betId);
  if (!bet) return res.status(404).json({ error: 'Bet hittades inte' });

  const user = getUserFromToken(req);
  const isAdmin = verifyEventAdmin(req, event);
  const isBettor = user && bet.userId && bet.userId === user.id;

  if (!isAdmin && !isBettor) {
    return res.status(403).json({ error: 'Endast skaparen, admin eller spelaren själv kan markera bet som betalt' });
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

  if (event.tournament_id) {
    const t = db.getTournamentById(event.tournament_id);
    if (t) broadcastToEvent(t.share_code, { type: 'tournament_updated', tournamentCode: t.share_code });
  }

  res.json({ ok: true, status: 'locked' });
});

app.post('/api/events/:id/reopen', (req, res) => {
  const { pin } = req.body;
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (!verifyEventAdmin(req, event)) return res.status(403).json({ error: 'Ingen behörighet' });

  db.reopenEvent(req.params.id);
  broadcastToEvent(event.share_code, { type: 'event_reopened', eventCode: event.share_code });

  if (event.tournament_id) {
    const t = db.getTournamentById(event.tournament_id);
    if (t) broadcastToEvent(t.share_code, { type: 'tournament_updated', tournamentCode: t.share_code });
  }

  res.json({ ok: true, status: 'open' });
});

app.put('/api/events/:id/image', (req, res) => {
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (!verifyEventAdmin(req, event)) return res.status(403).json({ error: 'Ingen behörighet' });

  const { imageUrl } = req.body;
  db.updateEventImage(event.id, imageUrl || null);

  broadcastToEvent(event.share_code, { type: 'event_updated', eventCode: event.share_code });
  if (event.tournament_id) {
    const t = db.getTournamentById(event.tournament_id);
    if (t) broadcastToEvent(t.share_code, { type: 'tournament_updated', tournamentCode: t.share_code });
  }

  res.json({ ok: true, id: event.id, imageUrl: imageUrl || null });
});

app.post('/api/events/:id/finish', (req, res) => {
  const { pin, winnerId, winnerImageUrl } = req.body;
  const event = db.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event hittades inte' });
  if (!verifyEventAdmin(req, event)) return res.status(403).json({ error: 'Ingen behörighet' });

  const winnerPlayer = db.getPlayerById(winnerId);
  if (!winnerPlayer || winnerPlayer.event_id !== event.id) {
    return res.status(400).json({ error: 'Ogiltig vinnare för denna match' });
  }

  db.finishEvent(req.params.id, winnerId, winnerImageUrl || null);

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

  broadcastToEvent(event.share_code, {
    type: 'event_finished',
    eventCode: event.share_code,
    winner: winnerPlayer?.name,
    winnerImageUrl: winnerImageUrl || null
  });

  if (event.tournament_id) {
    const t = db.getTournamentById(event.tournament_id);
    if (t) broadcastToEvent(t.share_code, { type: 'tournament_updated', tournamentCode: t.share_code });
  }

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
  const user = getUserFromToken(req);
  res.json(db.getAllTournaments(user ? user.id : null));
});

app.post('/api/tournaments', (req, res) => {
  const body = req.body || {};
  const user = getUserFromToken(req);
  const hasPin = body.pin && verifyPin(body.pin);
  if (!user && !hasPin) {
    return res.status(403).json({ error: 'Logga in för att skapa turnering' });
  }

  const { name, players } = body;
  const finalName = (name || '').trim();
  if (!finalName || finalName.length < 2) {
    return res.status(400).json({ error: 'Ett turneringsnamn krävs (minst 2 tecken)' });
  }

  const cleanPlayers = [...new Set((players || [])
    .map(p => (typeof p === 'string' ? p : (p?.name || '')).trim())
    .filter(Boolean))];

  if (cleanPlayers.length < 2) {
    return res.status(400).json({ error: 'Minst 2 deltagare krävs för att skapa en turnering' });
  }

  const min = Math.max(1, Number(req.body.minBet) || 10);
  const max = Math.max(min, Number(req.body.maxBet) || 10000);
  const swish = req.body.swishNumber ? req.body.swishNumber.replace(/[^0-9]/g, '') : (user?.swish_number || null);

  const allowedVisibilities = ['public', 'friends', 'private'];
  const visibility = allowedVisibilities.includes(req.body.visibility) ? req.body.visibility : 'friends';

  const id = generateId();
  const shareCode = generateShareCode();
  db.createTournament(id, finalName, shareCode, user ? user.id : null, visibility);

  // Create first round automatically
  const eventData = {
    id: generateId(),
    name: 'Rond 1',
    date: new Date().toISOString().split('T')[0],
    status: 'open',
    shareCode: generateShareCode(),
    payoutPercent: 100,
    minBet: min,
    maxBet: max,
    creatorId: user ? user.id : null,
    swishNumber: swish,
    tournamentId: id,
    isSideBet: 0,
    linkedRoundId: null,
    betMode: 'open'
  };

  const playerData = cleanPlayers.map(p => ({ id: generateId(), name: p }));
  db.createEvent(eventData, playerData);

  res.json(db.getFullTournament(id));
});

app.get('/api/tournaments/:code', (req, res) => {
  const tournament = db.getFullTournament(req.params.code);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });
  res.json(tournament);
});

app.post('/api/tournaments/:id/rounds', (req, res) => {
  const tournament = db.getFullTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });

  const user = getUserFromToken(req);
  const isCreator = user && tournament.creatorId === user.id;
  const hasPin = req.body.pin && verifyPin(req.body.pin);
  if (!isCreator && !hasPin) {
    return res.status(403).json({ error: 'Ingen behörighet' });
  }

  // Get players from latest round to reuse or from request body
  const full = db.getFullTournament(tournament.id);
  const roundNumber = full.rounds.length + 1;
  const lastRound = full.rounds[full.rounds.length - 1];
  const requestedPlayers = req.body.players && req.body.players.length > 0
    ? req.body.players
    : (lastRound ? lastRound.players.map(p => p.name) : []);

  const cleanPlayers = [...new Set(requestedPlayers
    .map(p => (typeof p === 'string' ? p : (p?.name || '')).trim())
    .filter(Boolean))];

  if (cleanPlayers.length < 2) {
    return res.status(400).json({ error: 'Minst 2 deltagare krävs för en ny rond' });
  }

  const min = Math.max(1, Number(req.body.minBet) || lastRound?.minBet || 10);
  const max = Math.max(min, Number(req.body.maxBet) || lastRound?.maxBet || 10000);
  const swish = req.body.swishNumber ? req.body.swishNumber.replace(/[^0-9]/g, '') : (lastRound?.swishNumber || user?.swish_number || null);

  const eventData = {
    id: generateId(),
    name: (req.body.name || '').trim() || ('Rond ' + roundNumber),
    date: new Date().toISOString().split('T')[0],
    status: 'open',
    shareCode: generateShareCode(),
    payoutPercent: 100,
    minBet: min,
    maxBet: max,
    creatorId: user ? user.id : null,
    swishNumber: swish,
    tournamentId: tournament.id,
    isSideBet: 0,
    linkedRoundId: null,
    betMode: 'open'
  };

  const playerData = cleanPlayers.map(name => ({ id: generateId(), name }));
  db.createEvent(eventData, playerData);

  broadcastToEvent(tournament.shareCode, { type: 'tournament_updated', tournamentCode: tournament.shareCode });

  res.json(db.getFullTournament(tournament.id));
});

// Side bets
app.post('/api/tournaments/:id/sidebets', (req, res) => {
  const tournament = db.getFullTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });

  const user = getUserFromToken(req);
  const isCreator = user && tournament.creatorId === user.id;
  const hasPin = req.body.pin && verifyPin(req.body.pin);
  if (!isCreator && !hasPin) {
    return res.status(403).json({ error: 'Ingen behörighet' });
  }

  const { name, players, linkedRoundId, betMode, betAmount, imageUrl } = req.body;
  const finalName = (name || '').trim();
  if (!finalName || finalName.length < 2) {
    return res.status(400).json({ error: 'Ett namn krävs (minst 2 tecken)' });
  }

  const cleanPlayers = [...new Set((players || [])
    .map(p => (typeof p === 'string' ? p : (p?.name || '')).trim())
    .filter(Boolean))];

  if (cleanPlayers.length < 2) {
    return res.status(400).json({ error: 'Minst 2 deltagare krävs för ett sido-spel' });
  }

  const amount = Math.max(1, Number(betAmount) || 100);
  const swish = req.body.swishNumber ? req.body.swishNumber.replace(/[^0-9]/g, '') : (user?.swish_number || null);

  const eventId = generateId();
  const eventData = {
    id: eventId,
    name: finalName,
    date: new Date().toISOString().split('T')[0],
    status: betMode === 'self' ? 'locked' : 'open',
    shareCode: generateShareCode(),
    payoutPercent: 100,
    minBet: amount,
    maxBet: amount,
    creatorId: user ? user.id : null,
    swishNumber: swish,
    tournamentId: tournament.id,
    isSideBet: 1,
    linkedRoundId: linkedRoundId || null,
    betMode: betMode || 'open',
    imageUrl: imageUrl || null
  };

  const playerData = cleanPlayers.map(p => ({ id: generateId(), name: p }));
  db.createEvent(eventData, playerData);

  // For 'self' mode: auto-create bets — each player bets on themselves
  if (betMode === 'self') {
    const createdPlayers = db.getFullEvent(eventId).players;
    for (const p of createdPlayers) {
      const bettorUser = db.getUserByNickname(p.name);
      db.addBet(generateId(), eventId, p.name, p.id, amount, bettorUser ? bettorUser.id : null);
    }
  }

  broadcastToEvent(tournament.shareCode, { type: 'tournament_updated', tournamentCode: tournament.shareCode });

  res.json(db.getFullTournament(tournament.id));
});

app.post('/api/tournaments/:id/settle', (req, res) => {
  const tournament = db.getFullTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });

  const user = getUserFromToken(req);
  const isCreator = user && tournament.creatorId === user.id;
  const hasPin = req.body.pin && verifyPin(req.body.pin);
  if (!isCreator && !hasPin) {
    return res.status(403).json({ error: 'Ingen behörighet' });
  }

  db.settleTournament(req.params.id);
  broadcastToEvent(tournament.shareCode, { type: 'tournament_updated', tournamentCode: tournament.shareCode });
  res.json({ ok: true });
});

// ── Tournament Banners ───────────────────────────────
app.post('/api/tournaments/:id/banners', (req, res) => {
  const tournament = db.getFullTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });

  const user = getUserFromToken(req);
  const isCreator = user && tournament.creatorId === user.id;
  const hasPin = req.body.pin && verifyPin(req.body.pin);
  if (!isCreator && !hasPin) {
    return res.status(403).json({ error: 'Ingen behörighet' });
  }

  const { imageData, linkUrl, label } = req.body;
  if (!imageData) return res.status(400).json({ error: 'Bild krävs' });
  if (!isValidImageUrl(imageData)) {
    return res.status(400).json({ error: 'Ogiltigt bildformat. Måste vara data:image/ eller giltig http/https-URL.' });
  }
  if (linkUrl && !isValidHttpUrl(linkUrl)) {
    return res.status(400).json({ error: 'Ogiltig länk-URL. Måste börja med http:// eller https://' });
  }

  const id = generateId();
  const banners = db.getBanners(tournament.id);
  db.addBanner(id, tournament.id, imageData, linkUrl || null, label || null, banners.length);

  res.json({ ok: true, banner: { id, imageData, linkUrl, label } });
});

app.delete('/api/tournaments/:id/banners/:bannerId', (req, res) => {
  const tournament = db.getFullTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });

  const user = getUserFromToken(req);
  const isCreator = user && tournament.creatorId === user.id;
  const hasPin = req.body?.pin && verifyPin(req.body.pin);
  if (!isCreator && !hasPin) {
    return res.status(403).json({ error: 'Ingen behörighet' });
  }

  db.removeBanner(req.params.bannerId, tournament.id);
  res.json({ ok: true });
});

// ── Delete Tournament ────────────────────────────────
app.delete('/api/tournaments/:id', (req, res) => {
  const tournament = db.getFullTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });

  const user = getUserFromToken(req);
  const isCreator = user && tournament.creatorId === user.id;
  const hasPin = req.body?.pin && verifyPin(req.body.pin);
  if (!isCreator && !hasPin) {
    return res.status(403).json({ error: 'Ingen behörighet att radera turneringen' });
  }

  db.deleteTournament(tournament.id);
  res.json({ ok: true });
});

// ── Settlement Receipts (Kvittering) ────────────────
app.post('/api/tournaments/:id/settlement/receipt', (req, res) => {
  const tournament = db.getFullTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Turnering hittades inte' });

  const user = getUserFromToken(req);
  const { fromName, toName, amount, receiptId } = req.body;

  const isCreator = user && tournament.creatorId === user.id;
  const isCreditor = user && (user.nickname === toName || user.real_name === toName);
  const isDebtor = user && (user.nickname === fromName || user.real_name === fromName);
  const hasPin = req.body?.pin && verifyPin(req.body.pin);

  if (!isCreator && !isCreditor && !isDebtor && !hasPin) {
    return res.status(403).json({ error: 'Ingen behörighet att kvittera denna överföring' });
  }

  if (receiptId) {
    const existing = db.getSettlementReceiptById(receiptId);
    if (!existing || existing.tournament_id !== tournament.id) {
      return res.status(404).json({ error: 'Kvittot hittades inte i denna turnering' });
    }

    const isReceiptCreditor = user && (user.nickname === existing.to_name || user.real_name === existing.to_name);
    const isReceiptDebtor = user && (user.nickname === existing.from_name || user.real_name === existing.from_name);
    if (!isCreator && !isReceiptCreditor && !isReceiptDebtor && !hasPin) {
      return res.status(403).json({ error: 'Ingen behörighet att ta bort detta kvitto' });
    }

    db.deleteSettlementReceiptById(receiptId);
    broadcastToEvent(tournament.shareCode, { type: 'tournament_updated', tournamentCode: tournament.shareCode });
    return res.json({ ok: true, isPaid: false });
  }

  if (!fromName || !toName) {
    return res.status(400).json({ error: 'Avsändare och mottagare krävs' });
  }

  const result = db.toggleSettlementReceipt(generateId(), tournament.id, fromName, toName, Number(amount) || 0);
  broadcastToEvent(tournament.shareCode, { type: 'tournament_updated', tournamentCode: tournament.shareCode });

  res.json({ ok: true, isPaid: result.isPaid, receiptId: result.id });
});

// ── Minigame Duels API ──────────────────────────────
app.post('/api/duels', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const { gameType, opponentId, stakeAmount, mode } = req.body;
  const stake = typeof stakeAmount === 'number' ? Math.max(0, stakeAmount) : 1;
  const duelMode = mode === 'table' ? 'table' : 'online';

  const duel = db.createDuel({
    gameType: gameType || 'dice',
    creatorId: user.id,
    opponentId: opponentId || null,
    stakeAmount: stake,
    mode: duelMode
  });

  if (opponentId && duelMode === 'online') {
    broadcastToUser(opponentId, {
      type: 'duel_challenge',
      duel
    });
  }

  res.json({ duel });
});

app.get('/api/duels/pending', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });
  const duels = db.getPendingDuelsForUser(user.id);
  res.json(duels);
});

app.get('/api/duels/settlements', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });
  const summary = db.getDuelSettlementSummary(user.id);
  res.json(summary);
});

app.get('/api/duels/history', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });
  const duels = db.getUserDuels(user.id);
  res.json(duels);
});

app.get('/api/duels/:id', (req, res) => {
  const duel = db.getDuelById(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duell hittades inte' });
  res.json(duel);
});

app.post('/api/duels/:id/respond', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const { accept } = req.body;
  const duel = db.respondDuel(req.params.id, user.id, Boolean(accept));
  if (!duel) return res.status(400).json({ error: 'Kunde inte besvara duellen' });

  const payload = {
    type: accept ? 'duel_accepted' : 'duel_declined',
    duel
  };
  broadcastToDuel(duel.id, payload);
  if (duel.creator_id) {
    broadcastToUser(duel.creator_id, payload);
  }

  res.json({ duel });
});

app.post('/api/duels/:id/roll', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const duel = db.getDuelById(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duell hittades inte' });

  if (user.id !== duel.creator_id && user.id !== duel.opponent_id) {
    return res.status(403).json({ error: 'Du deltar inte i denna duell' });
  }

  if (duel.status !== 'active') {
    return res.status(400).json({ error: 'Endast aktiva dueller kan registreras' });
  }

  const { creatorScore, opponentScore, winnerId } = req.body;

  // Validate winnerId is a legitimate participant or null
  const validWinner = winnerId === duel.creator_id || winnerId === duel.opponent_id || winnerId === null;
  if (!validWinner) {
    return res.status(400).json({ error: 'Ogiltig vinnare angiven' });
  }

  const parsedCreatorScore = typeof creatorScore === 'number' ? creatorScore : Number(creatorScore) || 0;
  const parsedOpponentScore = typeof opponentScore === 'number' ? opponentScore : Number(opponentScore) || 0;

  const updated = db.submitDuelResult({
    duelId: req.params.id,
    creatorScore: parsedCreatorScore,
    opponentScore: parsedOpponentScore,
    winnerId: winnerId || null
  });

  broadcastToDuel(req.params.id, {
    type: 'duel_finished',
    duel: updated
  });

  res.json({ duel: updated });
});

app.post('/api/duels/:id/settle', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const duel = db.getDuelById(req.params.id);
  if (!duel) return res.status(404).json({ error: 'Duell hittades inte' });

  if (user.id !== duel.creator_id && user.id !== duel.opponent_id) {
    return res.status(403).json({ error: 'Du deltar inte i denna duell' });
  }

  if (duel.status !== 'completed') {
    return res.status(400).json({ error: 'Endast avslutade dueller kan kvitteras' });
  }

  db.settleDuelById(req.params.id);
  broadcastToDuel(req.params.id, {
    type: 'duel_settled',
    duelId: req.params.id
  });

  res.json({ ok: true });
});

app.post('/api/duels/settle-with/:friendId', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const friendId = req.params.friendId;
  if (!friendId || friendId === user.id) {
    return res.status(400).json({ error: 'Ogiltig vän angiven' });
  }

  const friend = db.getUserById(friendId);
  if (!friend) {
    return res.status(404).json({ error: 'Användaren hittades inte' });
  }

  db.settleDuelsBetweenUsers(user.id, friendId);
  broadcastToUser(friendId, {
    type: 'duels_settled',
    friendId: user.id
  });

  res.json({ ok: true });
});

// ── Minigame Party Rooms API (The Blind 10.00 etc.) ──────────────────
app.post('/api/minigames/party/create', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const { gameType, stakeAmount } = req.body;
  const roomId = crypto.randomUUID();
  let code;
  do {
    code = Math.random().toString(36).substring(2, 6).toUpperCase();
  } while (partyCodeToId.has(code));

  const room = {
    id: roomId,
    code,
    gameType: gameType || 'blind10',
    hostId: user.id,
    hostNickname: user.nickname,
    stakeAmount: typeof stakeAmount === 'number' ? Math.max(0, stakeAmount) : 0,
    status: 'lobby', // 'lobby' | 'countdown' | 'running' | 'results' | 'tie'
    createdAt: new Date().toISOString(),
    players: [
      {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl || null,
        avatarEmoji: user.avatarEmoji || '👑',
        swishNumber: user.swishNumber || null,
        isHost: true,
        stoppedTime: null,
        diff: null,
        rank: null
      }
    ],
    results: [],
    tiedPlayerIds: []
  };

  partyRooms.set(roomId, room);
  partyCodeToId.set(code, roomId);
  res.json({ room });
});

app.get('/api/minigames/party/:query', (req, res) => {
  const query = req.params.query.toUpperCase();
  const roomId = partyCodeToId.get(query) || req.params.query;
  const room = partyRooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Rummet hittades inte' });
  res.json({ room });
});

app.post('/api/minigames/party/join', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const { code, roomId } = req.body;
  const targetId = roomId || partyCodeToId.get((code || '').toUpperCase());
  const room = partyRooms.get(targetId);
  if (!room) return res.status(404).json({ error: 'Rummet hittades inte' });
  if (room.status !== 'lobby' && room.status !== 'tie') {
    return res.status(400).json({ error: 'Spelet har redan startat' });
  }

  let player = room.players.find(p => p.id === user.id);
  if (!player) {
    player = {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl || null,
      avatarEmoji: user.avatarEmoji || '👤',
      swishNumber: user.swishNumber || null,
      isHost: false,
      stoppedTime: null,
      diff: null,
      rank: null
    };
    room.players.push(player);
  }

  broadcastToParty(room.id, {
    type: 'party_updated',
    room
  });

  res.json({ room });
});

app.post('/api/minigames/party/:id/invite', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const room = partyRooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Rummet hittades inte' });

  const { friendIds } = req.body;
  if (Array.isArray(friendIds)) {
    for (const fId of friendIds) {
      broadcastToUser(fId, {
        type: 'party_invitation',
        room: {
          id: room.id,
          code: room.code,
          gameType: room.gameType,
          hostNickname: user.nickname,
          stakeAmount: room.stakeAmount
        }
      });
    }
  }

  res.json({ ok: true });
});

app.post('/api/minigames/party/:id/start', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const room = partyRooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Rummet hittades inte' });
  if (room.hostId !== user.id) return res.status(403).json({ error: 'Endast hosten kan starta spelet' });

  const countdownSec = 3;
  room.status = 'running';
  room.countdownSec = countdownSec;
  room.startTime = Date.now() + (countdownSec * 1000);
  room.results = [];
  room.tiedPlayerIds = [];
  for (const p of room.players) {
    p.stoppedTime = null;
    p.diff = null;
    p.rank = null;
  }

  broadcastToParty(room.id, {
    type: 'party_started',
    room,
    countdownSec,
    startTime: room.startTime
  });

  res.json({ ok: true, room });
});

app.post('/api/minigames/party/:id/submit', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const room = partyRooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Rummet hittades inte' });

  const player = room.players.find(p => p.id === user.id);
  if (!player) {
    return res.status(403).json({ error: 'Du deltar inte i detta rum' });
  }

  if (room.status !== 'running') {
    return res.status(400).json({ error: 'Spelet pågår inte just nu' });
  }

  if (player.stoppedTime !== null) {
    return res.status(400).json({ error: 'Du har redan stoppat klockan' });
  }

  // Authoritative server-measured elapsed time
  const now = Date.now();
  const rawElapsed = (now - (room.startTime || now)) / 1000;
  const elapsedSec = Math.max(0, rawElapsed);

  let finalTime;
  if (typeof req.body.stoppedTime === 'number' && req.body.stoppedTime > 0) {
    const clientTime = Math.round(req.body.stoppedTime * 1000) / 1000;
    // Tolerance window for network transit (1.5s). If client sends wildly manipulated time, force server time
    if (Math.abs(clientTime - elapsedSec) <= 1.5) {
      finalTime = clientTime;
    } else {
      finalTime = Math.round(elapsedSec * 1000) / 1000;
    }
  } else {
    finalTime = Math.round(elapsedSec * 1000) / 1000;
  }

  const diff = Math.round(Math.abs(finalTime - 10.000) * 1000) / 1000;
  player.stoppedTime = finalTime;
  player.diff = diff;

  broadcastToParty(room.id, {
    type: 'party_player_stopped',
    userId: user.id,
    nickname: user.nickname,
    stoppedCount: room.players.filter(p => p.stoppedTime !== null).length,
    totalCount: room.players.length
  });

  const activePlayers = room.tiedPlayerIds.length > 0 
    ? room.players.filter(p => room.tiedPlayerIds.includes(p.id))
    : room.players;

  const allFinished = activePlayers.every(p => p.stoppedTime !== null);

  if (allFinished && activePlayers.length > 0) {
    activePlayers.sort((a, b) => a.diff - b.diff);

    const bestDiff = activePlayers[0].diff;
    const tied = activePlayers.filter(p => p.diff === bestDiff);

    if (tied.length > 1) {
      room.status = 'tie';
      room.tiedPlayerIds = tied.map(p => p.id);
      room.results = activePlayers.map((p, idx) => ({ ...p, rank: idx + 1 }));

      broadcastToParty(room.id, {
        type: 'party_results',
        room,
        isTie: true,
        tiedPlayerIds: room.tiedPlayerIds
      });
    } else {
      room.status = 'completed';
      const winner = activePlayers[0];
      room.results = activePlayers.map((p, idx) => ({ ...p, rank: idx + 1 }));

      if (room.stakeAmount > 0) {
        const losers = room.players.filter(p => p.id !== winner.id);
        for (const loser of losers) {
          try {
            const duel = db.createDuel({
              gameType: 'blind10',
              creatorId: winner.id,
              opponentId: loser.id,
              stakeAmount: room.stakeAmount,
              mode: 'online'
            });
            if (duel) {
              db.submitDuelResult({
                duelId: duel.id,
                creatorScore: 1,
                opponentScore: 0,
                winnerId: winner.id
              });
            }
          } catch (e) {
            console.error('Failed to log party duel settlement:', e);
          }
        }
      }

      broadcastToParty(room.id, {
        type: 'party_results',
        room,
        isTie: false,
        winner
      });
    }
  }

  res.json({ ok: true, room, stoppedTime: finalTime, diff });
});

app.post('/api/minigames/party/:id/resolve-tie', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const room = partyRooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Rummet hittades inte' });

  if (room.hostId !== user.id) {
    return res.status(403).json({ error: 'Endast hosten kan avgöra oavgjort' });
  }

  const { decision } = req.body;

  if (decision === 'sudden_death') {
    const countdownSec = 3;
    room.status = 'running';
    room.countdownSec = countdownSec;
    room.startTime = Date.now() + (countdownSec * 1000);
    for (const p of room.players) {
      if (room.tiedPlayerIds.includes(p.id)) {
        p.stoppedTime = null;
        p.diff = null;
      }
    }
    broadcastToParty(room.id, {
      type: 'party_sudden_death_start',
      room,
      countdownSec,
      startTime: room.startTime
    });
    res.json({ ok: true, room });
  } else {
    room.status = 'completed';
    const tiedWinners = room.players.filter(p => room.tiedPlayerIds.includes(p.id));
    const losers = room.players.filter(p => !room.tiedPlayerIds.includes(p.id));
    
    if (room.stakeAmount > 0 && tiedWinners.length > 0) {
      const splitStake = Math.round((room.stakeAmount / tiedWinners.length) * 100) / 100;
      for (const loser of losers) {
        for (const winner of tiedWinners) {
          try {
            const duel = db.createDuel({
              gameType: 'blind10',
              creatorId: winner.id,
              opponentId: loser.id,
              stakeAmount: splitStake,
              mode: 'online'
            });
            if (duel) {
              db.submitDuelResult({
                duelId: duel.id,
                creatorScore: 1,
                opponentScore: 0,
                winnerId: winner.id
              });
            }
          } catch (e) {}
        }
      }
    }

    broadcastToParty(room.id, {
      type: 'party_pot_split',
      room,
      tiedWinners
    });
    res.json({ ok: true, room });
  }
});

// ── AnyBet API (Kompisbettet) ─────────────────────────
app.post('/api/anybets/create', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const { title, description, judgeId, stakeAmount, betType, deadline, participantIds } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Ange vad bettet handlar om' });
  }

  try {
    const bet = db.createAnyBet({
      title,
      description,
      creatorId: user.id,
      judgeId: judgeId || user.id,
      stakeAmount: typeof stakeAmount === 'number' ? Math.max(0, stakeAmount) : (parseFloat(stakeAmount) || 0),
      betType: betType || 'winner_takes_all',
      deadline: deadline || null,
      participantIds: Array.isArray(participantIds) ? participantIds : []
    });

    if (Array.isArray(participantIds)) {
      for (const pId of participantIds) {
        if (pId !== user.id) {
          broadcastToUser(pId, {
            type: 'anybet_invitation',
            bet: {
              id: bet.id,
              title: bet.title,
              creatorNickname: user.nickname,
              stakeAmount: bet.stake_amount
            }
          });
        }
      }
    }

    res.json({ ok: true, bet });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Kunde inte skapa bettet' });
  }
});

app.get('/api/anybets', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  try {
    const bets = db.getAnyBetsForUser(user.id);
    res.json({ bets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/anybets/:id', (req, res) => {
  try {
    const bet = db.getAnyBetById(req.params.id);
    if (!bet) return res.status(404).json({ error: 'Bettet hittades inte' });
    res.json({ bet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/anybets/:id/join', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const { choice } = req.body;
  try {
    const bet = db.updateAnyBetChoice(req.params.id, user.id, choice || 'participant');
    res.json({ ok: true, bet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/anybets/:id/settle', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Inloggning krävs' });

  const { winnerId, winningSide, proofImageUrl } = req.body;
  try {
    const settledBet = db.settleAnyBet({
      betId: req.params.id,
      judgeId: user.id,
      winnerId,
      winningSide,
      proofImageUrl
    });

    if (settledBet && settledBet.participants) {
      for (const p of settledBet.participants) {
        broadcastToUser(p.user_id, {
          type: 'anybet_settled',
          bet: settledBet
        });
      }
    }

    res.json({ ok: true, bet: settledBet });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Web Push API Endpoints ───────────────────────────
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidPublicKey });
});

app.post('/api/push/subscribe', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Ej inloggad' });
  const sub = req.body?.subscription || req.body || {};
  const { endpoint, keys } = sub;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Ogiltiga push-uppgifter' });
  }
  const id = generateId();
  db.savePushSubscription(id, user.id, endpoint, keys.p256dh, keys.auth);
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) {
    db.deletePushSubscriptionByEndpoint(endpoint);
  }
  res.json({ ok: true });
});

// ── Flash Bets (BlixtBet) API Endpoints ───────────────
app.post('/api/flashbets', async (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Du måste vara inloggad för att starta ett BlixtBet' });
  if (!user.swish_number) {
    return res.status(400).json({ error: 'Du behöver ange ett Swish-nummer i din profil innan du kan starta ett BlixtBet' });
  }

  const { question, title, durationSeconds, stakeAmount, stake: rawStake, tournamentId, initialChoice, myChoice } = req.body || {};
  const finalQuestion = (question || title || '').trim();
  if (!finalQuestion || finalQuestion.length < 3) {
    return res.status(400).json({ error: 'Ange en fråga (minst 3 tecken)' });
  }

  const duration = Math.max(1, Math.min(600, Number(durationSeconds) || 60));
  const stake = Math.max(5, Math.min(5000, Number(stakeAmount || rawStake) || 20));
  const choice = initialChoice || myChoice;
  const expiresAt = new Date(Date.now() + duration * 1000).toISOString();

  const id = generateId();
  db.createFlashBet(id, user.id, tournamentId, finalQuestion, duration, expiresAt, stake);

  if (choice === 'yes' || choice === 'no') {
    const entryId = generateId();
    db.placeFlashBetEntry(entryId, id, user.id, choice, stake);
  }

  const created = db.getFlashBet(id, user.id);

  // Broadcast WebSocket event
  broadcastGlobal({
    type: 'flash_bet_created',
    flashBet: created
  });

  // Target users for Web Push
  let targetUserIds = [];
  try {
    const friends = db.getFriends(user.id);
    targetUserIds = friends.map(f => f.id);
    if (tournamentId) {
      const t = db.getFullTournament(tournamentId);
      if (t && t.creatorId && !targetUserIds.includes(t.creatorId)) {
        targetUserIds.push(t.creatorId);
      }
    }
  } catch {}

  sendPushToUsers(targetUserIds, {
    title: `⚡ BLIXTBET (${duration}s kvar!)`,
    body: `${user.real_name || user.nickname}: "${finalQuestion}"`,
    url: tournamentId ? `/#tournament/${tournamentId}` : `/#arcade`
  }).catch(() => {});

  res.json(created);
});

app.get('/api/flashbets/active', (req, res) => {
  const user = getUserFromToken(req);
  res.json(db.getActiveFlashBets(user ? user.id : null));
});

app.get('/api/flashbets/:id', (req, res) => {
  const user = getUserFromToken(req);
  const fb = db.getFlashBet(req.params.id, user ? user.id : null);
  if (!fb) return res.status(404).json({ error: 'BlixtBet hittades inte' });
  res.json(fb);
});

app.post('/api/flashbets/:id/bet', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Du måste vara inloggad för att rösta' });
  if (!user.swish_number) {
    return res.status(400).json({ error: 'Du behöver ange ett Swish-nummer i din profil innan du kan rösta' });
  }

  const { choice } = req.body || {};
  if (choice !== 'yes' && choice !== 'no') {
    return res.status(400).json({ error: 'Välj JA eller NEJ' });
  }

  const fb = db.getFlashBet(req.params.id);
  if (!fb) return res.status(404).json({ error: 'BlixtBet hittades inte' });

  try {
    const entryId = generateId();
    const updated = db.placeFlashBetEntry(entryId, fb.id, user.id, choice, fb.stakeAmount);

    broadcastGlobal({
      type: 'flash_bet_updated',
      flashBet: updated
    });

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/flashbets/:id/settle', (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: 'Ej inloggad' });

  const winnerChoice = req.body?.winningChoice || req.body?.winner;
  if (winnerChoice !== 'yes' && winnerChoice !== 'no') {
    return res.status(400).json({ error: 'Välj om JA eller NEJ vann' });
  }

  try {
    const settled = db.settleFlashBet(req.params.id, winnerChoice, user.id);

    broadcastGlobal({
      type: 'flash_bet_settled',
      flashBet: settled
    });

    const participantUserIds = settled.entries.map(e => e.userId).filter(uid => uid !== user.id);
    sendPushToUsers(participantUserIds, {
      title: `🏁 BlixtBet avgjort!`,
      body: `"${settled.question}" vanns av ${winnerChoice === 'yes' ? '👍 JA' : '👎 NEJ'}!`,
      url: settled.tournamentId ? `/#tournament/${settled.tournamentId}` : `/#arcade`
    }).catch(() => {});

    res.json(settled);
  } catch (err) {
    const isForbidden = err.message.includes('skaparen');
    res.status(isForbidden ? 403 : 400).json({ error: err.message });
  }
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
