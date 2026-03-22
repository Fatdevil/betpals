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
  localStorage.setItem(STORAGE_KEY, user.token);
  localStorage.setItem(USER_KEY, JSON.stringify({
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    avatarUrl: user.avatarUrl || null,
    email: user.email || null,
    googleLinked: user.googleLinked || false
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
