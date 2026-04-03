// ── Components: Navbar ───────────────────────────────
import { isLoggedIn, getStoredUser } from '../auth.js';
import { renderBell, initBellListeners } from './notifications.js';
import { t } from '../i18n.js';

// SVG outline icons (stroke-based, no fill)
const icons = {
  home: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><polyline points="9 21 9 14 15 14 15 21"/></svg>`,
  leaderboard: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="14" width="4" height="7" rx="0.5"/><rect x="10" y="8" width="4" height="13" rx="0.5"/><rect x="16" y="11" width="4" height="10" rx="0.5"/><path d="M12 2l1.5 3 3.5.5-2.5 2.5.5 3.5L12 9.5 9 11.5l.5-3.5L7 5.5l3.5-.5z"/></svg>`,
  join: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  profile: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>`,
  admin: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
};

export function renderNavbar(activePage) {
  const user = getStoredUser();
  const loggedIn = isLoggedIn();

  const items = [
    { id: 'home', icon: icons.home, label: t('nav.home') },
    { id: 'leaderboard', icon: icons.leaderboard, label: t('nav.leaderboard') },
    { id: 'join', icon: icons.join, label: t('nav.join') },
    { id: 'profile', icon: icons.profile, label: loggedIn ? user?.nickname?.slice(0, 6) : t('nav.account') },
    { id: 'admin', icon: icons.admin, label: t('nav.admin') }
  ];

  setTimeout(() => initBellListeners(), 0);

  return `
    <div class="top-header">
      <div class="top-header-left">
        ${renderBell()}
      </div>
      <span class="top-header-logo">BETPALS</span>
      <div class="top-header-right"></div>
    </div>
    <div class="navbar">
      ${items.map(item => `
        <button class="nav-item ${activePage === item.id ? 'active' : ''}"
                data-nav="${item.id}" id="nav-${item.id}">
          <span class="nav-icon">${item.icon}</span>
          <span>${item.label}</span>
        </button>
      `).join('')}
    </div>
  `;
}
