import { renderNavbar } from './components/navbar.js';
import { renderHome } from './pages/home.js';
import { initAds } from './components/ads.js';
import { addFriend, getPartyRoom, joinPartyRoom } from './api.js';
import { isLoggedIn } from './auth.js';
import { showToast } from './utils.js';
import { openBlind10Modal, openMafiaModal } from './components/minigames.js';

let currentPage = 'home';
let currentParams = {};
let activeCleanup = null;

function cleanupActivePage() {
  if (activeCleanup) {
    try { activeCleanup(); } catch {}
    activeCleanup = null;
  }
}

export function navigate(page, params = {}) {
  // Cleanup previous page
  cleanupActivePage();

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

async function renderApp() {
  // Render navbar
  document.getElementById('navbar').innerHTML = renderNavbar(currentPage);

  // Attach nav listeners
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.nav);
    });
  });

  // Render current page (Home is instant, other pages lazy loaded on demand)
  switch (currentPage) {
    case 'home':
      renderHome();
      break;
    case 'event': {
      const { renderEvent, cleanupEvent } = await import('./pages/event.js');
      activeCleanup = cleanupEvent;
      renderEvent(currentParams);
      break;
    }
    case 'join': {
      const { renderJoin } = await import('./pages/join.js');
      renderJoin();
      break;
    }
    case 'admin': {
      const { renderAdmin } = await import('./pages/admin.js');
      renderAdmin();
      break;
    }
    case 'profile': {
      const { renderProfile } = await import('./pages/profile.js');
      renderProfile();
      break;
    }
    case 'leaderboard': {
      const { renderLeaderboard } = await import('./pages/leaderboard.js');
      renderLeaderboard();
      break;
    }
    case 'tournament': {
      const { renderTournament, cleanupTournament } = await import('./pages/tournament.js');
      activeCleanup = cleanupTournament;
      renderTournament(currentParams);
      break;
    }
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
    cleanupActivePage();
    const url = new URL(window.location);
    currentPage = url.searchParams.get('page') || 'home';
    const code = url.searchParams.get('code');
    currentParams = code ? { code } : {};
    renderApp();
  });

  // Handle custom navigation events (from profile page etc.)
  window.addEventListener('navigate', (e) => {
    navigate(e.detail.page, e.detail);
  });

  // Handle language switch
  window.addEventListener('lang-changed', () => {
    renderApp();
  });

  initAds();
  renderApp();

  // Handle friend invite link ?addFriend=nickname
  const addFriendParam = url.searchParams.get('addFriend');
  if (addFriendParam) {
    if (isLoggedIn()) {
      addFriend({ nickname: addFriendParam })
        .then((res) => {
          showToast(`Du och @${res.friend?.nickname || addFriendParam} är nu vänner! 👥🎉`, 'success');
        })
        .catch((err) => {
          if (err.message && (err.message.includes('redan') || err.message.includes('already'))) {
            showToast(`Du och @${addFriendParam} är redan vänner! 👥`, 'info');
          } else {
            showToast(err.message, 'error');
          }
        });
    } else {
      sessionStorage.setItem('pending_friend_invite', addFriendParam);
      showToast(`Logga in eller skapa profil för att bli vän med @${addFriendParam}! 👋`, 'info');
    }
    url.searchParams.delete('addFriend');
    window.history.replaceState({}, '', url);
  }

  // Handle party/room QR link ?party=CODE or ?room=CODE
  const partyParam = (url.searchParams.get('party') || url.searchParams.get('room') || '').trim().toUpperCase();
  if (partyParam) {
    url.searchParams.delete('party');
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);

    handlePartyRoomDeepLink(partyParam);
  }
}

async function handlePartyRoomDeepLink(code) {
  try {
    const res = await getPartyRoom(code);
    const room = res?.room;
    if (!room) {
      showToast('Rummet hittades inte eller har löpt ut', 'error');
      return;
    }

    if (isLoggedIn()) {
      const joinRes = await joinPartyRoom({ code });
      const joinedRoom = joinRes?.room || room;
      const gameLabel = joinedRoom.gameType === 'mafia' ? 'Maffia' : 'The Blind 10.00';
      showToast(`Ansluten till ${gameLabel}! 🎉`, 'success');
      if (joinedRoom.gameType === 'mafia') {
        openMafiaModal(joinedRoom);
      } else {
        openBlind10Modal(joinedRoom);
      }
    } else {
      sessionStorage.setItem('pending_party_join', code);
      showToast(`Skapa profil eller logga in för att gå med i ${room.gameType === 'mafia' ? 'Maffia' : 'The Blind 10.00'}! 🎮`, 'info');
      navigate('profile');
    }
  } catch (err) {
    showToast(err.message || 'Kunde inte ansluta till rummet', 'error');
  }
}

init();
