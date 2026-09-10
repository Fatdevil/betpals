// ── Page: Admin Panel ─────────────────────────────────
import * as api from '../api.js';
import { formatCurrency, formatDate, formatTime, statusLabel, statusBadgeClass, showToast, launchConfetti } from '../utils.js';
import { showModal, closeModal } from '../components/modal.js';
import { navigate } from '../main.js';
import { isLoggedIn, getStoredUser } from '../auth.js';
import { t } from '../i18n.js';
import { compressImage } from '../imageUtils.js';

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
        <h1 class="page-title">⚙️ ${t('admin.title')}</h1>
        <p class="page-subtitle">${t('admin.subtitleUser')}</p>
      </div>

      <div class="card text-center" style="padding: var(--space-xl);">
        <div style="font-size: 2.5rem; margin-bottom: var(--space-md);">👤</div>
        <h3 style="margin-bottom: var(--space-sm);">${t('admin.loginPromptTitle')}</h3>
        <p class="text-muted mb-md" style="font-size: 0.85rem;">
          ${t('admin.loginPromptDesc')}
        </p>
        <button class="btn btn-primary btn-block" id="go-profile-btn">${t('admin.goToAccount')}</button>
      </div>

      <div class="text-center mt-md text-muted" style="font-size: 0.8rem;">${t('admin.orDivider')}</div>

      <div class="card mt-md">
        <h3 class="text-center mb-md" style="font-size: 0.9rem;">${t('admin.superadminPin')}</h3>
        <form id="enter-pin-form">
          <div class="pin-input-group">
            <input type="tel" class="pin-digit" maxlength="1" data-pin="0" inputmode="numeric" />
            <input type="tel" class="pin-digit" maxlength="1" data-pin="1" inputmode="numeric" />
            <input type="tel" class="pin-digit" maxlength="1" data-pin="2" inputmode="numeric" />
            <input type="tel" class="pin-digit" maxlength="1" data-pin="3" inputmode="numeric" />
          </div>
          <button type="submit" class="btn btn-secondary btn-block btn-sm">${t('admin.loginSuperadmin')}</button>
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
    if (pin.length !== 4) { showToast(t('admin.toastEnterDigits'), 'error'); return; }
    try {
      const status = await api.adminStatus();
      if (!status.hasPin) {
        // First time — set up PIN
        await api.adminSetup(pin);
        savePin(pin);
        showToast(t('admin.toastPinCreated'), 'success');
        renderAdmin();
      } else {
        const result = await api.adminVerify(pin);
        if (result.verified) {
          savePin(pin);
          renderAdmin();
        } else {
          showToast(t('admin.toastWrongPin'), 'error');
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
          <h1 class="page-title">⚙️ ${t('admin.title')}</h1>
          <div class="flex gap-sm">
            ${loggedIn ? `<span class="badge badge-success" style="font-size: 0.7rem;">👤 ${user?.nickname || ''}</span>` : ''}
            ${hasPinSession ? `<span class="badge badge-info" style="font-size: 0.7rem;">🔐 Superadmin</span>` : ''}
            ${hasPinSession ? `<button class="btn btn-sm btn-secondary" id="admin-logout-btn">${t('admin.logoutPin')}</button>` : ''}
          </div>
        </div>
        <p class="page-subtitle">${loggedIn ? t('admin.subtitleUser') : t('admin.subtitleSuper')}</p>
      </div>

      <div class="flex gap-sm mb-lg">
        <button class="btn btn-primary" id="create-event-btn" style="flex: 1;">
          ${t('admin.newEvent')}
        </button>
        <button class="btn btn-accent" id="create-tournament-btn" style="flex: 1;">
          ${t('admin.newTournament')}
        </button>
      </div>

      <div id="admin-tournaments-list"></div>

      <div id="admin-events-list">
        <div class="text-center text-muted">${t('common.loading')}</div>
      </div>

      ${hasPinSession ? '<div id="admin-users-list"></div>' : ''}
    </div>
  `;

  if (hasPinSession) {
    document.getElementById('admin-logout-btn')?.addEventListener('click', () => {
      sessionStorage.removeItem('betpals_pin');
      adminPin = null;
      showToast(t('admin.toastSuperLoggedOut'), 'info');
      renderAdmin();
    });
  }

  document.getElementById('create-event-btn').addEventListener('click', () => {
    if (!loggedIn && !hasPinSession) {
      showToast(t('admin.toastAuthReq'), 'error');
      return;
    }
    showCreateEventModal();
  });

  document.getElementById('create-tournament-btn').addEventListener('click', () => {
    if (!loggedIn && !hasPinSession) {
      showToast(t('admin.toastAuthReq'), 'error');
      return;
    }
    showCreateTournamentModal();
  });

  await loadAdminTournaments(loggedIn, hasPinSession, user);
  await loadAdminEvents(loggedIn, hasPinSession, user);
  if (hasPinSession) {
    await loadAdminUsers(getPin());
  }
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
          <p class="empty-state-text">${t('admin.noEvents')}</p>
        </div>`;
      return;
    } else if (events.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <p class="empty-state-text">${t('admin.noEventsSuper')}</p>
        </div>`;
      return;
    }

    list.innerHTML = events.map((ev, i) => `
      <div class="card animate-in" style="animation-delay: ${i * 0.05}s">
        ${ev.imageUrl ? `
          <div style="width: 100%; height: 90px; border-radius: var(--radius-sm); overflow: hidden; margin-bottom: var(--space-sm); border: 1px solid var(--border-light);">
            <img src="${ev.imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
          </div>
        ` : ''}
        <div class="flex-between mb-md">
          <div>
            <h3 style="font-family: var(--font-heading); font-weight: 700;">${ev.name}</h3>
            <p class="text-secondary" style="font-size: 0.8rem;">
              ${formatDate(ev.date)} · ${t('admin.code')}: <span class="text-gold">${ev.shareCode}</span>
            </p>
          </div>
          <span class="badge ${statusBadgeClass(ev.status)}">${statusLabel(ev.status)}</span>
        </div>
        <div class="flex-between" style="font-size: 0.85rem;">
          <span>${ev.playerCount} ${t('admin.participants')} · ${ev.betCount} ${t('admin.betsCount')} · ${formatCurrency(ev.totalPool)}</span>
        </div>
        <div class="flex gap-sm mt-md" style="flex-wrap: wrap;">
          <button class="btn btn-sm btn-secondary admin-view-btn" data-code="${ev.shareCode}">${t('admin.btnView')}</button>
          <button class="btn btn-sm btn-secondary admin-add-player-btn" data-id="${ev.id}" data-name="${ev.name}">${t('admin.btnPlayers')}</button>
          <button class="btn btn-sm btn-secondary admin-cover-btn" data-id="${ev.id}" title="Byt eller lägg till match-omslag">📸 Omslag</button>
          ${ev.status === 'open' ? `
            <button class="btn btn-sm btn-secondary admin-lock-btn" data-id="${ev.id}">${t('admin.btnLock')}</button>
          ` : ''}
          ${ev.status === 'locked' ? `
            <button class="btn btn-sm btn-secondary admin-reopen-btn" data-id="${ev.id}">${t('admin.btnUnlock')}</button>
            <button class="btn btn-sm btn-success admin-finish-btn" data-id="${ev.id}" data-code="${ev.shareCode}">${t('admin.btnFinish')}</button>
          ` : ''}
          ${ev.status === 'open' ? `
            <button class="btn btn-sm btn-secondary admin-bets-btn" data-id="${ev.id}" data-code="${ev.shareCode}">${t('admin.btnBets')}</button>
          ` : ''}
          <button class="btn btn-sm btn-danger admin-delete-btn" data-id="${ev.id}" data-name="${ev.name}" title="${t('admin.btnDelete')}">🗑</button>
        </div>
      </div>
    `).join('');

    // Event listeners
    list.querySelectorAll('.admin-view-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate('event', { code: btn.dataset.code }));
    });

    list.querySelectorAll('.admin-cover-btn').forEach(btn => {
      btn.addEventListener('click', () => showCoverModal(btn.dataset.id, loggedIn, hasPinSession, user));
    });

    list.querySelectorAll('.admin-lock-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.lockEvent(btn.dataset.id, getPin());
          showToast(t('admin.toastEventLocked'), 'info');
          loadAdminEvents(loggedIn, hasPinSession, user);
        } catch (err) { showToast(err.message, 'error'); }
      });
    });

    list.querySelectorAll('.admin-reopen-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.reopenEvent(btn.dataset.id, getPin());
          showToast(t('admin.toastEventOpened'), 'success');
          loadAdminEvents(loggedIn, hasPinSession, user);
        } catch (err) { showToast(err.message, 'error'); }
      });
    });

    list.querySelectorAll('.admin-finish-btn').forEach(btn => {
      btn.addEventListener('click', () => showFinishModal(btn.dataset.id, btn.dataset.code, loggedIn, hasPinSession, user));
    });

    list.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        showModal(t('admin.deleteModalTitle'), `
          <p class="mb-lg">${t('admin.deleteModalConfirm')} <strong>${btn.dataset.name}</strong>? ${t('admin.deleteModalWarning')}</p>
          <div class="flex gap-sm">
            <button class="btn btn-danger btn-block" id="confirm-delete-btn">${t('admin.confirmDelete')}</button>
            <button class="btn btn-secondary btn-block" id="cancel-delete-btn">${t('admin.cancel')}</button>
          </div>
        `);
        document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
          try {
            await api.deleteEvent(btn.dataset.id, getPin());
            closeModal();
            showToast(t('admin.toastEventDeleted'), 'info');
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
  showModal(t('admin.createEventTitle'), `
    <form id="create-event-form">
      <div class="form-group">
        <label class="form-label">📸 Match-omslag (valfritt)</label>
        <div class="image-picker-box" id="ce-cover-drop">
          <div id="ce-cover-preview-wrapper" class="image-preview-wrapper" style="display:none;">
            <img id="ce-cover-preview" alt="Förhandsvisning" />
            <button type="button" class="image-preview-remove" id="ce-cover-remove">✕</button>
          </div>
          <div id="ce-cover-placeholder">
            <div style="font-size: 1.8rem; margin-bottom: 2px;">📷</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">Klicka för att fota / välja omslagsbild</div>
          </div>
          <input type="file" accept="image/*" id="ce-cover-input" style="display:none;" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('admin.eventName')}</label>
        <input type="text" class="form-input" id="ce-name" placeholder="${t('admin.eventNamePlaceholder')}" required />
      </div>
      <div class="form-group">
        <label class="form-label">${t('admin.date')}</label>
        <input type="date" class="form-input" id="ce-date" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('admin.minStake')}</label>
          <input type="number" class="form-input" id="ce-min" value="10" min="1" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('admin.maxStake')}</label>
          <input type="number" class="form-input" id="ce-max" value="1000" min="1" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('admin.payoutPercent')}</label>
        <input type="range" id="ce-payout" min="10" max="100" value="100"
               style="width:100%; accent-color: var(--gold);" />
        <div class="text-center text-gold font-heading font-bold mt-sm" id="ce-payout-display">100%</div>
      </div>
      <div class="form-group">
        <div class="flex-between mb-xs">
          <label class="form-label" style="margin: 0;">${t('admin.playersEnterHint')}</label>
          <button type="button" class="btn btn-sm btn-secondary" id="ce-preset-yesno" style="font-size: 0.7rem; padding: 2px 8px;">
            👍 Ja / 👎 Nej
          </button>
        </div>
        <div class="flex gap-xs" style="align-items: center;">
          <input type="text" class="form-input" id="ce-player-input" placeholder="${t('admin.playerPlaceholder')}" style="flex: 1;" />
          <button type="button" class="btn btn-secondary" id="ce-player-avatar-btn" style="padding: 0 10px; font-size: 1.1rem;" title="Bifoga bild till deltagare">📷</button>
          <input type="file" accept="image/*" id="ce-player-avatar-input" style="display:none;" />
        </div>
        <div id="ce-player-avatar-indicator" style="display:none; font-size: 0.75rem; color: var(--gold); margin-top: 4px;">
          Bild vald för nästa deltagare ✅
        </div>
        <div class="player-tags mt-sm" id="ce-player-tags"></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block mt-md">${t('admin.submitCreateEvent')}</button>
    </form>
  `);

  let selectedCoverBase64 = null;
  const coverInput = document.getElementById('ce-cover-input');
  const coverDrop = document.getElementById('ce-cover-drop');
  const coverPreview = document.getElementById('ce-cover-preview');
  const coverPreviewWrapper = document.getElementById('ce-cover-preview-wrapper');
  const coverPlaceholder = document.getElementById('ce-cover-placeholder');
  const coverRemove = document.getElementById('ce-cover-remove');

  coverDrop?.addEventListener('click', (e) => {
    if (e.target === coverRemove) return;
    coverInput.click();
  });

  coverInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      selectedCoverBase64 = await compressImage(file, 1000, 0.8);
      coverPreview.src = selectedCoverBase64;
      coverPreviewWrapper.style.display = 'inline-block';
      coverPlaceholder.style.display = 'none';
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  coverRemove?.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedCoverBase64 = null;
    coverInput.value = '';
    coverPreview.src = '';
    coverPreviewWrapper.style.display = 'none';
    coverPlaceholder.style.display = 'block';
  });

  let pendingPlayerAvatar = null;
  const playerAvatarBtn = document.getElementById('ce-player-avatar-btn');
  const playerAvatarInput = document.getElementById('ce-player-avatar-input');
  const playerAvatarIndicator = document.getElementById('ce-player-avatar-indicator');

  playerAvatarBtn?.addEventListener('click', () => playerAvatarInput.click());
  playerAvatarInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      pendingPlayerAvatar = await compressImage(file, 500, 0.8);
      playerAvatarIndicator.style.display = 'block';
      playerAvatarBtn.style.borderColor = 'var(--gold)';
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  const payoutSlider = document.getElementById('ce-payout');
  const payoutDisplay = document.getElementById('ce-payout-display');
  payoutSlider.addEventListener('input', () => {
    payoutDisplay.textContent = payoutSlider.value + '%';
  });

  const players = [];
  const playerInput = document.getElementById('ce-player-input');
  const playerTags = document.getElementById('ce-player-tags');

  function updateTags() {
    renderPlayerTags(players, playerTags, (idx) => {
      players.splice(idx, 1);
      updateTags();
    });
  }

  document.getElementById('ce-preset-yesno')?.addEventListener('click', () => {
    players.length = 0;
    players.push({ name: 'Ja', imageUrl: null }, { name: 'Nej', imageUrl: null });
    updateTags();
    document.getElementById('ce-name')?.focus();
  });

  function addCurrentPlayer() {
    const name = playerInput.value.trim();
    if (name && !players.some(p => (typeof p === 'string' ? p : p.name).toLowerCase() === name.toLowerCase())) {
      players.push({ name, imageUrl: pendingPlayerAvatar });
      pendingPlayerAvatar = null;
      if (playerAvatarIndicator) playerAvatarIndicator.style.display = 'none';
      if (playerAvatarBtn) playerAvatarBtn.style.borderColor = '';
      if (playerAvatarInput) playerAvatarInput.value = '';
      updateTags();
    }
    playerInput.value = '';
  }

  playerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCurrentPlayer();
    }
  });

  document.getElementById('create-event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    addCurrentPlayer();

    const name = document.getElementById('ce-name').value.trim();
    if (!name || name.length < 2) {
      showToast('Ett giltigt matchnamn krävs (minst 2 tecken)', 'error');
      return;
    }

    if (players.length < 2) {
      showToast(t('admin.toastMinTwoPlayers') || 'Minst 2 deltagare krävs', 'error');
      return;
    }

    const minBet = Number(document.getElementById('ce-min').value) || 10;
    const maxBet = Number(document.getElementById('ce-max').value) || 1000;
    if (minBet > maxBet) {
      showToast('Lägsta insats kan inte vara högre än högsta insats', 'error');
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Skapar...';
    }

    try {
      const event = await api.createEvent({
        pin: getPin(),
        name,
        date: document.getElementById('ce-date').value,
        minBet,
        maxBet,
        payoutPercent: Number(payoutSlider.value),
        players,
        imageUrl: selectedCoverBase64
      });
      closeModal();
      showToast(`${t('admin.toastEventCreated')} ${t('admin.code')}: ${event.shareCode}`, 'success');
      renderAdmin();
    } catch (err) {
      showToast(err.message, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = t('admin.submitCreateEvent');
      }
    }
  });
}

function renderPlayerTags(players, container, onRemove) {
  container.innerHTML = players.map((p, i) => {
    const name = typeof p === 'string' ? p : p.name;
    const img = typeof p === 'object' ? p.imageUrl : null;
    return `
      <span class="player-tag" style="display: inline-flex; align-items: center; gap: 4px;">
        ${img ? `<img src="${img}" alt="${name}" class="player-avatar-mini" style="width: 18px; height: 18px;" />` : ''}
        <span>${name}</span>
        <button type="button" class="player-tag-remove" data-idx="${i}">&times;</button>
      </span>
    `;
  }).join('');
  if (onRemove) {
    container.querySelectorAll('.player-tag-remove').forEach(btn => {
      btn.addEventListener('click', () => onRemove(Number(btn.dataset.idx)));
    });
  }
}

async function showPlayerModal(eventId, eventName, loggedIn, hasPinSession, user) {
  try {
    const event = await api.getEvent(eventId);

    showModal(`${t('admin.managePlayersTitle')} — ${eventName}`, `
      <div class="form-group">
        <label class="form-label">${t('admin.addPlayerLabel')}</label>
        <div class="flex gap-sm" style="align-items: center;">
          <input type="text" class="form-input" id="add-player-input" placeholder="${t('admin.addPlayerPlaceholder')}" style="flex:1;" />
          <button type="button" class="btn btn-secondary btn-sm" id="modal-player-avatar-btn" title="Välj bild för deltagare">📷</button>
          <input type="file" accept="image/*" id="modal-player-avatar-input" style="display: none;" />
          <button class="btn btn-primary btn-sm" id="add-player-btn">${t('admin.btnAdd')}</button>
        </div>
        <div id="modal-player-avatar-indicator" style="display: none; font-size: 0.75rem; color: var(--gold); margin-top: 4px;">
          Bild vald för deltagare ✅
        </div>
      </div>
      <div id="player-list-modal">
        ${event.players.map(p => `
          <div class="bet-item" style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" class="player-avatar-mini" />` : `<span style="font-size: 1.1rem;">👤</span>`}
              <span class="bet-item-name">${p.name}</span>
            </div>
            <div class="flex gap-xs" style="align-items: center;">
              <button class="btn btn-sm btn-secondary change-player-img-btn" data-id="${p.id}" title="Byt bild">📷</button>
              <button class="btn btn-sm btn-danger remove-player-modal" data-id="${p.id}">&times;</button>
            </div>
          </div>
        `).join('') || `<p class="text-muted text-center">${t('admin.noPlayersYet')}</p>`}
      </div>
      <input type="file" accept="image/*" id="change-player-file-input" style="display: none;" />
    `);

    let pendingNewPlayerAvatar = null;
    const playerAvatarBtn = document.getElementById('modal-player-avatar-btn');
    const playerAvatarInput = document.getElementById('modal-player-avatar-input');
    const playerAvatarIndicator = document.getElementById('modal-player-avatar-indicator');

    playerAvatarBtn?.addEventListener('click', () => playerAvatarInput.click());
    playerAvatarInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        pendingNewPlayerAvatar = await compressImage(file, 500, 0.8);
        playerAvatarIndicator.style.display = 'block';
        playerAvatarBtn.style.borderColor = 'var(--gold)';
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Change existing player avatar
    let activePlayerIdToChange = null;
    const changeFileInput = document.getElementById('change-player-file-input');
    document.querySelectorAll('.change-player-img-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activePlayerIdToChange = btn.dataset.id;
        changeFileInput.click();
      });
    });

    changeFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !activePlayerIdToChange) return;
      try {
        const compressed = await compressImage(file, 500, 0.8);
        await api.updatePlayerImage(eventId, activePlayerIdToChange, { imageUrl: compressed, pin: getPin() });
        showToast('Spelarbild uppdaterad! 📸', 'success');
        closeModal();
        showPlayerModal(eventId, eventName, loggedIn, hasPinSession, user);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('add-player-btn').addEventListener('click', async () => {
      const name = document.getElementById('add-player-input').value.trim();
      if (!name) return;
      try {
        await api.addPlayer(eventId, name, getPin(), pendingNewPlayerAvatar);
        showToast(`${name} ${t('admin.toastPlayerAdded')}`, 'success');
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
          showToast(t('admin.toastPlayerRemoved'), 'info');
          closeModal();
          showPlayerModal(eventId, eventName, loggedIn, hasPinSession, user);
          loadAdminEvents(loggedIn, hasPinSession, user);
        } catch (err) { showToast(err.message, 'error'); }
      });
    });

  } catch (err) { showToast(err.message, 'error'); }
}

async function showCoverModal(eventId, loggedIn, hasPinSession, user) {
  try {
    const event = await api.getEvent(eventId);
    showModal('📸 Ändra match-omslag', `
      <div class="form-group">
        <label class="form-label">Omslagsbild</label>
        <div class="image-picker-box" id="modal-cover-drop">
          <div id="modal-cover-preview-wrapper" class="image-preview-wrapper" style="${event.imageUrl ? 'display:inline-block;' : 'display:none;'}">
            <img id="modal-cover-preview" src="${event.imageUrl || ''}" alt="Omslag" />
            <button type="button" class="image-preview-remove" id="modal-cover-remove">✕</button>
          </div>
          <div id="modal-cover-placeholder" style="${event.imageUrl ? 'display:none;' : 'display:block;'}">
            <div style="font-size: 2rem; margin-bottom: 4px;">📷</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">Klicka för att fota / välja bild</div>
          </div>
          <input type="file" accept="image/*" id="modal-cover-input" style="display:none;" />
        </div>
      </div>
      <button type="button" class="btn btn-primary btn-block mt-md" id="modal-cover-save-btn">Spara omslag ✅</button>
    `);

    let currentCover = event.imageUrl || null;
    const input = document.getElementById('modal-cover-input');
    const drop = document.getElementById('modal-cover-drop');
    const preview = document.getElementById('modal-cover-preview');
    const previewWrapper = document.getElementById('modal-cover-preview-wrapper');
    const placeholder = document.getElementById('modal-cover-placeholder');
    const removeBtn = document.getElementById('modal-cover-remove');
    const saveBtn = document.getElementById('modal-cover-save-btn');

    drop?.addEventListener('click', (e) => {
      if (e.target === removeBtn) return;
      input.click();
    });

    input?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Komprimerar...';
      try {
        currentCover = await compressImage(file, 1000, 0.8);
        preview.src = currentCover;
        previewWrapper.style.display = 'inline-block';
        placeholder.style.display = 'none';
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Spara omslag ✅';
      }
    });

    removeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      currentCover = null;
      input.value = '';
      preview.src = '';
      previewWrapper.style.display = 'none';
      placeholder.style.display = 'block';
    });

    saveBtn?.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Sparar...';
      try {
        await api.updateEventImage(eventId, { imageUrl: currentCover, pin: getPin() });
        closeModal();
        showToast('Omslagsbild sparad! 📸', 'success');
        loadAdminEvents(loggedIn, hasPinSession, user);
      } catch (err) {
        showToast(err.message, 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Spara omslag ✅';
      }
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function showBetsModal(eventId, shareCode, loggedIn, hasPinSession, user) {
  try {
    const event = await api.getEvent(shareCode);

    showModal(`${t('admin.manageBetsTitle')} — ${event.name}`, `
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
                <button class="btn-sm bet-item-delete delete-bet-modal" data-bet-id="${b.id}" title="${t('admin.btnDelete')}">🗑</button>
              </div>
            </div>
          `;
        }).join('') : `<p class="text-muted text-center">${t('admin.noBetsYet')}</p>`}
      </div>
    `);

    document.querySelectorAll('.delete-bet-modal').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.deleteBet(eventId, btn.dataset.betId, getPin());
          showToast(t('admin.toastBetDeleted'), 'info');
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

    showModal(t('admin.finishTitle'), `
      <p class="text-secondary mb-md">${t('admin.whoWonPrompt')} <strong>${event.name}</strong>?</p>

      <div class="form-group mb-md">
        <label class="form-label">📸 Vinnarbevis / resultatbild (valfritt)</label>
        <div class="image-picker-box" id="finish-proof-drop">
          <div id="finish-proof-preview-wrapper" class="image-preview-wrapper" style="display:none;">
            <img id="finish-proof-preview" alt="Vinnarbevis" />
            <button type="button" class="image-preview-remove" id="finish-proof-remove">✕</button>
          </div>
          <div id="finish-proof-placeholder">
            <div style="font-size: 1.8rem; margin-bottom: 2px;">📷</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">Fota scorekort / målgång / resultat</div>
          </div>
          <input type="file" accept="image/*" id="finish-proof-input" style="display:none;" />
        </div>
      </div>

      <div class="bet-list" id="winner-list">
        ${event.players.map(p => `
          <button class="bet-item card-clickable winner-select-btn" data-id="${p.id}" style="width:100%; border:none; cursor:pointer; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" class="player-avatar-mini" />` : ''}
              <span class="bet-item-name">${p.name}</span>
            </div>
            <span class="text-gold">${t('admin.selectWinnerBtn')}</span>
          </button>
        `).join('')}
      </div>
    `);

    let selectedWinnerProof = null;
    const proofInput = document.getElementById('finish-proof-input');
    const proofDrop = document.getElementById('finish-proof-drop');
    const proofPreview = document.getElementById('finish-proof-preview');
    const proofPreviewWrapper = document.getElementById('finish-proof-preview-wrapper');
    const proofPlaceholder = document.getElementById('finish-proof-placeholder');
    const proofRemove = document.getElementById('finish-proof-remove');

    proofDrop?.addEventListener('click', (e) => {
      if (e.target === proofRemove) return;
      proofInput.click();
    });

    proofInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        selectedWinnerProof = await compressImage(file, 1000, 0.8);
        proofPreview.src = selectedWinnerProof;
        proofPreviewWrapper.style.display = 'inline-block';
        proofPlaceholder.style.display = 'none';
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    proofRemove?.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedWinnerProof = null;
      proofInput.value = '';
      proofPreview.src = '';
      proofPreviewWrapper.style.display = 'none';
      proofPlaceholder.style.display = 'block';
    });

    document.querySelectorAll('.winner-select-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const result = await api.finishEvent(eventId, btn.dataset.id, getPin(), selectedWinnerProof);
          closeModal();
          launchConfetti();
          showToast(`🏆 ${result.winner} ${t('admin.toastWinnerDeclared')} Odds: ${result.odds}x`, 'success');
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
        <h2 class="section-title">${t('admin.tournamentsTitle')}</h2>
      </div>
      ${filtered.map(tr => `
        <div class="card card-clickable tournament-link mb-sm" data-code="${tr.shareCode}">
          <div class="flex-between">
            <div>
              <h3 style="font-family: var(--font-heading); font-weight: 700;">${tr.name}</h3>
              <p class="text-secondary" style="font-size: 0.8rem;">
                ${tr.finishedCount}/${tr.roundCount} ${t('admin.roundsFinished')} · ${t('admin.code')}: <span class="text-gold">${tr.shareCode}</span>
              </p>
            </div>
            <span class="badge ${tr.status === 'active' ? 'badge-accent' : 'badge-success'}" style="font-size: 0.7rem;">
              ${tr.status === 'active' ? t('common.active') : '✅ ' + t('common.settled')}
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
  
  showModal(t('admin.createTournamentTitle'), `
    <form id="create-tournament-form">
      <div class="form-group">
        <label class="form-label">${t('admin.tournamentName')}</label>
        <input type="text" class="form-input" id="tournament-name" placeholder="${t('admin.tournamentNamePlaceholder')}" required />
      </div>
      <div class="form-group">
        <label class="form-label">${t('admin.tournamentPlayers')}</label>
        <div class="flex gap-sm">
          <input type="text" class="form-input" id="tournament-player-input" placeholder="${t('admin.tournamentPlayerPlaceholder')}" style="flex: 1;" />
          <button type="button" class="btn btn-sm btn-secondary" id="tournament-add-player-btn">+</button>
        </div>
        <div id="tournament-player-list" class="mt-sm"></div>
      </div>
      <button type="submit" class="btn btn-primary btn-block">${t('admin.submitCreateTournament')}</button>
    </form>
  `);

  function renderPlayers() {
    const list = document.getElementById('tournament-player-list');
    if (!list) return;
    list.innerHTML = players.map((p, i) => `
      <div class="flex-between" style="padding: var(--space-xs) 0; font-size: 0.85rem;">
        <span>${p}</span>
        <button type="button" class="btn btn-sm" style="padding: 2px 8px; font-size: 0.7rem;" data-remove="${i}">✕</button>
      </div>
    `).join('');
    list.querySelectorAll('[data-remove]').forEach(btn => {
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
    const pInput = document.getElementById('tournament-player-input');
    if (pInput && pInput.value.trim()) {
      const pName = pInput.value.trim();
      if (!players.includes(pName)) {
        players.push(pName);
        renderPlayers();
      }
      pInput.value = '';
    }

    const name = document.getElementById('tournament-name').value.trim();
    if (!name || name.length < 2) {
      showToast('Ett turneringsnamn krävs (minst 2 tecken)', 'error');
      return;
    }

    if (players.length < 2) {
      showToast(t('admin.toastMinTwoPlayers'), 'error');
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Skapar...';
    }

    try {
      const pin = getPin();
      const result = await api.createTournament({ name, players, pin });
      closeModal();
      showToast(t('admin.toastTournamentCreated'), 'success');
      navigate('tournament', { code: result.shareCode });
    } catch (err) {
      showToast(err.message, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = t('admin.submitCreateTournament');
      }
    }
  });
}

async function loadAdminUsers(pin) {
  const container = document.getElementById('admin-users-list');
  if (!container) return;
  try {
    const users = await api.adminGetUsers(pin);
    if (!users || users.length === 0) {
      container.innerHTML = `
        <div class="section-header mt-lg">
          <h2 class="section-title">${t('admin.usersTitle')}</h2>
        </div>
        <div class="card text-center text-muted" style="padding: var(--space-md);">${t('admin.noUsers')}</div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="section-header mt-lg">
        <h2 class="section-title">${t('admin.usersTitle')} (${users.length})</h2>
      </div>
      <div class="card" style="padding: var(--space-sm);">
        <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
          ${users.map(u => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-sm); border-bottom: 1px solid var(--border-glass); flex-wrap: wrap; gap: 8px;">
              <div>
                <div style="font-weight: 600; font-size: 0.9rem;">
                  ${u.real_name || u.nickname} 
                  <span class="badge" style="background: rgba(255,215,0,0.15); color: var(--gold); font-size: 0.75rem;">@${u.nickname}</span>
                </div>
                <div class="text-muted" style="font-size: 0.75rem;">
                  ${u.swish_number ? `📱 Swish: ${u.swish_number}` : 'Inget Swish'} 
                  ${u.needs_pin_reset ? '· <span class="text-red font-bold">PIN Nollställd</span>' : (u.has_pin ? '· <span class="text-green">PIN Aktiv</span>' : '· Ingen PIN')}
                </div>
              </div>
              <button class="btn btn-secondary btn-sm reset-user-pin-btn" data-id="${u.id}" data-name="${u.nickname}" style="font-size: 0.75rem;">
                ${t('admin.resetPinBtn')}
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('.reset-user-pin-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.id;
        const userName = btn.dataset.name;
        if (!confirm(`${t('admin.resetPinConfirm')} ${userName}?`)) return;

        btn.disabled = true;
        btn.textContent = '...';
        try {
          await api.adminResetUserPin(userId, pin);
          showToast(t('admin.pinResetToast') || 'PIN nollställd!', 'success');
          await loadAdminUsers(pin);
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = t('admin.resetPinBtn');
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="text-red text-center">${err.message}</div>`;
  }
}
