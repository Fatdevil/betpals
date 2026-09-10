// ── Components: Navbar ───────────────────────────────
import { isLoggedIn, getStoredUser } from '../auth.js';
import { renderBell, initBellListeners } from './notifications.js';
import { t, getLang, setLang } from '../i18n.js';

// Navigation icons
const icons = {
  home: `<img src="/nav-chip.png" alt="Betting" class="nav-chip-icon" />`,
  leaderboard: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>`,
  join: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  profile: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>`,
  admin: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
};

export function renderNavbar(activePage) {
  const user = getStoredUser();
  const loggedIn = isLoggedIn();
  const currentLang = getLang();

  const items = [
    { id: 'home', icon: icons.home, label: t('nav.home') },
    { id: 'leaderboard', icon: icons.leaderboard, label: t('nav.leaderboard') },
    // { id: 'join', icon: icons.join, label: t('nav.join') }, // Dold tills vidare
    { id: 'profile', icon: icons.profile, label: loggedIn ? (user?.nickname?.slice(0, 7) || t('nav.account')) : t('nav.account') },
    { id: 'admin', icon: icons.admin, label: t('nav.admin') }
  ];

  setTimeout(() => {
    initBellListeners();
    document.getElementById('lang-toggle-btn')?.addEventListener('click', () => {
      const next = getLang() === 'sv' ? 'en' : 'sv';
      setLang(next);
    });
  }, 0);

  return `
    <div class="top-header">
      <div class="top-header-left">
        ${renderBell()}
      </div>
      <span class="top-header-logo">MALTA BETTING</span>
      <div class="top-header-right">
        <button class="lang-toggle-btn" id="lang-toggle-btn" title="${currentLang === 'sv' ? 'Switch to English' : 'Byt till svenska'}">
          ${currentLang === 'sv' ? '🇸🇪 SV' : '🇬🇧 EN'}
        </button>
      </div>
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
