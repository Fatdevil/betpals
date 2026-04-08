// ── Page: Profile ─────────────────────────────────────
import { registerUser, loginUser, googleLogin, getMyBets, getMyStats, updateAvatar } from '../api.js';
import { getStoredUser, storeUser, clearUser, isLoggedIn } from '../auth.js';
import { formatCurrency, formatDate, showToast, statusLabel, statusBadgeClass } from '../utils.js';
import { t, getLang, setLang, getAvailableLanguages } from '../i18n.js';

// Google callback — exposed globally
window.handleGoogleLogin = async (response) => {
  try {
    const user = await googleLogin(response.credential);
    storeUser(user);
    showToast(`Welcome, ${user.nickname}! 🎉`, 'success');
    renderProfile();
  } catch (err) {
    showToast(err.message || 'Google login failed', 'error');
  }
};

// Default avatar logic will be handled gracefully by server.

export async function renderProfile() {
  const content = document.getElementById('page-content');

  if (!isLoggedIn()) {
    renderAuthScreen(content);
    return;
  }

  const user = getStoredUser();
  content.innerHTML = `<div class="text-center text-muted mt-lg">${t('common.loading')}</div>`;

  try {
    const [bets, stats] = await Promise.all([getMyBets(), getMyStats()]);
    renderProfileContent(content, user, bets, stats);
  } catch (err) {
    clearUser();
    renderAuthScreen(content);
  }
}

function renderAuthScreen(content) {
  content.innerHTML = `
    <div class="animate-in">
      <div class="page-header text-center">
        <h1 class="page-title">👤 ${t('profile.title')}</h1>
        <p class="page-subtitle">${t('profile.loginLink')}</p>
      </div>

      <div class="card">
        <div class="text-center">
          <div id="google-signin-btn" style="display: flex; justify-content: center; margin-bottom: var(--space-md);"></div>
          <p class="text-muted" style="font-size: 0.75rem;">${t('profile.googleHint') || 'Secure login with Google'}</p>
        </div>

        <div class="auth-divider"><span>${t('profile.orDivider') || 'or'}</span></div>

        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="register" id="tab-register">${t('profile.register')}</button>
          <button class="auth-tab" data-tab="login" id="tab-login">${t('profile.loginBtn')}</button>
        </div>

        <form id="register-form" class="mt-md">
          <div class="form-group text-center mb-md">
            <div class="profile-avatar mb-xs" style="margin: 0 auto; width: 64px; height: 64px; font-size: 2rem;">👤</div>
            <div class="text-muted" style="font-size: 0.75rem;">${t('profile.nickname')}</div>
          </div>
          <div class="form-group">
            <label class="form-label">${t('profile.nickname')}</label>
            <input type="text" class="form-input" id="reg-nickname" 
                   placeholder="${t('profile.nickname')}" required minlength="2" maxlength="20" />
          </div>
          <button type="submit" class="btn btn-primary btn-block">${t('profile.createAccount')} 🎯</button>
        </form>

        <form id="login-form" class="mt-md" style="display: none;">
          <div class="form-group">
            <label class="form-label">${t('profile.nickname')}</label>
            <input type="text" class="form-input" id="login-nickname"
                   placeholder="${t('profile.nickname')}" required minlength="2" />
          </div>
          <button type="submit" class="btn btn-primary btn-block">${t('profile.loginBtn')} →</button>
        </form>
      </div>
    </div>
  `;

  // Initialize Google Sign-In button
  setTimeout(() => {
    if (typeof google !== 'undefined' && google.accounts) {
      google.accounts.id.initialize({
        client_id: window.GOOGLE_CLIENT_ID || '',
        callback: window.handleGoogleLogin
      });
      google.accounts.id.renderButton(
        document.getElementById('google-signin-btn'),
        { theme: 'filled_black', size: 'large', shape: 'pill', width: 280, text: 'signin_with' }
      );
    }
  }, 300);

  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('register-form').style.display = tab.dataset.tab === 'register' ? '' : 'none';
      document.getElementById('login-form').style.display = tab.dataset.tab === 'login' ? '' : 'none';
    });
  });

  // Register
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = document.getElementById('reg-nickname').value.trim();
    try {
      const user = await registerUser(nickname, '👤');
      storeUser(user);
      showToast(`Welcome, ${user.nickname}! 🎉`, 'success');
      renderProfile();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = document.getElementById('login-nickname').value.trim();
    try {
      const user = await loginUser(nickname);
      storeUser(user);
      showToast(`Welcome back, ${user.nickname}! 👋`, 'success');
      renderProfile();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function renderProfileContent(content, user, bets, stats) {
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
        
        <div class="profile-nickname mt-sm">${user.nickname}</div>
        ${user.email ? `<div class="text-muted" style="font-size: 0.75rem;">${user.email}</div>` : ''}
        ${user.googleLinked ? `<div style="font-size: 0.65rem; color: var(--green); margin-top: 4px;">✓ Google</div>` : ''}
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
                <div class="bet-item-name">${b.eventName}</div>
                <div class="bet-item-player">→ ${b.playerName} · ${formatDate(b.timestamp)}</div>
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
          // Crop to square if desired, or just compress. We'll let Cloudinary handle the cropping.
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
      
      // Update local storage user gracefully
      const u = getStoredUser();
      u.avatarUrl = res.avatarUrl;
      storeUser(u);
      
      showToast('Profilbild var uppdaterad! 📸', 'success');
      renderProfile(); 
    } catch (err) {
      showToast(err.message, 'error');
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
