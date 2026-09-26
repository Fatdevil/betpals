// ── Page: Profile ─────────────────────────────────────
import { registerUser, loginUser, completePinReset, changePin, getMe, getMyBets, getMyStats, getMyPhotos, updateAvatar, updateProfile, getMyCredentials, getFriends, addFriend, removeFriend, searchUsers, getFriendRequests, acceptFriendRequest, declineFriendRequest, buildFriendInviteUrl, getNotificationPrefs, updateNotificationPrefs, joinPartyRoom } from '../api.js';
import { getStoredUser, storeUser, clearUser, isLoggedIn } from '../auth.js';
import { formatCurrency, formatDate, showToast, statusLabel, statusBadgeClass, escapeHtml, safeImageSrc, getAppBaseUrl, normalizePhone, formatSwedishPhoneDisplay, consumeReturnTo, createSwishUrl } from '../utils.js';
import { showModal, closeModal } from '../components/modal.js';
import { t, getLang, setLang, getAvailableLanguages } from '../i18n.js';
import { isWebAuthnSupported, enableBiometricAuth, loginWithBiometrics } from '../webauthn.js';
import { isPushSupported, getPushPermissionState, subscribeToPush, unsubscribeFromPush, isPushActive as isPushActiveOnDevice, syncPushSubscription, detachPushFromAccount } from '../push.js';
import { navigate } from '../main.js';
import { compressImage } from '../imageUtils.js';
import { openBlind10Modal, openMafiaModal, openSpaceInvadersModal } from '../components/minigames.js';
import { openMaltaSupportModal, isMaltaFabDisabled, setMaltaFabDisabled } from '../components/maltaSupport.js';
import { isAppStandalone, isIosDevice, showPwaInstallModal } from '../components/pwaInstallModal.js';

const EMPTY_STATS = { totalBets: 0, finishedBets: 0, wins: 0, losses: 0, pending: 0, winRate: 0, totalBet: 0, totalWon: 0, totalLost: 0, netProfit: 0, streak: 0, streakType: 'none' };

export async function renderProfile() {
  const content = document.getElementById('page-content');

  if (!isLoggedIn()) {
    renderAuthScreen(content);
    return;
  }

  let user = getStoredUser();
  content.innerHTML = `<div class="text-center text-muted mt-lg">${t('common.loading')}</div>`;

  try {
    // The stored copy can be stale (changed on another phone), so show the server's version
    const me = await getMe().catch(err => {
      if (/token|inloggad/i.test(err?.message || '')) throw err;
      return null;
    });
    if (me) {
      user = { ...user, ...me };
      storeUser(user);
    }
    const [bets, stats, creds, friends, notifPrefs, photos] = await Promise.all([
      getMyBets(),
      getMyStats(),
      getMyCredentials().catch(() => ({ hasBiometric: false })),
      getFriends().catch(() => []),
      getNotificationPrefs().catch(() => ({ notifyFlashbets: true, notifyDuels: true, notifyTournaments: true, notifySupport: true })),
      getMyPhotos().catch(() => [])
    ]);
    renderProfileContent(content, user, bets, stats, creds, friends, notifPrefs, photos);
  } catch (err) {
    const isAuthError = err && err.message && (
      err.message.toLowerCase().includes('token') || 
      err.message.toLowerCase().includes('inloggad') || 
      err.message.toLowerCase().includes('unauthorized')
    );
    if (isAuthError) {
      clearUser();
      renderAuthScreen(content);
    } else {
      showToast('Kunde inte nå servern just nu. Visar sparad profil.', 'info');
      renderProfileContent(content, user, [], EMPTY_STATS, { hasBiometric: false }, [], { notifyFlashbets: true, notifyDuels: true, notifyTournaments: true, notifySupport: true }, []);
    }
  }
}

function setupPinToggles(container = document) {
  if (!container) return;
  container.querySelectorAll('.btn-toggle-pin').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
        btn.title = 'Dölj PIN';
      } else {
        input.type = 'password';
        btn.textContent = '👁️';
        btn.title = 'Visa PIN';
      }
    });
  });
}

function renderAuthScreen(content) {
  const hasBiometric = false; // Disabled until FIDO2 is fully implemented

  content.innerHTML = `
    <div class="animate-in">
      <div class="page-header text-center" style="margin-bottom: var(--space-md); padding-top: 4px;">
        <div class="profile-logo-wrap" style="max-width: 170px; margin: 0 auto 6px;">
          <img src="/profile-chip.png" alt="PROFILE" class="profile-logo-img" style="width: 100%; max-width: 150px; height: auto; object-fit: contain; filter: drop-shadow(0 8px 24px rgba(245,158,11,0.28));" />
        </div>
        <p class="page-subtitle" style="margin-top: 2px;">${t('profile.simpleAuthHint')}</p>
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
            <input type="tel" inputmode="numeric" autocomplete="tel" class="form-input" id="reg-swish" 
                   placeholder="${t('profile.swishPlaceholder')}" required minlength="8" maxlength="25" />
            <div id="reg-swish-helper" style="font-size: 0.72rem; margin-top: 4px; min-height: 16px;"></div>
            <span class="form-help" style="font-size: 0.7rem; color: var(--text-muted);">${t('profile.swishHint')}</span>
          </div>

          <div class="form-group">
            <label class="form-label">🔒 ${t('profile.personalPin')} <span class="text-gold">*</span></label>
            <div style="position: relative;">
              <input type="password" inputmode="numeric" pattern="[0-9]*" class="form-input text-center" id="reg-pin" 
                     placeholder="••••" required minlength="4" maxlength="4" style="font-size: 1.5rem; letter-spacing: 0.3em; padding-right: 44px;" />
              <button type="button" class="btn-toggle-pin" data-target="reg-pin" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 4px;" title="Visa/dölj PIN">👁️</button>
            </div>
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
            <span class="form-help" style="font-size: 0.7rem; color: var(--text-muted);">Skriv mobilnummer (t.ex. 0701234567 eller +46...), bettarnamn eller ditt namn</span>
          </div>

          <div class="form-group">
            <label class="form-label">🔒 ${t('profile.loginPin')} <span class="text-gold">*</span></label>
            <div style="position: relative;">
              <input type="password" inputmode="numeric" pattern="[0-9]*" class="form-input text-center" id="login-pin"
                     placeholder="••••" required minlength="4" maxlength="4" style="font-size: 1.5rem; letter-spacing: 0.3em; padding-right: 44px;" />
              <button type="button" class="btn-toggle-pin" data-target="login-pin" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 4px;" title="Visa/dölj PIN">👁️</button>
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="login-submit-btn">${t('profile.loginBtn')}</button>

          <div class="text-center mt-md">
            <p class="text-muted" style="font-size: 0.75rem; line-height: 1.4;">
              💡 ${t('profile.forgotPinPrompt')}
            </p>
          </div>
        </form>

        <div style="margin-top: var(--space-md); padding-top: var(--space-sm); border-top: 1px solid var(--border-glass); text-align: center;">
          <button type="button" id="auth-malta-support-btn" style="background: none; border: none; color: var(--gold); font-size: 0.76rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; text-decoration: underline;">
            <img src="/malta-chip-sm.webp" alt="Malta" style="width: 16px; height: 16px; object-fit: contain;" />
            <span>${getLang() === 'en' ? 'Need help or forgot PIN? Ask Malta AI Support' : 'Frågor om inloggning eller PIN? Fråga Malta AI Kundtjänst'}</span>
          </button>
        </div>
      </div>

      <!-- Reset PIN container (hidden by default) -->
      <div id="pin-reset-card" class="card mt-md" style="display: none;"></div>
    </div>
  `;

  // Malta AI Support from Auth Screen
  document.getElementById('auth-malta-support-btn')?.addEventListener('click', () => {
    openMaltaSupportModal();
  });

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
        await checkPendingFriendInvite();
        await checkPendingPartyJoin();
        showToast(`Välkommen tillbaka, ${user.nickname}! 👋`, 'success');
        finishLogin();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Real-time helper and auto-formatting for register swish input
  const regSwishInput = document.getElementById('reg-swish');
  const regSwishHelper = document.getElementById('reg-swish-helper');
  if (regSwishInput && regSwishHelper) {
    const updateHelper = () => {
      const val = regSwishInput.value.trim();
      if (!val) {
        regSwishHelper.innerHTML = '';
        return;
      }
      const norm = normalizePhone(val);
      if (norm.startsWith('07')) {
        if (norm.length === 10) {
          regSwishHelper.innerHTML = `<span style="color: var(--success, #22c55e);">✓ Giltigt svenskt mobilnummer: ${escapeHtml(formatSwedishPhoneDisplay(norm))}</span>`;
        } else if (norm.length < 10) {
          regSwishHelper.innerHTML = `<span style="color: var(--gold, #eab308);">${norm.length} av 10 siffror inskrivna</span>`;
        } else {
          regSwishHelper.innerHTML = `<span style="color: var(--danger, #ef4444);">För många siffror (${norm.length} av 10)</span>`;
        }
      } else if (norm.length >= 8) {
        regSwishHelper.innerHTML = `<span style="color: var(--success, #22c55e);">✓ Telefonnummer godkänt: ${escapeHtml(norm)}</span>`;
      } else {
        regSwishHelper.innerHTML = `<span style="color: var(--text-muted);">${norm.length} siffror (minst 8 krävs)</span>`;
      }
    };

    regSwishInput.addEventListener('input', updateHelper);
    regSwishInput.addEventListener('blur', () => {
      const norm = normalizePhone(regSwishInput.value.trim());
      if (norm.startsWith('07') && norm.length === 10) {
        regSwishInput.value = formatSwedishPhoneDisplay(norm);
      }
      updateHelper();
    });
  }

  // Register form submit
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const nickname = document.getElementById('reg-nickname').value.trim();
    const rawSwish = document.getElementById('reg-swish').value.trim();
    const pin = document.getElementById('reg-pin').value.trim();

    const cleanSwish = normalizePhone(rawSwish) || rawSwish.replace(/[^0-9]/g, '');

    if (!cleanSwish || cleanSwish.length < 8) {
      showToast('Ange ditt Swish-nummer (minst 8 siffror) 📱', 'error');
      return;
    }

    if (cleanSwish.startsWith('07') && cleanSwish.length !== 10) {
      showToast('Svenska mobilnummer för Swish ska ha 10 siffror (t.ex. 070-123 45 67)', 'error');
      return;
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      showToast('PIN-koden måste bestå av exakt 4 siffror', 'error');
      return;
    }

    const btn = document.getElementById('reg-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Skapar profil... ⏳';

    try {
      const user = await registerUser({ name, nickname, swishNumber: cleanSwish, pin, avatarEmoji: '👤' });
      storeUser(user);
      await checkPendingFriendInvite();
      await checkPendingPartyJoin();
      if (user.alreadyRegistered) {
        showToast(user.message || `Välkommen tillbaka, ${user.nickname || user.realName}! 👋`, 'success');
      } else {
        showToast(`Välkommen, ${user.nickname || user.realName}! 🎉`, 'success');
      }
      finishLogin();
    } catch (err) {
      if (err.data?.code === 'SWISH_ALREADY_REGISTERED') {
        showToast(err.message || 'Ditt Swish-nummer är redan registrerat. Ange din PIN för att logga in!', 'info');
        // Switch to login tab
        document.querySelectorAll('.auth-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.tab === 'login');
        });
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = '';
        const idInput = document.getElementById('login-identifier');
        if (idInput) {
          idInput.value = err.data.swishNumber || cleanSwish;
        }
        const pinInput = document.getElementById('login-pin');
        if (pinInput) {
          pinInput.focus();
        }
      } else {
        showToast(err.message, 'error');
      }
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
      await checkPendingFriendInvite();
      await checkPendingPartyJoin();
      showToast(`Välkommen tillbaka, ${res.nickname}! 👋`, 'success');
      finishLogin();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = t('profile.loginBtn');
    }
  });

  setupPinToggles(content);
}

// After logging in, go back to the page that asked for it (e.g. a shared match link)
function finishLogin() {
  // Link this device's notifications to the account that just logged in
  syncPushSubscription();
  const target = consumeReturnTo();
  if (target?.page && target.page !== 'profile') {
    navigate(target.page, target.params || {});
  } else {
    renderProfile();
  }
}

async function checkPendingFriendInvite() {
  const pending = sessionStorage.getItem('pending_friend_invite');
  if (pending) {
    sessionStorage.removeItem('pending_friend_invite');
    let invite;
    try {
      invite = JSON.parse(pending);
    } catch {
      invite = { nickname: pending };
    }
    try {
      const res = await addFriend(invite);
      showToast(res.message || `Du och @${invite.nickname} är nu vänner! 👥🎉`, res.status === 'pending' ? 'info' : 'success');
    } catch {
      // ignore
    }
  }
}

async function checkPendingPartyJoin() {
  const pendingCode = sessionStorage.getItem('pending_party_join');
  if (pendingCode) {
    sessionStorage.removeItem('pending_party_join');
    try {
      const joinRes = await joinPartyRoom({ code: pendingCode });
      if (joinRes && joinRes.room) {
        showToast(`Ansluten till rummet! 🎉`, 'success');
        navigate('home');
        if (joinRes.room.gameType === 'mafia') {
          openMafiaModal(joinRes.room);
        } else if (joinRes.room.gameType === 'space_invaders') {
          openSpaceInvadersModal({ mode: 'party', room: joinRes.room });
        } else {
          openBlind10Modal(joinRes.room);
        }
      }
    } catch (e) {
      showToast(e.message || 'Kunde inte ansluta till rummet', 'error');
    }
  }
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
        <div style="position: relative;">
          <input type="password" inputmode="numeric" pattern="[0-9]*" class="form-input text-center" id="new-reset-pin"
                 placeholder="••••" required minlength="4" maxlength="4" style="font-size: 1.5rem; letter-spacing: 0.3em; padding-right: 44px;" />
          <button type="button" class="btn-toggle-pin" data-target="new-reset-pin" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 4px;" title="Visa/dölj PIN">👁️</button>
        </div>
      </div>

      <button type="submit" class="btn btn-primary btn-block" id="btn-submit-reset-pin">
        Spara ny PIN & Logga in 🚀
      </button>
    </form>
  `;

  setupPinToggles(resetCard);

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
      finishLogin();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Spara ny PIN & Logga in 🚀';
    }
  });
}

function renderProfileContent(content, user, bets, stats = EMPTY_STATS, creds, friends = [], notifPrefs = { notifyFlashbets: true, notifyDuels: true, notifyTournaments: true, notifySupport: true }, photos = []) {
  // Group photos by tournament
  const albumsMap = new Map();
  photos.forEach(p => {
    const key = p.tournamentId;
    if (!albumsMap.has(key)) {
      albumsMap.set(key, {
        id: p.tournamentId,
        name: p.tournamentName || 'Okänt event',
        code: p.tournamentCode,
        photos: []
      });
    }
    albumsMap.get(key).photos.push(p);
  });
  const albums = Array.from(albumsMap.values());

  // Counts come from the server so they follow the same rules as The Tab
  // (shared wins, refunded games, BlixtBets and duels)
  const totalBet = stats.totalBet ?? bets.reduce((s, b) => s + b.amount, 0);
  const wonBets = { length: stats.wins ?? 0 };
  const lostBets = { length: stats.losses ?? 0 };
  const pendingBets = { length: stats.pending ?? 0 };

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

  const isStandalone = isAppStandalone();
  const isIos = isIosDevice();

  const pushSupported = isPushSupported();
  const pushPerm = pushSupported ? getPushPermissionState() : 'unsupported';
  // Permission stays "granted" after turning notifications off, so also respect that choice
  const isPushActive = isPushActiveOnDevice();
  const isFabDisabled = isMaltaFabDisabled();

  content.innerHTML = `
    <div class="animate-in">
      <div class="page-header text-center" style="margin-bottom: var(--space-md); padding-top: 4px; position: relative;">
        <div style="display: flex; justify-content: flex-end; margin-bottom: -18px;">
          <button class="btn btn-secondary btn-sm" id="logout-btn" style="font-size: 0.75rem; padding: 5px 12px; z-index: 2;">${t('profile.logout')}</button>
        </div>
        <div class="profile-logo-wrap" style="max-width: 170px; margin: 0 auto 6px;">
          <img src="/profile-chip.png" alt="PROFILE" class="profile-logo-img" style="width: 100%; max-width: 140px; height: auto; object-fit: contain; filter: drop-shadow(0 8px 24px rgba(245,158,11,0.28));" />
        </div>
      </div>

      <!-- User Card -->
      <div class="card text-center" style="padding: var(--space-xl); position: relative;">
        <div class="avatar-upload-wrapper" id="profile-picture-btn" style="cursor: pointer; display: inline-block; position: relative;">
          ${safeImageSrc(user.avatarUrl)
            ? `<img src="${escapeHtml(safeImageSrc(user.avatarUrl))}" alt="${escapeHtml(user.nickname)}" class="profile-avatar-img" />`
            : `<div class="profile-avatar" id="profile-avatar" style="width: 80px; height: 80px; font-size: 2.5rem; margin: 0 auto;">${user.avatar || '👤'}</div>`}
          <div class="avatar-edit-badge" style="position: absolute; bottom: 0; right: 0; background: var(--accent); color: #fff; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">📷</div>
        </div>
        <input type="file" id="profile-picture-input" accept="image/jpeg,image/png,image/webp,image/gif,image/*" style="display: none;" />
        
        <div style="font-size: 1.3rem; font-weight: 700; margin-top: var(--space-sm);">${escapeHtml(user.realName || user.nickname)}</div>
        <div style="display: flex; justify-content: center; gap: 8px; margin-top: 4px; align-items: center; flex-wrap: wrap;">
          <span class="badge" style="background: rgba(255,215,0,0.15); color: var(--gold); font-size: 0.8rem; font-weight: 600;">@${escapeHtml(user.nickname)}</span>
          ${user.swishNumber ? `<span class="badge badge-outline" style="font-size: 0.75rem;">📱 ${escapeHtml(formatSwedishPhoneDisplay(user.swishNumber))}</span>` : ''}
        </div>
      </div>

      <!-- Friends Card -->
      <div class="card mt-md" id="friends-card">
        <div class="flex-between mb-sm" style="align-items: center;">
          <div style="font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; display: flex; align-items: center; gap: 6px;">
            <span>👥</span> <span>Mina Vänner</span>
            <span class="badge badge-accent" style="font-size: 0.7rem; padding: 2px 6px;">${friends.length}</span>
          </div>
          <div class="flex gap-xs">
            <button class="btn btn-sm btn-primary" id="btn-add-friend" style="font-size: 0.75rem; padding: 4px 10px;">
              + Lägg till
            </button>
            <button class="btn btn-sm btn-secondary" id="btn-share-friend-link" style="font-size: 0.75rem; padding: 4px 10px;" title="Dela din personliga vänlänk">
              🔗 Bjud in
            </button>
          </div>
        </div>

        <div id="friend-requests-slot"></div>

        ${friends.length === 0 ? `
          <div class="text-center text-muted" style="padding: var(--space-md) 0; font-size: 0.85rem;">
            <div style="font-size: 2rem; margin-bottom: 6px;">🤝</div>
            <div style="font-weight: 600; margin-bottom: 4px;">Inga vänner tillagda än</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); max-width: 320px; margin: 0 auto;">
              Lägg till polarna med deras @smeknamn eller dela din inbjudningslänk för att snabbt välja dem som deltagare i spel & events!
            </div>
          </div>
        ` : `
          <div class="friends-list" style="display: flex; flex-direction: column; gap: 8px; margin-top: var(--space-xs);">
            ${friends.map(f => `
              <div class="friend-item flex-between" data-id="${f.id}" role="button" tabindex="0" style="padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); align-items: center; cursor: pointer; transition: all 0.15s ease;" title="Klicka för att hantera @${escapeHtml(f.nickname)}">
                <div class="flex gap-sm" style="align-items: center; min-width: 0;">
                  ${safeImageSrc(f.avatarUrl) ? `
                    <img src="${escapeHtml(safeImageSrc(f.avatarUrl))}" alt="${escapeHtml(f.nickname)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-glass); flex-shrink: 0;" />
                  ` : `
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 1.25rem; border: 1px solid var(--border-glass); flex-shrink: 0;">
                      ${escapeHtml(f.avatar || f.avatarEmoji || '👤')}
                    </div>
                  `}
                  <div style="min-width: 0;">
                    <div style="font-weight: 600; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      ${escapeHtml(f.realName || f.nickname)}
                    </div>
                    <div class="text-muted" style="font-size: 0.75rem; display: flex; align-items: center; gap: 6px;">
                      <span class="text-gold" style="font-weight: 500;">@${escapeHtml(f.nickname)}</span>
                      ${f.streak > 0 ? `<span style="font-size: 0.7rem;">${f.streakType === 'win' ? '🔥' : '❄️'} ${f.streak}</span>` : ''}
                      ${f.wins > 0 ? `<span style="font-size: 0.7rem;">🏆 ${f.wins} vinst${f.wins > 1 ? 'er' : ''}</span>` : ''}
                    </div>
                  </div>
                </div>
                <div style="flex-shrink: 0; margin-left: 8px;">
                  <button type="button" class="btn btn-sm btn-secondary friend-manage-btn" data-id="${f.id}" style="padding: 5px 11px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px; border-radius: var(--radius-sm);" title="Alternativ för @${escapeHtml(f.nickname)}">
                    <span>Mer</span> <span style="font-size: 0.65rem;">▾</span>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
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
              <div class="text-muted" style="font-size: 0.75rem;">Uppgraderas för utökad säkerhet (snart tillbaka)</div>
            </div>
            <span class="badge" style="background: rgba(255,255,255,0.08); color: var(--text-muted); font-size: 0.72rem; padding: 4px 8px; border-radius: 6px;">Under uppdatering</span>
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
            <div style="position: relative;">
              <input type="password" inputmode="numeric" pattern="[0-9]*" class="form-input text-center" id="input-current-pin"
                     placeholder="••••" maxlength="4" style="font-size: 1.2rem; letter-spacing: 0.2em; padding-right: 40px;" />
              <button type="button" class="btn-toggle-pin" data-target="input-current-pin" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 1.1rem; padding: 2px;" title="Visa/dölj PIN">👁️</button>
            </div>
          </div>
          <div class="form-group mb-md">
            <label class="form-label" style="font-size: 0.75rem;">${t('profile.newPin')}</label>
            <div style="position: relative;">
              <input type="password" inputmode="numeric" pattern="[0-9]*" class="form-input text-center" id="input-new-pin"
                     placeholder="••••" required minlength="4" maxlength="4" style="font-size: 1.2rem; letter-spacing: 0.2em; padding-right: 40px;" />
              <button type="button" class="btn-toggle-pin" data-target="input-new-pin" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 1.1rem; padding: 2px;" title="Visa/dölj PIN">👁️</button>
            </div>
          </div>
          <div class="flex gap-sm">
            <button type="submit" class="btn btn-primary btn-sm" style="flex: 1;">${t('profile.savePin')}</button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-change-pin" style="flex: 1;">Avbryt</button>
          </div>
        </form>
      </div>

      <!-- PWA Installation Status / Action Card -->
      <div class="card mt-md" id="pwa-profile-card" style="${isStandalone ? 'background: rgba(34, 197, 94, 0.05); border: 1px solid rgba(34, 197, 94, 0.28);' : 'background: linear-gradient(135deg, rgba(255, 215, 0, 0.08) 0%, rgba(20, 20, 30, 0.9) 100%); border: 1px solid rgba(255, 215, 0, 0.35);'}">
        <div class="flex-between" style="align-items: center; margin-bottom: 6px;">
          <div style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; color: ${isStandalone ? '#4ade80' : 'var(--gold)'}; display: flex; align-items: center; gap: 6px;">
            <span>📱</span> <span>${isStandalone ? 'Hemskärmsapp Aktiv' : 'Spara appen på telefonen'}</span>
          </div>
          ${isStandalone 
            ? `<span class="badge badge-success" style="font-size: 0.72rem; padding: 4px 8px; border-radius: 6px;">✓ Installerad</span>`
            : `<span class="badge badge-warning" style="font-size: 0.72rem; padding: 4px 8px; border-radius: 6px;">Tips!</span>`
          }
        </div>
        <p class="text-muted" style="font-size: 0.8rem; line-height: 1.4; margin-bottom: ${isStandalone ? '0' : '10px'};">
          ${isStandalone 
            ? 'Malta Betting körs i optimerat helskärmsläge direkt från din hemskärm!'
            : 'Få fullskärmsupplevelse utan webbläsarrader, snabbare uppstart och direktnotiser genom att spara appen på hemskärmen.'
          }
        </p>
        ${!isStandalone ? `
          <button type="button" class="btn btn-primary btn-sm btn-block" id="btn-profile-install-pwa" style="background: linear-gradient(135deg, var(--gold), #f59e0b); border: none; font-weight: 700; padding: 9px 14px;">
            📲 Spara appen på hemskärmen
          </button>
        ` : ''}
      </div>

      <!-- Web Push Notifications Card -->
      <div class="card mt-md" id="push-notifications-card">
        <div class="flex-between" style="align-items: center; margin-bottom: var(--space-sm);">
          <div style="font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; display: flex; align-items: center; gap: 6px;">
            <span>🔔</span> <span>Pushnotiser (Web Push)</span>
          </div>
          ${!pushSupported 
            ? `<span class="badge" style="background: rgba(255,255,255,0.08); color: var(--text-muted); font-size: 0.72rem; padding: 4px 8px; border-radius: 6px;">${isIos && !isStandalone ? 'Kräver app' : 'Ej stödd'}</span>`
            : isPushActive
              ? `<span class="badge badge-success" style="font-size: 0.72rem; padding: 4px 8px; border-radius: 6px;">🔔 Aktiv</span>`
              : pushPerm === 'denied'
                ? `<span class="badge badge-danger" style="font-size: 0.72rem; padding: 4px 8px; border-radius: 6px;">Blockerad</span>`
                : `<span class="badge badge-warning" style="font-size: 0.72rem; padding: 4px 8px; border-radius: 6px;">Inaktiv</span>`
          }
        </div>

        <p class="text-muted" style="font-size: 0.8rem; line-height: 1.4; margin-bottom: var(--space-sm);">
          Få realtidsnotiser i mobilen när någon startar ett <strong>⚡ BlixtBet</strong> eller utmanar dig på duell – även när appen är stängd!
        </p>

        ${!pushSupported 
          ? (isIos && !isStandalone 
              ? `
                <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-md); padding: 12px; margin-top: 4px;">
                  <div style="font-weight: 700; font-size: 0.82rem; color: #fbbf24; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                    <span>📱</span> <span>Kräver hemskärmsapp på iPhone</span>
                  </div>
                  <p style="font-size: 0.78rem; line-height: 1.4; color: var(--text-secondary); margin-bottom: 10px;">
                    Apple tillåter endast pushnotiser när Malta Betting sparats på hemskärmen. Lägg till appen på hemskärmen och öppna den därifrån för att slå på notiser!
                  </p>
                  <button type="button" class="btn btn-secondary btn-sm btn-block" id="btn-profile-guide-push-ios" style="font-weight: 700; border-color: rgba(255, 215, 0, 0.4);">
                    📲 Visa hur du sparar på hemskärmen
                  </button>
                </div>
              `
              : `<div class="badge badge-warning" style="font-size: 0.75rem; padding: 8px 10px; width: 100%; text-align: center; border-radius: var(--radius-sm);">
                   ⚠️ Web Push stöds inte i denna webbläsare eller kräver säker HTTPS-anslutning
                 </div>`
            )
          : `
            <button type="button" class="btn ${isPushActive ? 'btn-secondary' : 'btn-primary'} btn-sm btn-block" id="btn-toggle-push" style="${!isPushActive ? 'background: linear-gradient(135deg, var(--gold), #e67e22); border: none; font-weight: 700;' : ''}">
              ${isPushActive ? '🔕 Inaktivera pushnotiser på denna enhet' : '🔔 Aktivera pushnotiser nu'}
            </button>
          `
        }

        ${pushPerm === 'denied' ? `
          <div style="margin-top: 10px; padding: 8px 10px; background: rgba(239, 68, 68, 0.1); border-radius: var(--radius-sm); border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.72rem; color: #fca5a5; line-height: 1.35;">
            ⚠️ Notistillstånd är blockerat i webbläsaren. Öppna webbplatsinställningarna (t.ex. hänglåset i adressfältet) för att tillåta aviseringar.
          </div>
        ` : ''}

        ${pushSupported && isPushActive ? `
          <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-glass);">
            <div style="font-size: 0.8rem; font-weight: 700; margin-bottom: 8px; color: var(--gold);">
              ⚙️ Välj vilka notiser du vill få:
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; cursor: pointer; padding: 4px 0;">
                <span>⚡ <strong>BlixtBets & Snabba mikrospel</strong></span>
                <input type="checkbox" id="pref-notify-flashbets" ${notifPrefs.notifyFlashbets ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--gold); cursor: pointer;" />
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; cursor: pointer; padding: 4px 0;">
                <span>⚔️ <strong>Duell-utmaningar från vänner</strong></span>
                <input type="checkbox" id="pref-notify-duels" ${notifPrefs.notifyDuels ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--gold); cursor: pointer;" />
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; cursor: pointer; padding: 4px 0;">
                <span>🏆 <strong>Events: Nya spel & Resultat</strong></span>
                <input type="checkbox" id="pref-notify-tournaments" ${notifPrefs.notifyTournaments ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--gold); cursor: pointer;" />
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; cursor: pointer; padding: 4px 0;">
                <span>🇲🇹 <strong>Malta Support (Pepp, syrliga pikar & skuldpåminnelser)</strong></span>
                <input type="checkbox" id="pref-notify-support" ${notifPrefs.notifySupport !== false ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--gold); cursor: pointer;" />
              </label>
            </div>
            <div style="margin-top: 10px;">
              <button id="btn-test-malta-push" class="btn btn-secondary btn-sm" style="width: 100%; font-size: 0.75rem; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 10px;">
                🔔 Testa push-notis från Malta Support
              </button>
            </div>
          </div>
        ` : ''}

        ${isIos && isStandalone ? `
          <div style="margin-top: 10px; padding: 8px 10px; background: rgba(34, 197, 94, 0.05); border-radius: var(--radius-sm); border: 1px solid rgba(34, 197, 94, 0.25); font-size: 0.72rem; color: #4ade80; line-height: 1.35;">
            ✓ Körs som hemskärmsapp på iPhone. Notiser är fullt kompatibla med iOS!
          </div>
        ` : ''}
      </div>

      <!-- Malta AI Concierge & Support Card -->
      <div class="card mt-md" id="profile-malta-card" style="border: 1px solid rgba(255, 215, 0, 0.28); background: linear-gradient(180deg, rgba(255, 215, 0, 0.05) 0%, rgba(15, 15, 23, 0.7) 100%);">
        <div class="flex-between mb-xs" style="align-items: center;">
          <div style="font-weight: 700; font-size: 0.88rem; text-transform: uppercase; letter-spacing: 0.07em; display: flex; align-items: center; gap: 8px; color: var(--gold);">
            <img src="/malta-chip-sm.webp" alt="Malta AI" style="width: 22px; height: 22px; object-fit: contain; filter: drop-shadow(0 2px 6px rgba(255,215,0,0.4));" />
            <span>${currentLang === 'en' ? 'Malta AI VIP Concierge 🇲🇹' : 'Malta AI Concierge & Hjälp 🇲🇹'}</span>
          </div>
          <span class="badge" style="background: rgba(255,215,0,0.15); color: var(--gold); font-size: 0.68rem; font-weight: 700; border: 1px solid rgba(255,215,0,0.3); padding: 3px 8px; border-radius: 6px;">
            24/7 AI-HJÄLP
          </span>
        </div>

        <p class="text-muted" style="font-size: 0.78rem; line-height: 1.4; margin-bottom: var(--space-sm);">
          ${currentLang === 'en' 
            ? 'Chat with our AI concierge for instant help on tournament setup, betting rules, Swish settlements on The Tab, forgotten PIN, or golf tips.' 
            : 'Få omedelbar hjälp med turneringar, regler, AnyBet-utmaningar, Swish-avräkning på The Tab, bortglömd PIN-kod eller golfsvingen.'}
        </p>

        <button type="button" class="btn btn-primary btn-block btn-sm" id="profile-open-malta-chat-btn" style="font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; margin-bottom: 12px; background: linear-gradient(135deg, #f59e0b, #d97706); border: none; box-shadow: 0 4px 14px rgba(245,158,11,0.25);">
          <span>💬</span> <span>${currentLang === 'en' ? 'Open Malta AI Chat' : 'Öppna Malta AI Chatt'}</span>
        </button>

        <!-- Floating icon controller & restore toggle -->
        <div style="padding: 10px 12px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div>
            <div style="font-weight: 600; font-size: 0.82rem; display: flex; align-items: center; gap: 6px;">
              <span>${currentLang === 'en' ? 'Floating AI Screen Button' : 'Flytande skärmknapp'}</span>
              <span id="profile-malta-fab-dot" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${isFabDisabled ? 'var(--text-muted)' : '#10b981'}; box-shadow: ${isFabDisabled ? 'none' : '0 0 6px #10b981'};"></span>
            </div>
            <div class="text-muted" style="font-size: 0.72rem; margin-top: 2px;" id="profile-malta-fab-desc">
              ${isFabDisabled 
                ? (currentLang === 'en' ? 'Icon is hidden on screen' : 'Ikonen är dold på skärmen') 
                : (currentLang === 'en' ? 'Icon is visible bottom-right (draggable)' : 'Ikonen visas nere till höger (går att flytta runt)')}
            </div>
          </div>
          <button type="button" class="btn btn-xs ${isFabDisabled ? 'btn-primary' : 'btn-secondary'}" id="profile-toggle-malta-fab-btn" style="font-size: 0.74rem; padding: 5px 10px; white-space: nowrap;">
            ${isFabDisabled 
              ? (currentLang === 'en' ? '📌 Show on screen' : '📌 Visa på skärmen') 
              : (currentLang === 'en' ? '👁️ Hide icon' : '👁️ Dölj ikon')}
          </button>
        </div>
      </div>

      <!-- Edit profile details -->
      <div class="card mt-md">
        <div style="font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: var(--space-md);">
          ⚙️ Redigera uppgifter
        </div>
        
        <div class="form-group mb-sm">
          <label class="form-label" style="font-size: 0.75rem;">${t('profile.realName')}</label>
          <input type="text" id="edit-real-name" class="form-input" value="${escapeHtml(user.realName || '')}" placeholder="${t('profile.realNamePlaceholder')}" />
        </div>

        <div class="form-group mb-sm">
          <label class="form-label" style="font-size: 0.75rem;">${t('profile.nickname')}</label>
          <input type="text" id="edit-nickname" class="form-input" value="${escapeHtml(user.nickname || '')}" placeholder="${t('profile.nicknamePlaceholder')}" />
        </div>

        <div class="form-group mb-md">
          <label class="form-label" style="font-size: 0.75rem;">📱 ${t('profile.swishNumber')}</label>
          <input type="tel" id="edit-swish" class="form-input" placeholder="070-123 45 67" value="${escapeHtml(formatSwedishPhoneDisplay(user.swishNumber) || '')}" maxlength="25" />
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

      <!-- Photo Albums & Memories Section -->
      <div class="card mt-md" id="profile-photo-albums-card" style="padding: var(--space-md);">
        <div class="flex-between mb-sm" style="align-items: center;">
          <div style="font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; display: flex; align-items: center; gap: 6px;">
            <span>📸</span> <span>Mina Fotoalbum & Minnen</span>
            <span class="badge badge-accent" style="font-size: 0.7rem; padding: 2px 6px;">${photos.length}</span>
          </div>
          ${photos.length > 0 ? `
            <span class="text-muted" style="font-size: 0.72rem;">${albums.length} ${albums.length === 1 ? 'resa/event' : 'resor/events'}</span>
          ` : ''}
        </div>

        ${photos.length === 0 ? `
          <div class="text-center text-muted" style="padding: var(--space-md) 0; font-size: 0.85rem;">
            <div style="font-size: 2rem; margin-bottom: 6px;">🏖️</div>
            <div style="font-weight: 600; margin-bottom: 4px;">Inga fotominnen än</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); max-width: 300px; margin: 0 auto;">
              När du eller kompisarna delar bilder i era events sparas de automatiskt här som ett personligt fotoalbum!
            </div>
          </div>
        ` : `
          <div class="albums-container" style="display: flex; flex-direction: column; gap: var(--space-md); margin-top: 8px;">
            ${albums.map(alb => `
              <div class="album-item" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); border-radius: var(--radius-md); padding: 10px;">
                <div class="flex-between mb-xs" style="align-items: center;">
                  <div style="font-weight: 700; font-size: 0.9rem; color: var(--gold); display: flex; align-items: center; gap: 5px;">
                    <span>⛳</span> <span>${escapeHtml(alb.name)}</span>
                  </div>
                  <button type="button" class="btn btn-sm btn-secondary view-album-tournament-btn" data-code="${escapeHtml(alb.code)}" style="font-size: 0.68rem; padding: 2px 8px;">
                    Gå till event →
                  </button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 6px;">
                  ${alb.photos.map(photo => `
                    <div class="profile-photo-thumb" data-photo-id="${photo.id}" style="aspect-ratio: 1; border-radius: var(--radius-sm); overflow: hidden; position: relative; cursor: pointer; border: 1px solid rgba(255,255,255,0.08); background: #111;">
                      <img src="${escapeHtml(safeImageSrc(photo.thumbnailUrl || photo.url))}" alt="${escapeHtml(photo.caption || 'Eventminne')}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s;" loading="lazy" />
                      ${photo.likeCount > 0 ? `
                        <div style="position: absolute; bottom: 3px; right: 3px; background: rgba(0,0,0,0.7); backdrop-filter: blur(2px); border-radius: 8px; padding: 1px 4px; font-size: 0.65rem; color: #fff; display: flex; align-items: center; gap: 2px;">
                          ❤️ ${photo.likeCount}
                        </div>
                      ` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

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
                ${b.outcome === 'won' || b.outcome === 'lost'
                  ? `<span class="${b.won ? 'text-green' : 'text-red'}" style="font-size: 0.75rem;">${b.won ? '✅ ' + t('profile.wins') : '❌ ' + t('profile.losses')}</span>`
                  : b.outcome === 'refunded'
                    ? `<span class="text-muted" style="font-size: 0.75rem;">↩️ ${getLang() === 'en' ? 'Refunded' : 'Återbetald'}</span>`
                    : `<span class="badge ${statusBadgeClass(b.eventStatus)}" style="font-size: 0.6rem;">${statusLabel(b.eventStatus)}</span>`
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
  document.getElementById('logout-btn').addEventListener('click', async () => {
    // Otherwise the phone keeps getting this account's notifications after logging out
    await detachPushFromAccount().catch(() => {});
    clearUser();
    renderProfile();
  });

  // Malta AI Support & FAB Toggle
  document.getElementById('profile-open-malta-chat-btn')?.addEventListener('click', () => {
    openMaltaSupportModal();
  });

  const updateProfileFabState = () => {
    const disabled = isMaltaFabDisabled();
    const btn = document.getElementById('profile-toggle-malta-fab-btn');
    const desc = document.getElementById('profile-malta-fab-desc');
    const dot = document.getElementById('profile-malta-fab-dot');
    const isEn = getLang() === 'en';
    if (btn) {
      btn.className = `btn btn-xs ${disabled ? 'btn-primary' : 'btn-secondary'}`;
      btn.textContent = disabled 
        ? (isEn ? '📌 Show on screen' : '📌 Visa på skärmen') 
        : (isEn ? '👁️ Hide icon' : '👁️ Dölj ikon');
    }
    if (desc) {
      desc.textContent = disabled 
        ? (isEn ? 'Icon is hidden on screen' : 'Ikonen är dold på skärmen') 
        : (isEn ? 'Icon is visible bottom-right (draggable)' : 'Ikonen visas nere till höger (går att flytta runt)');
    }
    if (dot) {
      dot.style.background = disabled ? 'var(--text-muted)' : '#10b981';
      dot.style.boxShadow = disabled ? 'none' : '0 0 6px #10b981';
    }
  };

  document.getElementById('profile-toggle-malta-fab-btn')?.addEventListener('click', () => {
    const isEn = getLang() === 'en';
    const nextDisabled = !isMaltaFabDisabled();
    setMaltaFabDisabled(nextDisabled);
    if (nextDisabled) {
      showToast(
        isEn 
          ? 'Malta button hidden. You can always restore it here under Profile!' 
          : 'Malta-ikonen är nu dold. Du kan alltid återställa den här under Profil!', 
        'info'
      );
    } else {
      showToast(
        isEn 
          ? 'Malta button is now visible on screen!' 
          : 'Malta-ikonen visas nu på skärmen igen!', 
        'success'
      );
    }
    updateProfileFabState();
  });

  // One listener for the page's lifetime, not one more per render
  window.removeEventListener('malta-fab-visibility-changed', window.__profileFabListener || (() => {}));
  window.__profileFabListener = updateProfileFabState;
  window.addEventListener('malta-fab-visibility-changed', updateProfileFabState);

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

  // PWA Install / Guide Button
  document.getElementById('btn-profile-install-pwa')?.addEventListener('click', () => {
    showPwaInstallModal({ forced: true });
  });

  document.getElementById('btn-profile-guide-push-ios')?.addEventListener('click', () => {
    showPwaInstallModal({ forced: true });
  });

  // Push Notification Toggle
  document.getElementById('btn-toggle-push')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-toggle-push');
    btn.disabled = true;
    btn.textContent = 'Bearbetar...';
    try {
      if (isPushActive) {
        await unsubscribeFromPush();
        showToast('🔕 Pushnotiser inaktiverade på denna enhet', 'info');
      } else {
        await subscribeToPush();
        showToast('🔔 Pushnotiser aktiverade! Du får nu blixtsnabba notiser.', 'success');
      }
      renderProfile();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = isPushActive ? '🔕 Inaktivera pushnotiser' : '🔔 Aktivera pushnotiser nu';
    }
  });

  // Notification Preferences Toggles
  const handlePrefChange = async () => {
    const notifyFlashbets = document.getElementById('pref-notify-flashbets')?.checked ?? true;
    const notifyDuels = document.getElementById('pref-notify-duels')?.checked ?? true;
    const notifyTournaments = document.getElementById('pref-notify-tournaments')?.checked ?? true;
    const notifySupport = document.getElementById('pref-notify-support')?.checked ?? true;
    try {
      await updateNotificationPrefs({ notifyFlashbets, notifyDuels, notifyTournaments, notifySupport });
      showToast('Notis-inställningar sparade! ⚙️', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('pref-notify-flashbets')?.addEventListener('change', handlePrefChange);
  document.getElementById('pref-notify-duels')?.addEventListener('change', handlePrefChange);
  document.getElementById('pref-notify-tournaments')?.addEventListener('change', handlePrefChange);
  document.getElementById('pref-notify-support')?.addEventListener('change', handlePrefChange);

  // Test push button
  const testPushBtn = document.getElementById('btn-test-malta-push');
  testPushBtn?.addEventListener('click', async () => {
    testPushBtn.disabled = true;
    const originalText = testPushBtn.innerHTML;
    testPushBtn.textContent = '⏳ Skickar testnotis...';
    try {
      // Re-register this device first, so a stale subscription is repaired before testing
      const endpoint = await syncPushSubscription();
      const res = await fetch('/api/support/test-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-token': localStorage.getItem('betpals_token') || ''
        },
        body: JSON.stringify(endpoint ? { endpoint } : {})
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Kunde inte skicka notis', 'error');
      } else {
        showToast(data.message || 'Notis skickad till din telefon! 🌴☕', 'success');
      }
    } catch (e) {
      showToast('Kunde inte nå servern för testnotis', 'error');
    } finally {
      testPushBtn.disabled = false;
      testPushBtn.innerHTML = originalText;
    }
  });

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
    const rawSwish = document.getElementById('edit-swish').value.trim();
    let swishNumber = '';
    if (rawSwish) {
      swishNumber = normalizePhone(rawSwish) || rawSwish.replace(/[^0-9]/g, '');
      if (swishNumber.startsWith('07') && swishNumber.length !== 10) {
        showToast('Svenska mobilnummer för Swish ska ha 10 siffror (t.ex. 070-123 45 67)', 'error');
        return;
      }
      if (swishNumber.length < 8 || swishNumber.length > 15) {
        showToast('Ogiltigt Swish-nummer (ange 8-15 siffror)', 'error');
        return;
      }
    }

    const btn = document.getElementById('save-profile-btn');
    btn.disabled = true;
    btn.textContent = 'Sparar... ⏳';

    try {
      const res = await updateProfile({ realName, nickname, swishNumber: swishNumber || null });
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

  // Friends: Add friend modal
  document.getElementById('btn-add-friend')?.addEventListener('click', () => {
    showAddFriendModal(friends);
  });

  loadFriendRequests();

  // Friends: Share friend invite link
  document.getElementById('btn-share-friend-link')?.addEventListener('click', async () => {
    let inviteUrl;
    try {
      inviteUrl = await buildFriendInviteUrl();
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
        showToast('Kopierade din personliga inbjudningslänk till urklipp! 📋', 'success');
      } else {
        prompt('Kopiera din vänlänk:', inviteUrl);
      }
    } catch {
      prompt('Kopiera din vänlänk:', inviteUrl);
    }
  });

  // Friends: Open friend options modal
  document.querySelectorAll('.friend-item[data-id]').forEach(item => {
    item.addEventListener('click', () => {
      const friendId = item.dataset.id;
      const f = (friends || []).find(x => x.id === friendId);
      if (f) showFriendOptionsModal(f);
    });
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const friendId = item.dataset.id;
        const f = (friends || []).find(x => x.id === friendId);
        if (f) showFriendOptionsModal(f);
      }
    });
  });

  // Album: Navigate to tournament
  document.querySelectorAll('.view-album-tournament-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'tournament', code } }));
    });
  });

  // Album: Click photo to open lightbox
  document.querySelectorAll('.profile-photo-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const photoId = thumb.dataset.photoId;
      const photo = photos.find(p => p.id === photoId);
      if (!photo) return;

      showModal('📸 ' + escapeHtml(photo.tournamentName || 'Fotomagasin'), `
        <div class="photo-lightbox-modal text-center">
          <div style="max-height: 65vh; display: flex; align-items: center; justify-content: center; background: #000; border-radius: var(--radius-sm); overflow: hidden; margin-bottom: var(--space-sm);">
            <img src="${escapeHtml(safeImageSrc(photo.url))}" alt="${escapeHtml(photo.caption || 'Eventminne')}" style="max-width: 100%; max-height: 65vh; object-fit: contain;" />
          </div>
          ${photo.caption ? `
            <p style="font-size: 0.95rem; font-weight: 500; margin-bottom: var(--space-xs); text-align: left;">
              ${escapeHtml(photo.caption)}
            </p>
          ` : ''}
          <div class="flex-between text-muted" style="font-size: 0.75rem; margin-bottom: var(--space-md); border-top: 1px solid var(--border-glass); padding-top: var(--space-xs);">
            <span>Delad av <strong>${escapeHtml(photo.uploaderName || 'Deltagare')}</strong> ${escapeHtml(photo.uploaderEmoji || '🎲')}</span>
            <span>${formatDate(photo.createdAt)} · ❤️ ${photo.likeCount || 0}</span>
          </div>
          <button type="button" class="btn btn-primary btn-block lightbox-go-tournament-btn" data-code="${escapeHtml(photo.tournamentCode)}">
            🏆 Gå till eventet & se resultat
          </button>
        </div>
      `);

      document.querySelector('.lightbox-go-tournament-btn')?.addEventListener('click', (e) => {
        const code = e.currentTarget.dataset.code;
        closeModal();
        window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'tournament', code } }));
      });
    });
  });

  setupPinToggles(content);
}

async function loadFriendRequests() {
  const slot = document.getElementById('friend-requests-slot');
  if (!slot) return;
  let requests;
  try {
    requests = await getFriendRequests();
  } catch {
    return;
  }
  const incoming = requests.incoming || [];
  const outgoing = requests.outgoing || [];
  if (incoming.length === 0 && outgoing.length === 0) {
    slot.innerHTML = '';
    return;
  }

  slot.innerHTML = `
    ${incoming.length > 0 ? `
      <div style="font-size: 0.75rem; font-weight: 700; color: var(--gold); margin: 4px 0 6px;">📨 Vänförfrågningar (${incoming.length})</div>
      <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;">
        ${incoming.map(r => `
          <div class="flex-between" style="padding: 8px 12px; background: rgba(245,166,35,0.06); border: 1px solid rgba(245,166,35,0.3); border-radius: var(--radius-md); align-items: center; gap: 8px;">
            <div style="min-width: 0;">
              <div style="font-weight: 600; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(r.avatarEmoji || '👤')} ${escapeHtml(r.realName || r.nickname)}</div>
              <div class="text-muted" style="font-size: 0.72rem;">@${escapeHtml(r.nickname)}</div>
            </div>
            <div class="flex gap-xs" style="flex-shrink: 0;">
              <button class="btn btn-sm btn-primary friend-request-accept" data-id="${escapeHtml(r.id)}" style="font-size: 0.72rem; padding: 3px 10px;">Godkänn</button>
              <button class="btn btn-sm btn-secondary friend-request-decline" data-id="${escapeHtml(r.id)}" style="font-size: 0.72rem; padding: 3px 8px;">Neka</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}
    ${outgoing.length > 0 ? `
      <div class="text-muted" style="font-size: 0.72rem; margin-bottom: 8px;">
        ⏳ Väntar på svar från: ${outgoing.map(r => '@' + escapeHtml(r.nickname)).join(', ')}
      </div>
    ` : ''}
  `;

  slot.querySelectorAll('.friend-request-accept').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await acceptFriendRequest(btn.dataset.id);
        showToast('Ni är nu vänner! 👥🎉', 'success');
        renderProfile();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
  slot.querySelectorAll('.friend-request-decline').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await declineFriendRequest(btn.dataset.id);
        loadFriendRequests();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

function showFriendOptionsModal(friend) {
  const avatarHtml = friend.avatarUrl ? `
    <img src="${friend.avatarUrl}" alt="${escapeHtml(friend.nickname)}" style="width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 2.5px solid var(--gold); box-shadow: 0 4px 16px rgba(0,0,0,0.5);" />
  ` : `
    <div style="width: 72px; height: 72px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 2.4rem; border: 2.5px solid var(--border-glass);">
      ${escapeHtml(friend.avatar || friend.avatarEmoji || '👤')}
    </div>
  `;

  showModal(`👤 @${escapeHtml(friend.nickname)}`, `
    <div class="friend-modal-wrap text-center">
      <div style="display: flex; justify-content: center; margin-bottom: var(--space-xs);">
        ${avatarHtml}
      </div>

      <h3 style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 700; margin-bottom: 2px;">
        ${escapeHtml(friend.realName || friend.nickname)}
      </h3>
      <div class="text-gold font-bold mb-md" style="font-size: 0.9rem;">
        @${escapeHtml(friend.nickname)}
      </div>

      <!-- Stats Grid -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: var(--space-md); text-align: center;">
        <div class="card p-xs" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-sm); padding: 8px 4px;">
          <div style="font-size: 1.15rem; font-weight: 800; color: var(--gold);">
            ${friend.wins || 0}
          </div>
          <div class="text-muted" style="font-size: 0.68rem; text-transform: uppercase;">Vinster 🏆</div>
        </div>
        <div class="card p-xs" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-sm); padding: 8px 4px;">
          <div style="font-size: 1.15rem; font-weight: 800; color: ${friend.streak > 0 && friend.streakType === 'win' ? '#f59e0b' : 'var(--text-primary)'};">
            ${friend.streak > 0 ? `${friend.streakType === 'win' ? '🔥 ' : '❄️ '}${friend.streak}` : '—'}
          </div>
          <div class="text-muted" style="font-size: 0.68rem; text-transform: uppercase;">Streak</div>
        </div>
        <div class="card p-xs" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-sm); padding: 8px 4px;">
          <div style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary);">
            ${friend.totalBets || 0}
          </div>
          <div class="text-muted" style="font-size: 0.68rem; text-transform: uppercase;">Spel & Bets</div>
        </div>
      </div>

      <!-- Swish Info -->
      ${friend.swishNumber ? `
        <div class="card mb-md p-sm text-left" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); border-radius: var(--radius-md);">
          <div class="flex-between" style="align-items: center;">
            <div>
              <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600;">📱 Swish</div>
              <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); font-family: monospace;">
                ${escapeHtml(formatSwedishPhoneDisplay(friend.swishNumber))}
              </div>
            </div>
            <a href="${createSwishUrl({ phone: friend.swishNumber, amount: 50, message: 'BetPals' })}" class="btn btn-sm btn-secondary" style="font-size: 0.75rem; padding: 6px 12px; display: inline-flex; align-items: center; gap: 4px;">
              💸 Swisha
            </a>
          </div>
        </div>
      ` : ''}

      ${friend.friendshipDate ? `
        <div class="text-muted mb-md" style="font-size: 0.75rem;">
          🤝 Vänner sedan ${formatDate(friend.friendshipDate)}
        </div>
      ` : ''}

      <!-- Safe Unfriend Area -->
      <div id="friend-modal-unfriend-trigger-wrap" style="margin-top: var(--space-md); border-top: 1px solid var(--border-glass); padding-top: var(--space-md);">
        <button type="button" class="btn btn-secondary btn-block btn-sm" id="btn-unfriend-trigger" style="color: #ff6b6b; border-color: rgba(255,107,107,0.3); background: rgba(255,107,107,0.06); font-size: 0.8rem; padding: 9px;">
          🗑️ Ta bort som vän
        </button>
      </div>

      <!-- Hidden Two-Step Confirmation Area -->
      <div id="friend-unfriend-confirm-box" style="display: none; margin-top: var(--space-md); padding: 14px; background: rgba(231,76,60,0.1); border: 1.5px solid rgba(231,76,60,0.4); border-radius: var(--radius-md); text-align: center;">
        <div style="font-size: 1.4rem; margin-bottom: 4px;">⚠️</div>
        <div style="font-weight: 700; font-size: 0.95rem; color: #ff5555; margin-bottom: 6px;">
          Vill du ta bort @${escapeHtml(friend.nickname)}?
        </div>
        <p class="text-secondary" style="font-size: 0.78rem; line-height: 1.4; margin-bottom: 12px;">
          Ni tas bort från varandras vänlistor och kan inte längre se varandras privata spel automatiskt.
        </p>
        <div class="flex gap-sm" style="justify-content: center;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-unfriend" style="flex: 1; padding: 8px;">
            Avbryt
          </button>
          <button type="button" class="btn btn-danger btn-sm" id="btn-confirm-unfriend" style="flex: 1; padding: 8px; font-weight: 700;">
            Ja, ta bort
          </button>
        </div>
      </div>
    </div>
  `);

  const triggerWrap = document.getElementById('friend-modal-unfriend-trigger-wrap');
  const triggerBtn = document.getElementById('btn-unfriend-trigger');
  const confirmBox = document.getElementById('friend-unfriend-confirm-box');
  const cancelBtn = document.getElementById('btn-cancel-unfriend');
  const confirmBtn = document.getElementById('btn-confirm-unfriend');

  triggerBtn?.addEventListener('click', () => {
    if (triggerWrap) triggerWrap.style.display = 'none';
    if (confirmBox) confirmBox.style.display = 'block';
  });

  cancelBtn?.addEventListener('click', () => {
    if (confirmBox) confirmBox.style.display = 'none';
    if (triggerWrap) triggerWrap.style.display = 'block';
  });

  confirmBtn?.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Tar bort...';
    try {
      await removeFriend(friend.id);
      closeModal();
      showToast(`Tog bort @${friend.nickname} från vänner`, 'info');
      renderProfile();
    } catch (err) {
      showToast(err.message || 'Kunde inte ta bort vän', 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Ja, ta bort';
    }
  });
}

function showAddFriendModal(currentFriends = []) {
  const friendIdSet = new Set(currentFriends.map(f => f.id));
  const currentUser = getStoredUser();
  const myNick = currentUser?.nickname || '';
  let inviteUrl = `${getAppBaseUrl()}/?addFriend=${encodeURIComponent(myNick)}`;
  let inviteText = `Tja! Häng med på Malta Betting och betta med oss: ${inviteUrl}`;
  buildFriendInviteUrl().then(url => {
    inviteUrl = url;
    inviteText = `Tja! Häng med på Malta Betting och betta med oss: ${inviteUrl}`;
  }).catch(() => {});

  showModal('👥 Lägg till vän', `
    <div>
      <div class="form-group">
        <label class="form-label" style="font-size: 0.8rem;">Sök på mobilnummer, @smeknamn eller namn</label>
        <input type="search" class="form-input" id="friend-search-input" placeholder="T.ex. 070-123 45 67, Johan eller @johand..." autofocus />
      </div>
      <div id="friend-search-results" style="min-height: 80px; max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
        <div class="text-center text-muted" style="font-size: 0.8rem; padding: 20px 0;">
          Skriv ett mobilnummer, smeknamn eller namn för att söka
        </div>
      </div>
    </div>
  `);

  const searchInput = document.getElementById('friend-search-input');
  const resultsDiv = document.getElementById('friend-search-results');
  let debounceTimer = null;

  async function performSearch() {
    const q = searchInput.value.trim();
    if (q.length < 2) {
      resultsDiv.innerHTML = `
        <div class="text-center text-muted" style="font-size: 0.8rem; padding: 20px 0;">
          Skriv ett mobilnummer, smeknamn eller namn för att söka
        </div>
      `;
      return;
    }

    resultsDiv.innerHTML = `<div class="text-center text-muted" style="font-size: 0.8rem; padding: 20px 0;">Söker... 🔍</div>`;

    const digits = q.replace(/\D/g, '');
    const looksLikePhone = digits.length >= 7;

    try {
      const users = await searchUsers(q);
      if (users.length === 0) {
        if (looksLikePhone) {
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
          const smsSeparator = isIOS ? '&' : '?';
          const smsLink = `sms:${encodeURIComponent(digits)}${smsSeparator}body=${encodeURIComponent(inviteText)}`;

          let intlPhone = digits;
          if (intlPhone.startsWith('0')) {
            intlPhone = '46' + intlPhone.slice(1);
          }
          const waLink = `https://wa.me/${intlPhone}?text=${encodeURIComponent(inviteText)}`;

          resultsDiv.innerHTML = `
            <div class="card text-center" style="padding: var(--space-md); border: 1px dashed rgba(255,215,0,0.35); background: rgba(255,215,0,0.03); margin-top: 4px;">
              <div style="font-size: 2.2rem; margin-bottom: 6px;">📱</div>
              <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 4px;">Inget konto för ${escapeHtml(q)}</div>
              <p class="text-muted" style="font-size: 0.8rem; line-height: 1.4; margin-bottom: var(--space-md);">
                Kompisen har inte registrerat sig än. Bjud in hen via SMS eller WhatsApp så kopplas ni automatiskt ihop som vänner när hen klickar på länken!
              </p>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <a href="${smsLink}" class="btn btn-primary btn-block" style="text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.85rem;">
                  <span>💬</span> <span>Skicka SMS till ${escapeHtml(q)}</span>
                </a>
                <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-block" style="text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.85rem; border-color: #25D366; color: #25D366;">
                  <span>🟢</span> <span>Öppna i WhatsApp</span>
                </a>
                ${navigator.share ? `
                  <button type="button" class="btn btn-secondary btn-block" id="btn-native-share-invite" style="font-size: 0.8rem;">
                    📤 Dela via annan app...
                  </button>
                ` : ''}
              </div>
            </div>
          `;

          document.getElementById('btn-native-share-invite')?.addEventListener('click', async () => {
            try {
              await navigator.share({
                title: 'Malta Betting Inbjudan',
                text: inviteText,
                url: inviteUrl
              });
            } catch {}
          });
          return;
        }

        resultsDiv.innerHTML = `
          <div class="text-center text-muted" style="font-size: 0.8rem; padding: 20px 0;">
            <div>Inga användare hittades som matchar "${escapeHtml(q)}"</div>
            <div class="mt-sm">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-fallback-copy-invite">
                🔗 Kopiera din inbjudningslänk
              </button>
            </div>
          </div>
        `;
        document.getElementById('btn-fallback-copy-invite')?.addEventListener('click', async () => {
          try {
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(inviteUrl);
              showToast('Kopierade din inbjudningslänk till urklipp! 📋', 'success');
            } else {
              prompt('Kopiera din inbjudningslänk:', inviteUrl);
            }
          } catch {
            prompt('Kopiera din inbjudningslänk:', inviteUrl);
          }
        });
        return;
      }

      resultsDiv.innerHTML = users.map(u => {
        const isAlreadyFriend = friendIdSet.has(u.id);
        return `
          <div class="flex-between" style="padding: 8px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); align-items: center;">
            <div class="flex gap-sm" style="align-items: center; min-width: 0;">
              ${u.avatarUrl ? `
                <img src="${u.avatarUrl}" alt="${escapeHtml(u.nickname)}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
              ` : `
                <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;">
                  ${escapeHtml(u.avatar || '👤')}
                </div>
              `}
              <div style="min-width: 0;">
                <div style="font-weight: 600; font-size: 0.85rem;">${escapeHtml(u.realName || u.nickname)}</div>
                <div class="text-muted" style="font-size: 0.75rem; color: var(--gold);">@${escapeHtml(u.nickname)}</div>
              </div>
            </div>
            <div style="flex-shrink: 0; margin-left: 8px;">
              ${isAlreadyFriend ? `
                <span class="badge badge-success" style="font-size: 0.7rem;">Redan vän ✓</span>
              ` : `
                <button class="btn btn-sm btn-accent add-friend-action-btn" data-id="${u.id}" data-nickname="${escapeHtml(u.nickname)}" style="font-size: 0.75rem; padding: 3px 10px;">
                  + Lägg till
                </button>
              `}
            </div>
          </div>
        `;
      }).join('');

      resultsDiv.querySelectorAll('.add-friend-action-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const fid = btn.dataset.id;
          const fnick = btn.dataset.nickname;
          btn.disabled = true;
          btn.textContent = 'Lägger till...';
          try {
            const res = await addFriend({ friendId: fid });
            if (res.status === 'pending') {
              showToast(`Vänförfrågan skickad till @${fnick}! 📨`, 'success');
              btn.parentElement.innerHTML = `<span class="badge" style="font-size: 0.7rem;">Förfrågan skickad ⏳</span>`;
              loadFriendRequests();
              return;
            }
            showToast(`Lade till @${fnick} som vän! 🎉`, 'success');
            friendIdSet.add(fid);
            btn.parentElement.innerHTML = `<span class="badge badge-success" style="font-size: 0.7rem;">Redan vän ✓</span>`;
            // Refresh main profile in background so when closed, friends are updated
            const [b, s, c, updatedFriends] = await Promise.all([
              getMyBets(),
              getMyStats(),
              getMyCredentials().catch(() => ({ hasBiometric: false })),
              getFriends().catch(() => [])
            ]);
            const u = getStoredUser();
            renderProfileContent(document.getElementById('page-content'), u, b, s, c, updatedFriends);
          } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = '+ Lägg till';
          }
        });
      });
    } catch (err) {
      resultsDiv.innerHTML = `<div class="text-center text-red" style="font-size: 0.8rem; padding: 20px 0;">${escapeHtml(err.message)}</div>`;
    }
  }

  searchInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performSearch, 300);
  });
}
