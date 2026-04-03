import { getTournament, addTournamentRound, getTournamentQR, markBetPaid, createSideBet } from '../api.js';
import { formatCurrency, showToast } from '../utils.js';
import { getStoredUser, isLoggedIn } from '../auth.js';
import { showModal, closeModal } from '../components/modal.js';

export async function renderTournament(params = {}) {
  const content = document.getElementById('page-content');
  const code = params.code;
  if (!code) {
    content.innerHTML = '<div class="text-center text-muted mt-lg">Ingen turnering vald</div>';
    return;
  }

  content.innerHTML = '<div class="text-center text-muted mt-lg">Laddar turnering...</div>';

  try {
    const t = await getTournament(code);
    renderTournamentContent(content, t);
  } catch (err) {
    content.innerHTML = '<div class="text-center text-red mt-lg">' + err.message + '</div>';
  }
}

function renderTournamentContent(content, t) {
  const user = getStoredUser();
  const hasPinSession = !!sessionStorage.getItem('betpals_pin');
  const isCreator = (user && t.creatorId === user.id) || hasPinSession;
  const allFinished = t.rounds.length > 0 && t.rounds.every(r => r.status === 'finished');
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
    const modeBadge = sb.betMode === 'self' ? '👤' : '🎲';
    return sb.status === 'finished'
      ? `<span class="badge badge-success" style="font-size: 0.6rem;">✅ ${sb.winnerName || 'Klar'}</span>`
      : sb.status === 'locked'
        ? `<span class="badge badge-warning" style="font-size: 0.6rem;">🔒 Låst</span>`
        : `<span class="badge badge-accent" style="font-size: 0.6rem;">${modeBadge} Öppen</span>`;
  };

  const renderSideBetCard = (sb) => `
    <div class="bet-item card-clickable round-link" data-code="${sb.shareCode}" style="border-left: 3px solid var(--accent); margin-left: var(--space-sm);">
      <div>
        <div class="bet-item-name">🎯 ${sb.name}</div>
        <div class="bet-item-player">${sb.players.map(p => p.name).join(', ')} · ${sb.betMode === 'self' ? 'Alla bettar ' + formatCurrency(sb.minBet) : sb.betCount + ' bets'}</div>
      </div>
      <div style="text-align: right;">
        <div class="bet-item-amount">${formatCurrency(sb.totalPool)}</div>
        ${renderSideBetBadge(sb)}
      </div>
    </div>
  `;

  content.innerHTML = `
    <div class="animate-in">
      <div class="page-header">
        <div class="flex-between">
          <div>
            <h1 class="page-title">🏆 ${t.name}</h1>
            <p class="page-subtitle">${t.rounds.length} ronder · Kod: <strong>${t.shareCode}</strong></p>
          </div>
          <span class="badge ${t.status === 'active' ? 'badge-accent' : 'badge-success'}">${t.status === 'active' ? 'Pågår' : 'Avräknad'}</span>
        </div>
        <button class="btn btn-secondary btn-sm mt-sm" id="share-tournament-btn" style="align-self: flex-end;">
          📱 Dela turnering
        </button>
      </div>

      <!-- Rounds -->
      <div class="section-header">
        <h2 class="section-title">📋 Ronder</h2>
      </div>
      <div class="bet-list">
        ${t.rounds.map((r, i) => `
          <div class="bet-item card-clickable round-link" data-code="${r.shareCode}" id="round-${r.id}">
            <div>
              <div class="bet-item-name">${r.name}</div>
              <div class="bet-item-player">${r.players.map(p => p.name).join(', ')} · ${r.betCount} bets</div>
            </div>
            <div style="text-align: right;">
              <div class="bet-item-amount">${formatCurrency(r.totalPool)}</div>
              ${r.status === 'finished' 
                ? '<span class="badge badge-success" style="font-size: 0.6rem;">✅ ' + (r.winnerName || 'Klar') + '</span>'
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

      <!-- Action Buttons -->
      ${isCreator && t.status === 'active' ? `
        <div class="flex gap-sm mt-md">
          <button class="btn btn-primary" id="add-round-btn" style="flex:1;">
            ➕ Ny rond
          </button>
          <button class="btn btn-secondary" id="add-sidebet-btn" style="flex:1;">
            🎯 Sido-spel
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
              Resultat efter ${t.settlement.finishedRounds} av ${t.settlement.totalRounds} ronder
            </p>
          </div>

          <!-- Balances -->
          <div class="mb-md">
            <h4 class="text-secondary" style="font-size: 0.8rem; margin-bottom: var(--space-sm);">📈 STÄLLNING</h4>
            ${t.settlement.balances
              .sort((a, b) => b.net - a.net)
              .map(b => `
                <div class="swish-row">
                  <div class="swish-name">${b.name}</div>
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
                const isMe = user && tr.fromUserId === user.id;
                return `
                  <div class="swish-row">
                    <div>
                      <div class="swish-name">
                        ${tr.from} ${isMe ? '<span class="text-gold" style="font-size: 0.7rem;">(du)</span>' : ''}
                        → ${tr.to}
                      </div>
                      <div class="swish-detail">${formatCurrency(tr.amount)}</div>
                    </div>
                    <div class="flex gap-xs" style="align-items: center;">
                      ${tr.toSwish
                        ? '<a href="' + swishUrl + '" class="btn btn-sm swish-btn">📱 Swisha</a>'
                        : '<span class="text-muted" style="font-size: 0.7rem;">Inget Swish-nr</span>'}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;

  // Click round to view
  document.querySelectorAll('.round-link').forEach(el => {
    el.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'event', code: el.dataset.code } }));
    });
  });

  // Add round
  const addBtn = document.getElementById('add-round-btn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      addBtn.textContent = 'Skapar...';
      try {
        const pin = sessionStorage.getItem('betpals_pin') || '';
        const updated = await addTournamentRound(t.id, { pin });
        showToast('Ny rond skapad! 🎯', 'success');
        renderTournamentContent(content, updated);
      } catch (err) {
        showToast(err.message, 'error');
        addBtn.disabled = false;
        addBtn.textContent = '➕ Ny rond';
      }
    });
  }

  // Add side bet
  const sideBetBtn = document.getElementById('add-sidebet-btn');
  if (sideBetBtn) {
    sideBetBtn.addEventListener('click', () => {
      showSideBetModal(t, content);
    });
  }

  // Share button
  document.getElementById('share-tournament-btn')?.addEventListener('click', async () => {
    try {
      const baseUrl = window.location.origin;
      const { qr, url } = await getTournamentQR(t.shareCode, baseUrl);
      showModal('📱 Dela turnering', `
        <div class="text-center">
          <img src="${qr}" alt="QR-kod" style="width: 200px; height: 200px; border-radius: var(--radius-md); margin-bottom: var(--space-md);" />
          <p class="text-muted" style="font-size: 0.8rem; margin-bottom: var(--space-md);">Skanna QR-koden eller kopiera länken nedan</p>
          <div class="flex gap-sm">
            <input type="text" class="form-input" value="${url}" readonly id="share-url" style="flex: 1; font-size: 0.75rem;" />
            <button class="btn btn-sm btn-primary" id="copy-url-btn">📋</button>
          </div>
        </div>
      `);
      document.getElementById('copy-url-btn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(url);
        showToast('Länk kopierad! ✅', 'success');
      });
    } catch (err) {
      showToast('Kunde inte generera QR-kod', 'error');
    }
  });
}

function showSideBetModal(t, content) {
  // Pre-fill players from latest round
  const lastRound = t.rounds[t.rounds.length - 1];
  let players = lastRound ? lastRound.players.map(p => p.name) : [];

  showModal('🎯 Nytt sido-spel', `
    <form id="sidebet-form">
      <div class="form-group">
        <label class="form-label">Namn</label>
        <input type="text" class="form-input" id="sidebet-name" placeholder="t.ex. Närmast pinnen H7" required />
      </div>

      <div class="form-group">
        <label class="form-label">Kopplad till rond</label>
        <select class="form-input" id="sidebet-round">
          <option value="">Ingen (fristående)</option>
          ${t.rounds.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Bet-läge</label>
        <div class="flex gap-sm">
          <button type="button" class="btn btn-sm bet-mode-btn active" data-mode="self" id="mode-self" style="flex:1;">
            👤 Alla bettar på sig
          </button>
          <button type="button" class="btn btn-sm bet-mode-btn" data-mode="open" id="mode-open" style="flex:1;">
            🎲 Öppet bet
          </button>
        </div>
      </div>

      <div class="form-group" id="bet-amount-group">
        <label class="form-label">Insats per spelare (kr)</label>
        <input type="number" class="form-input" id="sidebet-amount" value="100" min="10" step="10" />
      </div>

      <div class="form-group">
        <label class="form-label">Spelare</label>
        <div class="flex gap-sm">
          <input type="text" class="form-input" id="sidebet-player-input" placeholder="Lägg till spelare" style="flex: 1;" />
          <button type="button" class="btn btn-sm btn-secondary" id="sidebet-add-player">+</button>
        </div>
        <div id="sidebet-player-list" class="mt-sm"></div>
      </div>

      <button type="submit" class="btn btn-primary btn-block">Skapa sido-spel 🎯</button>
    </form>
  `);

  let betMode = 'self';

  function renderPlayers() {
    const list = document.getElementById('sidebet-player-list');
    if (!list) return;
    list.innerHTML = players.map((p, i) => `
      <div class="flex-between" style="padding: var(--space-xs) 0; font-size: 0.85rem;">
        <span>${p}</span>
        <button type="button" class="btn btn-sm" style="padding: 2px 8px; font-size: 0.7rem;" data-remove="${i}">✕</button>
      </div>
    `).join('') || '<p class="text-muted" style="font-size: 0.8rem;">Inga spelare tillagda</p>';
    list.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        players.splice(Number(btn.dataset.remove), 1);
        renderPlayers();
      });
    });
  }

  renderPlayers();

  // Mode toggle
  document.querySelectorAll('.bet-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bet-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      betMode = btn.dataset.mode;
      const amountGroup = document.getElementById('bet-amount-group');
      if (amountGroup) amountGroup.style.display = betMode === 'self' ? 'block' : 'none';
    });
  });

  // Add player
  document.getElementById('sidebet-add-player')?.addEventListener('click', () => {
    const input = document.getElementById('sidebet-player-input');
    const name = input.value.trim();
    if (name && !players.includes(name)) {
      players.push(name);
      input.value = '';
      renderPlayers();
    }
    input.focus();
  });

  document.getElementById('sidebet-player-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('sidebet-add-player').click();
    }
  });

  // Submit
  document.getElementById('sidebet-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('sidebet-name').value.trim();
    const linkedRoundId = document.getElementById('sidebet-round').value || null;
    const betAmount = Number(document.getElementById('sidebet-amount').value) || 100;

    if (players.length < 2) {
      showToast('Minst 2 spelare krävs', 'error');
      return;
    }

    try {
      const pin = sessionStorage.getItem('betpals_pin') || '';
      const updated = await createSideBet(t.id, {
        name,
        players,
        linkedRoundId,
        betMode,
        betAmount,
        pin
      });
      closeModal();
      showToast('Sido-spel skapat! 🎯', 'success');
      renderTournamentContent(content, updated);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
