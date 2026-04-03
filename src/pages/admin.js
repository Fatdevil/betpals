// ── Page: Admin Panel ─────────────────────────────────
import * as api from '../api.js';
import { formatCurrency, formatDate, formatTime, statusLabel, statusBadgeClass, showToast, launchConfetti } from '../utils.js';
import { showModal, closeModal } from '../components/modal.js';
import { navigate } from '../main.js';
import { isLoggedIn, getStoredUser } from '../auth.js';

let adminPin = null;

function getPin() {
  return adminPin || sessionStorage.getItem('betpals_pin');
}

function savePin(pin) {
  adminPin = pin;
  sessionStorage.setItem('betpals_pin', pin);
}

function isSuperAdmin() {
  return !!getPin();
}

export async function renderAdmin() {
  const content = document.getElementById('page-content');
  const loggedIn = isLoggedIn();
  const hasPinSession = isSuperAdmin();

  // If logged in, show admin dashboard (can manage own events)
  // If has PIN, show all events (superadmin)
  // If neither, show options
  if (loggedIn || hasPinSession) {
    renderAdminDashboard(content, loggedIn, hasPinSession);
    return;
  }

  // Show choice: login as user OR enter superadmin PIN
  renderAdminChoice(content);
}

function renderAdminChoice(content) {
  content.innerHTML = `
    <div class="animate-in">
      <div class="page-header text-center">
        <h1 class="page-title">⚙️ Admin</h1>
        <p class="page-subtitle">Hantera dina event</p>
      </div>

      <div class="card text-center" style="padding: var(--space-xl);">
        <div style="font-size: 2.5rem; margin-bottom: var(--space-md);">👤</div>
        <h3 style="margin-bottom: var(--space-sm);">Logga in för att skapa event</h3>
        <p class="text-muted mb-md" style="font-size: 0.85rem;">
          Skapa ett konto eller logga in — du blir automatiskt admin för dina event.
        </p>
        <button class="btn btn-primary btn-block" id="go-profile-btn">Gå till Konto →</button>
      </div>

      <div class="text-center mt-md text-muted" style="font-size: 0.8rem;">— eller —</div>

      <div class="card mt-md">
        <h3 class="text-center mb-md" style="font-size: 0.9rem;">🔐 Superadmin (PIN)</h3>
        <form id="enter-pin-form">
          <div class="pin-input-group">
            <input type="tel" class="pin-digit" maxlength="1" data-pin="0" inputmode="numeric" />
            <input type="tel" class="pin-digit" maxlength="1" data-pin="1" inputmode="numeric" />
            <input type="tel" class="pin-digit" maxlength="1" data-pin="2" inputmode="numeric" />
            <input type="tel" class="pin-digit" maxlength="1" data-pin="3" inputmode="numeric" />
          </div>
          <button type="submit" class="btn btn-secondary btn-block btn-sm">Logga in som superadmin</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('go-profile-btn').addEventListener('click', () => {
    navigate('profile');
  });

  setupPinInputs();
  document.getElementById('enter-pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = collectPin();
    if (pin.length !== 4) { showToast('Ange 4 siffror', 'error'); return; }
    try {
      const status = await api.adminStatus();
      if (!status.hasPin) {
        // First time — set up PIN
        await api.adminSetup(pin);
        savePin(pin);
        showToast('Superadmin-PIN skapad!', 'success');
        renderAdmin();
      } else {
        const result = await api.adminVerify(pin);
        if (result.verified) {
          savePin(pin);
          renderAdmin();
        } else {
          showToast('Fel PIN', 'error');
        }
      }
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function renderAdminDashboard(content, loggedIn, hasPinSession) {
  const user = getStoredUser();

  content.innerHTML = `
    <div class="animate-in">
      <div class="page-header">
        <div class="flex-between">
          <h1 class="page-title">⚙️ Admin</h1>
          <div class="flex gap-sm">
            ${loggedIn ? `<span class="badge badge-success" style="font-size: 0.7rem;">👤 ${user?.nickname || ''}</span>` : ''}
            ${hasPinSession ? `<span class="badge badge-info" style="font-size: 0.7rem;">🔐 Superadmin</span>` : ''}
            ${hasPinSession ? `<button class="btn btn-sm btn-secondary" id="admin-logout-btn">Logga ut PIN</button>` : ''}
          </div>
        </div>
        <p class="page-subtitle">${loggedIn ? 'Skapa och hantera dina event' : 'Hantera alla event (superadmin)'}</p>
      </div>

      <div class="flex gap-sm mb-lg">
        <button class="btn btn-primary" id="create-event-btn" style="flex: 1;">
          ➕ Nytt event
        </button>
        <button class="btn btn-accent" id="create-tournament-btn" style="flex: 1;">
          🏆 Ny turnering
        </button>
      </div>

      <div id="admin-tournaments-list"></div>

      <div id="admin-events-list">
        <div class="text-center text-muted">Laddar...</div>
      </div>
    </div>
  `;

  if (hasPinSession) {
    document.getElementById('admin-logout-btn')?.addEventListener('click', () => {
      sessionStorage.removeItem('betpals_pin');
      adminPin = null;
      showToast('Superadmin utloggad', 'info');
      renderAdmin();
    });
  }

  document.getElementById('create-event-btn').addEventListener('click', () => {
    if (!loggedIn && !hasPinSession) {
      showToast('Logga in eller ange superadmin-PIN', 'error');
      return;
    }
    showCreateEventModal();
  });

  document.getElementById('create-tournament-btn').addEventListener('click', () => {
    if (!loggedIn && !hasPinSession) {
      showToast('Logga in eller ange superadmin-PIN', 'error');
      return;
    }
    showCreateTournamentModal();
  });

  await loadAdminTournaments(loggedIn, hasPinSession, user);
  await loadAdminEvents(loggedIn, hasPinSession, user);
}

async function loadAdminEvents(loggedIn, hasPinSession, user) {
  try {
    const allEvents = await api.getAllEvents();
    const list = document.getElementById('admin-events-list');

    // Filter: show own events if logged in, all events if superadmin
    let events;
    if (hasPinSession) {
      events = allEvents; // Superadmin sees everything
    } else if (loggedIn && user) {
      events = allEvents.filter(e => e.creatorId === user.id);
    } else {
      events = [];
    }

    if (events.length === 0 && !hasPinSession) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <p class="empty-state-text">Du har inga event ännu. Skapa ditt första!</p>
        </div>`;
      return;
    } else if (events.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <p class="empty-state-text">Inga event ännu.</p>
        </div>`;
      return;
    }

    list.innerHTML = events.map((ev, i) => `
      <div class="card animate-in" style="animation-delay: ${i * 0.05}s">
        <div class="flex-between mb-md">
          <div>
            <h3 style="font-family: var(--font-heading); font-weight: 700;">${ev.name}</h3>
            <p class="text-secondary" style="font-size: 0.8rem;">
              ${formatDate(ev.date)} · Kod: <span class="text-gold">${ev.shareCode}</span>
            </p>
          </div>
          <span class="badge ${statusBadgeClass(ev.status)}">${statusLabel(ev.status)}</span>
        </div>
        <div class="flex-between" style="font-size: 0.85rem;">
          <span>${ev.playerCount} spelare · ${ev.betCount} bets · ${formatCurrency(ev.totalPool)}</span>
        </div>
        <div class="flex gap-sm mt-md" style="flex-wrap: wrap;">
          <button class="btn btn-sm btn-secondary admin-view-btn" data-code="${ev.shareCode}">👁 Visa</button>
          <button class="btn btn-sm btn-secondary admin-add-player-btn" data-id="${ev.id}" data-name="${ev.name}">👤 Spelare</button>
          ${ev.status === 'open' ? `
            <button class="btn btn-sm btn-secondary admin-lock-btn" data-id="${ev.id}">🔒 Lås</button>
          ` : ''}
          ${ev.status === 'locked' ? `
            <button class="btn btn-sm btn-secondary admin-reopen-btn" data-id="${ev.id}">🔓 Öppna</button>
            <button class="btn btn-sm btn-success admin-finish-btn" data-id="${ev.id}" data-code="${ev.shareCode}">🏆 Avsluta</button>
          ` : ''}
          ${ev.status === 'open' ? `
            <button class="btn btn-sm btn-secondary admin-bets-btn" data-id="${ev.id}" data-code="${ev.shareCode}">📋 Bets</button>
          ` : ''}
          <button class="btn btn-sm btn-danger admin-delete-btn" data-id="${ev.id}" data-name="${ev.name}">🗑</button>
        </div>
      </div>
    `).join('');

    // Event listeners
    list.querySelectorAll('.admin-view-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate('event', { code: btn.dataset.code }));
    });

    list.querySelectorAll('.admin-lock-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.lockEvent(btn.dataset.id, getPin());
          showToast('Event låst! Inga fler bets kan läggas.', 'info');
          loadAdminEvents(loggedIn, hasPinSession, user);
        } catch (err) { showToast(err.message, 'error'); }
      });
    });

    list.querySelectorAll('.admin-reopen-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.reopenEvent(btn.dataset.id, getPin());
          showToast('Event öppnat igen!', 'success');
          loadAdminEvents(loggedIn, hasPinSession, user);
        } catch (err) { showToast(err.message, 'error'); }
      });
    });

    list.querySelectorAll('.admin-finish-btn').forEach(btn => {
      btn.addEventListener('click', () => showFinishModal(btn.dataset.id, btn.dataset.code, loggedIn, hasPinSession, user));
    });

    list.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        showModal('Radera event', `
          <p class="mb-lg">Är du säker på att du vill radera <strong>${btn.dataset.name}</strong>? Alla bets försvinner.</p>
          <div class="flex gap-sm">
            <button class="btn btn-danger btn-block" id="confirm-delete-btn">Radera</button>
            <button class="btn btn-secondary btn-block" id="cancel-delete-btn">Avbryt</button>
          </div>
        `);
        document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
          try {
            await api.deleteEvent(btn.dataset.id, getPin());
            closeModal();
            showToast('Event raderat', 'info');
            loadAdminEvents(loggedIn, hasPinSession, user);
          } catch (err) { showToast(err.message, 'error'); }
        });
        document.getElementById('cancel-delete-btn').addEventListener('click', closeModal);
      });
    });

    list.querySelectorAll('.admin-add-player-btn').forEach(btn => {
      btn.addEventListener('click', () => showPlayerModal(btn.dataset.id, btn.dataset.name, loggedIn, hasPinSession, user));
    });

    list.querySelectorAll('.admin-bets-btn').forEach(btn => {
      btn.addEventListener('click', () => showBetsModal(btn.dataset.id, btn.dataset.code, loggedIn, hasPinSession, user));
    });

  } catch (err) {
    document.getElementById('admin-events-list').innerHTML = `
      <div class="text-red text-center">${err.message}</div>`;
  }
}

function showCreateEventModal() {
  showModal('➕ Skapa nytt event', `
    <form id="create-event-form">
      <div class="form-group">
        <label class="form-label">Eventnamn</label>
        <input type="text" class="form-input" id="ce-name" placeholder="T.ex. Golf Masters 2026" required />
      </div>
      <div class="form-group">
        <label class="form-label">Datum</label>
        <input type="date" class="form-input" id="ce-date" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Min insats (kr)</label>
          <input type="number" class="form-input" id="ce-min" value="10" min="1" />
        </div>
        <div class="form-group">
          <label class="form-label">Max insats (kr)</label>
          <input type="number" class="form-input" id="ce-max" value="1000" min="1" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Utbetalning (%)</label>
        <input type="range" id="ce-payout" min="10" max="100" value="100"
               style="width:100%; accent-color: var(--gold);" />
        <div class="text-center text-gold font-heading font-bold mt-sm" id="ce-payout-display">100%</div>
      </div>
      <div class="form-group">
        <label class="form-label">Spelare (tryck Enter för att lägga till)</label>
        <input type="text" class="form-input" id="ce-player-input" placeholder="Spelarnamn" />
        <div class="player-tags mt-sm" id="ce-player-tags"></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block mt-md">Skapa event 🚀</button>
    </form>
  `);

  const payoutSlider = document.getElementById('ce-payout');
  const payoutDisplay = document.getElementById('ce-payout-display');
  payoutSlider.addEventListener('input', () => {
    payoutDisplay.textContent = payoutSlider.value + '%';
  });

  const players = [];
  const playerInput = document.getElementById('ce-player-input');
  const playerTags = document.getElementById('ce-player-tags');

  playerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const name = playerInput.value.trim();
      if (name && !players.includes(name)) {
        players.push(name);
        renderPlayerTags(players, playerTags, (idx) => {
          players.splice(idx, 1);
          renderPlayerTags(players, playerTags, null);
        });
      }
      playerInput.value = '';
    }
  });

  document.getElementById('create-event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const event = await api.createEvent({
        pin: getPin(),
        name: document.getElementById('ce-name').value.trim(),
        date: document.getElementById('ce-date').value,
        minBet: Number(document.getElementById('ce-min').value),
        maxBet: Number(document.getElementById('ce-max').value),
        payoutPercent: Number(payoutSlider.value),
        players
      });
      closeModal();
      showToast(`Event "${event.name}" skapat! Kod: ${event.shareCode}`, 'success');
      renderAdmin();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

function renderPlayerTags(players, container, onRemove) {
  container.innerHTML = players.map((name, i) => `
    <span class="player-tag">
      ${name}
      <button type="button" class="player-tag-remove" data-idx="${i}">&times;</button>
    </span>
  `).join('');
  if (onRemove) {
    container.querySelectorAll('.player-tag-remove').forEach(btn => {
      btn.addEventListener('click', () => onRemove(Number(btn.dataset.idx)));
    });
  }
}

async function showPlayerModal(eventId, eventName, loggedIn, hasPinSession, user) {
  try {
    const event = await api.getEvent(eventId);

    showModal(`👤 Spelare — ${eventName}`, `
      <div class="form-group">
        <label class="form-label">Lägg till spelare</label>
        <div class="flex gap-sm">
          <input type="text" class="form-input" id="add-player-input" placeholder="Spelarnamn" style="flex:1;" />
          <button class="btn btn-primary btn-sm" id="add-player-btn">Lägg till</button>
        </div>
      </div>
      <div id="player-list-modal">
        ${event.players.map(p => `
          <div class="bet-item">
            <span class="bet-item-name">${p.name}</span>
            <button class="btn btn-sm btn-danger remove-player-modal" data-id="${p.id}">&times;</button>
          </div>
        `).join('') || '<p class="text-muted text-center">Inga spelare</p>'}
      </div>
    `);

    document.getElementById('add-player-btn').addEventListener('click', async () => {
      const name = document.getElementById('add-player-input').value.trim();
      if (!name) return;
      try {
        await api.addPlayer(eventId, name, getPin());
        showToast(`${name} tillagd!`, 'success');
        closeModal();
        showPlayerModal(eventId, eventName, loggedIn, hasPinSession, user);
        loadAdminEvents(loggedIn, hasPinSession, user);
      } catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('add-player-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('add-player-btn').click();
      }
    });

    document.querySelectorAll('.remove-player-modal').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.removePlayer(eventId, btn.dataset.id, getPin());
          showToast('Spelare borttagen', 'info');
          closeModal();
          showPlayerModal(eventId, eventName, loggedIn, hasPinSession, user);
          loadAdminEvents(loggedIn, hasPinSession, user);
        } catch (err) { showToast(err.message, 'error'); }
      });
    });

  } catch (err) { showToast(err.message, 'error'); }
}

async function showBetsModal(eventId, shareCode, loggedIn, hasPinSession, user) {
  try {
    const event = await api.getEvent(shareCode);

    showModal(`📋 Alla bets — ${event.name}`, `
      <div class="bet-list" id="bets-list-modal">
        ${event.bets.length > 0 ? event.bets.map(b => {
          const player = event.players.find(p => p.id === b.playerId);
          return `
            <div class="bet-item">
              <div>
                <div class="bet-item-name">${b.bettorName}</div>
                <div class="bet-item-player">→ ${player?.name || '?'} · ${formatTime(b.timestamp)}</div>
              </div>
              <div class="flex gap-sm" style="align-items: center;">
                <span class="bet-item-amount">${formatCurrency(b.amount)}</span>
                <button class="btn-sm bet-item-delete delete-bet-modal" data-bet-id="${b.id}" title="Radera">🗑</button>
              </div>
            </div>
          `;
        }).join('') : '<p class="text-muted text-center">Inga bets ännu</p>'}
      </div>
    `);

    document.querySelectorAll('.delete-bet-modal').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.deleteBet(eventId, btn.dataset.betId, getPin());
          showToast('Bet raderad', 'info');
          closeModal();
          showBetsModal(eventId, shareCode, loggedIn, hasPinSession, user);
          loadAdminEvents(loggedIn, hasPinSession, user);
        } catch (err) { showToast(err.message, 'error'); }
      });
    });

  } catch (err) { showToast(err.message, 'error'); }
}

async function showFinishModal(eventId, shareCode, loggedIn, hasPinSession, user) {
  try {
    const event = await api.getEvent(shareCode);

    showModal('🏆 Välj vinnare', `
      <p class="text-secondary mb-lg">Vem vann <strong>${event.name}</strong>?</p>
      <div class="bet-list" id="winner-list">
        ${event.players.map(p => `
          <button class="bet-item card-clickable winner-select-btn" data-id="${p.id}" style="width:100%; border:none; cursor:pointer;">
            <span class="bet-item-name">${p.name}</span>
            <span class="text-gold">Välj →</span>
          </button>
        `).join('')}
      </div>
    `);

    document.querySelectorAll('.winner-select-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const result = await api.finishEvent(eventId, btn.dataset.id, getPin());
          closeModal();
          launchConfetti();
          showToast(`🏆 ${result.winner} vann! Odds: ${result.odds}x`, 'success');
          loadAdminEvents(loggedIn, hasPinSession, user);
        } catch (err) { showToast(err.message, 'error'); }
      });
    });

  } catch (err) { showToast(err.message, 'error'); }
}

// ── PIN input helpers ────────────────────────────────
function setupPinInputs() {
  const digits = document.querySelectorAll('.pin-digit');
  digits.forEach((input, i) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val.slice(0, 1);
      if (val && i < digits.length - 1) {
        digits[i + 1].focus();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) {
        digits[i - 1].focus();
      }
    });
    input.addEventListener('focus', () => input.select());
  });
  digits[0]?.focus();
}

function collectPin() {
  return Array.from(document.querySelectorAll('.pin-digit'))
    .map(el => el.value)
    .join('');
}

// ── Tournament Admin ──────────────────────────────────
async function loadAdminTournaments(loggedIn, hasPinSession, user) {
  try {
    const tournaments = await api.getTournaments();
    const list = document.getElementById('admin-tournaments-list');
    if (!list) return;

    let filtered;
    if (hasPinSession) {
      filtered = tournaments;
    } else if (loggedIn && user) {
      filtered = tournaments.filter(t => t.creatorId === user.id);
    } else {
      filtered = [];
    }

    if (filtered.length === 0) { list.innerHTML = ''; return; }

    list.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">🏆 Turneringar</h2>
      </div>
      ${filtered.map(t => `
        <div class="card card-clickable tournament-link mb-sm" data-code="${t.shareCode}">
          <div class="flex-between">
            <div>
              <h3 style="font-family: var(--font-heading); font-weight: 700;">${t.name}</h3>
              <p class="text-secondary" style="font-size: 0.8rem;">
                ${t.finishedCount}/${t.roundCount} ronder klara · Kod: <span class="text-gold">${t.shareCode}</span>
              </p>
            </div>
            <span class="badge ${t.status === 'active' ? 'badge-accent' : 'badge-success'}" style="font-size: 0.7rem;">
              ${t.status === 'active' ? 'Pågår' : '✅ Avräknad'}
            </span>
          </div>
        </div>
      `).join('')}
    `;

    list.querySelectorAll('.tournament-link').forEach(el => {
      el.addEventListener('click', () => {
        navigate('tournament', { code: el.dataset.code });
      });
    });
  } catch (err) { console.error('Failed to load tournaments:', err); }
}

function showCreateTournamentModal() {
  let players = [];
  
  showModal('🏆 Ny turnering', `
    <form id="create-tournament-form">
      <div class="form-group">
        <label class="form-label">Turneringsnamn</label>
        <input type="text" class="form-input" id="tournament-name" placeholder="t.ex. Golfhelgen 2026" required />
      </div>
      <div class="form-group">
        <label class="form-label">Spelare / Lag</label>
        <div class="flex gap-sm">
          <input type="text" class="form-input" id="tournament-player-input" placeholder="Lägg till spelare" style="flex: 1;" />
          <button type="button" class="btn btn-sm btn-secondary" id="tournament-add-player-btn">+</button>
        </div>
        <div id="tournament-player-list" class="mt-sm"></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Skapa turnering 🏆</button>
    </form>
  `);

  function renderPlayers() {
    document.getElementById('tournament-player-list').innerHTML = players.map((p, i) => `
      <div class="flex-between" style="padding: var(--space-xs) 0; font-size: 0.85rem;">
        <span>${p}</span>
        <button type="button" class="btn btn-sm" style="padding: 2px 8px; font-size: 0.7rem;" data-remove="${i}">✕</button>
      </div>
    `).join('');
    document.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        players.splice(Number(btn.dataset.remove), 1);
        renderPlayers();
      });
    });
  }

  document.getElementById('tournament-add-player-btn').addEventListener('click', () => {
    const input = document.getElementById('tournament-player-input');
    const name = input.value.trim();
    if (name && !players.includes(name)) {
      players.push(name);
      input.value = '';
      renderPlayers();
    }
    input.focus();
  });

  document.getElementById('tournament-player-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('tournament-add-player-btn').click();
    }
  });

  document.getElementById('create-tournament-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('tournament-name').value.trim();
    if (players.length < 2) {
      showToast('Lägg till minst 2 spelare', 'error');
      return;
    }

    try {
      const pin = getPin();
      const result = await api.createTournament({ name, players, pin });
      closeModal();
      showToast('Turnering skapad! 🏆', 'success');
      navigate('tournament', { code: result.shareCode });
    } catch (err) { showToast(err.message, 'error'); }
  });
}
