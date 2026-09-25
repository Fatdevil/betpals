// ── Page: Home / Dashboard ────────────────────────────
import { getEvents, getTournaments, getActiveFlashLives, getFriendRequests, getPendingDuels, getSettlementsOverview } from '../api.js';
import { formatCurrency, formatDate, parseDateSafe, statusLabel, statusBadgeClass, escapeHtml, showToast, renderLoginPrompt, attachLoginPrompt } from '../utils.js';
import { navigate } from '../main.js';
import { t, getLang } from '../i18n.js';
import { renderMinigamesRoller, attachMinigamesListeners } from '../components/minigames.js';
import { openLiveStreamModal } from '../components/livestream.js';
import { getStoredUser, isLoggedIn } from '../auth.js';
import { openAppQrModal } from '../components/appQrModal.js';
import { renderSponsorCarousel, initSponsorCarousel } from '../components/sponsor-carousel.js';
import { isPushSupported, getPushPermissionState, subscribeToPush } from '../push.js';

export async function renderHome() {
  const isEn = getLang() === 'en';
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div id="home-live-banner-container"></div>
    <div class="page-header animate-in" style="padding-top: 0; margin-top: -4px; margin-bottom: 4px;">
      <div class="home-logo-wrap" id="home-logo-btn" role="button" tabindex="0" style="max-width: 235px; margin: 0 auto; cursor: pointer;" title="Malta Betting">
        <img src="/logo-banner.png" alt="Malta Betting" class="home-logo-banner" />
      </div>
    </div>
    <div id="home-action-feed-container"></div>
    <div id="tournaments-list"></div>
    <div id="events-list">
      <div class="text-center text-muted mt-lg">${t('common.loading')}</div>
    </div>
    ${renderMinigamesRoller()}
    <div id="home-push-banner-container"></div>
  `;

  document.getElementById('home-logo-btn')?.addEventListener('click', () => {
    openAppQrModal();
  });
  document.getElementById('home-logo-btn')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openAppQrModal();
    }
  });

  attachMinigamesListeners();
  initHomeLiveBanners();
  initHomePushBanner(isEn);

  try {
    // Keep the two feeds independent. Previously one failed request (most often an
    // expired login token on iOS/PWA) hid both Events and tournaments because the
    // shared Promise.all rejected before either list was rendered.
    const [eventsResult, tournamentsResult] = await Promise.allSettled([getEvents(), getTournaments()]);
    if (!document.getElementById('events-list') || !document.getElementById('tournaments-list')) return;

    const events = eventsResult.status === 'fulfilled' && Array.isArray(eventsResult.value)
      ? eventsResult.value
      : [];
    const tournaments = tournamentsResult.status === 'fulfilled' && Array.isArray(tournamentsResult.value)
      ? tournamentsResult.value
      : [];
    const eventsError = eventsResult.status === 'rejected' ? eventsResult.reason : null;
    initHomeActionFeed(isEn, events);

    // Tournaments ("Events") are only listed for logged-in users. Without a login (common on
    // iPhone: Safari clears storage after 7 days and the home-screen app has its own login)
    // they would silently be missing, so explain why and offer a login.
    const tList = document.getElementById('tournaments-list');
    if (!isLoggedIn()) {
      tList.innerHTML = renderLoginPrompt(isEn
        ? 'Log in to see your events and bet with your friends.'
        : 'Logga in för att se dina event och betta med kompisarna.');
      attachLoginPrompt(tList);
    } else if (tournaments.length > 0) {
      const hasActive = tournaments.some(t => t.status === 'active');
      const badgeText = hasActive ? 'LIVE' : 'SEASON 2026';
      tList.innerHTML = `
        <div class="section-header-bar">
          <div class="section-header-title">
            <span class="live-dot" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 8px #f59e0b; margin-right: 2px;"></span>
            <img src="/chip-malta-transparent.png" alt="Events" style="width: 20px; height: 20px; object-fit: contain; vertical-align: middle; filter: drop-shadow(0 1px 4px rgba(0,0,0,0.5));" />
            <span>EVENTS</span>
          </div>
          <div class="flex gap-xs" style="align-items: center;">
            <span class="badge badge-accent" style="font-size: 0.65rem; padding: 2px 8px; letter-spacing: 0.05em;">
              ${badgeText}
            </span>
          </div>
        </div>
        ${tournaments.map((tr, i) => `
          <div class="card card-clickable animate-in mb-sm" data-tournament-code="${escapeHtml(tr.shareCode)}"
               style="animation-delay: ${i * 0.08}s">
            <div class="flex-between">
              <div>
                <h3 style="font-family: var(--font-heading); font-weight: 700; font-size: 1.1rem;">${escapeHtml(tr.name)}</h3>
                <p class="text-secondary" style="font-size: 0.8rem; margin-top: 2px;">
                  ${tr.finishedCount}/${tr.roundCount} ${t('home.rounds')} · ${t('home.code')}: <span class="text-gold">${escapeHtml(tr.shareCode)}</span>
                </p>
              </div>
              <span class="badge ${tr.status === 'active' ? 'badge-accent' : 'badge-success'}">
                ${tr.status === 'active' ? t('common.active') : '✅ ' + t('common.finished')}
              </span>
            </div>
            ${tr.banners && tr.banners.length > 0 ? renderSponsorCarousel(tr.banners, {
              carouselId: `home-sponsor-carousel-${i}`,
              showSectionHeader: false
            }) : ''}
          </div>
        `).join('')}
      `;

      tList.querySelectorAll('[data-tournament-code]').forEach(card => {
        card.addEventListener('click', () => {
          navigate('tournament', { code: card.dataset.tournamentCode });
        });
      });

      // Initialize sponsor carousel auto-roll for each tournament
      requestAnimationFrame(() => {
        tournaments.forEach((tr, i) => {
          if (tr.banners && tr.banners.length > 1) {
            const carouselEl = document.getElementById(`home-sponsor-carousel-${i}`);
            if (carouselEl) {
              initSponsorCarousel(carouselEl, tr.banners);
            }
          }
        });
      });
    }

    // Events
    if (events.length === 0 && tournaments.length === 0 && !eventsError) {
      document.getElementById('events-list').innerHTML = `
        <div class="empty-state">
          <div style="display: flex; justify-content: center; margin-bottom: var(--space-md);">
            <img src="/malta-betting-chips.png" alt="Malta Betting" class="animate-in" style="width: 140px; max-width: 60vw; height: auto; object-fit: contain; filter: drop-shadow(0 8px 24px rgba(0,0,0,0.7)) drop-shadow(0 0 16px rgba(255, 215, 0, 0.25));" />
          </div>
          <p class="empty-state-text">${t('home.noEvents')}</p>
          <div class="flex gap-md" style="justify-content: center;">
            <button class="btn btn-primary" id="go-admin-btn">${t('admin.createEvent')}</button>
            <button class="btn btn-secondary" id="go-join-btn">${t('nav.join')}</button>
          </div>
        </div>
      `;
      document.getElementById('go-admin-btn')?.addEventListener('click', () => navigate('admin'));
      document.getElementById('go-join-btn')?.addEventListener('click', () => navigate('join'));
      return;
    }

    const order = { open: 0, locked: 1, finished: 2 };
    events.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

    if (events.length > 0) {
      // Always render a heading. The old condition removed the EVENTS heading for
      // users without a visible tournament, which made the feed look like unrelated
      // cards on the small iPhone viewport.
      const evHeader = `
        <div class="section-header-bar ${tournaments.length > 0 ? 'mt-lg' : ''}">
          <div class="section-header-title">
            <span class="live-dot" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981; margin-right: 2px;"></span>
            <img src="/chip-malta-transparent.png" alt="Events" style="width: 20px; height: 20px; object-fit: contain; vertical-align: middle; filter: drop-shadow(0 1px 4px rgba(0,0,0,0.5));" />
            <span>${t('home.events')}</span>
          </div>
          <span class="badge badge-accent" style="font-size: 0.65rem; padding: 2px 8px; letter-spacing: 0.05em;">
            ${events.length} ${events.length === 1 ? 'MATCH' : 'MATCHES'}
          </span>
        </div>
      `;
      document.getElementById('events-list').innerHTML = evHeader + events.map((ev, i) => `
        <div class="card card-clickable animate-in" data-event-id="${escapeHtml(ev.shareCode)}"
             style="animation-delay: ${(tournaments.length + i) * 0.08}s">
          <div class="flex-between">
            <div>
              <h3 style="font-family: var(--font-heading); font-weight: 700; font-size: 1.1rem;">
                ${escapeHtml(ev.name)}
              </h3>
              <p class="text-secondary" style="font-size: 0.8rem; margin-top: 2px;">
                ${formatDate(ev.date)} · ${ev.playerCount} ${t('home.players')} · ${ev.betCount} ${t('home.predictions')}
              </p>
            </div>
            <span class="badge ${statusBadgeClass(ev.status)}">${statusLabel(ev.status)}</span>
          </div>
          <div class="stats-row mt-md" style="margin-bottom: 0;">
            <div class="stat-card">
              <div class="stat-value">${formatCurrency(ev.totalPool)}</div>
              <div class="stat-label">${t('home.totalPool')}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${ev.payoutPercent}%</div>
              <div class="stat-label">${t('home.payout')}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${escapeHtml(ev.shareCode)}</div>
              <div class="stat-label">${t('home.code')}</div>
            </div>
          </div>
        </div>
      `).join('');
    } else if (eventsError) {
      const needsLogin = eventsError.status === 401;
      document.getElementById('events-list').innerHTML = `
        <div class="card home-events-error" role="status">
          <div class="section-header-title mb-md">⚠️ ${t('home.events')}</div>
          <p class="text-secondary" style="font-size: 0.85rem;">
            ${needsLogin
              ? (isEn ? 'Sign in again to load your events.' : 'Logga in igen för att visa dina events.')
              : (isEn ? 'Events could not be loaded. Try again.' : 'Events kunde inte laddas. Försök igen.')}
          </p>
          <button type="button" class="btn btn-primary btn-sm mt-md" id="home-events-retry">
            ${needsLogin ? (isEn ? 'Sign in' : 'Logga in') : (isEn ? 'Try again' : 'Försök igen')}
          </button>
        </div>
      `;
      document.getElementById('home-events-retry')?.addEventListener('click', () => {
        if (needsLogin) navigate('profile');
        else renderHome();
      });
    } else {
      document.getElementById('events-list').innerHTML = '';
    }

    content.querySelectorAll('[data-event-id]').forEach(card => {
      card.addEventListener('click', () => {
        navigate('event', { code: card.dataset.eventId });
      });
    });

  } catch (err) {
    document.getElementById('events-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p class="empty-state-text">${escapeHtml(err?.message || t('common.error'))}</p>
        <button type="button" class="btn btn-secondary btn-sm" id="home-retry-btn">${isEn ? 'Try again' : 'Försök igen'}</button>
      </div>
    `;
    document.getElementById('home-retry-btn')?.addEventListener('click', () => renderHome());
  }
}

async function initHomeLiveBanners() {
  const container = document.getElementById('home-live-banner-container');
  if (!container) return;

  const renderActiveStreams = (streams) => {
    if (!streams || streams.length === 0) {
      container.innerHTML = '';
      return;
    }

    const s = streams[0];
    container.innerHTML = `
      <div class="animate-in" style="
        background: linear-gradient(135deg, rgba(255, 51, 75, 0.95), rgba(180, 20, 40, 0.95));
        color: #fff;
        border-radius: 12px;
        padding: 10px 14px;
        margin-bottom: 12px;
        box-shadow: 0 4px 20px rgba(255, 51, 75, 0.4);
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        border: 1px solid rgba(255,255,255,0.2);
        animation: pulse 2s infinite;
      " id="home-live-stream-banner">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 1.5rem;">🔴</span>
          <div>
            <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #ffeb3b;">
              SÄNDER LIVE JUST NU
            </div>
            <div style="font-weight: 800; font-size: 0.95rem; line-height: 1.2;">
              ${escapeHtml(s.hostName)}: "${escapeHtml(s.question)}"
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-sm" style="background: #fff; color: #ff334b; font-weight: 800; font-size: 0.8rem; border-radius: 20px; padding: 5px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
          ${s.hasBet ? 'Titta & Betta 👁️' : 'Titta Live 👁️'}
        </button>
      </div>
    `;

    document.getElementById('home-live-stream-banner')?.addEventListener('click', () => {
      const currentUser = getStoredUser();
      const isHost = currentUser && s.hostId && s.hostId === currentUser.id;
      openLiveStreamModal({
        isBroadcaster: isHost,
        isStandalone: true,
        hasBet: s.hasBet !== false,
        liveId: s.id,
        flashBetId: s.flashBetId,
        tournamentName: `${s.hostName} sänder live ⚡`,
        initialQuestion: s.question
      });
    });
  };

  try {
    const active = await getActiveFlashLives();
    renderActiveStreams(active);
  } catch {}

  // Listen to real-time broadcast events
  window.addEventListener('flashlive-stream-updated', async (e) => {
    try {
      const active = await getActiveFlashLives();
      renderActiveStreams(active);
    } catch {}
  });
}

// ── Push Notification Reminder Banner ────────────────────
function initHomePushBanner(isEn) {
  const container = document.getElementById('home-push-banner-container');
  if (!container) return;

  // Don't show if push is unsupported, already granted, or dismissed this session
  if (!isPushSupported() || getPushPermissionState() === 'granted') return;
  if (sessionStorage.getItem('betpals_push_dismissed')) return;

  container.innerHTML = `
    <div id="home-push-banner" class="animate-in" style="
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      padding: 10px 14px; margin-bottom: 12px;
      background: rgba(245, 166, 35, 0.12);
      border: 1px solid rgba(245, 166, 35, 0.35);
      border-radius: 12px;
    ">
      <div style="font-size: 0.8rem; line-height: 1.35; flex: 1;">
        🔔 <strong>${isEn ? 'Enable push notifications' : 'Slå på pushnotiser'}</strong>
        <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 2px;">
          ${isEn ? 'Get notified when friends challenge you or start a FlashBet!' : 'Få notis när polarna utmanar dig eller startar ett BlixtBet!'}
        </div>
      </div>
      <div style="display: flex; gap: 6px; flex-shrink: 0;">
        <button type="button" id="btn-home-enable-push" class="btn btn-sm btn-primary" style="
          padding: 5px 12px; font-size: 0.75rem; font-weight: 700;
          background: linear-gradient(135deg, var(--gold), #e67e22); border: none;
        ">${isEn ? 'Enable' : 'Aktivera'}</button>
        <button type="button" id="btn-home-dismiss-push" class="btn btn-sm" style="
          padding: 5px 8px; font-size: 0.75rem; background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15); color: var(--text-secondary);
        ">✕</button>
      </div>
    </div>
  `;

  document.getElementById('btn-home-enable-push')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-home-enable-push');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      await subscribeToPush();
      showToast('🔔 Pushnotiser aktiverade! Du får nu notiser från polarna.', 'success');
      container.innerHTML = '';
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = isEn ? 'Enable' : 'Aktivera';
    }
  });

  document.getElementById('btn-home-dismiss-push')?.addEventListener('click', () => {
    sessionStorage.setItem('betpals_push_dismissed', '1');
    container.innerHTML = '';
  });
}

async function initHomeActionFeed(isEn, events = []) {
  const container = document.getElementById('home-action-feed-container');
  if (!container || !isLoggedIn()) return;

  const user = getStoredUser();
  try {
    const [friendReqs, pendingDuels, settlements] = await Promise.all([
      getFriendRequests().catch(() => []),
      getPendingDuels().catch(() => []),
      getSettlementsOverview().catch(() => null)
    ]);

    const items = [];

    // 1. Incoming Friend Requests
    const incomingReqs = Array.isArray(friendReqs)
      ? friendReqs.filter(r => r.direction === 'incoming' || !r.direction)
      : (Array.isArray(friendReqs?.incoming) ? friendReqs.incoming : []);
    if (incomingReqs.length > 0) {
      items.push({
        id: 'friend-reqs',
        icon: '👥',
        title: isEn ? `${incomingReqs.length} friend request${incomingReqs.length > 1 ? 's' : ''}` : `${incomingReqs.length} ny vänförfrågan`,
        subtitle: isEn ? 'Tap to view and accept' : 'Tryck för att granska och godkänna',
        badge: isEn ? 'Review' : 'Godkänn',
        badgeClass: 'badge-accent',
        link: '#profile'
      });
    }

    // 2. Pending Duel Challenges
    const challenges = Array.isArray(pendingDuels) ? pendingDuels.filter(d => user && d.opponent_id === user.id && d.status === 'pending') : [];
    if (challenges.length > 0) {
      items.push({
        id: 'duel-challenges',
        icon: '⚔️',
        title: isEn ? `${challenges.length} duel challenge${challenges.length > 1 ? 's' : ''}` : `${challenges.length} utmaning${challenges.length > 1 ? 'ar' : ''} väntar!`,
        subtitle: isEn ? 'Opponent is waiting for you' : 'En kompis utmanar dig på duell',
        badge: isEn ? 'Play' : 'Svara',
        badgeClass: 'badge-warning',
        link: '#arcade'
      });
    }

    // 3. Unsettled Debts
    if (settlements && settlements.totalOwed > 0) {
      items.push({
        id: 'debts',
        icon: '💸',
        title: isEn ? `You owe ${settlements.totalOwed} kr` : `Du ska swisha ${settlements.totalOwed} kr`,
        subtitle: isEn ? 'Net debts across tournaments & tabs' : 'Samlad nettoskuld från turneringar & notor',
        badge: isEn ? 'Swish' : 'Swisha nu',
        badgeClass: 'badge-danger',
        link: '#leaderboard?tab=overview'
      });
    }

    // 4. Closing Bets (< 30 min left)
    const now = Date.now();
    const urgentEvent = (events || []).find(e => {
      if (e.status !== 'open' || !e.closesAt) return false;
      const dt = parseDateSafe(e.closesAt);
      if (!dt) return false;
      const t = dt.getTime();
      return t > now && (t - now) < 30 * 60 * 1000;
    });
    if (urgentEvent) {
      const dt = parseDateSafe(urgentEvent.closesAt);
      const minLeft = dt ? Math.max(1, Math.round((dt.getTime() - now) / 60000)) : 1;
      items.push({
        id: 'urgent-event',
        icon: '⏱️',
        title: isEn ? `Betting closes in ${minLeft} min!` : `Bettning stänger om ${minLeft} min!`,
        subtitle: escapeHtml(urgentEvent.name),
        badge: isEn ? 'Bet' : 'Lägg bet',
        badgeClass: 'badge-accent',
        link: `/?page=event&code=${urgentEvent.shareCode}`
      });
    }

    if (items.length === 0) return;

    container.innerHTML = `
      <div class="card p-sm mb-sm animate-in" style="background: linear-gradient(135deg, rgba(245,158,11,0.12), rgba(20,20,35,0.85)); border: 1.5px solid rgba(245,158,11,0.35); box-shadow: 0 4px 20px rgba(0,0,0,0.4);">
        <div class="flex-between align-center mb-xs" style="padding: 2px 4px;">
          <span style="font-size: 0.75rem; font-weight: 800; color: var(--gold); text-transform: uppercase; letter-spacing: 0.08em;">
            🔔 ${isEn ? 'REQUIRES YOUR ACTION' : 'KRÄVER DITT DRAG'} (${items.length})
          </span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${items.map(item => `
            <a href="${item.link}" class="card-clickable flex-between align-center p-xs" style="background: rgba(255,255,255,0.04); border-radius: var(--radius-sm); text-decoration: none; color: inherit;">
              <div class="flex gap-xs align-center" style="min-width: 0; flex: 1;">
                <span style="font-size: 1.15rem; min-width: 24px; text-align: center;">${item.icon}</span>
                <div style="min-width: 0;">
                  <div style="font-weight: 700; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${item.title}
                  </div>
                  <div style="font-size: 0.72rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${item.subtitle}
                  </div>
                </div>
              </div>
              <span class="badge ${item.badgeClass}" style="font-size: 0.72rem; font-weight: 700; padding: 4px 8px; flex-shrink: 0; margin-left: 8px;">
                ${item.badge} ➜
              </span>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  } catch (e) {
    console.warn('Could not load home action items:', e);
  }
}
