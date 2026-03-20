// ── Page: Home / Dashboard ────────────────────────────
import { getEvents, getTournaments } from '../api.js';
import { formatCurrency, formatDate, statusLabel, statusBadgeClass } from '../utils.js';
import { navigate } from '../main.js';
import { t } from '../i18n.js';

export async function renderHome() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header animate-in">
      <h1 class="page-title">🎯 ${t('home.title')}</h1>
      <p class="page-subtitle">${t('home.subtitle')}</p>
    </div>
    <div id="tournaments-list"></div>
    <div id="events-list">
      <div class="text-center text-muted mt-lg">${t('common.loading')}</div>
    </div>
  `;

  try {
    const [events, tournaments] = await Promise.all([getEvents(), getTournaments()]);

    // Tournaments
    const tList = document.getElementById('tournaments-list');
    if (tournaments.length > 0) {
      tList.innerHTML = `
        <div class="section-header">
          <h2 class="section-title">🏆 ${t('home.tournaments')}</h2>
        </div>
        ${tournaments.map((tr, i) => `
          <div class="card card-clickable animate-in mb-sm" data-tournament-code="${tr.shareCode}"
               style="animation-delay: ${i * 0.08}s">
            <div class="flex-between">
              <div>
                <h3 style="font-family: var(--font-heading); font-weight: 700; font-size: 1.1rem;">${tr.name}</h3>
                <p class="text-secondary" style="font-size: 0.8rem; margin-top: 2px;">
                  ${tr.finishedCount}/${tr.roundCount} ${t('home.rounds')} · ${t('home.code')}: <span class="text-gold">${tr.shareCode}</span>
                </p>
              </div>
              <span class="badge ${tr.status === 'active' ? 'badge-accent' : 'badge-success'}">
                ${tr.status === 'active' ? t('common.active') : '✅ ' + t('common.finished')}
              </span>
            </div>
          </div>
        `).join('')}
      `;

      tList.querySelectorAll('[data-tournament-code]').forEach(card => {
        card.addEventListener('click', () => {
          navigate('tournament', { code: card.dataset.tournamentCode });
        });
      });
    }

    // Events
    if (events.length === 0 && tournaments.length === 0) {
      document.getElementById('events-list').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎯</div>
          <p class="empty-state-text">${t('home.noEvents')}</p>
          <div class="flex gap-md" style="justify-content: center;">
            <button class="btn btn-primary" id="go-admin-btn">${t('admin.createEvent')}</button>
            <button class="btn btn-secondary" id="go-join-btn">${t('nav.join')}</button>
          </div>
        </div>
      `;
      document.getElementById('go-admin-btn')?.addEventListener('click', () => navigate('admin'));
      document.getElementById('go-join-btn')?.addEventListener('click', () => navigate('join'));
      return;
    }

    const order = { open: 0, locked: 1, finished: 2 };
    events.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

    if (events.length > 0) {
      const evHeader = tournaments.length > 0 
        ? `<div class="section-header"><h2 class="section-title">🎲 ${t('home.events')}</h2></div>` 
        : '';
      document.getElementById('events-list').innerHTML = evHeader + events.map((ev, i) => `
        <div class="card card-clickable animate-in" data-event-id="${ev.shareCode}"
             style="animation-delay: ${(tournaments.length + i) * 0.08}s">
          <div class="flex-between">
            <div>
              <h3 style="font-family: var(--font-heading); font-weight: 700; font-size: 1.1rem;">
                ${ev.name}
              </h3>
              <p class="text-secondary" style="font-size: 0.8rem; margin-top: 2px;">
                ${formatDate(ev.date)} · ${ev.playerCount} ${t('home.players')} · ${ev.betCount} ${t('home.predictions')}
              </p>
            </div>
            <span class="badge ${statusBadgeClass(ev.status)}">${statusLabel(ev.status)}</span>
          </div>
          <div class="stats-row mt-md" style="margin-bottom: 0;">
            <div class="stat-card">
              <div class="stat-value">${formatCurrency(ev.totalPool)}</div>
              <div class="stat-label">${t('home.totalPool')}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${ev.payoutPercent}%</div>
              <div class="stat-label">${t('home.payout')}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${ev.shareCode}</div>
              <div class="stat-label">${t('home.code')}</div>
            </div>
          </div>
        </div>
      `).join('');
    } else {
      document.getElementById('events-list').innerHTML = '';
    }

    content.querySelectorAll('[data-event-id]').forEach(card => {
      card.addEventListener('click', () => {
        navigate('event', { code: card.dataset.eventId });
      });
    });

  } catch (err) {
    document.getElementById('events-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p class="empty-state-text">${t('common.error')}</p>
      </div>
    `;
  }
}
