// ── Page: Tournament ────────────────────────────────────────
import { getTournament, addTournamentRound, getTournamentQR, markBetPaid } from '../api.js';
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
  const isCreator = user && t.creatorId === user.id;
  const allFinished = t.rounds.length > 0 && t.rounds.every(r => r.status === 'finished');
  const hasTransfers = t.settlement.transfers.length > 0;

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
        `).join('')}
      </div>

      <!-- Add Round Button -->
      ${isCreator && t.status === 'active' ? `
        <button class="btn btn-primary btn-block mt-md" id="add-round-btn">
          ➕ Ny rond
        </button>
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
        const updated = await addTournamentRound(t.id, {});
        showToast('Ny rond skapad! 🎯', 'success');
        renderTournamentContent(content, updated);
      } catch (err) {
        showToast(err.message, 'error');
        addBtn.disabled = false;
        addBtn.textContent = '➕ Ny rond';
      }
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
