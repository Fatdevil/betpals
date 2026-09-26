import { getEvent, getEventQR, placeBet, markBetPaid, connectWebSocket, disconnectWebSocket, onWebSocketMessage, getTournament, boostEvent, updateEventDeadline, lockEvent, reopenEvent } from '../api.js';
import { formatCurrency, formatDate, formatTime, formatOdds, statusLabel, statusBadgeClass, showToast, launchConfetti, escapeHtml, sanitizeUrl, formatDeadline, parseDateSafe, generateIcsDataUrl, generateGoogleCalendarUrl, getAppBaseUrl, renderLoginPrompt, attachLoginPrompt, rememberReturnTo } from '../utils.js';
import { showModal, closeModal } from '../components/modal.js';
import { getStoredUser, isLoggedIn } from '../auth.js';
import { handleWebSocketNotification } from '../components/notifications.js';
import { t } from '../i18n.js';

let wsUnsubscribe = null;
let countdownInterval = null;
let resumeCleanup = null;
// Set while a game page with bettable options is shown; redraws them on live odds
let refreshGameOptions = null;

// iOS closes the WebSocket silently when the app goes to the background (e.g. to pay in
// Swish) and may restore the page from its back/forward cache with stale odds. Refresh the
// event and reconnect when the page becomes visible again.
function watchForResume(params) {
  let hiddenAt = null;
  const refresh = () => {
    if (document.getElementById('page-content') && params?.code) renderEvent(params);
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
    } else if (hiddenAt && Date.now() - hiddenAt > 2000) {
      hiddenAt = null;
      refresh();
    }
  };
  const onPageShow = (e) => {
    if (e.persisted) refresh();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onPageShow);
  };
}

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

  const winnerIdList = event.winnerIds && event.winnerIds.length > 0
    ? event.winnerIds
    : String(event.winnerId || '').split(',').map(s => s.trim()).filter(Boolean);
  const losingBets = event.bets.filter(b => !winnerIdList.includes(b.playerId));
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

  const showLoginPrompt = () => {
    content.innerHTML = renderLoginPrompt('Du behöver vara inloggad för att se matchen och lägga bets. Efter inloggningen kommer du tillbaka hit.');
    attachLoginPrompt(content, { page: 'event', params: { code } });
  };

  content.innerHTML = `<div class="text-center text-muted mt-lg">${t('common.loading')}</div>`;

  try {
    const event = await getEvent(code);

    // The back link shows the event's name
    if (event.tournamentId) {
      try {
        const tour = await getTournament(event.tournamentId);
        event.tournamentName = tour?.name || null;
        event.tournamentCode = tour?.shareCode || null;
      } catch (_) {}
    }

    renderEventContent(event, content, code);

    // Connect WebSocket for live updates
    connectWebSocket(code);
    resumeCleanup = watchForResume(params);
    wsUnsubscribe = onWebSocketMessage((msg) => {
      handleWebSocketNotification(msg);
      if (msg.type === 'odds_update') {
        // Fetch the fresh event so bet counts per option are right too
        getEvent(code).then(fresh => {
          if (refreshGameOptions) {
            refreshGameOptions(fresh);
          } else {
            const oddsEl = document.getElementById('odds-board-container');
            if (oddsEl) oddsEl.innerHTML = renderGameOptions(fresh, { winnerIds: fresh.winnerIds || [], isSelf: fresh.betMode === 'self' });
          }
        }).catch(() => {});
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
    if (err?.authRequired) {
      showLoginPrompt();
      return;
    }
    content.innerHTML = `
      <div class="empty-state animate-in">
        <div class="empty-state-icon">❌</div>
        <p class="empty-state-text">${escapeHtml(err?.message || t('common.error'))}</p>
        <button type="button" class="btn btn-secondary btn-sm" id="event-retry-btn">Försök igen</button>
      </div>`;
    document.getElementById('event-retry-btn')?.addEventListener('click', () => renderEvent(params));
  }
}

// Every option as a big tappable card: name, money and bets on it, and the live odds
function renderGameOptions(event, { interactive = false, selectedId = null, winnerIds = [], isYesNo = false, isSelf = false } = {}) {
  if (!event.players || event.players.length === 0) {
    return '<div class="game-closed-note">Inga alternativ ännu</div>';
  }
  return event.players.map(p => {
    const data = event.odds?.[p.id] || { totalBet: 0, odds: null };
    const count = event.bets.filter(b => b.playerId === p.id).length;
    const isWinner = winnerIds.includes(p.id);
    const icon = isYesNo ? (p.name.toLowerCase() === 'ja' ? '👍 ' : '👎 ') : '';
    return `
      <button type="button" class="game-opt${selectedId === p.id ? ' selected' : ''}${isWinner ? ' winner' : ''}" data-player-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}" ${interactive ? '' : 'disabled'}>
        <span class="game-opt-check">✓</span>
        ${p.imageUrl ? `<img src="${sanitizeUrl(p.imageUrl)}" alt="" class="game-opt-img" />` : ''}
        <span class="game-opt-main">
          <span class="game-opt-name">${icon}${escapeHtml(p.name)}${isWinner ? ' 🏆' : ''}</span>
          <span class="game-opt-sub">${isSelf ? `Med · ${formatCurrency(data.totalBet)}` : count > 0 ? `${formatCurrency(data.totalBet)} · ${count} ${count === 1 ? 'bet' : 'bets'}` : (interactive ? 'Inga bets än' : 'Inga bets')}</span>
        </span>
        ${isSelf ? '' : `<span class="game-opt-odds">${data.odds ? formatOdds(data.odds) : '–'}<small>${data.odds ? 'odds' : (interactive ? 'först ut!' : '')}</small></span>`}
      </button>
    `;
  }).join('');
}

function removeBetslip() {
  document.querySelectorAll('body > .betslip').forEach(el => el.remove());
  document.body.classList.remove('betslip-open');
}

function renderEventContent(event, content, code) {
  removeBetslip();
  const dl = event.closesAt ? formatDeadline(event.closesAt) : null;
  const isLockedOrExpired = event.status === 'locked' || (dl && dl.isExpired);
  const isOpen = event.status === 'open' && (!dl || !dl.isExpired);
  const isFinished = event.status === 'finished';
  // A shared win is stored as a comma-separated list of winner ids
  const winnerIds = event.winnerIds && event.winnerIds.length > 0
    ? event.winnerIds
    : (event.winnerId ? String(event.winnerId).split(',').map(s => s.trim()).filter(Boolean) : []);
  const winner = isFinished ? event.players.find(p => winnerIds.includes(p.id)) : null;
  const winnerNames = event.players.filter(p => winnerIds.includes(p.id)).map(p => p.name).join(' & ');

  const isYesNo = event.players.length === 2 &&
    event.players.some(p => p.name.toLowerCase() === 'ja') &&
    event.players.some(p => p.name.toLowerCase() === 'nej');
  const jaPlayer = isYesNo ? event.players.find(p => p.name.toLowerCase() === 'ja') : null;
  const nejPlayer = isYesNo ? event.players.find(p => p.name.toLowerCase() === 'nej') : null;

  let payoutInfo = null;
  if (isFinished && winnerIds.length > 0) {
    // Same rules as the server: the pool is split equally between the winners that were
    // backed, and each winner's share goes to the bets on that winner.
    const totalPool = event.totalPool || 0;
    const effectivePool = totalPool * (event.payoutPercent / 100);
    const poolByWinner = {};
    for (const wId of winnerIds) {
      poolByWinner[wId] = event.bets.filter(b => b.playerId === wId).reduce((s, b) => s + b.amount, 0);
    }
    const backedWinners = winnerIds.filter(wId => poolByWinner[wId] > 0);
    const hasWinners = backedWinners.length > 0;
    const sharePerWinner = hasWinners ? effectivePool / backedWinners.length : 0;
    const oddsFor = (wId) => poolByWinner[wId] > 0 ? sharePerWinner / poolByWinner[wId] : 0;
    const winnerBets = event.bets.filter(b => winnerIds.includes(b.playerId));

    payoutInfo = {
      totalPool,
      effectivePool,
      odds: backedWinners.length === 1 ? oddsFor(backedWinners[0]) : 1.0,
      noWinners: !hasWinners,
      payouts: hasWinners
        ? winnerBets.map(b => ({
            name: b.bettorName,
            bet: b.amount,
            winnings: +(b.amount * oddsFor(b.playerId)).toFixed(0),
            profit: +(b.amount * oddsFor(b.playerId) - b.amount).toFixed(0)
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

  const isSelf = event.betMode === 'self';
  const canBet = isOpen && !isSelf && loggedIn && Boolean(currentUser?.swishNumber);
  const myBets = currentUser ? event.bets.filter(b => b.userId === currentUser.id) : [];
  const stakeText = event.minBet === event.maxBet
    ? formatCurrency(event.minBet)
    : `${event.minBet}–${event.maxBet} kr`;
  const stakeOptions = [...new Set([event.minBet, 20, 50, 100, 200, 500])]
    .filter(amt => amt >= event.minBet && amt <= event.maxBet)
    .sort((a, b) => a - b)
    .slice(0, 5);
  const statusPill = isFinished
    ? '<span class="game-pill game-pill-done">🏁 Avgjort</span>'
    : event.status === 'cancelled'
      ? '<span class="game-pill game-pill-closed">🛑 Avbrutet</span>'
      : isSelf
        ? '<span class="game-pill game-pill-done">👥 Alla med</span>'
        : isOpen
          ? '<span class="game-pill game-pill-open"><i></i>Öppen</span>'
          : `<span class="game-pill game-pill-closed">${dl && dl.isExpired ? '⌛ Spelstopp' : '🔒 Stängt'}</span>`;

  content.innerHTML = `
    <div class="animate-in game-page">
      ${event.imageUrl ? `
        <div class="event-hero-banner" id="event-hero-banner">
          <img src="${sanitizeUrl(event.imageUrl)}" alt="${escapeHtml(event.name)}" class="event-hero-img" />
          <div class="event-hero-overlay">
            <span class="badge ${statusBadgeClass(event.status)}" style="background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);">${statusLabel(event.status)}</span>
          </div>
        </div>
      ` : ''}

      <!-- Header: back to the event, title, status and small links -->
      <div class="game-head">
        ${event.tournamentId ? `
          <button type="button" class="game-crumb" id="game-back-btn">← ${escapeHtml(event.tournamentName || 'Tillbaka till eventet')}</button>
        ` : ''}
        <h1 class="game-title">${escapeHtml(event.name)}</h1>
        <div class="game-meta">
          ${statusPill}
          ${event.closesAt && dl && !dl.isExpired ? `
            <span>Stänger ${(parseDateSafe(event.closesAt) || new Date()).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} · <span id="countdown-text-el">${dl.shortText}</span></span>
          ` : ''}
        </div>
        <div class="game-links">
          <button type="button" class="game-link" id="event-share-modal-btn">📤 Dela</button>
          ${!isFinished && event.status !== 'cancelled' ? '<button type="button" class="game-link" id="calendar-export-btn">📅 Kalender</button>' : ''}
        </div>
        ${myBets.length > 0 && !isSelf ? `
          <div class="game-mine">✓ Du bettade: ${myBets.map(b => `${escapeHtml((event.players.find(p => p.id === b.playerId) || {}).name || '?')} · ${formatCurrency(b.amount)}`).join(', ')}</div>
        ` : ''}
      </div>

      ${isFinished && winner ? `
        <div class="winner-banner">
          ${winner.imageUrl ? `
            <div style="display: flex; justify-content: center; margin-bottom: var(--space-xs);">
              <img src="${sanitizeUrl(winner.imageUrl)}" alt="${escapeHtml(winner.name)}" class="player-avatar-large" />
            </div>
          ` : ''}
          <div class="winner-label">🏆 ${t('event.winner')}</div>
          <div class="winner-name">${escapeHtml(winnerNames || winner.name)}${winnerIds.length > 1 ? ' 🤝' : ''}</div>
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

      ${isSelf && !isFinished && event.status !== 'cancelled' ? `
        <div class="game-info-card">
          👥 Alla deltagare är med med <strong>${formatCurrency(event.minBet)}</strong> var. Vinnaren tar hela potten – spelledaren korar vinnaren när det är klart.
        </div>
      ` : ''}

      <!-- Options: tap one to open the bet slip -->
      <div class="game-section-label">${canBet ? (myBets.length > 0 ? 'Lägg ett bet till' : 'Välj ditt tips') : isSelf ? 'Deltagare' : 'Tips & odds'}</div>
      <div id="odds-board-container" class="game-options">
        ${renderGameOptions(event, { interactive: canBet, winnerIds, isYesNo, isSelf })}
      </div>

      ${isOpen && !isSelf && !loggedIn ? `
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
      ` : isOpen && !isSelf && !currentUser?.swishNumber ? `
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
      ` : !isOpen && !isSelf && !isFinished && event.status !== 'cancelled' ? `
        <div class="game-closed-note">${dl && dl.isExpired ? '⌛ Spelstopp har passerat' : '🔒 Bettningen är stängd'} – det går inte längre att lägga bets.</div>
      ` : ''}

      <!-- Key numbers -->
      <div class="game-stats">
        <div><b id="total-pool-display">${formatCurrency(event.totalPool || 0)}</b>Pott</div>
        <div><b id="bet-count-display">${event.bets.length}</b>Bets</div>
        <div><b>${stakeText}</b>Insats</div>
        ${event.payoutPercent !== 100 ? `<div><b>${event.payoutPercent}%</b>Utbetalning</div>` : ''}
      </div>

      ${isCreatorOrAdmin && !isFinished && event.status !== 'cancelled' ? `
        <!-- Organiser controls, folded away -->
        <details class="game-host">
          <summary>
            <span>👑 Spelledare</span>
            <span class="game-host-hint">${isOpen ? 'Boosta · Stäng · Spelstopp' : 'Öppna · Spelstopp'} ›</span>
          </summary>
          <div class="game-host-actions">
            ${isOpen ? `
              <button type="button" class="btn btn-primary btn-sm" id="creator-boost-btn">🚀 Boosta spelet</button>
              <button type="button" class="btn btn-secondary btn-sm" id="creator-lock-btn">🔒 Stäng bettning nu</button>
            ` : ''}
            ${isLockedOrExpired ? `
              <button type="button" class="btn btn-secondary btn-sm" id="creator-reopen-btn">🔓 Öppna bettning</button>
            ` : ''}
            <button type="button" class="btn btn-secondary btn-sm" id="creator-deadline-btn">⏰ Ändra spelstopp</button>
          </div>
        </details>
      ` : ''}

      ${canBet ? `
        <!-- Bet slip: slides up when an option is picked -->
        <div class="betslip" id="betslip" hidden>
          <button type="button" class="betslip-close" id="betslip-close" aria-label="Stäng">✕</button>
          <div class="betslip-row"><span>Ditt tips</span><b id="betslip-pick">–</b></div>
          ${event.minBet === event.maxBet ? `
            <div class="betslip-row"><span>Insats</span><b>${formatCurrency(event.minBet)}</b></div>
            <input type="hidden" id="bet-amount" value="${event.minBet}" />
          ` : `
            <div class="betslip-stakes">
              ${stakeOptions.map(amt => `<button type="button" class="betslip-stake${amt === event.minBet ? ' active' : ''}" data-amount="${amt}">${amt} kr</button>`).join('')}
            </div>
            <input type="number" class="form-input betslip-amount" id="bet-amount" inputmode="numeric" min="${event.minBet}" max="${event.maxBet}" step="1" value="${event.minBet}" aria-label="Insats i kr" />
          `}
          <div class="betslip-row"><span>Möjlig vinst just nu</span><b id="betslip-win" class="text-gold">–</b></div>
          <button type="button" class="btn btn-primary btn-block betslip-submit" id="bet-submit-btn">Lägg bet</button>
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

  document.getElementById('game-back-btn')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'tournament', code: event.tournamentCode || event.tournamentId } }));
  });

  if (canBet) {
    const optionsEl = document.getElementById('odds-board-container');
    const slip = document.getElementById('betslip');
    // The page content is animated with a transform, which would pin a fixed element to
    // the page instead of the screen, so the slip lives directly in <body>
    document.body.appendChild(slip);
    const amountInput = document.getElementById('bet-amount');
    const submitBtn = document.getElementById('bet-submit-btn');
    let selectedId = null;
    let liveEvent = event;

    const currentAmount = () => Math.round(Number(amountInput?.value) || 0);

    // Estimated payout if the pool stays as it is: my share of the pool after my bet
    const updateSlip = () => {
      const option = liveEvent.players.find(p => p.id === selectedId);
      const amount = currentAmount();
      document.getElementById('betslip-pick').textContent = option ? option.name : '–';
      const optionPool = liveEvent.odds?.[selectedId]?.totalBet || 0;
      const pool = (liveEvent.totalPool || 0) + amount;
      const win = amount > 0 ? Math.round((amount / (optionPool + amount)) * pool * (liveEvent.payoutPercent / 100)) : 0;
      document.getElementById('betslip-win').textContent = amount > 0 ? `~${formatCurrency(win)}` : '–';
      submitBtn.textContent = amount > 0 ? `Lägg bet · ${formatCurrency(amount)}` : 'Lägg bet';
    };

    const openSlip = () => {
      slip.hidden = false;
      document.body.classList.add('betslip-open');
      updateSlip();
    };
    const closeSlip = () => {
      selectedId = null;
      slip.hidden = true;
      document.body.classList.remove('betslip-open');
      optionsEl.querySelectorAll('.game-opt').forEach(b => b.classList.remove('selected'));
    };

    const bindOptions = () => {
      optionsEl.querySelectorAll('.game-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedId = btn.dataset.playerId;
          optionsEl.querySelectorAll('.game-opt').forEach(b => b.classList.toggle('selected', b === btn));
          openSlip();
        });
      });
    };
    bindOptions();

    // Live odds: redraw the cards but keep the pick and the open slip
    refreshGameOptions = (updated) => {
      liveEvent = { ...liveEvent, ...updated };
      optionsEl.innerHTML = renderGameOptions(liveEvent, { interactive: true, selectedId, winnerIds, isYesNo });
      bindOptions();
      if (selectedId) updateSlip();
    };

    document.getElementById('betslip-close')?.addEventListener('click', closeSlip);

    slip.querySelectorAll('.betslip-stake').forEach(chip => {
      chip.addEventListener('click', () => {
        amountInput.value = chip.dataset.amount;
        slip.querySelectorAll('.betslip-stake').forEach(c => c.classList.toggle('active', c === chip));
        updateSlip();
      });
    });
    amountInput?.addEventListener('input', () => {
      slip.querySelectorAll('.betslip-stake').forEach(c => c.classList.toggle('active', Number(c.dataset.amount) === currentAmount()));
      updateSlip();
    });

    submitBtn.addEventListener('click', async () => {
      const amount = currentAmount();
      if (!selectedId) return;
      if (amount < event.minBet || amount > event.maxBet) {
        showToast(`Insatsen ska vara ${formatCurrency(event.minBet)}–${formatCurrency(event.maxBet)}`, 'error');
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Lägger bet...';
      try {
        await placeBet(code, { playerId: selectedId, amount });
        showToast('🎯 Ditt bet är lagt!', 'success');
        document.body.classList.remove('betslip-open');
        const updated = await getEvent(code);
        updated.tournamentName = event.tournamentName;
        updated.tournamentCode = event.tournamentCode;
        renderEventContent(updated, content, code);
      } catch (err) {
        showToast(err.message, 'error');
        submitBtn.disabled = false;
        updateSlip();
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
  // After logging in (or adding a Swish number) from this page, come back to this match
  content.querySelectorAll('a[href="#profile"]').forEach(link => {
    link.addEventListener('click', () => rememberReturnTo('event', { code }));
  });

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
      if (textEl) textEl.textContent = curDl.shortText;
    }, 1000);
  }

}

function openCalendarModal(event) {
  const startDate = parseDateSafe(event.closesAt) || parseDateSafe(event.date) || new Date();
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const baseUrl = getAppBaseUrl();
  const title = `Malta Betting: ${event.name}`;
  const description = `Spela och lägg dina bets på "${event.name}" i Malta Betting!\nKod: ${event.shareCode}\nLänk: ${baseUrl}/?page=event&code=${event.shareCode}`;
  const icsUrl = generateIcsDataUrl({
    title,
    description,
    startDate,
    endDate,
    url: `${baseUrl}/?page=event&code=${event.shareCode}`
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
    const baseUrl = getAppBaseUrl();
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
  if (resumeCleanup) {
    resumeCleanup();
    resumeCleanup = null;
  }
  if (wsUnsubscribe) {
    wsUnsubscribe();
    wsUnsubscribe = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  refreshGameOptions = null;
  removeBetslip();
}
