// ── Page: Home / Dashboard ────────────────────────────
import { getEvents, getTournaments, getActiveFlashLives, getActiveLotto } from '../api.js';
import { formatCurrency, formatDate, statusLabel, statusBadgeClass, escapeHtml } from '../utils.js';
import { navigate } from '../main.js';
import { t, getLang } from '../i18n.js';
import { renderMinigamesRoller, attachMinigamesListeners, openMegaLottoModal } from '../components/minigames.js';
import { openLiveStreamModal } from '../components/livestream.js';
import { getStoredUser } from '../auth.js';

export async function renderHome() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div id="home-live-banner-container"></div>
    <div class="page-header animate-in" style="padding-top: 0; margin-top: -4px; margin-bottom: 4px;">
      <div class="home-logo-wrap" style="max-width: 235px; margin: 0 auto;">
        <img src="/logo-banner.png" alt="Malta Betting" class="home-logo-banner" />
      </div>
    </div>
    ${renderMinigamesRoller()}
    <div id="home-lotto-jackpot-banner-container"></div>
    <div id="tournaments-list"></div>
    <div id="events-list">
      <div class="text-center text-muted mt-lg">${t('common.loading')}</div>
    </div>
  `;

  attachMinigamesListeners();
  initHomeLiveBanners();
  initHomeLottoBanner();

  try {
    const [events, tournaments] = await Promise.all([getEvents(), getTournaments()]);

    // Tournaments
    const tList = document.getElementById('tournaments-list');
    if (tournaments.length > 0) {
      const hasActive = tournaments.some(t => t.status === 'active');
      const badgeText = hasActive ? 'LIVE 🏆' : 'SEASON 2026 🏆';
      tList.innerHTML = `
        <div class="section-header-bar">
          <div class="section-header-title">
            <span class="live-dot" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 8px #f59e0b; margin-right: 2px;"></span>
            <img src="/chip-malta-transparent.png" alt="Tournaments" style="width: 20px; height: 20px; object-fit: contain; vertical-align: middle; filter: drop-shadow(0 1px 4px rgba(0,0,0,0.5));" />
            <span>TOURNAMENTS</span>
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
            ${tr.banners && tr.banners.length > 0 ? `
              <div class="sponsor-carousel mt-sm">
                ${tr.banners.map(b => `
                  <div class="sponsor-slide">
                    <img src="${b.imageData}" alt="${escapeHtml(b.label || 'Sponsor')}" class="sponsor-img" />
                    ${b.label ? `<div class="sponsor-label">${escapeHtml(b.label)}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `).join('')}
      `;

      tList.querySelectorAll('[data-tournament-code]').forEach(card => {
        card.addEventListener('click', () => {
          navigate('tournament', { code: card.dataset.tournamentCode });
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
                MATCHES 🎲
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
      openLiveStreamModal({
        isBroadcaster: false,
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

// ── Kompis-Lotto Home Screen Ticker Banner ───────────────
let homeLottoTimerInterval = null;

async function initHomeLottoBanner() {
  const container = document.getElementById('home-lotto-jackpot-banner-container');
  if (!container) return;

  if (homeLottoTimerInterval) {
    clearInterval(homeLottoTimerInterval);
    homeLottoTimerInterval = null;
  }

  const isEn = getLang() === 'en';

  function formatTimeRemaining(targetIso) {
    if (!targetIso) return '00:00:00';
    const diff = new Date(targetIso).getTime() - Date.now();
    if (diff <= 0) return isEn ? 'DUE NOW' : 'DAGS FÖR DRAGNING!';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function renderLottoBanner(lotto) {
    if (homeLottoTimerInterval) {
      clearInterval(homeLottoTimerInterval);
      homeLottoTimerInterval = null;
    }

    if (!lotto || lotto.status !== 'open') {
      // Empty or finished: remove banner completely until someone starts one from Arcade
      container.innerHTML = '';
      return;
    }

    // Active Malta Jackpot: sleek, compact, and minimized for mobile
    const pot = lotto.jackpot_amount || (lotto.stake_amount || 25);

    container.innerHTML = `
      <div class="home-lotto-banner animate-in" id="home-lotto-clickable-banner">
        <div class="home-lotto-compact-wrap">
          <div class="home-lotto-left-group">
            <span class="home-lotto-badge"><img src="/malta-jackpot.png" alt="" style="width: 14px; height: 14px; object-fit: contain;" /> Malta Jackpot</span>
            <span class="home-lotto-pot" id="home-lotto-pot-val">${pot.toLocaleString()} kr</span>
          </div>
          <div class="home-lotto-right-group">
            <span class="home-lotto-timer" id="home-lotto-timer-val">⏳ ${formatTimeRemaining(lotto.draw_time)}</span>
            <button type="button" class="btn btn-primary btn-sm home-lotto-btn">
              ${lotto.has_participated ? (isEn ? 'Följ 🔮' : 'Följ 🔮') : (isEn ? 'Spela 🎟️' : 'Spela 🎟️')}
            </button>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#home-lotto-clickable-banner')?.addEventListener('click', () => {
      openMegaLottoModal({ tab: lotto.has_participated ? 'draw' : 'play' });
    });

    // Live countdown update
    homeLottoTimerInterval = setInterval(() => {
      const timerValEl = document.getElementById('home-lotto-timer-val');
      if (timerValEl && lotto.draw_time) {
        timerValEl.textContent = `⏳ ${formatTimeRemaining(lotto.draw_time)}`;
      }
    }, 1000);
  }

  try {
    const data = await getActiveLotto();
    renderLottoBanner(data?.lotto);
  } catch (_) {
    renderLottoBanner(null);
  }

  // Real-time listener for lotto events
  const handleLottoUpdate = async () => {
    try {
      const data = await getActiveLotto();
      renderLottoBanner(data?.lotto);
    } catch (_) {}
  };

  window.addEventListener('lotto-updated', handleLottoUpdate);
}

