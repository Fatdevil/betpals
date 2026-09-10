// ── Auth Store ──────────────────────────────────────
// Simple user state management using localStorage

const STORAGE_KEY = 'betpals_token';
const USER_KEY = 'betpals_user';

export function getStoredUser() {
  try {
    const data = localStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

export function storeUser(user) {
  if (user.token) {
    localStorage.setItem(STORAGE_KEY, user.token);
  }
  localStorage.setItem(USER_KEY, JSON.stringify({
    id: user.id,
    nickname: user.nickname,
    realName: user.realName || user.real_name || '',
    swishNumber: user.swishNumber || user.swish_number || '',
    avatar: user.avatar || user.avatar_emoji || '👤',
    avatarUrl: user.avatarUrl || user.avatar_url || null,
    email: user.email || null
  }));
}

export function clearUser() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn() {
  return !!localStorage.getItem(STORAGE_KEY);
}

export function getToken() {
  return localStorage.getItem(STORAGE_KEY);
}
