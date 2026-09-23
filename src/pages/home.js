// ── Page: Home / Dashboard ────────────────────────────
import { getEvents, getTournaments, getActiveFlashLives } from '../api.js';
import { formatCurrency, formatDate, statusLabel, statusBadgeClass, escapeHtml, showToast } from '../utils.js';
import { navigate } from '../main.js';
import { t, getLang } from '../i18n.js';
import { renderMinigamesRoller, attachMinigamesListeners } from '../components/minigames.js';
import { openLiveStreamModal } from '../components/livestream.js';
import { getStoredUser } from '../auth.js';
import { openAppQrModal } from '../components/appQrModal.js';
import { renderSponsorCarousel, initSponsorCarousel } from '../components/sponsor-carousel.js';
import { isPushSupported, getPushPermissionState, subscribeToPush } from '../push.js';

export async function renderHome() {
  const isEn = getLang() === 'en';
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div id="home-live-banner-container"></div>
    <div class="page-header animate-in" style="padding-top: 0; margin-top: -4px; margin-bottom: 4px;">
      <div class="home-logo-wrap" id="home-logo-btn" role="button" tabindex="0" style="max-width: 235px; margin: 0 auto; cursor: pointer;" title="BetPals / Malta Betting">
        <img src="/logo-banner.png" alt="Malta Betting" class="home-logo-banner" />
      </div>
    </div>
    ${renderMinigamesRoller()}
    <div id="home-push-banner-container"></div>
    <div id="tournaments-list"></div>
    <div id="events-list">
      <div class="text-center text-muted mt-lg">${t('common.loading')}</div>
    </div>
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
    const [events, tournaments] = await Promise.all([getEvents(), getTournaments()]);

    // Tournaments
    const tList = document.getElementById('tournaments-list');
    if (tournaments.length > 0) {
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
    if (events.length === 0 && tournaments.length === 0) {
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
      const evHeader = tournaments.length > 0 
        ? `
          <div class="section-header-bar mt-lg">
            <div class="section-header-title">
              <span class="live-dot" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981; margin-right: 2px;"></span>
              <img src="/chip-malta-transparent.png" alt="Matches" style="width: 20px; height: 20px; object-fit: contain; vertical-align: middle; filter: drop-shadow(0 1px 4px rgba(0,0,0,0.5));" />
              <span>${t('home.events')}</span>
            </div>
            <div class="flex gap-xs" style="align-items: center;">
              <span class="badge badge-accent" style="font-size: 0.65rem; padding: 2px 8px; letter-spacing: 0.05em;">
                MATCHES
              </span>
            </div>
          </div>
        ` 
        : '';
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
        <p class="empty-state-text">${t('common.error')}</p>
      </div>
    `;
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
