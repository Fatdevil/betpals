// ── Components: Odds Board ────────────────────────────
import { formatCurrency, formatOdds } from '../utils.js';

export function renderOddsBoard(event) {
  if (!event.players || event.players.length === 0) {
    return '<div class="empty-state"><div class="empty-state-icon">🎯</div><p class="empty-state-text">Inga spelare ännu</p></div>';
  }

  const totalPool = event.totalPool || 0;
  const maxBet = Math.max(...event.players.map(p => event.odds?.[p.id]?.totalBet || 0), 1);

  return `
    <div class="odds-grid">
      ${event.players.map(player => {
        const data = event.odds?.[player.id] || { totalBet: 0, odds: null };
        const barWidth = maxBet > 0 ? (data.totalBet / maxBet) * 100 : 0;

        return `
          <div class="odds-row" data-player-id="${player.id}">
            <div class="odds-player-name" title="${player.name}">${player.name}</div>
            <div class="odds-bar-container">
              <div class="odds-bar" style="width: ${barWidth}%"></div>
            </div>
            <div class="odds-amount">${formatCurrency(data.totalBet)}</div>
            <div class="odds-value">${formatOdds(data.odds)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
