// ── API layer + WebSocket client ──────────────────────

const BASE = '/api';
const WS_BASE = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  // Attach user auth token if available
  const token = localStorage.getItem('betpals_token');
  if (token) headers['x-user-token'] = token;

  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Något gick fel');
  return data;
}

// ── WebSocket ──────────────────────────────────────────
let ws = null;
let wsEventCode = null;
const wsListeners = new Set();

export function connectWebSocket(eventCode) {
  // Disconnect previous
  disconnectWebSocket();

  wsEventCode = eventCode;
  ws = new WebSocket(`${WS_BASE}?event=${eventCode}`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      for (const listener of wsListeners) {
        listener(data);
      }
    } catch (e) { /* silent */ }
  };

  ws.onclose = () => {
    // Auto-reconnect after 3s
    if (wsEventCode === eventCode) {
      setTimeout(() => {
        if (wsEventCode === eventCode) {
          connectWebSocket(eventCode);
        }
      }, 3000);
    }
  };

  ws.onerror = () => {};
}

export function disconnectWebSocket() {
  wsEventCode = null;
  if (ws) {
    ws.onclose = null; // prevent reconnect
    ws.close();
    ws = null;
  }
}

export function onWebSocketMessage(callback) {
  wsListeners.add(callback);
  return () => wsListeners.delete(callback); // unsubscribe
}

// ── Admin ──────────────────────────────────────────────
export const adminStatus = () => request('/admin/status');
export const adminSetup = (pin) => request('/admin/setup', { method: 'POST', body: { pin } });
export const adminVerify = (pin) => request('/admin/verify', { method: 'POST', body: { pin } });

// ── Events ─────────────────────────────────────────────
export const getEvents = () => request('/events');
export const getAllEvents = () => request('/events?all=1');
export const getEvent = (idOrCode) => request(`/events/${idOrCode}`);
export const createEvent = (data) => request('/events', { method: 'POST', body: data });
export const deleteEvent = (id, pin) => request(`/events/${id}`, { method: 'DELETE', body: { pin } });
export const getEventQR = (idOrCode, baseUrl) => {
  const params = baseUrl ? `?baseUrl=${encodeURIComponent(baseUrl)}` : '';
  return request(`/events/${idOrCode}/qr${params}`);
};

// ── Players ────────────────────────────────────────────
export const addPlayer = (eventId, name, pin) =>
  request(`/events/${eventId}/players`, { method: 'POST', body: { name, pin } });
export const removePlayer = (eventId, playerId, pin) =>
  request(`/events/${eventId}/players/${playerId}`, { method: 'DELETE', body: { pin } });

// ── Bets ───────────────────────────────────────────────
export const placeBet = (idOrCode, data) =>
  request(`/events/${idOrCode}/bets`, { method: 'POST', body: data });
export const deleteBet = (eventId, betId, pin) =>
  request(`/events/${eventId}/bets/${betId}`, { method: 'DELETE', body: { pin } });
export const markBetPaid = (eventId, betId, paid) =>
  request(`/events/${eventId}/bets/${betId}/paid`, { method: 'POST', body: { paid } });

// ── Event Actions ──────────────────────────────────────
export const lockEvent = (id, pin) =>
  request(`/events/${id}/lock`, { method: 'POST', body: { pin } });
export const reopenEvent = (id, pin) =>
  request(`/events/${id}/reopen`, { method: 'POST', body: { pin } });
export const finishEvent = (id, winnerId, pin) =>
  request(`/events/${id}/finish`, { method: 'POST', body: { winnerId, pin } });

// ── Users ─────────────────────────────────────────────
export const registerUser = (nickname, avatarEmoji) =>
  request('/users/register', { method: 'POST', body: { nickname, avatarEmoji } });
export const loginUser = (nickname) =>
  request('/users/login', { method: 'POST', body: { nickname } });
export const googleLogin = (credential) =>
  request('/auth/google', { method: 'POST', body: { credential } });
export const getMe = () => request('/users/me');
export const getMyBets = () => request('/users/me/bets');
export const updateAvatar = (emoji) =>
  request('/users/me/avatar', { method: 'PUT', body: { emoji } });

// ── Leaderboard ──────────────────────────────────────
export const getLeaderboard = () => request('/leaderboard');

// ── Tournaments ──────────────────────────────────────
export const getTournaments = () => request('/tournaments');
export const getTournament = (code) => request('/tournaments/' + code);
export const createTournament = (data) =>
  request('/tournaments', { method: 'POST', body: data });
export const addTournamentRound = (id, data) =>
  request('/tournaments/' + id + '/rounds', { method: 'POST', body: data });
export const settleTournament = (id) =>
  request('/tournaments/' + id + '/settle', { method: 'POST', body: {} });
export const getTournamentQR = (code, baseUrl) => {
  const params = baseUrl ? `?baseUrl=${encodeURIComponent(baseUrl)}` : '';
  return request('/tournaments/' + code + '/qr' + params);
};

// ── User Stats ───────────────────────────────────────
export const getMyStats = () => request('/users/me/stats');

// ── Photos ───────────────────────────────────────────
export const getEventPhotos = (code) => request(`/events/${code}/photos`);
export const uploadEventPhoto = (code, imageData, caption) =>
  request(`/events/${code}/photos`, { method: 'POST', body: { imageData, caption } });
export const deleteEventPhoto = (code, photoId) =>
  request(`/events/${code}/photos/${photoId}`, { method: 'DELETE' });
