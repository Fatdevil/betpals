// ── Back navigation for sub pages (a game, an event) ──────────────
// The header's "‹" and the phone's own back both go through here. A page can:
// - name its parent, used when there is no in-app history to go back to
//   (opened from a shared link or a notification), so back never leaves the app
// - intercept back to close something first, e.g. an open bet slip

let parent = null;
let interceptor = null;

export function setBackParent(page, params = {}) {
  parent = { page, params };
}

export function getBackParent() {
  return parent;
}

export function setBackInterceptor(fn) {
  interceptor = fn;
}

// True when the page handled back itself (closed a slip) and nothing else should happen
export function interceptBack() {
  try {
    return Boolean(interceptor?.());
  } catch {
    return false;
  }
}

export function resetBack() {
  parent = null;
  interceptor = null;
}

export function requestBack() {
  window.dispatchEvent(new Event('app-back'));
}

// Is this page still the one on screen? A page that was loading (or a delayed refresh)
// when the user went back or elsewhere must not draw over the page shown now
export function isShowing(page, code) {
  try {
    const url = new URL(window.location.href);
    return (url.searchParams.get('page') || 'home') === page && (!code || url.searchParams.get('code') === code);
  } catch {
    return true;
  }
}
