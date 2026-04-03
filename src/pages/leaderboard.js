// ── Page: Leaderboard ──────────────────────────────────
import { getLeaderboard } from '../api.js';
import { formatCurrency, showToast } from '../utils.js';
import { t } from '../i18n.js';

export async function renderLeaderboard() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="animate-in">
      <div class="page-header">
        <h1 class="page-title">${t('leaderboard.title')}</h1>
        <p class="page-subtitle">${t('leaderboard.subtitle')}</p>
      </div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
    </div>`;

  try {
    const leaders = await getLeaderboard();
    renderLeaderboardContent(content, leaders);
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state animate-in">
        <div class="empty-state-icon">❌</div>
        <p class="empty-state-text">${err.message}</p>
      </div>`;
  }
}

function renderLeaderboardContent(content, leaders) {
  if (leaders.length === 0) {
    content.innerHTML = `
      <div class="animate-in">
        <div class="page-header">
          <h1 class="page-title">${t('leaderboard.title')}</h1>
          <p class="page-subtitle">${t('leaderboard.subtitle')}</p>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <p class="empty-state-text">${t('leaderboard.noPlayers')}</p>
        </div>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div class="animate-in">
      <div class="page-header">
        <h1 class="page-title">${t('leaderboard.title')}</h1>
        <p class="page-subtitle">${t('leaderboard.subtitle')}</p>
      </div>

      <!-- Podium -->
      ${leaders.length >= 1 ? renderPodium(leaders.slice(0, 3)) : ''}

      <!-- Stats Summary -->
      <div class="lb-summary">
        <div class="stat-card">
          <div class="stat-value" style="color: var(--gold);">${leaders.length}</div>
          <div class="stat-label">${t('leaderboard.players')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${leaders.reduce((s, p) => s + p.totalBets, 0)}</div>
          <div class="stat-label">${t('leaderboard.totalPredictions')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: var(--green);">${formatCurrency(leaders.reduce((s, p) => s + p.totalBet, 0))}</div>
          <div class="stat-label">${t('leaderboard.totalPool')}</div>
        </div>
      </div>

      <!-- Full Rankings -->
      <div class="section-header">
        <h2 class="section-title">${t('leaderboard.allPlayers')}</h2>
      </div>
      <div class="leaderboard-list">
        ${leaders.map((p, i) => renderRow(p, i)).join('')}
      </div>
    </div>
  `;
}

function renderRow(p, i) {
  const medals = ['🥇', '🥈', '🥉'];
  const rankDisplay = i < 3 ? medals[i] : `<span class="lb-rank-num">${i + 1}</span>`;
  const profitSign = p.profit >= 0 ? '+' : '';
  const profitClass = p.profit >= 0 ? 'text-green' : 'text-red';

  return `
    <div class="lb-row ${i < 3 ? 'lb-top-' + (i + 1) : ''}">
      <div class="lb-rank">${rankDisplay}</div>
      <div class="lb-avatar-cell">${p.avatar}</div>
      <div class="lb-info">
        <div class="lb-name">${p.nickname}</div>
        <div class="lb-meta">
          <span>${p.wins}V/${p.losses}F</span>
          <span class="lb-dot">·</span>
          <span>${p.winRate}% ${t('leaderboard.win')}</span>
          <span class="lb-dot">·</span>
          <span>${p.totalBets} ${t('admin.bets')}</span>
        </div>
      </div>
      <div class="lb-numbers">
        <div class="lb-profit ${profitClass}">${profitSign}${formatCurrency(p.profit)}</div>
        <div class="lb-roi ${profitClass}">ROI ${profitSign}${p.roi}%</div>
      </div>
    </div>
  `;
}

function renderPodium(top3) {
  // Reorder for visual podium: [2nd, 1st, 3rd]
  const order = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
  const positions = top3.length >= 3
    ? [
        { medal: '🥈', label: '2:a', height: 90, rank: 2, glow: 'silver' },
        { medal: '🥇', label: '1:a', height: 130, rank: 1, glow: 'gold' },
        { medal: '🥉', label: '3:e', height: 65, rank: 3, glow: 'bronze' }
      ]
    : top3.map((_, i) => ({
        medal: ['🥇', '🥈', '🥉'][i],
        label: ['1:a', '2:a', '3:e'][i],
        height: [130, 90, 65][i],
        rank: i + 1,
        glow: ['gold', 'silver', 'bronze'][i]
      }));

  return `
    <div class="podium-container">
      ${order.map((p, i) => {
        const pos = positions[i];
        const profitSign = p.profit >= 0 ? '+' : '';
        return `
          <div class="podium-place podium-${pos.glow}">
            <div class="podium-avatar-wrap">
              <div class="podium-avatar">${p.avatar}</div>
            </div>
            <div class="podium-name">${p.nickname}</div>
            <div class="podium-profit ${p.profit >= 0 ? 'text-green' : 'text-red'}">
              ${profitSign}${formatCurrency(p.profit)}
            </div>
            <div class="podium-winrate">${p.winRate}% ${t('leaderboard.win')}</div>
            <div class="podium-bar podium-bar-${pos.glow}" style="height: ${pos.height}px">
              <span class="podium-medal">${pos.medal}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
