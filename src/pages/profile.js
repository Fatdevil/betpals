// ── Page: Profile ─────────────────────────────────────
import { registerUser, loginUser, completePinReset, changePin, getMe, getMyBets, getMyStats, updateAvatar, updateProfile, getMyCredentials } from '../api.js';
import { getStoredUser, storeUser, clearUser, isLoggedIn } from '../auth.js';
import { formatCurrency, formatDate, showToast, statusLabel, statusBadgeClass, escapeHtml } from '../utils.js';
import { t, getLang, setLang, getAvailableLanguages } from '../i18n.js';
import { isWebAuthnSupported, enableBiometricAuth, loginWithBiometrics } from '../webauthn.js';

export async function renderProfile() {
  const content = document.getElementById('page-content');

  if (!isLoggedIn()) {
    renderAuthScreen(content);
    return;
  }

  const user = getStoredUser();
  content.innerHTML = `<div class="text-center text-muted mt-lg">${t('common.loading')}</div>`;

  try {
    const [bets, stats, creds] = await Promise.all([
      getMyBets(),
      getMyStats(),
      getMyCredentials().catch(() => ({ hasBiometric: false }))
    ]);
    renderProfileContent(content, user, bets, stats, creds);
  } catch (err) {
    clearUser();
    renderAuthScreen(content);
  }
}

function renderAuthScreen(content) {
  const hasBiometric = isWebAuthnSupported();

  content.innerHTML = `
    <div class="animate-in">
      <div class="page-header text-center">
        <h1 class="page-title">👤 ${t('profile.title')}</h1>
        <p class="page-subtitle">${t('profile.simpleAuthHint')}</p>
      </div>

      <div class="card" id="auth-main-card">
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="register" id="tab-register">✨ ${t('profile.register')}</button>
          <button class="auth-tab" data-tab="login" id="tab-login">🔑 ${t('profile.login')}</button>
        </div>

        <!-- Tab 1: Skapa profil -->
        <form id="register-form" class="mt-md">
          <div class="form-group text-center mb-md">
            <div class="profile-avatar mb-xs" style="margin: 0 auto; width: 64px; height: 64px; font-size: 2rem;">👤</div>
            <div class="text-muted" style="font-size: 0.8rem;">${t('profile.registerLink')}</div>
          </div>

          <div class="form-group">
            <label class="form-label">${t('profile.realName')} <span class="text-gold">*</span></label>
            <input type="text" class="form-input" id="reg-name" 
                   placeholder="${t('profile.realNamePlaceholder')}" required minlength="2" maxlength="40" />
            <span class="form-help" style="font-size: 0.7rem; color: var(--text-muted);">Ditt för- och efternamn så polarna vet vem du är</span>
          </div>

          <div class="form-group">
            <label class="form-label">${t('profile.nickname')} <span class="text-gold">*</span></label>
            <input type="text" class="form-input" id="reg-nickname" 
                   placeholder="${t('profile.nicknamePlaceholder')}" required minlength="2" maxlength="20" />
            <span class="form-help" style="font-size: 0.7rem; color: var(--text-muted);">Ditt smeknamn som visas på spel & odds</span>
          </div>

          <div class="form-group">
            <label class="form-label">📱 ${t('profile.swishNumber')} <span class="text-gold">*</span></label>
            <input type="tel" inputmode="numeric" class="form-input" id="reg-swish" 
                   placeholder="${t('profile.swishPlaceholder')}" required minlength="8" maxlength="15" />
            <span class="form-help" style="font-size: 0.7rem; color: var(--text-muted);">${t('profile.swishHint')}</span>
          </div>

          <div class="form-group">
            <label class="form-label">🔒 ${t('profile.personalPin')} <span class="text-gold">*</span></label>
            <input type="password" inputmode="numeric" pattern="[0-9]*" class="form-input text-center" id="reg-pin" 
                   placeholder="••••" required minlength="4" maxlength="4" style="font-size: 1.5rem; letter-spacing: 0.3em;" />
            <span class="form-help" style="font-size: 0.7rem; color: var(--text-muted);">${t('profile.pinHint')}</span>
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="reg-submit-btn">${t('profile.startBetting')}</button>
        </form>

        <!-- Tab 2: Logga in -->
        <form id="login-form" class="mt-md" style="display: none;">
          ${hasBiometric ? `
            <div class="mb-md">
              <button type="button" class="btn btn-accent btn-block" id="btn-biometric-login" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span>📸</span> <span>${t('profile.biometricLogin')}</span>
              </button>
            </div>
            <div class="auth-divider mb-md" style="display: flex; align-items: center; text-align: center; color: var(--text-muted); font-size: 0.75rem;">
              <span style="flex: 1; border-bottom: 1px solid var(--border-glass);"></span>
              <span style="padding: 0 10px;">eller med mobil & PIN</span>
              <span style="flex: 1; border-bottom: 1px solid var(--border-glass);"></span>
            </div>
          ` : ''}

          <div class="form-group">
            <label class="form-label">📱 ${t('profile.loginIdentifier')} <span class="text-gold">*</span></label>
            <input type="text" class="form-input" id="login-identifier"
                   placeholder="${t('profile.loginIdentifierPlaceholder')}" required minlength="2" />
            <span class="form-help" style="font-size: 0.7rem; color: var(--text-muted);">Skriv ditt mobilnummer (t.ex. 0701234567) eller smeknamn</span>
          </div>

          <div class="form-group">
            <label class="form-label">🔒 ${t('profile.loginPin')} <span class="text-gold">*</span></label>
            <input type="password" inputmode="numeric" pattern="[0-9]*" class="form-input text-center" id="login-pin"
                   placeholder="••••" required minlength="4" maxlength="4" style="font-size: 1.5rem; letter-spacing: 0.3em;" />
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="login-submit-btn">${t('profile.loginBtn')}</button>

          <div class="text-center mt-md">
            <p class="text-muted" style="font-size: 0.75rem; line-height: 1.4;">
              💡 ${t('profile.forgotPinPrompt')}
            </p>
          </div>
        </form>
      </div>

      <!-- Reset PIN container (hidden by default) -->
      <div id="pin-reset-card" class="card mt-md" style="display: none;"></div>
    </div>
  `;

  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('register-form').style.display = tab.dataset.tab === 'register' ? '' : 'none';
      document.getElementById('login-form').style.display = tab.dataset.tab === 'login' ? '' : 'none';
    });
  });

  // Biometric login button
  if (hasBiometric) {
    document.getElementById('btn-biometric-login')?.addEventListener('click', async () => {
      try {
        showToast('Verifierar FaceID / TouchID... 📸', 'info');
        const user = await loginWithBiometrics();
        storeUser(user);
        showToast(`Välkommen tillbaka, ${user.nickname}! 👋`, 'success');
        renderProfile();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Register form submit
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const nickname = document.getElementById('reg-nickname').value.trim();
    const swishNumber = document.getElementById('reg-swish').value.trim();
    const pin = document.getElementById('reg-pin').value.trim();

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      showToast('PIN-koden måste bestå av exakt 4 siffror', 'error');
      return;
    }

    const btn = document.getElementById('reg-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Skapar profil... ⏳';

    try {
      const user = await registerUser({ name, nickname, swishNumber, pin, avatarEmoji: '👤' });
      storeUser(user);
      showToast(`Välkommen, ${user.nickname || user.realName}! 🎉`, 'success');
      renderProfile();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = t('profile.startBetting');
    }
  });

  // Login form submit
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim();
    const pin = document.getElementById('login-pin').value.trim();

    const btn = document.getElementById('login-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Loggar in... ⏳';

    try {
      const res = await loginUser({ identifier, pin });

      if (res.needsPinReset) {
        showPinResetUI(identifier, res.nickname);
        return;
      }

      storeUser(res);
      showToast(`Välkommen tillbaka, ${res.nickname}! 👋`, 'success');
      renderProfile();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = t('profile.loginBtn');
    }
  });
}

function showPinResetUI(identifier, nickname) {
  const mainCard = document.getElementById('auth-main-card');
  const resetCard = document.getElementById('pin-reset-card');
  if (mainCard) mainCard.style.display = 'none';

  resetCard.style.display = 'block';
  resetCard.innerHTML = `
    <div class="text-center mb-md">
      <div style="font-size: 2.5rem; margin-bottom: var(--space-xs);">🔑</div>
      <h2 style="font-size: 1.2rem; font-weight: 700;">${t('profile.pinResetRequiredTitle')}</h2>
      <p class="text-muted" style="font-size: 0.85rem; line-height: 1.4;">
        Hej <strong>${escapeHtml(nickname)}</strong>! Ange din 6-siffriga engångskod från admin och välj en ny PIN-kod.
      </p>
    </div>

    <form id="pin-reset-form">
      <div class="form-group">
        <label class="form-label">6-siffrig engångskod från admin</label>
        <input type="text" inputmode="numeric" pattern="[0-9]*" class="form-input text-center" id="reset-code-input"
               placeholder="123456" required minlength="6" maxlength="6" style="font-size: 1.4rem; letter-spacing: 0.25em;" />
      </div>

      <div class="form-group">
        <label class="form-label">${t('profile.newPin')}</label>
        <input type="password" inputmode="numeric" pattern="[0-9]*" class="form-input text-center" id="new-reset-pin"
               placeholder="••••" required minlength="4" maxlength="4" style="font-size: 1.5rem; letter-spacing: 0.3em;" />
      </div>

      <button type="submit" class="btn btn-primary btn-block" id="btn-submit-reset-pin">
        Spara ny PIN & Logga in 🚀
      </button>
    </form>
  `;

  document.getElementById('pin-reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const resetCode = document.getElementById('reset-code-input').value.trim();
    const newPin = document.getElementById('new-reset-pin').value.trim();

    if (resetCode.length !== 6 || !/^\d{6}$/.test(resetCode)) {
      showToast('Engångskoden måste bestå av 6 siffror', 'error');
      return;
    }
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      showToast('PIN-koden måste bestå av exakt 4 siffror', 'error');
      return;
    }

    const btn = document.getElementById('btn-submit-reset-pin');
    btn.disabled = true;
    btn.textContent = 'Sparar...';

    try {
      const user = await completePinReset({ identifier, resetCode, newPin });
      storeUser(user);
      showToast('PIN-koden har uppdaterats! 🎉', 'success');
      renderProfile();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Spara ny PIN & Logga in 🚀';
    }
  });
}

function renderProfileContent(content, user, bets, stats, creds) {
  const totalBet = bets.reduce((s, b) => s + b.amount, 0);
  const wonBets = bets.filter(b => b.won);
  const lostBets = bets.filter(b => b.eventStatus === 'finished' && !b.won);
  const pendingBets = bets.filter(b => b.eventStatus !== 'finished');

  const streakText = stats.streak > 0
    ? stats.streakType === 'win'
      ? `🔥 ${stats.streak} ${t('profile.winsInRow')}`
      : `❄️ ${stats.streak} ${t('profile.lossesInRow')}`
    : '—';

  const plColor = stats.netProfit >= 0 ? 'text-green' : 'text-red';
  const plSign = stats.netProfit >= 0 ? '+' : '';

  // Language options
  const langs = getAvailableLanguages();
  const currentLang = getLang();

  const hasBiometric = isWebAuthnSupported();
  const isBiometricActive = creds?.hasBiometric || false;

  content.innerHTML = `
    <div class="animate-in">
      <div class="page-header">
        <div class="flex-between">
          <h1 class="page-title">👤 ${t('profile.title')}</h1>
          <button class="btn btn-secondary btn-sm" id="logout-btn">${t('profile.logout')}</button>
        </div>
      </div>

      <!-- User Card -->
      <div class="card text-center" style="padding: var(--space-xl); position: relative;">
        <div class="avatar-upload-wrapper" id="profile-picture-btn" style="cursor: pointer; display: inline-block; position: relative;">
          ${user.avatarUrl 
            ? `<img src="${user.avatarUrl}" alt="${user.nickname}" class="profile-avatar-img" />`
            : `<div class="profile-avatar" id="profile-avatar" style="width: 80px; height: 80px; font-size: 2.5rem; margin: 0 auto;">${user.avatar || '👤'}</div>`}
          <div class="avatar-edit-badge" style="position: absolute; bottom: 0; right: 0; background: var(--accent); color: #fff; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">📷</div>
        </div>
        <input type="file" id="profile-picture-input" accept="image/*" style="display: none;" />
        
        <div style="font-size: 1.3rem; font-weight: 700; margin-top: var(--space-sm);">${escapeHtml(user.realName || user.nickname)}</div>
        <div style="display: flex; justify-content: center; gap: 8px; margin-top: 4px; align-items: center; flex-wrap: wrap;">
          <span class="badge" style="background: rgba(255,215,0,0.15); color: var(--gold); font-size: 0.8rem; font-weight: 600;">@${escapeHtml(user.nickname)}</span>
          ${user.swishNumber ? `<span class="badge badge-outline" style="font-size: 0.75rem;">📱 ${escapeHtml(user.swishNumber)}</span>` : ''}
        </div>
      </div>

      <!-- Biometric & Security Shortcuts -->
      <div class="card mt-md">
        <div style="font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: var(--space-md);">
          🔒 Säkerhet & Inloggning
        </div>

        ${hasBiometric ? `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-sm) 0; border-bottom: 1px solid var(--border-glass);">
            <div>
              <div style="font-weight: 600; font-size: 0.9rem;">FaceID / TouchID</div>
              <div class="text-muted" style="font-size: 0.75rem;">Logga in med ansiktet eller fingret</div>
            </div>
            <button class="btn btn-sm ${isBiometricActive ? 'btn-secondary' : 'btn-accent'}" id="btn-toggle-biometric">
              ${isBiometricActive ? t('profile.biometricActive') : t('profile.enableBiometric')}
            </button>
          </div>
        ` : ''}

        <!-- Change PIN Toggle -->
        <div class="mt-sm">
          <button class="btn btn-secondary btn-sm btn-block" id="btn-show-change-pin">
            🔑 ${t('profile.changePin')}
          </button>
        </div>

        <form id="change-pin-form" class="mt-md" style="display: none; padding-top: var(--space-sm); border-top: 1px solid var(--border-glass);">
          <div class="form-group mb-sm">
            <label class="form-label" style="font-size: 0.75rem;">${t('profile.currentPin')}</label>
            <input type="password" inputmode="numeric" pattern="[0-9]*" class="form-input text-center" id="input-current-pin"
                   placeholder="••••" maxlength="4" style="font-size: 1.2rem; letter-spacing: 0.2em;" />
          </div>
          <div class="form-group mb-md">
            <label class="form-label" style="font-size: 0.75rem;">${t('profile.newPin')}</label>
            <input type="password" inputmode="numeric" pattern="[0-9]*" class="form-input text-center" id="input-new-pin"
                   placeholder="••••" required minlength="4" maxlength="4" style="font-size: 1.2rem; letter-spacing: 0.2em;" />
          </div>
          <div class="flex gap-sm">
            <button type="submit" class="btn btn-primary btn-sm" style="flex: 1;">${t('profile.savePin')}</button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-change-pin" style="flex: 1;">Avbryt</button>
          </div>
        </form>
      </div>

      <!-- Edit profile details -->
      <div class="card mt-md">
        <div style="font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: var(--space-md);">
          ⚙️ Redigera uppgifter
        </div>
        
        <div class="form-group mb-sm">
          <label class="form-label" style="font-size: 0.75rem;">${t('profile.realName')}</label>
          <input type="text" id="edit-real-name" class="form-input" value="${user.realName || ''}" placeholder="${t('profile.realNamePlaceholder')}" />
        </div>

        <div class="form-group mb-sm">
          <label class="form-label" style="font-size: 0.75rem;">${t('profile.nickname')}</label>
          <input type="text" id="edit-nickname" class="form-input" value="${user.nickname || ''}" placeholder="${t('profile.nicknamePlaceholder')}" />
        </div>

        <div class="form-group mb-md">
          <label class="form-label" style="font-size: 0.75rem;">📱 ${t('profile.swishNumber')}</label>
          <input type="tel" id="edit-swish" class="form-input" placeholder="0701234567" value="${user.swishNumber || ''}" />
          <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">${t('profile.swishHint')}</div>
        </div>

        <button class="btn btn-primary btn-block" id="save-profile-btn">${t('profile.saveChanges')}</button>
      </div>

      <!-- Language Switcher (pill toggle) -->
      <div class="card mt-md">
        <div style="font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: var(--space-sm);">🌍 ${t('profile.language')}</div>
        <div class="lang-pills" style="display: flex; gap: var(--space-sm);">
          ${langs.map(l => `
            <button class="btn ${l.code === currentLang ? 'btn-primary' : 'btn-secondary'} lang-pill" 
                    data-lang="${l.code}" style="flex: 1; font-size: 0.8rem;">
              ${l.code === 'sv' ? '🇸🇪' : '🇬🇧'} ${l.label.toUpperCase()}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Stats -->
      <div class="stats-row mt-md">
        <div class="stat-card">
          <div class="stat-value">${bets.length}</div>
          <div class="stat-label">${t('profile.bets')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-green">${wonBets.length}</div>
          <div class="stat-label">${t('profile.wins')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-red">${lostBets.length}</div>
          <div class="stat-label">${t('profile.losses')}</div>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">${formatCurrency(totalBet)}</div>
          <div class="stat-label">${t('profile.totalStaked')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${pendingBets.length}</div>
          <div class="stat-label">${t('profile.pending')}</div>
        </div>
      </div>

      <!-- Enhanced Stats -->
      ${stats.finishedBets > 0 ? `
        <div class="card mt-md" style="text-align: center;">
          <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: var(--space-sm);">${t('profile.advancedStats')}</div>
          <div class="stats-row">
            <div class="stat-card">
              <div class="stat-value" style="color: var(--gold); font-size: 1.5rem;">${stats.winRate}%</div>
              <div class="stat-label">${t('profile.winRate')}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value ${plColor}">${plSign}${formatCurrency(stats.netProfit)}</div>
              <div class="stat-label">${t('profile.netPL')}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="font-size: 0.9rem;">${streakText}</div>
              <div class="stat-label">${t('profile.streak')}</div>
            </div>
          </div>
          <div class="stats-row" style="margin-top: var(--space-xs);">
            <div class="stat-card">
              <div class="stat-value text-green">${formatCurrency(stats.totalWon)}</div>
              <div class="stat-label">${t('profile.won')}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value text-red">${formatCurrency(stats.totalLost)}</div>
              <div class="stat-label">${t('profile.lost')}</div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Prediction History -->
      ${bets.length > 0 ? `
        <div class="section-header">
          <h2 class="section-title">📋 ${t('profile.history')}</h2>
        </div>
        <div class="bet-list">
          ${bets.map(b => `
            <div class="bet-item card-clickable" data-code="${b.eventCode}" id="bet-history-${b.id}">
              <div>
                <div class="bet-item-name">${escapeHtml(b.eventName)}</div>
                <div class="bet-item-player">→ ${escapeHtml(b.playerName)} · ${formatDate(b.timestamp)}</div>
              </div>
              <div style="text-align: right;">
                <div class="bet-item-amount">${formatCurrency(b.amount)}</div>
                ${b.eventStatus === 'finished' ? 
                  `<span class="${b.won ? 'text-green' : 'text-red'}" style="font-size: 0.75rem;">${b.won ? '✅ ' + t('profile.wins') : '❌ ' + t('profile.losses')}</span>` :
                  `<span class="badge ${statusBadgeClass(b.eventStatus)}" style="font-size: 0.6rem;">${statusLabel(b.eventStatus)}</span>`
                }
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-state-icon">🎯</div>
          <p class="empty-state-text">${t('profile.noHistory')}</p>
        </div>
      `}
    </div>
  `;

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearUser();
    renderProfile();
  });

  // Enable/Toggle Biometric
  if (hasBiometric) {
    document.getElementById('btn-toggle-biometric')?.addEventListener('click', async () => {
      try {
        showToast('Aktiverar FaceID / TouchID... 📸', 'info');
        await enableBiometricAuth();
        showToast(t('profile.biometricActive') || 'FaceID aktiverat! 📸', 'success');
        renderProfile();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Show / Hide Change PIN form
  const changePinForm = document.getElementById('change-pin-form');
  document.getElementById('btn-show-change-pin')?.addEventListener('click', () => {
    changePinForm.style.display = changePinForm.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('btn-cancel-change-pin')?.addEventListener('click', () => {
    changePinForm.style.display = 'none';
  });

  // Change PIN submit
  changePinForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPin = document.getElementById('input-current-pin').value.trim();
    const newPin = document.getElementById('input-new-pin').value.trim();

    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      showToast('Nya PIN-koden måste vara exakt 4 siffror', 'error');
      return;
    }

    try {
      await changePin(currentPin, newPin);
      showToast(t('profile.pinChanged') || 'PIN-koden har ändrats! 🔒', 'success');
      changePinForm.reset();
      changePinForm.style.display = 'none';
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Client-side image compression
  const compressImage = async (file, maxWidth = 800, quality = 0.8) => {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) return reject(new Error('Välj en giltig bildfil'));
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Kunde inte läsa in bilden'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Kunde inte läsa filen'));
      reader.readAsDataURL(file);
    });
  };

  // Avatar Upload Interaction
  const avatarBtn = document.getElementById('profile-picture-btn');
  const avatarInput = document.getElementById('profile-picture-input');

  avatarBtn?.addEventListener('click', () => {
    avatarInput.click();
  });

  avatarInput?.addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;

    showToast('Komprimerar bild... ⏳', 'info');
    try {
      const base64Image = await compressImage(file, 800, 0.8);
      showToast('Laddar upp profilbild... ☁️', 'info');
      
      const res = await updateAvatar(base64Image);
      
      const u = getStoredUser();
      u.avatarUrl = res.avatarUrl;
      storeUser(u);
      
      showToast('Profilbild uppdaterad! 📸', 'success');
      renderProfile(); 
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Save profile details (Name, Nickname, Swish)
  document.getElementById('save-profile-btn')?.addEventListener('click', async () => {
    const realName = document.getElementById('edit-real-name').value.trim();
    const nickname = document.getElementById('edit-nickname').value.trim();
    const swishNumber = document.getElementById('edit-swish').value.trim();

    const btn = document.getElementById('save-profile-btn');
    btn.disabled = true;
    btn.textContent = 'Sparar... ⏳';

    try {
      const res = await updateProfile({ realName, nickname, swishNumber });
      const u = getStoredUser();
      if (res.user) {
        storeUser({ ...u, ...res.user });
      }
      showToast(t('profile.profileSaved') || 'Profilen sparades! 🎉', 'success');
      renderProfile();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = t('profile.saveChanges');
    }
  });

  // Language switcher (pill buttons)
  document.querySelectorAll('.lang-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang);
      renderProfile();
    });
  });

  // Click bet to go to event
  document.querySelectorAll('.bet-item[data-code]').forEach(item => {
    item.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'event', code: item.dataset.code } }));
    });
  });
}
