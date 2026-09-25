// ── Components: Navbar ───────────────────────────────
import { isLoggedIn, getStoredUser } from '../auth.js';
import { renderBell, initBellListeners } from './notifications.js';
import { t, getLang, setLang } from '../i18n.js';

// Navigation icons
const icons = {
  home: `<img src="/nav-chip.png" alt="Betting" class="nav-chip-icon" />`,
  leaderboard: `<img src="/the-tab-nav.png" alt="The Tab" class="nav-chip-icon" />`,
  join: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  profile: `<img src="/profile-nav.png" alt="Profile" class="nav-chip-icon" />`,
  admin: `<img src="/admin-nav.png" alt="Admin" class="nav-chip-icon" />`
};

import { openAppQrModal } from './appQrModal.js';

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
    document.getElementById('top-header-qr-btn')?.addEventListener('click', () => {
      openAppQrModal();
    });
    document.getElementById('top-header-logo-btn')?.addEventListener('click', () => {
      openAppQrModal();
    });
  }, 0);

  return `
    <div class="top-header">
      <div class="top-header-left">
        <button class="top-header-qr-btn" id="top-header-qr-btn" title="${currentLang === 'sv' ? 'Dela app & QR-kod 📱' : 'Share app & QR code 📱'}" aria-label="Dela app och QR-kod">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"></rect>
            <rect x="14" y="3" width="7" height="7" rx="1"></rect>
            <rect x="14" y="14" width="7" height="7" rx="1"></rect>
            <rect x="3" y="14" width="7" height="7" rx="1"></rect>
            <path d="M7 7h.01"></path>
            <path d="M17 7h.01"></path>
            <path d="M7 17h.01"></path>
            <path d="M17 17h.01"></path>
          </svg>
        </button>
      </div>
      <div class="top-header-center">
        <span class="top-header-logo" id="top-header-logo-btn" title="${currentLang === 'sv' ? 'Dela app / QR-kod 📱' : 'Share app / QR code 📱'}">THE SOCIAL BETWORK</span>
      </div>
      <div class="top-header-right">
        ${renderBell()}
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
