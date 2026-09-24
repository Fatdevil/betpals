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
import { openMaltaSupportModal } from './maltaSupport.js';

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
    document.getElementById('top-header-logo-btn')?.addEventListener('click', () => {
      openAppQrModal();
    });
    document.getElementById('malta-header-support-btn')?.addEventListener('click', () => {
      openMaltaSupportModal();
    });
  }, 0);

  return `
    <div class="top-header">
      <div class="top-header-left">
        ${renderBell()}
      </div>
      <span class="top-header-logo" id="top-header-logo-btn" style="letter-spacing: 0.12em; font-size: 0.85rem; font-weight: 800; cursor: pointer;" title="${currentLang === 'sv' ? 'Dela app / QR-kod 📱' : 'Share app / QR code 📱'}">THE SOCIAL BETWORK</span>
      <div class="top-header-right" style="display: flex; align-items: center; gap: 6px;">
        <button class="top-header-btn" id="malta-header-support-btn" title="Malta AI Kundtjänst 🇲🇹" style="background: rgba(255,215,0,0.1); border: 1px solid rgba(255,215,0,0.3); border-radius: 999px; cursor: pointer; padding: 4px 8px; display: inline-flex; align-items: center; gap: 4px; color: var(--gold); font-size: 0.72rem; font-weight: 700;">
          <img src="/chip-malta-transparent.png" alt="Malta Support" style="width: 16px; height: 16px; object-fit: contain; filter: drop-shadow(0 1px 4px rgba(255,215,0,0.5));" />
          <span>Malta AI</span>
        </button>
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
