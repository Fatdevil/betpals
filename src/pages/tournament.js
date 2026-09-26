import { getTournament, addTournamentRound, getTournamentQR, markBetPaid, createSideBet, addTournamentBanner, deleteTournamentBanner, getTournamentPhotos, uploadTournamentPhoto, deleteTournamentPhoto, togglePhotoLike, toggleSettlementReceipt, deleteTournament, deleteEvent, settleTournament, reopenTournament, cancelEvent, lockEvent, reopenEvent, boostEvent, updateEventDeadline, getActiveFlashBets, connectWebSocket, disconnectWebSocket, onWebSocketMessage, addFriend, inviteFriendsToTournament, getFriends } from '../api.js';
import { formatCurrency, formatDeadline, parseDateSafe, showToast, launchConfetti, escapeHtml, sanitizeUrl, getAppBaseUrl } from '../utils.js';
import { getStoredUser, isLoggedIn } from '../auth.js';
import { showModal, closeModal } from '../components/modal.js';
import { openFlashBetModal } from '../components/minigames.js';
import { renderSponsorCarousel, initSponsorCarousel } from '../components/sponsor-carousel.js';
import { navigate } from '../main.js';
import { compressImage } from '../imageUtils.js';

let wsUnsubscribe = null;
let sponsorCarouselCleanup = null;

export function cleanupTournament() {
  disconnectWebSocket();
  if (wsUnsubscribe) {
    wsUnsubscribe();
    wsUnsubscribe = null;
  }
  if (sponsorCarouselCleanup) {
    sponsorCarouselCleanup();
    sponsorCarouselCleanup = null;
  }
}

export async function renderTournament(params = {}) {
  cleanupTournament();
  const content = document.getElementById('page-content');
  const code = params.code;
  if (!code) {
    content.innerHTML = '<div class="text-center text-muted mt-lg">Inget event valt</div>';
    return;
  }

  content.innerHTML = '<div class="text-center text-muted mt-lg">Laddar event...</div>';

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
      if (msg.type === 'tournament_updated' || msg.type === 'flash_bet_created' || msg.type === 'flash_bet_settled' || msg.type === 'flash_bet_deleted') {
        renderTournament(params);
      }
    });

  } catch (err) {
    if (err.data?.error === 'ACCESS_RESTRICTED' || err.message === 'ACCESS_RESTRICTED') {
      const rest = err.data || {};
      const creatorName = escapeHtml(rest.creatorName || 'Arrangören');
      const isFof = rest.restriction === 'friends_of_friends';
      const currentUser = getStoredUser();

      content.innerHTML = `
        <div class="animate-in" style="max-width: 440px; margin: 40px auto; padding: 0 16px;">
          <div class="card text-center" style="padding: 32px 20px; border: 1.5px solid var(--border-light); background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(10,10,20,0.85) 100%);">
            <div style="font-size: 3.2rem; margin-bottom: 12px;">🔒</div>
            <h2 class="font-heading" style="font-size: 1.4rem; margin-bottom: 8px;">Privat Event</h2>
            <p class="text-secondary" style="font-size: 0.9rem; line-height: 1.5; margin-bottom: 20px;">
              ${isFof 
                ? `Detta event är öppet för <strong>${creatorName}</strong> och dennes vänner samt deras vänner.`
                : `Detta event är endast öppet för personer som är vän med <strong>${creatorName}</strong> i Malta Betting.`
              }
            </p>
            ${currentUser ? `
              ${rest.creatorId && rest.creatorId !== currentUser.id ? `
                <button type="button" class="btn btn-primary btn-block" id="add-host-friend-btn" data-creator="${rest.creatorId}" style="font-weight: 700;">
                  ➕ Bli vän med ${creatorName}
                </button>
              ` : ''}
            ` : `
              <button type="button" class="btn btn-primary btn-block" id="login-to-join-btn" style="font-weight: 700;">
                Logga in för att kontrollera behörighet
              </button>
            `}
            <div class="mt-md">
              <button type="button" class="btn btn-secondary btn-sm" id="back-home-btn" style="width: 100%;">
                ← Tillbaka till startsidan
              </button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('back-home-btn')?.addEventListener('click', () => {
        navigate('home');
      });
      document.getElementById('login-to-join-btn')?.addEventListener('click', () => {
        navigate('profile');
      });
      document.getElementById('add-host-friend-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('add-host-friend-btn');
        if (btn) btn.disabled = true;
        try {
          const res = await addFriend({ friendId: rest.creatorId });
          showToast(res.status === 'pending' ? `Vänförfrågan skickad till ${creatorName}! När hen godkänner får du tillgång. 📨` : `Du och ${creatorName} är nu vänner! 👥`, 'success');
          setTimeout(() => renderTournament(params), 800);
        } catch (e) {
          showToast(e.message, 'error');
          if (btn) btn.disabled = false;
        }
      });
      return;
    }

    content.innerHTML = '<div class="text-center text-red mt-lg">' + escapeHtml(err.message) + '</div>';
  }
}

function renderTournamentContent(content, t, photos = [], tournamentFlashBets = []) {
  const code = t.shareCode;
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

  // One card design for every game (rounds and side bets): options as chips, one status
  // line, a clear call to action and the organiser's actions behind "⋯"
  const renderGameCard = (g, nested = false) => {
    const dl = g.closesAt ? formatDeadline(g.closesAt) : null;
    const isExpired = Boolean(dl && dl.isExpired);
    const isOpen = g.status === 'open' && !isExpired;
    const isSelf = g.betMode === 'self';
    const mine = g.myBets || [];
    const stake = g.minBet === g.maxBet ? formatCurrency(g.minBet) : `${formatCurrency(g.minBet)}–${formatCurrency(g.maxBet)}`;
    const shown = (g.players || []).slice(0, 4);
    const more = (g.players || []).length - shown.length;

    let meta;
    let cta;
    if (g.status === 'finished') {
      meta = `<span class="game-card-win">🏆 ${escapeHtml(g.winnerName || 'Avgjort')}${g.isTie ? ' 🤝' : ''}</span> · pott ${formatCurrency(g.totalPool)}`;
      cta = '<span class="game-card-link">Se resultat →</span>';
    } else if (g.status === 'cancelled') {
      meta = '🛑 Avbrutet';
      cta = '<span class="game-card-link">Se spel →</span>';
    } else if (isSelf) {
      meta = `👥 Alla med · ${formatCurrency(g.minBet)}/st · pott ${formatCurrency(g.totalPool)}`;
      cta = '<span class="game-card-wait">⏳ Väntar på resultat</span>';
    } else if (isOpen) {
      meta = `${dl ? `<span class="game-card-time">⏱ ${escapeHtml(dl.shortText)}</span> · ` : ''}${stake} · ${g.betCount} ${g.betCount === 1 ? 'bet' : 'bets'}`;
      cta = mine.length > 0 ? '<span class="game-card-link">Se spel →</span>' : '<span class="game-card-cta">Betta →</span>';
    } else {
      meta = `🔒 Stängt för bets · pott ${formatCurrency(g.totalPool)}`;
      cta = '<span class="game-card-link">Se spel →</span>';
    }

    const mineLine = !isSelf && mine.length > 0
      ? `<div class="game-card-mine">✓ Du bettade: ${mine.map(b => `${escapeHtml(b.playerName)} · ${formatCurrency(b.amount)}`).join(', ')}</div>`
      : '';

    return `
      <div class="game-card card-clickable round-link${nested ? ' game-card-nested' : ''}" data-code="${escapeHtml(g.shareCode)}" id="round-${g.id}">
        <div class="game-card-top">
          ${g.imageUrl ? `<img src="${sanitizeUrl(g.imageUrl)}" alt="" class="game-card-img" loading="lazy" />` : ''}
          <h3 class="game-card-title">${escapeHtml(g.name)}</h3>
          ${isCreator ? `<button type="button" class="game-card-menu" data-id="${g.id}" data-name="${escapeHtml(g.name)}" data-open="${isOpen ? '1' : ''}" data-reopenable="${!isOpen && g.status !== 'finished' && g.status !== 'cancelled' ? '1' : ''}" aria-label="Spelledarval">⋯</button>` : ''}
        </div>
        <div class="game-card-chips">
          ${shown.map(p => `<span class="game-chip">${escapeHtml(p.name)}</span>`).join('')}
          ${more > 0 ? `<span class="game-chip game-chip-more">+${more}</span>` : ''}
        </div>
        ${mineLine}
        <div class="game-card-foot">
          <span class="game-card-meta">${meta}</span>
          ${cta}
        </div>
      </div>
    `;
  };

  const top3 = [...t.settlement.balances].sort((a, b) => b.net - a.net).slice(0, 3);

  // Who is in the event: first names and initials for the hero row
  const people = (t.participants || []).map(p => String(p.name || '').trim()).filter(Boolean);
  const firstName = (n) => n.split(/\s+/)[0];
  const initials = (n) => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const peopleText = people.length === 0
    ? 'Bjud in gänget'
    : people.slice(0, 3).map(firstName).join(', ') + (people.length > 3 ? ` +${people.length - 3}` : '');

  content.innerHTML = `
    <div class="animate-in">
      <div class="event-hero">
        <div class="event-hero-eyebrow">🏆 Event</div>
        <h1 class="event-hero-title">${escapeHtml(t.name)}</h1>
        <span class="event-status ${t.status === 'active' ? 'live' : 'done'}">
          ${t.status === 'active' ? '<span class="dot"></span> Pågår' : '🏁 Avgjort'}
        </span>
        <button type="button" class="event-people" id="event-people-btn">
          ${people.length > 0 ? `
            <span class="avatars">
              ${people.slice(0, 4).map(n => `<span class="av">${escapeHtml(initials(n))}</span>`).join('')}
            </span>
          ` : '<span>👥</span>'}
          <span>${escapeHtml(peopleText)}</span>
        </button>
        <div class="event-hero-actions">
          <button class="btn btn-secondary btn-sm" id="share-tournament-btn">
            📱 Dela event
          </button>
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
        <h2 class="section-title">📋 Spel & Tävlingar</h2>
      </div>
      ${allEvents.length === 0 ? `
        <div class="card text-center mb-md event-empty">
          <img src="/malta-chips-gold-sm.webp" alt="" class="event-empty-img" width="120" height="120" />
          ${isCreator ? `
            <h3 class="event-empty-title">Inga spel än</h3>
            <p class="text-muted event-empty-text">
              Vad ska gänget tävla om först? Matchspel på TV (1-X-2), ölhävning (vinnare tar allt) eller poolodds!
            </p>
            <button class="btn btn-primary" id="empty-add-game-btn" style="font-weight: 800; padding: 10px 20px; font-size: 0.9rem;">
              ➕ Lägg till kvällens första spel
            </button>
          ` : `
            <h3 class="event-empty-title">Snart kör vi! 🎲</h3>
            <p class="text-muted event-empty-text" style="margin-bottom: 0;">
              Spelledaren lägger snart upp kvällens första spel – håll utkik här. Dela gärna en bild så länge 📸
            </p>
          `}
        </div>
      ` : `
        <div class="game-list">
          ${t.rounds.map(r => `
            ${renderGameCard(r)}
            ${(sideBetsByRound[r.id] || []).map(sb => renderGameCard(sb, true)).join('')}
          `).join('')}
          ${unlinkedSideBets.map(sb => renderGameCard(sb)).join('')}
        </div>
      `}

      <!-- Sponsor Banners -->
      ${(t.banners && t.banners.length > 0) || isCreator ? `
        ${t.banners && t.banners.length > 0 ? renderSponsorCarousel(t.banners, {
          isCreator,
          carouselId: 'tournament-sponsor-carousel',
          title: '⭐ Sponsorer',
          showSectionHeader: true
        }) : `
          <div class="section-header mt-md">
            <h2 class="section-title">⭐ Sponsorer</h2>
          </div>
        `}
        ${isCreator ? `
          <button class="btn btn-secondary btn-sm mt-sm" id="add-banner-btn" style="width: 100%;">
            📸 Lägg till sponsor
          </button>
        ` : ''}
      ` : ''}

      <!-- Action Buttons -->
      ${t.status === 'active' && isCreator ? `
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
              🏆 Avsluta event & kora vinnare
            </button>
          ` : ''}
          ${isCreator && t.status === 'settled' ? `
            <button class="btn btn-secondary btn-block mt-md" id="reopen-tournament-btn" style="font-size: 0.85rem; padding: 10px; width: 100%;">
              🔓 Återöppna event
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
        ${photos.length === 0 ? `
          <div class="card text-center event-empty" style="padding: 20px 16px;">
            <div style="font-size: 2rem; margin-bottom: 4px;">📸</div>
            <p class="text-muted" style="font-size: 0.85rem; margin: 0 0 12px;">Inga bilder ännu – fånga kvällens bästa ögonblick!</p>
            ${user ? '<button type="button" class="btn btn-secondary btn-sm" id="empty-add-photo-btn">📸 Dela första bilden</button>' : ''}
          </div>
        ` : ''}
        ${photos.map(p => `
          <div class="photo-card card animate-in">
            <div class="photo-header flex-between mb-sm" style="align-items: center;">
              <div class="flex" style="align-items: center; gap: 8px;">
                ${p.uploaderAvatar 
                  ? `<img src="${p.uploaderAvatar}" alt="${escapeHtml(p.uploaderName)}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" />`
                  : `<div class="avatar-circle" style="width: 28px; height: 28px; font-size: 0.9rem;">${escapeHtml(p.uploaderEmoji || '🎲')}</div>`
                }
                <div>
                  <div style="font-weight: 700; font-size: 0.85rem;">${escapeHtml(p.uploaderName)}</div>
                  <div class="text-muted" style="font-size: 0.7rem;">${(parseDateSafe(p.createdAt) || new Date()).toLocaleString('sv-SE', {day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit'})}</div>
                </div>
              </div>
              ${(user && p.userId === user.id) || isCreator ? `<button type="button" class="btn-icon photo-delete-x delete-photo-btn" data-id="${p.id}" title="Radera bild" aria-label="Radera bild">✕</button>` : ''}
            </div>
            <img src="${p.url}" class="photo-img photo-feed-img" data-url="${p.url}" data-caption="${escapeHtml(p.caption || '')}" data-uploader="${escapeHtml(p.uploaderName)}" style="width: 100%; border-radius: var(--radius-sm); margin-bottom: var(--space-xs); object-fit: cover; max-height: 500px; cursor: pointer;" title="Klicka för helskärm" loading="lazy" />
            ${p.caption ? `<div class="photo-caption text-secondary" style="font-size: 0.85rem; margin-bottom: var(--space-sm);">${escapeHtml(p.caption)}</div>` : ''}
            <div class="photo-actions mt-xs">
              <button type="button" class="btn-icon like-btn ${p.userLiked ? 'liked' : ''}" data-id="${p.id}" ${!user ? 'disabled title="Logga in för att gilla"' : ''} style="display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); background: ${p.userLiked ? 'rgba(255, 60, 60, 0.15)' : 'rgba(255,255,255,0.05)'}; transition: all 0.2s ease;${!user ? ' opacity: 0.5;' : ''}">
                <span class="heart-icon" style="font-size: 1.1rem; filter: ${p.userLiked ? 'drop-shadow(0 0 4px rgba(255, 60, 60, 0.5))' : 'none'};">${p.userLiked ? '❤️' : '🤍'}</span> 
                <span class="like-count text-secondary" style="font-size: 0.85rem; font-weight: 600;">${p.likeCount > 0 ? p.likeCount : 'Gilla'}</span>
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      ${isCreator ? `
        <div class="event-danger-zone">
          <button type="button" class="btn btn-ghost btn-sm" id="delete-tournament-btn" title="Radera hela eventet">
            🗑️ Radera eventet
          </button>
        </div>
      ` : ''}

    </div>
  `;

  // Empty photo feed: same as "Dela bild"
  document.getElementById('empty-add-photo-btn')?.addEventListener('click', () => {
    document.getElementById('add-photo-btn')?.click();
  });

  // Who is in the event
  document.getElementById('event-people-btn')?.addEventListener('click', () => {
    if (people.length === 0) {
      document.getElementById('share-tournament-btn')?.click();
      return;
    }
    showModal(`👥 Med i eventet (${people.length})`, `
      <div style="display: flex; flex-direction: column; gap: 6px;">
        ${people.map(n => `
          <div class="flex" style="align-items: center; gap: 10px; padding: 6px 4px; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span class="event-people-av">${escapeHtml(initials(n))}</span>
            <span style="font-weight: 600;">${escapeHtml(n)}</span>
          </div>
        `).join('')}
      </div>
    `);
  });

  // Click round to view
  document.querySelectorAll('.round-link').forEach(el => {
    el.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'event', code: el.dataset.code } }));
    });
  });

  // Lightbox for photos in live feed
  content.querySelectorAll('.photo-feed-img').forEach(img => {
    img.addEventListener('click', () => {
      const url = sanitizeUrl(img.dataset.url || '');
      const caption = escapeHtml(img.dataset.caption || '');
      const uploader = escapeHtml(img.dataset.uploader || '');
      showModal('📸 Foto', `
        <div class="photo-lightbox-modal text-center">
          <div style="max-height: 70vh; display: flex; align-items: center; justify-content: center; background: #000; border-radius: var(--radius-sm); overflow: hidden; margin-bottom: var(--space-sm);">
            <img src="${url}" alt="${caption || 'Eventfoto'}" style="max-width: 100%; max-height: 70vh; object-fit: contain;" />
          </div>
          ${caption ? `<p style="font-size: 0.95rem; font-weight: 500; margin-bottom: var(--space-xs); text-align: left;">${caption}</p>` : ''}
          <div class="text-muted" style="font-size: 0.8rem; text-align: left;">Delad av <strong>${uploader}</strong></div>
        </div>
      `);
    });
  });

  // Photo Upload
  document.getElementById('add-photo-btn')?.addEventListener('click', () => {
    showModal('📸 Dela en bild', `
      <form id="photo-form">
        <div class="form-group">
          <label class="form-label">Bild</label>
          <div class="sponsor-upload-area" id="photo-drop-area" style="min-height: 180px; flex-direction: column; gap: var(--space-xs); text-align: center;">
            <div id="photo-preview-container" style="display:none; width: 100%;">
              <img id="photo-preview-img" style="max-width: 100%; max-height: 250px; border-radius: var(--radius-sm); object-fit: contain; margin: 0 auto;" />
            </div>
            <div id="photo-upload-placeholder">
              <div style="font-size: 2.5rem; margin-bottom: var(--space-xs);">📷</div>
              <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 4px;">Fota eller välj bild</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary);">Klicka eller dra in en bild här</div>
            </div>
          </div>
          <!-- Real labels open the pickers natively; iPhone does not reliably open a hidden input from script -->
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/*" id="photo-file-input" class="file-input-hidden" />
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/*" capture="environment" id="photo-camera-input" class="file-input-hidden" />
          <div class="flex gap-xs mt-xs" style="justify-content: center; flex-wrap: wrap;">
            <label for="photo-camera-input" class="btn btn-secondary btn-sm" id="photo-camera-btn" role="button" style="font-size: 0.8rem; padding: 6px 12px; cursor: pointer;">
              📷 Ta foto med mobilen
            </label>
            <label for="photo-file-input" class="btn btn-secondary btn-sm" id="photo-gallery-btn" role="button" style="font-size: 0.8rem; padding: 6px 12px; cursor: pointer;">
              🖼️ Välj från galleri
            </label>
          </div>
          <p class="text-muted" style="font-size: 0.7rem; text-align: center; margin: 6px 0 0 0; line-height: 1.35;">
            Öppnas inte kameran? Tryck "Välj från galleri" och välj "Ta bild", eller tillåt kameran under Inställningar → Safari → Kamera.
          </p>
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
    const cameraInput = document.getElementById('photo-camera-input');
    const previewContainer = document.getElementById('photo-preview-container');
    const previewImg = document.getElementById('photo-preview-img');
    const placeholder = document.getElementById('photo-upload-placeholder');
    const submitBtn = document.getElementById('photo-submit-btn');

    const handleFile = async (file) => {
      if (!file) return;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Komprimerar bild... ⏳';
      }
      try {
        selectedImageBase64 = await compressImage(file, 1000, 0.8);
        previewImg.src = selectedImageBase64;
        previewContainer.style.display = 'block';
        placeholder.style.display = 'none';
      } catch (err) {
        showToast(err.message || 'Kunde inte läsa in bilden', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Dela! 🚀';
        }
      }
    };

    // The camera and gallery buttons are <label for="…"> and open the pickers natively
    dropArea?.addEventListener('click', () => fileInput?.click());

    [fileInput, cameraInput].forEach(input => input?.addEventListener('change', (ev) => {
      const file = ev.target.files?.[0];
      ev.target.value = ''; // so the same photo can be picked again
      if (file) handleFile(file);
    }));

    ['dragenter', 'dragover'].forEach(name => {
      dropArea?.addEventListener(name, (e) => {
        e.preventDefault();
        dropArea.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropArea?.addEventListener(name, (e) => {
        e.preventDefault();
        dropArea.classList.remove('drag-over');
      });
    });

    dropArea?.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
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
        renderTournament({ code: t.shareCode }); // Reload to show new photo
      } catch (err) {
        showToast(err.message, 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Försök igen';
        }
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
        renderTournament({ code: t.shareCode }); 
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
        renderTournament({ code: t.shareCode });
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
          <div class="sponsor-upload-area" id="banner-drop-area" style="min-height: 180px; flex-direction: column; gap: var(--space-xs); text-align: center;">
            <div id="banner-preview-container" style="display:none; width: 100%;">
              <img id="banner-preview-img" class="sponsor-img" style="max-height: 200px; max-width: 100%; border-radius: var(--radius-sm); object-fit: contain; margin: 0 auto;" />
            </div>
            <div id="banner-upload-placeholder">
              <div style="font-size: 2.2rem; margin-bottom: var(--space-xs);">📸</div>
              <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 4px;">Fota eller välj bild</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary);">Klicka här för att välja bild eller ta foto</div>
            </div>
          </div>
          <!-- Real labels open the pickers natively; iPhone does not reliably open a hidden input from script -->
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/*" id="banner-file-input" class="file-input-hidden" />
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/*" capture="environment" id="banner-camera-input" class="file-input-hidden" />
          <div class="flex gap-xs mt-xs" style="justify-content: center; flex-wrap: wrap;">
            <label for="banner-camera-input" class="btn btn-secondary btn-sm" id="banner-camera-btn" role="button" style="font-size: 0.8rem; padding: 6px 12px; cursor: pointer;">
              📷 Ta foto med mobilen
            </label>
            <label for="banner-file-input" class="btn btn-secondary btn-sm" id="banner-gallery-btn" role="button" style="font-size: 0.8rem; padding: 6px 12px; cursor: pointer;">
              🖼️ Välj från galleri
            </label>
          </div>
          <p class="text-muted" style="font-size: 0.7rem; text-align: center; margin: 6px 0 0 0; line-height: 1.35;">
            Öppnas inte kameran? Tryck "Välj från galleri" och välj "Ta bild", eller tillåt kameran under Inställningar → Safari → Kamera.
          </p>
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
    const cameraInput = document.getElementById('banner-camera-input');
    const previewContainer = document.getElementById('banner-preview-container');
    const previewImg = document.getElementById('banner-preview-img');
    const placeholder = document.getElementById('banner-upload-placeholder');
    const submitBtn = document.getElementById('banner-submit-btn');

    const handleFile = async (file) => {
      if (!file) return;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Komprimerar bild... ⏳';
      }
      try {
        selectedImageData = await compressImage(file, 1000, 0.8);
        previewImg.src = selectedImageData;
        previewContainer.style.display = 'block';
        placeholder.style.display = 'none';
      } catch (err) {
        showToast(err.message || 'Kunde inte läsa in bilden', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Ladda upp 📸';
        }
      }
    };

    // The camera and gallery buttons are <label for="…"> and open the pickers natively
    dropArea?.addEventListener('click', () => fileInput?.click());

    [fileInput, cameraInput].forEach(input => input?.addEventListener('change', (ev) => {
      const file = ev.target.files?.[0];
      ev.target.value = ''; // so the same photo can be picked again
      if (file) handleFile(file);
    }));

    ['dragenter', 'dragover'].forEach(name => {
      dropArea?.addEventListener(name, (e) => {
        e.preventDefault();
        dropArea.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(name => {
      dropArea?.addEventListener(name, (e) => {
        e.preventDefault();
        dropArea.classList.remove('drag-over');
      });
    });
    dropArea?.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });

    document.getElementById('banner-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!selectedImageData) { showToast('Välj en bild först', 'error'); return; }

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
        renderTournamentContent(content, updated, photos, tournamentFlashBets);
      } catch (err) {
        showToast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Ladda upp 📸';
      }
    });
  });

  // Initialize sponsor carousel auto-roll
  if (t.banners && t.banners.length > 0) {
    if (sponsorCarouselCleanup) {
      sponsorCarouselCleanup();
      sponsorCarouselCleanup = null;
    }
    requestAnimationFrame(() => {
      const carouselEl = document.getElementById('tournament-sponsor-carousel');
      if (carouselEl) {
        sponsorCarouselCleanup = initSponsorCarousel(carouselEl, t.banners);
      }
    });
  }

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
        renderTournamentContent(content, updated, photos, tournamentFlashBets);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Add game
  const handleOpenAddGame = () => showAddGameModal(t, content, photos, tournamentFlashBets);
  document.getElementById('add-game-btn')?.addEventListener('click', handleOpenAddGame);
  document.getElementById('empty-add-game-btn')?.addEventListener('click', handleOpenAddGame);

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
        renderTournamentContent(content, updated, photos, tournamentFlashBets);
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
      showToast(`Alla spel måste vara avgjorda eller avbrutna (${unfinished.length} kvar).`, 'warning');
      return;
    }
    if (!confirm(`Vill du avsluta eventet "${t.name}" och fastställa slutresultatet?`)) return;
    try {
      const pin = sessionStorage.getItem('betpals_pin') || '';
      await settleTournament(t.id, { pin });
      launchConfetti();
      showToast('Eventet är avslutat! 🏆', 'success');
      const updated = await getTournament(t.shareCode);
      renderTournamentContent(content, updated, photos, tournamentFlashBets);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Reopen tournament
  document.getElementById('reopen-tournament-btn')?.addEventListener('click', async () => {
    if (!confirm(`Vill du återöppna eventet "${t.name}"? Resultat och spel blir då redigerbara igen.`)) return;
    try {
      const pin = sessionStorage.getItem('betpals_pin') || '';
      await reopenTournament(t.id, { pin });
      showToast('Eventet har återöppnats! 🔓', 'success');
      const updated = await getTournament(t.shareCode);
      renderTournamentContent(content, updated, photos, tournamentFlashBets);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Delete entire tournament
  document.getElementById('delete-tournament-btn')?.addEventListener('click', async () => {
    if (!confirm(`Är du säker på att du vill radera hela eventet "${t.name}" och alla dess spel? Detta kan INTE ångras!`)) return;
    try {
      const pin = sessionStorage.getItem('betpals_pin') || '';
      await deleteTournament(t.id, { pin });
      showToast('Eventet har raderats', 'success');
      navigate('home');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Organiser actions for a game, reached through the "⋯" on its card
  const refreshAfterGameAction = async () => {
    const updated = await getTournament(t.shareCode);
    renderTournamentContent(content, updated, photos, tournamentFlashBets);
  };
  const gameActions = {
    boost: async (id, name) => {
      if (!confirm(`🚀 Boosta "${name}"?\n\nDetta skickar en pushnotis till alla deltagare i eventet för att påminna dem om att lägga sina bets!`)) return;
      await boostEvent(id);
      launchConfetti();
      showToast('Spelet boostat med pushnotis! 🚀', 'success');
    },
    lock: async (id, name) => {
      if (!confirm(`Vill du stänga bettningen för "${name}" nu? Inga fler bets kommer tas emot.`)) return;
      await lockEvent(id, sessionStorage.getItem('betpals_pin') || '');
      showToast('Bettning stängd! 🔒', 'info');
      await refreshAfterGameAction();
    },
    reopen: async (id, name) => {
      if (!confirm(`Vill du öppna bettningen för "${name}" igen?`)) return;
      const reopenRes = await reopenEvent(id, sessionStorage.getItem('betpals_pin') || '');
      showToast(reopenRes?.status === 'locked' ? reopenRes.message : 'Bettningen är öppen igen! 🔓', reopenRes?.status === 'locked' ? 'info' : 'success');
      await refreshAfterGameAction();
    },
    remove: async (id, name) => {
      if (!confirm(`Vill du ta bort "${name}"?`)) return;
      await deleteEvent(id, sessionStorage.getItem('betpals_pin') || '');
      showToast('Spelet togs bort', 'success');
      await refreshAfterGameAction();
    }
  };

  content.querySelectorAll('.game-card-menu').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const { id, name } = btn.dataset;
      const items = [
        btn.dataset.open ? ['boost', '🚀 Boosta med pushnotis'] : null,
        btn.dataset.open ? ['lock', '🔒 Stäng bettning nu'] : null,
        btn.dataset.reopenable ? ['reopen', '🔓 Öppna bettning igen'] : null,
        ['remove', '🗑️ Ta bort spelet']
      ].filter(Boolean);
      showModal(`👑 ${escapeHtml(name)}`, `
        <div class="game-action-sheet">
          ${items.map(([key, label]) => `
            <button type="button" class="btn btn-block ${key === 'remove' ? 'game-action-danger' : 'btn-secondary'}" data-action="${key}">${label}</button>
          `).join('')}
        </div>
      `);
      document.querySelectorAll('.game-action-sheet [data-action]').forEach(actionBtn => {
        actionBtn.addEventListener('click', async () => {
          closeModal();
          try {
            await gameActions[actionBtn.dataset.action](id, name);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
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
  const handleOpenShareModal = async () => {
    try {
      const baseUrl = getAppBaseUrl();
      const { qr, url } = await getTournamentQR(t.shareCode, baseUrl);
      const shareMsg = `🏆 Häng med på eventet ${t.name} i BetPals! Se ställningen och betta här: ${url}`;
      showModal('📱 Dela event', `
        <div class="text-center">
          <img src="${qr}" alt="QR-kod" style="width: 200px; height: 200px; border-radius: var(--radius-md); margin-bottom: var(--space-md);" />
          <p class="text-muted" style="font-size: 0.8rem; margin-bottom: var(--space-md);">Skanna QR-koden eller dela direkt via länkarna nedan · Kod: <strong>${escapeHtml(t.shareCode)}</strong></p>
          <div class="flex gap-sm mb-md">
            <input type="text" class="form-input" value="${url}" readonly id="share-url" style="flex: 1; font-size: 0.75rem;" />
            <button class="btn btn-sm btn-primary" id="copy-url-btn">📋</button>
          </div>
          <div class="flex gap-xs mb-md" style="justify-content: center; flex-wrap: wrap;">
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

          ${isCreator ? `
            <div class="mt-md pt-sm text-left" style="border-top: 1px solid var(--border-glass);">
              <div class="flex-between align-center mb-xs">
                <span style="font-weight: 700; font-size: 0.85rem;">🔔 Skicka VIP-inbjudan (Push)</span>
                <button type="button" class="btn btn-xs btn-accent" id="share-friends-toggle-btn" style="font-size: 0.72rem; padding: 2px 8px;">
                  👥 Välj vänner
                </button>
              </div>
              <p class="text-muted" style="font-size: 0.72rem; margin-bottom: 6px;">
                Bjud in vänner direkt med pushnotis. De får direkt tillträde och slipper scanna QR-koden!
              </p>
              <div id="share-friends-drawer" style="display: none; padding: var(--space-xs); background: rgba(0,0,0,0.25); border-radius: var(--radius-sm); margin-top: 4px;">
                <div id="share-friends-list" style="max-height: 130px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
                  <div class="text-muted text-center" style="font-size: 0.75rem; padding: 6px;">Laddar vänner... 👥</div>
                </div>
                <button type="button" class="btn btn-primary btn-sm btn-block mt-xs" id="share-send-push-btn" style="font-size: 0.78rem;">
                  🚀 Skicka VIP-push till valda
                </button>
              </div>
            </div>
          ` : ''}
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

      if (isCreator) {
        let friendsLoaded = false;
        const drawer = document.getElementById('share-friends-drawer');
        const list = document.getElementById('share-friends-list');
        const toggleBtn = document.getElementById('share-friends-toggle-btn');
        const sendPushBtn = document.getElementById('share-send-push-btn');

        toggleBtn?.addEventListener('click', async () => {
          if (drawer.style.display === 'block') {
            drawer.style.display = 'none';
            return;
          }
          drawer.style.display = 'block';
          if (friendsLoaded) return;

          try {
            const friends = await getFriends();
            friendsLoaded = true;
            if (!friends || friends.length === 0) {
              list.innerHTML = `<div class="text-muted text-center" style="font-size: 0.75rem; padding: 6px;">Du har inga vänner tillagda än.</div>`;
              return;
            }
            list.innerHTML = friends.map(f => `
              <label class="flex-between" style="padding: 5px 8px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); align-items: center; cursor: pointer;">
                <div class="flex gap-xs" style="align-items: center; min-width: 0;">
                  ${f.avatarUrl ? `<img src="${f.avatarUrl}" alt="${escapeHtml(f.nickname)}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;" />` : `<span>${escapeHtml(f.avatar || '👤')}</span>`}
                  <span style="font-size: 0.8rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${escapeHtml(f.realName || f.nickname)} <span class="text-gold">(@${escapeHtml(f.nickname)})</span>
                  </span>
                </div>
                <input type="checkbox" class="share-friend-cb" data-id="${f.id}" />
              </label>
            `).join('');
          } catch (err) {
            list.innerHTML = `<div class="text-red text-center" style="font-size: 0.75rem;">${escapeHtml(err.message)}</div>`;
          }
        });

        sendPushBtn?.addEventListener('click', async () => {
          const cbs = list?.querySelectorAll('.share-friend-cb:checked');
          const friendIds = Array.from(cbs || []).map(cb => cb.dataset.id);
          if (friendIds.length === 0) {
            return showToast('Välj minst en vän att bjuda in', 'error');
          }
          sendPushBtn.disabled = true;
          sendPushBtn.textContent = 'Skickar inbjudan...';
          try {
            await inviteFriendsToTournament(t.id, friendIds);
            closeModal();
            showToast(`VIP-inbjudan och push skickad till ${friendIds.length} vän${friendIds.length > 1 ? 'ner' : ''}! 🏆`, 'success');
          } catch (err) {
            showToast(err.message, 'error');
            sendPushBtn.disabled = false;
            sendPushBtn.textContent = '🚀 Skicka VIP-push till valda';
          }
        });
      }
    } catch (err) {
      showToast('Kunde inte generera QR-kod', 'error');
    }
  };

  document.getElementById('share-tournament-btn')?.addEventListener('click', handleOpenShareModal);
}

// ── "Nytt spel": one sheet that adapts to the game type ─────────────────────
const NEW_GAME_TYPES = [
  { id: 'winner', icon: '🏆', title: 'Vem vinner?', desc: 'Betta på en spelare – odds från potten' },
  { id: 'winner_takes_all', icon: '👥', title: 'Vinnare tar allt', desc: 'Alla lägger lika – vinnaren tar potten' },
  { id: '1x2', icon: '⚽', title: 'Match 1 X 2', desc: 'Hemma, oavgjort eller borta' },
  { id: 'yes_no', icon: '👍', title: 'Ja eller nej', desc: 'En snabb fråga' }
];
const NAME_SUGGESTIONS = {
  winner: ['Vinnare av rundan', 'Längsta drive', 'Närmast hål'],
  winner_takes_all: ['Flest birdies', 'Bästa score', 'Ölhävning']
};
const FIXED_STAKES = [20, 50, 100, 200];
const DEADLINES = [
  { key: 'none', label: 'Inget', minutes: 0 },
  { key: '30', label: '30 min', minutes: 30 },
  { key: '60', label: '1 h', minutes: 60 },
  { key: '120', label: '2 h', minutes: 120 },
  { key: 'custom', label: '📅', minutes: null }
];

function showAddGameModal(t, content, photos = [], tournamentFlashBets = []) {
  // People who can be in a game: the event's participants (picked by default), names used
  // in earlier games, and — loaded below — friends who are not in the event yet
  const people = [];
  const addPerson = (person) => {
    if (!person.name) return;
    const exists = people.find(p => (person.userId && p.userId === person.userId) || p.name.toLowerCase() === person.name.toLowerCase());
    if (!exists) people.push(person);
  };
  (t.participants || []).forEach(p => addPerson({ name: String(p.name || '').trim(), userId: p.userId || null, inEvent: true, selected: true }));
  [...(t.rounds || []), ...(t.sideBets || [])].forEach(g => (g.players || []).forEach(pl => {
    const name = String(typeof pl === 'string' ? pl : pl.name || '').trim();
    if (name && !/^[1X2] |^👍|^👎/.test(name)) addPerson({ name, userId: null, inEvent: true, selected: false });
  }));

  const state = {
    type: 'winner',
    name: '',
    home: '',
    away: '',
    question: '',
    stakeMode: 'free',
    fixedStake: 50,
    customStake: false,
    minBet: 20,
    maxBet: 200,
    deadline: 'none',
    customDeadline: '',
    imageData: null
  };

  showModal(`Nytt spel<span class="ng-title-sub">i ${escapeHtml(t.name)}</span>`, `
    <form id="add-game-form" class="ng-form" novalidate>
      <div class="ng-label" style="margin-top: 4px;">Vad ska ni betta på?</div>
      <div class="ng-types">
        ${NEW_GAME_TYPES.map(gt => `
          <button type="button" class="ng-type${gt.id === state.type ? ' on' : ''}" data-type="${gt.id}">
            <span class="ng-type-icon">${gt.icon}</span>
            <b>${gt.title}</b>
            <span>${gt.desc}</span>
          </button>
        `).join('')}
      </div>

      <div id="ng-fields"></div>

      <div class="ng-label" id="ng-stake-label">Insats</div>
      <div id="ng-stake"></div>

      <div class="ng-label">Spelstopp</div>
      <div class="ng-chips" id="ng-deadlines">
        ${DEADLINES.map(d => `<button type="button" class="ng-chip${d.key === state.deadline ? ' gold' : ''}" data-deadline="${d.key}">${d.label}</button>`).join('')}
      </div>
      <input type="datetime-local" class="form-input ng-input" id="ng-custom-deadline" style="display: none; margin-top: 8px;" />

      <label class="ng-image-row" for="ng-image-input">
        <span id="ng-image-text">📷 Lägg till bild (valfritt)</span>
        <img id="ng-image-preview" alt="" style="display: none;" />
        <span class="ng-image-arrow">›</span>
      </label>
      <input type="file" id="ng-image-input" accept="image/jpeg,image/png,image/webp,image/gif,image/*" class="file-input-hidden" />

      <div class="ng-footer">
        <div class="ng-summary" id="ng-summary"></div>
        <button type="submit" class="btn btn-primary btn-block ng-submit" id="ng-submit" disabled>Skapa spel</button>
      </div>
    </form>
  `);

  const form = document.getElementById('add-game-form');
  const fieldsEl = document.getElementById('ng-fields');
  const stakeEl = document.getElementById('ng-stake');
  const submitBtn = document.getElementById('ng-submit');
  const isPeopleGame = () => state.type === 'winner' || state.type === 'winner_takes_all';

  // ── Type specific fields ──
  function renderFields() {
    if (state.type === '1x2') {
      fieldsEl.innerHTML = `
        <div class="ng-label">Matchen</div>
        <div class="ng-row">
          <input type="text" class="form-input ng-input" id="ng-home" placeholder="Hemmalag" maxlength="40" value="${escapeHtml(state.home)}" />
          <span class="ng-vs">vs</span>
          <input type="text" class="form-input ng-input" id="ng-away" placeholder="Bortalag" maxlength="40" value="${escapeHtml(state.away)}" />
        </div>
        <div class="ng-chips ng-preview" id="ng-1x2-preview"></div>
      `;
      const update1x2 = () => {
        const home = state.home.trim() || 'Hemmalag';
        const away = state.away.trim() || 'Bortalag';
        document.getElementById('ng-1x2-preview').innerHTML = [`1 ${home}`, 'X Oavgjort', `2 ${away}`]
          .map(o => `<span class="ng-chip ng-chip-static">${escapeHtml(o)}</span>`).join('');
      };
      document.getElementById('ng-home').addEventListener('input', e => { state.home = e.target.value; update1x2(); updateSummary(); });
      document.getElementById('ng-away').addEventListener('input', e => { state.away = e.target.value; update1x2(); updateSummary(); });
      update1x2();
    } else if (state.type === 'yes_no') {
      fieldsEl.innerHTML = `
        <div class="ng-label">Frågan</div>
        <input type="text" class="form-input ng-input" id="ng-question" placeholder="Sätter Adde putten på 18?" maxlength="120" value="${escapeHtml(state.question)}" />
        <div class="ng-chips ng-preview"><span class="ng-chip ng-chip-static">👍 Ja</span><span class="ng-chip ng-chip-static">👎 Nej</span></div>
      `;
      document.getElementById('ng-question').addEventListener('input', e => { state.question = e.target.value; updateSummary(); });
    } else {
      const suggestions = NAME_SUGGESTIONS[state.type] || [];
      fieldsEl.innerHTML = `
        <div class="ng-label">Vad gäller det?</div>
        <input type="text" class="form-input ng-input" id="ng-name" placeholder="${state.type === 'winner' ? 'Vinnare av rundan' : 'Flest birdies'}" maxlength="120" value="${escapeHtml(state.name)}" />
        <div class="ng-suggest">Förslag: ${suggestions.map(sg => `<button type="button" class="ng-suggest-btn" data-suggest="${escapeHtml(sg)}">${escapeHtml(sg)}</button>`).join(' · ')}</div>
        <div class="ng-label">Vilka är med? <span class="ng-count" id="ng-people-count"></span></div>
        <div class="ng-chips" id="ng-people"></div>
        <div class="ng-row" id="ng-add-person-row" style="display: none; margin-top: 8px;">
          <input type="text" class="form-input ng-input" id="ng-add-person" placeholder="Namn (t.ex. gäst utan konto)" maxlength="40" />
          <button type="button" class="btn btn-secondary btn-sm" id="ng-add-person-btn">Lägg till</button>
        </div>
        ${state.type === 'winner_takes_all' ? '<p class="ng-hint">Välj vänner med konto – då hamnar insatser och vinst i Swishlistan.</p>' : ''}
      `;
      document.getElementById('ng-name').addEventListener('input', e => { state.name = e.target.value; updateSummary(); });
      fieldsEl.querySelectorAll('.ng-suggest-btn').forEach(btn => btn.addEventListener('click', () => {
        state.name = btn.dataset.suggest;
        document.getElementById('ng-name').value = state.name;
        updateSummary();
      }));
      document.getElementById('ng-add-person-btn').addEventListener('click', addCustomPerson);
      document.getElementById('ng-add-person').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addCustomPerson(); }
      });
      renderPeople();
    }
  }

  function renderPeople() {
    const el = document.getElementById('ng-people');
    if (!el) return;
    el.innerHTML = people.map((p, i) => `
      <button type="button" class="ng-chip${p.selected ? ' on' : ''}" data-person="${i}">${p.selected ? '✓ ' : ''}${escapeHtml(p.name)}</button>
    `).join('') + '<button type="button" class="ng-chip ng-chip-add" id="ng-show-add-person">＋ Namn</button>';
    el.querySelectorAll('[data-person]').forEach(btn => btn.addEventListener('click', () => {
      const person = people[Number(btn.dataset.person)];
      person.selected = !person.selected;
      renderPeople();
      updateSummary();
    }));
    document.getElementById('ng-show-add-person').addEventListener('click', () => {
      document.getElementById('ng-add-person-row').style.display = 'flex';
      document.getElementById('ng-add-person').focus();
    });
    const count = people.filter(p => p.selected).length;
    document.getElementById('ng-people-count').textContent = count > 0 ? `${count} valda` : '';
  }

  function addCustomPerson() {
    const input = document.getElementById('ng-add-person');
    const name = input.value.trim();
    if (!name) return;
    const existing = people.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing) existing.selected = true;
    else people.push({ name, userId: null, inEvent: false, selected: true });
    input.value = '';
    renderPeople();
    updateSummary();
  }

  // ── Stake: fixed amount, or free between min and max (not for winner-takes-all) ──
  function renderStake() {
    const fixedOnly = state.type === 'winner_takes_all';
    if (fixedOnly) state.stakeMode = 'fixed';
    document.getElementById('ng-stake-label').textContent = fixedOnly ? 'Insats per person' : 'Insats';
    stakeEl.innerHTML = `
      ${fixedOnly ? '' : `
        <div class="ng-segment">
          <button type="button" class="${state.stakeMode === 'fixed' ? 'on' : ''}" data-mode="fixed">Fast</button>
          <button type="button" class="${state.stakeMode === 'free' ? 'on' : ''}" data-mode="free">Fri</button>
        </div>
      `}
      ${state.stakeMode === 'fixed' ? `
        <div class="ng-chips">
          ${FIXED_STAKES.map(a => `<button type="button" class="ng-chip${!state.customStake && state.fixedStake === a ? ' gold' : ''}" data-stake="${a}">${a} kr</button>`).join('')}
          <button type="button" class="ng-chip ng-chip-add${state.customStake ? ' gold' : ''}" data-stake="custom">Annat</button>
        </div>
        ${state.customStake ? `<input type="number" inputmode="numeric" class="form-input ng-input" id="ng-fixed-custom" min="1" max="10000" value="${state.fixedStake}" style="margin-top: 8px;" />` : ''}
        <p class="ng-hint">${fixedOnly ? 'Alla lägger samma summa – vinnaren tar hela potten.' : 'Alla bettar med samma summa.'}</p>
      ` : `
        <div class="ng-row">
          <label class="ng-minmax">Min <input type="number" inputmode="numeric" class="form-input ng-input" id="ng-min" min="1" max="10000" value="${state.minBet}" /> kr</label>
          <label class="ng-minmax">Max <input type="number" inputmode="numeric" class="form-input ng-input" id="ng-max" min="1" max="10000" value="${state.maxBet}" /> kr</label>
        </div>
        <p class="ng-hint">Var och en väljer själv hur mycket – och får lägga flera bets.</p>
      `}
    `;
    stakeEl.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => {
      state.stakeMode = btn.dataset.mode;
      renderStake();
      updateSummary();
    }));
    stakeEl.querySelectorAll('[data-stake]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.stake === 'custom') {
        state.customStake = true;
      } else {
        state.customStake = false;
        state.fixedStake = Number(btn.dataset.stake);
      }
      renderStake();
      updateSummary();
      document.getElementById('ng-fixed-custom')?.focus();
    }));
    document.getElementById('ng-fixed-custom')?.addEventListener('input', e => { state.fixedStake = Math.round(Number(e.target.value) || 0); updateSummary(); });
    document.getElementById('ng-min')?.addEventListener('input', e => { state.minBet = Math.round(Number(e.target.value) || 0); updateSummary(); });
    document.getElementById('ng-max')?.addEventListener('input', e => { state.maxBet = Math.round(Number(e.target.value) || 0); updateSummary(); });
  }

  // ── What will be created, and whether it is complete ──
  function buildGame() {
    const type = NEW_GAME_TYPES.find(g => g.id === state.type);
    let name = '';
    let players = [];
    let problem = null;
    if (state.type === '1x2') {
      const home = state.home.trim();
      const away = state.away.trim();
      name = home && away ? `⚽ ${home} – ${away}` : '';
      players = [`1 ${home}`, 'X Oavgjort', `2 ${away}`];
      if (!home || !away) problem = 'Fyll i båda lagen';
    } else if (state.type === 'yes_no') {
      name = state.question.trim();
      players = ['👍 Ja', '👎 Nej'];
      if (name.length < 2) problem = 'Skriv frågan';
    } else {
      name = state.name.trim();
      players = people.filter(p => p.selected).map(p => p.name);
      if (name.length < 2) problem = 'Skriv vad spelet gäller';
      else if (players.length < 2) problem = 'Välj minst 2 som är med';
    }
    const fixed = state.stakeMode === 'fixed';
    const stake = fixed
      ? { betAmount: state.fixedStake, text: formatCurrency(state.fixedStake) }
      : { betAmount: state.minBet, minBet: state.minBet, maxBet: state.maxBet, text: `${state.minBet}–${state.maxBet} kr` };
    if (!problem) {
      if (fixed && !(state.fixedStake >= 1 && state.fixedStake <= 10000)) problem = 'Välj en insats';
      if (!fixed && !(state.minBet >= 1 && state.maxBet >= state.minBet && state.maxBet <= 10000)) problem = 'Max måste vara minst lika mycket som min';
    }
    let closesAt = null;
    const dl = DEADLINES.find(d => d.key === state.deadline);
    if (dl?.minutes) closesAt = new Date(Date.now() + dl.minutes * 60000).toISOString();
    if (state.deadline === 'custom') {
      const d = state.customDeadline ? new Date(state.customDeadline) : null;
      if (!d || isNaN(d.getTime()) || d.getTime() < Date.now()) { if (!problem) problem = 'Välj ett spelstopp framåt i tiden'; }
      else closesAt = d.toISOString();
    }
    return { type, name, players, stake, closesAt, problem };
  }

  function updateSummary() {
    const g = buildGame();
    const parts = [];
    if (g.name) parts.push(`<b>${escapeHtml(g.name.startsWith('⚽') ? g.name : `${g.type.icon} ${g.name}`)}</b>`);
    if (isPeopleGame() && g.players.length) parts.push(`${g.players.length} med`);
    parts.push(escapeHtml(g.stake.text));
    if (g.closesAt) parts.push(`stänger ${new Date(g.closesAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`);
    document.getElementById('ng-summary').innerHTML = g.problem
      ? `<span class="ng-summary-todo">${escapeHtml(g.problem)}</span>`
      : parts.join(' · ');
    submitBtn.disabled = Boolean(g.problem);
  }

  // ── Wire up static parts ──
  form.querySelectorAll('.ng-type').forEach(btn => btn.addEventListener('click', () => {
    state.type = btn.dataset.type;
    form.querySelectorAll('.ng-type').forEach(b => b.classList.toggle('on', b === btn));
    if (state.type === 'winner_takes_all') state.fixedStake = 100;
    renderFields();
    renderStake();
    updateSummary();
  }));

  const customDeadlineInput = document.getElementById('ng-custom-deadline');
  form.querySelectorAll('[data-deadline]').forEach(btn => btn.addEventListener('click', () => {
    state.deadline = btn.dataset.deadline;
    form.querySelectorAll('[data-deadline]').forEach(b => b.classList.toggle('gold', b === btn));
    customDeadlineInput.style.display = state.deadline === 'custom' ? 'block' : 'none';
    if (state.deadline === 'custom' && !customDeadlineInput.value) {
      const d = new Date(Date.now() + 60 * 60 * 1000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      customDeadlineInput.value = d.toISOString().slice(0, 16);
      state.customDeadline = customDeadlineInput.value;
    }
    updateSummary();
  }));
  customDeadlineInput.addEventListener('input', () => { state.customDeadline = customDeadlineInput.value; updateSummary(); });

  document.getElementById('ng-image-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      state.imageData = await compressImage(file, 600, 0.8);
      const preview = document.getElementById('ng-image-preview');
      preview.src = state.imageData;
      preview.style.display = 'block';
      document.getElementById('ng-image-text').textContent = '📷 Bild vald – tryck för att byta';
    } catch (err) {
      showToast(err.message || 'Kunde inte läsa bilden', 'error');
    }
  });

  renderFields();
  renderStake();
  updateSummary();

  // Friends who are not in the event yet can be picked too (they get invited)
  getFriends().then(friends => {
    let added = false;
    (friends || []).forEach(f => {
      if (people.some(p => p.userId === f.id)) return;
      const before = people.length;
      addPerson({ name: f.nickname, userId: f.id, inEvent: false, selected: false });
      if (people.length > before) added = true;
    });
    if (added) renderPeople();
  }).catch(() => {});

  // ── Create ──
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const g = buildGame();
    if (g.problem) {
      showToast(g.problem, 'error');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Skapar...';
    try {
      const pin = sessionStorage.getItem('betpals_pin') || '';
      let players = g.players;
      // Friends picked here join the event first, so their bets are linked to their accounts
      if (isPeopleGame()) {
        const toInvite = people.filter(p => p.selected && p.userId && !p.inEvent);
        if (toInvite.length > 0) {
          const res = await inviteFriendsToTournament(t.id, toInvite.map(p => p.userId), pin);
          const participants = res?.tournament?.participants || [];
          players = players.map(name => {
            const person = toInvite.find(p => p.name === name);
            return (person && participants.find(pt => pt.userId === person.userId)?.name) || name;
          });
        }
      }
      const updated = await createSideBet(t.id, {
        name: g.name,
        players,
        betMode: state.type === 'winner_takes_all' ? 'self' : 'open',
        betAmount: g.stake.betAmount,
        ...(g.stake.minBet !== undefined ? { minBet: g.stake.minBet, maxBet: g.stake.maxBet } : {}),
        closesAt: g.closesAt,
        imageUrl: state.imageData || undefined,
        pin
      });
      closeModal();
      launchConfetti();
      showToast('Spelet är skapat! 🎯', 'success');
      renderTournamentContent(content, updated, photos, tournamentFlashBets);
    } catch (err) {
      showToast(err.message, 'error');
      submitBtn.textContent = 'Skapa spel';
      updateSummary();
    }
  });
}
