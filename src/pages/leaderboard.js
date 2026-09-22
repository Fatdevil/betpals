// ── Page: The Tab (Notan & Swish-Hub) ───────────────────
import { 
  getTournaments, 
  getTournament, 
  toggleSettlementReceipt, 
  getDuelSettlements, 
  settleDuelsWithFriend 
} from '../api.js';
import { formatCurrency, showToast, escapeHtml, createSwishUrl } from '../utils.js';
import { t, getLang } from '../i18n.js';
import { getStoredUser, isLoggedIn } from '../auth.js';
import { openNotanRouletteModal, openReceiptModal } from '../components/minigames.js';

let activeTab = 'tournaments'; // 'tournaments' | 'swishlist' | 'history'
let currentTournamentCode = null;

export async function renderLeaderboard(params = {}) {
  const content = document.getElementById('page-content');
  if (!content) return;

  const url = new URL(window.location);
  const tabParam = params.tab || url.searchParams.get('tab');
  if (tabParam && ['tournaments', 'swishlist', 'history'].includes(tabParam)) {
    activeTab = tabParam;
  }

  content.innerHTML = `
    <div class="animate-in the-tab-container">
      <div class="page-header text-center" style="margin-bottom: var(--space-md);">
        <div style="font-size: 2.2rem; margin-bottom: 4px;">🧾</div>
        <h1 class="page-title">${t('tab.title')}</h1>
        <p class="page-subtitle">${t('tab.subtitle')}</p>
      </div>

      <div class="the-tab-nav">
        <button class="tab-nav-btn ${activeTab === 'tournaments' ? 'active' : ''}" data-tab="tournaments">
          🏌️‍♂️ ${t('tab.weekendTournament')}
        </button>
        <button class="tab-nav-btn ${activeTab === 'swishlist' ? 'active' : ''}" data-tab="swishlist">
          🎲 ${t('tab.swishlist')}
        </button>
        <button class="tab-nav-btn ${activeTab === 'history' ? 'active' : ''}" data-tab="history">
          📁 ${t('tab.history')}
        </button>
      </div>

      <div id="tab-body">
        <div class="skeleton skeleton-card" style="height: 120px; margin-bottom: 12px;"></div>
        <div class="skeleton skeleton-card" style="height: 200px;"></div>
      </div>
    </div>`;

  // Attach nav listeners
  content.querySelectorAll('.tab-nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetTab = btn.getAttribute('data-tab');
      if (targetTab === activeTab) return;
      activeTab = targetTab;
      renderLeaderboard();
    });
  });

  try {
    const user = getStoredUser();
    const loggedIn = isLoggedIn();

    // Fetch tournaments
    const allTournaments = await getTournaments();
    const activeTournaments = allTournaments.filter(t => t.status === 'active');
    const pastTournaments = allTournaments.filter(t => t.status === 'settled');

    // Fetch duel settlements if logged in
    let duelSettlement = { friends: [], totalNet: 0, totalOwed: 0, totalDue: 0 };
    if (loggedIn) {
      try {
        const rawDuels = await getDuelSettlements();
        const friends = rawDuels.friends || [];
        const totalDue = friends.filter(f => f.netAmount > 0).reduce((sum, f) => sum + f.netAmount, 0);
        const totalOwed = friends.filter(f => f.netAmount < 0).reduce((sum, f) => sum + (-f.netAmount), 0);
        duelSettlement = { friends, totalNet: rawDuels.totalNet || 0, totalOwed, totalDue };
      } catch (e) {
        console.warn('Could not fetch duel settlements:', e);
      }
    }

    // Update swishlist pill badge if there is debt
    const swishBtn = content.querySelector('.tab-nav-btn[data-tab="swishlist"]');
    if (swishBtn && duelSettlement.totalOwed > 0) {
      swishBtn.innerHTML = `🎲 ${t('tab.swishlist')} <span class="badge badge-warning" style="font-size: 0.65rem; padding: 2px 6px;">${duelSettlement.totalOwed} kr</span>`;
    }

    const tabBody = document.getElementById('tab-body');
    if (!tabBody) return;

    if (activeTab === 'tournaments') {
      await renderTournamentTab(tabBody, activeTournaments, user);
    } else if (activeTab === 'swishlist') {
      renderSwishlistTab(tabBody, duelSettlement, user);
    } else {
      renderHistoryTab(tabBody, pastTournaments);
    }
  } catch (err) {
    const tabBody = document.getElementById('tab-body');
    if (tabBody) {
      tabBody.innerHTML = `
        <div class="empty-state animate-in">
          <div class="empty-state-icon">❌</div>
          <p class="empty-state-text">${escapeHtml(err.message)}</p>
        </div>`;
    }
  }
}

// ── 1. Tournament Settlement Tab ──────────────────────
async function renderTournamentTab(container, activeTournaments, user) {
  if (!activeTournaments || activeTournaments.length === 0) {
    container.innerHTML = `
      <div class="empty-state card text-center" style="padding: var(--space-xl) var(--space-md);">
        <div style="font-size: 2.5rem; margin-bottom: var(--space-sm);">⛳</div>
        <h3 class="font-heading" style="color: var(--gold); margin-bottom: 6px;">${t('tab.noActiveTournaments')}</h3>
        <p class="text-muted" style="font-size: 0.85rem; max-width: 360px; margin: 0 auto var(--space-md);">
          ${t('tab.createOrJoin')}
        </p>
        <div class="flex gap-sm justify-center">
          <button type="button" class="btn btn-primary btn-sm btn-tab-goto-admin">${t('tab.goToCreate')}</button>
          <button type="button" class="btn btn-secondary btn-sm btn-tab-goto-home">${t('nav.home')}</button>
        </div>
      </div>`;

    container.querySelector('.btn-tab-goto-admin')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'admin' } }));
    });
    container.querySelector('.btn-tab-goto-home')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'home' } }));
    });
    return;
  }

  // Determine current active tournament
  if (!currentTournamentCode || !activeTournaments.some(t => t.shareCode === currentTournamentCode)) {
    currentTournamentCode = activeTournaments[0].shareCode;
  }

  // Load full details for selected tournament
  const tour = await getTournament(currentTournamentCode);
  const settlement = tour.settlement || { balances: [], transfers: [], auditTrail: {}, receipts: [], finishedRounds: 0, totalRounds: 0 };
  const balances = settlement.balances || [];
  const transfers = settlement.transfers || [];
  const auditTrail = settlement.auditTrail || {};
  const isEn = getLang() === 'en';

  // Find user's balance
  let myBalance = null;
  if (user) {
    myBalance = balances.find(b => 
      (b.userId && b.userId === user.id) || 
      b.name === user.nickname || 
      b.name === user.realName
    );
  }

  // Build Hero Status Card
  let heroCardHtml = '';
  if (myBalance) {
    if (myBalance.net < 0) {
      const debtAmount = -myBalance.net;
      // Find all transfers where user is the debtor
      const myTransfers = transfers.filter(tr => 
        tr.from === myBalance.name || (myBalance.userId && tr.fromUserId === myBalance.userId)
      );

      let transfersListHtml = '';
      if (myTransfers.length <= 1) {
        const tr = myTransfers[0];
        const toRecipient = tr ? tr.to : null;
        const toSwish = tr ? tr.toSwish : null;
        const trAmount = tr ? tr.amount : debtAmount;

        transfersListHtml = `
          <button class="btn btn-danger btn-block btn-clear-debt" 
            data-amount="${trAmount}" 
            data-from="${escapeHtml(myBalance.name)}" 
            data-to="${escapeHtml(toRecipient || '')}" 
            data-from-user-id="${escapeHtml(myBalance.userId || '')}"
            data-to-user-id="${escapeHtml((tr && tr.toUserId) || '')}"
            data-swish="${escapeHtml(toSwish || '')}"
            style="background: #ef4444; border: none; font-weight: 800;">
            📱 ${toRecipient ? (isEn ? `Swish ${formatCurrency(trAmount)} to ${escapeHtml(toRecipient)}` : `Swisha ${formatCurrency(trAmount)} till ${escapeHtml(toRecipient)}`) : `${t('tab.clearDebtBtn')} (${formatCurrency(debtAmount)})`}
          </button>`;
      } else {
        transfersListHtml = `
          <div class="flex flex-col gap-xs" style="margin-top: 6px;">
            ${myTransfers.map(tr => `
              <div class="flex-between align-center" style="padding: 8px 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                <div>
                  <div style="font-weight: 700; font-size: 0.85rem;">${escapeHtml(tr.to)}</div>
                  <div style="font-size: 0.75rem; color: #ef4444; font-weight: 800;">-${formatCurrency(tr.amount)}</div>
                </div>
                <button class="btn btn-danger btn-sm btn-clear-debt" 
                  data-amount="${tr.amount}" 
                  data-from="${escapeHtml(tr.from)}" 
                  data-to="${escapeHtml(tr.to)}" 
                  data-from-user-id="${escapeHtml(tr.fromUserId || myBalance.userId || '')}"
                  data-to-user-id="${escapeHtml(tr.toUserId || '')}"
                  data-swish="${escapeHtml(tr.toSwish || '')}"
                  style="background: #ef4444; border: none; font-weight: 800; padding: 6px 12px; font-size: 0.8rem;">
                  📱 Swisha ${formatCurrency(tr.amount)}
                </button>
              </div>
            `).join('')}
          </div>`;
      }

      heroCardHtml = `
        <div class="tab-hero-card hero-debt animate-in">
          <div class="flex-between align-center" style="margin-bottom: 8px;">
            <div style="font-size: 0.85rem; font-weight: 700; color: #f87171;">
              ⚠️ ${t('tab.clearDebtHeroTitle')}
            </div>
            <div style="font-size: 1.4rem; font-weight: 900; color: #ef4444;">
              -${formatCurrency(debtAmount)}
            </div>
          </div>
          <p class="text-muted" style="font-size: 0.8rem; margin-bottom: 12px;">
            ${myTransfers.length > 1 
              ? (isEn ? `You have unsettled debts to ${myTransfers.length} players. Swish each one:` : `Du har skulder till ${myTransfers.length} spelare. Swisha respektive mottagare:`)
              : t('tab.clearDebtHeroDesc')}
          </p>
          ${transfersListHtml}
        </div>`;
    } else if (myBalance.isDebtFree || myBalance.net === 0) {
      heroCardHtml = `
        <div class="tab-hero-card hero-debtfree animate-in">
          <div class="flex-between align-center" style="margin-bottom: 4px;">
            <div style="font-size: 0.9rem; font-weight: 800; color: #4ade80;">
              ${t('tab.debtFreeTitle')}
            </div>
            <div style="font-size: 1.3rem; font-weight: 900; color: #4ade80;">
              0 kr
            </div>
          </div>
          <p class="text-muted" style="font-size: 0.8rem; margin: 0;">
            ${t('tab.debtFreeDesc')}
          </p>
        </div>`;
    } else {
      heroCardHtml = `
        <div class="tab-hero-card hero-credit animate-in">
          <div class="flex-between align-center" style="margin-bottom: 4px;">
            <div style="font-size: 0.9rem; font-weight: 800; color: var(--gold);">
              💰 ${t('tab.creditTitle')}
            </div>
            <div style="font-size: 1.4rem; font-weight: 900; color: #4ade80;">
              +${formatCurrency(myBalance.net)}
            </div>
          </div>
          <p class="text-muted" style="font-size: 0.8rem; margin: 0;">
            ${t('tab.creditDesc')}
          </p>
        </div>`;
    }
  }

  // Tournament selector if multiple active
  let selectorHtml = '';
  if (activeTournaments.length > 1) {
    selectorHtml = `
      <div class="tab-tournament-selector">
        <span class="text-muted" style="font-size: 0.8rem; font-weight: 700;">Turnering:</span>
        <select class="form-input" id="tab-tour-select" style="max-width: 200px; padding: 4px 8px; font-size: 0.8rem;">
          ${activeTournaments.map(t => `
            <option value="${escapeHtml(t.shareCode)}" ${t.shareCode === currentTournamentCode ? 'selected' : ''}>
              ${escapeHtml(t.name)}
            </option>
          `).join('')}
        </select>
      </div>`;
  }

  // Render Standings & Audit rows
  const sortedBalances = [...balances].sort((a, b) => b.net - a.net);
  const standingsRowsHtml = sortedBalances.map((b, i) => {
    const isMe = user && ((b.userId && b.userId === user.id) || b.name === user.nickname || b.name === user.realName);
    const medal = i === 0 ? '👑 🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    const netClass = b.isDebtFree || b.net === 0 ? 'badge badge-success' : b.net > 0 ? 'text-green' : 'text-red';
    const netDisplay = b.isDebtFree || b.net === 0 ? t('tab.debtFreeBadge') : (b.net > 0 ? `+${formatCurrency(b.net)}` : formatCurrency(b.net));
    const userAudit = (b.key && auditTrail[b.key]) || auditTrail[b.name] || [];
    const drawerId = 'audit-' + (b.key ? b.key.replace(/[^a-zA-Z0-9_-]/g, '_') : escapeHtml(b.name));

    return `
      <div class="tab-player-group" style="margin-bottom: 6px;">
        <div class="tab-audit-row" data-drawer-id="${drawerId}" data-name="${escapeHtml(b.name)}" style="${isMe ? 'border-color: var(--gold); background: rgba(255,215,0,0.06);' : ''}">
          <div class="flex align-center gap-sm">
            <span style="font-size: 0.9rem; min-width: 24px;">${medal}</span>
            <div>
              <div style="font-weight: 700; font-size: 0.9rem;">
                ${escapeHtml(b.name)} ${isMe ? '<span class="badge badge-accent" style="font-size: 0.6rem; margin-left: 4px;">Du</span>' : ''}
              </div>
              <div class="text-muted" style="font-size: 0.75rem;">
                Brutto: ${b.rawTotal >= 0 ? '+' : ''}${formatCurrency(b.rawTotal)} · Reglerat: ${formatCurrency(b.totalPaid || 0)}
              </div>
            </div>
          </div>
          <div class="flex align-center gap-sm">
            <span class="${netClass}" style="font-weight: 800; font-size: 0.95rem;">${netDisplay}</span>
            <span class="text-muted audit-chevron" style="font-size: 0.75rem; transition: transform 0.2s;">▾</span>
          </div>
        </div>

        <!-- Audit Drawer -->
        <div class="tab-audit-drawer" id="${drawerId}" style="display: none;">
          <div class="text-secondary" style="font-size: 0.75rem; font-weight: 700; margin-bottom: 6px; text-transform: uppercase;">
            📋 ${t('tab.auditHistory')} (${b.name})
          </div>
          ${userAudit.length === 0 ? `
            <div class="text-muted" style="font-size: 0.75rem; font-style: italic;">
              ${t('tab.noHistoryYet')}
            </div>
          ` : userAudit.map(item => {
            const isPayment = item.type.startsWith('payment');
            const itemSign = item.amount >= 0 ? '+' : '';
            const itemClass = item.amount >= 0 ? 'text-green' : 'text-red';
            const icon = isPayment ? '📱' : item.won ? '✅' : '🔴';
            const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            return `
              <div class="audit-item">
                <div class="flex align-center gap-xs">
                  <span>${icon}</span>
                  <span style="font-weight: 600;">${escapeHtml(item.title)}</span>
                  ${dateStr ? `<span class="text-muted" style="font-size: 0.65rem;">(${dateStr})</span>` : ''}
                </div>
                <div class="${itemClass}" style="font-weight: 700;">
                  ${itemSign}${formatCurrency(item.amount)}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');

  // Render Transfers section ("📱 Att Swisha för helgen")
  let transfersHtml = '';
  if (transfers.length === 0) {
    transfersHtml = `
      <div class="card text-center" style="padding: 16px; background: rgba(74, 222, 128, 0.05); border: 1px solid rgba(74, 222, 128, 0.2);">
        <span style="font-size: 1.4rem;">🎉</span>
        <p style="margin: 4px 0 0; color: #4ade80; font-size: 0.85rem; font-weight: 700;">
          ${t('tab.noTransfersNeeded')}
        </p>
      </div>`;
  } else {
    transfersHtml = transfers.map(tr => {
      const isMeFrom = user && (tr.from === user.nickname || tr.from === user.realName || (tr.fromUserId && tr.fromUserId === user.id));
      const isMeTo = user && (tr.to === user.nickname || tr.to === user.realName || (tr.toUserId && tr.toUserId === user.id));
      const isHost = user && tour.creatorId === user.id;

      // Create Swish URL
      let swishUrl = '#';
      if (tr.toSwish) {
        swishUrl = createSwishUrl({
          phone: tr.toSwish,
          amount: tr.amount,
          message: `${tour.name} - Betpals`
        });
      }

      return `
        <div class="tab-transfer-card ${isMeFrom ? 'animate-pulse' : ''}" style="border-left-color: ${isMeFrom ? '#ef4444' : isMeTo ? '#4ade80' : 'var(--gold)'};">
          <div>
            <div style="font-weight: 700; font-size: 0.9rem;">
              <span class="${isMeFrom ? 'text-red' : ''}">${escapeHtml(tr.from)}</span>
              <span class="text-muted" style="margin: 0 4px;">➜</span>
              <span class="${isMeTo ? 'text-green' : ''}">${escapeHtml(tr.to)}</span>
            </div>
            <div class="text-muted" style="font-size: 0.75rem;">
              ${tr.toSwish ? `Swish: ${escapeHtml(tr.toSwish)}` : 'Inget Swish-nr registrerat'}
            </div>
          </div>
          <div class="flex align-center gap-xs">
            <div style="font-size: 1.1rem; font-weight: 900; margin-right: 6px; color: ${isMeFrom ? '#ef4444' : '#4ade80'};">
              ${formatCurrency(tr.amount)}
            </div>
            ${isMeFrom && tr.toSwish ? `
              <a href="${swishUrl}" target="_blank" class="btn btn-primary btn-xs" style="background: #2ecc71; border: none; font-weight: 700; padding: 6px 10px;">
                📱 ${t('tab.swishBtn')}
              </a>
            ` : ''}
            ${isMeTo ? `
              <button type="button" class="btn btn-secondary btn-xs btn-remind-transfer" data-from="${escapeHtml(tr.from)}" data-amount="${tr.amount}" style="padding: 6px 8px;">
                ${t('tab.remindBtn')}
              </button>
            ` : ''}
            ${(isMeTo || isHost) ? `
              <button type="button" class="btn btn-secondary btn-xs btn-settle-transfer" 
                data-from="${escapeHtml(tr.from)}" 
                data-to="${escapeHtml(tr.to)}" 
                data-from-user-id="${escapeHtml(tr.fromUserId || '')}"
                data-to-user-id="${escapeHtml(tr.toUserId || '')}"
                data-amount="${tr.amount}" 
                title="${t('tab.settleBtn')}" 
                style="padding: 6px 8px; font-weight: 700;">
                ${t('tab.settleBtn')}
              </button>
            ` : ''}
          </div>
        </div>`;
    }).join('');
  }

  container.innerHTML = `
    <div class="animate-in">
      <!-- Tournament Header Card -->
      <div class="card flex-between align-center" style="margin-bottom: var(--space-md); padding: 12px 16px;">
        <div>
          <h2 class="font-heading" style="font-size: 1.1rem; margin: 0; color: var(--gold);">
            🏆 ${escapeHtml(tour.name)}
          </h2>
          <div class="text-muted" style="font-size: 0.75rem;">
            Kod: <strong>${escapeHtml(tour.shareCode)}</strong> · ${settlement.finishedMainRounds ?? settlement.finishedRounds} av ${settlement.totalMainRounds ?? settlement.totalRounds} ${t('tab.roundsPlayed')}${(settlement.totalSideBets > 0) ? ` · ${settlement.finishedSideBets} av ${settlement.totalSideBets} sido-spel` : ''}
          </div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm btn-tab-open-tour" data-code="${escapeHtml(tour.shareCode)}" style="font-size: 0.75rem; padding: 6px 12px;">
          Öppna ➜
        </button>
      </div>

      ${selectorHtml}
      ${heroCardHtml}

      <!-- Standings & Audit Section -->
      <div class="section-header mt-md mb-xs">
        <h3 class="section-title" style="font-size: 0.95rem;">${t('tab.standingsTitle')}</h3>
      </div>
      <p class="text-muted" style="font-size: 0.75rem; margin-bottom: var(--space-sm);">
        ${t('tab.standingsDesc')}
      </p>
      <div class="tab-standings-list mb-lg">
        ${standingsRowsHtml}
      </div>

      <!-- Transfers Section -->
      <div class="section-header mt-lg mb-xs">
        <h3 class="section-title" style="font-size: 0.95rem;">${t('tab.toSwishTitle')}</h3>
      </div>
      <div class="tab-transfers-list mb-lg">
        ${transfersHtml}
      </div>

      <!-- Footer Quick Link -->
      <div class="text-center mt-lg">
        <button type="button" class="btn btn-secondary btn-block btn-tab-open-tour" data-code="${escapeHtml(tour.shareCode)}" style="padding: 12px; font-weight: 700;">
          ${t('tab.goToTournamentRounds')}
        </button>
      </div>
    </div>`;

  // Attach tournament selector listener
  document.getElementById('tab-tour-select')?.addEventListener('change', (e) => {
    currentTournamentCode = e.target.value;
    renderLeaderboard();
  });

  // Attach open tournament listeners
  container.querySelectorAll('.btn-tab-open-tour').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-code');
      if (code) {
        window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'tournament', code } }));
      }
    });
  });

  // Attach accordion drawer click listeners
  container.querySelectorAll('.tab-audit-row').forEach(row => {
    row.addEventListener('click', () => {
      const drawerId = row.getAttribute('data-drawer-id') || `audit-${row.getAttribute('data-name')}`;
      const drawer = document.getElementById(drawerId);
      const chevron = row.querySelector('.audit-chevron');
      if (drawer) {
        const isClosed = drawer.style.display === 'none';
        drawer.style.display = isClosed ? 'block' : 'none';
        if (chevron) chevron.style.transform = isClosed ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  });

  // Attach "Gör mig skuldfri nu" listener
  container.querySelectorAll('.btn-clear-debt').forEach(btn => {
    btn.addEventListener('click', async () => {
      const amount = Number(btn.getAttribute('data-amount')) || 0;
      const fromName = btn.getAttribute('data-from');
      const toName = btn.getAttribute('data-to');
      const fromUserId = btn.getAttribute('data-from-user-id') || undefined;
      const toUserId = btn.getAttribute('data-to-user-id') || undefined;
      const toSwish = btn.getAttribute('data-swish');

      let swishDeepLink = '#';
      if (toSwish) {
        swishDeepLink = createSwishUrl({
          phone: toSwish,
          amount,
          message: `${tour.name} - Betpals`
        });
      }

      // Open Swish if available
      if (toSwish) {
        window.open(swishDeepLink, '_blank');
      }

      const isHost = user && tour.creatorId === user.id;
      const isCreditor = user && ((toUserId && user.id === toUserId) || (user.nickname === toName || user.realName === toName));

      if (isHost || isCreditor) {
        const confirmText = isEn
          ? `Mark transfer of ${amount} kr from ${fromName} to ${toName} as settled?`
          : `Kvittera att överföringen på ${amount} kr från ${fromName} till ${toName} är genomförd?`;

        if (confirm(confirmText)) {
          try {
            await toggleSettlementReceipt(tour.id, {
              fromName,
              toName,
              fromUserId,
              toUserId,
              amount
            });
            showToast(isEn ? '🎉 Transfer settled! 🟢' : '🎉 Betalning kvitterad! 🟢', 'success');
            renderLeaderboard();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      } else {
        showToast(isEn 
          ? `📱 Swish opened for ${toName}! Once received, they will confirm the receipt.` 
          : `📱 Swish öppnat för ${toName}! När betalningen tagits emot kvitteras den.`, 'info');
      }
    });
  });

  // Attach Settle Transfer listeners
  container.querySelectorAll('.btn-settle-transfer').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fromName = btn.getAttribute('data-from');
      const toName = btn.getAttribute('data-to');
      const fromUserId = btn.getAttribute('data-from-user-id') || undefined;
      const toUserId = btn.getAttribute('data-to-user-id') || undefined;
      const amount = Number(btn.getAttribute('data-amount')) || 0;

      const confirmMsg = isEn
        ? `Mark transfer of ${amount} kr from ${fromName} to ${toName} as settled?`
        : `Kvittera att ${fromName} har swishat ${amount} kr till ${toName}?`;

      if (confirm(confirmMsg)) {
        try {
          await toggleSettlementReceipt(tour.id, { fromName, toName, fromUserId, toUserId, amount });
          showToast(isEn ? 'Transfer settled! ✅' : 'Överföring kvitterad! ✅', 'success');
          renderLeaderboard();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
  });

  // Attach Remind Transfer listener
  container.querySelectorAll('.btn-remind-transfer').forEach(btn => {
    btn.addEventListener('click', () => {
      const fromName = btn.getAttribute('data-from');
      const amount = btn.getAttribute('data-amount');
      const text = isEn 
        ? `Hey ${fromName}! Friendly reminder to settle ${amount} kr for ${tour.name} on Betpals 📱🤝`
        : `Tjena ${fromName}! Vänlig påminnelse att swisha ${amount} kr för ${tour.name} på Betpals 📱🤝`;

      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          showToast(isEn ? 'Reminder copied to clipboard! 📋' : 'Påminnelsetext kopierad till urklipp! 📋', 'success');
        });
      }
    });
  });
}

// ── 2. Swishlistan (Dueller & Minispel) Tab ─────────────
function renderSwishlistTab(container, duelSettlement, user) {
  const isEn = getLang() === 'en';
  if (!user) {
    container.innerHTML = `
      <div class="empty-state card text-center" style="padding: var(--space-xl) var(--space-md);">
        <div style="font-size: 2.5rem; margin-bottom: var(--space-sm);">📱</div>
        <h3 class="font-heading" style="color: var(--gold); margin-bottom: 6px;">
          ${isEn ? 'Log in to view Swish list' : 'Logga in för att se Swishlistan'}
        </h3>
        <p class="text-muted" style="font-size: 0.85rem; max-width: 360px; margin: 0 auto var(--space-md);">
          ${isEn ? 'Track your 1v1 minigame duels and debts with friends.' : 'Håll koll på dina 1v1-dueller och mikroskulder med polarna.'}
        </p>
        <button type="button" class="btn btn-primary btn-sm btn-tab-goto-profile">${t('nav.account')}</button>
      </div>`;

    container.querySelector('.btn-tab-goto-profile')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'profile' } }));
    });
    return;
  }

  const { friends, totalOwed, totalDue } = duelSettlement;

  container.innerHTML = `
    <div class="animate-in">
      <!-- Balance Hero Cards -->
      <div class="grid grid-2 gap-sm mb-sm">
        <div class="card text-center" style="padding: 14px; background: rgba(74, 222, 128, 0.08); border-color: rgba(74, 222, 128, 0.3);">
          <div style="font-size: 0.75rem; font-weight: 700; color: #4ade80; text-transform: uppercase;">
            ${isEn ? 'To Collect' : 'Att Kräva In'}
          </div>
          <div style="font-size: 1.4rem; font-weight: 900; color: #4ade80;">
            +${formatCurrency(totalDue)}
          </div>
        </div>
        <div class="card text-center" style="padding: 14px; background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.3);">
          <div style="font-size: 0.75rem; font-weight: 700; color: #f87171; text-transform: uppercase;">
            ${isEn ? 'You Owe' : 'Du Ska Swisha'}
          </div>
          <div style="font-size: 1.4rem; font-weight: 900; color: #ef4444;">
            -${formatCurrency(totalOwed)}
          </div>
        </div>
      </div>

      <!-- Tab Actions: Dela nota / Not-Roulette -->
      <div class="flex gap-xs mb-md">
        <button type="button" class="btn btn-primary btn-block" id="btn-swish-split-tab" style="padding: 10px 14px; font-weight: 800; font-size: 0.85rem; background: linear-gradient(135deg, #10b981, #059669); border: none; box-shadow: 0 4px 12px rgba(16,185,129,0.25);">
          ➕ ${isEn ? 'Split Tab (Even Steven)' : 'Dela nota / Krogutlägg'}
        </button>
        <button type="button" class="btn btn-secondary" id="btn-swish-roulette" style="padding: 10px 14px; font-weight: 800; font-size: 0.85rem; border-color: rgba(245,158,11,0.4); display: inline-flex; align-items: center; justify-content: center; gap: 6px;" title="${isEn ? 'Play Not-Roulette' : 'Kör Not-Roulette'}">
          <img src="/gold-card.png" alt="Card" style="width: 20px; height: 20px; object-fit: contain;" /> Not-Roulette
        </button>
      </div>

      <!-- Friends Settlement List -->
      <div class="section-header mb-sm">
        <h3 class="section-title" style="font-size: 0.95rem;">
          ${isEn ? '🎮 Minigames & Duels Settlement' : '🎮 Egen avräkning för Minispel & Dueller'}
        </h3>
        <p class="text-muted" style="font-size: 0.75rem; margin: 2px 0 0;">
          ${isEn 
            ? 'Independent peer-to-peer settlement for arcade duels, party games and tabs (separate from tournaments).' 
            : 'Fristående avräkning mellan dig och dina vänner för alla arkadspel, dueller och notor (separat från turneringen).'}
        </p>
      </div>

      ${friends.length === 0 ? `
        <div class="card text-center text-muted" style="padding: 24px;">
          <p style="margin: 0; font-size: 0.85rem;">
            ${isEn ? 'No unsettled duels found! Challenge a friend in the Arcade or split a bill! 🎲' : 'Inga oreglerade dueller! Utmana en kompis i Arkaden eller dela en nota! 🎲'}
          </p>
        </div>
      ` : friends.map(f => {
        const owesYou = f.netAmount > 0;
        const absAmount = Math.abs(f.netAmount);
        const swishUrl = f.friendSwish ? createSwishUrl({
          phone: f.friendSwish,
          amount: absAmount,
          message: 'Betpals Duell'
        }) : '#';

        const hasExpenseReceipt = (f.expenseIds && f.expenseIds.length > 0) || (f.duels && f.duels.some(d => d.expenseId || d.hasReceipt));
        const firstExpenseId = (f.expenseIds && f.expenseIds[0]) || (f.duels && f.duels.find(d => d.expenseId)?.expenseId);
        
        // Find custom titles if any
        const titles = (f.duels || [])
          .filter(d => d.customTitle)
          .map(d => d.customTitle);
        const uniqueTitles = Array.from(new Set(titles)).slice(0, 2);

        return `
          <div class="card mb-sm" style="padding: 12px 14px; border-left: 4px solid ${owesYou ? '#4ade80' : '#ef4444'};">
            <div class="flex-between align-center">
              <div>
                <div style="font-weight: 700; font-size: 0.95rem;">${escapeHtml(f.friendName)}</div>
                <div class="text-muted" style="font-size: 0.78rem;">
                  ${owesYou 
                    ? `<strong style="color: #4ade80;">+${absAmount} kr</strong> (${isEn ? 'owes you' : 'ska swisha dig'})` 
                    : `<strong style="color: #ef4444;">-${absAmount} kr</strong> (${isEn ? 'you owe' : 'du ska swisha'})`}
                  · ${f.duelsCount || f.duelCount || 1} ${isEn ? 'games/duels' : 'spel/dueller'}
                </div>
                ${uniqueTitles.length > 0 ? `
                  <div style="font-size: 0.72rem; color: var(--gold); margin-top: 2px;">
                    🧾 ${escapeHtml(uniqueTitles.join(' · '))}
                  </div>
                ` : ''}
              </div>
              <div class="flex align-center gap-xs">
                ${hasExpenseReceipt && firstExpenseId ? `
                  <button type="button" class="btn btn-secondary btn-xs btn-view-tab-receipt" data-expense-id="${firstExpenseId}" style="padding: 5px 8px; font-size: 0.75rem; border-color: rgba(245,158,11,0.4); color: var(--gold); font-weight: 700;" title="${isEn ? 'View attached receipt' : 'Visa kvitto'}">
                    🧾 ${isEn ? 'Receipt' : 'Kvitto'}
                  </button>
                ` : ''}
                ${!owesYou && f.friendSwish ? `
                  <a href="${swishUrl}" target="_blank" class="btn btn-primary btn-xs" style="background: #2ecc71; border: none; font-weight: 700; padding: 5px 8px; font-size: 0.75rem;">
                    📱 ${isEn ? 'Swish' : 'Swisha'} ${absAmount} kr
                  </a>
                ` : ''}
                ${owesYou ? `
                  <button type="button" class="btn btn-secondary btn-xs btn-remind-friend" data-name="${escapeHtml(f.friendName)}" data-amount="${absAmount}" style="padding: 5px 8px; font-size: 0.75rem;">
                    💬 ${isEn ? 'Remind' : 'Påminn'}
                  </button>
                  <button type="button" class="btn btn-secondary btn-xs btn-settle-duel-friend" data-friend-id="${f.friendId}" data-name="${escapeHtml(f.friendName)}" style="padding: 5px 8px; font-size: 0.75rem; font-weight: 700;">
                    ✅ ${isEn ? 'Settle' : 'Kvittera'}
                  </button>
                ` : `
                  <span class="badge" style="font-size: 0.72rem; background: rgba(239, 68, 68, 0.15); color: #f87171; padding: 4px 8px; border-radius: 6px;">
                    ⏳ ${isEn ? 'Waiting for confirmation' : 'Väntar på kvittens'}
                  </span>
                `}
              </div>
            </div>

            ${f.duels && f.duels.length > 0 ? `
              <div style="margin-top: 8px;">
                <button type="button" class="btn btn-ghost btn-xs btn-toggle-duels" data-friend-id="${f.friendId}" style="padding: 2px 6px; font-size: 0.72rem; color: var(--gold); border: 1px solid rgba(245,158,11,0.25); border-radius: 4px;">
                  📋 ${isEn ? 'Show games' : 'Visa minispel'} (${f.duels.length})
                </button>
                <div class="friend-duels-breakdown" id="duels-for-${f.friendId}" style="display: none; margin-top: 8px; padding: 8px 10px; background: rgba(0,0,0,0.25); border-radius: 6px; font-size: 0.75rem;">
                  ${f.duels.map(d => {
                    const gameIcons = {
                      dice: '🎲', coin: '🪙', darts: '🎯', beerpong: '🍺', quiz: '❓',
                      rockpaperscissors: '✂️', arcade: '👾', blitz: '⚡', mafia: '🕵️',
                      anybet: '🤝', flashbet: '⚡', even_steven: '🧾', not_roulette: '💳', shl_fantasy: '🏒'
                    };
                    const icon = gameIcons[d.gameType] || '🎲';
                    const title = d.customTitle || (d.gameType.charAt(0).toUpperCase() + d.gameType.slice(1));
                    const won = d.youWon;
                    const sign = won ? '+' : '-';
                    const color = won ? '#4ade80' : '#f87171';
                    return `
                      <div class="flex-between align-center" style="padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.06);">
                        <div>
                          <span>${icon}</span>
                          <strong>${escapeHtml(title)}</strong>
                          <span class="text-muted" style="font-size: 0.7rem; margin-left: 4px;">
                            (${won ? (isEn ? 'Won' : 'Vinst') : (isEn ? 'Lost' : 'Förlust')})
                          </span>
                        </div>
                        <div style="font-weight: 700; color: ${color};">
                          ${sign}${d.stakeAmount} kr
                        </div>
                      </div>`;
                  }).join('')}
                </div>
              </div>
            ` : ''}
          </div>`;
      }).join('')}

      <!-- Quick Link to Arcade -->
      <div class="text-center mt-lg">
        <button type="button" class="btn btn-primary btn-block btn-goto-arcade" style="padding: 12px; font-weight: 800;">
          🎲 ${isEn ? 'Open Arcade Minigames' : 'Gå till Spelarkaden'}
        </button>
      </div>
    </div>`;

  // Attach split tab action listeners
  container.querySelector('#btn-swish-split-tab')?.addEventListener('click', () => {
    openNotanRouletteModal('even_steven');
  });

  container.querySelector('#btn-swish-roulette')?.addEventListener('click', () => {
    openNotanRouletteModal('roulette');
  });

  container.querySelector('.btn-goto-arcade')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'home' } }));
  });

  // Attach receipt modal viewer listener
  container.querySelectorAll('.btn-view-tab-receipt').forEach(btn => {
    btn.addEventListener('click', () => {
      const expenseId = btn.getAttribute('data-expense-id');
      if (expenseId) {
        openReceiptModal(expenseId);
      }
    });
  });

  // Attach friend settle listener
  container.querySelectorAll('.btn-settle-duel-friend').forEach(btn => {
    btn.addEventListener('click', async () => {
      const friendId = btn.getAttribute('data-friend-id');
      const name = btn.getAttribute('data-name');
      const confirmMsg = isEn 
        ? `Are you sure you want to mark all duels with ${name} as settled?` 
        : `Är du säker på att du vill kvittera alla dueller med ${name}?`;

      if (confirm(confirmMsg)) {
        try {
          await settleDuelsWithFriend(friendId);
          showToast(isEn ? `Settled with ${name}! ✅` : `Uppgörelse med ${name} kvitterad! ✅`, 'success');
          renderLeaderboard();
        } catch (e) {
          showToast(e.message, 'error');
        }
      }
    });
  });

  // Attach friend remind listener
  container.querySelectorAll('.btn-remind-friend').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-name');
      const amount = btn.getAttribute('data-amount');
      const text = isEn
        ? `Hey ${name}! Friendly reminder to Swish ${amount} kr for our Betpals duels 🎲📱`
        : `Tjena ${name}! Vänlig påminnelse att swisha ${amount} kr för våra Betpals-dueller 🎲📱`;

      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          showToast(isEn ? 'Reminder copied to clipboard! 📋' : 'Påminnelsetext kopierad till urklipp! 📋', 'success');
        });
      }
    });
  });

  // Attach toggle duels breakdown listener
  container.querySelectorAll('.btn-toggle-duels').forEach(btn => {
    btn.addEventListener('click', () => {
      const friendId = btn.getAttribute('data-friend-id');
      const breakdown = container.querySelector(`#duels-for-${friendId}`);
      if (breakdown) {
        const isHidden = breakdown.style.display === 'none';
        breakdown.style.display = isHidden ? 'block' : 'none';
        btn.textContent = isHidden 
          ? `▲ ${isEn ? 'Hide games' : 'Dölj minispel'}` 
          : `📋 ${isEn ? 'Show games' : 'Visa minispel'}`;
      }
    });
  });
}

// ── 3. History & Archive Tab ───────────────────────────
function renderHistoryTab(container, pastTournaments) {
  const isEn = getLang() === 'en';

  if (!pastTournaments || pastTournaments.length === 0) {
    container.innerHTML = `
      <div class="card text-center text-muted" style="padding: 30px;">
        <div style="font-size: 2rem; margin-bottom: 6px;">📁</div>
        <p style="margin: 0; font-size: 0.85rem;">
          ${t('tab.noPastTournaments')}
        </p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="animate-in">
      <div class="section-header mb-sm">
        <h3 class="section-title" style="font-size: 0.95rem;">
          ${t('tab.pastTournaments')}
        </h3>
      </div>
      <div class="past-tournaments-list">
        ${pastTournaments.map(t => `
          <div class="card flex-between align-center mb-sm card-clickable btn-tab-open-tour" data-code="${escapeHtml(t.shareCode)}" style="padding: 12px 14px; cursor: pointer;">
            <div>
              <div style="font-weight: 700; font-size: 0.9rem;">
                🏆 ${escapeHtml(t.name)}
              </div>
              <div class="text-muted" style="font-size: 0.75rem;">
                ${t.roundCount} ronder · ${t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ''}
              </div>
            </div>
            <div class="flex align-center gap-xs">
              <span class="badge badge-success" style="font-size: 0.7rem;">Avräknad ✅</span>
              <span class="text-muted">➜</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;

  container.querySelectorAll('.btn-tab-open-tour').forEach(el => {
    el.addEventListener('click', () => {
      const code = el.getAttribute('data-code');
      if (code) {
        window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'tournament', code } }));
      }
    });
  });
}

// Re-render Swishlistan automatically if an expense is converted in real time
window.addEventListener('tab-expenses-updated', () => {
  const content = document.getElementById('page-content');
  if (content && activeTab === 'swishlist') {
    renderLeaderboard();
  }
});

