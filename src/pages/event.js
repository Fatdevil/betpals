import { getEvent, getEventQR, placeBet, markBetPaid, connectWebSocket, disconnectWebSocket, onWebSocketMessage, getTournament, boostEvent, updateEventDeadline, lockEvent, reopenEvent } from '../api.js';
import { formatCurrency, formatDate, formatTime, formatOdds, statusLabel, statusBadgeClass, showToast, launchConfetti, escapeHtml, sanitizeUrl, formatDeadline, generateIcsDataUrl, generateGoogleCalendarUrl } from '../utils.js';
import { showModal, closeModal } from '../components/modal.js';
import { renderOddsBoard } from '../components/odds-board.js';
import { renderSponsorCarousel, initSponsorCarousel } from '../components/sponsor-carousel.js';
import { getStoredUser, isLoggedIn } from '../auth.js';
import { handleWebSocketNotification } from '../components/notifications.js';
import { t } from '../i18n.js';

let wsUnsubscribe = null;
let eventSponsorCarouselCleanup = null;
let countdownInterval = null;

function renderSettlementSection(event, payoutInfo) {
  if (event.status === 'cancelled') {
    return `
      <div class="section-header"><h2 class="section-title">🛑 Spel Avbrutet</h2></div>
      <div class="card text-center" style="padding: var(--space-lg);">
        <div style="font-size: 2.2rem; margin-bottom: var(--space-xs);">⚠️</div>
        <h3 style="color: var(--danger); margin-bottom: var(--space-xs);">Spelet är inställt / avbrutet</h3>
        <p class="text-muted" style="font-size: 0.85rem;">Inga pengar har dragits och alla lagda bets har återbetalats automatiskt.</p>
      </div>
    `;
  }

  if (payoutInfo?.noWinners) {
    return `
      <div class="section-header"><h2 class="section-title">🤝 Återbetalning</h2></div>
      <div class="card text-center" style="padding: var(--space-lg);">
        <div style="font-size: 2.2rem; margin-bottom: var(--space-xs);">↩️</div>
        <h3 style="color: var(--gold); margin-bottom: var(--space-xs);">Ingen satsade på vinnaren</h3>
        <p class="text-muted" style="font-size: 0.85rem;">Inga deltagare tippade på vinnaren. Spelet räknas som ogiltigförklarat och alla insatser har återbetalats.</p>
      </div>
    `;
  }

  if (event.tournamentId) {
    return `
      <div class="section-header"><h2 class="section-title">🏆 Samlad Avräkning</h2></div>
      <div class="card" style="padding: var(--space-lg); border-left: 4px solid var(--gold);">
        <div class="flex gap-md" style="align-items: center;">
          <div style="font-size: 2.2rem;">📊</div>
          <div>
            <h3 style="font-size: 1rem; color: var(--gold); margin-bottom: 4px;">Ingår i ett Event</h3>
            <p class="text-muted" style="font-size: 0.85rem; margin-bottom: var(--space-sm);">
              Detta spel avräknas inte separat. Resultat, vinster och förluster kvittas automatiskt med övriga spel i <strong>THE TAB</strong>.
            </p>
            <div class="flex gap-sm">
              <a href="/#leaderboard" class="btn btn-primary btn-sm">Gå till THE TAB 📱</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const losingBets = event.bets.filter(b => b.playerId !== event.winnerId);
  if (losingBets.length === 0) return '';

  const currentUser = getStoredUser();

  let html = `<div class="section-header"><h2 class="section-title">🤝 ${t('event.settlement')}</h2></div>`;
  html += '<div class="card">';
  html += '<div class="text-center mb-md">';
  html += '<div style="font-size: 2rem; margin-bottom: var(--space-xs);">🤝</div>';
  html += `<p class="text-muted" style="font-size: 0.85rem;">${t('event.settleDesc')}</p>`;
  if (event.winnerNickname) {
    html += `<p class="text-gold" style="font-size: 0.8rem;">${t('event.winner')}: ${escapeHtml(event.winnerNickname)}</p>`;
  }
  html += '</div>';

  const hasPinSession = !!sessionStorage.getItem('betpals_pin');
  const isCreatorOrAdmin = (currentUser && event.creatorId === currentUser.id) || hasPinSession;

  // Losing bets — who owes what
  html += '<div class="mb-md">';
  html += `<h4 class="text-secondary" style="font-size: 0.8rem; margin-bottom: var(--space-sm);">📋 ${t('event.owes').toUpperCase()}</h4>`;
  losingBets.forEach(b => {
    const isMyBet = currentUser && (b.userId === currentUser.id || (b.bettorName && (currentUser.nickname === b.bettorName || currentUser.real_name === b.bettorName)));
    const canToggle = isMyBet || isCreatorOrAdmin;

    html += '<div class="settle-row">';
    html += '<div>';
    html += '<div class="settle-name">' + escapeHtml(b.bettorName);
    if (isMyBet) html += ` <span class="text-gold" style="font-size: 0.7rem;">(${t('tournament.you')})</span>`;
    html += '</div>';
    html += `<div class="settle-detail">${formatCurrency(b.amount)}</div>`;
    html += '</div>';
    html += '<div class="flex gap-xs" style="align-items: center;">';
    if (b.paid) {
      html += `<span class="badge badge-success" style="font-size: 0.7rem;">${t('event.settled')}</span>`;
      if (isCreatorOrAdmin) {
        html += `<button class="btn btn-sm btn-secondary self-mark-paid-btn" data-bet-id="${b.id}" data-event-id="${event.id}" data-paid="false" title="Ångra kvittering" style="font-size: 0.7rem; padding: 2px 6px;">↩</button>`;
      }
    } else if (canToggle) {
      html += `<button class="btn btn-sm btn-primary self-mark-paid-btn" data-bet-id="${b.id}" data-event-id="${event.id}" data-paid="true">${t('event.markSettled')}</button>`;
    } else {
      html += `<span class="text-muted" style="font-size: 0.7rem;">${t('event.owes')}...</span>`;
    }
    html += '</div></div>';
  });
  html += '</div>';

  // Winners
  if (payoutInfo.payouts.length > 0) {
    html += '<div>';
    html += `<h4 class="text-secondary" style="font-size: 0.8rem; margin-bottom: var(--space-sm);">🏆 ${t('event.winnings').toUpperCase()}</h4>`;
    payoutInfo.payouts.forEach(p => {
      html += '<div class="settle-row">';
      html += '<div>';
      html += `<div class="settle-name">${escapeHtml(p.name)}</div>`;
      html += `<div class="settle-detail">${t('event.winnings')}: ${formatCurrency(p.winnings)} (${t('event.profit')}: +${formatCurrency(p.profit)})</div>`;
      html += '</div>';
      html += `<span class="badge badge-success" style="font-size: 0.75rem;">+${formatCurrency(p.profit)}</span>`;
      html += '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

export async function renderEvent(params = {}) {
  cleanupEvent();
  const content = document.getElementById('page-content');
  const code = params.code;

  if (!code) {
    content.innerHTML = `
      <div class="empty-state animate-in">
        <div class="empty-state-icon">🔍</div>
        <p class="empty-state-text">${t('event.notFound')}</p>
      </div>`;
    return;
  }

  content.innerHTML = `<div class="text-center text-muted mt-lg">${t('common.loading')}</div>`;

  try {
    const event = await getEvent(code);

    // Fallback: If event is in a tournament but banners array is empty, fetch tournament banners
    if ((!event.banners || event.banners.length === 0) && event.tournamentId) {
      try {
        const tour = await getTournament(event.tournamentId);
        if (tour?.banners && tour.banners.length > 0) {
          event.banners = tour.banners;
        }
      } catch (_) {}
    }

    renderEventContent(event, content, code);

    // Connect WebSocket for live updates
    connectWebSocket(code);
    wsUnsubscribe = onWebSocketMessage((msg) => {
      handleWebSocketNotification(msg);
      if (msg.type === 'odds_update') {
        const oddsEl = document.getElementById('odds-board-container');
        if (oddsEl) {
          const updatedEvent = { ...event, odds: msg.odds, totalPool: msg.totalPool };
          oddsEl.innerHTML = renderOddsBoard(updatedEvent);
        }
        const poolEl = document.getElementById('total-pool-display');
        if (poolEl) poolEl.textContent = formatCurrency(msg.totalPool);
        const countEl = document.getElementById('bet-count-display');
        if (countEl) countEl.textContent = msg.betCount;
      } else if (msg.type === 'bet_paid_update') {
        renderEvent(params);
      } else if (msg.type === 'event_locked') {
        showToast(`⚠️ ${t('notifications.eventLocked')}`, 'info');
        setTimeout(() => renderEvent(params), 500);
      } else if (msg.type === 'event_finished') {
        launchConfetti();
        showToast(`🏆 ${msg.winner} ${t('notifications.eventFinished')}`, 'success');
        setTimeout(() => renderEvent(params), 500);
      } else if (msg.type === 'event_reopened') {
        showToast(t('notifications.eventReopened'), 'info');
        setTimeout(() => renderEvent(params), 500);
      } else if (msg.type === 'event_deadline_updated') {
        showToast('⏰ Spelstopp uppdaterat!', 'info');
        setTimeout(() => renderEvent(params), 500);
      }
    });
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state animate-in">
        <div class="empty-state-icon">❌</div>
        <p class="empty-state-text">${err.message}</p>
      </div>`;
  }
}

function renderEventContent(event, content, code) {
  const dl = event.closesAt ? formatDeadline(event.closesAt) : null;
  const isLockedOrExpired = event.status === 'locked' || (dl && dl.isExpired);
  const isOpen = event.status === 'open' && (!dl || !dl.isExpired);
  const isFinished = event.status === 'finished';
  const winner = isFinished ? event.players.find(p => p.id === event.winnerId) : null;

  const isYesNo = event.players.length === 2 &&
    event.players.some(p => p.name.toLowerCase() === 'ja') &&
    event.players.some(p => p.name.toLowerCase() === 'nej');
  const jaPlayer = isYesNo ? event.players.find(p => p.name.toLowerCase() === 'ja') : null;
  const nejPlayer = isYesNo ? event.players.find(p => p.name.toLowerCase() === 'nej') : null;

  let payoutInfo = null;
  if (isFinished && event.winnerId) {
    const totalPool = event.totalPool || 0;
    const effectivePool = totalPool * (event.payoutPercent / 100);
    const winnerBets = event.bets.filter(b => b.playerId === event.winnerId);
    const winnerPool = winnerBets.reduce((s, b) => s + b.amount, 0);
    const hasWinners = winnerPool > 0;
    const winnerOdds = hasWinners ? effectivePool / winnerPool : 1.0;

    payoutInfo = {
      totalPool,
      effectivePool,
      odds: winnerOdds,
      noWinners: !hasWinners,
      payouts: hasWinners
        ? winnerBets.map(b => ({
            name: b.bettorName,
            bet: b.amount,
            winnings: +(b.amount * winnerOdds).toFixed(0),
            profit: +(b.amount * winnerOdds - b.amount).toFixed(0)
          }))
        : event.bets.map(b => ({
            name: b.bettorName,
            bet: b.amount,
            winnings: b.amount,
            profit: 0
          }))
    };
  }

  const hasPlayerImages = event.players.some(p => p.imageUrl);
  const loggedIn = isLoggedIn();
  const currentUser = getStoredUser();
  const hasPinSession = !!sessionStorage.getItem('betpals_pin');
  const isCreatorOrAdmin = (currentUser && event.creatorId === currentUser.id) || hasPinSession;

  content.innerHTML = `
    <div class="animate-in">
      ${event.imageUrl ? `
        <div class="event-hero-banner" id="event-hero-banner">
          <img src="${sanitizeUrl(event.imageUrl)}" alt="${escapeHtml(event.name)}" class="event-hero-img" />
          <div class="event-hero-overlay">
            <span class="badge ${statusBadgeClass(event.status)}" style="background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);">${statusLabel(event.status)}</span>
          </div>
        </div>
      ` : ''}

      <div class="page-header">
        <div class="flex-between" style="align-items: flex-start; gap: 8px;">
          <div>
            <h1 class="page-title" style="margin-bottom: 2px;">${escapeHtml(event.name)}</h1>
            <div class="flex gap-xs" style="align-items: center; font-size: 0.8rem;">
              <span class="page-subtitle" style="margin: 0;">${formatDate(event.date)}</span>
              <span class="text-muted">·</span>
              <span class="text-gold" style="font-weight: 700;">${escapeHtml(event.shareCode)}</span>
            </div>
          </div>
          <div class="flex gap-xs" style="align-items: center; flex-wrap: wrap; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary btn-sm" id="event-share-modal-btn" style="font-size: 0.72rem; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px;">
              📱 Dela
            </button>
            ${!event.closesAt ? `
              <button type="button" class="btn btn-secondary btn-sm" id="calendar-export-btn" style="font-size: 0.72rem; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px;">
                📅 Kalender
              </button>
            ` : ''}
            ${isOpen ? '<span class="live-indicator"><span class="live-dot"></span>LIVE</span>' : ''}
            <span class="badge ${statusBadgeClass(event.status)}">${statusLabel(event.status)}</span>
          </div>
        </div>
      </div>

      ${event.closesAt && !dl.isExpired ? `
        <!-- Active Deadline Banner -->
        <div class="card mb-md" id="deadline-banner" style="border: 1.5px solid var(--gold); background: linear-gradient(135deg, rgba(245,166,35,0.12) 0%, rgba(20,24,39,0.8) 100%); padding: 12px 16px;">
          <div class="flex-between" style="align-items: center; gap: 8px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.6rem;">⏱️</span>
              <div>
                <div style="font-size: 0.72rem; color: var(--gold); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                  Spelstopp / Tidsgräns
                </div>
                <div id="countdown-text-el" style="font-size: 0.95rem; font-weight: 800; color: #fff;">
                  ${dl.text}
                </div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">
                  Stänger: ${new Date(event.closesAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${new Date(event.closesAt).toLocaleDateString([], { month: 'short', day: 'numeric' })})
                </div>
              </div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="calendar-export-btn" style="font-size: 0.75rem; padding: 6px 12px; display: inline-flex; align-items: center; gap: 6px;">
              📅 Lägg till i kalender
            </button>
          </div>
        </div>
      ` : event.closesAt && dl.isExpired && !isFinished && event.status !== 'cancelled' ? `
        <!-- Expired Deadline Banner -->
        <div class="card mb-md" style="border: 1.5px solid #e74c3c; background: rgba(231,76,60,0.1); padding: 12px 16px;">
          <div class="flex-between" style="align-items: center; gap: 8px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.6rem;">⌛</span>
              <div>
                <div style="font-size: 0.72rem; color: #e74c3c; font-weight: 700; text-transform: uppercase;">
                  Spelstopp passerat
                </div>
                <div style="font-size: 0.92rem; font-weight: 800; color: #fff;">
                  Bettningen är stängd för detta spel
                </div>
              </div>
            </div>
            <div class="flex gap-xs" style="align-items: center;">
              <button type="button" class="btn btn-secondary btn-sm" id="calendar-export-btn" style="font-size: 0.75rem; padding: 6px 12px;">
                📅 Kalender
              </button>
              ${isCreatorOrAdmin ? `
                <button type="button" class="btn btn-secondary btn-sm" id="creator-reopen-btn" style="font-size: 0.75rem; padding: 6px 12px;">
                  🔓 Öppna igen
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      ` : ''}

      ${isCreatorOrAdmin && !isFinished && event.status !== 'cancelled' ? `
        <!-- Spelledarkontroll -->
        <div class="card mb-md" style="border: 1.5px solid rgba(245,166,35,0.3); background: rgba(255,255,255,0.03); padding: 10px 14px;">
          <div class="flex-between mb-xs" style="align-items: center;">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--gold); display: flex; align-items: center; gap: 4px;">
              👑 Spelledarkontroll
            </span>
            <span style="font-size: 0.7rem; color: var(--text-muted);">
              ${isOpen ? '🟢 Öppet för bets' : '🔒 Stängt för bets'}
            </span>
          </div>
          <div class="flex gap-xs" style="flex-wrap: wrap;">
            ${isOpen ? `
              <button type="button" class="btn btn-primary btn-sm" id="creator-boost-btn" style="flex: 1; min-width: 120px; font-size: 0.75rem; font-weight: 700; padding: 6px 10px;">
                🚀 Boosta spelet
              </button>
              <button type="button" class="btn btn-secondary btn-sm" id="creator-lock-btn" style="flex: 1; min-width: 120px; font-size: 0.75rem; padding: 6px 10px;">
                🔒 Stäng bettning nu
              </button>
            ` : ''}
            ${isLockedOrExpired ? `
              <button type="button" class="btn btn-secondary btn-sm" id="creator-reopen-btn" style="flex: 1; min-width: 120px; font-size: 0.75rem; padding: 6px 10px;">
                🔓 Öppna bettning
              </button>
            ` : ''}
            <button type="button" class="btn btn-secondary btn-sm" id="creator-deadline-btn" style="font-size: 0.75rem; padding: 6px 10px;">
              ⏰ Ändra spelstopp
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value" id="total-pool-display">${formatCurrency(event.totalPool || 0)}</div>
          <div class="stat-label">${t('event.totalPool')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="bet-count-display">${event.bets.length}</div>
          <div class="stat-label">${t('event.numPredictions')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${event.payoutPercent}%</div>
          <div class="stat-label">${t('event.payout')}</div>
        </div>
      </div>

      ${isFinished && winner ? `
        <div class="winner-banner">
          ${winner.imageUrl ? `
            <div style="display: flex; justify-content: center; margin-bottom: var(--space-xs);">
              <img src="${sanitizeUrl(winner.imageUrl)}" alt="${escapeHtml(winner.name)}" class="player-avatar-large" />
            </div>
          ` : ''}
          <div class="winner-label">🏆 ${t('event.winner')}</div>
          <div class="winner-name">${escapeHtml(winner.name)}</div>
          ${event.winnerImageUrl ? `
            <div class="winner-proof-wrapper">
              <div class="winner-proof-card" id="winner-proof-trigger" data-img="${event.winnerImageUrl}" title="Klicka för fullskärm">
                <img src="${event.winnerImageUrl}" alt="Vinnarbevis" class="winner-proof-img" />
                <div class="winner-proof-badge">📸 Vinnarbevis / Resultat (klicka för fullskärm 🔍)</div>
              </div>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Sponsor Banners -->
      ${event.banners && event.banners.length > 0 ? renderSponsorCarousel(event.banners, {
        isCreator: false,
        carouselId: 'event-sponsor-carousel',
        title: '⭐ Sponsorer',
        showSectionHeader: true
      }) : ''}

      <!-- Odds Board -->
      <div class="section-header">
        <h2 class="section-title">📊 ${t('event.odds')}</h2>
        ${isOpen ? `<span class="live-indicator"><span class="live-dot"></span>${t('event.realtime')}</span>` : ''}
      </div>
      <div id="odds-board-container">
        ${renderOddsBoard(event)}
      </div>

      ${isOpen ? `
        <!-- Prediction Section -->
        <div class="section-header">
          <h2 class="section-title">🎯 ${t('event.placePrediction')}</h2>
        </div>

        ${!loggedIn ? `
          <div class="card text-center" style="padding: var(--space-lg) var(--space-md);">
            <div style="font-size: 2.4rem; margin-bottom: var(--space-xs);">🔐</div>
            <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: var(--space-xs);">${t('event.loginRequiredTitle')}</h3>
            <p class="text-secondary" style="font-size: 0.85rem; margin-bottom: var(--space-md); max-width: 320px; margin-left: auto; margin-right: auto; line-height: 1.4;">
              ${t('event.loginRequiredDesc')}
            </p>
            <a href="#profile" class="btn btn-primary" style="display: inline-block; padding: 10px 24px; text-decoration: none;">
              🔑 ${t('event.loginOrRegister')}
            </a>
          </div>
        ` : !currentUser?.swishNumber ? `
          <div class="card" style="padding: var(--space-md); border: 1.5px solid #e67e22; background: rgba(230, 126, 34, 0.08); text-align: center;">
            <div style="font-size: 2rem; margin-bottom: var(--space-xs);">📱</div>
            <h3 style="font-size: 1.05rem; font-weight: 700; color: #e67e22; margin-bottom: var(--space-xs);">${t('event.swishMissingTitle')}</h3>
            <p class="text-secondary" style="font-size: 0.85rem; margin-bottom: var(--space-md); max-width: 340px; margin-left: auto; margin-right: auto; line-height: 1.4;">
              ${t('event.swishMissingDesc')}
            </p>
            <a href="#profile" class="btn btn-secondary" style="display: inline-block; text-decoration: none;">
              ${t('event.goToProfileSwish')}
            </a>
          </div>
        ` : `
          <div class="card">
            <form id="bet-form">
              <div class="form-group">
                <label class="form-label">${t('event.yourName')}</label>
                <div class="bettor-profile-badge" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-light); border-radius: var(--radius-md);">
                  <span style="font-size: 1.4rem;">${currentUser.avatar || '👤'}</span>
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${escapeHtml(currentUser.realName || currentUser.nickname)}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                      📱 Swish: ${escapeHtml(currentUser.swishNumber)}
                    </div>
                  </div>
                  <span class="badge" style="font-size: 0.7rem; background: rgba(46, 204, 113, 0.15); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.3);">Verifierad</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">${t('event.choosePlayer')}</label>
                ${isYesNo ? `
                  <div class="flex gap-sm mb-xs">
                    <button type="button" class="btn yesno-choice-btn" data-player-id="${jaPlayer.id}" style="flex: 1; padding: 12px; background: rgba(46,204,113,0.15); border: 2px solid #2ecc71; color: #2ecc71; font-weight: 800; font-size: 1.1rem; border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s;">
                      👍 JA
                    </button>
                    <button type="button" class="btn yesno-choice-btn" data-player-id="${nejPlayer.id}" style="flex: 1; padding: 12px; background: rgba(231,76,60,0.15); border: 2px solid #e74c3c; color: #e74c3c; font-weight: 800; font-size: 1.1rem; border-radius: var(--radius-md); cursor: pointer; transition: all 0.2s;">
                      👎 NEJ
                    </button>
                  </div>
                  <select class="form-input" id="bet-player" required style="display: none;">
                    <option value="">${t('event.selectPlayer')}</option>
                    ${event.players.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
                  </select>
                ` : `
                  ${hasPlayerImages ? `
                    <div class="flex gap-xs mb-sm" style="flex-wrap: wrap;">
                      ${event.players.map(p => `
                        <button type="button" class="btn player-quick-btn" data-player-id="${p.id}" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: var(--radius-full); border: 1.5px solid var(--border-light); background: var(--bg-card); cursor: pointer; transition: all 0.2s;">
                          ${p.imageUrl ? `<img src="${sanitizeUrl(p.imageUrl)}" alt="${escapeHtml(p.name)}" class="player-avatar-mini" />` : ''}
                          <span>${escapeHtml(p.name)}</span>
                        </button>
                      `).join('')}
                    </div>
                  ` : ''}
                  <select class="form-input" id="bet-player" required>
                    <option value="">${t('event.selectPlayer')}</option>
                    ${event.players.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
                  </select>
                `}
              </div>
              <div class="form-group">
                <label class="form-label">${t('event.stake')} (${formatCurrency(event.minBet)} – ${formatCurrency(event.maxBet)})</label>
                <div class="quick-stake-pills flex gap-xs mb-xs" style="flex-wrap: wrap; margin-bottom: 8px;">
                  ${[20, 50, 100, 200, 500].filter(amt => amt >= (event.minBet || 1) && amt <= (event.maxBet || 10000)).map(amt => `
                    <button type="button" class="btn btn-xs btn-secondary quick-stake-btn" data-amount="${amt}" style="padding: 5px 12px; font-weight: 700; border-radius: 20px;">
                      ${amt} kr
                    </button>
                  `).join('')}
                </div>
                <input type="number" class="form-input" id="bet-amount"
                       min="${event.minBet}" max="${event.maxBet}" step="1"
                       placeholder="${event.minBet}" required />
              </div>
              <button type="submit" class="btn btn-primary btn-block" id="bet-submit-btn">
                ${t('event.submit')}
              </button>
            </form>
          </div>
        `}
      ` : (!isFinished && event.status !== 'cancelled' && (event.status === 'locked' || (dl && dl.isExpired))) ? `
        <div class="section-header">
          <h2 class="section-title">🎯 ${t('event.placePrediction')}</h2>
        </div>
        <div class="card text-center" style="padding: 24px 16px; border: 1.5px solid rgba(231,76,60,0.3); background: rgba(231,76,60,0.05);">
          <div style="font-size: 2.2rem; margin-bottom: 6px;">${dl && dl.isExpired ? '⌛' : '🔒'}</div>
          <h3 style="font-size: 1rem; font-weight: 700; margin-bottom: 4px; color: ${dl && dl.isExpired ? '#e74c3c' : 'var(--gold)'};">
            ${dl && dl.isExpired ? 'Spelstopp har passerat' : 'Bettning är stängd'}
          </h3>
          <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 0;">Det går inte längre att lägga nya bets på detta spel.</p>
        </div>
      ` : ''}

      ${isFinished && payoutInfo ? `
        <!-- Results -->
        <div class="section-header">
          <h2 class="section-title">📊 ${t('event.results')}</h2>
        </div>
        <div class="card">
          <div class="flex-between mb-md">
            <span class="text-secondary">${t('event.odds')}:</span>
            <span class="text-gold font-bold">${formatOdds(payoutInfo.odds)}</span>
          </div>
          <div class="flex-between mb-md">
            <span class="text-secondary">${t('event.payoutPool')}:</span>
            <span class="font-bold">${formatCurrency(payoutInfo.effectivePool)}</span>
          </div>
          ${payoutInfo.payouts.length > 0 ? `
            <table class="payout-table">
              <thead>
                <tr><th>${t('event.player')}</th><th>${t('event.predicted')}</th><th>${t('event.winnings')}</th><th>${t('event.profit')}</th></tr>
              </thead>
              <tbody>
                ${payoutInfo.payouts.map(p => `
                  <tr>
                    <td>${escapeHtml(p.name)}</td>
                    <td>${formatCurrency(p.bet)}</td>
                    <td class="payout-positive">${formatCurrency(p.winnings)}</td>
                    <td class="${p.profit >= 0 ? 'payout-positive' : 'payout-negative'}">
                      ${p.profit >= 0 ? '+' : ''}${formatCurrency(p.profit)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}
        </div>

        ${renderSettlementSection(event, payoutInfo)}
      ` : ''}

      <!-- All Predictions -->
      ${event.bets.length > 0 ? `
        <div class="section-header">
          <h2 class="section-title">📋 ${t('event.allBets')} (${event.bets.length})</h2>
        </div>
        <div class="bet-list">
          ${event.bets.map(b => {
            const player = event.players.find(p => p.id === b.playerId);
            return `
              <div class="bet-item">
                <div>
                  <div class="bet-item-name">${escapeHtml(b.bettorName)}</div>
                  <div class="bet-item-player">→ ${escapeHtml(player?.name || '?')} · ${formatTime(b.timestamp)}</div>
                </div>
                <div class="bet-item-amount">${formatCurrency(b.amount)}</div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('event-share-modal-btn')?.addEventListener('click', () => {
    openEventShareModal(code, event.name);
  });

  if (isOpen) {
    if (isLoggedIn()) {
      const user = getStoredUser();
      const nameInput = document.getElementById('bet-name');
      if (nameInput && user) nameInput.value = user.nickname;
    }

    document.querySelectorAll('.yesno-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.yesno-choice-btn').forEach(b => {
          b.style.boxShadow = 'none';
          b.style.transform = 'scale(1)';
        });
        btn.style.boxShadow = '0 0 15px currentColor';
        btn.style.transform = 'scale(1.03)';
        const select = document.getElementById('bet-player');
        if (select) select.value = btn.dataset.playerId;
      });
    });

    document.querySelectorAll('.player-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.player-quick-btn').forEach(b => {
          b.style.borderColor = 'var(--border-light)';
          b.style.boxShadow = 'none';
        });
        btn.style.borderColor = 'var(--gold)';
        btn.style.boxShadow = '0 0 10px var(--gold-glow)';
        const select = document.getElementById('bet-player');
        if (select) select.value = btn.dataset.playerId;
      });
    });

    const form = document.getElementById('bet-form');
    form?.querySelectorAll('.quick-stake-btn').forEach(qBtn => {
      qBtn.addEventListener('click', () => {
        const amt = qBtn.getAttribute('data-amount');
        const input = document.getElementById('bet-amount');
        if (input) {
          input.value = amt;
          input.dispatchEvent(new Event('input'));
        }
        form.querySelectorAll('.quick-stake-btn').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        qBtn.classList.remove('btn-secondary');
        qBtn.classList.add('btn-primary');
      });
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('bet-submit-btn');
      btn.disabled = true;
      btn.textContent = '...';

      try {
        await placeBet(code, {
          playerId: document.getElementById('bet-player').value,
          amount: Number(document.getElementById('bet-amount').value)
        });
        showToast('🎯 ' + t('event.submit').replace('🎯', '').trim() + '!', 'success');
        const updated = await getEvent(code);
        renderEventContent(updated, content, code);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = t('event.submit');
      }
    });
  }

  // Winner proof lightbox (runs for finished events)
  const proofTrigger = document.getElementById('winner-proof-trigger');
  if (proofTrigger) {
    proofTrigger.addEventListener('click', () => {
      const imgUrl = proofTrigger.dataset.img;
      const lightbox = document.createElement('div');
      lightbox.className = 'lightbox';
      lightbox.innerHTML = `
        <button class="lightbox-close">&times;</button>
        <img src="${imgUrl}" alt="Vinnarbevis" />
        <div class="lightbox-caption">📸 Vinnarbevis / Resultat</div>
      `;
      document.body.appendChild(lightbox);
      lightbox.addEventListener('click', () => lightbox.remove());
    });
  }

  // Self-mark settled buttons
  document.querySelectorAll('.self-mark-paid-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const paidState = btn.dataset.paid !== 'false';
        await markBetPaid(btn.dataset.eventId, btn.dataset.betId, paidState);
        showToast(paidState ? t('event.settled') : 'Kvittering ångrad', 'success');
        const updated = await getEvent(code);
        renderEventContent(updated, content, code);
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  // Calendar export
  document.querySelectorAll('#calendar-export-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openCalendarModal(event);
    });
  });

  // Creator Controls
  document.getElementById('creator-boost-btn')?.addEventListener('click', async () => {
    if (!confirm(`🚀 Boosta "${event.name}"?\n\nDetta skickar en pushnotis till alla deltagare i eventet för att påminna dem om att lägga sina bets!`)) return;
    try {
      await boostEvent(event.id);
      launchConfetti();
      showToast('Spelet boostat med pushnotis! 🚀', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('creator-lock-btn')?.addEventListener('click', async () => {
    if (!confirm(`Vill du stänga bettningen för "${event.name}" nu? Inga fler bets kommer tas emot.`)) return;
    try {
      const pin = sessionStorage.getItem('betpals_pin') || '';
      await lockEvent(event.id, pin);
      showToast('Bettning stängd! 🔒', 'info');
      const updated = await getEvent(code);
      renderEventContent(updated, content, code);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('creator-reopen-btn')?.addEventListener('click', async () => {
    if (!confirm(`Vill du öppna bettningen för "${event.name}" igen?`)) return;
    try {
      const pin = sessionStorage.getItem('betpals_pin') || '';
      const reopenRes = await reopenEvent(event.id, pin);
      showToast(reopenRes?.status === 'locked' ? reopenRes.message : 'Bettningen är öppen igen! 🔓', reopenRes?.status === 'locked' ? 'info' : 'success');
      const updated = await getEvent(code);
      renderEventContent(updated, content, code);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('creator-deadline-btn')?.addEventListener('click', () => {
    openDeadlineModal(event, content, code);
  });

  // Countdown ticking interval
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (event.closesAt && dl && !dl.isExpired) {
    countdownInterval = setInterval(() => {
      const curDl = formatDeadline(event.closesAt);
      if (!curDl || curDl.isExpired) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        getEvent(code).then(updated => renderEventContent(updated, content, code));
        return;
      }
      const textEl = document.getElementById('countdown-text-el');
      if (textEl) textEl.textContent = curDl.text;
    }, 1000);
  }

  // Initialize sponsor carousel auto-roll if banners present
  if (event.banners && event.banners.length > 0) {
    if (eventSponsorCarouselCleanup) {
      eventSponsorCarouselCleanup();
      eventSponsorCarouselCleanup = null;
    }
    requestAnimationFrame(() => {
      const carouselEl = document.getElementById('event-sponsor-carousel');
      if (carouselEl) {
        eventSponsorCarouselCleanup = initSponsorCarousel(carouselEl, event.banners);
      }
    });
  }
}

function openCalendarModal(event) {
  const startDate = event.closesAt ? new Date(event.closesAt) : (event.date ? new Date(event.date) : new Date());
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const title = `Malta Betting: ${event.name}`;
  const description = `Spela och lägg dina bets på "${event.name}" i Malta Betting!\nKod: ${event.shareCode}\nLänk: ${window.location.origin}/?page=event&code=${event.shareCode}`;
  const icsUrl = generateIcsDataUrl({
    title,
    description,
    startDate,
    endDate,
    url: `${window.location.origin}/?page=event&code=${event.shareCode}`
  });
  const googleCalUrl = generateGoogleCalendarUrl({
    title,
    description,
    startDate,
    endDate,
    location: 'Malta Betting'
  });

  showModal('📅 Lägg till i kalender', `
    <div class="text-center" style="padding: 10px 0;">
      <div style="font-size: 2.2rem; margin-bottom: 8px;">📅</div>
      <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 6px;">${escapeHtml(event.name)}</h3>
      <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 18px;">
        Glöm inte matchen och spelstoppet! Lägg till i din mobilkalender.
      </p>
      <div class="flex gap-sm" style="flex-direction: column;">
        <a href="${icsUrl}" download="${encodeURIComponent(event.name)}.ics" class="btn btn-primary btn-block" style="text-decoration: none; padding: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px;">
          🍏 Apple Kalender / Outlook (.ics)
        </a>
        <a href="${googleCalUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-block" style="text-decoration: none; padding: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px;">
          📱 Google Kalender
        </a>
      </div>
    </div>
  `);
}

function openDeadlineModal(event, content, code) {
  showModal('⏰ Ändra spelstopp / Tidsgräns', `
    <form id="edit-deadline-form">
      <div class="form-group mb-sm">
        <label class="form-label mb-xs">Välj ny tidsgräns för "${escapeHtml(event.name)}"</label>
        <div class="flex gap-xs" style="flex-wrap: wrap; margin-bottom: 8px;" id="modal-deadline-buttons">
          <button type="button" class="btn btn-sm btn-secondary modal-dl-btn selected" data-min="0" style="font-size: 0.72rem; padding: 4px 8px; border: 1.5px solid var(--gold); background: rgba(245,166,35,0.12);">
            ♾️ Ingen tidsgräns
          </button>
          <button type="button" class="btn btn-sm btn-secondary modal-dl-btn" data-min="15" style="font-size: 0.72rem; padding: 4px 8px;">
            ⏱️ 15 min
          </button>
          <button type="button" class="btn btn-sm btn-secondary modal-dl-btn" data-min="30" style="font-size: 0.72rem; padding: 4px 8px;">
            ⏱️ 30 min
          </button>
          <button type="button" class="btn btn-sm btn-secondary modal-dl-btn" data-min="60" style="font-size: 0.72rem; padding: 4px 8px;">
            ⏱️ 1 timme
          </button>
          <button type="button" class="btn btn-sm btn-secondary modal-dl-btn" data-min="120" style="font-size: 0.72rem; padding: 4px 8px;">
            ⏱️ 2 timmar
          </button>
          <button type="button" class="btn btn-sm btn-secondary modal-dl-btn" data-min="custom" style="font-size: 0.72rem; padding: 4px 8px;">
            📅 Kalender
          </button>
        </div>
        <div id="modal-custom-dl-container" style="display: none; margin-top: 6px;">
          <input type="datetime-local" class="form-input" id="modal-custom-dl-input" style="font-size: 0.85rem;" />
        </div>
        <div id="modal-dl-preview" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 6px;">
          Spelet kommer vara öppet tills det stängs manuellt.
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-block" style="padding: 10px; font-weight: 700;">
        Spara spelstopp 💾
      </button>
    </form>
  `);

  let newClosesAt = null;
  const dlBtns = document.querySelectorAll('.modal-dl-btn');
  const customCont = document.getElementById('modal-custom-dl-container');
  const customInp = document.getElementById('modal-custom-dl-input');
  const preview = document.getElementById('modal-dl-preview');

  dlBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dlBtns.forEach(b => {
        b.style.border = '1px solid var(--border-light)';
        b.style.background = 'var(--bg-card)';
      });
      btn.style.border = '1.5px solid var(--gold)';
      btn.style.background = 'rgba(245,166,35,0.12)';

      const min = btn.dataset.min;
      if (min === '0') {
        newClosesAt = null;
        if (customCont) customCont.style.display = 'none';
        if (preview) preview.textContent = 'Spelet kommer vara öppet tills det stängs manuellt.';
      } else if (min === 'custom') {
        if (customCont) customCont.style.display = 'block';
        if (customInp) {
          if (!customInp.value) {
            const d = new Date(Date.now() + 60 * 60 * 1000);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            customInp.value = d.toISOString().slice(0, 16);
          }
          newClosesAt = new Date(customInp.value).toISOString();
          if (preview) preview.textContent = `Nytt spelstopp: ${new Date(customInp.value).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} 📅`;
        }
      } else {
        const minNum = Number(min);
        const target = new Date(Date.now() + minNum * 60 * 1000);
        newClosesAt = target.toISOString();
        if (customCont) customCont.style.display = 'none';
        if (preview) preview.textContent = `Nytt spelstopp: kl ${target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (om ${minNum} min) ⏱️`;
      }
    });
  });

  customInp?.addEventListener('input', () => {
    if (customInp.value) {
      newClosesAt = new Date(customInp.value).toISOString();
      if (preview) preview.textContent = `Nytt spelstopp: ${new Date(customInp.value).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} 📅`;
    }
  });

  document.getElementById('edit-deadline-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await updateEventDeadline(event.id, newClosesAt);
      closeModal();
      showToast('Spelstopp uppdaterat! ⏰', 'success');
      const updated = await getEvent(code);
      renderEventContent(updated, content, code);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function openEventShareModal(code, eventName) {
  try {
    const baseUrl = window.location.origin;
    const data = await getEventQR(code, baseUrl);
    const shareUrl = `${baseUrl}/?page=event&code=${code}`;
    const shareMsg = `🎲 Häng på och lägg dina bets på "${eventName || 'spelet'}" i Malta Betting! Länk: ${shareUrl}`;

    showModal('📱 Dela spel', `
      <div class="text-center">
        <img src="${data.qr}" alt="QR ${code}" style="width: 200px; height: 200px; border-radius: var(--radius-md); margin-bottom: var(--space-md);" />
        <p class="text-muted" style="font-size: 0.8rem; margin-bottom: var(--space-md);">${t('event.scanToJoin')}</p>
        <div class="flex gap-sm mb-md">
          <input type="text" class="form-input" value="${shareUrl}" readonly id="event-share-url" style="flex: 1; font-size: 0.75rem;" />
          <button class="btn btn-sm btn-primary" id="event-copy-url-btn">📋</button>
        </div>
        <div class="flex gap-xs" style="justify-content: center; flex-wrap: wrap;">
          <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(shareMsg)}" target="_blank" rel="noopener" class="btn btn-sm" style="background: #25D366; color: white; text-decoration: none; font-size: 0.8rem; flex: 1;">
            💬 WhatsApp
          </a>
          <a href="sms:?&body=${encodeURIComponent(shareMsg)}" class="btn btn-sm" style="background: #3498db; color: white; text-decoration: none; font-size: 0.8rem; flex: 1;">
            📱 SMS
          </a>
          ${navigator.share ? `
            <button class="btn btn-sm btn-secondary" id="event-native-share-btn" style="font-size: 0.8rem; flex: 1;">
              📤 Fler...
            </button>
          ` : ''}
        </div>
      </div>
    `);

    document.getElementById('event-copy-url-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(shareUrl);
      showToast('Länk kopierad! ✅', 'success');
    });

    document.getElementById('event-native-share-btn')?.addEventListener('click', async () => {
      try {
        await navigator.share({ title: eventName || 'Malta Betting', text: shareMsg, url: shareUrl });
      } catch {}
    });
  } catch (err) {
    showToast('Kunde inte generera QR-kod', 'error');
  }
}

export function cleanupEvent() {
  disconnectWebSocket();
  if (wsUnsubscribe) {
    wsUnsubscribe();
    wsUnsubscribe = null;
  }
  if (eventSponsorCarouselCleanup) {
    eventSponsorCarouselCleanup();
    eventSponsorCarouselCleanup = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}
