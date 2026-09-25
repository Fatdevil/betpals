// ── Page: The Tab (Notan & Swish-Hub) ───────────────────
import { 
  getTournaments, 
  getTournament, 
  toggleSettlementReceipt, 
  getDuelSettlements, 
  getSettlementsOverview,
  settleDuelsWithFriend,
  clearSettlementWithFriend
} from '../api.js';
import { formatCurrency, showToast, escapeHtml, createSwishUrl } from '../utils.js';
import { t, getLang } from '../i18n.js';
import { getStoredUser, isLoggedIn } from '../auth.js';
import { openReceiptModal } from '../components/minigames.js';
import { openDelaUtlaggModal } from '../components/delaUtlagg.js';

let activeTab = 'overview'; // 'overview' | 'tournaments' | 'swishlist' | 'history'
let currentTournamentCode = null;

export async function renderLeaderboard(params = {}) {
  const content = document.getElementById('page-content');
  if (!content) return;

  const url = new URL(window.location);
  const tabParam = params.tab || url.searchParams.get('tab');
  if (tabParam && ['overview', 'tournaments', 'swishlist', 'history'].includes(tabParam)) {
    activeTab = tabParam;
  }

  content.innerHTML = `
    <div class="animate-in the-tab-container">
      <div class="page-header text-center" style="margin-bottom: var(--space-md); padding-top: 4px;">
        <div class="the-tab-logo-wrap" style="max-width: 170px; margin: 0 auto 6px;">
          <img src="/the-tab-chip.png" alt="THE TAB" class="the-tab-logo-img" style="width: 100%; max-width: 150px; height: auto; object-fit: contain; filter: drop-shadow(0 8px 24px rgba(245,158,11,0.28));" />
        </div>
        <p class="page-subtitle" style="margin-top: 2px;">${t('tab.subtitle')}</p>
      </div>

      <!-- Hero action: Dela på notan (Alt A) -->
      <div class="the-tab-hero-action animate-in">
        <button type="button" class="btn-hero-split-tab" id="btn-hero-dela-notan" title="${t('tab.splitHeroTitle') || 'Dela på notan'}">
          <div class="btn-hero-split-content">
            <div class="btn-hero-split-icon">🧾</div>
            <div class="btn-hero-split-text">
              <div class="btn-hero-split-title">
                <span>${t('tab.splitHeroTitle') || 'Dela på notan'}</span>
                <span class="btn-hero-split-badge">+</span>
              </div>
              <div class="btn-hero-split-desc">${t('tab.splitHeroSub') || 'Lunch, runda i baren, taxi eller bensin'}</div>
            </div>
            <div class="btn-hero-split-arrow">➜</div>
          </div>
        </button>
      </div>

      <div class="the-tab-nav the-tab-nav-grid">
        <button class="tab-nav-btn ${activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
          <span>💰</span> <span>${t('tab.saldo') || 'Saldo'}</span>
        </button>
        <button class="tab-nav-btn ${activeTab === 'tournaments' ? 'active' : ''}" data-tab="tournaments">
          <span>🏆</span> <span>${t('tab.weekendTournament') || 'Event'}</span>
        </button>
        <button class="tab-nav-btn ${activeTab === 'swishlist' ? 'active' : ''}" data-tab="swishlist">
          <span>🎲</span> <span>${t('tab.swishlist') || 'Dueller'}</span>
        </button>
        <button class="tab-nav-btn ${activeTab === 'history' ? 'active' : ''}" data-tab="history">
          <span>📁</span> <span>${t('tab.history') || 'Arkiv'}</span>
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

  // Attach Hero Dela på notan listener
  content.querySelector('#btn-hero-dela-notan')?.addEventListener('click', async () => {
    const isEn = getLang() === 'en';
    try {
      const allTours = await getTournaments().catch(() => []);
      const activeTours = (allTours || []).filter(t => t.status === 'active');

      // On the tournaments tab with a selected tournament, use that tournament directly
      if (activeTab === 'tournaments' && activeTours.length > 0) {
        const selectedCode = currentTournamentCode || activeTours[0].shareCode;
        const selectedTour = activeTours.find(t => t.shareCode === selectedCode) || activeTours[0];
        const fullTour = await getTournament(selectedTour.shareCode).catch(() => selectedTour);
        const balances = (fullTour.settlement && fullTour.settlement.balances) || [];
        const participants = balances.map(b => ({
          id: b.userId || b.name,
          name: b.name,
          nickname: b.name
        }));
        openDelaUtlaggModal({
          tournamentId: fullTour.id,
          tournamentName: fullTour.name,
          participants: participants.length > 0 ? participants : undefined,
          onSaved: () => renderLeaderboard()
        });
        return;
      }

      // No active tournaments — open standalone
      if (activeTours.length === 0) {
        openDelaUtlaggModal({ onSaved: () => renderLeaderboard() });
        return;
      }

      // 1+ active tournaments on non-tournament tabs — let user choose
      const standaloneLabel = isEn ? '📝 Standalone tab (no event)' : '📝 Fristående nota (inget event)';
      const options = [standaloneLabel, ...activeTours.map(t => `🏆 ${t.name}`)];
      const promptMsg = isEn
        ? `Link this tab to an event?\n\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\nEnter number (1 = standalone):`
        : `Koppla notan till ett event?\n\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\nAnge nummer (1 = fristående):`;

      const choice = prompt(promptMsg, '1');
      if (choice === null) return; // Cancelled

      const idx = parseInt(choice, 10) - 1;
      if (idx <= 0 || isNaN(idx)) {
        // Standalone
        openDelaUtlaggModal({ onSaved: () => renderLeaderboard() });
      } else if (idx <= activeTours.length) {
        const chosenTour = activeTours[idx - 1];
        const fullTour = await getTournament(chosenTour.shareCode).catch(() => chosenTour);
        const balances = (fullTour.settlement && fullTour.settlement.balances) || [];
        const participants = balances.map(b => ({
          id: b.userId || b.name,
          name: b.name,
          nickname: b.name
        }));
        openDelaUtlaggModal({
          tournamentId: fullTour.id,
          tournamentName: fullTour.name,
          participants: participants.length > 0 ? participants : undefined,
          onSaved: () => renderLeaderboard()
        });
      } else {
        openDelaUtlaggModal({ onSaved: () => renderLeaderboard() });
      }
    } catch {
      openDelaUtlaggModal({
        onSaved: () => renderLeaderboard()
      });
    }
  });

  try {
    const user = getStoredUser();
    const loggedIn = isLoggedIn();

    // Fetch tournaments
    const allTournaments = await getTournaments();
    const activeTournaments = allTournaments.filter(t => t.status === 'active');
    const pastTournaments = allTournaments.filter(t => t.status === 'settled');

    // Fetch settlements if logged in
    let overviewData = { friends: [], totalNet: 0, totalOwed: 0, totalDue: 0 };
    let duelSettlement = { friends: [], totalNet: 0, totalOwed: 0, totalDue: 0 };
    let overviewError = false;
    if (loggedIn) {
      try {
        const [rawOverview, rawDuels] = await Promise.all([
          getSettlementsOverview().catch(() => { overviewError = true; return null; }),
          getDuelSettlements().catch(() => null)
        ]);
        if (rawOverview) {
          overviewData = rawOverview;
          overviewError = false;
        }
        if (rawDuels) {
          const friends = rawDuels.friends || [];
          const totalDue = friends.filter(f => f.netAmount > 0).reduce((sum, f) => sum + f.netAmount, 0);
          const totalOwed = friends.filter(f => f.netAmount < 0).reduce((sum, f) => sum + (-f.netAmount), 0);
          duelSettlement = { friends, totalNet: rawDuels.totalNet || 0, totalOwed, totalDue };
        }
      } catch (e) {
        console.warn('Could not fetch settlements:', e);
      }
    }

    // Update badges
    const overviewBtn = content.querySelector('.tab-nav-btn[data-tab="overview"]');
    if (overviewBtn && overviewData.totalOwed > 0) {
      overviewBtn.innerHTML = `<span>💰</span> <span>${t('tab.saldo') || 'Saldo'}</span> <span class="badge badge-warning tab-badge-compact">${overviewData.totalOwed}:-</span>`;
    }

    const swishBtn = content.querySelector('.tab-nav-btn[data-tab="swishlist"]');
    if (swishBtn && duelSettlement.totalOwed > 0) {
      swishBtn.innerHTML = `<span>🎲</span> <span>${t('tab.swishlist') || 'Dueller'}</span> <span class="badge badge-warning tab-badge-compact">${duelSettlement.totalOwed}:-</span>`;
    }

    const tabBody = document.getElementById('tab-body');
    if (!tabBody) return;

    if (activeTab === 'overview') {
      renderOverviewTab(tabBody, overviewData, user, overviewError);
    } else if (activeTab === 'tournaments') {
      await renderTournamentTab(tabBody, activeTournaments, user);
    } else if (activeTab === 'swishlist') {
      renderSwishlistTab(tabBody, duelSettlement, user);
    } else {
      renderHistoryTab(tabBody, pastTournaments, user);
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

// ── 0. Unified "Who Owes Who" Tab ────────────────────
function renderOverviewTab(container, overview, user, overviewError = false) {
  const isEn = getLang() === 'en';
  if (!user) {
    container.innerHTML = `
      <div class="card text-center p-lg">
        <p class="text-secondary">${isEn ? 'Log in to view your unified settlements.' : 'Logga in för att se dina samlade uppgörelser och skulder.'}</p>
      </div>
    `;
    return;
  }

  const { friends = [], totalNet = 0, totalOwed = 0, totalDue = 0 } = overview || {};

  if (friends.length === 0) {
    if (overviewError) {
      container.innerHTML = `
        <div class="empty-state card text-center" style="padding: 32px 16px;">
          <div style="font-size: 3rem; margin-bottom: 8px;">⚠️</div>
          <h3 class="font-heading" style="color: #f59e0b; margin-bottom: 6px;">
            ${isEn ? 'Could not load balance' : 'Kunde inte hämta saldo'}
          </h3>
          <p class="text-muted" style="font-size: 0.85rem; max-width: 340px; margin: 0 auto 16px;">
            ${isEn ? 'There was a problem loading your settlements. Please try again.' : 'Det gick inte att hämta dina skulder just nu. Försök igen.'}
          </p>
          <div class="flex gap-sm justify-center">
            <button type="button" class="btn btn-primary btn-sm btn-overview-retry" style="font-weight: 700;">
              🔄 ${isEn ? 'Try Again' : 'Försök igen'}
            </button>
          </div>
        </div>
      `;
      container.querySelector('.btn-overview-retry')?.addEventListener('click', () => {
        renderLeaderboard();
      });
      return;
    }
    container.innerHTML = `
      <div class="empty-state card text-center" style="padding: 36px 20px;">
        <div style="font-size: 3.2rem; margin-bottom: 12px; filter: drop-shadow(0 4px 12px rgba(16, 185, 129, 0.25));">🥂</div>
        <h3 class="font-heading" style="color: #10b981; font-size: 1.25rem; margin-bottom: 8px;">
          ${t('tab.allSettledTitle') || (isEn ? 'All settled up! 🟢' : 'Helt kvitt med alla! 🟢')}
        </h3>
        <p class="text-muted" style="font-size: 0.88rem; max-width: 320px; margin: 0 auto; line-height: 1.5;">
          ${t('tab.allSettledDesc') || (isEn ? 'You have no open debts or pending payouts across any tournaments, minigames or tabs.' : 'Du har inga öppna skulder eller oreglerade belopp från turneringar, minispel eller notor.')}
        </p>
      </div>
    `;
    return;
  }

  const debtors = friends.filter(f => f.totalNet < 0);
  const creditors = friends.filter(f => f.totalNet > 0);
  const hasDebt = totalOwed > 0;
  const hasDue = totalDue > 0;

  let ctaHtml = '';
  if (hasDebt && !hasDue) {
    // State A: Only debt
    const singleDebtor = debtors.length === 1 ? debtors[0] : null;
    const debtorName = singleDebtor ? (singleDebtor.friendName || singleDebtor.friendNickname || '') : '';
    const singleSwishUrl = (singleDebtor && singleDebtor.friendSwish) ? createSwishUrl({
      phone: singleDebtor.friendSwish,
      amount: totalOwed,
      message: 'Malta Betting Slutavräkning'
    }) : null;

    const debtBtnLabel = singleDebtor 
      ? (isEn ? `📱 Pay ${formatCurrency(totalOwed)} to ${escapeHtml(debtorName)}` : `📱 Betala ${formatCurrency(totalOwed)} till ${escapeHtml(debtorName)}`)
      : (isEn ? `📱 Clear My Debts (${formatCurrency(totalOwed)} total)` : `📱 Gör mig skuldfri (${formatCurrency(totalOwed)} totalt)`);

    ctaHtml = `
      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-glass);">
        ${singleSwishUrl ? `
          <a href="${singleSwishUrl}" class="btn btn-danger btn-block btn-overview-pay-debts" id="btn-overview-pay-debts"
            style="background: #ef4444; border: none; font-weight: 800; padding: 11px 16px; font-size: 0.9rem; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.35); text-decoration: none; text-align: center; display: block;" target="_blank" rel="noopener">
            ${debtBtnLabel}
          </a>
        ` : `
          <button type="button" class="btn btn-danger btn-block btn-overview-pay-debts" id="btn-overview-pay-debts" 
            data-single-name="${escapeHtml(debtorName)}"
            style="background: #ef4444; border: none; font-weight: 800; padding: 11px 16px; font-size: 0.9rem; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.35);">
            ${debtBtnLabel}
          </button>
        `}
      </div>
    `;
  } else if (!hasDebt && hasDue) {
    // State B: Only credit/claim
    const collectLabel = isEn 
      ? `💬 Collect My Payouts (+${formatCurrency(totalDue)})`
      : `💬 Kräv in mina fordringar (+${formatCurrency(totalDue)})`;

    ctaHtml = `
      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-glass);">
        <button type="button" class="btn btn-primary btn-block btn-overview-collect-due" id="btn-overview-collect-due"
          style="background: linear-gradient(135deg, #10b981, #059669); border: none; font-weight: 800; padding: 11px 16px; font-size: 0.9rem; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);">
          ${collectLabel}
        </button>
      </div>
    `;
  } else if (hasDebt && hasDue) {
    // State C: Both debt and credit
    const singleDebtor = debtors.length === 1 ? debtors[0] : null;
    const debtorName = singleDebtor ? (singleDebtor.friendName || singleDebtor.friendNickname || '') : '';
    const singleSwishUrl = (singleDebtor && singleDebtor.friendSwish) ? createSwishUrl({
      phone: singleDebtor.friendSwish,
      amount: totalOwed,
      message: 'Malta Betting Slutavräkning'
    }) : null;

    const debtBtnLabel = singleDebtor 
      ? (isEn ? `📱 Pay ${formatCurrency(totalOwed)}` : `📱 Betala ${formatCurrency(totalOwed)}`)
      : (isEn ? `📱 Clear Debts (-${formatCurrency(totalOwed)})` : `📱 Gör mig skuldfri (-${formatCurrency(totalOwed)})`);
    const collectLabel = isEn 
      ? `💬 Collect (+${formatCurrency(totalDue)})`
      : `💬 Kräv in (+${formatCurrency(totalDue)})`;

    ctaHtml = `
      <div class="flex gap-xs mt-md pt-xs" style="flex-wrap: wrap; border-top: 1px solid var(--border-glass);">
        ${singleSwishUrl ? `
          <a href="${singleSwishUrl}" class="btn btn-danger btn-overview-pay-debts" id="btn-overview-pay-debts"
            style="flex: 1; min-width: 140px; background: #ef4444; border: none; font-weight: 800; padding: 10px 12px; font-size: 0.85rem; box-shadow: 0 3px 10px rgba(239, 68, 68, 0.3); text-decoration: none; text-align: center; display: block;" target="_blank" rel="noopener">
            ${debtBtnLabel}
          </a>
        ` : `
          <button type="button" class="btn btn-danger btn-overview-pay-debts" id="btn-overview-pay-debts" 
            data-single-name="${escapeHtml(debtorName)}"
            style="flex: 1; min-width: 140px; background: #ef4444; border: none; font-weight: 800; padding: 10px 12px; font-size: 0.85rem; box-shadow: 0 3px 10px rgba(239, 68, 68, 0.3);">
            ${debtBtnLabel}
          </button>
        `}
        <button type="button" class="btn btn-primary btn-overview-collect-due" id="btn-overview-collect-due"
          style="flex: 1; min-width: 140px; background: linear-gradient(135deg, #10b981, #059669); border: none; font-weight: 800; padding: 10px 12px; font-size: 0.85rem; box-shadow: 0 3px 10px rgba(16, 185, 129, 0.3);">
          ${collectLabel}
        </button>
      </div>
    `;
  }

  container.innerHTML = `
    <!-- Top Summary Banner -->
    <div class="card p-md mb-md animate-in" style="background: linear-gradient(135deg, rgba(20,20,35,0.9), rgba(10,10,20,0.95)); border: 1.5px solid ${totalNet < 0 ? 'rgba(239,68,68,0.35)' : totalNet > 0 ? 'rgba(16,185,129,0.35)' : 'var(--border-glass)'};">
      <div class="flex-between align-center mb-xs">
        <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
          ${isEn ? 'Total Net Balance' : 'Din totala ställning'}
        </span>
        <span class="badge" style="font-size: 0.88rem; font-weight: 800; background: ${totalNet < 0 ? 'rgba(239,68,68,0.2)' : totalNet > 0 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}; color: ${totalNet < 0 ? '#ef4444' : totalNet > 0 ? '#10b981' : 'var(--gold)'}; padding: 4px 10px;">
          ${totalNet > 0 ? `+${totalNet} kr` : `${totalNet} kr`}
        </span>
      </div>
      <div class="flex gap-md mt-sm pt-xs" style="border-top: 1px solid var(--border-glass);">
        <div style="flex: 1;">
          <div style="font-size: 0.72rem; color: var(--text-muted);">${isEn ? 'To Swish others' : 'Du ska swisha'}</div>
          <div style="font-size: 1.15rem; font-weight: 800; color: #ef4444;">${totalOwed} kr</div>
        </div>
        <div style="flex: 1;">
          <div style="font-size: 0.72rem; color: var(--text-muted);">${isEn ? 'Others to Swish you' : 'Andra ska swisha dig'}</div>
          <div style="font-size: 1.15rem; font-weight: 800; color: #10b981;">${totalDue} kr</div>
        </div>
      </div>
      ${ctaHtml}
    </div>

    <!-- Friends Settlement Cards -->
    <div class="section-header-bar mb-sm">
      <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-secondary);">
        👥 ${isEn ? 'Net settlements per person' : 'Nettosaldo per kompis'} (${friends.length})
      </span>
    </div>

    <div id="overview-friends-cards" style="display: flex; flex-direction: column; gap: 10px;">
      ${friends.map((f, i) => {
        const owesYou = f.totalNet > 0;
        const absAmount = Math.abs(f.totalNet);
        const swishUrl = f.friendSwish ? createSwishUrl({
          phone: f.friendSwish,
          amount: absAmount,
          message: 'Malta Betting Slutavräkning'
        }) : '#';

        return `
          <div class="card p-sm animate-in" style="border-left: 4px solid ${owesYou ? '#10b981' : '#ef4444'}; animation-delay: ${i * 0.05}s;">
            <div class="flex-between align-center">
              <div class="flex gap-sm align-center" style="min-width: 0; flex: 1;">
                <div style="width: 38px; height: 38px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; border: 1px solid var(--border-glass);">
                  ${f.friendAvatarUrl ? `<img src="${f.friendAvatarUrl}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" />` : (f.friendAvatarEmoji || '👤')}
                </div>
                <div style="min-width: 0;">
                  <div style="font-weight: 700; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${escapeHtml(f.friendName || f.friendNickname)}
                  </div>
                  <div style="font-size: 0.75rem; color: ${owesYou ? '#10b981' : '#ef4444'}; font-weight: 600;">
                    ${owesYou 
                      ? (isEn ? `Owes you ${absAmount} kr` : `Ska swisha dig ${absAmount} kr`) 
                      : (isEn ? `You owe ${absAmount} kr` : `Du ska swisha ${absAmount} kr`)}
                  </div>
                </div>
              </div>

              <!-- Action buttons -->
              <div class="flex gap-xs align-center" style="flex-shrink: 0;">
                ${!owesYou && absAmount > 0 ? `
                  <a href="${swishUrl}" class="swish-pay-btn" style="padding: 7px 12px; font-size: 0.8rem; font-weight: 700;" target="_blank" rel="noopener">
                    📱 Swisha
                  </a>
                ` : owesYou && absAmount > 0 ? `
                  <button type="button" class="btn btn-ghost btn-xs btn-remind-unified" data-phone="${f.friendSwish || ''}" data-name="${escapeHtml(f.friendName || f.friendNickname)}" data-amount="${absAmount}" style="color: var(--gold); padding: 6px 10px;">
                    ${isEn ? '💬 Remind' : '💬 Påminn'}
                  </button>
                  <button type="button" class="btn btn-primary btn-xs btn-clear-all" data-friend-id="${escapeHtml(f.friendId)}" data-friend-name="${escapeHtml(f.friendName || f.friendNickname)}" data-amount="${absAmount}" data-duels="${f.duelsCount || 0}" data-tournaments="${(f.details || []).filter(d => d.type === 'tournament').length}" style="background: linear-gradient(135deg, #10b981, #059669); border: none; font-weight: 700; padding: 6px 10px; font-size: 0.75rem;">
                    ${isEn ? '✅ Settle all' : '✅ Kvittera allt'}
                  </button>
                ` : ''}
                <button type="button" class="btn btn-secondary btn-xs btn-toggle-unified-details" data-target="details-${i}" title="${isEn ? 'View specification' : 'Visa underlag'}" style="padding: 6px 8px; font-size: 0.75rem;">
                  🔍
                </button>
              </div>
            </div>

            <!-- Expandable specification / details -->
            <div id="details-${i}" class="unified-details-drawer" style="display: none; margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-glass); font-size: 0.78rem;">
              <div style="font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">
                ${isEn ? 'Specification:' : 'Underlag:'}
              </div>
              ${(f.details && f.details.length > 0) ? f.details.map(d => `
                <div class="flex-between py-xs" style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                  <span>${escapeHtml(d.title)}</span>
                  <span style="font-weight: 700; color: ${d.amount >= 0 ? '#10b981' : '#ef4444'};">
                    ${d.amount >= 0 ? `+${d.amount}` : d.amount} kr
                  </span>
                </div>
              `).join('') : `
                <div class="text-muted">${isEn ? 'No detail breakdown' : 'Ingen specifikation tillgänglig'}</div>
              `}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Attach toggle listeners
  container.querySelectorAll('.btn-toggle-unified-details').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const drawer = document.getElementById(targetId);
      if (drawer) {
        const isShown = drawer.style.display !== 'none';
        drawer.style.display = isShown ? 'none' : 'block';
      }
    });
  });

  // Attach remind listener
  container.querySelectorAll('.btn-remind-unified').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-name');
      const amount = btn.getAttribute('data-amount');
      const text = isEn 
        ? `Hey ${name}! Friendly reminder to Swish ${amount} kr for our Malta Betting games & tabs 📱🤝`
        : `Tjena ${name}! Vänlig påminnelse att swisha ${amount} kr för våra Malta Betting-spel och notor 📱🤝`;

      if (navigator.share) {
        navigator.share({ text }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          showToast(isEn ? 'Reminder copied! 📋' : 'Påminnelsetext kopierad till urklipp! 📋', 'success');
        });
      }
    });
  });

  // Attach atomic clearing listener
  container.querySelectorAll('.btn-clear-all').forEach(btn => {
    btn.addEventListener('click', async () => {
      const friendId = btn.getAttribute('data-friend-id');
      const friendName = btn.getAttribute('data-friend-name');
      const amount = Number(btn.getAttribute('data-amount')) || 0;
      const duels = btn.getAttribute('data-duels') || '0';
      const tournaments = btn.getAttribute('data-tournaments') || '0';

      const confirmMsg = isEn
        ? `Mark ALL debts from ${friendName} as settled?\n\n${amount} kr total (${duels} duels, ${tournaments} tournaments)\n\nThis action cannot be undone.`
        : `Kvittera ALLA skulder från ${friendName}?\n\n${amount} kr totalt (${duels} dueller, ${tournaments} turneringar)\n\nDetta kan inte ångras.`;

      if (!confirm(confirmMsg)) return;

      btn.disabled = true;
      btn.innerHTML = '⏳';

      try {
        const result = await clearSettlementWithFriend(friendId, amount);
        showToast(
          isEn
            ? `All settled! ✅ ${result.totalCleared} kr cleared (${result.clearedDuels} duels, ${result.clearedTournaments} tournaments)`
            : `Allt kvitterat! ✅ ${result.totalCleared} kr clearades (${result.clearedDuels} dueller, ${result.clearedTournaments} turneringar)`,
          'success'
        );
        renderLeaderboard();
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = isEn ? '✅ Settle all' : '✅ Kvittera allt';
        if (err.message && err.message.includes('ändrats')) {
          showToast(isEn ? 'Balance changed — reloading...' : 'Saldot har ändrats — laddar om...', 'warning');
          renderLeaderboard();
        } else {
          showToast(err.message || 'Något gick fel', 'error');
        }
      }
    });
  });

  // Attach top CTA listener for collecting due amounts
  const collectDueBtn = container.querySelector('#btn-overview-collect-due');
  if (collectDueBtn) {
    collectDueBtn.addEventListener('click', () => {
      const storedUser = getStoredUser();
      const myPhone = storedUser?.swishNumber || storedUser?.phone || '';
      const creditorsList = friends.filter(f => f.totalNet > 0);

      let shareText = '';
      if (creditorsList.length === 1) {
        const c = creditorsList[0];
        const cName = c.friendName || c.friendNickname || (isEn ? 'friend' : 'kompis');
        const phoneNotice = myPhone ? (isEn ? ` to ${myPhone}` : ` till ${myPhone}`) : '';
        shareText = isEn
          ? `Hey ${cName}! Friendly reminder to Swish ${c.totalNet} kr for our Malta Betting games & tabs${phoneNotice} 📱🤝`
          : `Tjena ${cName}! Vänlig påminnelse att swisha ${c.totalNet} kr för våra Malta Betting-spel och notor${phoneNotice} 📱🤝`;
      } else {
        const breakdown = creditorsList.map(c => `• ${c.friendName || c.friendNickname}: ${c.totalNet} kr`).join('\n');
        const phoneNotice = myPhone ? (isEn ? `\n\nSwish to: ${myPhone}` : `\n\nSwisha gärna till: ${myPhone}`) : '';
        shareText = isEn
          ? `Hey everyone! Friendly reminder for open balances in The Tab / Malta Betting (${totalDue} kr total):\n${breakdown}${phoneNotice} 📱🤝`
          : `Tjena! Vänlig påminnelse om utestående belopp i The Tab / Malta Betting (totalt ${totalDue} kr):\n${breakdown}${phoneNotice} 📱🤝`;
      }

      if (navigator.share) {
        navigator.share({
          title: isEn ? 'Malta Betting – Outstanding debts reminder' : 'Malta Betting – Påminnelse om utestående belopp',
          text: shareText
        }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(shareText).then(() => {
          showToast(isEn ? 'Reminder copied to clipboard! 📋' : 'Påminnelsetext kopierad till urklipp! 📋', 'success');
        }).catch(() => {
          showToast(shareText, 'info');
        });
      }
    });
  }

  // Attach top CTA listener for paying debts (when rendered as a button)
  const payDebtsBtn = container.querySelector('button#btn-overview-pay-debts');
  if (payDebtsBtn) {
    payDebtsBtn.addEventListener('click', () => {
      const singleName = payDebtsBtn.getAttribute('data-single-name');
      const cardsEl = document.getElementById('overview-friends-cards');
      if (cardsEl) cardsEl.scrollIntoView({ behavior: 'smooth' });

      if (singleName) {
        showToast(
          isEn
            ? `No Swish number found for ${singleName}. See specification below.`
            : `Inget Swish-nummer för ${singleName}. Se underlag nedan.`,
          'info'
        );
      } else {
        showToast(
          isEn
            ? 'Tap "📱 Swisha" on each person below to clear all debts 📱'
            : 'Klicka på "📱 Swisha" på respektive person nedan för att betala 📱',
          'info'
        );
      }
    });
  }
}

// ── 1. Tournament Settlement Tab ──────────────────────
async function renderTournamentTab(container, activeTournaments, user) {
  if (!activeTournaments || activeTournaments.length === 0) {
    container.innerHTML = `
      <div class="empty-state card text-center" style="padding: var(--space-xl) var(--space-md);">
        <div style="display: flex; justify-content: center; margin-bottom: var(--space-md);">
          <img src="/malta-chips-gold.png" alt="Malta Betting" class="animate-in" style="width: 140px; max-width: 60vw; height: auto; object-fit: contain; filter: drop-shadow(0 8px 24px rgba(0,0,0,0.7)) drop-shadow(0 0 16px rgba(255, 215, 0, 0.25));" />
        </div>
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
        <span class="text-muted" style="font-size: 0.8rem; font-weight: 700;">Event:</span>
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
            const isExpense = item.type === 'expense';
            const itemSign = item.amount >= 0 ? '+' : '';
            const itemClass = item.amount >= 0 ? 'text-green' : 'text-red';
            const icon = isPayment ? '📱' : isExpense ? '🛒' : item.won ? '✅' : '🔴';
            const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            return `
              <div class="audit-item">
                <div class="flex align-center gap-xs" style="flex: 1; min-width: 0;">
                  <span>${icon}</span>
                  <span style="font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(item.title)}</span>
                  ${dateStr ? `<span class="text-muted" style="font-size: 0.65rem;">(${dateStr})</span>` : ''}
                </div>
                <div class="flex align-center gap-xs">
                  ${(item.expenseId || item.hasReceipt) ? `
                    <button type="button" class="btn btn-ghost btn-xs btn-view-tab-receipt" data-expense-id="${escapeHtml(item.expenseId || '')}" style="padding: 1px 6px; font-size: 0.68rem; color: var(--gold); border: 1px solid rgba(245,166,35,0.3); border-radius: 4px;" title="${isEn ? 'View receipt' : 'Visa kvitto'}">
                      🧾 ${isEn ? 'Receipt' : 'Kvitto'}
                    </button>
                  ` : ''}
                  <div class="${itemClass}" style="font-weight: 700;">
                    ${itemSign}${formatCurrency(item.amount)}
                  </div>
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
          message: `${tour.name} - Malta Betting`
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

  // Attach receipt modal viewer listener in audit drawer
  container.querySelectorAll('.btn-view-tab-receipt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const expenseId = btn.getAttribute('data-expense-id');
      if (expenseId) {
        openReceiptModal(expenseId);
      }
    });
  });

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
          message: `${tour.name} - Malta Betting`
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
        ? `Hey ${fromName}! Friendly reminder to settle ${amount} kr for ${tour.name} on Malta Betting 📱🤝`
        : `Tjena ${fromName}! Vänlig påminnelse att swisha ${amount} kr för ${tour.name} på Malta Betting 📱🤝`;

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

      <!-- Friends Settlement List -->
      <div class="section-header mb-sm">
        <h3 class="section-title" style="font-size: 0.95rem;">
          ${isEn ? '🎮 Minigames & Duels Settlement' : '🎮 Egen avräkning för Minispel & Dueller'}
        </h3>
        <p class="text-muted" style="font-size: 0.75rem; margin: 2px 0 0;">
          ${isEn 
            ? 'Independent peer-to-peer settlement for arcade duels, party games and tabs (separate from events).' 
            : 'Fristående avräkning mellan dig och dina vänner för alla arkadspel, dueller och notor (separat från eventet).'}
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
          message: 'Malta Betting Duell'
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
                      flashbet: '⚡',
                      anybet: '🤝',
                      even_steven: '🧾',
                      gimme: '🏌️',
                      'coin-flip': '🪙',
                      coin: '🪙',
                      flashlive: '🔴',
                      mafia: '🕵️',
                      blind10: '⏱️',
                      wheel: '💳',
                      space_invaders: '👾',
                      'space-invaders': '👾',
                      slots: '🎰',
                      loven_game: '🟢',
                      shl_fantasy: '🏒',
                      // Bakåtkompatibilitet för äldre historik
                      dice: '🎲',
                      darts: '🎯',
                      beerpong: '🍺',
                      quiz: '❓',
                      rockpaperscissors: '✂️',
                      curling: '🥌',
                      arcade: '👾',
                      blitz: '⚡'
                    };
                    const gameTitles = {
                      flashbet: 'BlixtBet',
                      anybet: 'AnyBet',
                      even_steven: isEn ? 'Split Tab' : 'Dela på notan',
                      gimme: 'Gimme',
                      'coin-flip': isEn ? 'Coin Flip' : 'Krona/Klave',
                      coin: isEn ? 'Coin Flip' : 'Krona/Klave',
                      flashlive: 'FlashLive',
                      mafia: isEn ? 'Mafia' : 'Maffia',
                      blind10: 'Blind 10',
                      wheel: isEn ? 'Tab-Roulette' : 'Not-Roulette',
                      space_invaders: 'Space Invaders',
                      'space-invaders': 'Space Invaders',
                      slots: isEn ? 'Slots' : 'Enarmad bandit',
                      loven_game: 'Löven Game',
                      shl_fantasy: 'SHL Fantasy'
                    };
                    const icon = gameIcons[d.gameType] || '🎲';
                    const title = d.customTitle || gameTitles[d.gameType] || (d.gameType.charAt(0).toUpperCase() + d.gameType.slice(1));
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
        ? `Hey ${name}! Friendly reminder to Swish ${amount} kr for our Malta Betting duels 🎲📱`
        : `Tjena ${name}! Vänlig påminnelse att swisha ${amount} kr för våra Malta Betting-dueller 🎲📱`;

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
function renderHistoryTab(container, pastTournaments, user = null) {
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
        ${pastTournaments.map(tItem => `
          <div class="card mb-sm" style="padding: 12px 14px;">
            <div class="flex-between align-center">
              <div>
                <div style="font-weight: 700; font-size: 0.9rem;">
                  🏆 ${escapeHtml(tItem.name)}
                </div>
                <div class="text-muted" style="font-size: 0.75rem;">
                  ${tItem.roundCount} ${isEn ? 'games' : 'spel'} · ${tItem.createdAt ? new Date(tItem.createdAt).toLocaleDateString() : ''}
                </div>
              </div>
              <div class="flex align-center gap-xs">
                <span class="badge badge-success" style="font-size: 0.7rem;">${isEn ? 'Settled ✅' : 'Avräknad ✅'}</span>
              </div>
            </div>
            <div class="flex gap-xs mt-xs" style="margin-top: 8px;">
              <button type="button" class="btn btn-secondary btn-xs btn-toggle-history-settlement" data-code="${escapeHtml(tItem.shareCode)}" data-tour-id="${escapeHtml(tItem.id)}" data-creator-id="${escapeHtml(tItem.creatorId || '')}" style="font-size: 0.75rem; padding: 4px 10px;">
                📊 ${isEn ? 'View Settlement' : 'Visa slutavräkning'}
              </button>
              <button type="button" class="btn btn-ghost btn-xs btn-tab-open-tour" data-code="${escapeHtml(tItem.shareCode)}" style="font-size: 0.75rem; padding: 4px 10px;">
                ➜ ${isEn ? 'Open Event' : 'Öppna event'}
              </button>
            </div>
            <div class="history-settlement-drawer" id="history-settle-${escapeHtml(tItem.shareCode)}" style="display: none; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;"></div>
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

  container.querySelectorAll('.btn-toggle-history-settlement').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.getAttribute('data-code');
      const tourId = btn.getAttribute('data-tour-id');
      const creatorId = btn.getAttribute('data-creator-id');
      if (!code) return;
      const drawer = container.querySelector(`#history-settle-${code}`);
      if (!drawer) return;

      if (drawer.style.display !== 'none') {
        drawer.style.display = 'none';
        btn.innerHTML = `📊 ${isEn ? 'View Settlement' : 'Visa slutavräkning'}`;
        return;
      }

      drawer.style.display = 'block';
      btn.innerHTML = `▲ ${isEn ? 'Hide Settlement' : 'Dölj avräkning'}`;
      drawer.innerHTML = `<div class="text-center text-muted" style="padding: 12px 0;"><span class="spinner" style="font-size: 1.1rem; margin-right: 6px;">⏳</span> ${isEn ? 'Loading...' : 'Hämtar avräkning...'}</div>`;

      try {
        const fullTour = await getTournament(code);
        const settlement = fullTour.settlement || {};
        const balances = settlement.balances || [];
        const transfers = settlement.transfers || [];
        const isHost = user && fullTour.creatorId === user.id;

        let html = '';
        if (balances.length === 0) {
          html = `<p class="text-muted text-center" style="font-size: 0.8rem; margin: 4px 0;">${isEn ? 'No settlement data recorded.' : 'Ingen avräkningsdata registrerad.'}</p>`;
        } else {
          html += `
            <div style="font-size: 0.8rem; font-weight: 600; margin-bottom: 6px; color: var(--gold);">
              📈 ${isEn ? 'Final Standings' : 'Slutställning'}:
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;">
              ${balances.map(b => {
                const isWinner = b.net > 0;
                const isEven = b.net === 0;
                const badgeClass = isWinner ? 'badge-success' : (isEven ? 'badge-neutral' : 'badge-danger');
                const netFormatted = isWinner ? `+${b.net} kr` : `${b.net} kr`;
                return `
                  <div class="flex-between align-center" style="font-size: 0.8rem; padding: 4px 8px; background: rgba(255,255,255,0.03); border-radius: 4px;">
                    <span>${escapeHtml(b.name)}</span>
                    <span class="badge ${badgeClass}" style="font-size: 0.7rem; font-weight: 700;">${netFormatted}</span>
                  </div>`;
              }).join('')}
            </div>`;

          if (transfers.length > 0) {
            html += `
              <div style="font-size: 0.8rem; font-weight: 600; margin-bottom: 6px; color: var(--text-muted);">
                📱 ${isEn ? 'Swish Transfers' : 'Swish-överföringar'}:
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${transfers.map(tr => {
                  const isMeFrom = user && (tr.from === user.nickname || tr.from === user.realName || (tr.fromUserId && tr.fromUserId === user.id));
                  const isMeTo = user && (tr.to === user.nickname || tr.to === user.realName || (tr.toUserId && tr.toUserId === user.id));

                  let swishUrl = '#';
                  if (isMeFrom && tr.toSwish) {
                    swishUrl = createSwishUrl({
                      phone: tr.toSwish,
                      amount: tr.amount,
                      message: `${fullTour.name} - Malta Betting`
                    });
                  }

                  return `
                  <div class="flex-between align-center" style="font-size: 0.75rem; padding: 6px 8px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 3px solid ${isMeFrom ? '#ef4444' : isMeTo ? '#4ade80' : 'var(--gold)'};">
                    <div>
                      <span class="${isMeFrom ? 'text-red' : ''}"><strong>${escapeHtml(tr.from)}</strong></span>
                      <span class="text-muted" style="margin: 0 4px;">➜</span>
                      <span class="${isMeTo ? 'text-green' : ''}"><strong>${escapeHtml(tr.to)}</strong></span>
                    </div>
                    <div class="flex align-center gap-xs">
                      <span style="font-weight: 700; color: ${isMeFrom ? '#ef4444' : '#4ade80'};">${tr.amount} kr</span>
                      ${isMeFrom && tr.toSwish ? `
                        <a href="${swishUrl}" target="_blank" class="btn btn-primary btn-xs" style="background: #2ecc71; border: none; font-weight: 700; padding: 4px 8px; font-size: 0.7rem;">
                          📱 Swish
                        </a>
                      ` : ''}
                      ${isMeTo ? `
                        <button type="button" class="btn btn-secondary btn-xs btn-history-remind" data-from="${escapeHtml(tr.from)}" data-amount="${tr.amount}" data-tour-name="${escapeHtml(fullTour.name)}" style="padding: 4px 8px; font-size: 0.7rem;">
                          ${t('tab.remindBtn')}
                        </button>
                      ` : ''}
                      ${(isMeTo || isHost) ? `
                        <button type="button" class="btn btn-secondary btn-xs btn-history-settle" 
                          data-tour-id="${escapeHtml(fullTour.id)}"
                          data-from="${escapeHtml(tr.from)}" 
                          data-to="${escapeHtml(tr.to)}" 
                          data-from-user-id="${escapeHtml(tr.fromUserId || '')}"
                          data-to-user-id="${escapeHtml(tr.toUserId || '')}"
                          data-amount="${tr.amount}" 
                          style="padding: 4px 8px; font-size: 0.7rem; font-weight: 700;">
                          ${t('tab.settleBtn')}
                        </button>
                      ` : ''}
                    </div>
                  </div>`;
                }).join('')}
              </div>`;
          } else {
            html += `<p class="text-muted" style="font-size: 0.75rem; margin: 4px 0;">${isEn ? 'All debts settled! 🟢' : 'Alla skulder kvittade! 🟢'}</p>`;
          }
        }
        drawer.innerHTML = html;

        // Attach settle listeners for archived tournament transfers
        drawer.querySelectorAll('.btn-history-settle').forEach(settleBtn => {
          settleBtn.addEventListener('click', async () => {
            const tId = settleBtn.getAttribute('data-tour-id');
            const fromName = settleBtn.getAttribute('data-from');
            const toName = settleBtn.getAttribute('data-to');
            const fromUserId = settleBtn.getAttribute('data-from-user-id') || undefined;
            const toUserId = settleBtn.getAttribute('data-to-user-id') || undefined;
            const amount = Number(settleBtn.getAttribute('data-amount')) || 0;

            const confirmMsg = isEn
              ? `Mark transfer of ${amount} kr from ${fromName} to ${toName} as settled?`
              : `Kvittera att ${fromName} har swishat ${amount} kr till ${toName}?`;

            if (confirm(confirmMsg)) {
              try {
                await toggleSettlementReceipt(tId, { fromName, toName, fromUserId, toUserId, amount });
                showToast(isEn ? 'Transfer settled! ✅' : 'Överföring kvitterad! ✅', 'success');
                // Re-render the drawer to show updated state
                btn.click(); // close
                btn.click(); // re-open with fresh data
              } catch (err) {
                showToast(err.message, 'error');
              }
            }
          });
        });

        // Attach remind listeners for archived tournament transfers
        drawer.querySelectorAll('.btn-history-remind').forEach(remindBtn => {
          remindBtn.addEventListener('click', () => {
            const fromName = remindBtn.getAttribute('data-from');
            const amount = remindBtn.getAttribute('data-amount');
            const tourName = remindBtn.getAttribute('data-tour-name');
            const text = isEn
              ? `Hey ${fromName}! Friendly reminder to settle ${amount} kr for ${tourName} on Malta Betting 📱🤝`
              : `Tjena ${fromName}! Vänlig påminnelse att swisha ${amount} kr för ${tourName} på Malta Betting 📱🤝`;

            if (navigator.clipboard) {
              navigator.clipboard.writeText(text).then(() => {
                showToast(isEn ? 'Reminder copied to clipboard! 📋' : 'Påminnelsetext kopierad till urklipp! 📋', 'success');
              });
            }
          });
        });

      } catch (err) {
        drawer.innerHTML = `<p class="text-danger text-center" style="font-size: 0.75rem;">${escapeHtml(err.message)}</p>`;
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

