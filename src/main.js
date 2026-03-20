// ── Main: Router & App Init ───────────────────────────
import { renderNavbar } from './components/navbar.js';
import { renderHome } from './pages/home.js';
import { renderEvent, cleanupEvent } from './pages/event.js';
import { renderJoin } from './pages/join.js';
import { renderAdmin } from './pages/admin.js';
import { renderProfile } from './pages/profile.js';
import { renderLeaderboard } from './pages/leaderboard.js';
import { renderTournament } from './pages/tournament.js';
import { initAds } from './components/ads.js';

let currentPage = 'home';
let currentParams = {};

export function navigate(page, params = {}) {
  // Cleanup previous page
  if (currentPage === 'event') cleanupEvent();

  currentPage = page;
  currentParams = params;

  // Update URL
  const url = new URL(window.location);
  url.searchParams.delete('code');
  url.searchParams.set('page', page);
  if (params.code) url.searchParams.set('code', params.code);
  window.history.pushState({}, '', url);

  renderApp();
}

function renderApp() {
  // Render navbar
  document.getElementById('navbar').innerHTML = renderNavbar(currentPage);

  // Attach nav listeners
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.nav);
    });
  });

  // Render current page
  switch (currentPage) {
    case 'home':
      renderHome();
      break;
    case 'event':
      renderEvent(currentParams);
      break;
    case 'join':
      renderJoin();
      break;
    case 'admin':
      renderAdmin();
      break;
    case 'profile':
      renderProfile();
      break;
    case 'leaderboard':
      renderLeaderboard();
      break;
    case 'tournament':
      renderTournament(currentParams);
      break;
    default:
      renderHome();
  }
}

// ── Init ──────────────────────────────────────────────
function init() {
  const url = new URL(window.location);
  const page = url.searchParams.get('page') || 'home';
  const code = url.searchParams.get('code');

  currentPage = page;
  currentParams = code ? { code } : {};

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    const url = new URL(window.location);
    currentPage = url.searchParams.get('page') || 'home';
    const code = url.searchParams.get('code');
    currentParams = code ? { code } : {};
    if (currentPage === 'event') cleanupEvent();
    renderApp();
  });

  // Handle custom navigation events (from profile page etc.)
  window.addEventListener('navigate', (e) => {
    navigate(e.detail.page, e.detail);
  });

  initAds();
  renderApp();
}

init();
