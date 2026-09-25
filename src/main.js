import { renderNavbar } from './components/navbar.js';
import { renderHome } from './pages/home.js';
import { initAds } from './components/ads.js';
import { addFriend, getPartyRoom, joinPartyRoom, connectWebSocket } from './api.js';
import { isLoggedIn, getStoredUser } from './auth.js';
import { showToast } from './utils.js';
import { openBlind10Modal, openMafiaModal, openSpaceInvadersModal } from './components/minigames.js';
import { initMaltaSupportWidget } from './components/maltaSupport.js';

// ── Global Client Error Reporting ─────────────────────
let reportedErrorsCount = 0;
function reportClientError(errData) {
  if (reportedErrorsCount > 10) return;
  reportedErrorsCount++;
  try {
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...errData,
        url: window.location.href,
        userAgent: navigator.userAgent
      })
    }).catch(() => {});
  } catch (e) {}
}

window.addEventListener('error', (event) => {
  reportClientError({
    message: event.message,
    source: event.filename,
    lineno: event.lineno,
    colno: event.colno
  });
});

window.addEventListener('unhandledrejection', (event) => {
  reportClientError({
    message: event.reason?.message || String(event.reason),
    source: 'unhandledrejection',
    lineno: 0,
    colno: 0
  });
});

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
  url.searchParams.delete('tab');
  url.searchParams.set('page', page);
  if (params.code) url.searchParams.set('code', params.code);
  if (params.tab) url.searchParams.set('tab', params.tab);
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
      renderLeaderboard(currentParams);
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

// ── PWA & Service Worker Initialization ──────────────────
function initPwa() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  // Check if app is already running in standalone mode (installed as home screen app)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
    || window.navigator.standalone === true 
    || document.referrer.includes('android-app://');

  if (isStandalone) {
    return; // Already running as an installed app!
  }

  // Check if dismissed in this session
  if (sessionStorage.getItem('betpals_pwa_banner_dismissed')) {
    return;
  }

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const banner = document.getElementById('pwa-install-banner');
  let deferredPrompt = null;

  const showBanner = (isNative) => {
    if (!banner) return;
    const textEl = banner.querySelector('#pwa-banner-text');
    const btnEl = banner.querySelector('#pwa-install-btn');
    if (textEl && btnEl) {
      if (isIos) {
        textEl.innerHTML = '📲 <strong>Spara som app:</strong> Tryck Dela ⎋ och välj "Lägg till på hemskärmen" ➕';
        btnEl.style.display = 'none';
      } else if (isNative) {
        textEl.innerHTML = '📲 <strong>Spara som app på mobilen!</strong>';
        btnEl.textContent = 'Installera';
        btnEl.style.display = 'inline-block';
      } else {
        textEl.innerHTML = '📲 <strong>Spara som app:</strong> Tryck på menyn ⋮ och välj "Installera app" ➕';
        btnEl.style.display = 'none';
      }
    }
    banner.style.display = 'flex';
  };

  // Catch native Android/Chrome prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showBanner(true);
  });

  // If beforeinstallprompt hasn't fired after 2 seconds (e.g. iOS or Android cooldown), show guide banner
  setTimeout(() => {
    if (!banner || banner.style.display === 'flex') return;
    // Only show on mobile devices
    const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
    if (isMobile) {
      showBanner(false);
    }
  }, 2000);

  document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        if (banner) banner.style.display = 'none';
      }
      deferredPrompt = null;
    }
  });

  document.getElementById('pwa-dismiss-btn')?.addEventListener('click', () => {
    sessionStorage.setItem('betpals_pwa_banner_dismissed', '1');
    if (banner) banner.style.display = 'none';
  });
}

// ── Init ──────────────────────────────────────────────
function init() {
  initPwa();
  const url = new URL(window.location);
  const page = url.searchParams.get('page') || 'home';
  const code = url.searchParams.get('code');
  const tab = url.searchParams.get('tab');

  currentPage = page;
  currentParams = { ...(code ? { code } : {}), ...(tab ? { tab } : {}) };

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    cleanupActivePage();
    const url = new URL(window.location);
    currentPage = url.searchParams.get('page') || 'home';
    const code = url.searchParams.get('code');
    const tab = url.searchParams.get('tab');
    currentParams = { ...(code ? { code } : {}), ...(tab ? { tab } : {}) };
    renderApp();
  });

  // Handle legacy hash navigation fallback (e.g. #admin, #home, #profile, #tournament/CODE, #leaderboard)
  function handleHashRoute() {
    const hash = (window.location.hash || '').replace(/^#\/?/, '');
    if (!hash) return;
    if (hash === 'admin' || hash === 'home' || hash === 'profile' || hash === 'join') {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
      navigate(hash);
    } else if (hash === 'leaderboard' || hash === 'swishlist') {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
      navigate('leaderboard', { tab: hash === 'swishlist' ? 'swishlist' : 'tournaments' });
    } else if (hash.startsWith('tournament/')) {
      const tCode = hash.split('/')[1];
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
      navigate('tournament', { code: tCode });
    }
  }

  window.addEventListener('hashchange', handleHashRoute);
  if (window.location.hash) handleHashRoute();

  // Intercept clicks on hash links in SPA
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href === '#' || href.startsWith('#!')) return;
    const route = href.replace(/^#\/?/, '');
    if (route === 'admin' || route === 'home' || route === 'profile' || route === 'join') {
      e.preventDefault();
      navigate(route);
    } else if (route === 'leaderboard' || route === 'swishlist') {
      e.preventDefault();
      navigate('leaderboard', { tab: route === 'swishlist' ? 'swishlist' : 'tournaments' });
    } else if (route.startsWith('tournament/')) {
      e.preventDefault();
      const tCode = route.split('/')[1];
      navigate('tournament', { code: tCode });
    }
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
  initMaltaSupportWidget();
  renderApp();

  // Handle friend invite link ?addFriend=nickname&ft=token
  const addFriendParam = url.searchParams.get('addFriend');
  if (addFriendParam) {
    const invite = { nickname: addFriendParam, inviteToken: url.searchParams.get('ft') || undefined };
    if (isLoggedIn()) {
      addFriend(invite)
        .then((res) => {
          showToast(res.message || `Du och @${res.friend?.nickname || addFriendParam} är nu vänner! 👥🎉`, res.status === 'pending' ? 'info' : 'success');
        })
        .catch((err) => showToast(err.message, 'error'));
    } else {
      sessionStorage.setItem('pending_friend_invite', JSON.stringify(invite));
      showToast(`Logga in eller skapa profil för att bli vän med @${addFriendParam}! 👋`, 'info');
    }
    url.searchParams.delete('addFriend');
    url.searchParams.delete('ft');
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


  // Connect central WebSocket if logged in
  if (isLoggedIn()) {
    connectWebSocket();
  }

  // Handle live stream deep link ?live=ID or ?liveId=ID
  const liveParam = url.searchParams.get('live') || url.searchParams.get('liveId');
  if (liveParam) {
    url.searchParams.delete('live');
    url.searchParams.delete('liveId');
    window.history.replaceState({}, '', url);

    import('./components/livestream.js').then(({ openLiveStreamModal }) => {
      import('./api.js').then(({ getFlashLive }) => {
        getFlashLive(liveParam).then(({ live, flashBet, livekitToken, livekitUrl }) => {
          const currentUser = getStoredUser();
          const isHost = currentUser && live.hostId === currentUser.id;
          openLiveStreamModal({
            isBroadcaster: isHost,
            isStandalone: true,
            liveId: live.id,
            flashBetId: live.flashBetId,
            hasBet: live.hasBet,
            tournamentName: `${live.hostName} sänder live ⚡`,
            initialQuestion: live.question,
            initialFlashBet: flashBet,
            livekitToken,
            livekitUrl
          });
        }).catch(err => {
          showToast(err.message || 'Kunde inte ansluta till livesändningen', 'error');
        });
      });
    });
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
      const gameLabel = joinedRoom.gameType === 'mafia' ? 'Maffia' : (joinedRoom.gameType === 'space_invaders' ? 'Space Blitz' : 'The Blind 10.00');
      showToast(`Ansluten till ${gameLabel}! 🎉`, 'success');
      if (joinedRoom.gameType === 'mafia') {
        openMafiaModal(joinedRoom);
      } else if (joinedRoom.gameType === 'space_invaders') {
        openSpaceInvadersModal({ mode: 'party', room: joinedRoom });
      } else {
        openBlind10Modal(joinedRoom);
      }
    } else {
      sessionStorage.setItem('pending_party_join', code);
      const gameLabel = room.gameType === 'mafia' ? 'Maffia' : (room.gameType === 'space_invaders' ? 'Space Blitz' : 'The Blind 10.00');
      showToast(`Skapa profil eller logga in för att gå med i ${gameLabel}! 🎮`, 'info');
      navigate('profile');
    }
  } catch (err) {
    showToast(err.message || 'Kunde inte ansluta till rummet', 'error');
  }
}

init();
