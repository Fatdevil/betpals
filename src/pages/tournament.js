import { getTournament, addTournamentRound, getTournamentQR, markBetPaid, createSideBet, addTournamentBanner, deleteTournamentBanner, getTournamentPhotos, uploadTournamentPhoto, deleteTournamentPhoto, togglePhotoLike, toggleSettlementReceipt, deleteTournament, deleteEvent, settleTournament, reopenTournament, cancelEvent, getActiveFlashBets, connectWebSocket, disconnectWebSocket, onWebSocketMessage } from '../api.js';
import { formatCurrency, showToast, launchConfetti, escapeHtml, sanitizeUrl } from '../utils.js';
import { getStoredUser, isLoggedIn } from '../auth.js';
import { showModal, closeModal } from '../components/modal.js';
import { openFlashBetModal } from '../components/minigames.js';
import { navigate } from '../main.js';
import { compressImage } from '../imageUtils.js';
import { TOURNAMENT_TEMPLATES, GAME_TYPES } from '../templates.js';

let wsUnsubscribe = null;

export function cleanupTournament() {
  disconnectWebSocket();
  if (wsUnsubscribe) {
    wsUnsubscribe();
    wsUnsubscribe = null;
  }
}

export async function renderTournament(params = {}) {
  cleanupTournament();
  const content = document.getElementById('page-content');
  const code = params.code;
  if (!code) {
    content.innerHTML = '<div class="text-center text-muted mt-lg">Ingen turnering vald</div>';
    return;
  }

  content.innerHTML = '<div class="text-center text-muted mt-lg">Laddar turnering...</div>';

  try {
    const t = await getTournament(code);
    const [photos, activeFlashBets] = await Promise.all([
      getTournamentPhotos(t.id).catch(() => []),
      getActiveFlashBets(t.id).catch(() => [])
    ]);
    const tournamentFlashBets = (activeFlashBets || []).filter(fb => (fb.tournamentId || fb.tournament_id) === t.id);
    renderTournamentContent(content, t, photos, tournamentFlashBets);

    if (t.status === 'settled') {
      launchConfetti();
    }

    connectWebSocket(t.shareCode);
    wsUnsubscribe = onWebSocketMessage((msg) => {
      if (msg.type === 'tournament_updated' || msg.type === 'flash_bet_created' || msg.type === 'flash_bet_settled') {
        renderTournament(params);
      }
    });

  } catch (err) {
    content.innerHTML = '<div class="text-center text-red mt-lg">' + err.message + '</div>';
  }
}

function renderTournamentContent(content, t, photos = [], tournamentFlashBets = []) {
  const user = getStoredUser();
  const hasPinSession = !!sessionStorage.getItem('betpals_pin');
  const isCreator = (user && t.creatorId === user.id) || hasPinSession;
  const allEvents = [...(t.rounds || []), ...(t.sideBets || [])];
  const allResolved = allEvents.length > 0 && allEvents.every(r => r.status === 'finished' || r.status === 'cancelled');
  const hasTransfers = t.settlement.transfers.length > 0;
  const sideBets = t.sideBets || [];

  // Group side bets by linked round
  const sideBetsByRound = {};
  const unlinkedSideBets = [];
  for (const sb of sideBets) {
    if (sb.linkedRoundId) {
      if (!sideBetsByRound[sb.linkedRoundId]) sideBetsByRound[sb.linkedRoundId] = [];
      sideBetsByRound[sb.linkedRoundId].push(sb);
    } else {
      unlinkedSideBets.push(sb);
    }
  }

  const renderSideBetBadge = (sb) => {
    const modeBadge = sb.betMode === 'self' ? '🦅' : '🎲';
    return sb.status === 'finished'
      ? `<span class="badge badge-success" style="font-size: 0.6rem;">${sb.isTie ? '🤝 Delad seger: ' : '✅ '}${escapeHtml(sb.winnerName || 'Klar')}</span>`
      : sb.status === 'cancelled'
        ? `<span class="badge badge-danger" style="font-size: 0.6rem;">🛑 Avbruten</span>`
        : sb.status === 'locked'
          ? `<span class="badge badge-warning" style="font-size: 0.6rem;">🔒 Låst</span>`
          : `<span class="badge badge-accent" style="font-size: 0.6rem;">${modeBadge} Öppen</span>`;
  };

  const renderSideBetCard = (sb) => `
    <div class="bet-item card-clickable round-link" data-code="${escapeHtml(sb.shareCode)}" style="border-left: 3px solid var(--accent); margin-left: var(--space-sm);">
      <div style="flex: 1;">
        <div class="bet-item-name">🎯 ${escapeHtml(sb.name)}</div>
        <div class="bet-item-player">${sb.players.map(p => escapeHtml(p.name)).join(', ')} · ${sb.betMode === 'self' ? 'Alla bettar ' + formatCurrency(sb.minBet) : sb.betCount + ' bets'}</div>
      </div>
      <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
        <div class="bet-item-amount">${formatCurrency(sb.totalPool)}</div>
        <div class="flex gap-xs" style="align-items: center;">
          ${renderSideBetBadge(sb)}
          ${isCreator ? `<button type="button" class="btn btn-sm btn-danger delete-event-btn" data-id="${sb.id}" data-name="${escapeHtml(sb.name)}" style="padding: 2px 6px; font-size: 0.7rem;" title="Ta bort sido-spel">🗑️</button>` : ''}
        </div>
      </div>
    </div>
  `;

  const top3 = [...t.settlement.balances].sort((a, b) => b.net - a.net).slice(0, 3);

  content.innerHTML = `
    <div class="animate-in">
      <div class="page-header">
        <div class="flex-between">
          <div>
            <h1 class="page-title">🏆 ${escapeHtml(t.name)}</h1>
            <p class="page-subtitle">${t.rounds.length} ronder · Kod: <strong>${escapeHtml(t.shareCode)}</strong></p>
          </div>
          <span class="badge ${t.status === 'active' ? 'badge-accent' : 'badge-success'}">${t.status === 'active' ? 'Pågår' : 'Avräknad'}</span>
        </div>
        <div class="flex gap-sm mt-sm" style="justify-content: flex-end; align-items: center;">
          <button class="btn btn-secondary btn-sm" id="share-tournament-btn">
            📱 Dela turnering
          </button>
          ${isCreator ? `
            <button class="btn btn-danger btn-sm" id="delete-tournament-btn" title="Radera hela turneringen" style="font-size: 0.75rem;">
              🗑️ Radera
            </button>
          ` : ''}
        </div>
      </div>

      ${tournamentFlashBets.length > 0 ? `
        <!-- Active FlashBet Live Banner -->
        <div class="card card-pulse mb-md" id="active-tournament-flashbet" style="border: 2px solid var(--accent); background: linear-gradient(135deg, rgba(245, 166, 35, 0.18) 0%, rgba(20, 24, 39, 0.95) 100%); cursor: pointer; padding: 12px 14px; margin-top: var(--space-md);">
          <div class="flex-between" style="align-items: center;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.8rem; animation: pulse 1.5s infinite;">⚡</span>
              <div>
                <div class="flex gap-xs" style="align-items: center;">
                  <span class="badge badge-accent" style="font-size: 0.68rem; font-weight: 800;">BLIXTBET IGÅNG</span>
                  <span class="text-muted" style="font-size: 0.72rem;">${tournamentFlashBets[0].betCount} röster · ${formatCurrency(tournamentFlashBets[0].totalPool)}</span>
                </div>
                <div style="font-weight: 800; font-size: 0.92rem; margin-top: 2px; color: #fff;">
                  ${escapeHtml(tournamentFlashBets[0].title)}
                </div>
              </div>
            </div>
            <button type="button" class="btn btn-sm btn-primary" style="font-weight: 800; padding: 6px 12px; white-space: nowrap;">
              Rösta ⏱️
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Rounds -->
      <div class="section-header">
        <h2 class="section-title">📋 Ronder</h2>
      </div>
      <div class="bet-list">
        ${t.rounds.map((r, i) => `
          <div class="bet-item card-clickable round-link" data-code="${escapeHtml(r.shareCode)}" id="round-${r.id}">
            <div>
              <div class="bet-item-name">${escapeHtml(r.name)}</div>
              <div class="bet-item-player">${r.players.map(p => escapeHtml(p.name)).join(', ')} · ${r.betCount} bets</div>
            </div>
            <div style="text-align: right;">
              <div class="bet-item-amount">${formatCurrency(r.totalPool)}</div>
              ${r.status === 'finished' 
                ? '<span class="badge badge-success" style="font-size: 0.6rem;">' + (r.isTie ? '🤝 Delad seger: ' : '✅ ') + escapeHtml(r.winnerName || 'Klar') + '</span>'
                : r.status === 'cancelled'
                  ? '<span class="badge badge-danger" style="font-size: 0.6rem;">🛑 Avbruten</span>'
                  : r.status === 'locked'
                    ? '<span class="badge badge-warning" style="font-size: 0.6rem;">🔒 Låst</span>'
                    : '<span class="badge badge-accent" style="font-size: 0.6rem;">🟢 Öppen</span>'
              }
            </div>
          </div>
          ${(sideBetsByRound[r.id] || []).map(renderSideBetCard).join('')}
        `).join('')}
      </div>

      ${unlinkedSideBets.length > 0 ? `
        <div class="section-header mt-md">
          <h2 class="section-title">🎯 Sido-spel</h2>
        </div>
        <div class="bet-list">
          ${unlinkedSideBets.map(renderSideBetCard).join('')}
        </div>
      ` : ''}

      <!-- Sponsor Banners -->
      ${(t.banners && t.banners.length > 0) || isCreator ? `
        <div class="section-header mt-md">
          <h2 class="section-title">⭐ Sponsorer</h2>
        </div>
        ${t.banners && t.banners.length > 0 ? `
          <div class="sponsor-carousel">
            ${t.banners.map(b => {
              const safeUrl = sanitizeUrl(b.linkUrl);
              return `
              <div class="sponsor-slide">
                ${safeUrl ? `<a href="${safeUrl}" target="_blank" rel="noopener">` : ''}
                  <img src="${b.imageData}" alt="${escapeHtml(b.label || 'Sponsor')}" class="sponsor-img" />
                ${safeUrl ? '</a>' : ''}
                ${b.label ? `<div class="sponsor-label">${escapeHtml(b.label)}</div>` : ''}
                ${isCreator ? `<button class="sponsor-delete-btn" data-banner-id="${b.id}" title="Ta bort">✕</button>` : ''}
              </div>
            `;}).join('')}
          </div>
        ` : ''}
        ${isCreator ? `
          <button class="btn btn-secondary btn-sm mt-sm" id="add-banner-btn" style="width: 100%;">
            📸 Lägg till sponsor
          </button>
        ` : ''}
      ` : ''}

      <!-- Action Buttons -->
      ${isCreator && t.status === 'active' ? `
        <div class="flex gap-sm mt-md" style="flex-wrap: wrap;">
          <button class="btn btn-primary" id="add-game-btn" style="flex: 2; min-width: 140px; font-weight: 700;">
            ➕ Lägg till spel 🎯
          </button>
          <button class="btn btn-secondary" id="add-flashbet-btn" style="flex: 1; min-width: 100px; border-color: rgba(245, 166, 35, 0.6); color: var(--accent); font-weight: 700;">
            ⚡ BlixtBet
          </button>
        </div>
      ` : ''}

      <!-- Settled Podium -->
      ${t.status === 'settled' && top3.length > 0 ? `
        <div class="card mt-lg text-center" style="background: linear-gradient(180deg, rgba(255,215,0,0.12) 0%, rgba(10,10,20,0.7) 100%); border: 1px solid rgba(255,215,0,0.35); padding: var(--space-md);">
          <div style="font-size: 2.2rem; margin-bottom: 4px;">🏆</div>
          <h3 class="font-heading" style="color: var(--gold); margin-bottom: 2px;">PRISPALL</h3>
          <p class="text-muted" style="font-size: 0.8rem; margin-bottom: var(--space-md);">Grattis till årets mästare!</p>
          
          <div style="display: flex; justify-content: center; align-items: flex-end; gap: 8px; margin: var(--space-md) auto; max-width: 320px;">
            ${top3[1] ? `
              <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                <div style="font-size: 1.4rem;">🥈</div>
                <div style="font-weight: 700; font-size: 0.8rem; word-break: break-word;">${escapeHtml(top3[1].name)}</div>
                <div class="${top3[1].net >= 0 ? 'text-green' : 'text-red'}" style="font-size: 0.75rem; font-weight: 700;">${top3[1].net >= 0 ? '+' : ''}${formatCurrency(top3[1].net)}</div>
                <div style="height: 60px; width: 100%; background: linear-gradient(180deg, #b0bec5, #78909c); border-radius: 6px 6px 0 0; margin-top: 6px; display: flex; align-items: center; justify-content: center; color: #111; font-weight: 800;">2</div>
              </div>
            ` : ''}
            ${top3[0] ? `
              <div style="flex: 1.2; display: flex; flex-direction: column; align-items: center;">
                <div style="font-size: 1.8rem; filter: drop-shadow(0 0 8px rgba(255,215,0,0.8));">👑 🥇</div>
                <div style="font-weight: 800; font-size: 0.9rem; color: var(--gold); word-break: break-word;">${escapeHtml(top3[0].name)}</div>
                <div class="text-green" style="font-size: 0.8rem; font-weight: 800;">+${formatCurrency(top3[0].net)}</div>
                <div style="height: 85px; width: 100%; background: linear-gradient(180deg, #ffd700, #ffa000); border-radius: 6px 6px 0 0; margin-top: 6px; display: flex; align-items: center; justify-content: center; color: #111; font-weight: 900; font-size: 1.1rem; box-shadow: 0 0 15px rgba(255,215,0,0.3);">1</div>
              </div>
            ` : ''}
            ${top3[2] ? `
              <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                <div style="font-size: 1.4rem;">🥉</div>
                <div style="font-weight: 700; font-size: 0.8rem; word-break: break-word;">${escapeHtml(top3[2].name)}</div>
                <div class="${top3[2].net >= 0 ? 'text-green' : 'text-red'}" style="font-size: 0.75rem; font-weight: 700;">${top3[2].net >= 0 ? '+' : ''}${formatCurrency(top3[2].net)}</div>
                <div style="height: 45px; width: 100%; background: linear-gradient(180deg, #cd7f32, #8d6e63); border-radius: 6px 6px 0 0; margin-top: 6px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800;">3</div>
              </div>
            ` : ''}
          </div>

          <button class="btn btn-secondary btn-sm mt-sm" id="copy-settlement-btn" style="font-size: 0.75rem; width: 100%;">
            📋 Kopiera resultat till kompis-chatten
          </button>
        </div>
      ` : ''}

      <!-- Net Settlement -->
      ${t.settlement.finishedRounds > 0 ? `
        <div class="section-header mt-lg">
          <h2 class="section-title">💰 Nettavräkning</h2>
        </div>
        <div class="card">
          <div class="text-center mb-md">
            <div style="font-size: 2rem; margin-bottom: var(--space-xs);">📊</div>
            <p class="text-muted" style="font-size: 0.85rem;">
              Resultat efter ${t.settlement.finishedMainRounds ?? t.settlement.finishedRounds} av ${t.settlement.totalMainRounds ?? t.settlement.totalRounds} ronder${(t.settlement.totalSideBets > 0) ? ` · ${t.settlement.finishedSideBets} av ${t.settlement.totalSideBets} sido-spel` : ''}
            </p>
          </div>

          <!-- Balances -->
          <div class="mb-md">
            <h4 class="text-secondary" style="font-size: 0.8rem; margin-bottom: var(--space-sm);">📈 STÄLLNING</h4>
            ${t.settlement.balances
              .sort((a, b) => b.net - a.net)
              .map(b => `
                <div class="swish-row">
                  <div class="swish-name">${escapeHtml(b.name)}</div>
                  <span class="${b.net >= 0 ? 'text-green' : 'text-red'}" style="font-weight: 700;">
                    ${b.net >= 0 ? '+' : ''}${formatCurrency(b.net)}
                  </span>
                </div>
              `).join('')}
          </div>

          <!-- Transfers -->
          ${hasTransfers ? `
            <div>
              <h4 class="text-secondary" style="font-size: 0.8rem; margin-bottom: var(--space-sm);">📱 ATT SWISHA</h4>
              ${t.settlement.transfers.map(tr => {
                let swishUrl = '#';
                if (tr.toSwish) {
                  const swishData = JSON.stringify({
                    version: 1,
                    payee: { value: tr.toSwish },
                    amount: { value: tr.amount },
                    message: { value: t.name }
                  });
                  swishUrl = 'swish://payment?data=' + encodeURIComponent(swishData);
                }
                const isMe = user && (tr.fromUserId === user.id || user.nickname === tr.from || user.realName === tr.from);
                const isToMe = user && (tr.toUserId === user.id || user.nickname === tr.to || user.realName === tr.to);
                const canToggleReceipt = isCreator || isToMe || isMe;
                return `
                  <div class="swish-row" style="${tr.isPaid ? 'opacity: 0.75; background: rgba(46,204,113,0.06);' : ''}">
                    <div>
                      <div class="swish-name">
                        ${escapeHtml(tr.from)} ${isMe ? '<span class="text-gold" style="font-size: 0.7rem;">(du)</span>' : ''}
                        → ${escapeHtml(tr.to)} ${isToMe ? '<span class="text-gold" style="font-size: 0.7rem;">(du)</span>' : ''}
                      </div>
                      <div class="swish-detail">${formatCurrency(tr.amount)}</div>
                    </div>
                    <div class="flex gap-xs" style="align-items: center; flex-wrap: wrap;">
                      ${tr.isPaid 
                        ? '<span class="badge" style="background: rgba(46,204,113,0.2); color: var(--green); font-size: 0.7rem; font-weight: 700; padding: 4px 8px;">Betald ✅</span>'
                        : (tr.toSwish 
                            ? '<a href="' + swishUrl + '" class="btn btn-sm swish-btn">📱 Swisha</a>'
                            : '<span class="text-muted" style="font-size: 0.7rem;">Inget Swish-nr</span>')
                      }
                      ${canToggleReceipt ? `
                        <button type="button" class="btn btn-sm ${tr.isPaid ? 'btn-secondary' : 'btn-primary'} toggle-receipt-btn" 
                          data-from="${escapeHtml(tr.from)}" data-to="${escapeHtml(tr.to)}" data-from-user-id="${tr.fromUserId || ''}" data-to-user-id="${tr.toUserId || ''}" data-amount="${tr.amount}" style="font-size: 0.7rem; padding: 4px 8px;">
                          ${tr.isPaid ? '↩️ Ångra' : 'Mottagen ✅'}
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}

          <!-- Settle Tournament Button -->
          ${isCreator && t.status === 'active' ? `
            <button class="btn btn-block mt-md" id="settle-tournament-btn" style="background: linear-gradient(135deg, #ffd700, #ff8800); color: #000; font-weight: 800; font-size: 0.95rem; padding: 12px; border: none; border-radius: var(--radius-md); cursor: pointer; box-shadow: 0 4px 15px rgba(255,215,0,0.3);">
              🏆 Avsluta turnering & kora vinnare
            </button>
          ` : ''}
          ${isCreator && t.status === 'settled' ? `
            <button class="btn btn-secondary btn-block mt-md" id="reopen-tournament-btn" style="font-size: 0.85rem; padding: 10px; width: 100%;">
              🔓 Återöppna turnering
            </button>
          ` : ''}
        </div>
      ` : ''}

      <!-- Live Photo Feed -->
      <div class="section-header mt-lg" style="display: flex; justify-content: space-between; align-items: center;">
        <h2 class="section-title">📸 Live-flöde</h2>
        ${user ? `<button class="btn btn-sm btn-primary" id="add-photo-btn">Dela bild</button>` : ''}
      </div>
      <div class="photo-feed" id="tournament-photo-feed" style="display: flex; flex-direction: column; gap: var(--space-md);">
        ${photos.length === 0 ? '<p class="text-muted text-center" style="font-size: 0.85rem;">Inga bilder ännu. Bli den första att dela!</p>' : ''}
        ${photos.map(p => `
          <div class="photo-card card animate-in">
            <div class="photo-header flex-between mb-sm" style="align-items: center;">
              <div class="flex" style="align-items: center; gap: 8px;">
                <div class="avatar-circle" style="width: 28px; height: 28px; font-size: 0.9rem;">${p.uploaderAvatar || '🎲'}</div>
                <div>
                  <div style="font-weight: 700; font-size: 0.85rem;">${escapeHtml(p.uploaderName)}</div>
                  <div class="text-muted" style="font-size: 0.7rem;">${new Date(p.createdAt).toLocaleString('sv-SE', {day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit'})}</div>
                </div>
              </div>
              ${(user && p.userId === user.id) || isCreator ? `<button class="btn-icon text-red delete-photo-btn" data-id="${p.id}" style="font-size: 0.8rem; background: rgba(255,0,0,0.1); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">✕</button>` : ''}
            </div>
            <img src="${p.url}" class="photo-img" style="width: 100%; border-radius: var(--radius-sm); margin-bottom: var(--space-xs); object-fit: cover; max-height: 500px;" loading="lazy" />
            ${p.caption ? `<div class="photo-caption text-secondary" style="font-size: 0.85rem; margin-bottom: var(--space-sm);">${escapeHtml(p.caption)}</div>` : ''}
            <div class="photo-actions mt-xs">
              <button class="btn-icon like-btn ${p.userLiked ? 'liked' : ''}" data-id="${p.id}" ${!user ? 'disabled style="opacity: 0.5;" title="Logga in för att gilla"' : ''} style="display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 12px; background: ${p.userLiked ? 'rgba(255, 60, 60, 0.15)' : 'rgba(255,255,255,0.05)'}; transition: all 0.2s ease;">
                <span class="heart-icon" style="font-size: 1.1rem; filter: ${p.userLiked ? 'drop-shadow(0 0 4px rgba(255, 60, 60, 0.5))' : 'none'};">${p.userLiked ? '❤️' : '🤍'}</span> 
                <span class="like-count text-secondary" style="font-size: 0.85rem; font-weight: 600;">${p.likeCount > 0 ? p.likeCount : 'Gilla'}</span>
              </button>
            </div>
          </div>
        `).join('')}
      </div>

    </div>
  `;

  // Click round to view
  document.querySelectorAll('.round-link').forEach(el => {
    el.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'event', code: el.dataset.code } }));
    });
  });


  // Photo Upload
  document.getElementById('add-photo-btn')?.addEventListener('click', () => {
    showModal('📸 Dela en bild', `
      <form id="photo-form">
        <div class="form-group">
          <label class="form-label">Bild</label>
          <div class="sponsor-upload-area" id="photo-drop-area" style="min-height: 200px;">
            <div id="photo-preview-container" style="display:none; width: 100%;">
              <img id="photo-preview-img" style="max-width: 100%; max-height: 300px; border-radius: var(--radius-sm); object-fit: contain;" />
            </div>
            <div id="photo-upload-placeholder">
              <div style="font-size: 2.5rem; margin-bottom: var(--space-xs);">📷</div>
              <div style="font-size: 0.85rem; color: var(--text-secondary);">Klicka för att fota / välja bild</div>
            </div>
            <input type="file" accept="image/*" id="photo-file-input" style="display: none;" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Bildtext (valfri)</label>
          <textarea class="form-input" id="photo-caption" placeholder="Vad händer på bilden?" rows="2"></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="photo-submit-btn">Dela! 🚀</button>
      </form>
    `);

    let selectedImageBase64 = null;
    const dropArea = document.getElementById('photo-drop-area');
    const fileInput = document.getElementById('photo-file-input');
    const previewContainer = document.getElementById('photo-preview-container');
    const previewImg = document.getElementById('photo-preview-img');
    const placeholder = document.getElementById('photo-upload-placeholder');
    const submitBtn = document.getElementById('photo-submit-btn');

    dropArea?.addEventListener('click', () => fileInput.click());

    fileInput?.addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      
      submitBtn.disabled = true;
      submitBtn.textContent = 'Komprimerar bild... ⏳';
      try {
        selectedImageBase64 = await compressImage(file, 1000, 0.8);
        previewImg.src = selectedImageBase64;
        previewContainer.style.display = 'block';
        placeholder.style.display = 'none';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Dela! 🚀';
      } catch (err) {
        showToast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Dela! 🚀';
      }
    });

    document.getElementById('photo-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!selectedImageBase64) { return showToast('Välj en bild först!', 'error'); }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Laddar upp till molnet... ☁️';

      try {
        await uploadTournamentPhoto(t.id, {
          imageData: selectedImageBase64,
          caption: document.getElementById('photo-caption').value.trim() || null
        });
        closeModal();
        showToast('Bild delad! 📸', 'success');
        renderTournament({ code }); // Reload to show new photo
      } catch (err) {
        showToast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Försök igen';
      }
    });
  });

  // Like photos
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const photoId = btn.dataset.id;
      // Optimistic UI update
      const isLiked = btn.classList.contains('liked');
      const countEl = btn.querySelector('.like-count');
      const heartEl = btn.querySelector('.heart-icon');
      let currentCount = parseInt(countEl.textContent, 10) || 0;
      
      if (isLiked) {
        btn.classList.remove('liked');
        heartEl.textContent = '🤍';
        heartEl.style.filter = 'none';
        btn.style.background = 'rgba(255,255,255,0.05)';
        currentCount = Math.max(0, currentCount - 1);
      } else {
        btn.classList.add('liked');
        heartEl.textContent = '❤️';
        heartEl.style.filter = 'drop-shadow(0 0 4px rgba(255, 60, 60, 0.5))';
        btn.style.background = 'rgba(255, 60, 60, 0.15)';
        currentCount += 1;
      }
      countEl.textContent = currentCount > 0 ? currentCount : 'Gilla';

      try {
        await togglePhotoLike(t.id, photoId);
      } catch (err) {
        // Revert on error
        showToast('Kunde inte gilla: ' + err.message, 'error');
        renderTournament({ code }); 
      }
    });
  });

  // Delete photos
  document.querySelectorAll('.delete-photo-btn').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!confirm('Radera bilden permanent?')) return;
      try {
        const pin = sessionStorage.getItem('betpals_pin') || '';
        await deleteTournamentPhoto(t.id, btn.dataset.id, { pin });
        showToast('Bild borttagen', 'success');
        renderTournament({ code });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Banner upload
  document.getElementById('add-banner-btn')?.addEventListener('click', () => {
    showModal('📸 Lägg till sponsor', `
      <form id="banner-form">
        <div class="form-group">
          <label class="form-label">Sponsorbild</label>
          <div class="sponsor-upload-area" id="banner-drop-area">
            <div id="banner-preview-container" style="display:none;">
              <img id="banner-preview-img" class="sponsor-img" style="max-height: 200px;" />
            </div>
            <div id="banner-upload-placeholder">
              <div style="font-size: 2rem; margin-bottom: var(--space-xs);">📸</div>
              <div style="font-size: 0.85rem; color: var(--text-secondary);">Klicka för att välja bild</div>
            </div>
            <input type="file" accept="image/*" id="banner-file-input" style="display: none;" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Etikett (valfri)</label>
          <input type="text" class="form-input" id="banner-label" placeholder="t.ex. Huvudsponsor" />
        </div>
        <div class="form-group">
          <label class="form-label">Länk (valfri)</label>
          <input type="text" class="form-input" id="banner-link" placeholder="https://..." />
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="banner-submit-btn">Ladda upp 📸</button>
      </form>
    `);

    let selectedImageData = null;
    const dropArea = document.getElementById('banner-drop-area');
    const fileInput = document.getElementById('banner-file-input');
    const previewContainer = document.getElementById('banner-preview-container');
    const previewImg = document.getElementById('banner-preview-img');
    const placeholder = document.getElementById('banner-upload-placeholder');

    dropArea?.addEventListener('click', () => fileInput.click());

    const handleFile = (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        selectedImageData = ev.target.result;
        previewImg.src = selectedImageData;
        previewContainer.style.display = 'block';
        placeholder.style.display = 'none';
      };
      reader.readAsDataURL(file);
    };

    fileInput?.addEventListener('change', (ev) => handleFile(ev.target.files[0]));

    document.getElementById('banner-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!selectedImageData) { showToast('Välj en bild först', 'error'); return; }

      const submitBtn = document.getElementById('banner-submit-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Laddar upp...';

      try {
        const pin = sessionStorage.getItem('betpals_pin') || '';
        await addTournamentBanner(t.id, {
          imageData: selectedImageData,
          label: document.getElementById('banner-label').value.trim() || null,
          linkUrl: document.getElementById('banner-link').value.trim() || null,
          pin
        });
        closeModal();
        showToast('Sponsor tillagd! ⭐', 'success');
        const updated = await getTournament(t.shareCode);
        renderTournamentContent(content, updated);
      } catch (err) {
        showToast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Ladda upp 📸';
      }
    });
  });

  // Delete banners
  document.querySelectorAll('.sponsor-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!confirm('Ta bort denna sponsor?')) return;
      try {
        const pin = sessionStorage.getItem('betpals_pin') || '';
        await deleteTournamentBanner(t.id, btn.dataset.bannerId, { pin });
        showToast('Sponsor borttagen', 'success');
        const updated = await getTournament(t.shareCode);
        renderTournamentContent(content, updated);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Add game
  const addGameBtn = document.getElementById('add-game-btn');
  if (addGameBtn) {
    addGameBtn.addEventListener('click', () => {
      showAddGameModal(t, content);
    });
  }

  // Active tournament FlashBet banner click
  document.getElementById('active-tournament-flashbet')?.addEventListener('click', () => {
    if (tournamentFlashBets.length > 0) {
      openFlashBetModal(tournamentFlashBets[0].id, t.id);
    }
  });

  // Add tournament FlashBet button click
  document.getElementById('add-flashbet-btn')?.addEventListener('click', () => {
    openFlashBetModal(null, t.id);
  });

  // Toggle settlement receipt
  content.querySelectorAll('.toggle-receipt-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const pin = sessionStorage.getItem('betpals_pin') || '';
        await toggleSettlementReceipt(t.id, {
          fromName: btn.dataset.from,
          toName: btn.dataset.to,
          fromUserId: btn.dataset.fromUserId || undefined,
          toUserId: btn.dataset.toUserId || undefined,
          amount: Number(btn.dataset.amount),
          pin
        });
        const updated = await getTournament(t.shareCode);
        renderTournamentContent(content, updated);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });

  // Settle tournament
  document.getElementById('settle-tournament-btn')?.addEventListener('click', async () => {
    const allEvs = [...(t.rounds || []), ...(t.sideBets || [])];
    const unfinished = allEvs.filter(e => e.status !== 'finished' && e.status !== 'cancelled');
    if (unfinished.length > 0) {
      showToast(`Alla ronder och sido-spel måste vara avgjorda eller avbrutna (${unfinished.length} kvar).`, 'warning');
      return;
    }
    if (!confirm(`Vill du avsluta turneringen "${t.name}" och fastställa slutresultatet?`)) return;
    try {
      const pin = sessionStorage.getItem('betpals_pin') || '';
      await settleTournament(t.id, { pin });
      launchConfetti();
      showToast('Turneringen är avslutad! 🏆', 'success');
      const updated = await getTournament(t.shareCode);
      renderTournamentContent(content, updated);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Reopen tournament
  document.getElementById('reopen-tournament-btn')?.addEventListener('click', async () => {
    if (!confirm(`Vill du återöppna turneringen "${t.name}"? Resultat och spel blir då redigerbara igen.`)) return;
    try {
      const pin = sessionStorage.getItem('betpals_pin') || '';
      await reopenTournament(t.id, { pin });
      showToast('Turneringen har återöppnats! 🔓', 'success');
      const updated = await getTournament(t.shareCode);
      renderTournamentContent(content, updated);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Delete entire tournament
  document.getElementById('delete-tournament-btn')?.addEventListener('click', async () => {
    if (!confirm(`Är du säker på att du vill radera hela turneringen "${t.name}" och alla dess spel? Detta kan INTE ångras!`)) return;
    try {
      const pin = sessionStorage.getItem('betpals_pin') || '';
      await deleteTournament(t.id, { pin });
      showToast('Turneringen har raderats', 'success');
      navigate('home');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Delete side-bet or round
  content.querySelectorAll('.delete-event-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const evName = btn.dataset.name || 'detta spel';
      if (!confirm(`Vill du ta bort "${evName}"?`)) return;
      try {
        const pin = sessionStorage.getItem('betpals_pin') || '';
        await deleteEvent(btn.dataset.id, pin);
        showToast('Spelet togs bort', 'success');
        const updated = await getTournament(t.shareCode);
        renderTournamentContent(content, updated);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Copy settlement summary
  document.getElementById('copy-settlement-btn')?.addEventListener('click', () => {
    const sorted = [...t.settlement.balances].sort((a, b) => b.net - a.net);
    const lines = [
      `🏆 SLUTSTÄLLNING - ${t.name}`,
      `═════════════════════════════`,
      ...sorted.map((b, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} ${b.name}: ${b.net >= 0 ? '+' : ''}${b.net} kr`),
      ``,
      `📱 ATT SWISHA:`,
      ...t.settlement.transfers.map(tr => `• ${tr.from} swishar ${tr.amount} kr till ${tr.to} ${tr.isPaid ? '(Betald ✅)' : ''}`),
      ``,
      `Spelat via BetPals 🎲`
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    showToast('Slutresultat kopierat till urklipp! 📋', 'success');
  });

  // Share button
  document.getElementById('share-tournament-btn')?.addEventListener('click', async () => {
    try {
      const baseUrl = window.location.origin;
      const { qr, url } = await getTournamentQR(t.shareCode, baseUrl);
      const shareMsg = `🏆 Häng med på turneringen ${t.name} i BetPals! Se ställningen och betta här: ${url}`;
      showModal('📱 Dela turnering', `
        <div class="text-center">
          <img src="${qr}" alt="QR-kod" style="width: 200px; height: 200px; border-radius: var(--radius-md); margin-bottom: var(--space-md);" />
          <p class="text-muted" style="font-size: 0.8rem; margin-bottom: var(--space-md);">Skanna QR-koden eller dela direkt via länkarna nedan</p>
          <div class="flex gap-sm mb-md">
            <input type="text" class="form-input" value="${url}" readonly id="share-url" style="flex: 1; font-size: 0.75rem;" />
            <button class="btn btn-sm btn-primary" id="copy-url-btn">📋</button>
          </div>
          <div class="flex gap-xs" style="justify-content: center; flex-wrap: wrap;">
            <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(shareMsg)}" target="_blank" rel="noopener" class="btn btn-sm" style="background: #25D366; color: white; text-decoration: none; font-size: 0.8rem; flex: 1;">
              💬 WhatsApp
            </a>
            <a href="sms:?&body=${encodeURIComponent(shareMsg)}" class="btn btn-sm" style="background: #3498db; color: white; text-decoration: none; font-size: 0.8rem; flex: 1;">
              📱 SMS
            </a>
            ${navigator.share ? `
              <button class="btn btn-sm btn-secondary" id="native-share-btn" style="font-size: 0.8rem; flex: 1;">
                📤 Fler...
              </button>
            ` : ''}
          </div>
        </div>
      `);
      document.getElementById('copy-url-btn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(url);
        showToast('Länk kopierad! ✅', 'success');
      });
      document.getElementById('native-share-btn')?.addEventListener('click', async () => {
        try {
          await navigator.share({ title: t.name, text: shareMsg, url });
        } catch {}
      });
    } catch (err) {
      showToast('Kunde inte generera QR-kod', 'error');
    }
  });
}

function showAddGameModal(t, content) {
  // Pre-fill players from tournament rounds or settlement
  const existingPlayerNames = [];
  if (t.rounds && t.rounds.length > 0) {
    t.rounds.forEach(r => {
      if (r.players) r.players.forEach(p => {
        if (!existingPlayerNames.includes(p.name)) existingPlayerNames.push(p.name);
      });
    });
  }
  if (existingPlayerNames.length === 0 && t.settlement && t.settlement.balances) {
    t.settlement.balances.forEach(b => {
      if (b.name && !existingPlayerNames.includes(b.name)) existingPlayerNames.push(b.name);
    });
  }

  let players = existingPlayerNames.length >= 2 ? [...existingPlayerNames] : ['Spelare 1', 'Spelare 2'];
  let currentGt = 'winner';
  let betMode = 'open';

  showModal('🎯 Lägg till spel i Eventet', `
    <form id="add-game-form">
      <!-- 4 Game Types Selector -->
      <div class="form-group mb-md">
        <label class="form-label" style="display: flex; justify-content: space-between; align-items: center;">
          <span>🎮 Välj typ av spel</span>
          <span style="font-size: 0.72rem; color: var(--gold); font-weight: 700;" id="selected-gt-badge">1. Vinnare 🏆</span>
        </label>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
          ${GAME_TYPES.map((gt, idx) => `
            <div class="gt-card ${idx === 0 ? 'selected' : ''}" data-gt="${gt.id}" style="cursor: pointer; border: 1.5px solid ${idx === 0 ? 'var(--gold)' : 'var(--border-light)'}; border-radius: var(--radius-md); padding: 8px; background: ${idx === 0 ? 'rgba(245,166,35,0.12)' : 'var(--bg-card)'}; transition: all 0.2s;">
              <div class="flex gap-xs" style="align-items: center; margin-bottom: 2px;">
                <span style="font-size: 1.15rem;">${gt.icon}</span>
                <strong style="font-size: 0.82rem;">${gt.title}</strong>
              </div>
              <div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.2;">${gt.subtitle}</div>
            </div>
          `).join('')}
        </div>
        <div id="gt-desc-box" style="margin-top: 8px; padding: 6px 10px; background: rgba(245, 166, 35, 0.07); border-left: 3px solid var(--gold); font-size: 0.73rem; color: var(--text-secondary); border-radius: 4px;">
          Alla bettar på vem som vinner. Dynamiska odds baserat på poolen.
        </div>
      </div>

      <div class="form-group mb-xs">
        <label class="form-label mb-xs">⚡ Snabbval</label>
        <div class="flex gap-xs" style="flex-wrap: wrap;" id="quick-templates-bar">
          <button type="button" class="btn btn-sm btn-secondary gt-quick-btn" data-gt="winner" data-name="Vinnare av ronden" data-amount="50" style="font-size: 0.7rem; padding: 2px 8px;">
            🏆 Vinnare
          </button>
          <button type="button" class="btn btn-sm btn-secondary gt-quick-btn" data-gt="winner_takes_all" data-name="🦅 Flest birdies" data-amount="100" style="font-size: 0.7rem; padding: 2px 8px;">
            🦅 Flest birdies
          </button>
          <button type="button" class="btn btn-sm btn-secondary gt-quick-btn" data-gt="1x2" data-name="⚽ Match: Lag A vs Lag B" data-amount="50" style="font-size: 0.7rem; padding: 2px 8px;">
            ⚽ Match 1X2
          </button>
          <button type="button" class="btn btn-sm btn-secondary gt-quick-btn" data-gt="yes_no" data-name="Görs det birdie på hål 18?" data-amount="50" style="font-size: 0.7rem; padding: 2px 8px;">
            👍 Ja/Nej fråga
          </button>
        </div>
      </div>

      <div class="form-group mb-sm">
        <label class="form-label">Namn på spelet</label>
        <input type="text" class="form-input" id="game-name" placeholder="t.ex. Vinnare av måndagsgolfen eller Flest birdies" required />
      </div>

      <div class="form-group mb-sm" id="game-amount-group">
        <label class="form-label" id="game-amount-label">Minsta insats (kr)</label>
        <input type="number" class="form-input" id="game-amount" value="50" min="5" step="5" />
        <p class="text-muted mt-xs" id="game-amount-help" style="font-size: 0.72rem; margin: 2px 0 0 0;">Minsta insats för poolspel.</p>
      </div>

      <div class="form-group mb-sm">
        <div class="flex-between mb-xs">
          <label class="form-label" style="margin: 0;">Spelare / Svarsalternativ</label>
          <span style="font-size: 0.7rem; color: var(--text-muted);" id="alternatives-hint">Minst 2 alternativ</span>
        </div>
        <div class="flex gap-sm">
          <input type="text" class="form-input" id="game-player-input" placeholder="Lägg till alternativ eller namn" style="flex: 1;" />
          <button type="button" class="btn btn-sm btn-secondary" id="game-add-player">+</button>
        </div>
        <div id="game-player-list" class="mt-sm"></div>
      </div>

      <button type="submit" class="btn btn-primary btn-block" style="padding: 12px; font-weight: 700;">
        Skapa Spel 🎯
      </button>
    </form>
  `);

  const gtCards = document.querySelectorAll('.gt-card');
  const gtBadge = document.getElementById('selected-gt-badge');
  const gtDescBox = document.getElementById('gt-desc-box');
  const nameInput = document.getElementById('game-name');
  const amountLabel = document.getElementById('game-amount-label');
  const amountHelp = document.getElementById('game-amount-help');
  const amountInput = document.getElementById('game-amount');

  function renderPlayers() {
    const list = document.getElementById('game-player-list');
    if (!list) return;
    list.innerHTML = players.map((p, i) => `
      <div class="flex-between" style="padding: var(--space-xs) 0; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
        <span>${escapeHtml(p)}</span>
        <button type="button" class="btn btn-sm" style="padding: 2px 8px; font-size: 0.7rem;" data-remove="${i}">✕</button>
      </div>
    `).join('') || '<p class="text-muted" style="font-size: 0.8rem;">Inga alternativ tillagda</p>';

    list.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        players.splice(Number(btn.dataset.remove), 1);
        renderPlayers();
      });
    });
  }

  renderPlayers();

  function applyGameType(gtId) {
    currentGt = gtId;
    gtCards.forEach(c => {
      const isSel = c.dataset.gt === gtId;
      c.style.border = isSel ? '1.5px solid var(--gold)' : '1.5px solid var(--border-light)';
      c.style.background = isSel ? 'rgba(245,166,35,0.12)' : 'var(--bg-card)';
    });

    const gt = GAME_TYPES.find(g => g.id === gtId) || GAME_TYPES[0];
    if (gtBadge) gtBadge.textContent = `${gt.title} ${gt.icon}`;
    if (gtDescBox) gtDescBox.textContent = gt.description;

    if (gtId === 'winner') {
      betMode = 'open';
      amountLabel.textContent = 'Minsta insats (kr)';
      amountHelp.textContent = 'Alla bettar på sin favorit med dynamiska pool-odds.';
      amountInput.value = 50;
      if (players.length < 2 || players.includes('👍 Ja')) players = [...existingPlayerNames];
      if (players.length < 2) players = ['Spelare 1', 'Spelare 2'];
    } else if (gtId === 'winner_takes_all') {
      betMode = 'self';
      amountLabel.textContent = 'Fast insats per deltagare (kr)';
      amountHelp.textContent = 'Alla deltagare lägger denna insats. Vinnaren eller vinnarna delar potten!';
      amountInput.value = 100;
      if (players.length < 2 || players.includes('👍 Ja')) players = [...existingPlayerNames];
      if (players.length < 2) players = ['Spelare 1', 'Spelare 2'];
    } else if (gtId === '1x2') {
      betMode = 'open';
      amountLabel.textContent = 'Insats (kr)';
      amountHelp.textContent = 'Betta på 1 (Hemmalag), X (Oavgjort) eller 2 (Bortalag).';
      amountInput.value = 50;
      players = ['1 (Hemmalag / Lag A)', 'X (Oavgjort)', '2 (Bortalag / Lag B)'];
    } else if (gtId === 'yes_no') {
      betMode = 'open';
      amountLabel.textContent = 'Insats (kr)';
      amountHelp.textContent = 'Snabbt binärt bet på Ja eller Nej.';
      amountInput.value = 50;
      players = ['👍 Ja', '👎 Nej'];
    }
    renderPlayers();
  }

  gtCards.forEach(card => {
    card.addEventListener('click', () => {
      applyGameType(card.dataset.gt);
    });
  });

  document.querySelectorAll('.gt-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const gt = btn.dataset.gt;
      applyGameType(gt);
      if (btn.dataset.name) nameInput.value = btn.dataset.name;
      if (btn.dataset.amount) amountInput.value = btn.dataset.amount;
    });
  });

  // Add player
  document.getElementById('game-add-player')?.addEventListener('click', () => {
    const input = document.getElementById('game-player-input');
    const name = input.value.trim();
    if (name && !players.includes(name)) {
      players.push(name);
      input.value = '';
      renderPlayers();
    }
    input.focus();
  });

  document.getElementById('game-player-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('game-add-player').click();
    }
  });

  // Submit
  document.getElementById('add-game-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pInput = document.getElementById('game-player-input');
    if (pInput && pInput.value.trim()) {
      const pName = pInput.value.trim();
      if (!players.includes(pName)) {
        players.push(pName);
      }
      pInput.value = '';
    }

    const name = nameInput.value.trim();
    const betAmount = Number(amountInput.value) || 50;

    if (players.length < 2) {
      showToast('Minst 2 spelare eller alternativ krävs', 'error');
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Skapar...';
    }

    try {
      const pin = sessionStorage.getItem('betpals_pin') || '';
      const updated = await createSideBet(t.id, {
        name,
        players,
        betMode,
        betAmount,
        pin
      });
      closeModal();
      launchConfetti();
      showToast('Spel tillagt i eventet! 🎯', 'success');
      renderTournamentContent(content, updated);
    } catch (err) {
      showToast(err.message, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Skapa Spel 🎯';
      }
    }
  });
}
