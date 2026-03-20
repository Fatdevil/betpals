// ── Page: Event (view + predict + WebSocket live odds + QR) ──
import { getEvent, getEventQR, placeBet, markBetPaid, connectWebSocket, disconnectWebSocket, onWebSocketMessage } from '../api.js';
import { formatCurrency, formatDate, formatTime, formatOdds, statusLabel, statusBadgeClass, showToast, launchConfetti } from '../utils.js';
import { renderOddsBoard } from '../components/odds-board.js';
import { getStoredUser, isLoggedIn } from '../auth.js';
import { handleWebSocketNotification } from '../components/notifications.js';
import { t } from '../i18n.js';

let wsUnsubscribe = null;

function renderSettlementSection(event, payoutInfo) {
  const losingBets = event.bets.filter(b => b.playerId !== event.winnerId);
  if (losingBets.length === 0) return '';

  const currentUser = getStoredUser();

  let html = `<div class="section-header"><h2 class="section-title">🤝 ${t('event.settlement')}</h2></div>`;
  html += '<div class="card">';
  html += '<div class="text-center mb-md">';
  html += '<div style="font-size: 2rem; margin-bottom: var(--space-xs);">🤝</div>';
  html += `<p class="text-muted" style="font-size: 0.85rem;">${t('event.settleDesc')}</p>`;
  if (event.winnerNickname) {
    html += `<p class="text-gold" style="font-size: 0.8rem;">${t('event.winner')}: ${event.winnerNickname}</p>`;
  }
  html += '</div>';

  // Losing bets — who owes what
  html += '<div class="mb-md">';
  html += `<h4 class="text-secondary" style="font-size: 0.8rem; margin-bottom: var(--space-sm);">📋 ${t('event.owes').toUpperCase()}</h4>`;
  losingBets.forEach(b => {
    const isMyBet = currentUser && b.userId === currentUser.id;

    html += '<div class="settle-row">';
    html += '<div>';
    html += '<div class="settle-name">' + b.bettorName;
    if (isMyBet) html += ` <span class="text-gold" style="font-size: 0.7rem;">(${t('tournament.you')})</span>`;
    html += '</div>';
    html += `<div class="settle-detail">${formatCurrency(b.amount)}</div>`;
    html += '</div>';
    html += '<div class="flex gap-xs" style="align-items: center;">';
    if (b.paid) {
      html += `<span class="badge badge-success" style="font-size: 0.7rem;">${t('event.settled')}</span>`;
    } else if (isMyBet) {
      html += `<button class="btn btn-sm btn-primary self-mark-paid-btn" data-bet-id="${b.id}" data-event-id="${event.id}">${t('event.markSettled')}</button>`;
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
      html += `<div class="settle-name">${p.name}</div>`;
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
    renderEventContent(event, content, code);

    // Connect WebSocket for live updates
    if (event.status === 'open') {
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
        }
      });
    }
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state animate-in">
        <div class="empty-state-icon">❌</div>
        <p class="empty-state-text">${err.message}</p>
      </div>`;
  }
}

function renderEventContent(event, content, code) {
  const isOpen = event.status === 'open';
  const isFinished = event.status === 'finished';
  const winner = isFinished ? event.players.find(p => p.id === event.winnerId) : null;

  let payoutInfo = null;
  if (isFinished && event.winnerId) {
    const totalPool = event.totalPool || 0;
    const effectivePool = totalPool * (event.payoutPercent / 100);
    const winnerBets = event.bets.filter(b => b.playerId === event.winnerId);
    const winnerPool = winnerBets.reduce((s, b) => s + b.amount, 0);
    const winnerOdds = winnerPool > 0 ? effectivePool / winnerPool : 0;

    payoutInfo = {
      totalPool,
      effectivePool,
      odds: winnerOdds,
      payouts: winnerBets.map(b => ({
        name: b.bettorName,
        bet: b.amount,
        winnings: +(b.amount * winnerOdds).toFixed(0),
        profit: +(b.amount * winnerOdds - b.amount).toFixed(0)
      }))
    };
  }

  content.innerHTML = `
    <div class="animate-in">
      <div class="page-header">
        <div class="flex-between">
          <h1 class="page-title">${event.name}</h1>
          <div class="flex gap-sm" style="align-items: center;">
            ${isOpen ? '<span class="live-indicator"><span class="live-dot"></span>LIVE</span>' : ''}
            <span class="badge ${statusBadgeClass(event.status)}">${statusLabel(event.status)}</span>
          </div>
        </div>
        <p class="page-subtitle">${formatDate(event.date)}</p>
      </div>

      <!-- Share Code + QR -->
      <div class="share-code-display" style="flex-direction: column; gap: var(--space-md);">
        <div style="text-align: center;">
          <div class="share-code-label">${t('home.code')}</div>
          <div class="share-code-text">${event.shareCode}</div>
        </div>
        <div class="qr-container" id="qr-container">
          <div class="text-muted" style="font-size: 0.8rem;">${t('common.loading')}</div>
        </div>
      </div>

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
          <div class="winner-label">🏆 ${t('event.winner')}</div>
          <div class="winner-name">${winner.name}</div>
        </div>
      ` : ''}

      <!-- Odds Board -->
      <div class="section-header">
        <h2 class="section-title">📊 ${t('event.odds')}</h2>
        ${isOpen ? `<span class="live-indicator"><span class="live-dot"></span>${t('event.realtime')}</span>` : ''}
      </div>
      <div id="odds-board-container">
        ${renderOddsBoard(event)}
      </div>

      ${isOpen ? `
        <!-- Prediction Form -->
        <div class="section-header">
          <h2 class="section-title">🎯 ${t('event.placePrediction')}</h2>
        </div>
        <div class="card">
          <form id="bet-form">
            <div class="form-group">
              <label class="form-label">${t('event.yourName')}</label>
              <input type="text" class="form-input" id="bet-name" placeholder="${t('event.yourName')}" required />
            </div>
            <div class="form-group">
              <label class="form-label">${t('event.choosePlayer')}</label>
              <select class="form-input" id="bet-player" required>
                <option value="">${t('event.selectPlayer')}</option>
                ${event.players.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">${t('event.stake')} (${formatCurrency(event.minBet)} – ${formatCurrency(event.maxBet)})</label>
              <input type="number" class="form-input" id="bet-amount"
                     min="${event.minBet}" max="${event.maxBet}" step="1"
                     placeholder="${event.minBet}" required />
            </div>
            <button type="submit" class="btn btn-primary btn-block" id="bet-submit-btn">
              ${t('event.submit')}
            </button>
          </form>
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
                    <td>${p.name}</td>
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
                  <div class="bet-item-name">${b.bettorName}</div>
                  <div class="bet-item-player">→ ${player?.name || '?'} · ${formatTime(b.timestamp)}</div>
                </div>
                <div class="bet-item-amount">${formatCurrency(b.amount)}</div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;

  loadQRCode(code);

  if (isOpen) {
    if (isLoggedIn()) {
      const user = getStoredUser();
      const nameInput = document.getElementById('bet-name');
      if (nameInput && user) nameInput.value = user.nickname;
    }

    const form = document.getElementById('bet-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('bet-submit-btn');
      btn.disabled = true;
      btn.textContent = '...';

      try {
        await placeBet(code, {
          bettorName: document.getElementById('bet-name').value.trim(),
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

  // Self-mark settled buttons
  document.querySelectorAll('.self-mark-paid-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await markBetPaid(btn.dataset.eventId, btn.dataset.betId, true);
        showToast(t('event.settled'), 'success');
        const updated = await getEvent(code);
        renderEventContent(updated, content, code);
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}

async function loadQRCode(code) {
  try {
    const baseUrl = window.location.origin;
    const data = await getEventQR(code, baseUrl);
    const container = document.getElementById('qr-container');
    if (container) {
      container.innerHTML = `
        <img src="${data.qr}" alt="QR ${code}" />
        <span class="qr-label">${t('event.scanToJoin')}</span>
      `;
    }
  } catch (e) {
    const container = document.getElementById('qr-container');
    if (container) container.innerHTML = '';
  }
}

export function cleanupEvent() {
  disconnectWebSocket();
  if (wsUnsubscribe) {
    wsUnsubscribe();
    wsUnsubscribe = null;
  }
}
