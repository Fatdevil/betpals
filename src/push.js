// ── Web Push Notification Client Helper ─────────────────
import { getVapidPublicKey, subscribePush, unsubscribePush } from './api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getPushPermissionState() {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission; // 'default', 'granted', 'denied'
}

// Set when the user turns notifications off in the profile. The browser permission stays
// "granted" after that, so permission alone cannot tell whether notifications are on.
const PUSH_DISABLED_KEY = 'betpals_push_disabled';

export function isPushEnabledByUser() {
  try {
    return localStorage.getItem(PUSH_DISABLED_KEY) !== '1';
  } catch {
    return true;
  }
}

export function isPushActive() {
  return isPushSupported() && getPushPermissionState() === 'granted' && isPushEnabledByUser();
}

async function getReadyRegistration() {
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.warn('[Push] ServiceWorker register warning:', e);
  }
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Kunde inte initiera Service Worker för notiser i tid')), 8000)
  );
  return Promise.race([navigator.serviceWorker.ready, timeoutPromise]);
}

function sameKey(buffer, expected) {
  if (!buffer) return false;
  const actual = new Uint8Array(buffer);
  if (actual.length !== expected.length) return false;
  return actual.every((byte, i) => byte === expected[i]);
}

// Makes sure this device has a push subscription for the server's current VAPID key and
// that the server has it stored for the logged-in user. A subscription made with an old
// key (e.g. after the server's keys changed) silently never delivers, so it is replaced.
async function ensureSubscription(reg) {
  const { publicKey } = await getVapidPublicKey();
  if (!publicKey) throw new Error('Kunde inte hämta VAPID-nyckel från servern');
  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options?.applicationServerKey, applicationServerKey)) {
    try { await sub.unsubscribe(); } catch {}
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  }

  const subJson = sub.toJSON();
  await subscribePush({
    endpoint: sub.endpoint,
    keys: {
      p256dh: subJson.keys?.p256dh,
      auth: subJson.keys?.auth
    }
  });
  return sub;
}

export async function subscribeToPush() {
  if (!isPushSupported()) {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
      throw new Error('På iPhone måste Malta Betting sparas på hemskärmen först för att aktivera notiser');
    }
    throw new Error('Push-notiser stöds inte i denna webbläsare eller kräver HTTPS');
  }

  // Request browser notification permission (must stay the first await: iOS only
  // allows it directly inside the user's tap)
  const permission = await Notification.requestPermission();
  if (permission === 'denied') {
    throw new Error('Notistillstånd nekades. Tillåt aviseringar i telefonens inställningar för att få notiser.');
  }
  if (permission !== 'granted') {
    throw new Error('Notistillstånd godkändes inte.');
  }

  const reg = await getReadyRegistration();
  const sub = await ensureSubscription(reg);
  try { localStorage.removeItem(PUSH_DISABLED_KEY); } catch {}
  return sub;
}

// Called on app start and after login: re-registers this device with the server so
// notifications keep working after a server reset, key change, new login or expired
// subscription. Never prompts the user.
export async function syncPushSubscription() {
  if (!isPushActive() || !localStorage.getItem('betpals_token')) return false;
  try {
    const reg = await getReadyRegistration();
    await ensureSubscription(reg);
    return true;
  } catch (err) {
    console.warn('[Push] Could not sync push subscription:', err);
    return false;
  }
}

export async function unsubscribeFromPush() {
  try { localStorage.setItem(PUSH_DISABLED_KEY, '1'); } catch {}
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await unsubscribePush({ endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch (err) {
    console.error('Failed to unsubscribe push:', err);
  }
}
