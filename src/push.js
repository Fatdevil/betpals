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
  if (!isPushSupported()) {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
      throw new Error('På iPhone måste Malta Betting sparas på hemskärmen först för att aktivera notiser');
    }
    throw new Error('Push-notiser stöds inte i denna webbläsare eller kräver HTTPS');
  }

  // Request browser notification permission
  const permission = await Notification.requestPermission();
  if (permission === 'denied') {
    throw new Error('Notistillstånd nekades. Tillåt aviseringar i webbläsarens inställningar för att få notiser.');
  }
  if (permission !== 'granted') {
    throw new Error('Notistillstånd godkändes inte.');
  }

  // Ensure Service Worker registration is initiated
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (e) {
      console.warn('[Push] ServiceWorker register warning:', e);
    }
  }

  // Wait for service worker ready with a timeout safeguard
  const swReadyPromise = navigator.serviceWorker.ready;
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Kunde inte initiera Service Worker för notiser i tid')), 8000)
  );
  const reg = await Promise.race([swReadyPromise, timeoutPromise]);

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
