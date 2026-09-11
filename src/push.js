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

export async function subscribeToPush() {
  if (!isPushSupported()) throw new Error('Push-notiser stöds inte i denna webbläsare');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notistillstånd nekades');
  }

  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await getVapidPublicKey();
  if (!publicKey) throw new Error('Kunde inte hämta VAPID-nyckel från servern');

  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey
  });

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

export async function unsubscribeFromPush() {
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
