// ── Page: Event (view + predict + WebSocket live odds + QR) ──
import { getEvent, getEventQR, placeBet, markBetPaid, connectWebSocket, disconnectWebSocket, onWebSocketMessage } from '../api.js';
import { formatCurrency, formatDate, formatTime, formatOdds, statusLabel, statusBadgeClass, showToast, launchConfetti, escapeHtml } from '../utils.js';
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
    html += `<p class="text-gold" style="font-size: 0.8rem;">${t('event.winner')}: ${escapeHtml(event.winnerNickname)}</p>`;
  }
  html += '</div>';

  // Losing bets — who owes what
  html += '<div class="mb-md">';
  html += `<h4 class="text-secondary" style="font-size: 0.8rem; margin-bottom: var(--space-sm);">📋 ${t('event.owes').toUpperCase()}</h4>`;
  losingBets.forEach(b => {
    const isMyBet = currentUser && b.userId === currentUser.id;

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

  const hasPlayerImages = event.players.some(p => p.imageUrl);
  const loggedIn = isLoggedIn();
  const currentUser = getStoredUser();

  content.innerHTML = `
    <div class="animate-in">
      ${event.imageUrl ? `
        <div class="event-hero-banner" id="event-hero-banner">
          <img src="${event.imageUrl}" alt="${escapeHtml(event.name)}" class="event-hero-img" />
          <div class="event-hero-overlay">
            <span class="badge ${statusBadgeClass(event.status)}" style="background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);">${statusLabel(event.status)}</span>
          </div>
        </div>
      ` : ''}

      <div class="page-header">
        <div class="flex-between">
          <h1 class="page-title">${escapeHtml(event.name)}</h1>
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
          <div class="share-code-text">${escapeHtml(event.shareCode)}</div>
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
          ${winner.imageUrl ? `
            <div style="display: flex; justify-content: center; margin-bottom: var(--space-xs);">
              <img src="${winner.imageUrl}" alt="${escapeHtml(winner.name)}" class="player-avatar-large" />
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
                          ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${escapeHtml(p.name)}" class="player-avatar-mini" />` : ''}
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

  loadQRCode(code);

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
      const shareUrl = `${baseUrl}/?page=event&code=${code}`;
      const shareMsg = `🎲 Häng på och lägg dina bets i BetPals! Länk: ${shareUrl}`;
      container.innerHTML = `
        <img src="${data.qr}" alt="QR ${code}" />
        <span class="qr-label">${t('event.scanToJoin')}</span>
        <div class="flex gap-xs mt-sm" style="width: 100%; max-width: 280px; margin: var(--space-sm) auto 0; justify-content: center; flex-wrap: wrap;">
          <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(shareMsg)}" target="_blank" rel="noopener" class="btn btn-sm" style="background: #25D366; color: white; text-decoration: none; font-size: 0.75rem; flex: 1;">
            💬 WhatsApp
          </a>
          <a href="sms:?&body=${encodeURIComponent(shareMsg)}" class="btn btn-sm" style="background: #3498db; color: white; text-decoration: none; font-size: 0.75rem; flex: 1;">
            📱 SMS
          </a>
          <button type="button" class="btn btn-sm btn-secondary copy-event-link-btn" style="font-size: 0.75rem;">
            📋
          </button>
        </div>
      `;
      container.querySelector('.copy-event-link-btn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(shareUrl);
        showToast('Länk kopierad! ✅', 'success');
      });
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
