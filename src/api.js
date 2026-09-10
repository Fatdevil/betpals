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
export const adminGetUsers = (pin) => request('/admin/users', { method: 'POST', body: { pin } });
export const adminResetUserPin = (userId, pin) => request(`/admin/users/${userId}/reset-pin`, { method: 'POST', body: { pin } });

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
export const addPlayer = (eventId, name, pin, imageUrl = null) =>
  request(`/events/${eventId}/players`, { method: 'POST', body: { name, pin, imageUrl } });
export const updatePlayerImage = (eventId, playerId, data) =>
  request(`/events/${eventId}/players/${playerId}/image`, { method: 'PUT', body: data });
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
export const finishEvent = (id, winnerId, pin, winnerImageUrl = null) =>
  request(`/events/${id}/finish`, { method: 'POST', body: { winnerId, pin, winnerImageUrl } });
export const updateEventImage = (id, data) =>
  request(`/events/${id}/image`, { method: 'PUT', body: data });

// ── Users ─────────────────────────────────────────────
export const registerUser = ({ name, nickname, swishNumber, pin, avatarEmoji }) =>
  request('/users/register', { method: 'POST', body: { name, nickname, swishNumber, pin, avatarEmoji } });
export const loginUser = ({ identifier, pin }) =>
  request('/users/login', { method: 'POST', body: { identifier, pin } });
export const completePinReset = (identifierOrObj, resetCode, newPin) => {
  const body = typeof identifierOrObj === 'object'
    ? identifierOrObj
    : { identifier: identifierOrObj, resetCode, newPin };
  return request('/users/reset-pin', { method: 'POST', body });
};
export const changePin = (currentPin, newPin) =>
  request('/users/change-pin', { method: 'POST', body: { currentPin, newPin } });
export const getMe = () => request('/users/me');
export const getMyBets = () => request('/users/me/bets');
export const updateProfile = (data) =>
  request('/users/me/profile', { method: 'PUT', body: data });
export const updateAvatar = (imageData) =>
  request('/users/me/avatar', { method: 'PUT', body: { imageData } });
export const updateSwish = (swishNumber) =>
  request('/users/me/swish', { method: 'PUT', body: { swishNumber } });

// ── Friends ──────────────────────────────────────────
export const getFriends = () => request('/friends');
export const addFriend = (data) => request('/friends', { method: 'POST', body: typeof data === 'string' ? { nickname: data } : data });
export const removeFriend = (friendId) => request(`/friends/${friendId}`, { method: 'DELETE' });
export const searchUsers = (q) => request(`/users/search?q=${encodeURIComponent(q || '')}`);

// ── WebAuthn / FaceID / TouchID ──────────────────────
export const webauthnRegisterOptions = () =>
  request('/auth/webauthn/register-options', { method: 'POST' });
export const webauthnRegisterVerify = (credentialId, publicKey) =>
  request('/auth/webauthn/register-verify', { method: 'POST', body: { credentialId, publicKey } });
export const webauthnLoginOptions = () =>
  request('/auth/webauthn/login-options', { method: 'POST' });
export const webauthnLoginVerify = (credentialId) =>
  request('/auth/webauthn/login-verify', { method: 'POST', body: { credentialId } });
export const getMyCredentials = () =>
  request('/users/me/credentials');

// ── Leaderboard ──────────────────────────────────────
export const getLeaderboard = () => request('/leaderboard');

// ── Tournaments ──────────────────────────────────────
export const getTournaments = () => request('/tournaments');
export const getTournament = (code) => request('/tournaments/' + code);
export const createTournament = (data) =>
  request('/tournaments', { method: 'POST', body: data });
export const addTournamentRound = (id, data) =>
  request('/tournaments/' + id + '/rounds', { method: 'POST', body: data });
export const createSideBet = (id, data) =>
  request('/tournaments/' + id + '/sidebets', { method: 'POST', body: data });
export const settleTournament = (id) =>
  request('/tournaments/' + id + '/settle', { method: 'POST', body: {} });
export const getTournamentQR = (code, baseUrl) => {
  const params = baseUrl ? `?baseUrl=${encodeURIComponent(baseUrl)}` : '';
  return request('/tournaments/' + code + '/qr' + params);
};
export const toggleSettlementReceipt = (id, data) =>
  request('/tournaments/' + id + '/settlement/receipt', { method: 'POST', body: data });
export const deleteTournament = (id, data) =>
  request('/tournaments/' + id, { method: 'DELETE', body: data });
export const addTournamentBanner = (id, data) =>
  request('/tournaments/' + id + '/banners', { method: 'POST', body: data });
export const deleteTournamentBanner = (id, bannerId, data) =>
  request('/tournaments/' + id + '/banners/' + bannerId, { method: 'DELETE', body: data });

// ── Tournament Photos ────────────────────────────────
export const getTournamentPhotos = (id) => request('/tournaments/' + id + '/photos');
export const uploadTournamentPhoto = (id, data) =>
  request('/tournaments/' + id + '/photos', { method: 'POST', body: data });
export const deleteTournamentPhoto = (id, photoId, data) =>
  request('/tournaments/' + id + '/photos/' + photoId, { method: 'DELETE', body: data });
export const togglePhotoLike = (id, photoId) =>
  request('/tournaments/' + id + '/photos/' + photoId + '/like', { method: 'POST', body: {} });


// ── User Stats ───────────────────────────────────────
export const getMyStats = () => request('/users/me/stats');

// ── Minigame Duels & Swish settlements ────────────────
export const createDuel = (data) => request('/duels', { method: 'POST', body: data });
export const getPendingDuels = () => request('/duels/pending');
export const getDuelSettlements = () => request('/duels/settlements');
export const getDuelHistory = () => request('/duels/history');
export const getDuel = (id) => request('/duels/' + id);
export const respondDuel = (id, accept) => request('/duels/' + id + '/respond', { method: 'POST', body: { accept } });
export const submitDuelRoll = (id, data) => request('/duels/' + id + '/roll', { method: 'POST', body: data });
export const settleDuel = (id) => request('/duels/' + id + '/settle', { method: 'POST', body: {} });
export const settleDuelsWithFriend = (friendId) => request('/duels/settle-with/' + friendId, { method: 'POST', body: {} });
