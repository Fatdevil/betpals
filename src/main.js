import { renderNavbar } from './components/navbar.js';
import { renderHome } from './pages/home.js';
import { initAds } from './components/ads.js';
import { addFriend, getPartyRoom, joinPartyRoom, connectWebSocket } from './api.js';
import { isLoggedIn, getStoredUser } from './auth.js';
import { showToast } from './utils.js';
import { openBlind10Modal, openMafiaModal, openSpaceInvadersModal } from './components/minigames.js';
import { initMaltaSupportWidget } from './components/maltaSupport.js';
import { setDeferredPrompt, isAppStandalone, shouldShowAutoPrompt, showPwaInstallModal } from './components/pwaInstallModal.js';
import { isPushSupported, subscribeToPush } from './push.js';

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
    const registerSw = () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('[SW] Registration failed:', err);
      });
    };
    if (document.readyState === 'complete') {
      registerSw();
    } else {
      window.addEventListener('load', registerSw);
    }
  }

  // Catch native Android/Chrome prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    setDeferredPrompt(e);
  });

  // If already installed as standalone app on home screen
  if (isAppStandalone()) {
    checkFirstRunPushPrompt();
    return;
  }

  // If running in normal browser, gently offer installation guide after 12s of engagement
  if (shouldShowAutoPrompt()) {
    setTimeout(() => {
      if (!isAppStandalone() && shouldShowAutoPrompt()) {
        const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
        if (isMobile) {
          showPwaInstallModal({ forced: false });
        }
      }
    }, 12000);
  }
}

// ── Standalone First-Run Push Notification Invitation ────
function checkFirstRunPushPrompt() {
  if (!isPushSupported() || !isLoggedIn()) return;
  if (Notification.permission !== 'default') return;

  const PUSH_PROMPT_KEY = 'betpals_first_run_push_asked';
  if (localStorage.getItem(PUSH_PROMPT_KEY)) return;

  setTimeout(async () => {
    if (Notification.permission !== 'default') return;
    localStorage.setItem(PUSH_PROMPT_KEY, '1');

    const { showModal, closeModal } = await import('./components/modal.js');
    showModal(
      '🔔 Blixtsnabba notiser',
      `
        <div class="text-center animate-in" style="padding: 4px;">
          <div style="font-size: 2.8rem; margin-bottom: 8px;">⚡</div>
          <h4 style="margin-bottom: 8px; color: var(--gold); font-weight: 800;">Missa inga BlixtBets!</h4>
          <p class="text-muted" style="font-size: 0.85rem; line-height: 1.45; margin-bottom: var(--space-md);">
            Nu när du har sparat appen kan du få notiser direkt i mobilen när vänner startar ett <strong>BlixtBet</strong> eller utmanar dig på en duell.
          </p>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button class="btn btn-primary btn-block" id="btn-first-run-enable-push" style="font-weight: 700; background: linear-gradient(135deg, var(--gold), #f59e0b); border: none;">
              🔔 Slå på notiser nu
            </button>
            <button class="btn btn-secondary btn-block btn-sm" id="btn-first-run-skip-push">
              Kanske senare
            </button>
          </div>
        </div>
      `,
      null
    );

    document.getElementById('btn-first-run-skip-push')?.addEventListener('click', () => {
      closeModal();
    });

    document.getElementById('btn-first-run-enable-push')?.addEventListener('click', async () => {
      closeModal();
      try {
        await subscribeToPush();
        showToast('🔔 Notiser aktiverade! Du får nu blixtsnabb info i mobilen.', 'success');
      } catch (err) {
        showToast(err.message || 'Kunde inte aktivera notiser', 'error');
      }
    });
  }, 2500);
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

  // Stored session is no longer valid (expired token, or Safari cleared the login)
  window.addEventListener('auth-expired', () => {
    showToast('Din inloggning har gått ut. Logga in igen för att se och betta på matcher. 🔑', 'info');
    renderApp();
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
