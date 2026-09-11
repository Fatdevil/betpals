// ── Components: Minigames Arcade ────────────────────────
import { showModal, closeModal } from './modal.js';
import { launchConfetti, escapeHtml, showToast, createSwishUrl } from '../utils.js';
import { 
  getFriends, 
  createDuel, 
  getDuel, 
  respondDuel, 
  submitDuelRoll, 
  getDuelSettlements, 
  settleDuel, 
  settleDuelsWithFriend,
  createPartyRoom,
  getPartyRoom,
  joinPartyRoom,
  inviteToParty,
  startPartyGame,
  submitPartyTime,
  resolvePartyTie,
  createAnyBet,
  getAnyBets,
  getAnyBet,
  joinAnyBet,
  settleAnyBet,
  createFlashBet,
  getActiveFlashBets,
  getFlashBet,
  placeFlashBet,
  settleFlashBet,
  getTournaments,
  createTabExpense,
  startLiveNotanRoulette,
  convertTabExpenseToEvenSteven,
  getTabExpense,
  getMyTabExpenses
} from '../api.js';
import { compressImage } from '../imageUtils.js';
import { isPushSupported, getPushPermissionState, subscribeToPush } from '../push.js';
import { getStoredUser, getToken } from '../auth.js';
import { t, getLang } from '../i18n.js';

// ── Web Audio Synth SFX (Zero-dependency & instant) ───────
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(freq = 440, type = 'sine', duration = 0.15, gainLevel = 0.1) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainLevel, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function playCoinSound() {
  playTone(987.77, 'sine', 0.2, 0.12);
  setTimeout(() => playTone(1318.51, 'sine', 0.3, 0.1), 80);
}

function playTickSound() {
  playTone(800, 'triangle', 0.04, 0.05);
}

function playWinSound() {
  const notes = [523.25, 659.25, 783.99, 1046.50];
  notes.forEach((n, i) => {
    setTimeout(() => playTone(n, 'triangle', 0.25, 0.15), i * 90);
  });
}

function playDiceSound() {
  for (let i = 0; i < 5; i++) {
    setTimeout(() => playTone(150 + Math.random() * 200, 'square', 0.04, 0.06), i * 60);
  }
}

// ── Virtual Arcade Chips ────────────────────────────────
function getChips() {
  const saved = localStorage.getItem('betpals_arcade_chips');
  return saved !== null ? parseInt(saved, 10) : 100;
}

function setChips(amount) {
  localStorage.setItem('betpals_arcade_chips', String(Math.max(0, amount)));
  window.dispatchEvent(new CustomEvent('chips-updated', { detail: { chips: amount } }));
}

// ── 1. Roller Ticker HTML ───────────────────────────────
export function renderMinigamesRoller() {
  const games = [
    {
      id: 'coin-flip',
      name: t('arcade.coinFlip'),
      tag: t('arcade.coinFlipTag'),
      title: t('arcade.coinFlipTitle'),
      iconHtml: `<img src="/coin-head.jpg" alt="${t('arcade.coinFlip')}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; box-shadow: 0 2px 6px rgba(0,0,0,0.5); border: 1px solid var(--gold);" />`
    },
    {
      id: 'slots',
      name: t('arcade.slots'),
      tag: t('arcade.slotsTag'),
      title: t('arcade.slotsTitle'),
      iconHtml: `<img src="/slots-machine.png" alt="${t('arcade.slots')}" style="width: 36px; height: 36px; object-fit: contain; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6));" />`
    },
    {
      id: 'wheel',
      name: t('arcade.wheel'),
      tag: t('arcade.wheelTag'),
      title: t('arcade.wheelTitle'),
      iconHtml: `<img src="/wheel-fortune.png" alt="${t('arcade.wheel')}" style="width: 36px; height: 36px; object-fit: contain; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6));" />`
    },
    {
      id: 'dice',
      name: t('arcade.dice'),
      tag: t('arcade.diceTag'),
      title: t('arcade.diceTitle'),
      iconHtml: `<img src="/dice-gold.png" alt="${t('arcade.dice')}" style="width: 34px; height: 34px; object-fit: contain; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6));" />`
    },
    {
      id: 'blind10',
      name: t('arcade.blind10'),
      tag: t('arcade.blind10Tag'),
      title: t('arcade.blind10Title'),
      iconHtml: `<img src="/stopwatch-gold.png" alt="${t('arcade.blind10')}" style="width: 36px; height: 36px; object-fit: contain; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6));" />`
    },
    {
      id: 'anybet',
      name: t('arcade.anybet'),
      tag: t('arcade.anybetTag'),
      title: t('arcade.anybetTitle'),
      iconHtml: `<img src="/handshake-gold.png" alt="${t('arcade.anybet')}" style="width: 38px; height: 38px; object-fit: contain; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6));" />`
    },
    {
      id: 'flashbet',
      name: t('arcade.flashbet'),
      tag: t('arcade.flashbetTag'),
      title: t('arcade.flashbetTitle'),
      iconHtml: `<span style="font-size: 2.2rem; line-height: 1; filter: drop-shadow(0 2px 8px rgba(255,215,0,0.8));">⚡</span>`
    },
    {
      id: 'notan-roulette',
      name: t('arcade.notanRoulette'),
      tag: t('arcade.notanRouletteTag'),
      title: t('arcade.notanRouletteTitle'),
      iconHtml: `<img src="/gold-card.png" alt="${t('arcade.notanRoulette')}" style="width: 40px; height: 38px; object-fit: contain; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6));" />`
    }
  ];

  const renderCard = (g) => `
    <div class="minigame-card" data-game="${g.id}" title="${g.title}">
      <div class="minigame-card-icon" style="${g.id === 'coin-flip' || g.id === 'dice' || g.id === 'slots' || g.id === 'wheel' || g.id === 'blind10' || g.id === 'anybet' || g.id === 'flashbet' || g.id === 'notan-roulette' ? 'display: flex; align-items: center; justify-content: center;' : ''}">
        ${g.iconHtml}
      </div>
      <div class="minigame-card-name">${g.name}</div>
      <div class="minigame-card-tag">${g.tag}</div>
    </div>
  `;

  // Repeat twice per group so the loop is smooth and wide on any screen
  const groupCards = [...games, ...games].map(renderCard).join('');

  return `
    <div class="minigames-section animate-in">
      <div class="minigames-header">
        <div class="minigames-title">
          <span class="live-dot" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981; margin-right: 4px;"></span>
          <span>🎰</span> <span>${t('arcade.title')}</span>
        </div>
        <div class="flex gap-xs" style="align-items: center;">
          <span class="badge badge-accent" style="font-size: 0.65rem; padding: 2px 8px; letter-spacing: 0.05em;">
            ${t('arcade.tagline')}
          </span>
        </div>
      </div>
      <div class="minigames-ticker-container" id="minigames-ticker">
        <div class="minigames-ticker-track">
          <div class="minigames-ticker-group">
            ${groupCards}
          </div>
          <div class="minigames-ticker-group" aria-hidden="true">
            ${groupCards}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── 2. Event Listeners for Roller ───────────────────────
export function attachMinigamesListeners() {
  const ticker = document.getElementById('minigames-ticker');
  if (ticker) {
    // Touch handlers to pause smoothly when touched on mobile
    ticker.addEventListener('touchstart', () => {
      ticker.classList.add('paused');
    }, { passive: true });

    ticker.addEventListener('touchend', () => {
      setTimeout(() => {
        ticker.classList.remove('paused');
      }, 1200);
    }, { passive: true });

    // Delegated click handler on the ticker cards
    ticker.addEventListener('click', (e) => {
      const card = e.target.closest('.minigame-card');
      if (!card) return;
      const game = card.getAttribute('data-game');
      if (game === 'coin-flip') openCoinFlipModal();
      else if (game === 'slots') openSlotsModal();
      else if (game === 'wheel') openWheelModal();
      else if (game === 'dice') openDiceModal();
      else if (game === 'blind10') openBlind10Modal();
      else if (game === 'anybet') openAnyBetModal();
      else if (game === 'flashbet') openFlashBetModal();
      else if (game === 'notan-roulette') openNotanRouletteModal();
    });
  }

  // Open Swishlistan modal
  document.getElementById('btn-open-swishlist')?.addEventListener('click', openSwishlistModal);

  // Initialize global real-time duel incoming challenge listener
  setupGlobalDuelListener();
}

// ────────────────────────────────────────────────────────
// 🪙 GAME 1: SINGLA SLANT (Coin Flip)
// ────────────────────────────────────────────────────────
function openCoinFlipModal(initialDuel = null) {
  const isEn = getLang() === 'en';
  const currentUser = getStoredUser();

  let streak = 0;
  let isFlipping = false;
  let currentRotation = 0;

  // Active mode: 'solo' (free) | 'swish'
  let activeMode = initialDuel ? 'swish' : 'solo';
  let swishSubMode = initialDuel?.mode || 'table'; // 'table' | 'online'
  let currentStake = initialDuel?.stake_amount || 1;
  let selectedFriend = null;
  let userFriends = [];

  let chosenSide = 'head'; // 'head' | 'tails' (P1 chooses, P2 automatically gets the opposite)

  // Online duel state
  let activeDuel = initialDuel || null;
  let duelWs = null;

  if (initialDuel && currentUser) {
    if (initialDuel.creator_id === currentUser.id) {
      selectedFriend = { id: initialDuel.opponent_id, nickname: initialDuel.opponent_nickname, swishNumber: initialDuel.opponent_swish };
    } else {
      selectedFriend = { id: initialDuel.creator_id, nickname: initialDuel.creator_nickname, swishNumber: initialDuel.creator_swish };
    }
  }

  function getSideLabel(side) {
    if (side === 'head') return isEn ? '🪙 HEAD (Krona)' : '🪙 HEAD (Krona)';
    return isEn ? '🪙 TAILS (Klave)' : '🪙 TAILS (Klave)';
  }

  function buildModalHtml() {
    const p1Name = currentUser?.nickname || (isEn ? 'You' : 'Du');
    const p2Name = selectedFriend ? selectedFriend.nickname : (isEn ? 'Opponent' : 'Motståndare');

    return `
      <div class="text-center" style="padding: var(--space-xs) 0;">
        <!-- Mode Switcher -->
        <div class="duel-mode-bar">
          <button type="button" class="duel-mode-btn ${activeMode === 'solo' ? 'active' : ''}" id="btn-coin-mode-solo">
            ${t('arcade.coinModeSolo')}
          </button>
          <button type="button" class="duel-mode-btn ${activeMode === 'swish' ? 'active' : ''}" id="btn-coin-mode-swish">
            ${t('arcade.coinModeSwish')}
          </button>
        </div>

        <!-- Swish Config Section -->
        <div id="coin-swish-config-box" style="display: ${activeMode === 'swish' ? 'block' : 'none'}; background: rgba(0,0,0,0.35); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-md); padding: 10px; margin-bottom: 12px; text-align: left;">
          <!-- Sub-mode toggle -->
          <div class="flex gap-xs mb-xs" style="align-items: center;">
            <button type="button" class="btn btn-xs ${swishSubMode === 'table' ? 'btn-primary' : 'btn-secondary'}" id="btn-coin-submode-table" style="font-size: 0.75rem; flex: 1;">
              ${t('arcade.diceModeTable')}
            </button>
            <button type="button" class="btn btn-xs ${swishSubMode === 'online' ? 'btn-primary' : 'btn-secondary'}" id="btn-coin-submode-online" style="font-size: 0.75rem; flex: 1;">
              ${t('arcade.diceModeOnline')}
            </button>
          </div>

          <!-- Stake selector with quick pills + custom input -->
          <div class="mb-xs">
            <div style="font-size: 0.75rem; font-weight: 700; color: #34d399; margin-bottom: 4px;">${t('arcade.diceStakeLabel')}</div>
            <div class="duel-stake-bar" style="justify-content: flex-start; margin-bottom: 6px; flex-wrap: wrap; align-items: center;">
              <button type="button" class="duel-stake-pill coin-stake-pill ${currentStake === 1 ? 'active' : ''}" data-stake="1">1 kr</button>
              <button type="button" class="duel-stake-pill coin-stake-pill ${currentStake === 5 ? 'active' : ''}" data-stake="5">5 kr</button>
              <button type="button" class="duel-stake-pill coin-stake-pill ${currentStake === 10 ? 'active' : ''}" data-stake="10">10 kr</button>
              <button type="button" class="duel-stake-pill coin-stake-pill ${currentStake === 20 ? 'active' : ''}" data-stake="20">20 kr</button>
              <div style="display: inline-flex; align-items: center; gap: 4px; margin-left: 2px;">
                <input type="number" id="coin-custom-stake-input" class="form-input" min="1" max="50000" placeholder="${isEn ? 'Custom...' : 'Valfri...'}" value="${[1, 5, 10, 20].includes(currentStake) ? '' : currentStake}" style="padding: 2px 8px; font-size: 0.76rem; width: 80px; border-radius: 12px; height: 26px;" />
                <span style="font-size: 0.72rem; color: var(--text-muted);">kr</span>
              </div>
            </div>
          </div>

          <!-- Opponent Selector -->
          <div>
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--gold); margin-bottom: 4px;">${t('arcade.dicePickFriend')}</div>
            <div id="coin-friends-list" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 85px; overflow-y: auto;">
              <span class="text-muted" style="font-size: 0.75rem;">${isEn ? 'Loading friends...' : 'Laddar vänner...'}</span>
            </div>
          </div>
        </div>

        <!-- Side Picker -->
        <div id="coin-side-picker-box" class="mb-sm">
          <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;" id="coin-side-prompt-label">
            ${activeMode === 'swish' ? t('arcade.coinSidePickPrompt') : t('arcade.coinFlipPrompt')}
          </div>
          <div class="flex gap-sm mb-xs" style="justify-content: center;">
            <button type="button" class="btn btn-secondary coin-pick-btn ${chosenSide === 'head' ? 'active' : ''}" data-side="head" style="flex: 1; ${chosenSide === 'head' ? 'border-color: var(--gold);' : ''} font-weight: 700;">
              🪙 HEAD (Krona)
            </button>
            <button type="button" class="btn btn-secondary coin-pick-btn ${chosenSide === 'tails' ? 'active' : ''}" data-side="tails" style="flex: 1; ${chosenSide === 'tails' ? 'border-color: var(--gold);' : ''} font-weight: 700;">
              🪙 TAILS (Klave)
            </button>
          </div>
          <!-- Duel matchup assignment preview -->
          <div id="coin-matchup-preview" style="display: ${activeMode === 'swish' ? 'flex' : 'none'}; justify-content: space-around; font-size: 0.76rem; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); padding: 4px 8px; border: 1px solid var(--border-glass);">
            <span style="color: var(--gold);"><b>${escapeHtml(p1Name)}:</b> ${chosenSide === 'head' ? '🪙 HEAD' : '🪙 TAILS'}</span>
            <span style="color: var(--text-muted); font-weight: 800;">VS</span>
            <span style="color: #f87171;"><b><span id="coin-matchup-p2-name">${escapeHtml(p2Name)}</span>:</b> <span id="coin-matchup-p2-side">${chosenSide === 'head' ? '🪙 TAILS' : '🪙 HEAD'}</span></span>
          </div>
        </div>

        <!-- Coin 3D Stage -->
        <div class="coin-stage">
          <div class="coin-flip-coin" id="game-coin">
            <div class="coin-side coin-front">
              <img src="/coin-head.jpg" alt="HEAD" class="coin-chip-img" />
            </div>
            <div class="coin-side coin-back">
              <img src="/coin-tail.jpg" alt="TAILS" class="coin-chip-img" />
            </div>
          </div>
        </div>

        <!-- Result / Prompt Banner -->
        <div id="coin-result-banner" class="mb-sm" style="font-family: var(--font-heading); font-size: 1.05rem; font-weight: 800; min-height: 28px; color: var(--gold); padding: 0 8px;">
          ${t('arcade.coinFlipPrompt')}
        </div>

        <!-- Swish Payout Action Box -->
        <div id="coin-swish-action-box" style="display: none; margin-bottom: 12px;"></div>

        <!-- Main Action Button -->
        <button type="button" class="btn btn-primary btn-block mb-md" id="btn-do-coin-flip" style="font-size: 1rem; padding: 12px; font-weight: 800;">
          ${t('arcade.coinFlipBtn')}
        </button>

        <!-- Footer / Streak or Scoreboard -->
        <div class="flex-between" style="padding: 6px 12px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); font-size: 0.75rem;">
          <span class="text-muted" id="coin-footer-mode">${activeMode === 'swish' ? `📱 ${isEn ? 'Swish Duel' : 'Swish-duell'}: ${currentStake} kr` : t('arcade.coinFlipStreak')}</span>
          <span class="text-gold font-bold" id="coin-streak-val">🔥 0 ${isEn ? 'in a row' : 'i rad'}</span>
        </div>
      </div>
    `;
  }

  const coinTitleHtml = `<img src="/coin-head.jpg" alt="Coin" style="width: 22px; height: 22px; border-radius: 50%; vertical-align: -3px; margin-right: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.5);" />${t('arcade.coinFlipTitle')}`;
  const modal = showModal(coinTitleHtml, buildModalHtml(), () => {
    if (duelWs) {
      try { duelWs.close(); } catch (e) {}
    }
  });

  const coinEl = document.getElementById('game-coin');
  const banner = document.getElementById('coin-result-banner');
  const streakVal = document.getElementById('coin-streak-val');
  const flipBtn = document.getElementById('btn-do-coin-flip');
  const footerMode = document.getElementById('coin-footer-mode');
  const swishBox = document.getElementById('coin-swish-config-box');
  const swishActionBox = document.getElementById('coin-swish-action-box');
  const friendsList = document.getElementById('coin-friends-list');
  const matchupPreview = document.getElementById('coin-matchup-preview');
  const matchupP2Name = document.getElementById('coin-matchup-p2-name');
  const matchupP2Side = document.getElementById('coin-matchup-p2-side');
  const sidePromptLabel = document.getElementById('coin-side-prompt-label');
  const customStakeInput = document.getElementById('coin-custom-stake-input');

  // Load friends for Swish mode
  getFriends().then(friends => {
    userFriends = friends || [];
    if (userFriends.length > 0 && !selectedFriend) {
      selectedFriend = userFriends[0];
    }
    renderFriendsPicker();
    updateMatchupDisplay();
    updateButtonState();
  }).catch(() => {
    userFriends = [];
    renderFriendsPicker();
  });

  function renderFriendsPicker() {
    if (!friendsList) return;
    if (userFriends.length === 0) {
      friendsList.innerHTML = `<span class="text-muted" style="font-size: 0.75rem;">${t('arcade.diceNoFriends')}</span>`;
      return;
    }

    friendsList.innerHTML = userFriends.map(f => {
      const isSelected = selectedFriend && selectedFriend.id === f.id;
      return `
        <button type="button" class="coin-friend-btn" data-id="${f.id}" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; border: 1px solid ${isSelected ? 'var(--gold)' : 'var(--border-glass)'}; background: ${isSelected ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)'}; color: ${isSelected ? 'var(--gold)' : 'var(--text-primary)'}; cursor: pointer;">
          ${f.avatarUrl ? `<img src="${f.avatarUrl}" style="width: 14px; height: 14px; border-radius: 50%; object-fit: cover;" />` : (f.avatarEmoji || '👤')}
          <span>${escapeHtml(f.nickname)}</span>
        </button>
      `;
    }).join('');

    friendsList.querySelectorAll('.coin-friend-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        selectedFriend = userFriends.find(f => f.id === id);
        renderFriendsPicker();
        updateMatchupDisplay();
        updateButtonState();
      });
    });
  }

  function updateMatchupDisplay() {
    if (matchupP2Name) {
      matchupP2Name.textContent = selectedFriend ? selectedFriend.nickname : (isEn ? 'Opponent' : 'Motståndare');
    }
    if (matchupP2Side) {
      matchupP2Side.textContent = chosenSide === 'head' ? '🪙 TAILS' : '🪙 HEAD';
    }
  }

  // Side selection buttons
  const pickBtns = document.querySelectorAll('.coin-pick-btn');
  pickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      pickBtns.forEach(b => {
        b.classList.remove('active');
        b.style.borderColor = '';
      });
      btn.classList.add('active');
      btn.style.borderColor = 'var(--gold)';
      chosenSide = btn.dataset.side;
      updateMatchupDisplay();
    });
  });

  // Mode togglers
  document.getElementById('btn-coin-mode-solo')?.addEventListener('click', () => {
    activeMode = 'solo';
    document.getElementById('btn-coin-mode-solo').classList.add('active');
    document.getElementById('btn-coin-mode-swish').classList.remove('active');
    swishBox.style.display = 'none';
    matchupPreview.style.display = 'none';
    swishActionBox.style.display = 'none';
    sidePromptLabel.textContent = t('arcade.coinFlipPrompt');
    updateButtonState();
  });

  document.getElementById('btn-coin-mode-swish')?.addEventListener('click', () => {
    if (!currentUser) {
      showToast(isEn ? 'Log in on your profile to play Swish duels!' : 'Logga in på din profil för att spela Swish-dueller!', 'warning');
      return;
    }
    activeMode = 'swish';
    document.getElementById('btn-coin-mode-swish').classList.add('active');
    document.getElementById('btn-coin-mode-solo').classList.remove('active');
    swishBox.style.display = 'block';
    matchupPreview.style.display = 'flex';
    sidePromptLabel.textContent = t('arcade.coinSidePickPrompt');
    updateMatchupDisplay();
    updateButtonState();
  });

  document.getElementById('btn-coin-submode-table')?.addEventListener('click', () => {
    swishSubMode = 'table';
    document.getElementById('btn-coin-submode-table').className = 'btn btn-xs btn-primary';
    document.getElementById('btn-coin-submode-online').className = 'btn btn-xs btn-secondary';
    updateButtonState();
  });

  document.getElementById('btn-coin-submode-online')?.addEventListener('click', () => {
    swishSubMode = 'online';
    document.getElementById('btn-coin-submode-online').className = 'btn btn-xs btn-primary';
    document.getElementById('btn-coin-submode-table').className = 'btn btn-xs btn-secondary';
    updateButtonState();
  });

  // Stake preset pills
  swishBox.querySelectorAll('.coin-stake-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      swishBox.querySelectorAll('.coin-stake-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentStake = parseInt(pill.getAttribute('data-stake'), 10) || 1;
      if (customStakeInput) customStakeInput.value = '';
      updateButtonState();
    });
  });

  // Custom stake input
  customStakeInput?.addEventListener('input', () => {
    const val = parseInt(customStakeInput.value, 10);
    if (val && val > 0) {
      currentStake = val;
      swishBox.querySelectorAll('.coin-stake-pill').forEach(p => p.classList.remove('active'));
    } else {
      currentStake = 1;
    }
    updateButtonState();
  });

  function updateButtonState() {
    swishActionBox.style.display = 'none';
    if (activeMode === 'solo') {
      flipBtn.textContent = t('arcade.coinFlipBtn');
      flipBtn.disabled = false;
      banner.textContent = t('arcade.coinFlipPrompt');
      banner.style.color = 'var(--gold)';
      footerMode.textContent = t('arcade.coinFlipStreak');
      streakVal.textContent = `🔥 ${streak} ${isEn ? 'in a row' : 'i rad'}`;
      return;
    }

    footerMode.textContent = `📱 ${isEn ? 'Swish Duel' : 'Swish-duell'}: ${currentStake} kr`;
    streakVal.textContent = '⚔️ 1v1';

    if (!selectedFriend) {
      flipBtn.textContent = isEn ? 'Pick a friend first 👆' : 'Välj en kompis ovanför 👆';
      flipBtn.disabled = true;
      return;
    }

    flipBtn.disabled = false;
    if (swishSubMode === 'table') {
      flipBtn.textContent = `🪙 ${isEn ? `Flip for ${currentStake} kr!` : `Singla om ${currentStake} kr!`}`;
      banner.textContent = isEn 
        ? `Flip the coin! ${currentUser?.nickname || 'You'} vs ${selectedFriend.nickname}` 
        : `Singla slanten! ${currentUser?.nickname || 'Du'} mot ${selectedFriend.nickname}`;
      banner.style.color = 'var(--gold)';
    } else {
      if (activeDuel && activeDuel.status === 'active') {
        flipBtn.textContent = `🪙 ${isEn ? `Flip coin (${currentStake} kr)` : `Singla slanten (${currentStake} kr)`}`;
        banner.textContent = isEn ? 'Duel accepted! Tap to flip!' : 'Duell godkänd! Klicka för att singla!';
        banner.style.color = '#4ade80';
      } else {
        flipBtn.textContent = `⚔️ ${t('arcade.diceChallengeBtn')} ${selectedFriend.nickname} (${currentStake} kr)`;
        banner.textContent = isEn 
          ? `Challenge ${selectedFriend.nickname} for ${currentStake} kr via Swish!` 
          : `Utmana ${selectedFriend.nickname} om ${currentStake} kr via Swish!`;
        banner.style.color = 'var(--gold)';
      }
    }
  }

  // Connect online duel WS if opening an active duel
  if (initialDuel && initialDuel.mode === 'online') {
    connectDuelWs(initialDuel.id);
  }

  function connectDuelWs(duelId) {
    const token = getToken();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    duelWs = new WebSocket(`${protocol}//${window.location.host}?token=${token}&duel=${duelId}`);

    duelWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'duel_accepted') {
          showToast(isEn ? `${selectedFriend.nickname} accepted the duel! ⚔️` : `${selectedFriend.nickname} antog duellen! ⚔️`, 'success');
          if (activeDuel) activeDuel.status = 'active';
          updateButtonState();
        } else if (data.type === 'duel_declined') {
          banner.textContent = isEn ? 'Opponent declined the challenge.' : 'Motståndaren avböjde utmaningen.';
          banner.style.color = '#f87171';
          flipBtn.disabled = false;
          flipBtn.textContent = isEn ? 'Challenge again' : 'Utmana igen';
        } else if (data.type === 'duel_live_flip') {
          // Opponent triggered flip live
          spinCoinAnimation(data.outcome, data.targetDeg, false);
        } else if (data.type === 'duel_finished') {
          const d = data.duel;
          handleDuelFinished(d);
        }
      } catch (e) {}
    };
  }

  function spinCoinAnimation(outcome, targetDeg, isInitiator) {
    if (isFlipping) return;
    isFlipping = true;
    flipBtn.disabled = true;
    banner.textContent = t('arcade.coinFlipSpinning');
    banner.style.color = 'var(--text-secondary)';
    playCoinSound();

    currentRotation += targetDeg;
    coinEl.style.transform = `rotateY(${currentRotation}deg)`;

    return new Promise(resolve => {
      setTimeout(() => {
        isFlipping = false;
        resolve();
      }, 1800);
    });
  }

  function handleDuelFinished(d) {
    const p1Won = d.winner_id === currentUser?.id;
    const sideName = (d.creator_score === 1 && d.creator_id === currentUser?.id) || (d.opponent_score === 1 && d.opponent_id === currentUser?.id)
      ? (chosenSide === 'head' ? 'HEAD' : 'TAILS')
      : (chosenSide === 'head' ? 'TAILS' : 'HEAD');

    if (p1Won) {
      banner.innerHTML = isEn
        ? `🎉 <span style="color: #4ade80;">${escapeHtml(currentUser?.nickname || 'You')}</span> won on ${sideName}!`
        : `🎉 <span style="color: #4ade80;">${escapeHtml(currentUser?.nickname || 'Du')}</span> vann på ${sideName}!`;
      playWinSound();
      launchConfetti();

      swishActionBox.style.display = 'block';
      swishActionBox.innerHTML = `
        <div style="background: rgba(74,222,128,0.15); border: 1px solid rgba(74,222,128,0.3); border-radius: var(--radius-sm); padding: 10px; text-align: center;">
          <div style="font-weight: 700; color: #4ade80; font-size: 0.9rem; margin-bottom: 4px;">
            ${escapeHtml(selectedFriend.nickname)} ${t('arcade.diceOwes')} dig ${currentStake} kr! 💰
          </div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">
            ${isEn ? 'Logged in The Tab & Swish List!' : 'Loggat i Notan & Swishlistan!'}
          </div>
        </div>
      `;
    } else {
      banner.innerHTML = isEn
        ? `💀 <span style="color: #f87171;">${escapeHtml(selectedFriend.nickname)}</span> won on ${sideName}!`
        : `💀 <span style="color: #f87171;">${escapeHtml(selectedFriend.nickname)}</span> vann på ${sideName}!`;

      const swishUrl = createSwishUrl({
        phone: selectedFriend.swishNumber,
        amount: currentStake,
        message: 'Betpals Singla Slant'
      });

      swishActionBox.style.display = 'block';
      swishActionBox.innerHTML = `
        <div style="background: rgba(248,113,113,0.15); border: 1px solid rgba(248,113,113,0.3); border-radius: var(--radius-sm); padding: 10px; text-align: center;">
          <div style="font-weight: 700; color: #f87171; font-size: 0.9rem; margin-bottom: 8px;">
            Du ${t('arcade.diceOwes')} ${escapeHtml(selectedFriend.nickname)} ${currentStake} kr!
          </div>
          <a href="${swishUrl}" class="swish-pay-btn" style="width: 100%; margin-bottom: 6px;" target="_blank" rel="noopener">
            📱 ${isEn ? 'Swish' : 'Swisha'} ${currentStake} kr till ${escapeHtml(selectedFriend.nickname)}
          </a>
        </div>
      `;
    }

    flipBtn.disabled = false;
    flipBtn.textContent = `🔄 ${isEn ? 'Flip again' : 'Singla igen'} (${currentStake} kr)`;
  }

  // Flip Action Button Handler
  flipBtn?.addEventListener('click', async () => {
    if (isFlipping) return;

    // 1. SOLO FREE MODE
    if (activeMode === 'solo') {
      const isHead = Math.random() < 0.5;
      const outcome = isHead ? 'head' : 'tails';
      const extraTurns = 5 + Math.floor(Math.random() * 3);
      const targetDeg = (extraTurns * 360) + (isHead ? 0 : 180);

      await spinCoinAnimation(outcome, targetDeg, true);

      const won = chosenSide === outcome;
      const sideName = isHead ? 'HEAD' : 'TAILS';
      if (won) {
        streak++;
        playWinSound();
        launchConfetti();
        banner.textContent = isEn 
          ? `🎉 It landed on ${sideName}! You guessed RIGHT!` 
          : `🎉 Det blev ${sideName}! Du gissade RÄTT!`;
        banner.style.color = '#4ade80';
      } else {
        streak = 0;
        banner.textContent = isEn
          ? `It landed on ${sideName}! Better luck next flip!`
          : `Det blev ${sideName}! Bättre lycka nästa kast!`;
        banner.style.color = 'var(--text-primary)';
      }
      streakVal.textContent = `🔥 ${streak} ${isEn ? 'in a row' : 'i rad'}`;
      flipBtn.disabled = false;
      return;
    }

    // 2. SWISH MODE - TABLE (Pass & play on same phone)
    if (swishSubMode === 'table') {
      if (!selectedFriend) return;
      const isHead = Math.random() < 0.5;
      const outcome = isHead ? 'head' : 'tails';
      const extraTurns = 5 + Math.floor(Math.random() * 3);
      const targetDeg = (extraTurns * 360) + (isHead ? 0 : 180);

      await spinCoinAnimation(outcome, targetDeg, true);

      const p1Won = chosenSide === outcome;
      const winnerId = p1Won ? currentUser.id : selectedFriend.id;

      // Record duel result in database (The Tab / Swishlistan settlement)
      try {
        const duelRes = await createDuel({
          gameType: 'coin',
          opponentId: selectedFriend.id,
          stakeAmount: currentStake,
          mode: 'table'
        });
        if (duelRes?.duel?.id) {
          const finished = await submitDuelRoll(duelRes.duel.id, {
            creatorScore: p1Won ? 1 : 0,
            opponentScore: p1Won ? 0 : 1,
            winnerId
          });
          if (finished?.duel) {
            handleDuelFinished(finished.duel);
            return;
          }
        }
      } catch (e) {
        console.error('Failed to log coin duel:', e);
      }

      handleDuelFinished({
        creator_id: currentUser?.id,
        opponent_id: selectedFriend.id,
        creator_score: p1Won ? 1 : 0,
        opponent_score: p1Won ? 0 : 1,
        winner_id: winnerId
      });
      return;
    }

    // 3. SWISH MODE - ONLINE (Live 1v1 Utmaning)
    if (swishSubMode === 'online') {
      if (!selectedFriend) return;

      // If duel hasn't been sent yet, create challenge
      if (!activeDuel || activeDuel.status !== 'active') {
        flipBtn.disabled = true;
        flipBtn.textContent = isEn ? 'Sending challenge...' : 'Skickar utmaning...';
        try {
          const res = await createDuel({
            gameType: 'coin',
            opponentId: selectedFriend.id,
            stakeAmount: currentStake,
            mode: 'online'
          });
          activeDuel = res.duel;
          banner.innerHTML = isEn
            ? `⏳ Challenge sent to <b>${escapeHtml(selectedFriend.nickname)}</b>! Waiting for acceptance...`
            : `⏳ Utmaning skickad till <b>${escapeHtml(selectedFriend.nickname)}</b>! Väntar på godkännande...`;
          banner.style.color = 'var(--gold)';
          flipBtn.textContent = isEn ? 'Waiting for opponent...' : 'Väntar på motståndaren...';
          connectDuelWs(activeDuel.id);
        } catch (err) {
          showToast(isEn ? 'Failed to send challenge' : 'Kunde inte skicka utmaningen', 'error');
          flipBtn.disabled = false;
          updateButtonState();
        }
        return;
      }

      // If duel is active, trigger the flip!
      const isHead = Math.random() < 0.5;
      const outcome = isHead ? 'head' : 'tails';
      const extraTurns = 5 + Math.floor(Math.random() * 3);
      const targetDeg = (extraTurns * 360) + (isHead ? 0 : 180);

      // Broadcast flip animation live to opponent
      if (duelWs && duelWs.readyState === WebSocket.OPEN) {
        duelWs.send(JSON.stringify({
          type: 'duel_live_flip',
          duelId: activeDuel.id,
          outcome,
          targetDeg
        }));
      }

      await spinCoinAnimation(outcome, targetDeg, true);

      const creatorWon = chosenSide === outcome;
      const winnerId = creatorWon ? activeDuel.creator_id : activeDuel.opponent_id;

      try {
        await submitDuelRoll(activeDuel.id, {
          creatorScore: creatorWon ? 1 : 0,
          opponentScore: creatorWon ? 0 : 1,
          winnerId
        });
      } catch (err) {
        console.error('Failed to submit online coin duel:', err);
      }
    }
  });
}

// ────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────
// 🎰 GAME 2: ENARMAD BANDIT (Vegas 777 Slots)
// ────────────────────────────────────────────────────────
function openSlotsModal() {
  const isEn = getLang() === 'en';
  const symbols = ['🍒', '🍋', '🍺', '🔔', '💎', '7️⃣', 'MALTA'];
  let currentChips = getChips();
  let currentBet = 10;
  let isSpinning = false;

  function formatSymbol(symbol) {
    if (symbol === 'MALTA') {
      return `<img src="/chip-malta.png" alt="Malta Betting" class="slot-chip-img" />`;
    }
    return symbol;
  }

  const slotsTitleHtml = `<img src="/slots-machine.png" alt="Slots" style="width: 24px; height: 24px; vertical-align: -4px; margin-right: 6px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));" />${t('arcade.slotsTitle').replace('🎰', '').trim()}`;
  showModal(slotsTitleHtml, `
    <div class="text-center" style="padding: var(--space-xs) 0;">
      <!-- Chips & Bet Bar -->
      <div class="flex-between mb-sm" style="align-items: center; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: var(--radius-md);">
        <div>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${t('arcade.slotsChips')}</span>
          <span class="text-gold font-bold" id="slot-chips-display" style="font-size: 1rem; margin-left: 4px;">💰 ${currentChips}</span>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" id="btn-refill-chips" style="font-size: 0.7rem; padding: 2px 8px;">
          ${t('arcade.slotsRefill')}
        </button>
      </div>

      <!-- Slots Cabinet -->
      <div class="slots-cabinet mb-md">
        <div class="slots-window">
          <div class="slot-reel" id="reel-1"><div class="slot-symbol-wrap">${formatSymbol('MALTA')}</div></div>
          <div class="slot-reel" id="reel-2"><div class="slot-symbol-wrap">7️⃣</div></div>
          <div class="slot-reel" id="reel-3"><div class="slot-symbol-wrap">${formatSymbol('MALTA')}</div></div>
        </div>
      </div>

      <!-- Result Banner -->
      <div id="slot-banner" class="mb-md" style="font-family: var(--font-heading); font-size: 1rem; font-weight: 700; min-height: 24px; color: var(--gold);">
        ${t('arcade.slotsPrompt')}
      </div>

      <!-- Bet Selector -->
      <div class="flex gap-xs mb-md" style="justify-content: center; align-items: center;">
        <span style="font-size: 0.75rem; color: var(--text-muted); margin-right: 4px;">${t('arcade.slotsBet')}</span>
        <button type="button" class="btn btn-secondary btn-sm slot-bet-btn active" data-bet="10" style="border-color: var(--gold);">10</button>
        <button type="button" class="btn btn-secondary btn-sm slot-bet-btn" data-bet="25">25</button>
        <button type="button" class="btn btn-secondary btn-sm slot-bet-btn" data-bet="50">50</button>
      </div>

      <!-- Spin Button -->
      <button type="button" class="btn btn-primary btn-block" id="btn-slot-spin" style="font-size: 1.1rem; padding: 14px; font-weight: 800; letter-spacing: 0.05em;">
        ${t('arcade.slotsBtn')}
      </button>

      <!-- Paytable note -->
      <div class="text-muted mt-sm" style="font-size: 0.7rem; display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap;">
        <span style="color: var(--gold); font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
          <img src="/chip-malta.png" style="width: 14px; height: 14px; object-fit: contain;" /> x3 Jackpot 50x
        </span> · 
        <span>7️⃣7️⃣7️⃣ 30x</span> · 
        <span>${isEn ? '3 of a kind 15x' : '3 lika 15x'}</span> · 
        <span>${isEn ? 'Pair 3-5x' : '2 lika 3-5x'}</span>
      </div>
    </div>
  `);

  const chipsDisplay = document.getElementById('slot-chips-display');
  const banner = document.getElementById('slot-banner');
  const spinBtn = document.getElementById('btn-slot-spin');
  const refillBtn = document.getElementById('btn-refill-chips');
  const reels = [
    document.getElementById('reel-1'),
    document.getElementById('reel-2'),
    document.getElementById('reel-3')
  ];

  // Bet buttons
  document.querySelectorAll('.slot-bet-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.slot-bet-btn').forEach(b => {
        b.classList.remove('active');
        b.style.borderColor = '';
      });
      btn.classList.add('active');
      btn.style.borderColor = 'var(--gold)';
      currentBet = parseInt(btn.dataset.bet, 10);
    });
  });

  // Refill chips
  refillBtn?.addEventListener('click', () => {
    currentChips += 100;
    setChips(currentChips);
    chipsDisplay.textContent = `💰 ${currentChips}`;
    banner.textContent = t('arcade.slotsRefilled');
  });

  // Spin
  spinBtn?.addEventListener('click', () => {
    if (isSpinning) return;
    if (currentChips < currentBet) {
      banner.textContent = t('arcade.slotsOutOfChips');
      banner.style.color = '#ef4444';
      return;
    }

    currentChips -= currentBet;
    setChips(currentChips);
    chipsDisplay.textContent = `💰 ${currentChips}`;

    isSpinning = true;
    spinBtn.disabled = true;
    banner.textContent = t('arcade.slotsSpinning');
    banner.style.color = 'var(--text-secondary)';

    // Start spin animation
    reels.forEach(r => r.classList.add('spinning'));

    // Sound intervals while spinning
    const spinAudioInterval = setInterval(playTickSound, 120);

    // Results
    const finalSymbols = [
      symbols[Math.floor(Math.random() * symbols.length)],
      symbols[Math.floor(Math.random() * symbols.length)],
      symbols[Math.floor(Math.random() * symbols.length)]
    ];

    // Staggered stop
    setTimeout(() => {
      stopReel(0, finalSymbols[0]);
    }, 700);

    setTimeout(() => {
      stopReel(1, finalSymbols[1]);
    }, 1100);

    setTimeout(() => {
      stopReel(2, finalSymbols[2]);
      clearInterval(spinAudioInterval);
      evaluateSlotWin(finalSymbols);
      isSpinning = false;
      spinBtn.disabled = false;
    }, 1500);
  });

  function stopReel(index, symbol) {
    reels[index].classList.remove('spinning');
    reels[index].querySelector('.slot-symbol-wrap').innerHTML = formatSymbol(symbol);
    playTone(300 + index * 100, 'triangle', 0.1, 0.15);
  }

  function evaluateSlotWin(results) {
    const [s1, s2, s3] = results;
    let multiplier = 0;
    let winMessage = '';

    if (s1 === s2 && s2 === s3) {
      if (s1 === 'MALTA') {
        multiplier = 50;
        winMessage = isEn 
          ? `🔥 MALTA BETTING MEGA JACKPOT! +${currentBet * multiplier} CHIPS! 🔥`
          : `🔥 MALTA BETTING MEGA JACKPOT! +${currentBet * multiplier} MARKER! 🔥`;
      } else if (s1 === '7️⃣') {
        multiplier = 30;
        winMessage = isEn
          ? `7️⃣ 7️⃣ 7️⃣ VEGAS JACKPOT! +${currentBet * multiplier} CHIPS! 🎉`
          : `7️⃣ 7️⃣ 7️⃣ VEGAS JACKPOT! +${currentBet * multiplier} MARKER! 🎉`;
      } else {
        multiplier = 15;
        winMessage = isEn
          ? `🎉 3 OF A KIND! 3x ${s1}! +${currentBet * multiplier} CHIPS!`
          : `🎉 TRIPLAR! 3x ${s1}! +${currentBet * multiplier} MARKER!`;
      }
    } else if (s1 === s2 || s2 === s3 || s1 === s3) {
      const match = (s1 === s2) ? s1 : (s2 === s3 ? s2 : s1);
      multiplier = (match === 'MALTA') ? 5 : 3;
      const matchLabel = match === 'MALTA' ? (isEn ? 'Malta chips' : 'Malta-chips') : match;
      winMessage = isEn
        ? `✨ Pair of ${matchLabel}! Won +${currentBet * multiplier} chips!`
        : `✨ Par i ${matchLabel}! Vinst +${currentBet * multiplier} marker!`;
    }

    if (multiplier > 0) {
      const winAmount = currentBet * multiplier;
      currentChips += winAmount;
      setChips(currentChips);
      chipsDisplay.textContent = `💰 ${currentChips}`;
      banner.textContent = winMessage;
      banner.style.color = '#4ade80';
      playWinSound();
      if (multiplier >= 15) launchConfetti();
    } else {
      banner.textContent = t('arcade.slotsNoWin');
      banner.style.color = 'var(--text-muted)';
    }
  }
}

// ────────────────────────────────────────────────────────
// 🎡 GAME 3: LYCKOHJULET (Party & Bet Wheel)
// ────────────────────────────────────────────────────────
function openWheelModal() {
  const isEn = getLang() === 'en';
  const PALETTE = [
    '#e63946', '#f59e0b', '#10b981', '#3b82f6', 
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', 
    '#f97316', '#6366f1', '#14b8a6', '#d946ef'
  ];

  const PRESETS = {
    beer: {
      name: isEn ? 'Beer Round' : 'Vem bjuder på ölen?',
      prompt: isEn ? 'Who buys the next beer? 🍻' : 'Vem bjuder på nästa bärs? 🍻',
      items: isEn 
        ? ['Alex 🍻', 'Sam 🍺', 'Chris 🍻', 'You 🎯']
        : ['Johan 🍻', 'Sara 🍺', 'Erik 🍻', 'Du 🎯']
    },
    choice: {
      name: isEn ? 'Yes or No' : 'Ja eller Nej?',
      prompt: isEn ? 'Let the wheel decide: Yes or No? 🪙' : 'Låt hjulet avgöra: Ja eller Nej? 🪙',
      items: isEn
        ? ['YES! 🟢', 'NO! 🔴']
        : ['JA! 🟢', 'NEJ! 🔴']
    }
  };

  function getSavedWheels() {
    try {
      const raw = localStorage.getItem('betpals_saved_wheels');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function setSavedWheels(arr) {
    try {
      localStorage.setItem('betpals_saved_wheels', JSON.stringify(arr));
    } catch (e) {}
  }

  function getLastWheel() {
    try {
      const raw = localStorage.getItem('betpals_last_wheel');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveLastWheel(topic, itemsList, presetKey) {
    try {
      localStorage.setItem('betpals_last_wheel', JSON.stringify({
        topic: topic || '',
        items: itemsList || [],
        presetKey: presetKey || 'custom'
      }));
    } catch (e) {}
  }

  const lastWheel = getLastWheel();
  let activePresetKey = lastWheel?.presetKey || 'beer';
  // If user had legacy 'party' or 'food' preset saved, fallback to beer
  if (activePresetKey === 'party' || activePresetKey === 'food') {
    activePresetKey = 'beer';
  }

  let currentTopic = lastWheel?.topic !== undefined && activePresetKey !== 'party' && activePresetKey !== 'food'
    ? lastWheel.topic 
    : (isEn ? 'Beer Round' : 'Vem bjuder på ölen?');

  let items = (lastWheel && Array.isArray(lastWheel.items) && lastWheel.items.length >= 2 && activePresetKey !== 'party' && activePresetKey !== 'food')
    ? [...lastWheel.items]
    : (PRESETS[activePresetKey] ? [...PRESETS[activePresetKey].items] : [...PRESETS.beer.items]);

  let currentRotation = 0;
  let isSpinning = false;
  let userFriends = null;

  function getPromptText() {
    if (activePresetKey === 'beer') return t('arcade.wheelPromptBeer');
    if (activePresetKey === 'choice') return isEn ? 'Let the wheel decide: Yes or No? 🪙' : 'Låt hjulet avgöra: Ja eller Nej? 🪙';
    if (currentTopic) return `${t('arcade.wheelDecidePrompt')} ${currentTopic}! 🎯`;
    return t('arcade.wheelPromptBeer');
  }

  const wheelTitleHtml = `<img src="/wheel-fortune.png" alt="Wheel" style="width: 24px; height: 24px; vertical-align: -4px; margin-right: 6px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));" />${t('arcade.wheelTitle').replace('🎡', '').trim()}`;
  showModal(wheelTitleHtml, `
    <div class="text-center" style="padding: var(--space-xs) 0;">
      <!-- Preset pills -->
      <div class="wheel-preset-pills" id="wheel-presets-container"></div>

      <!-- Topic Input & Save Button -->
      <div class="flex gap-xs" style="margin-bottom: 8px; align-items: center;">
        <div style="position: relative; flex: 1;">
          <input type="text" id="wheel-topic-input" class="form-input" 
            placeholder="${t('arcade.wheelTopicPlaceholder')}" 
            value="${escapeHtml(currentTopic)}"
            maxlength="32" 
            style="padding: 7px 10px 7px 30px; font-size: 0.84rem; width: 100%; border-radius: var(--radius-sm);" />
          <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 0.85rem; pointer-events: none; opacity: 0.75;">🎯</span>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="wheel-save-preset-btn" 
          title="${t('arcade.wheelSaveBtn')}" 
          style="padding: 7px 12px; font-size: 0.8rem; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; font-weight: 700;">
          💾 <span>${isEn ? 'Save' : 'Spara'}</span>
        </button>
      </div>

      <!-- Wheel Canvas & Pointer -->
      <div class="wheel-container">
        <div class="wheel-pointer"></div>
        <canvas id="wheel-canvas" width="280" height="280" class="wheel-canvas"></canvas>
        <div class="wheel-center-hub">🎯</div>
      </div>

      <!-- Result Banner -->
      <div id="wheel-result-banner" class="mb-sm mt-xs" style="font-family: var(--font-heading); font-size: 1.05rem; font-weight: 800; min-height: 28px; color: var(--gold); padding: 0 8px;">
        ${escapeHtml(getPromptText())}
      </div>

      <!-- Spin button -->
      <button type="button" class="btn btn-primary btn-block mb-md" id="btn-spin-wheel" style="font-size: 1.1rem; padding: 12px;">
        ${t('arcade.wheelBtn')}
      </button>

      <!-- Customization Box -->
      <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-glass); border-radius: var(--radius-md); padding: 12px; text-align: left;">
        <div class="flex-between mb-xs" style="align-items: center;">
          <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">
            ${t('arcade.wheelItemsCount')} (<span id="wheel-items-count">${items.length}</span> ${isEn ? 'pcs' : 'st'})
          </span>
          <button type="button" class="btn btn-ghost btn-xs" id="wheel-clear-btn" style="color: var(--text-muted); font-size: 0.72rem; padding: 2px 6px;">
            ${t('arcade.wheelClearAll')}
          </button>
        </div>

        <!-- Tags wrap -->
        <div id="wheel-tags-wrap" class="wheel-tags-wrap" style="justify-content: flex-start; margin-bottom: 8px;"></div>

        <!-- Input & Add Controls -->
        <div class="flex gap-xs" style="margin-bottom: 8px;">
          <input type="text" id="wheel-new-item-input" class="form-input" placeholder="${t('arcade.wheelInputPlaceholder')}" maxlength="20" style="padding: 6px 10px; font-size: 0.85rem; flex: 1;" />
          <button type="button" class="btn btn-secondary btn-sm" id="wheel-add-item-btn" style="padding: 6px 12px; font-size: 0.8rem; white-space: nowrap;">
            ${t('arcade.wheelAddBtn')}
          </button>
        </div>

        <!-- Friends Quick-Picker (Directly visible) -->
        <div id="wheel-friends-drawer" style="background: rgba(0,0,0,0.35); border: 1px solid rgba(255,215,0,0.2); border-radius: var(--radius-sm); padding: 8px 10px;">
          <div class="flex-between mb-xs" style="align-items: center;">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--gold);">${t('arcade.wheelFriendsDrawerTitle')}</span>
            <button type="button" class="btn btn-ghost btn-xs" id="wheel-add-all-friends-btn" style="font-size: 0.7rem; padding: 2px 6px; color: var(--gold);">
              ${t('arcade.wheelAddAllFriendsBtn')}
            </button>
          </div>
          <div id="wheel-friends-list" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 110px; overflow-y: auto;">
            <span class="text-muted" style="font-size: 0.75rem;">${isEn ? 'Loading your friends... 👥' : 'Laddar dina vänner... 👥'}</span>
          </div>
        </div>
      </div>
    </div>
  `);

  const canvas = document.getElementById('wheel-canvas');
  const ctx = canvas.getContext('2d');
  const banner = document.getElementById('wheel-result-banner');
  const spinBtn = document.getElementById('btn-spin-wheel');
  const tagsWrap = document.getElementById('wheel-tags-wrap');
  const countSpan = document.getElementById('wheel-items-count');
  const topicInput = document.getElementById('wheel-topic-input');
  const savePresetBtn = document.getElementById('wheel-save-preset-btn');
  const itemInput = document.getElementById('wheel-new-item-input');
  const addBtn = document.getElementById('wheel-add-item-btn');
  const clearBtn = document.getElementById('wheel-clear-btn');
  const friendsDrawer = document.getElementById('wheel-friends-drawer');
  const friendsList = document.getElementById('wheel-friends-list');
  const addAllFriendsBtn = document.getElementById('wheel-add-all-friends-btn');
  const presetsContainer = document.getElementById('wheel-presets-container');

  // Render preset pills (built-in + saved custom wheels)
  function renderPresetPills() {
    const savedWheels = getSavedWheels();
    const builtIns = [
      { key: 'beer', label: isEn ? '🍻 Beer Round' : '🍻 Ölrunda' },
      { key: 'choice', label: isEn ? '🪙 Yes / No' : '🪙 Ja / Nej' }
    ];

    let html = builtIns.map(p => `
      <button type="button" class="wheel-preset-pill ${activePresetKey === p.key ? 'active' : ''}" data-preset="${p.key}">
        ${p.label}
      </button>
    `).join('');

    if (savedWheels.length > 0) {
      html += savedWheels.map(w => `
        <button type="button" class="wheel-preset-pill custom-preset ${activePresetKey === w.id ? 'active' : ''}" data-preset="${w.id}" title="${escapeHtml(w.title)}">
          ⭐ ${escapeHtml(w.title.length > 14 ? w.title.slice(0, 13) + '…' : w.title)}
          <span class="wheel-preset-del" data-del-id="${w.id}" title="${isEn ? 'Delete' : 'Ta bort'}">✕</span>
        </button>
      `).join('');
    }

    presetsContainer.innerHTML = html;

    // Attach click handlers to preset pills
    presetsContainer.querySelectorAll('.wheel-preset-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        // If delete button was clicked on a custom pill
        if (e.target.classList.contains('wheel-preset-del')) {
          e.stopPropagation();
          const delId = e.target.getAttribute('data-del-id');
          const updated = getSavedWheels().filter(w => w.id !== delId);
          setSavedWheels(updated);
          showToast(t('arcade.wheelDeletedToast'), 'info');
          if (activePresetKey === delId) {
            activePresetKey = 'beer';
            items = [...PRESETS.beer.items];
            currentTopic = isEn ? 'Beer Round' : 'Vem bjuder på ölen?';
            topicInput.value = currentTopic;
            renderTags();
            drawWheel();
            banner.textContent = getPromptText();
            banner.style.color = 'var(--gold)';
            saveLastWheel(currentTopic, items, activePresetKey);
          }
          renderPresetPills();
          return;
        }

        if (isSpinning) return;
        const presetKey = pill.getAttribute('data-preset');
        activePresetKey = presetKey;

        if (PRESETS[presetKey]) {
          items = [...PRESETS[presetKey].items];
          currentTopic = PRESETS[presetKey].name;
          topicInput.value = currentTopic;
          // If beer preset and user has friends, populate with friends
          if (presetKey === 'beer' && userFriends && userFriends.length > 0) {
            const youLabel = isEn ? 'Du 🎯' : 'Du 🎯';
            items = [...userFriends.slice(0, 10).map(f => `${f.nickname || f.realName} 🍻`), youLabel];
          }
        } else {
          // Custom saved wheel
          const saved = getSavedWheels().find(w => w.id === presetKey);
          if (saved) {
            items = [...saved.items];
            currentTopic = saved.title;
            topicInput.value = currentTopic;
          }
        }

        saveLastWheel(currentTopic, items, activePresetKey);
        renderPresetPills();
        renderTags();
        drawWheel();
        if (userFriends) renderFriendsList();
        banner.textContent = getPromptText();
        banner.style.color = 'var(--gold)';
      });
    });
  }

  // Load friends and auto-populate if on default beer preset
  getFriends().then(friends => {
    userFriends = friends || [];
    if (userFriends.length > 0 && activePresetKey === 'beer' && (!lastWheel || !lastWheel.items || lastWheel.items.length === 0)) {
      const youLabel = isEn ? 'Du 🎯' : 'Du 🎯';
      items = [...userFriends.slice(0, 10).map(f => `${f.nickname || f.realName} 🍻`), youLabel];
      renderTags();
      drawWheel();
      saveLastWheel(currentTopic, items, activePresetKey);
    }
    renderFriendsList();
  }).catch(() => {
    userFriends = [];
    renderFriendsList();
  });

  // Topic input typing handler
  topicInput?.addEventListener('input', () => {
    currentTopic = topicInput.value.trim();
    saveLastWheel(currentTopic, items, activePresetKey);
    banner.textContent = getPromptText();
    banner.style.color = 'var(--gold)';
  });

  // Save Wheel preset button
  savePresetBtn?.addEventListener('click', () => {
    if (isSpinning) return;
    const title = (topicInput.value || '').trim() || (isEn ? 'Custom Wheel' : 'Mitt hjul');
    if (items.length < 2) {
      showToast(t('arcade.wheelMinWarning'), 'warning');
      return;
    }

    const currentSaved = getSavedWheels();
    const existingIdx = currentSaved.findIndex(w => w.title.toLowerCase() === title.toLowerCase());
    const wheelId = existingIdx >= 0 ? currentSaved[existingIdx].id : 'custom_' + Date.now();
    const newWheel = {
      id: wheelId,
      title: title,
      items: [...items],
      updatedAt: Date.now()
    };

    if (existingIdx >= 0) {
      currentSaved[existingIdx] = newWheel;
    } else {
      currentSaved.unshift(newWheel);
      if (currentSaved.length > 10) currentSaved.pop(); // keep up to 10 custom wheels
    }

    setSavedWheels(currentSaved);
    activePresetKey = wheelId;
    currentTopic = title;
    saveLastWheel(currentTopic, items, activePresetKey);
    showToast(`${t('arcade.wheelSavedToast')} (${title})`, 'success');
    renderPresetPills();
    banner.textContent = getPromptText();
    banner.style.color = 'var(--gold)';
  });

  // Draw wheel on canvas
  function drawWheel() {
    const numSectors = items.length;
    ctx.clearRect(0, 0, 280, 280);

    if (numSectors === 0) {
      ctx.beginPath();
      ctx.fillStyle = '#1f2937';
      ctx.arc(140, 140, 140, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#9ca3af';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isEn ? 'Add options!' : 'Lägg till alternativ!', 140, 140);
      return;
    }

    const arc = (2 * Math.PI) / numSectors;
    const radius = 140;

    items.forEach((label, i) => {
      const angle = i * arc;
      const color = PALETTE[i % PALETTE.length];

      // Wedge slice
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.moveTo(radius, radius);
      ctx.arc(radius, radius, radius, angle, angle + arc);
      ctx.lineTo(radius, radius);
      ctx.fill();

      // Divider line
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Text label
      ctx.save();
      ctx.translate(radius, radius);
      ctx.rotate(angle + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 4;
      const fontSize = numSectors > 14 ? 10 : (numSectors > 8 ? 11 : 12);
      ctx.font = `bold ${fontSize}px sans-serif`;
      const textToDraw = label.length > 13 ? label.slice(0, 12) + '…' : label;
      ctx.fillText(textToDraw, radius - 16, 4);
      ctx.restore();
    });

    // Outer gold trim
    ctx.beginPath();
    ctx.arc(radius, radius, radius - 2, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,215,0,0.85)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // Render tag badges
  function renderTags() {
    countSpan.textContent = items.length;
    tagsWrap.innerHTML = items.map((item, idx) => `
      <span class="wheel-tag">
        ${escapeHtml(item)}
        <button type="button" class="wheel-tag-remove" data-index="${idx}" title="${isEn ? 'Remove' : 'Ta bort'}">✕</button>
      </span>
    `).join('');

    tagsWrap.querySelectorAll('.wheel-tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (isSpinning) return;
        const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        items.splice(idx, 1);
        saveLastWheel(currentTopic, items, activePresetKey);
        renderTags();
        drawWheel();
        if (userFriends) renderFriendsList();
      });
    });
  }

  // Add an item
  function addItem(rawName) {
    const name = (rawName || '').trim();
    if (!name) return;
    if (items.length >= 20) {
      showToast(isEn ? 'Max 20 options on the wheel!' : 'Max 20 alternativ på hjulet!', 'warning');
      return;
    }
    items.push(name);
    saveLastWheel(currentTopic, items, activePresetKey);
    renderTags();
    drawWheel();
    if (userFriends) renderFriendsList();
    itemInput.value = '';
    itemInput.focus();
  }

  // Render friends list directly inside picker
  function renderFriendsList() {
    if (!userFriends || userFriends.length === 0) {
      friendsList.innerHTML = `
        <div style="font-size: 0.75rem; color: var(--text-muted); padding: 4px 0; width: 100%;">
          ${isEn 
            ? '👥 No friends added yet. Add friends on your Profile page to pick them with 1 click!' 
            : '👥 Inga vänner tillagda än. Lägg till vänner på din Profilsida för att välja dem med 1 klick!'}
        </div>
      `;
      return;
    }

    friendsList.innerHTML = userFriends.map(f => {
      const name = f.nickname || f.realName || (isEn ? 'Friend' : 'Vän');
      const isAlreadyIn = items.some(it => it.toLowerCase().startsWith(name.toLowerCase()));
      return `
        <button type="button" class="wheel-friend-pick-btn" data-friend="${escapeHtml(name)}" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; border: 1px solid ${isAlreadyIn ? 'var(--gold)' : 'var(--border-glass)'}; background: ${isAlreadyIn ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.06)'}; color: ${isAlreadyIn ? 'var(--gold)' : 'var(--text-primary)'}; cursor: pointer; transition: all 0.2s;">
          ${f.avatarUrl ? `<img src="${f.avatarUrl}" style="width: 14px; height: 14px; border-radius: 50%; object-fit: cover;" />` : (f.avatarEmoji || '👤')}
          <span>${escapeHtml(name)}</span>
          <span style="font-weight: 700; margin-left: 2px;">${isAlreadyIn ? '✓' : '+'}</span>
        </button>
      `;
    }).join('');

    friendsList.querySelectorAll('.wheel-friend-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (isSpinning) return;
        const friendName = btn.getAttribute('data-friend');
        const existingIdx = items.findIndex(it => it.toLowerCase().startsWith(friendName.toLowerCase()));
        if (existingIdx >= 0) {
          items.splice(existingIdx, 1);
        } else {
          if (items.length >= 20) {
            showToast(isEn ? 'Max 20 options!' : 'Max 20 alternativ!', 'warning');
            return;
          }
          items.push(`${friendName} 🍻`);
        }
        saveLastWheel(currentTopic, items, activePresetKey);
        renderTags();
        drawWheel();
        renderFriendsList();
      });
    });
  }

  addAllFriendsBtn?.addEventListener('click', () => {
    if (!userFriends || userFriends.length === 0) return;
    let addedCount = 0;
    userFriends.forEach(f => {
      const name = f.nickname || f.realName;
      if (!name) return;
      if (!items.some(it => it.toLowerCase().startsWith(name.toLowerCase()))) {
        if (items.length < 20) {
          items.push(`${name} 🍻`);
          addedCount++;
        }
      }
    });
    if (addedCount > 0) {
      saveLastWheel(currentTopic, items, activePresetKey);
      renderTags();
      drawWheel();
      renderFriendsList();
    }
  });

  clearBtn?.addEventListener('click', () => {
    if (isSpinning) return;
    items = [];
    saveLastWheel(currentTopic, items, activePresetKey);
    renderTags();
    drawWheel();
    if (userFriends) renderFriendsList();
    banner.textContent = t('arcade.wheelEmpty');
    banner.style.color = 'var(--text-muted)';
  });

  addBtn?.addEventListener('click', () => addItem(itemInput.value));
  itemInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem(itemInput.value);
    }
  });

  // Initial renders
  renderPresetPills();
  renderTags();
  drawWheel();

  // Spin wheel handler
  spinBtn?.addEventListener('click', () => {
    if (isSpinning) return;
    if (items.length < 2) {
      showToast(t('arcade.wheelMinWarning'), 'warning');
      return;
    }

    isSpinning = true;
    spinBtn.disabled = true;
    banner.textContent = t('arcade.wheelSpinning');
    banner.style.color = 'var(--text-secondary)';

    const numSectors = items.length;
    const extraRotations = 5 + Math.floor(Math.random() * 3); // 5-7 full turns
    const winningIndex = Math.floor(Math.random() * numSectors);

    // Needle is at TOP (270 degrees)
    const arcDeg = 360 / numSectors;
    const targetSectorCenter = (winningIndex + 0.5) * arcDeg;
    const targetOffset = ((270 - targetSectorCenter) % 360 + 360) % 360;
    const nextRotation = (Math.ceil(currentRotation / 360) + extraRotations) * 360 + targetOffset;
    currentRotation = nextRotation;

    canvas.style.transform = `rotate(${nextRotation}deg)`;

    // Audio ticks during spin
    let tickCount = 0;
    const tickInterval = setInterval(() => {
      tickCount++;
      if (tickCount < 28) playTickSound();
    }, 140);

    setTimeout(() => {
      clearInterval(tickInterval);
      isSpinning = false;
      spinBtn.disabled = false;

      const winner = items[winningIndex];
      const cleanName = winner.replace(/[🍻🍺🍕🎯🪙]/g, '').trim();
      const topicLower = (currentTopic || '').toLowerCase();

      if (activePresetKey === 'beer' || (!currentTopic && (winner.includes('🍻') || winner.includes('🍺')))) {
        banner.innerHTML = isEn
          ? `🎉 <span style="color: #4ade80; font-size: 1.15rem;">${escapeHtml(cleanName)}</span> buys the next round! 🍻`
          : `🎉 <span style="color: #4ade80; font-size: 1.15rem;">${escapeHtml(cleanName)}</span> bjuder på nästa runda! 🍻`;
        playWinSound();
        launchConfetti();
      } else if (currentTopic && (activePresetKey.startsWith('custom_') || !PRESETS[activePresetKey])) {
        // Custom wheel result!
        let verb = isEn ? 'takes' : 'tar';
        let emoji = '🎯';
        if (topicLower.includes('bjuder') || topicLower.includes('middag') || topicLower.includes('middan') || topicLower.includes('lunch') || topicLower.includes('fika') || topicLower.includes('notan') || topicLower.includes('drink') || topicLower.includes('öl') || topicLower.includes('bärs')) {
          verb = isEn ? 'buys' : 'bjuder på';
          emoji = (topicLower.includes('öl') || topicLower.includes('bärs')) ? '🍻' : '🍽️';
        } else if (topicLower.includes('diska') || topicLower.includes('disken') || topicLower.includes('städ') || topicLower.includes('tvätt')) {
          verb = isEn ? 'handles' : 'fixar';
          emoji = '🧹';
        }
        banner.innerHTML = isEn
          ? `🎉 <span style="color: #4ade80; font-size: 1.15rem;">${escapeHtml(cleanName)}</span> ${verb} ${escapeHtml(currentTopic)}! ${emoji}`
          : `🎉 <span style="color: #4ade80; font-size: 1.15rem;">${escapeHtml(cleanName)}</span> ${verb} ${escapeHtml(currentTopic)}! ${emoji}`;
        playWinSound();
        launchConfetti();
      } else if (winner.includes('JACKPOT') || winner.includes('Dubbla') || winner.includes('Double')) {
        banner.innerHTML = isEn
          ? `👑 <span style="color: #fbbf24;">${escapeHtml(winner)}</span>! BIG WIN! ✨`
          : `👑 <span style="color: #fbbf24;">${escapeHtml(winner)}</span>! STORVINST! ✨`;
        playWinSound();
        launchConfetti();
      } else if (winner.includes('Nollad') || winner.includes('Bust') || winner.includes('💀')) {
        banner.innerHTML = isEn
          ? `💀 <span style="color: #ef4444;">${escapeHtml(winner)}</span>! Better luck next time!`
          : `💀 <span style="color: #ef4444;">${escapeHtml(winner)}</span>! Bättre lycka nästa gång!`;
        playTone(300, 'sawtooth', 0.25, 0.1);
      } else {
        banner.innerHTML = isEn
          ? `🎉 Result: <span style="color: #4ade80; font-size: 1.15rem;">${escapeHtml(winner)}</span>! 🎯`
          : `🎉 Resultat: <span style="color: #4ade80; font-size: 1.15rem;">${escapeHtml(winner)}</span>! 🎯`;
        playWinSound();
        launchConfetti();
      }
    }, 4500);
  });
}

// ────────────────────────────────────────────────────────
// 🎲 GAME 4: TÄRNINGSDUELL (Dice Duel & Swish Dueller)
// ────────────────────────────────────────────────────────
function renderDicePips(el, val) {
  if (!el) return;
  el.innerHTML = '';
  const pipPositions = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };
  const active = pipPositions[val] || [4];
  for (let i = 0; i < 9; i++) {
    const pip = document.createElement('div');
    if (active.includes(i)) pip.className = 'dice-pip';
    el.appendChild(pip);
  }
}

function openDiceModal(initialDuel = null) {
  const isEn = getLang() === 'en';
  const currentUser = getStoredUser();

  let activeMode = initialDuel ? 'swish' : 'dealer'; // 'dealer' | 'swish'
  let swishSubMode = initialDuel?.mode || 'table';   // 'table' | 'online'
  let currentStake = initialDuel?.stake_amount || 1;
  let selectedFriend = null;
  let userFriends = [];

  let isRolling = false;
  let wins = 0;
  let losses = 0;

  // Table mode state
  let tableTurn = 1; // 1 = player 1, 2 = player 2
  let p1Val = null;
  let p2Val = null;

  // Online duel state
  let activeDuel = initialDuel || null;
  let duelWs = null;

  function buildModalHtml() {
    return `
      <div class="text-center" style="padding: var(--space-xs) 0;">
        <!-- Mode Switcher -->
        <div class="duel-mode-bar">
          <button type="button" class="duel-mode-btn ${activeMode === 'dealer' ? 'active' : ''}" id="btn-mode-dealer">
            ${t('arcade.diceModeDealer')}
          </button>
          <button type="button" class="duel-mode-btn ${activeMode === 'swish' ? 'active' : ''}" id="btn-mode-swish">
            ${t('arcade.diceModeSwish')}
          </button>
        </div>

        <!-- Swish Config Section -->
        <div id="swish-config-box" style="display: ${activeMode === 'swish' ? 'block' : 'none'}; background: rgba(0,0,0,0.35); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-md); padding: 10px; margin-bottom: 12px; text-align: left;">
          <!-- Sub-mode toggle (Table / Online) -->
          <div class="flex gap-xs mb-xs" style="align-items: center;">
            <button type="button" class="btn btn-xs ${swishSubMode === 'table' ? 'btn-primary' : 'btn-secondary'}" id="btn-submode-table" style="font-size: 0.75rem; flex: 1;">
              ${t('arcade.diceModeTable')}
            </button>
            <button type="button" class="btn btn-xs ${swishSubMode === 'online' ? 'btn-primary' : 'btn-secondary'}" id="btn-submode-online" style="font-size: 0.75rem; flex: 1;">
              ${t('arcade.diceModeOnline')}
            </button>
          </div>

          <!-- Stake selector -->
          <div class="mb-xs">
            <div style="font-size: 0.75rem; font-weight: 700; color: #34d399; margin-bottom: 4px;">${t('arcade.diceStakeLabel')}</div>
            <div class="duel-stake-bar" style="justify-content: flex-start; margin-bottom: 6px; flex-wrap: wrap; align-items: center;">
              <button type="button" class="duel-stake-pill dice-stake-pill ${currentStake === 1 ? 'active' : ''}" data-stake="1">1 kr</button>
              <button type="button" class="duel-stake-pill dice-stake-pill ${currentStake === 5 ? 'active' : ''}" data-stake="5">5 kr</button>
              <button type="button" class="duel-stake-pill dice-stake-pill ${currentStake === 10 ? 'active' : ''}" data-stake="10">10 kr</button>
              <button type="button" class="duel-stake-pill dice-stake-pill ${currentStake === 20 ? 'active' : ''}" data-stake="20">20 kr</button>
              <div style="display: inline-flex; align-items: center; gap: 4px; margin-left: 2px;">
                <input type="number" id="dice-custom-stake-input" class="form-input" min="1" max="50000" placeholder="${isEn ? 'Custom...' : 'Valfri...'}" value="${[1, 5, 10, 20].includes(currentStake) ? '' : currentStake}" style="padding: 2px 8px; font-size: 0.76rem; width: 80px; border-radius: 12px; height: 26px;" />
                <span style="font-size: 0.72rem; color: var(--text-muted);">kr</span>
              </div>
            </div>
          </div>

          <!-- Opponent Selector -->
          <div>
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--gold); margin-bottom: 4px;">${t('arcade.dicePickFriend')}</div>
            <div id="dice-friends-list" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 85px; overflow-y: auto;">
              <span class="text-muted" style="font-size: 0.75rem;">${isEn ? 'Loading friends...' : 'Laddar vänner...'}</span>
            </div>
          </div>
        </div>

        <!-- Dice Arena -->
        <div style="display: flex; justify-content: space-around; align-items: center; margin: 12px 0;">
          <!-- Player 1 -->
          <div>
            <div style="font-weight: 700; font-size: 0.85rem; color: var(--gold); margin-bottom: 6px;" id="p1-label">
              ${activeMode === 'swish' && currentUser ? escapeHtml(currentUser.nickname || 'Du') : t('arcade.diceYou')}
            </div>
            <div class="dice-item" id="player-dice"></div>
            <div class="font-heading font-bold mt-xs" id="player-dice-score" style="font-size: 1.1rem;">6</div>
          </div>

          <div style="font-family: var(--font-heading); font-size: 1.2rem; font-weight: 900; color: var(--text-muted);">
            VS
          </div>

          <!-- Player 2 / Dealer -->
          <div>
            <div style="font-weight: 700; font-size: 0.85rem; color: #f87171; margin-bottom: 6px;" id="p2-label">
              ${activeMode === 'swish' ? (selectedFriend ? escapeHtml(selectedFriend.nickname) : (isEn ? 'Opponent' : 'Motståndare')) : t('arcade.diceDealer')}
            </div>
            <div class="dice-item red" id="dealer-dice"></div>
            <div class="font-heading font-bold mt-xs" id="dealer-dice-score" style="font-size: 1.1rem;">6</div>
          </div>
        </div>

        <!-- Result / Prompt Banner -->
        <div id="dice-banner" class="mb-sm" style="font-family: var(--font-heading); font-size: 1.05rem; font-weight: 800; min-height: 28px; color: var(--gold); padding: 0 8px;">
          ${t('arcade.dicePrompt')}
        </div>

        <!-- Swish Payout Action Box (appears after match) -->
        <div id="dice-swish-action-box" style="display: none; margin-bottom: 12px;"></div>

        <!-- Main Action Button -->
        <button type="button" class="btn btn-primary btn-block mb-sm" id="btn-roll-dice" style="font-size: 1.05rem; padding: 12px;">
          ${t('arcade.diceBtn')}
        </button>

        <!-- Footer / Scoreboard -->
        <div class="flex-between" style="padding: 6px 12px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); font-size: 0.75rem;">
          <span class="text-muted" id="dice-footer-mode">${activeMode === 'swish' ? `📱 ${isEn ? 'Swish Duel' : 'Swish-duell'}: ${currentStake} kr` : t('arcade.diceScoreboard')}</span>
          <span class="font-bold" id="dice-scoreboard">🏆 0 ${isEn ? 'wins' : 'vinster'} · 💀 0 ${isEn ? 'losses' : 'förluster'}</span>
        </div>
      </div>
    `;
  }

  const diceTitleHtml = `<img src="/dice-gold.png" alt="Dice" style="width: 22px; height: 22px; vertical-align: -3px; margin-right: 6px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));" />${t('arcade.diceTitle').replace('🎲', '').trim()}`;
  const modal = showModal(diceTitleHtml, buildModalHtml(), () => {
    if (duelWs) {
      try { duelWs.close(); } catch (e) {}
    }
  });

  const pDice = document.getElementById('player-dice');
  const dDice = document.getElementById('dealer-dice');
  const pScore = document.getElementById('player-dice-score');
  const dScore = document.getElementById('dealer-dice-score');
  const p1Label = document.getElementById('p1-label');
  const p2Label = document.getElementById('p2-label');
  const banner = document.getElementById('dice-banner');
  const rollBtn = document.getElementById('btn-roll-dice');
  const scoreboard = document.getElementById('dice-scoreboard');
  const footerMode = document.getElementById('dice-footer-mode');
  const swishBox = document.getElementById('swish-config-box');
  const swishActionBox = document.getElementById('dice-swish-action-box');
  const friendsList = document.getElementById('dice-friends-list');

  // Initial dice render
  renderDicePips(pDice, 6);
  renderDicePips(dDice, 6);

  // Load friends for Swish mode
  getFriends().then(friends => {
    userFriends = friends || [];
    if (userFriends.length > 0 && !selectedFriend) {
      selectedFriend = userFriends[0];
      if (p2Label && activeMode === 'swish') p2Label.textContent = selectedFriend.nickname;
    }
    renderFriendsPicker();
  }).catch(() => {
    userFriends = [];
    renderFriendsPicker();
  });

  function renderFriendsPicker() {
    if (!friendsList) return;
    if (userFriends.length === 0) {
      friendsList.innerHTML = `<span class="text-muted" style="font-size: 0.75rem;">${t('arcade.diceNoFriends')}</span>`;
      return;
    }

    friendsList.innerHTML = userFriends.map(f => {
      const isSelected = selectedFriend && selectedFriend.id === f.id;
      return `
        <button type="button" class="dice-friend-btn" data-id="${f.id}" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; border: 1px solid ${isSelected ? 'var(--gold)' : 'var(--border-glass)'}; background: ${isSelected ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)'}; color: ${isSelected ? 'var(--gold)' : 'var(--text-primary)'}; cursor: pointer;">
          ${f.avatarUrl ? `<img src="${f.avatarUrl}" style="width: 14px; height: 14px; border-radius: 50%; object-fit: cover;" />` : (f.avatarEmoji || '👤')}
          <span>${escapeHtml(f.nickname)}</span>
        </button>
      `;
    }).join('');

    friendsList.querySelectorAll('.dice-friend-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        selectedFriend = userFriends.find(f => f.id === id);
        p2Label.textContent = selectedFriend ? selectedFriend.nickname : 'Motståndare';
        renderFriendsPicker();
        updateButtonState();
      });
    });
  }

  // Mode togglers
  document.getElementById('btn-mode-dealer')?.addEventListener('click', () => {
    activeMode = 'dealer';
    document.getElementById('btn-mode-dealer').classList.add('active');
    document.getElementById('btn-mode-swish').classList.remove('active');
    swishBox.style.display = 'none';
    swishActionBox.style.display = 'none';
    p1Label.textContent = t('arcade.diceYou');
    p2Label.textContent = t('arcade.diceDealer');
    footerMode.textContent = t('arcade.diceScoreboard');
    banner.textContent = t('arcade.dicePrompt');
    banner.style.color = 'var(--gold)';
    rollBtn.textContent = t('arcade.diceBtn');
    rollBtn.disabled = false;
  });

  document.getElementById('btn-mode-swish')?.addEventListener('click', () => {
    if (!currentUser) {
      showToast(isEn ? 'Log in on your profile to play Swish duels!' : 'Logga in på din profil för att spela Swish-dueller!', 'warning');
      return;
    }
    activeMode = 'swish';
    document.getElementById('btn-mode-swish').classList.add('active');
    document.getElementById('btn-mode-dealer').classList.remove('active');
    swishBox.style.display = 'block';
    p1Label.textContent = currentUser.nickname || 'Du';
    p2Label.textContent = selectedFriend ? selectedFriend.nickname : (isEn ? 'Friend' : 'Kompis');
    footerMode.textContent = `📱 ${isEn ? 'Swish Duel' : 'Swish-duell'}: ${currentStake} kr`;
    updateButtonState();
  });

  document.getElementById('btn-submode-table')?.addEventListener('click', () => {
    swishSubMode = 'table';
    document.getElementById('btn-submode-table').className = 'btn btn-xs btn-primary';
    document.getElementById('btn-submode-online').className = 'btn btn-xs btn-secondary';
    updateButtonState();
  });

  document.getElementById('btn-submode-online')?.addEventListener('click', () => {
    swishSubMode = 'online';
    document.getElementById('btn-submode-online').className = 'btn btn-xs btn-primary';
    document.getElementById('btn-submode-table').className = 'btn btn-xs btn-secondary';
    updateButtonState();
  });

  // Stake pills
  const diceCustomStake = document.getElementById('dice-custom-stake-input');
  swishBox.querySelectorAll('.dice-stake-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      swishBox.querySelectorAll('.dice-stake-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentStake = parseInt(pill.getAttribute('data-stake'), 10) || 1;
      if (diceCustomStake) diceCustomStake.value = '';
      footerMode.textContent = `📱 ${isEn ? 'Swish Duel' : 'Swish-duell'}: ${currentStake} kr`;
      updateButtonState();
    });
  });

  // Custom stake input
  diceCustomStake?.addEventListener('input', () => {
    const val = parseInt(diceCustomStake.value, 10);
    if (val && val > 0) {
      currentStake = val;
      swishBox.querySelectorAll('.dice-stake-pill').forEach(p => p.classList.remove('active'));
    } else {
      currentStake = 1;
    }
    footerMode.textContent = `📱 ${isEn ? 'Swish Duel' : 'Swish-duell'}: ${currentStake} kr`;
    updateButtonState();
  });

  function updateButtonState() {
    swishActionBox.style.display = 'none';
    if (activeMode === 'dealer') {
      rollBtn.textContent = t('arcade.diceBtn');
      return;
    }
    if (!selectedFriend) {
      rollBtn.textContent = isEn ? 'Pick a friend first 👆' : 'Välj en kompis ovanför 👆';
      rollBtn.disabled = true;
      return;
    }
    rollBtn.disabled = false;
    if (swishSubMode === 'table') {
      if (tableTurn === 1) {
        rollBtn.textContent = `🎲 ${currentUser?.nickname || 'Du'}: ${isEn ? 'Roll your dice!' : 'Kasta dina tärningar!'}`;
        banner.textContent = isEn ? `${currentUser?.nickname || 'You'}, roll your dice!` : `${currentUser?.nickname || 'Du'}, kasta dina tärningar!`;
      } else {
        rollBtn.textContent = `🎲 ${selectedFriend.nickname}: ${isEn ? 'Roll dice!' : 'Kasta tärningarna!'}`;
        banner.textContent = isEn ? `${selectedFriend.nickname}'s turn to roll!` : `${selectedFriend.nickname}s tur att kasta!`;
      }
    } else {
      rollBtn.textContent = `⚔️ ${t('arcade.diceChallengeBtn')} ${selectedFriend.nickname} (${currentStake} kr)`;
      banner.textContent = isEn 
        ? `Challenge ${selectedFriend.nickname} for ${currentStake} kr via Swish!` 
        : `Utmana ${selectedFriend.nickname} om ${currentStake} kr via Swish!`;
    }
  }

  // Roll Handler
  rollBtn.addEventListener('click', async () => {
    if (isRolling) return;

    // 1. DEALER MODE
    if (activeMode === 'dealer') {
      isRolling = true;
      rollBtn.disabled = true;
      banner.textContent = t('arcade.diceRolling');
      banner.style.color = 'var(--text-secondary)';
      playDiceSound();
      pDice.classList.add('rolling');
      dDice.classList.add('rolling');

      const pVal = 1 + Math.floor(Math.random() * 6);
      const dVal = 1 + Math.floor(Math.random() * 6);

      setTimeout(() => {
        pDice.classList.remove('rolling');
        dDice.classList.remove('rolling');
        renderDicePips(pDice, pVal);
        renderDicePips(dDice, dVal);
        pScore.textContent = pVal;
        dScore.textContent = dVal;

        if (pVal > dVal) {
          wins++;
          banner.textContent = isEn ? `🎉 You won! ${pVal} to ${dVal}!` : `🎉 Du vann! ${pVal} mot ${dVal}!`;
          banner.style.color = '#4ade80';
          playWinSound();
          launchConfetti();
        } else if (pVal < dVal) {
          losses++;
          banner.textContent = isEn ? `💀 Dealer won with ${dVal} to ${pVal}!` : `💀 Dealern vann med ${dVal} mot ${pVal}!`;
          banner.style.color = '#f87171';
        } else {
          banner.textContent = isEn ? `🤝 Draw (${pVal} = ${dVal})! Roll again!` : `🤝 Oavgjort (${pVal} = ${dVal})! Kasta igen!`;
          banner.style.color = 'var(--gold)';
        }

        scoreboard.textContent = `🏆 ${wins} ${isEn ? 'wins' : 'vinster'} · 💀 ${losses} ${isEn ? 'losses' : 'förluster'}`;
        isRolling = false;
        rollBtn.disabled = false;
      }, 600);
      return;
    }

    // 2. SWISH MODE - TABLE (Samma telefon)
    if (swishSubMode === 'table') {
      if (!selectedFriend) return;
      isRolling = true;
      rollBtn.disabled = true;
      playDiceSound();

      if (tableTurn === 1) {
        // Player 1 roll
        pDice.classList.add('rolling');
        banner.textContent = isEn ? `${currentUser?.nickname || 'You'} rolling...` : `${currentUser?.nickname || 'Du'} kastar...`;
        const val1 = 1 + Math.floor(Math.random() * 6);
        setTimeout(() => {
          pDice.classList.remove('rolling');
          renderDicePips(pDice, val1);
          pScore.textContent = val1;
          p1Val = val1;
          tableTurn = 2;
          isRolling = false;
          updateButtonState();
        }, 550);
      } else {
        // Player 2 roll & Finish match!
        dDice.classList.add('rolling');
        banner.textContent = isEn ? `${selectedFriend.nickname} rolling...` : `${selectedFriend.nickname} kastar...`;
        const val2 = 1 + Math.floor(Math.random() * 6);

        setTimeout(async () => {
          dDice.classList.remove('rolling');
          renderDicePips(dDice, val2);
          dScore.textContent = val2;
          p2Val = val2;

          let winnerId = 'tie';
          if (p1Val > p2Val) winnerId = currentUser.id;
          else if (p2Val > p1Val) winnerId = selectedFriend.id;

          // Record in DB
          try {
            const duelRes = await createDuel({
              gameType: 'dice',
              opponentId: selectedFriend.id,
              stakeAmount: currentStake,
              mode: 'table'
            });
            if (duelRes?.duel?.id) {
              await submitDuelRoll(duelRes.duel.id, {
                creatorScore: p1Val,
                opponentScore: p2Val,
                winnerId
              });
            }
          } catch (e) {
            console.error('Failed to log table duel:', e);
          }

          if (winnerId === currentUser.id) {
            banner.innerHTML = isEn
              ? `🎉 <span style="color: #4ade80;">${escapeHtml(currentUser.nickname)}</span> won! ${p1Val} to ${p2Val}!`
              : `🎉 <span style="color: #4ade80;">${escapeHtml(currentUser.nickname)}</span> vann! ${p1Val} mot ${p2Val}!`;
            playWinSound();
            launchConfetti();

            swishActionBox.style.display = 'block';
            swishActionBox.innerHTML = `
              <div style="background: rgba(74,222,128,0.15); border: 1px solid rgba(74,222,128,0.3); border-radius: var(--radius-sm); padding: 10px; text-align: center;">
                <div style="font-weight: 700; color: #4ade80; font-size: 0.9rem; margin-bottom: 4px;">
                  ${selectedFriend.nickname} ${t('arcade.diceOwes')} dig ${currentStake} kr! 💰
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">
                  ${isEn ? 'Added to your Swish List!' : 'Tillagd i er gemensamma Swishlista!'}
                </div>
              </div>
            `;
          } else if (winnerId === selectedFriend.id) {
            banner.innerHTML = isEn
              ? `💀 <span style="color: #f87171;">${escapeHtml(selectedFriend.nickname)}</span> won! ${p2Val} to ${p1Val}!`
              : `💀 <span style="color: #f87171;">${escapeHtml(selectedFriend.nickname)}</span> vann! ${p2Val} mot ${p1Val}!`;

            const swishUrl = createSwishUrl({
              phone: selectedFriend.swishNumber,
              amount: currentStake,
              message: 'Betpals Tärningsduell'
            });

            swishActionBox.style.display = 'block';
            swishActionBox.innerHTML = `
              <div style="background: rgba(248,113,113,0.15); border: 1px solid rgba(248,113,113,0.3); border-radius: var(--radius-sm); padding: 10px; text-align: center;">
                <div style="font-weight: 700; color: #f87171; font-size: 0.9rem; margin-bottom: 8px;">
                  Du ${t('arcade.diceOwes')} ${selectedFriend.nickname} ${currentStake} kr!
                </div>
                <a href="${swishUrl}" class="swish-pay-btn" style="width: 100%; margin-bottom: 6px;" target="_blank" rel="noopener">
                  📱 ${isEn ? 'Swish' : 'Swisha'} ${currentStake} kr till ${escapeHtml(selectedFriend.nickname)}
                </a>
              </div>
            `;
          } else {
            banner.innerHTML = isEn
              ? `🤝 Draw (${p1Val} = ${p2Val})! Roll again!`
              : `🤝 Oavgjort (${p1Val} = ${p2Val})! Kasta igen!`;
            banner.style.color = 'var(--gold)';
          }

          // Reset turn for rematch
          tableTurn = 1;
          isRolling = false;
          rollBtn.disabled = false;
          rollBtn.textContent = `🔄 ${isEn ? 'Roll again' : 'Kasta igen'} (${currentStake} kr)`;
        }, 550);
      }
      return;
    }

    // 3. SWISH MODE - ONLINE (Live 1v1 Utmaning)
    if (swishSubMode === 'online') {
      if (!selectedFriend) return;
      rollBtn.disabled = true;
      rollBtn.textContent = isEn ? 'Sending challenge...' : 'Skickar utmaning...';
      try {
        const res = await createDuel({
          gameType: 'dice',
          opponentId: selectedFriend.id,
          stakeAmount: currentStake,
          mode: 'online'
        });
        activeDuel = res.duel;
        banner.innerHTML = isEn
          ? `⏳ Challenge sent to <b>${escapeHtml(selectedFriend.nickname)}</b>! Waiting for acceptance...`
          : `⏳ Utmaning skickad till <b>${escapeHtml(selectedFriend.nickname)}</b>! Väntar på godkännande...`;
        banner.style.color = 'var(--gold)';
        rollBtn.textContent = isEn ? 'Waiting for opponent...' : 'Väntar på motståndaren...';

        // Connect WebSocket room for this duel
        const token = getToken();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        duelWs = new WebSocket(`${protocol}//${window.location.host}?token=${token}&duel=${activeDuel.id}`);

        duelWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'duel_accepted') {
              showToast(isEn ? `${selectedFriend.nickname} accepted the duel! ⚔️` : `${selectedFriend.nickname} antog duellen! ⚔️`, 'success');
              banner.textContent = isEn ? 'Duel accepted! Tap to roll!' : 'Duell godkänd! Klicka för att kasta!';
              rollBtn.disabled = false;
              rollBtn.textContent = `🎲 ${isEn ? 'Roll your dice!' : 'Kasta dina tärningar!'}`;
            } else if (data.type === 'duel_declined') {
              banner.textContent = isEn ? 'Opponent declined the challenge.' : 'Motståndaren avböjde utmaningen.';
              banner.style.color = '#f87171';
              rollBtn.disabled = false;
              rollBtn.textContent = isEn ? 'Challenge again' : 'Utmana igen';
            } else if (data.type === 'duel_live_roll') {
              // Opponent rolled live
              dDice.classList.add('rolling');
              setTimeout(() => {
                dDice.classList.remove('rolling');
                renderDicePips(dDice, data.total);
                dScore.textContent = data.total;
              }, 500);
            } else if (data.type === 'duel_finished') {
              // Duel complete
              const d = data.duel;
              renderDicePips(pDice, d.creator_score);
              renderDicePips(dDice, d.opponent_score);
              pScore.textContent = d.creator_score;
              dScore.textContent = d.opponent_score;

              if (d.winner_id === currentUser.id) {
                banner.innerHTML = `🎉 ${isEn ? 'You won!' : 'Du vann!'} ${d.creator_score} mot ${d.opponent_score}!`;
                playWinSound();
                launchConfetti();
              } else if (d.winner_id === selectedFriend.id) {
                banner.innerHTML = `💀 ${selectedFriend.nickname} ${isEn ? 'won!' : 'vann!'} ${d.opponent_score} mot ${d.creator_score}!`;
                const swishUrl = createSwishUrl({
                  phone: selectedFriend.swishNumber,
                  amount: currentStake,
                  message: 'Betpals Tärningsduell'
                });
                swishActionBox.style.display = 'block';
                swishActionBox.innerHTML = `
                  <a href="${swishUrl}" class="swish-pay-btn" style="width: 100%;" target="_blank" rel="noopener">
                    📱 ${isEn ? 'Swish' : 'Swisha'} ${currentStake} kr till ${escapeHtml(selectedFriend.nickname)}
                  </a>
                `;
              } else {
                banner.textContent = isEn ? 'Draw! Roll again!' : 'Oavgjort! Kasta igen!';
              }
              rollBtn.disabled = false;
              rollBtn.textContent = isEn ? 'Play again' : 'Spela igen';
            }
          } catch (e) {}
        };
      } catch (err) {
        showToast(isEn ? 'Failed to send challenge' : 'Kunde inte skicka utmaningen', 'error');
        rollBtn.disabled = false;
        updateButtonState();
      }
    }
  });
}

// ────────────────────────────────────────────────────────
// ⏱️ THE BLIND 10.00 SKILLS GAME & PARTY ROOMS
// ────────────────────────────────────────────────────────
export async function openBlind10Modal(initialRoom = null) {
  const isEn = getLang() === 'en';
  const user = getStoredUser();

  let activeWs = null;
  let activeAnimationId = null;
  let activeTimeoutId = null;
  let currentRoom = initialRoom || null;
  let selectedStake = 20;
  let invitedFriendIds = new Set();
  let currentMode = initialRoom ? 'party' : 'party'; // 'party' | 'pass'
  let friendsList = [];

  function cleanup() {
    if (activeWs) {
      try {
        activeWs.send(JSON.stringify({ action: 'leave_party', partyId: currentRoom?.id }));
        activeWs.close();
      } catch (e) {}
      activeWs = null;
    }
    if (activeAnimationId) {
      cancelAnimationFrame(activeAnimationId);
      activeAnimationId = null;
    }
    if (activeTimeoutId) {
      clearTimeout(activeTimeoutId);
      activeTimeoutId = null;
    }
  }

  const modalTitle = `<img src="/stopwatch-gold.png" alt="Stopwatch" style="width: 24px; height: 24px; vertical-align: -3px; margin-right: 8px; filter: drop-shadow(0 2px 4px rgba(255,215,0,0.4));" />${t('arcade.blind10Title')}`;

  showModal(modalTitle, `
    <div id="blind10-container" style="padding: 4px 0; min-height: 380px;">
      <div class="text-center text-muted" style="padding: 40px 0;">
        <span class="spinner">⏳</span>
      </div>
    </div>
  `);

  const container = document.getElementById('blind10-container');
  if (!container) return;

  // Cleanup on modal dismiss
  const modalCloseBtn = document.querySelector('.modal-close');
  if (modalCloseBtn) {
    const origClose = modalCloseBtn.onclick;
    modalCloseBtn.onclick = (e) => {
      cleanup();
      if (origClose) origClose.call(modalCloseBtn, e);
    };
  }

  if (initialRoom) {
    setupPartyLobby(initialRoom);
  } else {
    try {
      if (user) {
        friendsList = await getFriends().catch(() => []);
      }
    } catch (e) {}
    renderSetupView();
  }

  // ── VIEW 1: SETUP VIEW (PARTY OR PASS & PLAY) ─────────
  function renderSetupView() {
    cleanup();

    container.innerHTML = `
      <div class="the-tab-nav" style="margin-bottom: 14px;">
        <button type="button" class="tab-nav-btn ${currentMode === 'party' ? 'active' : ''}" id="btn-mode-party">
          🌐 ${t('arcade.blind10ModeParty')}
        </button>
        <button type="button" class="tab-nav-btn ${currentMode === 'pass' ? 'active' : ''}" id="btn-mode-pass">
          🍻 ${t('arcade.blind10ModePass')}
        </button>
      </div>

      <!-- Quick How-To Card -->
      <div style="background: rgba(255,255,255,0.04); border: 1px solid var(--border-glass); border-radius: var(--radius-md); padding: 12px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px;">
        <img src="/stopwatch-gold.png" alt="Stopwatch" style="width: 44px; height: 44px; flex-shrink: 0; filter: drop-shadow(0 2px 6px rgba(255,215,0,0.3));" />
        <div style="font-size: 0.85rem; line-height: 1.4; color: var(--text-secondary);">
          ${t('arcade.blind10Desc')}
        </div>
      </div>

      ${currentMode === 'party' ? renderPartySetupHtml() : renderPassSetupHtml()}
    `;

    // Tab mode switch listeners
    document.getElementById('btn-mode-party')?.addEventListener('click', () => {
      currentMode = 'party';
      renderSetupView();
    });
    document.getElementById('btn-mode-pass')?.addEventListener('click', () => {
      currentMode = 'pass';
      renderSetupView();
    });

    // Attach sub-listeners
    if (currentMode === 'party') {
      attachPartySetupListeners();
    } else {
      attachPassSetupListeners();
    }
  }

  // ── PARTY SETUP HTML ─────────────────────────────────
  function renderPartySetupHtml() {
    if (!user) {
      return `
        <div class="text-center" style="padding: 24px 12px;">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">🔐</div>
          <p class="text-muted mb-md">${isEn ? 'Log in to create party rooms and challenge friends on their own phones.' : 'Logga in för att skapa partyrum och utmana vänner på deras egna mobiler.'}</p>
          <button type="button" class="btn btn-secondary btn-block" id="btn-switch-to-pass">
            🍻 ${isEn ? 'Play Pass & Play instead' : 'Kör på samma telefon istället'}
          </button>
        </div>
      `;
    }

    const friendsHtml = friendsList && friendsList.length > 0 ? `
      <div style="margin-bottom: 16px;">
        <label class="form-label" style="font-size: 0.85rem; margin-bottom: 8px; display: block;">
          👥 ${t('arcade.blind10InviteFriends')} (${isEn ? 'optional' : 'valfritt'}):
        </label>
        <div style="max-height: 130px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px;">
          ${friendsList.map(f => `
            <label style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-sm); cursor: pointer;">
              <span style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem;">
                <span style="font-size: 1.1rem;">${f.avatar_emoji || '👤'}</span>
                <strong>${escapeHtml(f.nickname)}</strong>
              </span>
              <input type="checkbox" class="friend-invite-cb" value="${f.id}" ${invitedFriendIds.has(f.id) ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--gold);" />
            </label>
          `).join('')}
        </div>
      </div>
    ` : '';

    return `
      <!-- Stake Selector -->
      <div style="margin-bottom: 16px;">
        <label class="form-label" style="font-size: 0.85rem; margin-bottom: 8px; display: block;">
          💰 ${t('arcade.blind10StakeLabel')}
        </label>
        <div class="flex gap-xs" style="flex-wrap: wrap;">
          <button type="button" class="btn ${selectedStake === 0 ? 'btn-primary' : 'btn-secondary'} btn-sm party-stake-btn" data-stake="0">0 kr (Ära)</button>
          <button type="button" class="btn ${selectedStake === 10 ? 'btn-primary' : 'btn-secondary'} btn-sm party-stake-btn" data-stake="10">10 kr</button>
          <button type="button" class="btn ${selectedStake === 20 ? 'btn-primary' : 'btn-secondary'} btn-sm party-stake-btn" data-stake="20">20 kr</button>
          <button type="button" class="btn ${selectedStake === 50 ? 'btn-primary' : 'btn-secondary'} btn-sm party-stake-btn" data-stake="50">50 kr</button>
          <button type="button" class="btn ${![0, 10, 20, 50].includes(selectedStake) ? 'btn-primary' : 'btn-secondary'} btn-sm party-stake-btn" data-stake="custom">
            ${![0, 10, 20, 50].includes(selectedStake) ? `${selectedStake} kr` : 'Valfritt'}
          </button>
        </div>
        <div id="custom-stake-wrap" style="display: ${![0, 10, 20, 50].includes(selectedStake) ? 'block' : 'none'}; margin-top: 8px;">
          <input type="number" id="custom-stake-input" class="form-input" placeholder="Ange belopp i kr" value="${selectedStake || 30}" min="1" max="1000" style="padding: 8px 12px; font-size: 0.9rem;" />
        </div>
      </div>

      ${friendsHtml}

      <button type="button" class="btn btn-primary btn-block mb-lg" id="btn-create-party" style="padding: 14px; font-weight: 700; font-size: 1rem; background: linear-gradient(135deg, #f59e0b, #d97706); border: none; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4);">
        ${t('arcade.blind10CreateRoomBtn')}
      </button>

      <!-- Join with code section -->
      <div style="position: relative; text-align: center; margin: 18px 0 14px 0;">
        <hr style="border: 0; border-top: 1px solid var(--border-glass);" />
        <span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #14141e; padding: 0 10px; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">
          ${isEn ? 'or join with code' : 'eller gå med via kod'}
        </span>
      </div>

      <div class="flex gap-sm">
        <input type="text" id="party-join-code" class="form-input" placeholder="KOD (T.EX. AB12)" maxlength="6" style="text-transform: uppercase; font-family: monospace; font-size: 1.1rem; text-align: center; font-weight: 700; letter-spacing: 3px;" />
        <button type="button" class="btn btn-secondary" id="btn-join-party" style="white-space: nowrap; padding: 0 18px; font-weight: 700;">
          ${t('arcade.blind10JoinBtn')}
        </button>
      </div>
    `;
  }

  function attachPartySetupListeners() {
    document.getElementById('btn-switch-to-pass')?.addEventListener('click', () => {
      currentMode = 'pass';
      renderSetupView();
    });

    // Stake selector buttons
    container.querySelectorAll('.party-stake-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.stake;
        if (val === 'custom') {
          selectedStake = parseInt(document.getElementById('custom-stake-input')?.value, 10) || 30;
          document.getElementById('custom-stake-wrap').style.display = 'block';
        } else {
          selectedStake = parseInt(val, 10);
          document.getElementById('custom-stake-wrap').style.display = 'none';
        }
        container.querySelectorAll('.party-stake-btn').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
      });
    });

    document.getElementById('custom-stake-input')?.addEventListener('input', (e) => {
      selectedStake = Math.max(1, parseInt(e.target.value, 10) || 1);
    });

    // Friend checkboxes
    container.querySelectorAll('.friend-invite-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          invitedFriendIds.add(cb.value);
        } else {
          invitedFriendIds.delete(cb.value);
        }
      });
    });

    // Create room button
    document.getElementById('btn-create-party')?.addEventListener('click', async () => {
      const createBtn = document.getElementById('btn-create-party');
      if (createBtn) createBtn.disabled = true;
      try {
        const res = await createPartyRoom({
          gameType: 'blind10',
          stakeAmount: selectedStake
        });

        if (res && res.room) {
          currentRoom = res.room;
          if (invitedFriendIds.size > 0) {
            try {
              await inviteToParty(currentRoom.id, Array.from(invitedFriendIds));
              showToast(isEn ? 'Invites sent to friends!' : 'Inbjudningar skickade!', 'success');
            } catch (e) {}
          }
          setupPartyLobby(currentRoom);
        }
      } catch (err) {
        showToast(err.message || (isEn ? 'Failed to create party room' : 'Kunde inte skapa partyrum'), 'error');
        if (createBtn) createBtn.disabled = false;
      }
    });

    // Join room button
    document.getElementById('btn-join-party')?.addEventListener('click', async () => {
      const codeInput = document.getElementById('party-join-code');
      const code = (codeInput?.value || '').trim().toUpperCase();
      if (!code) {
        showToast(isEn ? 'Please enter a 4-letter room code' : 'Ange en 4-siffrig rumskod', 'warning');
        return;
      }

      try {
        const res = await joinPartyRoom({ code });
        if (res && res.room) {
          currentRoom = res.room;
          setupPartyLobby(currentRoom);
        }
      } catch (err) {
        showToast(err.message || (isEn ? 'Room not found or game in progress' : 'Hittade inte rummet eller spelet har startat'), 'error');
      }
    });
  }

  // ── PASS & PLAY SETUP HTML & LISTENERS ────────────────
  let passPlayers = [
    user ? user.nickname : (isEn ? 'Player 1' : 'Spelare 1'),
    isEn ? 'Player 2' : 'Spelare 2'
  ];

  function renderPassSetupHtml() {
    return `
      <!-- Stake Selector -->
      <div style="margin-bottom: 16px;">
        <label class="form-label" style="font-size: 0.85rem; margin-bottom: 8px; display: block;">
          💰 ${t('arcade.blind10StakeLabel')}
        </label>
        <div class="flex gap-xs" style="flex-wrap: wrap;">
          <button type="button" class="btn ${selectedStake === 0 ? 'btn-primary' : 'btn-secondary'} btn-sm pass-stake-btn" data-stake="0">0 kr (Ära)</button>
          <button type="button" class="btn ${selectedStake === 10 ? 'btn-primary' : 'btn-secondary'} btn-sm pass-stake-btn" data-stake="10">10 kr</button>
          <button type="button" class="btn ${selectedStake === 20 ? 'btn-primary' : 'btn-secondary'} btn-sm pass-stake-btn" data-stake="20">20 kr</button>
          <button type="button" class="btn ${selectedStake === 50 ? 'btn-primary' : 'btn-secondary'} btn-sm pass-stake-btn" data-stake="50">50 kr</button>
        </div>
      </div>

      <!-- Player List -->
      <div style="margin-bottom: 16px;">
        <label class="form-label" style="font-size: 0.85rem; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span>👥 ${isEn ? 'Players taking turns' : 'Deltagare (turas om)'}:</span>
          <span style="font-weight: normal; color: var(--text-muted); font-size: 0.75rem;">${passPlayers.length}/8</span>
        </label>
        <div id="pass-players-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px;">
          ${passPlayers.map((p, idx) => `
            <div class="flex gap-xs align-center">
              <span style="font-weight: 700; color: var(--gold); min-width: 22px;">#${idx + 1}</span>
              <input type="text" class="form-input pass-player-input" data-idx="${idx}" value="${escapeHtml(p)}" placeholder="Spelarnamn" style="padding: 8px 12px; font-size: 0.88rem;" />
              ${passPlayers.length > 2 ? `
                <button type="button" class="btn btn-secondary btn-sm pass-remove-btn" data-idx="${idx}" style="padding: 6px 10px; color: #ef4444;">✕</button>
              ` : ''}
            </div>
          `).join('')}
        </div>
        ${passPlayers.length < 8 ? `
          <button type="button" class="btn btn-secondary btn-sm" id="btn-add-pass-player" style="font-size: 0.8rem; width: 100%;">
            ➕ ${isEn ? 'Add Player' : 'Lägg till spelare'}
          </button>
        ` : ''}
      </div>

      <button type="button" class="btn btn-primary btn-block" id="btn-start-pass-play" style="padding: 14px; font-weight: 700; font-size: 1rem; background: linear-gradient(135deg, #10b981, #059669); border: none; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);">
        🚀 ${isEn ? 'Start Pass & Play Challenge!' : 'Starta tävlingen på telefonen!'}
      </button>
    `;
  }

  function attachPassSetupListeners() {
    container.querySelectorAll('.pass-stake-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedStake = parseInt(btn.dataset.stake, 10) || 0;
        container.querySelectorAll('.pass-stake-btn').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
      });
    });

    container.querySelectorAll('.pass-player-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(inp.dataset.idx, 10);
        passPlayers[idx] = e.target.value;
      });
    });

    container.querySelectorAll('.pass-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        passPlayers.splice(idx, 1);
        renderSetupView();
      });
    });

    document.getElementById('btn-add-pass-player')?.addEventListener('click', () => {
      if (passPlayers.length < 8) {
        passPlayers.push(`${isEn ? 'Player' : 'Spelare'} ${passPlayers.length + 1}`);
        renderSetupView();
      }
    });

    document.getElementById('btn-start-pass-play')?.addEventListener('click', () => {
      const cleanPlayers = passPlayers.map(p => (p || '').trim()).filter(Boolean);
      if (cleanPlayers.length < 2) {
        showToast(isEn ? 'At least 2 players are required' : 'Minst 2 spelare krävs', 'warning');
        return;
      }
      passPlayers = cleanPlayers;
      startPassAndPlayRun(passPlayers, selectedStake);
    });
  }

  // ── VIEW 2: PARTY LOBBY (WEBSOCKET REALTIME) ─────────
  function setupPartyLobby(room) {
    currentRoom = room;
    cleanup();

    // Establish WebSocket for live room events
    const token = getToken();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?token=${token || ''}&party=${room.id}`;

    try {
      activeWs = new WebSocket(wsUrl);
      activeWs.onopen = () => {
        activeWs.send(JSON.stringify({ action: 'join_party', partyId: room.id }));
      };
      activeWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handlePartyWsMessage(data);
        } catch (e) {}
      };
      activeWs.onclose = () => {
        activeWs = null;
      };
    } catch (e) {}

    renderPartyLobbyView();
  }

  function handlePartyWsMessage(data) {
    if (data.type === 'party_updated' && data.room) {
      currentRoom = data.room;
      renderPartyLobbyView();
    } else if (data.type === 'party_started' && data.room) {
      currentRoom = data.room;
      runStopwatchGame(data.countdownSec || 3, (time, diff) => {
        renderWaitingForOthers(time, diff);
      }, (time) => {
        submitPartyTime(currentRoom.id, time).catch(() => {});
      });
    } else if (data.type === 'party_player_stopped') {
      const waitingStatus = document.getElementById('party-waiting-status');
      if (waitingStatus) {
        waitingStatus.textContent = `${data.stoppedCount} / ${data.totalCount} ${isEn ? 'finished' : 'har stannat'}`;
      }
    } else if (data.type === 'party_results' && data.room) {
      currentRoom = data.room;
      renderPartyResultsView(data.room, data.isTie, data.tiedPlayerIds);
    } else if (data.type === 'party_sudden_death_start' && data.room) {
      currentRoom = data.room;
      runStopwatchGame(data.countdownSec || 3, (time, diff) => {
        renderWaitingForOthers(time, diff);
      }, (time) => {
        submitPartyTime(currentRoom.id, time).catch(() => {});
      });
    }
  }

  function renderPartyLobbyView() {
    if (!currentRoom) return;
    const isHost = user && currentRoom.hostId === user.id;
    const totalPot = currentRoom.stakeAmount * (currentRoom.players ? currentRoom.players.length : 0);

    container.innerHTML = `
      <div class="text-center" style="margin-bottom: 14px;">
        <img src="/stopwatch-gold.png" alt="Stopwatch" style="width: 64px; height: 64px; margin: 0 auto 10px auto; display: block; filter: drop-shadow(0 4px 14px rgba(255,215,0,0.45));" />
        <div style="background: rgba(255, 215, 0, 0.08); border: 2px dashed var(--gold); border-radius: var(--radius-lg); padding: 14px 10px; margin-bottom: 12px;">
          <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">
            ${t('arcade.blind10CodePrompt')}
          </div>
          <div style="font-size: 2.4rem; font-weight: 900; letter-spacing: 6px; color: var(--gold); font-family: monospace; margin: 4px 0;">
            ${currentRoom.code}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-copy-party-code" style="font-size: 0.8rem; padding: 4px 14px;">
            📋 ${isEn ? 'Copy Room Code' : 'Kopiera rumskod'}
          </button>
        </div>

        <div class="flex justify-between align-center" style="background: rgba(255,255,255,0.04); border-radius: var(--radius-md); padding: 8px 14px; margin-bottom: 14px; border: 1px solid var(--border-glass);">
          <span style="font-size: 0.85rem; color: var(--text-secondary);">
            ${isEn ? 'Stake per person' : 'Insats/pers'}: <strong>${currentRoom.stakeAmount} kr</strong>
          </span>
          <span style="font-size: 0.88rem; font-weight: 700; color: #10b981;">
            💰 ${t('arcade.blind10TotalPot')} ${totalPot} kr
          </span>
        </div>
      </div>

      <!-- Player List -->
      <div style="margin-bottom: 18px;">
        <div style="font-size: 0.85rem; font-weight: 700; margin-bottom: 8px; color: var(--text-muted);">
          👥 ${t('arcade.blind10PlayersJoined')} (${currentRoom.players ? currentRoom.players.length : 0}):
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${(currentRoom.players || []).map(p => `
            <div class="party-player-chip ${p.isHost ? 'host' : ''}">
              <span>${p.avatarEmoji || (p.isHost ? '👑' : '👤')}</span>
              <span>${escapeHtml(p.nickname)}</span>
              ${p.isHost ? `<span style="font-size: 0.7rem; opacity: 0.8;">(${isEn ? 'Host' : 'Värd'})</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Action Area -->
      ${isHost ? `
        <button type="button" class="btn btn-primary btn-block mb-md" id="btn-start-party-game" style="padding: 16px; font-size: 1.05rem; font-weight: 800; background: linear-gradient(135deg, #10b981, #059669); border: none; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.45);">
          ${t('arcade.blind10StartGameBtn')}
        </button>
      ` : `
        <div class="text-center" style="padding: 16px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); margin-bottom: 12px;">
          <span class="spinner" style="margin-bottom: 6px;">⏳</span>
          <div style="font-size: 0.9rem; font-weight: 600; color: var(--gold);">
            ${isEn ? 'Waiting for host to start the game...' : 'Väntar på att värden ska starta spelet...'}
          </div>
        </div>
      `}

      <button type="button" class="btn btn-secondary btn-block btn-sm" id="btn-leave-party">
        🚪 ${isEn ? 'Leave Room' : 'Lämna rummet'}
      </button>
    `;

    document.getElementById('btn-copy-party-code')?.addEventListener('click', () => {
      navigator.clipboard.writeText(currentRoom.code).then(() => {
        showToast(isEn ? 'Code copied to clipboard!' : 'Rumskod kopierad!', 'success');
      }).catch(() => {
        showToast(currentRoom.code, 'info');
      });
    });

    document.getElementById('btn-start-party-game')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-start-party-game');
      if (btn) btn.disabled = true;
      try {
        await startPartyGame(currentRoom.id);
      } catch (err) {
        showToast(err.message || (isEn ? 'Failed to start game' : 'Kunde inte starta spelet'), 'error');
        if (btn) btn.disabled = false;
      }
    });

    document.getElementById('btn-leave-party')?.addEventListener('click', () => {
      cleanup();
      renderSetupView();
    });
  }

  // ── VIEW 3: COUNTDOWN & STOPWATCH CHALLENGE ───────────
  function runStopwatchGame(countdownSec, onFinished, onImmediateStop) {
    let currentCountdown = countdownSec;
    let gameStartTime = 0;
    let isStopped = false;
    let finalStoppedTime = 0;
    let finalDiff = 0;

    container.innerHTML = `
      <div id="blind10-game-screen" style="padding: 10px 0; text-align: center;">
        <div id="countdown-overlay" style="padding: 40px 0;">
          <div style="font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px;">
            ${isEn ? 'Get Ready...' : 'Gör dig redo...'}
          </div>
          <div id="countdown-digits" style="font-size: 5rem; font-weight: 900; color: var(--gold); text-shadow: 0 0 30px rgba(255,215,0,0.5);">
            ${currentCountdown}
          </div>
        </div>

        <div id="stopwatch-active-wrap" style="display: none;">
          <div class="blind10-timer-display" id="blind10-display">
            <div class="blind10-timer-digits" id="blind10-digits">00.000s</div>
            <div class="blind10-timer-hint" id="blind10-hint">
              ${isEn ? 'Clock blacks out at 03:00s!' : 'Klockan släcks vid 03:00s!'}
            </div>
          </div>

          <div style="margin-top: 26px;">
            <button type="button" class="blind10-stop-btn" id="btn-blind10-stop">
              ${t('arcade.blind10StopBtn')}
            </button>
          </div>
        </div>
      </div>
    `;

    playTone(440, 'sine', 0.2, 0.15); // Countdown 3

    const countdownInterval = setInterval(() => {
      currentCountdown--;
      const digitsEl = document.getElementById('countdown-digits');
      if (currentCountdown > 0) {
        if (digitsEl) digitsEl.textContent = currentCountdown;
        playTone(440, 'sine', 0.2, 0.15);
      } else if (currentCountdown === 0) {
        if (digitsEl) {
          digitsEl.textContent = isEn ? 'GO!' : 'KÖR!';
          digitsEl.style.color = '#10b981';
        }
        playTone(880, 'sine', 0.35, 0.25);
      } else {
        clearInterval(countdownInterval);
        startActualClock();
      }
    }, 1000);

    function startActualClock() {
      const overlay = document.getElementById('countdown-overlay');
      const activeWrap = document.getElementById('stopwatch-active-wrap');
      if (overlay) overlay.style.display = 'none';
      if (activeWrap) activeWrap.style.display = 'block';

      const displayEl = document.getElementById('blind10-display');
      const digitsEl = document.getElementById('blind10-digits');
      const hintEl = document.getElementById('blind10-hint');
      const stopBtn = document.getElementById('btn-blind10-stop');

      gameStartTime = performance.now();

      function updateClock() {
        if (isStopped) return;
        const now = performance.now();
        const elapsedSec = (now - gameStartTime) / 1000;

        if (elapsedSec >= 3.0) {
          if (!displayEl.classList.contains('blind')) {
            displayEl.classList.add('blind');
            digitsEl.innerHTML = `<span class="blind-text">👁️ BLIND MODE</span>`;
            hintEl.textContent = t('arcade.blind10BlindActive');
          }
        } else {
          digitsEl.textContent = elapsedSec.toFixed(3) + 's';
        }

        activeAnimationId = requestAnimationFrame(updateClock);
      }

      activeAnimationId = requestAnimationFrame(updateClock);

      stopBtn?.addEventListener('click', () => {
        if (isStopped) return;
        isStopped = true;
        cancelAnimationFrame(activeAnimationId);

        const stopTimeMs = performance.now();
        finalStoppedTime = Math.round(((stopTimeMs - gameStartTime) / 1000) * 1000) / 1000;
        finalDiff = Math.round(Math.abs(finalStoppedTime - 10.000) * 1000) / 1000;

        if (typeof onImmediateStop === 'function') {
          onImmediateStop(finalStoppedTime, finalDiff);
        }

        playTone(587.33, 'sine', 0.15, 0.25);
        setTimeout(() => playTone(783.99, 'sine', 0.2, 0.2), 90);

        stopBtn.disabled = true;
        displayEl.classList.remove('blind');
        digitsEl.textContent = finalStoppedTime.toFixed(3) + 's';
        const sign = finalStoppedTime >= 10.000 ? '+' : '-';
        hintEl.innerHTML = `<strong style="color: var(--gold); font-size: 1.1rem;">Diff: ${sign}${finalDiff.toFixed(3)}s</strong>`;

        activeTimeoutId = setTimeout(() => {
          onFinished(finalStoppedTime, finalDiff);
        }, 1200);
      });
    }
  }

  // ── VIEW 4: PARTY WAITING FOR OTHERS ─────────────────
  function renderWaitingForOthers(myTime, myDiff) {
    const sign = myTime >= 10.000 ? '+' : '-';
    container.innerHTML = `
      <div class="text-center" style="padding: 20px 0;">
        <img src="/stopwatch-gold.png" alt="Stopwatch" style="width: 64px; height: 64px; margin: 0 auto 10px auto; display: block; filter: drop-shadow(0 4px 14px rgba(255,215,0,0.45));" />
        <h3 style="color: var(--gold); margin-bottom: 6px;">
          ${isEn ? 'Time Logged!' : 'Tid registrerad!'}
        </h3>
        <div style="font-size: 2.2rem; font-family: monospace; font-weight: 800; color: #ffffff; margin-bottom: 4px;">
          ${myTime.toFixed(3)}s
        </div>
        <div class="badge badge-accent mb-lg" style="font-size: 0.95rem; padding: 4px 14px;">
          Diff mot 10:00: ${sign}${myDiff.toFixed(3)}s
        </div>

        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); padding: 18px; max-width: 320px; margin: 0 auto;">
          <span class="spinner" style="margin-bottom: 10px;">⏳</span>
          <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-secondary);" id="party-waiting-status">
            ${t('arcade.blind10StoppedWaiting')}
          </div>
        </div>
      </div>
    `;
  }

  // ── VIEW 5: PARTY RESULTS & PODIUM ───────────────────
  function renderPartyResultsView(room, isTie, tiedPlayerIds) {
    const isHost = user && room.hostId === user.id;
    const totalPot = room.stakeAmount * (room.players ? room.players.length : 0);

    // Tie breaker on 1st place!
    if (isTie && tiedPlayerIds && tiedPlayerIds.length > 1) {
      playTone(440, 'triangle', 0.3, 0.2);
      const tiedPlayers = room.players.filter(p => tiedPlayerIds.includes(p.id));
      const tiedNames = tiedPlayers.map(p => escapeHtml(p.nickname)).join(' & ');

      container.innerHTML = `
        <div class="text-center" style="padding: 10px 0;">
          <div style="font-size: 3.2rem; margin-bottom: 8px;">🔥</div>
          <h2 style="color: #ef4444; font-size: 1.4rem; font-weight: 800; margin-bottom: 6px;">
            ${t('arcade.blind10TieTitle')}
          </h2>
          <p style="font-size: 0.95rem; color: var(--text-secondary); max-width: 320px; margin: 0 auto 16px auto;">
            <strong>${tiedNames}</strong> ${isEn ? 'have the exact same diff!' : 'stannade med exakt samma diff!'} (${tiedPlayers[0]?.diff?.toFixed(3)}s)
          </p>

          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-md); padding: 12px; margin-bottom: 18px;">
            ${room.results.map((p, idx) => `
              <div class="blind10-podium-item ${tiedPlayerIds.includes(p.id) ? 'rank-1' : ''}">
                <div class="flex align-center gap-xs">
                  <span style="font-weight: 700; font-size: 1.1rem;">${tiedPlayerIds.includes(p.id) ? '🔥' : `#${idx + 1}`}</span>
                  <span>${p.avatarEmoji || '👤'} <strong>${escapeHtml(p.nickname)}</strong></span>
                </div>
                <div class="text-right">
                  <div style="font-family: monospace; font-weight: 700; color: #fff;">${p.stoppedTime?.toFixed(3)}s</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">Diff: ${p.diff?.toFixed(3)}s</div>
                </div>
              </div>
            `).join('')}
          </div>

          ${isHost ? `
            <div class="flex flex-col gap-sm">
              <button type="button" class="btn btn-primary btn-block" id="btn-party-sudden-death" style="padding: 14px; background: linear-gradient(135deg, #ef4444, #dc2626); border: none; font-weight: 700;">
                ${t('arcade.blind10SuddenDeathBtn')}
              </button>
              ${room.stakeAmount > 0 ? `
                <button type="button" class="btn btn-secondary btn-block" id="btn-party-split-pot" style="padding: 12px;">
                  ${t('arcade.blind10SplitPotBtn')}
                </button>
              ` : ''}
            </div>
          ` : `
            <div class="text-muted" style="font-size: 0.88rem; padding: 10px;">
              <span class="spinner">⏳</span> ${isEn ? 'Waiting for host to choose Sudden Death or Split...' : 'Väntar på att värden ska välja Sudden Death eller dela potten...'}
            </div>
          `}
        </div>
      `;

      document.getElementById('btn-party-sudden-death')?.addEventListener('click', async () => {
        try {
          await resolvePartyTie(room.id, 'sudden_death');
        } catch (e) {
          showToast(e.message || 'Kunde inte starta sudden death', 'error');
        }
      });

      document.getElementById('btn-party-split-pot')?.addEventListener('click', async () => {
        try {
          await resolvePartyTie(room.id, 'split_pot');
        } catch (e) {
          showToast(e.message || 'Kunde inte dela potten', 'error');
        }
      });

      return;
    }

    // Single winner decided!
    launchConfetti();
    playCoinSound();

    const winner = room.results && room.results[0] ? room.results[0] : room.players[0];
    const isWinner = user && winner && user.id === winner.id;
    const losers = room.players.filter(p => p.id !== winner.id);

    // Swish payment link if current user is loser and stake > 0
    const swishUrl = (!isWinner && room.stakeAmount > 0 && winner.swishNumber)
      ? createSwishUrl({ phone: winner.swishNumber, amount: room.stakeAmount, message: 'Blind 10 duell' })
      : null;

    container.innerHTML = `
      <div class="text-center" style="padding: 10px 0;">
        <div style="font-size: 3.2rem; margin-bottom: 6px;">👑</div>
        <h2 style="color: var(--gold); font-size: 1.35rem; font-weight: 800; margin-bottom: 4px;">
          ${escapeHtml(winner.nickname)} ${t('arcade.blind10WinnerWins')}
        </h2>
        ${room.stakeAmount > 0 ? `
          <div style="font-size: 1.6rem; font-weight: 900; color: #10b981; margin-bottom: 12px;">
            💰 ${totalPot} kr
          </div>
        ` : `
          <div class="badge badge-accent mb-md" style="font-size: 0.85rem; padding: 4px 14px;">
            ✨ Ren och skär ära!
          </div>
        `}

        <!-- Results Podium -->
        <div style="margin-bottom: 18px; text-align: left;">
          ${(room.results || room.players).map((p, idx) => {
            const isFirst = idx === 0;
            return `
              <div class="blind10-podium-item ${isFirst ? 'rank-1' : ''}">
                <div class="flex align-center gap-xs">
                  <span style="font-weight: 800; font-size: 1.1rem; min-width: 24px;">
                    ${isFirst ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx + 1}`))}
                  </span>
                  <span>${p.avatarEmoji || '👤'} <strong>${escapeHtml(p.nickname)}</strong></span>
                </div>
                <div class="text-right">
                  <div style="font-family: monospace; font-weight: 800; color: ${isFirst ? 'var(--gold)' : '#fff'}; font-size: 1rem;">
                    ${p.stoppedTime !== null && p.stoppedTime !== undefined ? p.stoppedTime.toFixed(3) + 's' : '-'}
                  </div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">
                    Diff: ${p.diff !== null && p.diff !== undefined ? p.diff.toFixed(3) + 's' : '-'}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- 💸 Swish Action Box -->
        ${room.stakeAmount > 0 ? (
          isWinner ? `
            <div style="background: rgba(16,185,129,0.1); border: 1px solid #10b981; border-radius: var(--radius-md); padding: 12px; margin-bottom: 16px;">
              <div style="font-weight: 700; color: #34d399; margin-bottom: 4px;">🎉 Grattis! Du är mästaren!</div>
              <div style="font-size: 0.82rem; color: var(--text-secondary);">
                ${losers.length} deltagare är skyldiga dig ${room.stakeAmount} kr vardera. Uppgörelsen är sparad i <strong>Swishlistan / Notan</strong>!
              </div>
            </div>
          ` : `
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-md); padding: 14px; margin-bottom: 16px;">
              <div style="font-size: 0.88rem; margin-bottom: 10px; color: var(--text-secondary);">
                Du förlorade mot <strong>${escapeHtml(winner.nickname)}</strong> och är skyldig <strong>${room.stakeAmount} kr</strong>.
              </div>
              ${swishUrl ? `
                <a href="${swishUrl}" class="swish-pay-btn" target="_blank" rel="noopener noreferrer" style="display: block; text-align: center; margin-bottom: 8px;">
                  💸 ${t('arcade.diceSwishNow')} (${room.stakeAmount} kr)
                </a>
              ` : `
                <div class="text-muted" style="font-size: 0.8rem;">
                  📱 Vinnarens Swish: ${winner.swishNumber ? escapeHtml(winner.swishNumber) : 'Ej angivet'}
                </div>
              `}
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 6px;">
                ✅ Skulden har automatiskt lagts till i din <strong>Notan & Swishlista</strong>.
              </div>
            </div>
          `
        ) : ''}

        <div class="flex gap-sm">
          <button type="button" class="btn btn-secondary btn-block" id="btn-party-close">
            ❌ ${isEn ? 'Close' : 'Stäng'}
          </button>
          <button type="button" class="btn btn-primary btn-block" id="btn-party-play-again" style="background: linear-gradient(135deg, #f59e0b, #d97706); border: none;">
            🔄 ${isEn ? 'Play Again' : 'Spela igen'}
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-party-close')?.addEventListener('click', () => {
      cleanup();
      closeModal();
    });

    document.getElementById('btn-party-play-again')?.addEventListener('click', () => {
      cleanup();
      renderSetupView();
    });
  }

  // ── PASS & PLAY LOGIC (SEQUENCE OF TURNS ON ONE PHONE) ─
  function startPassAndPlayRun(players, stake) {
    let playerIdx = 0;
    const results = [];

    function nextTurn() {
      if (playerIdx >= players.length) {
        finishPassAndPlayRun(results, stake);
        return;
      }

      const currentPlayer = players[playerIdx];

      container.innerHTML = `
        <div class="text-center" style="padding: 24px 0;">
          <div style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px;">
            ${isEn ? `Turn ${playerIdx + 1} of ${players.length}` : `Runda ${playerIdx + 1} av ${players.length}`}
          </div>
          <div style="font-size: 3rem; margin-bottom: 8px;">👤</div>
          <h2 style="color: var(--gold); font-size: 1.5rem; font-weight: 800; margin-bottom: 12px;">
            ${escapeHtml(currentPlayer)}
          </h2>
          <p class="text-muted mb-lg" style="max-width: 280px; margin: 0 auto 20px auto; font-size: 0.88rem;">
            ${isEn ? 'Take the phone and get ready to stop at 10.00s!' : 'Ta telefonen och gör dig redo att stanna på 10:00!'}
          </p>

          <button type="button" class="btn btn-primary btn-block" id="btn-start-single-turn" style="padding: 16px; font-size: 1.1rem; font-weight: 800; background: linear-gradient(135deg, #10b981, #059669); border: none;">
            🚀 ${isEn ? 'Start My Turn' : 'Starta min runda!'}
          </button>
        </div>
      `;

      document.getElementById('btn-start-single-turn')?.addEventListener('click', () => {
        runStopwatchGame(3, (time, diff) => {
          results.push({
            name: currentPlayer,
            stoppedTime: time,
            diff: diff
          });

          playerIdx++;
          container.innerHTML = `
            <div class="text-center" style="padding: 20px 0;">
              <div style="font-size: 2.4rem; margin-bottom: 6px;">🎯</div>
              <h3 style="color: var(--gold);">${escapeHtml(currentPlayer)}</h3>
              <div style="font-size: 2rem; font-family: monospace; font-weight: 900; margin: 8px 0;">
                ${time.toFixed(3)}s
              </div>
              <div class="badge badge-accent mb-lg" style="font-size: 0.95rem; padding: 4px 14px;">
                Diff: ${diff.toFixed(3)}s
              </div>
              <button type="button" class="btn btn-primary btn-block" id="btn-pass-continue" style="padding: 14px; font-weight: 700;">
                ${playerIdx < players.length ? `Nästa spelare (${players[playerIdx]}) ➡️` : 'Visa slutresultat! 🏆'}
              </button>
            </div>
          `;

          document.getElementById('btn-pass-continue')?.addEventListener('click', () => {
            nextTurn();
          });
        });
      });
    }

    nextTurn();
  }

  function finishPassAndPlayRun(results, stake) {
    results.sort((a, b) => a.diff - b.diff);
    const bestDiff = results[0].diff;
    const tied = results.filter(r => r.diff === bestDiff);

    if (tied.length > 1) {
      playTone(440, 'triangle', 0.3, 0.2);
      const tiedNames = tied.map(t => escapeHtml(t.name)).join(' & ');

      container.innerHTML = `
        <div class="text-center" style="padding: 10px 0;">
          <div style="font-size: 3rem; margin-bottom: 8px;">🔥</div>
          <h2 style="color: #ef4444; font-weight: 800; font-size: 1.35rem; margin-bottom: 4px;">
            ${t('arcade.blind10TieTitle')}
          </h2>
          <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 14px;">
            <strong>${tiedNames}</strong> stannade med exakt samma diff (${bestDiff.toFixed(3)}s)!
          </p>

          <div class="flex flex-col gap-sm">
            <button type="button" class="btn btn-primary btn-block" id="btn-pass-sudden-death" style="padding: 14px; background: linear-gradient(135deg, #ef4444, #dc2626); border: none; font-weight: 700;">
              ${t('arcade.blind10SuddenDeathBtn')}
            </button>
            <button type="button" class="btn btn-secondary btn-block" id="btn-pass-split-pot" style="padding: 12px;">
              ${t('arcade.blind10SplitPotBtn')}
            </button>
          </div>
        </div>
      `;

      document.getElementById('btn-pass-sudden-death')?.addEventListener('click', () => {
        startPassAndPlayRun(tied.map(t => t.name), stake);
      });

      document.getElementById('btn-pass-split-pot')?.addEventListener('click', () => {
        showFinalPassPodium(results, stake, true, tied);
      });
      return;
    }

    showFinalPassPodium(results, stake, false, []);
  }

  function showFinalPassPodium(results, stake, isSplit, tied) {
    launchConfetti();
    playCoinSound();

    const winner = results[0];
    const totalPot = stake * results.length;

    container.innerHTML = `
      <div class="text-center" style="padding: 10px 0;">
        <div style="font-size: 3.2rem; margin-bottom: 4px;">🏆</div>
        <h2 style="color: var(--gold); font-size: 1.4rem; font-weight: 800; margin-bottom: 4px;">
          ${isSplit ? `Delad seger mellan ${tied.map(t => escapeHtml(t.name)).join(' & ')}!` : `${escapeHtml(winner.name)} tar hem segern!`}
        </h2>
        ${stake > 0 ? `
          <div style="font-size: 1.6rem; font-weight: 900; color: #10b981; margin-bottom: 12px;">
            💰 Pott: ${totalPot} kr ${isSplit ? `(${Math.round(totalPot / tied.length)} kr/vinnare)` : ''}
          </div>
        ` : ''}

        <div style="margin-bottom: 16px; text-align: left;">
          ${results.map((r, idx) => `
            <div class="blind10-podium-item ${idx === 0 ? 'rank-1' : ''}">
              <div class="flex align-center gap-xs">
                <span style="font-weight: 800; font-size: 1.1rem; min-width: 24px;">
                  ${idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx + 1}`))}
                </span>
                <strong>${escapeHtml(r.name)}</strong>
              </div>
              <div class="text-right">
                <div style="font-family: monospace; font-weight: 800; color: ${idx === 0 ? 'var(--gold)' : '#fff'};">
                  ${r.stoppedTime.toFixed(3)}s
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">
                  Diff: ${r.diff.toFixed(3)}s
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="flex gap-sm">
          <button type="button" class="btn btn-secondary btn-block" id="btn-finish-pass-close">
            ❌ ${isEn ? 'Close' : 'Stäng'}
          </button>
          <button type="button" class="btn btn-primary btn-block" id="btn-finish-pass-again">
            🔄 ${isEn ? 'Play Again' : 'Ny omgång'}
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-finish-pass-close')?.addEventListener('click', () => {
      closeModal();
    });
    document.getElementById('btn-finish-pass-again')?.addEventListener('click', () => {
      renderSetupView();
    });
  }
}

// ────────────────────────────────────────────────────────
// 🔔 INCOMING PARTY INVITATION MODAL
// ────────────────────────────────────────────────────────
export function showIncomingPartyModal(room) {
  const isEn = getLang() === 'en';
  playTone(587.33, 'sine', 0.25, 0.15); // D5 chime
  setTimeout(() => playTone(880, 'sine', 0.3, 0.15), 150);

  const titleHtml = `<img src="/stopwatch-gold.png" alt="Stopwatch" style="width: 24px; height: 24px; vertical-align: -3px; margin-right: 8px; filter: drop-shadow(0 2px 4px rgba(255,215,0,0.4));" />${t('arcade.blind10Title')}`;

  showModal(titleHtml, `
    <div class="text-center" style="padding: 10px 0;">
      <img src="/stopwatch-gold.png" alt="Stopwatch" style="width: 72px; height: 72px; margin: 0 auto 12px auto; display: block; filter: drop-shadow(0 4px 16px rgba(255,215,0,0.5));" />
      <h3 style="color: var(--gold); margin-bottom: 6px; font-size: 1.2rem;">
        ${escapeHtml(room.hostNickname)} ${isEn ? 'invited you to The Blind 10.00!' : 'bjöd in dig till The Blind 10.00!'}
      </h3>
      <div class="badge badge-accent mb-md" style="font-size: 0.95rem; padding: 6px 16px;">
        ${room.stakeAmount > 0 ? `💰 ${room.stakeAmount} kr ${isEn ? 'per player' : 'per deltagare'}` : '✨ Bara ära (0 kr)'}
      </div>
      <p class="text-muted mb-lg" style="font-size: 0.85rem; max-width: 300px; margin: 0 auto 16px auto;">
        ${isEn 
          ? 'Stop the clock as close to 10.00s as possible. At 3.00s the display turns black!' 
          : 'Stanna klockan så nära 10:00.00s som möjligt. Vid 3.00s blir skärmen kolsvart!'}
      </p>

      <div class="flex gap-sm">
        <button type="button" class="btn btn-secondary btn-block" id="btn-decline-party" style="padding: 12px;">
          ❌ ${isEn ? 'Decline' : 'Neka'}
        </button>
        <button type="button" class="btn btn-primary btn-block" id="btn-accept-party" style="padding: 12px; background: linear-gradient(135deg, #10b981, #059669); border: none; font-weight: 700;">
          🚀 ${isEn ? 'Join Party' : 'Gå med i rummet'}
        </button>
      </div>
    </div>
  `);

  document.getElementById('btn-decline-party')?.addEventListener('click', () => {
    closeModal();
  });

  document.getElementById('btn-accept-party')?.addEventListener('click', async () => {
    try {
      const res = await joinPartyRoom({ roomId: room.id });
      if (res && res.room) {
        closeModal();
        openBlind10Modal(res.room);
      }
    } catch (e) {
      showToast(isEn ? 'Failed to join party room' : 'Kunde inte gå med i rummet', 'error');
    }
  });
}

// ────────────────────────────────────────────────────────
// 🤝 ANYBET (KOMPISBETTET MED GYLLENE HANDSLAG)
// ────────────────────────────────────────────────────────
export async function openAnyBetModal(initialBetId = null) {
  const isEn = getLang() === 'en';
  const user = getStoredUser();

  let activeTab = initialBetId ? 'active' : 'create'; // 'create' | 'active' | 'finished'
  let friendsList = [];
  let selectedStake = 20;
  let selectedModel = 'winner_takes_all'; // 'winner_takes_all' | 'yes_no'
  let invitedFriendIds = new Set();
  let proofImageData = null;

  const modalTitle = `<img src="/handshake-gold.png" alt="AnyBet" style="width: 26px; height: 26px; vertical-align: -4px; margin-right: 8px; filter: drop-shadow(0 2px 4px rgba(255,215,0,0.4));" />${t('arcade.anybetTitle')}`;

  showModal(modalTitle, `
    <div id="anybet-container" style="padding: 4px 0; min-height: 380px;">
      <div class="text-center text-muted" style="padding: 40px 0;">
        <span class="spinner">⏳</span>
      </div>
    </div>
  `);

  const container = document.getElementById('anybet-container');
  if (!container) return;

  try {
    if (user) {
      friendsList = await getFriends().catch(() => []);
    }
  } catch (e) {}

  renderMainView();

  function renderMainView() {
    container.innerHTML = `
      <div class="the-tab-nav" style="margin-bottom: 14px;">
        <button type="button" class="tab-nav-btn ${activeTab === 'create' ? 'active' : ''}" id="tab-anybet-create">
          ${t('arcade.anybetCreateTab')}
        </button>
        <button type="button" class="tab-nav-btn ${activeTab === 'active' ? 'active' : ''}" id="tab-anybet-active">
          ${t('arcade.anybetActiveTab')}
        </button>
        <button type="button" class="tab-nav-btn ${activeTab === 'finished' ? 'active' : ''}" id="tab-anybet-finished">
          ${t('arcade.anybetFinishedTab')}
        </button>
      </div>

      <div id="anybet-tab-content"></div>
    `;

    document.getElementById('tab-anybet-create')?.addEventListener('click', () => {
      activeTab = 'create';
      renderMainView();
    });
    document.getElementById('tab-anybet-active')?.addEventListener('click', () => {
      activeTab = 'active';
      renderMainView();
    });
    document.getElementById('tab-anybet-finished')?.addEventListener('click', () => {
      activeTab = 'finished';
      renderMainView();
    });

    const tabContent = document.getElementById('anybet-tab-content');
    if (!tabContent) return;

    if (activeTab === 'create') {
      renderCreateTab(tabContent);
    } else if (activeTab === 'active') {
      renderActiveTab(tabContent);
    } else {
      renderFinishedTab(tabContent);
    }
  }

  // ── FLIK 1: SKAPA NYTT BET ────────────────────────────
  function renderCreateTab(tabContent) {
    if (!user) {
      tabContent.innerHTML = `
        <div class="text-center" style="padding: 30px 10px;">
          <img src="/handshake-gold.png" alt="Handshake" style="width: 72px; height: 72px; margin: 0 auto 12px auto; display: block; opacity: 0.8;" />
          <h3 style="color: var(--gold); margin-bottom: 8px;">Logga in för AnyBet</h3>
          <p class="text-muted mb-lg" style="font-size: 0.9rem;">
            ${isEn ? 'Log in to create custom bets, challenge friends, and track debts in Swishlistan.' : 'Logga in för att skapa kompisbet, utmana vänner och hålla koll på skulder i Swishlistan.'}
          </p>
        </div>
      `;
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    tabContent.innerHTML = `
      <div style="background: rgba(255, 215, 0, 0.05); border: 1px solid rgba(255, 215, 0, 0.2); border-radius: var(--radius-md); padding: 12px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px;">
        <img src="/handshake-gold.png" alt="AnyBet" style="width: 48px; height: 48px; flex-shrink: 0; filter: drop-shadow(0 2px 6px rgba(255,215,0,0.3));" />
        <div style="font-size: 0.82rem; line-height: 1.4; color: var(--text-secondary);">
          ${t('arcade.anybetDesc')}
        </div>
      </div>

      <!-- 1. Vad handlar bettet om? -->
      <div style="margin-bottom: 14px;">
        <label class="form-label" style="font-size: 0.85rem; margin-bottom: 6px; display: block;">
          💬 ${isEn ? 'What is the bet about?' : 'Vad handlar bettet om?'} *
        </label>
        <input type="text" id="anybet-title-input" class="form-input" placeholder="${t('arcade.anybetTitlePlaceholder')}" maxlength="120" style="padding: 10px 12px; font-size: 0.92rem; font-weight: 600;" />
        <textarea id="anybet-desc-input" class="form-input" placeholder="${t('arcade.anybetRulesPlaceholder')}" rows="2" style="font-size: 0.82rem; resize: none; margin-top: 6px; padding: 8px 12px;"></textarea>
      </div>

      <!-- 2. Typ av bet (Vinnarpott vs Ja/Nej) -->
      <div style="margin-bottom: 14px;">
        <label class="form-label" style="font-size: 0.85rem; margin-bottom: 6px; display: block;">
          ⚖️ ${t('arcade.anybetModelLabel')}
        </label>
        <div class="flex gap-xs">
          <button type="button" class="btn ${selectedModel === 'winner_takes_all' ? 'btn-primary' : 'btn-secondary'} btn-sm btn-block anybet-model-btn" data-model="winner_takes_all" style="font-size: 0.8rem; padding: 8px 6px;">
            ${t('arcade.anybetModelWinner')}
          </button>
          <button type="button" class="btn ${selectedModel === 'yes_no' ? 'btn-primary' : 'btn-secondary'} btn-sm btn-block anybet-model-btn" data-model="yes_no" style="font-size: 0.8rem; padding: 8px 6px;">
            ${t('arcade.anybetModelYesNo')}
          </button>
        </div>
      </div>

      <!-- 3. Insats per person -->
      <div style="margin-bottom: 14px;">
        <label class="form-label" style="font-size: 0.85rem; margin-bottom: 6px; display: block;">
          💰 ${t('arcade.blind10StakeLabel')}
        </label>
        <div class="flex gap-xs" style="flex-wrap: wrap;">
          <button type="button" class="btn ${selectedStake === 0 ? 'btn-primary' : 'btn-secondary'} btn-sm anybet-stake-btn" data-stake="0">0 kr (Ära)</button>
          <button type="button" class="btn ${selectedStake === 10 ? 'btn-primary' : 'btn-secondary'} btn-sm anybet-stake-btn" data-stake="10">10 kr</button>
          <button type="button" class="btn ${selectedStake === 20 ? 'btn-primary' : 'btn-secondary'} btn-sm anybet-stake-btn" data-stake="20">20 kr</button>
          <button type="button" class="btn ${selectedStake === 50 ? 'btn-primary' : 'btn-secondary'} btn-sm anybet-stake-btn" data-stake="50">50 kr</button>
          <button type="button" class="btn ${selectedStake === 100 ? 'btn-primary' : 'btn-secondary'} btn-sm anybet-stake-btn" data-stake="100">100 kr</button>
          <button type="button" class="btn ${![0, 10, 20, 50, 100].includes(selectedStake) ? 'btn-primary' : 'btn-secondary'} btn-sm anybet-stake-btn" data-stake="custom">
            ${![0, 10, 20, 50, 100].includes(selectedStake) ? `${selectedStake} kr` : (isEn ? 'Custom' : 'Valfritt')}
          </button>
        </div>
        <div id="anybet-custom-stake-wrap" style="display: ${![0, 10, 20, 50, 100].includes(selectedStake) ? 'block' : 'none'}; margin-top: 8px;">
          <input type="number" id="anybet-custom-stake-input" class="form-input" placeholder="Ange belopp i kr" value="${selectedStake || 30}" min="1" max="10000" style="padding: 8px 12px; font-size: 0.88rem;" />
        </div>
      </div>

      <!-- 4. Slutdatum / Kalender (Valfritt) -->
      <div style="margin-bottom: 14px;">
        <label class="form-label" style="font-size: 0.85rem; margin-bottom: 6px; display: block;">
          📅 ${t('arcade.anybetDeadlineLabel')}
        </label>
        <input type="date" id="anybet-deadline-input" class="form-input" min="${todayStr}" style="padding: 8px 12px; font-size: 0.88rem;" />
      </div>

      <!-- 5. Bjud in deltagare -->
      <div style="margin-bottom: 14px;">
        <label class="form-label" style="font-size: 0.85rem; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span>👥 ${isEn ? 'Invite participants' : 'Bjud in deltagare'}:</span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${friendsList.length} ${isEn ? 'friends available' : 'vänner'}</span>
        </label>
        ${friendsList.length > 0 ? `
          <div style="max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px;">
            ${friendsList.map(f => `
              <label style="display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--radius-sm); cursor: pointer;">
                <span style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem;">
                  <span>${f.avatar_emoji || '👤'}</span>
                  <strong>${escapeHtml(f.nickname)}</strong>
                </span>
                <input type="checkbox" class="anybet-friend-cb" value="${f.id}" ${invitedFriendIds.has(f.id) ? 'checked' : ''} style="width: 17px; height: 17px; accent-color: var(--gold);" />
              </label>
            `).join('')}
          </div>
        ` : `
          <div class="text-muted" style="font-size: 0.8rem; padding: 8px 0;">
            ${isEn ? 'No friends added yet. Add friends via Profile to challenge them!' : 'Du har inga vänner tillagda än. Lägg till vänner under Profil för att utmana dem!'}
          </div>
        `}
      </div>

      <!-- 6. Vem är domare? -->
      <div style="margin-bottom: 18px;">
        <label class="form-label" style="font-size: 0.85rem; margin-bottom: 6px; display: block;">
          ⚖️ ${t('arcade.anybetJudgeLabel')}
        </label>
        <select id="anybet-judge-select" class="form-input" style="padding: 8px 12px; font-size: 0.88rem;">
          <option value="${user.id}">👑 ${isEn ? 'Me (Creator)' : 'Jag själv (Skaparen)'} – ${escapeHtml(user.nickname)}</option>
          ${friendsList.map(f => `
            <option value="${f.id}">⚖️ ${escapeHtml(f.nickname)}</option>
          `).join('')}
        </select>
      </div>

      <button type="button" class="btn btn-primary btn-block" id="btn-create-anybet-submit" style="padding: 14px; font-weight: 800; font-size: 1rem; background: linear-gradient(135deg, #f59e0b, #d97706); border: none; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4);">
        ${t('arcade.anybetCreateBtn')}
      </button>
    `;

    // Listeners for Model buttons
    tabContent.querySelectorAll('.anybet-model-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedModel = btn.dataset.model;
        tabContent.querySelectorAll('.anybet-model-btn').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
      });
    });

    // Listeners for Stake buttons
    tabContent.querySelectorAll('.anybet-stake-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.stake;
        if (val === 'custom') {
          selectedStake = parseInt(document.getElementById('anybet-custom-stake-input')?.value, 10) || 30;
          document.getElementById('anybet-custom-stake-wrap').style.display = 'block';
        } else {
          selectedStake = parseInt(val, 10);
          document.getElementById('anybet-custom-stake-wrap').style.display = 'none';
        }
        tabContent.querySelectorAll('.anybet-stake-btn').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
      });
    });

    document.getElementById('anybet-custom-stake-input')?.addEventListener('input', (e) => {
      selectedStake = Math.max(1, parseInt(e.target.value, 10) || 1);
    });

    // Friend checkboxes
    tabContent.querySelectorAll('.anybet-friend-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          invitedFriendIds.add(cb.value);
        } else {
          invitedFriendIds.delete(cb.value);
        }
      });
    });

    // Submit AnyBet
    document.getElementById('btn-create-anybet-submit')?.addEventListener('click', async () => {
      const title = (document.getElementById('anybet-title-input')?.value || '').trim();
      const description = (document.getElementById('anybet-desc-input')?.value || '').trim();
      const deadline = document.getElementById('anybet-deadline-input')?.value || null;
      const judgeId = document.getElementById('anybet-judge-select')?.value || user.id;

      if (!title) {
        showToast(isEn ? 'Please describe what the bet is about' : 'Ange vad bettet handlar om', 'warning');
        return;
      }

      const submitBtn = document.getElementById('btn-create-anybet-submit');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await createAnyBet({
          title,
          description,
          judgeId,
          stakeAmount: selectedStake,
          betType: selectedModel,
          deadline,
          participantIds: Array.from(invitedFriendIds)
        });

        if (res && res.ok) {
          showToast(isEn ? 'AnyBet created successfully!' : 'AnyBet skapat! Handslaget är slutet 🤝', 'success');
          playTone(587.33, 'sine', 0.2, 0.2);
          setTimeout(() => playTone(880, 'sine', 0.25, 0.2), 100);
          activeTab = 'active';
          renderMainView();
        }
      } catch (err) {
        showToast(err.message || (isEn ? 'Failed to create bet' : 'Kunde inte skapa bettet'), 'error');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // ── FLIK 2: AKTIVA BET ────────────────────────────────
  async function renderActiveTab(tabContent) {
    if (!user) {
      tabContent.innerHTML = `<div class="text-center text-muted" style="padding: 30px;">Logga in för att se dina aktiva AnyBets.</div>`;
      return;
    }

    tabContent.innerHTML = `
      <div class="text-center text-muted" style="padding: 30px 0;">
        <span class="spinner">⏳</span>
      </div>
    `;

    try {
      const res = await getAnyBets();
      const allBets = res.bets || [];
      const activeBets = allBets.filter(b => b.status === 'open');

      if (activeBets.length === 0) {
        tabContent.innerHTML = `
          <div class="text-center" style="padding: 30px 10px;">
            <img src="/handshake-gold.png" alt="Handshake" style="width: 60px; height: 60px; margin: 0 auto 10px auto; display: block; opacity: 0.5;" />
            <p class="text-muted" style="font-size: 0.9rem; margin-bottom: 14px;">${t('arcade.anybetNoActive')}</p>
            <button type="button" class="btn btn-primary btn-sm" id="btn-goto-create-anybet" style="background: linear-gradient(135deg, #f59e0b, #d97706); border: none;">
              ➕ ${isEn ? 'Create First Bet' : 'Skapa första kompisbettet'}
            </button>
          </div>
        `;
        document.getElementById('btn-goto-create-anybet')?.addEventListener('click', () => {
          activeTab = 'create';
          renderMainView();
        });
        return;
      }

      tabContent.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${activeBets.map(bet => {
            const isJudge = user.id === bet.judge_id || user.id === bet.creator_id;
            const myPart = (bet.participants || []).find(p => p.user_id === user.id);
            const isYesNo = bet.bet_type === 'yes_no';
            const totalPot = bet.stake_amount * (bet.participants ? bet.participants.length : 0);

            return `
              <div class="anybet-card" data-bet-id="${bet.id}">
                <div class="flex justify-between align-center" style="margin-bottom: 6px;">
                  <span class="badge ${isYesNo ? 'badge-accent' : 'badge-gold'}" style="font-size: 0.72rem; padding: 2px 8px;">
                    ${isYesNo ? '⚖️ Ja / Nej' : '🏆 Vinnarpott'}
                  </span>
                  ${bet.deadline ? `
                    <span style="font-size: 0.75rem; color: var(--text-muted);">
                      📅 ${bet.deadline}
                    </span>
                  ` : ''}
                </div>

                <h4 style="color: #fff; font-size: 1.05rem; font-weight: 700; margin-bottom: 4px;">
                  ${escapeHtml(bet.title)}
                </h4>

                ${bet.description ? `
                  <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px; line-height: 1.3;">
                    ${escapeHtml(bet.description)}
                  </p>
                ` : ''}

                <div class="flex justify-between align-center" style="background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); padding: 6px 10px; margin-bottom: 10px;">
                  <span style="font-size: 0.8rem; color: var(--text-muted);">
                    Domare: <strong>⚖️ ${escapeHtml(bet.judge_nickname || bet.creator_nickname)}</strong>
                  </span>
                  <span style="font-size: 0.85rem; font-weight: 700; color: #10b981;">
                    ${bet.stake_amount > 0 ? `💰 Pott: ${totalPot} kr` : '✨ Ren ära'}
                  </span>
                </div>

                <!-- Participants list -->
                <div style="margin-bottom: 10px;">
                  <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">👥 Deltagare (${bet.participants ? bet.participants.length : 0}):</div>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${(bet.participants || []).map(p => `
                      <span class="party-player-chip" style="font-size: 0.75rem; padding: 3px 8px;">
                        <span>${p.avatar_emoji || '👤'}</span>
                        <span>${escapeHtml(p.nickname)}</span>
                        ${isYesNo && p.choice ? `
                          <strong style="color: ${p.choice === 'yes' ? '#34d399' : '#f87171'}; margin-left: 2px;">
                            (${p.choice.toUpperCase()})
                          </strong>
                        ` : ''}
                      </span>
                    `).join('')}
                  </div>
                </div>

                <!-- Yes / No Choice Buttons for Current User if applicable -->
                ${isYesNo ? `
                  <div style="background: rgba(255,255,255,0.02); border: 1px dashed var(--border-glass); border-radius: var(--radius-sm); padding: 8px 10px; margin-bottom: 10px;">
                    <div style="font-size: 0.78rem; font-weight: 700; margin-bottom: 6px; color: var(--text-secondary);">
                      ${t('arcade.anybetPickSidePrompt')}
                    </div>
                    <div class="flex gap-xs">
                      <button type="button" class="btn ${myPart?.choice === 'yes' ? 'btn-primary' : 'btn-secondary'} btn-sm btn-block btn-pick-side" data-bet-id="${bet.id}" data-side="yes" style="${myPart?.choice === 'yes' ? 'background: #10b981; border: none;' : ''}">
                        ✅ JA ${myPart?.choice === 'yes' ? '(Valt)' : ''}
                      </button>
                      <button type="button" class="btn ${myPart?.choice === 'no' ? 'btn-primary' : 'btn-secondary'} btn-sm btn-block btn-pick-side" data-bet-id="${bet.id}" data-side="no" style="${myPart?.choice === 'no' ? 'background: #ef4444; border: none;' : ''}">
                        ❌ NEJ ${myPart?.choice === 'no' ? '(Valt)' : ''}
                      </button>
                    </div>
                  </div>
                ` : ''}

                <!-- Judge Settle Button -->
                ${isJudge ? `
                  <button type="button" class="btn btn-primary btn-block btn-sm btn-open-settle" data-bet-id="${bet.id}" style="padding: 10px; font-weight: 700; background: linear-gradient(135deg, #f59e0b, #d97706); border: none;">
                    ⚖️ ${t('arcade.anybetSettleBtn')}
                  </button>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;

      // Pick side listeners
      tabContent.querySelectorAll('.btn-pick-side').forEach(btn => {
        btn.addEventListener('click', async () => {
          const betId = btn.dataset.betId;
          const side = btn.dataset.side;
          try {
            await joinAnyBet(betId, side);
            showToast(isEn ? `You picked ${side.toUpperCase()}!` : `Du valde ${side.toUpperCase()}!`, 'success');
            renderActiveTab(tabContent);
          } catch (e) {
            showToast(e.message || 'Kunde inte välja sida', 'error');
          }
        });
      });

      // Settle button listeners
      tabContent.querySelectorAll('.btn-open-settle').forEach(btn => {
        btn.addEventListener('click', () => {
          const betId = btn.dataset.betId;
          const targetBet = activeBets.find(b => b.id === betId);
          if (targetBet) openSettleModal(targetBet);
        });
      });

    } catch (err) {
      tabContent.innerHTML = `<div class="text-danger text-center" style="padding: 20px;">${err.message || 'Kunde inte ladda bet'}</div>`;
    }
  }

  // ── FLIK 3: AVSLUTADE BET ────────────────────────────
  async function renderFinishedTab(tabContent) {
    tabContent.innerHTML = `
      <div class="text-center text-muted" style="padding: 30px 0;">
        <span class="spinner">⏳</span>
      </div>
    `;

    try {
      const res = await getAnyBets();
      const allBets = res.bets || [];
      const finishedBets = allBets.filter(b => b.status === 'completed');

      if (finishedBets.length === 0) {
        tabContent.innerHTML = `
          <div class="text-center" style="padding: 30px 10px;">
            <div style="font-size: 2.8rem; margin-bottom: 8px;">🏁</div>
            <p class="text-muted" style="font-size: 0.9rem;">${t('arcade.anybetNoFinished')}</p>
          </div>
        `;
        return;
      }

      tabContent.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${finishedBets.map(bet => {
            const isYesNo = bet.bet_type === 'yes_no';
            const winnerText = isYesNo 
              ? (bet.winning_side === 'yes' ? '✅ JA vann!' : '❌ NEJ vann!')
              : `👑 ${escapeHtml(bet.winner_nickname || 'Vinnare')} vann!`;

            const totalPot = bet.stake_amount * (bet.participants ? bet.participants.length : 0);
            const myPart = (bet.participants || []).find(p => p.user_id === user?.id);
            const amIWinner = isYesNo 
              ? (myPart?.choice === bet.winning_side)
              : (bet.winner_id === user?.id);

            const winnerUser = (bet.participants || []).find(p => p.user_id === bet.winner_id);
            const swishUrl = (!amIWinner && bet.stake_amount > 0 && winnerUser?.swish_number)
              ? createSwishUrl({ phone: winnerUser.swish_number, amount: bet.stake_amount, message: `AnyBet: ${bet.title}` })
              : null;

            return `
              <div class="anybet-card completed">
                <div class="flex justify-between align-center" style="margin-bottom: 6px;">
                  <span class="badge badge-success" style="font-size: 0.72rem;">✅ Avslutat</span>
                  <span style="font-size: 0.82rem; font-weight: 700; color: #10b981;">
                    ${bet.stake_amount > 0 ? `💰 Pott: ${totalPot} kr` : '✨ Ren ära'}
                  </span>
                </div>

                <h4 style="color: #fff; font-size: 1.05rem; font-weight: 700; margin-bottom: 4px;">
                  ${escapeHtml(bet.title)}
                </h4>

                <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid #10b981; border-radius: var(--radius-sm); padding: 8px 12px; margin: 8px 0;">
                  <div style="font-size: 0.95rem; font-weight: 800; color: #34d399;">
                    ${winnerText}
                  </div>
                </div>

                ${bet.proof_image_url ? `
                  <div style="margin: 8px 0;">
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">📸 Bildbevis från domaren:</div>
                    <img src="${bet.proof_image_url}" class="anybet-proof-img" alt="Bildbevis" />
                  </div>
                ` : ''}

                <!-- Swish Action if user lost -->
                ${(!amIWinner && bet.stake_amount > 0) ? `
                  <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-sm); padding: 10px; margin-top: 8px;">
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 6px;">
                      Du förlorade och är skyldig <strong>${bet.stake_amount} kr</strong>.
                    </div>
                    ${swishUrl ? `
                      <a href="${swishUrl}" class="swish-pay-btn" target="_blank" rel="noopener noreferrer" style="display: block; text-align: center; font-size: 0.85rem; padding: 8px;">
                        💸 Swisha ${escapeHtml(winnerUser?.nickname || 'vinnaren')} (${bet.stake_amount} kr)
                      </a>
                    ` : ''}
                    <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">
                      ✅ Loggat i din <strong>Swishlista & Notan</strong>.
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (err) {
      tabContent.innerHTML = `<div class="text-danger text-center" style="padding: 20px;">${err.message || 'Kunde inte ladda avslutade bet'}</div>`;
    }
  }

  // ── MODAL: DOMARENS AVGÖRANDE ─────────────────────────
  function openSettleModal(bet) {
    const isYesNo = bet.bet_type === 'yes_no';
    let chosenWinnerId = (bet.participants && bet.participants[0]) ? bet.participants[0].user_id : null;
    let chosenSide = 'yes';
    proofImageData = null;

    showModal(`⚖️ ${isEn ? 'Settle AnyBet' : 'Avgör AnyBet'}`, `
      <div style="padding: 6px 0;">
        <h4 style="color: var(--gold); font-size: 1.1rem; margin-bottom: 8px;">
          ${escapeHtml(bet.title)}
        </h4>
        <p class="text-muted" style="font-size: 0.82rem; margin-bottom: 14px;">
          ${isEn ? 'As judge, select the winner to distribute the pot and log settlements.' : 'Som domare utser du vinnaren för att fördela potten och bokföra uppgörelser.'}
        </p>

        ${isYesNo ? `
          <div style="margin-bottom: 16px;">
            <label class="form-label" style="font-size: 0.85rem; margin-bottom: 8px; display: block;">
              Vilken sida vann?
            </label>
            <div class="flex gap-xs">
              <button type="button" class="btn btn-primary btn-block btn-settle-side-btn" data-side="yes" style="padding: 12px; font-weight: 700; background: #10b981; border: none;">
                ✅ JA vann!
              </button>
              <button type="button" class="btn btn-secondary btn-block btn-settle-side-btn" data-side="no" style="padding: 12px; font-weight: 700;">
                ❌ NEJ vann!
              </button>
            </div>
          </div>
        ` : `
          <div style="margin-bottom: 16px;">
            <label class="form-label" style="font-size: 0.85rem; margin-bottom: 8px; display: block;">
              🏆 Välj vem som vann bland deltagarna:
            </label>
            <div style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto;">
              ${(bet.participants || []).map(p => `
                <label style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-glass); border-radius: var(--radius-sm); cursor: pointer;">
                  <span style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem;">
                    <span>${p.avatar_emoji || '👤'}</span>
                    <strong>${escapeHtml(p.nickname)}</strong>
                  </span>
                  <input type="radio" name="settle-winner" value="${p.user_id}" ${p.user_id === chosenWinnerId ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--gold);" />
                </label>
              `).join('')}
            </div>
          </div>
        `}

        <!-- Bildbevis (Valfritt) -->
        <div style="margin-bottom: 18px;">
          <label class="form-label" style="font-size: 0.85rem; margin-bottom: 6px; display: block;">
            ${t('arcade.anybetUploadProof')}
          </label>
          <input type="file" id="settle-proof-file" accept="image/*" class="form-input" style="padding: 6px 10px; font-size: 0.82rem;" />
          <div id="settle-proof-preview-wrap" style="display: none; margin-top: 8px;">
            <img id="settle-proof-preview" style="max-height: 140px; border-radius: var(--radius-sm); border: 1px solid var(--border-glass); display: block;" />
          </div>
        </div>

        <div class="flex gap-sm">
          <button type="button" class="btn btn-secondary btn-block" id="btn-cancel-settle">
            ❌ Avbryt
          </button>
          <button type="button" class="btn btn-primary btn-block" id="btn-confirm-settle" style="background: linear-gradient(135deg, #10b981, #059669); border: none; font-weight: 800;">
            ${t('arcade.anybetConfirmWinner')}
          </button>
        </div>
      </div>
    `);

    // Settle side listeners
    document.querySelectorAll('.btn-settle-side-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        chosenSide = btn.dataset.side;
        document.querySelectorAll('.btn-settle-side-btn').forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
          b.style.background = '';
        });
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
        btn.style.background = chosenSide === 'yes' ? '#10b981' : '#ef4444';
      });
    });

    // Winner radio listener
    document.querySelectorAll('input[name="settle-winner"]').forEach(radio => {
      radio.addEventListener('change', () => {
        chosenWinnerId = radio.value;
      });
    });

    // Proof file handler
    document.getElementById('settle-proof-file')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        proofImageData = evt.target.result;
        const previewEl = document.getElementById('settle-proof-preview');
        const previewWrap = document.getElementById('settle-proof-preview-wrap');
        if (previewEl && previewWrap) {
          previewEl.src = proofImageData;
          previewWrap.style.display = 'block';
        }
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('btn-cancel-settle')?.addEventListener('click', () => {
      closeModal();
      openAnyBetModal();
    });

    document.getElementById('btn-confirm-settle')?.addEventListener('click', async () => {
      const confirmBtn = document.getElementById('btn-confirm-settle');
      if (confirmBtn) confirmBtn.disabled = true;

      try {
        await settleAnyBet(bet.id, {
          winnerId: isYesNo ? null : chosenWinnerId,
          winningSide: isYesNo ? chosenSide : null,
          proofImageUrl: proofImageData
        });

        launchConfetti();
        playCoinSound();
        showToast(isEn ? 'Bet settled! The pot has been distributed.' : 'Bettet är avgjort! Potten och Notan har uppdaterats 🏆', 'success');

        closeModal();
        openAnyBetModal();
      } catch (err) {
        showToast(err.message || 'Kunde inte avgöra bettet', 'error');
        if (confirmBtn) confirmBtn.disabled = false;
      }
    });
  }
}

// ────────────────────────────────────────────────────────
// 🔔 INCOMING ANYBET INVITATION MODAL
// ────────────────────────────────────────────────────────
export function showIncomingAnyBetModal(bet) {
  const isEn = getLang() === 'en';
  playTone(587.33, 'sine', 0.25, 0.15);
  setTimeout(() => playTone(880, 'sine', 0.3, 0.15), 150);

  const titleHtml = `<img src="/handshake-gold.png" alt="Handshake" style="width: 24px; height: 24px; vertical-align: -3px; margin-right: 8px; filter: drop-shadow(0 2px 4px rgba(255,215,0,0.4));" />${t('arcade.anybetTitle')}`;

  showModal(titleHtml, `
    <div class="text-center" style="padding: 10px 0;">
      <img src="/handshake-gold.png" alt="Handshake" style="width: 72px; height: 72px; margin: 0 auto 12px auto; display: block; filter: drop-shadow(0 4px 16px rgba(255,215,0,0.5));" />
      <h3 style="color: var(--gold); margin-bottom: 6px; font-size: 1.2rem;">
        ${escapeHtml(bet.creatorNickname)} ${isEn ? 'invited you to an AnyBet!' : 'bjöd in dig till ett AnyBet!'}
      </h3>
      <div style="font-size: 1.05rem; font-weight: 700; color: #fff; margin: 8px 0 10px 0;">
        "${escapeHtml(bet.title)}"
      </div>
      <div class="badge badge-accent mb-md" style="font-size: 0.95rem; padding: 6px 16px;">
        ${bet.stakeAmount > 0 ? `💰 ${bet.stakeAmount} kr ${isEn ? 'stake' : 'i insats'}` : '✨ Bara ära (0 kr)'}
      </div>

      <div class="flex gap-sm" style="margin-top: 14px;">
        <button type="button" class="btn btn-secondary btn-block" id="btn-decline-anybet" style="padding: 12px;">
          ❌ ${isEn ? 'Close' : 'Stäng'}
        </button>
        <button type="button" class="btn btn-primary btn-block" id="btn-open-anybet-invite" style="padding: 12px; background: linear-gradient(135deg, #f59e0b, #d97706); border: none; font-weight: 700;">
          🤝 ${isEn ? 'View AnyBet' : 'Öppna AnyBet'}
        </button>
      </div>
    </div>
  `);

  document.getElementById('btn-decline-anybet')?.addEventListener('click', () => {
    closeModal();
  });

  document.getElementById('btn-open-anybet-invite')?.addEventListener('click', () => {
    closeModal();
    openAnyBetModal(bet.id);
  });
}

// ────────────────────────────────────────────────────────
// 📱 SWISHLISTAN & UPPGÖRELSER MODAL
// ────────────────────────────────────────────────────────
export async function openSwishlistModal() {
  const isEn = getLang() === 'en';
  const user = getStoredUser();
  if (!user) {
    showToast(isEn ? 'Please log in to view settlements' : 'Logga in för att se uppgörelser', 'warning');
    return;
  }

  showModal(t('arcade.swishListTitle'), `
    <div id="swishlist-content" style="padding: 6px 0;">
      <div class="text-center text-muted" style="padding: 20px 0;">
        <span class="spinner" style="margin-bottom: 8px;">⏳</span>
        <div>${isEn ? 'Loading settlements...' : 'Hämtar uppgörelser...'}</div>
      </div>
    </div>
  `);

  try {
    const summary = await getDuelSettlements();
    const content = document.getElementById('swishlist-content');
    if (!content) return;

    if (!summary || !summary.friends || summary.friends.length === 0) {
      content.innerHTML = `
        <div class="text-center" style="padding: 25px 10px;">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">🥂</div>
          <div style="font-weight: 700; font-size: 1rem; color: #4ade80; margin-bottom: 4px;">
            ${t('arcade.swishListEmpty')}
          </div>
          <p class="text-muted" style="font-size: 0.8rem; max-width: 280px; margin: 0 auto;">
            ${isEn ? 'Challenge a friend in Dice Duel to start a Swish duel!' : 'Utmana en vän i Tärningsduell för att spela om Swish!'}
          </p>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div class="mb-sm flex-between" style="align-items: center; padding: 0 4px;">
        <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">
          ${isEn ? 'Net settlements per friend' : 'Nettoavstämning per vän'}
        </span>
        <span class="badge" style="background: ${summary.totalNet >= 0 ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; color: ${summary.totalNet >= 0 ? '#4ade80' : '#ef4444'}; font-weight: 700; font-size: 0.78rem;">
          ${summary.totalNet >= 0 ? `+${summary.totalNet} kr` : `${summary.totalNet} kr`}
        </span>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px; max-height: 380px; overflow-y: auto;">
        ${summary.friends.map(f => {
          const owesYou = f.netAmount > 0;
          const absAmount = Math.abs(f.netAmount);
          const swishUrl = createSwishUrl({
            phone: f.friendSwish,
            amount: absAmount,
            message: 'Betpals Duell'
          });

          return `
            <div class="swish-settlement-item" style="border-left: 3px solid ${owesYou ? '#4ade80' : '#ef4444'};">
              <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                <div style="width: 34px; height: 34px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; border: 1px solid var(--border-glass);">
                  ${f.friendAvatarUrl ? `<img src="${f.friendAvatarUrl}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" />` : (f.friendAvatarEmoji || '👤')}
                </div>
                <div style="min-width: 0;">
                  <div style="font-weight: 700; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${escapeHtml(f.friendName || f.friendNickname)}
                  </div>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">
                    ${owesYou 
                      ? (isEn ? `Owes you ${absAmount} kr (${f.duelsCount} duels)` : `Ska swisha dig ${absAmount} kr (${f.duelsCount} dueller)`) 
                      : (isEn ? `You owe ${absAmount} kr (${f.duelsCount} duels)` : `Du ska swisha ${absAmount} kr (${f.duelsCount} dueller)`)}
                  </div>
                </div>
              </div>

              <div class="flex gap-xs" style="align-items: center;">
                ${!owesYou ? `
                  <a href="${swishUrl}" class="swish-pay-btn" style="padding: 5px 10px; font-size: 0.75rem;" target="_blank" rel="noopener">
                    📱 ${isEn ? 'Swish' : 'Swisha'} ${absAmount} kr
                  </a>
                ` : `
                  <button type="button" class="btn btn-ghost btn-xs btn-remind-friend" data-phone="${f.friendSwish || ''}" data-name="${escapeHtml(f.friendName)}" data-amount="${absAmount}" style="color: var(--gold); font-size: 0.75rem; padding: 4px 8px;">
                    💬 ${isEn ? 'Remind' : 'Påminn'}
                  </button>
                `}
                <button type="button" class="btn btn-secondary btn-xs btn-settle-friend" data-friend-id="${f.friendId}" data-name="${escapeHtml(f.friendName)}" title="${isEn ? 'Mark as settled' : 'Kvittera som betald'}" style="padding: 5px 8px; font-size: 0.75rem;">
                  ✅
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Attach settle listeners
    content.querySelectorAll('.btn-settle-friend').forEach(btn => {
      btn.addEventListener('click', async () => {
        const friendId = btn.getAttribute('data-friend-id');
        const name = btn.getAttribute('data-name');
        btn.disabled = true;
        try {
          await settleDuelsWithFriend(friendId);
          showToast(isEn ? `Settled with ${name}! ✅` : `Uppgörelse med ${name} kvitterad! ✅`, 'success');
          openSwishlistModal();
        } catch (e) {
          showToast(isEn ? 'Failed to settle' : 'Kunde inte kvittera', 'error');
          btn.disabled = false;
        }
      });
    });

    // Remind via share or clipboard
    content.querySelectorAll('.btn-remind-friend').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-name');
        const amount = btn.getAttribute('data-amount');
        const text = isEn
          ? `Hey ${name}! You owe me ${amount} kr from Betpals Dice Duel 🎲`
          : `Tjena ${name}! Du är skyldig mig ${amount} kr från Betpals Tärningsduell 🎲`;
        if (navigator.share) {
          navigator.share({ text }).catch(() => {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(text);
          showToast(isEn ? 'Reminder copied to clipboard! 📋' : 'Påminnelsetext kopierad till urklipp! 📋', 'info');
        }
      });
    });

  } catch (err) {
    const content = document.getElementById('swishlist-content');
    if (content) {
      content.innerHTML = `<div class="text-center text-muted" style="padding: 20px;">${isEn ? 'Error loading settlements' : 'Kunde inte hämta uppgörelser'}</div>`;
    }
  }
}

// ────────────────────────────────────────────────────────
// 🔔 GLOBAL DUEL INCOMING CHALLENGE LISTENER
// ────────────────────────────────────────────────────────
let globalDuelWs = null;
export function setupGlobalDuelListener() {
  const token = getToken();
  if (!token) return;
  if (globalDuelWs && (globalDuelWs.readyState === WebSocket.OPEN || globalDuelWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}?token=${token}`;

  try {
    globalDuelWs = new WebSocket(wsUrl);

    globalDuelWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'duel_challenge' && data.duel) {
          showIncomingDuelModal(data.duel);
        } else if (data.type === 'party_invitation' && data.room) {
          showIncomingPartyModal(data.room);
        } else if (data.type === 'anybet_invitation' && data.bet) {
          showIncomingAnyBetModal(data.bet);
        } else if (data.type === 'notan_roulette_live_spin') {
          const user = getStoredUser();
          if (user && data.participantIds?.includes(String(user.id)) && String(data.payer?.id) !== String(user.id)) {
            openLiveRouletteSpectatorModal(data);
          }
        } else if (data.type === 'tab_expense_converted') {
          showToast('⚖️ ' + (data.title || 'Notan') + ' ändrades till Even Steven!', 'info');
          window.dispatchEvent(new CustomEvent('tab-expenses-updated'));
        }
      } catch (e) {}
    };

    globalDuelWs.onclose = () => {
      globalDuelWs = null;
      setTimeout(setupGlobalDuelListener, 6000);
    };
  } catch (e) {}
}

function showIncomingDuelModal(duel) {
  const isEn = getLang() === 'en';
  playTone(587.33, 'sine', 0.25, 0.15); // D5 chime

  const isCoin = duel.game_type === 'coin';
  const titleHtml = isCoin
    ? `<img src="/coin-head.jpg" alt="Coin" style="width: 22px; height: 22px; border-radius: 50%; vertical-align: -3px; margin-right: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.5);" />${t('arcade.coinFlipTitle')}`
    : `<img src="/dice-gold.png" alt="Dice" style="width: 22px; height: 22px; vertical-align: -3px; margin-right: 6px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));" />${t('arcade.diceTitle').replace('🎲', '').trim()}`;

  const gameName = isCoin ? (isEn ? 'Coin Flip' : 'Singla Slant') : (isEn ? 'Dice Duel' : 'Tärningsduell');

  showModal(titleHtml, `
    <div class="text-center" style="padding: 10px 0;">
      <div style="font-size: 2.8rem; margin-bottom: 8px;">${isCoin ? '🪙' : '⚔️'}</div>
      <h3 style="color: var(--gold); margin-bottom: 6px; font-size: 1.15rem;">
        ${escapeHtml(duel.creator_nickname)} ${isEn ? `challenges you in ${gameName}!` : `utmanar dig i ${gameName}!`}
      </h3>
      <div class="badge badge-accent mb-md" style="font-size: 0.9rem; padding: 4px 14px;">
        📱 ${duel.stake_amount} kr via Swish
      </div>
      <p class="text-muted mb-lg" style="font-size: 0.85rem; max-width: 290px; margin: 0 auto 16px auto;">
        ${isEn 
          ? `By accepting, you agree that the loser will swish ${duel.stake_amount} kr.` 
          : `Genom att acceptera godkänner du att förloraren swishar ${duel.stake_amount} kr.`}
      </p>

      <div class="flex gap-sm">
        <button type="button" class="btn btn-secondary btn-block" id="btn-decline-duel" style="padding: 12px;">
          ❌ ${t('arcade.diceDecline')}
        </button>
        <button type="button" class="btn btn-primary btn-block" id="btn-accept-duel" style="padding: 12px; background: linear-gradient(135deg, #10b981, #059669); border: none;">
          ✅ ${t('arcade.diceAccept')} (${duel.stake_amount} kr)
        </button>
      </div>
    </div>
  `);

  document.getElementById('btn-decline-duel')?.addEventListener('click', async () => {
    try {
      await respondDuel(duel.id, false);
    } catch (e) {}
    closeModal();
  });

  document.getElementById('btn-accept-duel')?.addEventListener('click', async () => {
    try {
      await respondDuel(duel.id, true);
      closeModal();
      if (isCoin) {
        openCoinFlipModal(duel);
      } else {
        openDiceModal(duel);
      }
    } catch (e) {
      showToast(isEn ? 'Failed to accept duel' : 'Kunde inte acceptera duellen', 'error');
    }
  });
}

// ── ⚡ BLIXTBET (FLASHBET) MODAL & LOGIC ──────────────────
let flashBetTimerInterval = null;

export async function openFlashBetModal(initialFlashBetId = null, defaultTournamentId = null) {
  const isEn = getLang() === 'en';
  const currentUser = getStoredUser();
  let activeTab = initialFlashBetId ? 'active' : 'active';
  let countdowns = new Map(); // id -> secondsLeft

  function cleanupTimer() {
    if (flashBetTimerInterval) {
      clearInterval(flashBetTimerInterval);
      flashBetTimerInterval = null;
    }
  }

  showModal(`⚡ ${t('arcade.flashbet')}`, `
    <div id="flashbet-container" style="padding: 2px 0; min-height: 380px;">
      <!-- Push Permission Banner if not enabled -->
      ${isPushSupported() && getPushPermissionState() !== 'granted' ? `
        <div id="flashbet-push-banner" style="display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 14px; margin-bottom: 12px; background: rgba(245, 166, 35, 0.12); border: 1px solid var(--gold); border-radius: var(--radius-md);">
          <div style="font-size: 0.78rem; line-height: 1.3;">
            🔔 <strong>${t('arcade.pushEnablePrompt')}</strong>
          </div>
          <button type="button" class="btn btn-sm btn-primary" id="btn-flashbet-enable-push" style="flex-shrink: 0; padding: 4px 10px; font-size: 0.75rem;">
            ${t('arcade.pushEnableBtn')}
          </button>
        </div>
      ` : ''}

      <!-- Nav Tabs -->
      <div class="tab-nav mb-md" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <button type="button" class="btn ${activeTab === 'active' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="tab-flashbet-active" style="font-weight: 700;">
          ${t('arcade.flashbetActiveTitle')}
        </button>
        <button type="button" class="btn ${activeTab === 'create' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="tab-flashbet-create" style="font-weight: 700;">
          ➕ ${t('arcade.flashbetCreateBtn')}
        </button>
      </div>

      <div id="flashbet-tab-content"></div>
    </div>
  `);

  // Wire push enable button
  document.getElementById('btn-flashbet-enable-push')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-flashbet-enable-push');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      await subscribeToPush();
      showToast('🔔 Pushnotiser aktiverade!', 'success');
      document.getElementById('flashbet-push-banner')?.remove();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = t('arcade.pushEnableBtn');
    }
  });

  const tabContent = document.getElementById('flashbet-tab-content');

  document.getElementById('tab-flashbet-active')?.addEventListener('click', () => {
    activeTab = 'active';
    updateTabs();
    renderActiveTab();
  });

  document.getElementById('tab-flashbet-create')?.addEventListener('click', () => {
    activeTab = 'create';
    updateTabs();
    renderCreateTab();
  });

  function updateTabs() {
    const btnActive = document.getElementById('tab-flashbet-active');
    const btnCreate = document.getElementById('tab-flashbet-create');
    if (activeTab === 'active') {
      btnActive.className = 'btn btn-primary btn-sm';
      btnCreate.className = 'btn btn-secondary btn-sm';
    } else {
      btnActive.className = 'btn btn-secondary btn-sm';
      btnCreate.className = 'btn btn-primary btn-sm';
    }
  }

  // ── Render Active Tab ──────────────────────────────
  async function renderActiveTab() {
    cleanupTimer();
    tabContent.innerHTML = `<div class="text-center text-muted" style="padding: 30px;">Laddar BlixtBets... ⚡</div>`;

    try {
      const flashBets = await getActiveFlashBets();
      countdowns.clear();

      if (!flashBets || flashBets.length === 0) {
        tabContent.innerHTML = `
          <div class="card text-center" style="padding: 30px 16px;">
            <div style="font-size: 2.8rem; margin-bottom: 8px;">⚡</div>
            <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 6px;">${t('arcade.flashbet')}</h3>
            <p class="text-muted" style="font-size: 0.85rem; margin-bottom: 16px; max-width: 280px; margin-left: auto; margin-right: auto;">
              ${t('arcade.flashbetNoActive')}
            </p>
            <button type="button" class="btn btn-primary btn-block" id="btn-empty-start-flashbet">
              ⚡ ${t('arcade.flashbetCreateBtn')}
            </button>
          </div>
        `;
        document.getElementById('btn-empty-start-flashbet')?.addEventListener('click', () => {
          activeTab = 'create';
          updateTabs();
          renderCreateTab();
        });
        return;
      }

      flashBets.forEach(fb => {
        countdowns.set(fb.id, fb.secondsLeft);
      });

      tabContent.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px;">
          ${flashBets.map(fb => renderFlashBetCard(fb)).join('')}
        </div>
      `;

      attachActiveCardHandlers();
      startCountdownLoop();
    } catch (err) {
      tabContent.innerHTML = `<div class="text-red text-center" style="padding: 20px;">${escapeHtml(err.message)}</div>`;
    }
  }

  function renderFlashBetCard(fb) {
    const isCreator = currentUser && fb.creatorId === currentUser.id;
    const hasVoted = !!fb.myEntry;
    const seconds = countdowns.get(fb.id) ?? fb.secondsLeft;
    const isExpired = seconds <= 0 || fb.status !== 'open';

    const formatSeconds = (s) => {
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${m}:${rem < 10 ? '0' : ''}${rem}`;
    };

    return `
      <div class="card flashbet-card" data-fb-id="${fb.id}" style="border: 1.5px solid ${isExpired ? 'var(--border-light)' : 'var(--gold)'}; background: var(--bg-card); position: relative; overflow: hidden; padding: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.3rem;">${escapeHtml(fb.creatorAvatar || '👤')}</span>
            <div>
              <div style="font-weight: 700; font-size: 0.85rem;">${escapeHtml(fb.creatorRealName || fb.creatorNickname)}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">Insats: <strong>${fb.stakeAmount} kr</strong></div>
            </div>
          </div>
          <div class="flashbet-timer-badge" id="timer-${fb.id}" style="padding: 4px 10px; border-radius: var(--radius-full); font-size: 0.82rem; font-weight: 800; font-family: monospace; letter-spacing: 0.05em; background: ${seconds <= 15 ? 'rgba(231,76,60,0.2)' : 'rgba(245,166,35,0.15)'}; color: ${seconds <= 15 ? '#e74c3c' : 'var(--gold)'}; border: 1px solid ${seconds <= 15 ? '#e74c3c' : 'var(--gold)'};">
            ⏱️ ${formatSeconds(seconds)}
          </div>
        </div>

        <div style="font-size: 1.1rem; font-weight: 800; line-height: 1.3; margin-bottom: 12px; color: var(--text-primary);">
          "${escapeHtml(fb.question)}"
        </div>

        <!-- Votes & Pool Bar -->
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700; margin-bottom: 4px;">
            <span style="color: #2ecc71;">👍 JA: ${fb.yesCount}</span>
            <span style="color: var(--text-muted);">Pott: ${fb.totalPool} kr</span>
            <span style="color: #e74c3c;">👎 NEJ: ${fb.noCount}</span>
          </div>
          <div style="height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; display: flex;">
            <div style="height: 100%; width: ${fb.entriesCount > 0 ? (fb.yesCount / fb.entriesCount * 100) : 50}%; background: #2ecc71; transition: width 0.3s;"></div>
            <div style="height: 100%; width: ${fb.entriesCount > 0 ? (fb.noCount / fb.entriesCount * 100) : 50}%; background: #e74c3c; transition: width 0.3s;"></div>
          </div>
        </div>

        <!-- User Voting Controls -->
        ${hasVoted ? `
          <div style="padding: 10px; border-radius: var(--radius-md); background: rgba(255,255,255,0.04); text-align: center; font-size: 0.85rem; font-weight: 700;">
            ${fb.myEntry.choice === 'yes' ? '✅ Du röstade: <span style="color: #2ecc71;">👍 JA</span>' : '✅ Du röstade: <span style="color: #e74c3c;">👎 NEJ</span>'}
          </div>
        ` : !isExpired ? `
          <div class="flex gap-sm" style="margin-top: 6px;">
            <button type="button" class="btn btn-block flashbet-vote-btn" data-fb-id="${fb.id}" data-choice="yes" style="flex: 1; padding: 10px; background: rgba(46,204,113,0.15); border: 1.5px solid #2ecc71; color: #2ecc71; font-weight: 800; font-size: 0.95rem;">
              👍 JA (${fb.stakeAmount} kr)
            </button>
            <button type="button" class="btn btn-block flashbet-vote-btn" data-fb-id="${fb.id}" data-choice="no" style="flex: 1; padding: 10px; background: rgba(231,76,60,0.15); border: 1.5px solid #e74c3c; color: #e74c3c; font-weight: 800; font-size: 0.95rem;">
              👎 NEJ (${fb.stakeAmount} kr)
            </button>
          </div>
        ` : `
          <div style="padding: 8px; text-align: center; font-size: 0.8rem; color: var(--text-muted); background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
            ${t('arcade.flashbetTimeExpired')}
          </div>
        `}

        <!-- Settle Controls (Only for creator) -->
        ${isCreator && fb.status !== 'settled' ? `
          <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-glass);">
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--gold); margin-bottom: 6px; text-align: center;">
              ⚖️ ${t('arcade.flashbetSettlePrompt')}
            </div>
            <div class="flex gap-xs">
              <button type="button" class="btn btn-sm flashbet-settle-btn" data-fb-id="${fb.id}" data-winner="yes" style="flex: 1; background: #2ecc71; color: #000; font-weight: 700; padding: 6px;">
                ${t('arcade.flashbetSettleYes')}
              </button>
              <button type="button" class="btn btn-sm flashbet-settle-btn" data-fb-id="${fb.id}" data-winner="no" style="flex: 1; background: #e74c3c; color: #fff; font-weight: 700; padding: 6px;">
                ${t('arcade.flashbetSettleNo')}
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function startCountdownLoop() {
    flashBetTimerInterval = setInterval(() => {
      let anyOpen = false;
      for (const [id, seconds] of countdowns.entries()) {
        const next = Math.max(0, seconds - 1);
        countdowns.set(id, next);
        if (next > 0) anyOpen = true;

        const badge = document.getElementById(`timer-${id}`);
        if (badge) {
          const m = Math.floor(next / 60);
          const rem = next % 60;
          badge.textContent = `⏱️ ${m}:${rem < 10 ? '0' : ''}${rem}`;
          if (next <= 15) {
            badge.style.background = 'rgba(231,76,60,0.2)';
            badge.style.color = '#e74c3c';
            badge.style.borderColor = '#e74c3c';
          }
          if (next === 0) {
            badge.textContent = '⏱️ STÄNGT';
            badge.style.opacity = '0.7';
            // Disable voting buttons
            document.querySelectorAll(`.flashbet-vote-btn[data-fb-id="${id}"]`).forEach(b => {
              b.disabled = true;
              b.style.opacity = '0.5';
            });
          }
        }
      }
      if (!anyOpen) cleanupTimer();
    }, 1000);
  }

  function attachActiveCardHandlers() {
    // Voting
    document.querySelectorAll('.flashbet-vote-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fbId = btn.dataset.fbId;
        const choice = btn.dataset.choice;
        btn.disabled = true;
        btn.textContent = '...';

        try {
          await placeFlashBet(fbId, choice);
          showToast(choice === 'yes' ? '👍 Röst lagd på JA!' : '👎 Röst lagd på NEJ!', 'success');
          renderActiveTab();
        } catch (err) {
          showToast(err.message, 'error');
          renderActiveTab();
        }
      });
    });

    // Settling
    document.querySelectorAll('.flashbet-settle-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fbId = btn.dataset.fbId;
        const winner = btn.dataset.winner;
        if (!confirm(`Är du säker på att ${winner === 'yes' ? 'JA' : 'NEJ'} vann? Vinsterna fördelas direkt!`)) return;

        btn.disabled = true;
        try {
          await settleFlashBet(fbId, winner);
          launchConfetti();
          showToast(`🏁 BlixtBet avgjort! ${winner === 'yes' ? 'JA' : 'NEJ'} vann!`, 'success');
          renderActiveTab();
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });
  }

  // ── Render Create Tab ──────────────────────────────
  async function renderCreateTab() {
    cleanupTimer();
    let selectedDuration = 60;
    let selectedStake = 20;
    let selectedMyChoice = 'yes';
    let tournaments = [];

    try {
      tournaments = await getTournaments().catch(() => []);
    } catch {}

    tabContent.innerHTML = `
      <form id="create-flashbet-form" style="display: flex; flex-direction: column; gap: 14px;">
        <div class="form-group mb-xs">
          <label class="form-label" style="font-weight: 700; font-size: 0.85rem;">⚡ Vad gäller bettet?</label>
          <input type="text" class="form-input" id="fb-question-input" placeholder="${t('arcade.flashbetQuestionPlaceholder')}" required maxlength="120" style="padding: 10px 12px; font-weight: 700; font-size: 0.95rem;" />
        </div>

        <!-- Duration Picker -->
        <div class="form-group mb-xs">
          <label class="form-label" style="font-size: 0.8rem;">⏱️ ${t('arcade.flashbetDurationLabel')}</label>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
            <button type="button" class="btn btn-sm fb-duration-btn" data-sec="30" style="padding: 8px 4px; font-size: 0.8rem; font-weight: 700;">30s</button>
            <button type="button" class="btn btn-sm btn-primary fb-duration-btn" data-sec="60" style="padding: 8px 4px; font-size: 0.8rem; font-weight: 700;">60s</button>
            <button type="button" class="btn btn-sm fb-duration-btn" data-sec="120" style="padding: 8px 4px; font-size: 0.8rem; font-weight: 700;">2 min</button>
            <button type="button" class="btn btn-sm fb-duration-btn" data-sec="300" style="padding: 8px 4px; font-size: 0.8rem; font-weight: 700;">5 min</button>
          </div>
        </div>

        <!-- Stake Picker -->
        <div class="form-group mb-xs">
          <label class="form-label" style="font-size: 0.8rem;">💰 ${t('arcade.flashbetStakeLabel')}</label>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
            <button type="button" class="btn btn-sm fb-stake-btn" data-stake="10" style="padding: 8px 4px; font-size: 0.8rem; font-weight: 700;">10 kr</button>
            <button type="button" class="btn btn-sm btn-primary fb-stake-btn" data-stake="20" style="padding: 8px 4px; font-size: 0.8rem; font-weight: 700;">20 kr</button>
            <button type="button" class="btn btn-sm fb-stake-btn" data-stake="50" style="padding: 8px 4px; font-size: 0.8rem; font-weight: 700;">50 kr</button>
            <button type="button" class="btn btn-sm fb-stake-btn" data-stake="100" style="padding: 8px 4px; font-size: 0.8rem; font-weight: 700;">100 kr</button>
          </div>
        </div>

        <!-- Creator's Own Choice -->
        <div class="form-group mb-xs">
          <label class="form-label" style="font-size: 0.8rem;">🎯 Ditt eget val direkt:</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button type="button" class="btn btn-sm fb-choice-btn btn-primary" data-choice="yes" style="padding: 8px; font-weight: 800; font-size: 0.88rem;">👍 JA</button>
            <button type="button" class="btn btn-sm fb-choice-btn btn-secondary" data-choice="no" style="padding: 8px; font-weight: 800; font-size: 0.88rem;">👎 NEJ</button>
          </div>
        </div>

        <!-- Optional Tournament Link -->
        ${tournaments && tournaments.length > 0 ? `
          <div class="form-group mb-xs">
            <label class="form-label" style="font-size: 0.8rem;">🏆 ${t('arcade.flashbetTournamentLink')}</label>
            <select class="form-input" id="fb-tournament-select" style="font-size: 0.85rem; padding: 8px 10px;">
              <option value="">— Fristående (Arcade / Vänner) —</option>
              ${tournaments.map(t => `<option value="${t.id}" ${defaultTournamentId === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
            </select>
          </div>
        ` : ''}

        <button type="submit" class="btn btn-primary btn-block mt-xs" id="btn-submit-flashbet" style="padding: 12px; font-size: 1rem; font-weight: 800; background: linear-gradient(135deg, var(--gold), #e67e22); border: none;">
          ⚡ Starta BlixtBet & Skicka Notis!
        </button>
      </form>
    `;

    // Duration buttons
    document.querySelectorAll('.fb-duration-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fb-duration-btn').forEach(b => b.className = 'btn btn-sm fb-duration-btn');
        btn.className = 'btn btn-sm btn-primary fb-duration-btn';
        selectedDuration = Number(btn.dataset.sec);
      });
    });

    // Stake buttons
    document.querySelectorAll('.fb-stake-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fb-stake-btn').forEach(b => b.className = 'btn btn-sm fb-stake-btn');
        btn.className = 'btn btn-sm btn-primary fb-stake-btn';
        selectedStake = Number(btn.dataset.stake);
      });
    });

    // Creator choice buttons
    document.querySelectorAll('.fb-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.fb-choice-btn').forEach(b => b.className = 'btn btn-sm fb-choice-btn btn-secondary');
        btn.className = 'btn btn-sm fb-choice-btn btn-primary';
        selectedMyChoice = btn.dataset.choice;
      });
    });

    // Form submit
    document.getElementById('create-flashbet-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const question = document.getElementById('fb-question-input').value.trim();
      const tournamentId = document.getElementById('fb-tournament-select')?.value || defaultTournamentId || null;
      const submitBtn = document.getElementById('btn-submit-flashbet');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Skapar BlixtBet... ⚡';

      try {
        await createFlashBet({
          question,
          durationSeconds: selectedDuration,
          stakeAmount: selectedStake,
          tournamentId,
          initialChoice: selectedMyChoice
        });

        showToast('⚡ BlixtBet startat! Klockan tickar!', 'success');
        activeTab = 'active';
        updateTabs();
        renderActiveTab();
      } catch (err) {
        showToast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '⚡ Starta BlixtBet & Skicka Notis!';
      }
    });
  }

  // Initial render
  renderActiveTab();
}

// ────────────────────────────────────────────────────────
// 🎰 GAME 8: NOT-ROULETTE & ⚖️ EVEN STEVEN
// ────────────────────────────────────────────────────────

export async function openReceiptModal(expenseId) {
  const isEn = getLang() === 'en';
  try {
    const expense = await getTabExpense(expenseId);
    if (!expense) {
      showToast(isEn ? 'Receipt not found' : 'Kvittot hittades inte', 'error');
      return;
    }

    const dateStr = expense.created_at ? new Date(expense.created_at + (expense.created_at.includes('Z') ? '' : 'Z')).toLocaleString(isEn ? 'en-US' : 'sv-SE', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '';

    const isRoulette = expense.mode === 'roulette';
    const payerName = expense.payer_real_name || expense.payer_nickname || (isEn ? 'A friend' : 'En vän');

    showModal(`
      <div class="notan-receipt-viewer animate-in" style="max-width: 420px; margin: 0 auto; text-align: left;">
        <div class="flex-between mb-sm" style="align-items: center;">
          <span class="badge ${isRoulette ? 'badge-danger' : 'badge-primary'}" style="font-size: 0.75rem; font-weight: 800; padding: 4px 8px;">
            ${isRoulette ? '🎰 NOT-ROULETTE' : '⚖️ EVEN STEVEN'}
          </span>
          <span class="text-muted" style="font-size: 0.75rem;">${dateStr}</span>
        </div>

        <h3 class="font-heading" style="color: var(--gold); margin: 0 0 4px; font-size: 1.25rem;">
          ${escapeHtml(expense.title || (isRoulette ? 'Not-Roulette' : 'Dela nota'))}
        </h3>
        
        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px;">
          ${isEn ? 'Paid by' : 'Betalades av'}: <strong style="color: #fff;">${escapeHtml(payerName)}</strong>
        </div>

        <!-- Total Amount Card -->
        <div class="card mb-sm text-center" style="background: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.3); padding: 12px;">
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--gold); text-transform: uppercase;">
            ${isEn ? 'Total Tab' : 'Total Krognota'}
          </div>
          <div style="font-size: 1.6rem; font-weight: 900; color: var(--gold);">
            ${Math.round(expense.total_amount)} kr
          </div>
        </div>

        ${expense.notes ? `
          <div class="card mb-sm" style="padding: 10px 12px; background: rgba(255,255,255,0.03); font-size: 0.85rem;">
            <div style="font-weight: 700; color: var(--text-muted); font-size: 0.75rem; margin-bottom: 4px;">📝 ${isEn ? 'Notes' : 'Anteckning'}:</div>
            <div style="white-space: pre-wrap; color: var(--text-secondary);">${escapeHtml(expense.notes)}</div>
          </div>
        ` : ''}

        <!-- Attached Receipt Photo -->
        ${expense.receipt_image ? `
          <div class="mb-md">
            <div style="font-weight: 700; font-size: 0.8rem; color: var(--gold); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
              <span>🧾 ${isEn ? 'Receipt Photo' : 'Fotat Kvitto'}</span>
            </div>
            <div style="position: relative; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-glass); background: #000; cursor: pointer;" id="receipt-photo-container">
              <img src="${expense.receipt_image}" alt="Kvitto" style="width: 100%; max-height: 280px; object-fit: contain; display: block; background: #0d1117;" />
              <div style="position: absolute; bottom: 6px; right: 6px; background: rgba(0,0,0,0.75); color: #fff; font-size: 0.7rem; padding: 3px 8px; border-radius: 4px; pointer-events: none;">
                🔍 ${isEn ? 'Click to zoom' : 'Klicka för fullskärm'}
              </div>
            </div>
          </div>
        ` : `
          <div class="text-muted text-center mb-md" style="font-size: 0.8rem; font-style: italic; padding: 8px;">
            ${isEn ? 'No receipt photo attached' : 'Inget kvittofoto bifogat'}
          </div>
        `}

        <!-- Participants & Debts -->
        <div class="mb-md">
          <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px;">
            👥 ${isEn ? 'Participants & Breakdown' : 'Deltagare & Fördelning'}:
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${(expense.participants || []).map(p => {
              const isPayer = p.user_id === expense.payer_id;
              const isLoser = isRoulette && p.user_id === expense.loser_id;
              const name = p.real_name || p.nickname || (isEn ? 'Participant' : 'Deltagare');
              
              let amountText = '';
              let badgeColor = 'var(--text-muted)';
              if (isRoulette) {
                if (isLoser) {
                  amountText = isPayer ? `Förlorade (${Math.round(expense.total_amount)} kr)` : `Tog hela notan (${Math.round(expense.total_amount)} kr)`;
                  badgeColor = '#ef4444';
                } else {
                  amountText = 'Klarade sig (0 kr) 🎉';
                  badgeColor = '#4ade80';
                }
              } else {
                amountText = isPayer ? `Lade ut (${Math.round(p.amount)} kr egen del)` : `Skyldig ${Math.round(p.amount)} kr`;
                badgeColor = isPayer ? '#4ade80' : 'var(--gold)';
              }

              return `
                <div class="flex-between align-center" style="padding: 6px 10px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); border-left: 3px solid ${badgeColor}; font-size: 0.85rem;">
                  <div class="flex align-center gap-xs">
                    <span>${escapeHtml(p.avatar_emoji || '👤')}</span>
                    <span style="font-weight: 600;">${escapeHtml(name)}</span>
                    ${isPayer ? `<span class="badge badge-warning" style="font-size: 0.65rem; padding: 1px 4px;">${isEn ? 'Payer' : 'Lade ut'}</span>` : ''}
                    ${isLoser ? `<span class="badge badge-danger" style="font-size: 0.65rem; padding: 1px 4px;">💸 ${isEn ? 'Lost' : 'Tog notan'}</span>` : ''}
                  </div>
                  <div style="font-weight: 700; color: ${badgeColor}; font-size: 0.8rem;">
                    ${amountText}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Convert to Even Steven Safety Valve -->
        ${isRoulette && currentUser && (expense.loser_id === currentUser.id || expense.payer_id === currentUser.id) ? `
          <div class="mb-md">
            <button type="button" class="btn btn-secondary btn-block" id="btn-convert-to-even-steven" style="border-color: #10b981; color: #4ade80; font-weight: 800; padding: 10px; font-size: 0.85rem; background: rgba(16, 185, 129, 0.08);">
              ⚖️ ${isEn ? 'Convert to Even Steven (Split evenly)' : 'Gör om till Even Steven (Dela rakt)'}
            </button>
            <div class="text-center text-muted mt-xs" style="font-size: 0.72rem;">
              ${isEn ? 'Safety valve: Split the bill fairly instead of one person taking all.' : 'Säkerhetsventil: Dela notan rättvist istället för att en tar allt.'}
            </div>
          </div>
        ` : ''}

        <button type="button" class="btn btn-secondary btn-block" id="btn-close-receipt-modal" style="padding: 10px; font-weight: 700;">
          ${isEn ? 'Close' : 'Stäng'}
        </button>
      </div>
    `);

    document.getElementById('btn-close-receipt-modal')?.addEventListener('click', () => {
      closeModal();
    });

    document.getElementById('btn-convert-to-even-steven')?.addEventListener('click', async () => {
      const confirmMsg = isEn 
        ? 'Do you want to convert this Not-Roulette to an even split (Even Steven) among everyone?' 
        : 'Vill du göra om denna Not-Roulette till en rättvis splitt (Even Steven) mellan alla runt bordet?';
      if (confirm(confirmMsg)) {
        try {
          await convertTabExpenseToEvenSteven(expenseId);
          showToast(isEn ? 'Converted to Even Steven! ⚖️' : 'Notan gjordes om till Even Steven! ⚖️', 'success');
          openReceiptModal(expenseId);
        } catch (e) {
          showToast(e.message, 'error');
        }
      }
    });

    // Zoom receipt modal
    document.getElementById('receipt-photo-container')?.addEventListener('click', () => {
      showModal(`
        <div style="text-align: center;">
          <img src="${expense.receipt_image}" alt="Kvitto Fullskärm" style="max-width: 100%; max-height: 80vh; border-radius: var(--radius-md); object-fit: contain;" />
          <div class="mt-sm">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-close-zoom-receipt">${isEn ? 'Close' : 'Stäng'}</button>
          </div>
        </div>
      `);
      document.getElementById('btn-close-zoom-receipt')?.addEventListener('click', () => {
        openReceiptModal(expenseId);
      });
    });

  } catch (err) {
    showToast(err.message, 'error');
  }
}

export function openLiveRouletteSpectatorModal(spinData) {
  const isEn = getLang() === 'en';
  const currentUser = getStoredUser();

  playTone(659.25, 'triangle', 0.3, 0.2); // Attention chime

  const PALETTE = [
    '#e63946', '#f59e0b', '#10b981', '#3b82f6', 
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', 
    '#f97316', '#6366f1', '#14b8a6', '#d946ef'
  ];

  const rawParticipants = spinData.participants || [];
  const participants = rawParticipants.map(p => ({
    id: String(p.user_id),
    name: p.real_name || p.nickname || 'Deltagare',
    nickname: p.nickname || p.real_name || 'Deltagare',
    avatarEmoji: p.avatar_emoji || '🍻',
    isMe: currentUser && String(p.user_id) === String(currentUser.id)
  }));

  const loserId = String(spinData.loserId);
  const loserIndex = Math.max(0, participants.findIndex(p => p.id === loserId));
  const loser = participants[loserIndex];

  showModal(`
    <div class="live-roulette-spectator animate-in text-center" style="max-width: 440px; margin: 0 auto; text-align: left;">
      <div class="flex-between align-center mb-xs">
        <span class="badge badge-warning" style="font-size: 0.75rem; font-weight: 800;">
          🔴 LIVE NOT-ROULETTE
        </span>
        <span style="font-weight: 800; color: var(--gold); font-size: 0.9rem;">
          ${Math.round(spinData.totalAmount)} kr
        </span>
      </div>

      <div class="text-center mb-xs">
        <h3 class="font-heading" style="color: var(--gold); margin: 0 0 2px; font-size: 1.25rem;">
          ${escapeHtml(spinData.payer?.name || 'En vän')} snurrar om notan!
        </h3>
        <p class="text-muted" style="font-size: 0.8rem; margin: 0;">
          ${escapeHtml(spinData.title || 'Krognotan')}
        </p>
      </div>

      <!-- Arrow Pointer -->
      <div style="position: relative; z-index: 10; width: 0; height: 0; border-left: 14px solid transparent; border-right: 14px solid transparent; border-top: 22px solid #ef4444; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.8)); margin: 0 auto -10px auto;"></div>

      <!-- Canvas Wheel -->
      <div style="display: flex; justify-content: center;">
        <canvas id="live-spectator-wheel-canvas" width="280" height="280" style="max-width: 280px; max-height: 280px; width: 100%; border-radius: 50%; box-shadow: 0 4px 20px rgba(0,0,0,0.6);"></canvas>
      </div>

      <!-- Live Status Banner -->
      <div id="live-spectator-banner" class="mt-sm mb-xs text-center" style="font-family: var(--font-heading); font-size: 1rem; font-weight: 800; min-height: 28px; color: var(--gold); padding: 0 8px;">
        🌀 ${isEn ? 'The wheel is spinning live! Who takes the tab?' : 'Hjulet snurrar live! Vem tar notan?'}
      </div>

      <!-- Action Buttons Container (Revealed after spin) -->
      <div id="live-spectator-actions" class="mt-sm" style="display: none;"></div>
    </div>
  `);

  const canvas = document.getElementById('live-spectator-wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const numSectors = participants.length;
  const arc = (2 * Math.PI) / numSectors;
  const radius = 138;

  function drawWheel(rotation) {
    ctx.clearRect(0, 0, 280, 280);
    ctx.save();
    ctx.translate(140, 140);
    ctx.rotate(rotation);

    participants.forEach((p, i) => {
      const angle = i * arc;
      const color = PALETTE[i % PALETTE.length];

      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, angle, angle + arc);
      ctx.lineTo(0, 0);
      ctx.fill();

      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.save();
      ctx.rotate(angle + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 4;
      const fontSize = numSectors > 8 ? 11 : 13;
      ctx.font = `bold ${fontSize}px sans-serif`;
      const textToDraw = `${p.avatarEmoji} ${p.nickname}`;
      const trimmed = textToDraw.length > 12 ? textToDraw.slice(0, 11) + '…' : textToDraw;
      ctx.fillText(trimmed, radius - 14, 4);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(0, 0, radius - 2, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,215,0,0.9)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#111827';
    ctx.arc(0, 0, 20, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = 'var(--gold)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎰', 0, 0);

    ctx.restore();
  }

  // Calculate target rotation
  const targetSliceAngle = loserIndex * arc + arc / 2;
  const arrowAngle = 3 * Math.PI / 2; // 270 deg (top pointer)
  const normalizedTarget = (arrowAngle - targetSliceAngle + 2 * Math.PI) % (2 * Math.PI);
  const fullSpins = 6;
  const targetRotation = (fullSpins * 2 * Math.PI) + normalizedTarget;

  const duration = spinData.duration || 4200;
  const startTime = performance.now();
  let lastTickSector = -1;

  function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
  }

  function animateSpectator(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = easeOutCubic(progress);

    const currentRotation = targetRotation * eased;
    drawWheel(currentRotation);

    const currentAngleNorm = (arrowAngle - currentRotation) % (2 * Math.PI);
    const positiveAngle = (currentAngleNorm + 2 * Math.PI) % (2 * Math.PI);
    const currentSector = Math.floor(positiveAngle / arc) % numSectors;

    if (currentSector !== lastTickSector) {
      playTickSound();
      lastTickSector = currentSector;
    }

    if (progress < 1) {
      requestAnimationFrame(animateSpectator);
    } else {
      finishSpectator();
    }
  }

  requestAnimationFrame(animateSpectator);

  function finishSpectator() {
    playWinSound();
    launchConfetti();

    const banner = document.getElementById('live-spectator-banner');
    const actions = document.getElementById('live-spectator-actions');
    const isMeLoser = loser?.isMe;

    if (banner) {
      banner.style.color = isMeLoser ? '#ef4444' : 'var(--gold)';
      banner.innerHTML = isMeLoser
        ? `💸 ${isEn ? 'YOU LOST! You take the entire tab of' : 'DU FÖRLORADE! Du tar hela notan på'} ${Math.round(spinData.totalAmount)} kr!`
        : `🎉 ${isEn ? 'YOU SURVIVED!' : 'DU KLARADE DIG!'} ${escapeHtml(loser?.name || 'Någon')} ${isEn ? 'takes the whole tab!' : 'tar hela notan!'}`;
    }

    if (actions) {
      actions.style.display = 'block';
      actions.innerHTML = `
        ${isMeLoser ? `
          <button type="button" class="btn btn-secondary btn-block mb-xs" id="btn-spectator-veto-even" style="border-color: #10b981; color: #4ade80; font-weight: 800; padding: 10px; font-size: 0.85rem; background: rgba(16, 185, 129, 0.08);">
            ⚖️ ${isEn ? 'Convert to Even Steven (Split evenly instead)' : 'Gör om till Even Steven (Dela rakt istället)'}
          </button>
          <div class="text-center text-muted mb-sm" style="font-size: 0.72rem;">
            ${isEn ? 'Safety valve: Split the bill fairly instead of taking the whole tab.' : 'Säkerhetsventil: Dela notan rättvist istället för att ta hela notan.'}
          </div>
        ` : ''}
        <div class="flex gap-xs">
          <button type="button" class="btn btn-primary btn-block" id="btn-spectator-goto-swish" style="font-weight: 800; padding: 10px;">
            📱 ${isEn ? 'View in Swish List' : 'Öppna Swishlistan'}
          </button>
          <button type="button" class="btn btn-secondary" id="btn-spectator-close" style="padding: 10px;">
            ${isEn ? 'Close' : 'Stäng'}
          </button>
        </div>
      `;

      actions.querySelector('#btn-spectator-veto-even')?.addEventListener('click', async () => {
        const confirmMsg = isEn 
          ? 'Convert this roulette to an even split (Even Steven) among everyone?' 
          : 'Vill du göra om denna Not-Roulette till en rättvis splitt (Even Steven) mellan alla runt bordet?';
        if (confirm(confirmMsg)) {
          try {
            await convertTabExpenseToEvenSteven(spinData.expenseId);
            showToast(isEn ? 'Converted to Even Steven! ⚖️' : 'Notan gjordes om till Even Steven! ⚖️', 'success');
            closeModal();
            window.location.hash = '#leaderboard';
          } catch (e) {
            showToast(e.message, 'error');
          }
        }
      });

      actions.querySelector('#btn-spectator-goto-swish')?.addEventListener('click', () => {
        closeModal();
        window.location.hash = '#leaderboard';
      });

      actions.querySelector('#btn-spectator-close')?.addEventListener('click', () => {
        closeModal();
      });
    }
  }
}

export async function openNotanRouletteModal(initialMode = 'roulette') {
  const isEn = getLang() === 'en';
  const currentUser = getStoredUser();

  if (!currentUser) {
    showToast(isEn ? 'Please log in to use Not-Roulette or split bills!' : 'Logga in för att köra Not-Roulette eller dela notor!', 'warning');
    return;
  }

  const PALETTE = [
    '#e63946', '#f59e0b', '#10b981', '#3b82f6', 
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', 
    '#f97316', '#6366f1', '#14b8a6', '#d946ef'
  ];

  let activeMode = initialMode === 'even_steven' ? 'even_steven' : 'roulette';
  let totalAmount = 0;
  let customTitle = '';
  let customNotes = '';
  let receiptBase64 = null;
  let friends = [];
  let selectedFriendIds = new Set();
  let isSpinning = false;
  let currentRotation = 0;
  let evenSplitMode = 'equal'; // 'equal' | 'custom'
  let customShares = {}; // { [userId]: number }

  function getCustomSharesSummary(participants) {
    let allocatedSum = 0;
    participants.forEach(p => {
      const val = parseFloat(customShares[p.id]);
      if (!isNaN(val) && val > 0) {
        allocatedSum += val;
      }
    });
    allocatedSum = Math.round(allocatedSum * 100) / 100;
    const remaining = Math.round((totalAmount - allocatedSum) * 100) / 100;
    const isPerfect = totalAmount > 0 && Math.abs(remaining) <= 0.5;
    const isExceeded = remaining < -0.5;
    const isUnder = remaining > 0.5;
    return { allocatedSum, remaining, isPerfect, isExceeded, isUnder };
  }

  try {
    friends = await getFriends();
    // Default: select up to 5 friends automatically so roulette is ready to go
    if (friends && friends.length > 0) {
      friends.slice(0, 5).forEach(f => selectedFriendIds.add(String(f.id)));
    }
  } catch (e) {
    friends = [];
  }

  function getActiveParticipants() {
    const userItem = {
      id: String(currentUser.id),
      name: isEn ? 'You 🎯' : 'Du 🎯',
      nickname: currentUser.nickname || 'Du',
      avatarEmoji: currentUser.avatar_emoji || '👤',
      isMe: true
    };
    const chosenFriends = (friends || [])
      .filter(f => selectedFriendIds.has(String(f.id)))
      .map(f => ({
        id: String(f.id),
        name: f.realName || f.nickname || f.real_name,
        nickname: f.nickname || f.realName,
        avatarEmoji: f.avatar_emoji || f.avatarEmoji || '🍻',
        isMe: false
      }));
    return [userItem, ...chosenFriends];
  }

  function renderModal() {
    const participants = getActiveParticipants();
    const splitEach = participants.length > 0 && totalAmount > 0 
      ? Math.round((totalAmount / participants.length) * 100) / 100 
      : 0;
    const customSummary = getCustomSharesSummary(participants);

    showModal(`
      <div class="notan-roulette-modal animate-in" style="max-width: 440px; margin: 0 auto; text-align: left;">
        
        <!-- Mode Switcher Tabs -->
        <div class="flex gap-xs mb-md" style="background: rgba(0,0,0,0.35); padding: 4px; border-radius: var(--radius-md); border: 1px solid var(--border-glass);">
          <button type="button" class="btn btn-sm btn-mode-tab ${activeMode === 'roulette' ? 'btn-primary' : 'btn-ghost'}" data-mode="roulette" style="flex: 1; font-weight: 800; font-size: 0.85rem; padding: 8px 6px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
            <img src="/gold-card.png" alt="Card" style="width: 18px; height: 18px; object-fit: contain;" /> Not-Roulette
          </button>
          <button type="button" class="btn btn-sm btn-mode-tab ${activeMode === 'even_steven' ? 'btn-primary' : 'btn-ghost'}" data-mode="even_steven" style="flex: 1; font-weight: 800; font-size: 0.85rem; padding: 8px 6px;">
            ⚖️ Even Steven
          </button>
        </div>

        <!-- Mode Subtitle / Intro -->
        <div class="mb-sm text-center">
          <p class="text-muted" style="font-size: 0.8rem; margin: 0;">
            ${activeMode === 'roulette' 
              ? (isEn ? 'Spun the wheel! One unlucky person takes the ENTIRE tab! 💸' : 'Snurra hjulet! En otursfågel tar HELA krognotan! 💸') 
              : (isEn ? 'Fair and square: Split the bill evenly among everyone at the table! ⚖️' : 'Rättvist och schysst: Splitta notan rakt av mellan alla runt bordet! ⚖️')}
          </p>
        </div>

        <!-- Inputs: Amount & Title -->
        <div class="card mb-sm" style="padding: 12px; background: rgba(255,255,255,0.02);">
          
          <!-- Amount Input -->
          <div class="mb-xs">
            <label style="font-size: 0.75rem; font-weight: 700; color: var(--gold); text-transform: uppercase;">
              ${isEn ? 'Total Amount (SEK)' : 'Totalt Belopp (kr)'} *
            </label>
            <div class="flex align-center gap-xs mt-xs">
              <input type="number" id="notan-amount-input" class="form-input" placeholder="0" min="1" step="1" value="${totalAmount > 0 ? totalAmount : ''}" style="font-size: 1.3rem; font-weight: 900; color: var(--gold); text-align: center; padding: 8px;" />
              <span style="font-weight: 800; font-size: 1.1rem; color: var(--text-muted);">kr</span>
            </div>
          </div>

          <!-- Amount Quick Buttons -->
          <div class="flex gap-xs mb-sm" style="flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary btn-xs btn-quick-amount" data-add="100">+100</button>
            <button type="button" class="btn btn-secondary btn-xs btn-quick-amount" data-add="200">+200</button>
            <button type="button" class="btn btn-secondary btn-xs btn-quick-amount" data-add="500">+500</button>
            <button type="button" class="btn btn-secondary btn-xs btn-quick-amount" data-add="1000">+1000</button>
            <button type="button" class="btn btn-ghost btn-xs btn-quick-amount" data-clear="true" style="color: #ef4444; font-size: 0.7rem;">${isEn ? 'Clear' : 'Rensa'}</button>
          </div>

          <!-- Description Input -->
          <div class="mb-xs">
            <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">
              ${isEn ? 'Bar / Description' : 'Krog / Beskrivning'}
            </label>
            <input type="text" id="notan-title-input" class="form-input mt-xs" placeholder="${isEn ? 'e.g. 4x Draft beer & nachos at Bishops' : 't.ex. 4x Stor stark & nachos på Bishops'}" maxlength="60" value="${escapeHtml(customTitle)}" style="padding: 7px 10px; font-size: 0.85rem;" />
          </div>

          <!-- Receipt Photo Attachment -->
          <div class="mt-xs">
            <input type="file" id="notan-receipt-file" accept="image/*" capture="environment" style="display: none;" />
            <div class="flex-between align-center">
              <button type="button" class="btn btn-secondary btn-xs" id="btn-trigger-receipt-file" style="font-size: 0.75rem; padding: 5px 10px; border-color: rgba(255,215,0,0.3); color: var(--gold);">
                📷 ${receiptBase64 ? (isEn ? 'Change Receipt Photo' : 'Byt Kvittofoto') : (isEn ? 'Take Photo / Attach Receipt' : 'Fota / Bifoga kvitto')}
              </button>
              ${receiptBase64 ? `
                <button type="button" class="btn btn-ghost btn-xs" id="btn-remove-receipt-file" style="color: #ef4444; font-size: 0.72rem;">
                  ✕ ${isEn ? 'Remove photo' : 'Ta bort foto'}
                </button>
              ` : ''}
            </div>

            <!-- Receipt Thumbnail Preview -->
            ${receiptBase64 ? `
              <div class="mt-xs flex align-center gap-xs" style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-glass); border-radius: var(--radius-sm); padding: 6px 10px;">
                <img src="${receiptBase64}" alt="Förhandsgranskning" style="width: 42px; height: 42px; object-fit: cover; border-radius: 4px; border: 1px solid var(--gold);" />
                <div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.2;">
                  <strong style="color: #4ade80;">✓ ${isEn ? 'Receipt attached' : 'Kvitto bifogat'}</strong><br/>
                  <span class="text-muted">${isEn ? 'Visible to all participants in Swish list' : 'Syns för alla deltagare i Swishlistan'}</span>
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Participants Selector -->
        <div class="card mb-md" style="padding: 12px; background: rgba(255,255,255,0.02);">
          <div class="flex-between mb-xs" style="align-items: center;">
            <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);">
              👥 ${isEn ? 'Friends at the table' : 'Vilka är med runt bordet?'} (${participants.length} ${isEn ? 'pers' : 'pers'})
            </label>
            <button type="button" class="btn btn-ghost btn-xs" id="btn-toggle-all-friends" style="font-size: 0.7rem; color: var(--gold); padding: 2px 6px;">
              ${selectedFriendIds.size === friends.length ? (isEn ? 'Uncheck all' : 'Avmarkera alla') : (isEn ? 'Check all' : 'Markera alla')}
            </button>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 120px; overflow-y: auto; padding: 4px 0;">
            <!-- Payer / You (Always included) -->
            <span class="badge" style="background: rgba(74, 222, 128, 0.15); border: 1px solid #4ade80; color: #4ade80; font-weight: 700; padding: 4px 8px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;">
              ${escapeHtml(currentUser.avatar_emoji || '👤')} ${isEn ? 'You (Payer)' : 'Du (Lade ut)'}
            </span>

            ${friends.length === 0 ? `
              <span class="text-muted" style="font-size: 0.75rem; font-style: italic;">
                ${isEn ? 'No friends added yet. Add friends under Profile!' : 'Inga vänner tillagda än. Lägg till vänner i profilen!'}
              </span>
            ` : friends.map(f => {
              const isSelected = selectedFriendIds.has(String(f.id));
              const name = f.realName || f.nickname || f.real_name;
              return `
                <button type="button" class="btn-friend-pill" data-friend-id="${f.id}" style="border: 1px solid ${isSelected ? 'var(--gold)' : 'rgba(255,255,255,0.1)'}; background: ${isSelected ? 'rgba(245, 158, 11, 0.15)' : 'rgba(0,0,0,0.2)'}; color: ${isSelected ? 'var(--gold)' : 'var(--text-muted)'}; font-size: 0.75rem; font-weight: ${isSelected ? '700' : '500'}; padding: 4px 8px; border-radius: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.15s ease;">
                  <span>${escapeHtml(f.avatar_emoji || f.avatarEmoji || '🍻')}</span>
                  <span>${escapeHtml(name)}</span>
                  <span style="font-size: 0.65rem;">${isSelected ? '✓' : '+'}</span>
                </button>`;
            }).join('')}
          </div>
        </div>

        <!-- MODE SPECIFIC SECTION -->

        ${activeMode === 'roulette' ? `
          <!-- ROULETTE WHEEL VIEW -->
          <div class="roulette-wheel-container text-center mb-md" style="position: relative; display: flex; flex-direction: column; align-items: center;">
            
            <!-- Wheel Arrow Pointer -->
            <div style="position: relative; z-index: 10; width: 0; height: 0; border-left: 14px solid transparent; border-right: 14px solid transparent; border-top: 22px solid #ef4444; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.8)); margin-bottom: -10px;"></div>

            <!-- Canvas Wheel -->
            <canvas id="notan-wheel-canvas" width="280" height="280" style="max-width: 280px; max-height: 280px; width: 100%; border-radius: 50%; box-shadow: 0 4px 20px rgba(0,0,0,0.6);"></canvas>

            <!-- Result Banner -->
            <div id="notan-roulette-banner" class="mt-sm mb-xs" style="font-family: var(--font-heading); font-size: 1rem; font-weight: 800; min-height: 28px; color: var(--gold); padding: 0 8px;">
              ${participants.length < 2 
                ? (isEn ? '⚠️ Select at least 1 friend!' : '⚠️ Välj minst 1 kompis runt bordet!') 
                : (totalAmount <= 0 
                  ? (isEn ? 'Ange belopp ovanför för att snurra!' : 'Ange belopp ovanför för att snurra!') 
                  : (isEn ? `Ready! Who pays ${totalAmount} kr? 🎰` : `Klara! Vem tar notan på ${totalAmount} kr? 🎰`))}
            </div>

            <!-- Spin Button -->
            <button type="button" class="btn btn-primary btn-block mb-xs" id="btn-spin-notan-roulette" ${participants.length < 2 || totalAmount <= 0 ? 'disabled' : ''} style="font-size: 1.15rem; font-weight: 900; padding: 14px; background: linear-gradient(135deg, #f59e0b, #d97706); border: none; box-shadow: 0 6px 20px rgba(245,158,11,0.4);">
              🎰 ${isEn ? 'SPIN NOT-ROULETTE!' : 'SNURRA NOT-ROULETTE!'}
            </button>

            <!-- Chicken out link -->
            <div class="text-center mt-xs">
              <a href="#" id="link-switch-to-even" style="font-size: 0.8rem; color: var(--text-muted); text-decoration: underline;">
                ${isEn ? '🐔 Chicken out? Split evenly with Even Steven' : '🐔 Fega ur? Dela rakt med Even Steven istället'}
              </a>
            </div>
          </div>
        ` : `
          <!-- EVEN STEVEN VIEW -->
          <div class="even-steven-container mb-md">
            
            <!-- Sub-mode switcher (Dela lika vs Anpassa) -->
            <div class="flex gap-xs mb-sm" style="background: rgba(0,0,0,0.35); padding: 3px; border-radius: var(--radius-sm); border: 1px solid var(--border-glass);">
              <button type="button" class="btn btn-xs btn-even-submode ${evenSplitMode === 'equal' ? 'btn-primary' : 'btn-ghost'}" data-submode="equal" style="flex: 1; font-weight: 700; font-size: 0.75rem; padding: 6px 8px;">
                ${t('arcade.splitEqual') || '⚖️ Dela lika'}
              </button>
              <button type="button" class="btn btn-xs btn-even-submode ${evenSplitMode === 'custom' ? 'btn-primary' : 'btn-ghost'}" data-submode="custom" style="flex: 1; font-weight: 700; font-size: 0.75rem; padding: 6px 8px;">
                ${t('arcade.splitCustom') || '✏️ Anpassa per person'}
              </button>
            </div>

            ${evenSplitMode === 'equal' ? `
              <!-- Calculation Card -->
              <div class="card mb-sm text-center" style="background: rgba(74, 222, 128, 0.08); border-color: rgba(74, 222, 128, 0.3); padding: 14px;">
                <div style="font-size: 0.75rem; font-weight: 700; color: #4ade80; text-transform: uppercase;">
                  ${isEn ? 'Fair Split (Per Person)' : 'Rättvis Fördelning (Per Person)'}
                </div>
                <div style="font-size: 1.8rem; font-weight: 900; color: #4ade80; margin: 4px 0;">
                  ${splitEach} kr <span style="font-size: 0.9rem; font-weight: 600; color: var(--text-muted);">/ pers</span>
                </div>
                <div class="text-muted" style="font-size: 0.75rem;">
                  ${totalAmount} kr / ${participants.length} ${isEn ? 'people' : 'personer'}
                </div>
              </div>

              <!-- Breakdown List -->
              <div class="mb-sm" style="display: flex; flex-direction: column; gap: 4px;">
                ${participants.map(p => {
                  return `
                    <div class="flex-between align-center" style="padding: 6px 10px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); font-size: 0.8rem;">
                      <div class="flex align-center gap-xs">
                        <span>${escapeHtml(p.avatarEmoji)}</span>
                        <span style="font-weight: 600;">${escapeHtml(p.name)}</span>
                        ${p.isMe ? `<span class="badge badge-warning" style="font-size: 0.65rem; padding: 1px 4px;">${isEn ? 'Payer' : 'Lade ut'}</span>` : ''}
                      </div>
                      <div style="font-weight: 700; color: ${p.isMe ? '#4ade80' : 'var(--gold)'};">
                        ${p.isMe ? `${isEn ? 'Paid' : 'Lade ut'} ${totalAmount} kr` : `${isEn ? 'Owes you' : 'Ska swisha dig'} ${splitEach} kr`}
                      </div>
                    </div>`;
                }).join('')}
              </div>

              <!-- Submit Even Steven Button -->
              <button type="button" class="btn btn-primary btn-block" id="btn-submit-even-steven" ${participants.length < 2 || totalAmount <= 0 ? 'disabled' : ''} style="font-size: 1.1rem; font-weight: 800; padding: 14px; background: linear-gradient(135deg, #10b981, #059669); border: none; box-shadow: 0 4px 16px rgba(16,185,129,0.3);">
                ⚖️ ${isEn ? `SPLIT TAB (${splitEach} kr each)` : `DELA NOTAN (${splitEach} kr var)`}
              </button>
            ` : `
              <!-- Custom Breakdown & Inputs Card -->
              <div class="card mb-sm" style="background: rgba(255,255,255,0.02); padding: 12px; border-color: rgba(255,255,255,0.08);">
                <div class="flex-between align-center mb-xs">
                  <span style="font-size: 0.75rem; font-weight: 700; color: var(--gold); text-transform: uppercase;">
                    ${t('arcade.splitCustom') || 'Anpassa per person'}
                  </span>
                  <span id="custom-split-allocated-text" style="font-size: 0.78rem; font-weight: 800; color: ${customSummary.isPerfect ? '#4ade80' : (customSummary.isExceeded ? '#ef4444' : 'var(--gold)')};">
                    ${customSummary.allocatedSum} / ${totalAmount} kr
                  </span>
                </div>

                <!-- Status banner -->
                <div id="custom-split-summary-badge" class="mb-sm p-xs text-center" style="font-size: 0.75rem; border-radius: var(--radius-sm); background: ${customSummary.isPerfect ? 'rgba(74, 222, 128, 0.12)' : (customSummary.isExceeded ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)')}; color: ${customSummary.isPerfect ? '#4ade80' : (customSummary.isExceeded ? '#ef4444' : 'var(--gold)')}; font-weight: 700;">
                  ${customSummary.isPerfect 
                    ? `✓ ${t('arcade.splitMatch') || 'Stämmer perfekt!'}` 
                    : (customSummary.isExceeded 
                      ? `⚠️ ${t('arcade.splitExceeded') || 'Överskrider notan med'} ${Math.round(-customSummary.remaining)} kr!` 
                      : `⚠️ ${t('arcade.splitRemaining') || 'Kvar att fördela'}: ${Math.round(customSummary.remaining)} kr`)}
                </div>

                <!-- Participant inputs list -->
                <div style="display: flex; flex-direction: column; gap: 6px;">
                  ${participants.map(p => {
                    const val = customShares[p.id] !== undefined ? customShares[p.id] : '';
                    return `
                      <div class="flex-between align-center" style="padding: 6px 8px; background: rgba(0,0,0,0.25); border-radius: var(--radius-sm); border: 1px solid var(--border-glass);">
                        <div class="flex align-center gap-xs" style="flex: 1; min-width: 0;">
                          <span>${escapeHtml(p.avatarEmoji)}</span>
                          <span style="font-weight: 600; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.name)}</span>
                          ${p.isMe ? `<span class="badge badge-warning" style="font-size: 0.6rem; padding: 1px 4px;">${isEn ? 'Payer' : 'Lade ut'}</span>` : ''}
                        </div>
                        <div class="flex align-center gap-xs" style="flex-shrink: 0;">
                          <input type="number" class="form-input custom-share-input" data-user-id="${p.id}" value="${val}" placeholder="0" min="0" step="any" style="width: 85px; text-align: right; font-weight: 800; font-size: 0.85rem; padding: 4px 6px; color: ${p.isMe ? '#4ade80' : 'var(--gold)'}; border-color: rgba(255,255,255,0.15);" />
                          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">kr</span>
                        </div>
                      </div>`;
                  }).join('')}
                </div>

                <!-- Auto-distribute remainder button -->
                <div id="btn-distribute-container" class="mt-xs text-center" style="${customSummary.isUnder ? '' : 'display: none;'}">
                  <button type="button" class="btn btn-ghost btn-xs" id="btn-distribute-remaining" style="color: var(--gold); font-size: 0.72rem; text-decoration: underline; padding: 4px 8px;">
                    ${t('arcade.splitDistributeRest') || '⚡ Dela resten jämnt'} (<span id="distribute-remaining-amount">${Math.round(customSummary.remaining)}</span> kr)
                  </button>
                </div>
              </div>

              <!-- Submit Custom Split Button -->
              <button type="button" class="btn btn-primary btn-block" id="btn-submit-even-steven" ${participants.length < 2 || totalAmount <= 0 || !customSummary.isPerfect ? 'disabled' : ''} style="font-size: 1.1rem; font-weight: 800; padding: 14px; background: ${customSummary.isPerfect ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.1)'}; border: none; box-shadow: ${customSummary.isPerfect ? '0 4px 16px rgba(16,185,129,0.3)' : 'none'}; cursor: ${customSummary.isPerfect ? 'pointer' : 'not-allowed'};">
                ${t('arcade.customSplitBtn') || '⚖️ DELA NOTAN (ANPASSAT)'}
              </button>
            `}
          </div>
        `}

        <div class="text-center mt-sm">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-cancel-notan-roulette" style="color: var(--text-muted); font-size: 0.8rem;">
            ${isEn ? 'Cancel' : 'Avbryt'}
          </button>
        </div>

      </div>
    `);

    // Attach listeners
    attachListeners();
  }

  function drawWheel(rotation = currentRotation) {
    const canvas = document.getElementById('notan-wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const participants = getActiveParticipants();
    const numSectors = participants.length;

    ctx.clearRect(0, 0, 280, 280);

    if (numSectors < 2) {
      ctx.beginPath();
      ctx.fillStyle = '#1f2937';
      ctx.arc(140, 140, 138, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#9ca3af';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isEn ? 'Select at least 2 friends!' : 'Välj minst 2 deltagare!', 140, 140);
      return;
    }

    const arc = (2 * Math.PI) / numSectors;
    const radius = 138;

    ctx.save();
    ctx.translate(140, 140);
    ctx.rotate(rotation);

    participants.forEach((p, i) => {
      const angle = i * arc;
      const color = PALETTE[i % PALETTE.length];

      // Slice
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, angle, angle + arc);
      ctx.lineTo(0, 0);
      ctx.fill();

      // Border
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label & Emoji
      ctx.save();
      ctx.rotate(angle + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 4;
      const fontSize = numSectors > 8 ? 11 : 13;
      ctx.font = `bold ${fontSize}px sans-serif`;
      const textToDraw = `${p.avatarEmoji} ${p.nickname}`;
      const trimmed = textToDraw.length > 12 ? textToDraw.slice(0, 11) + '…' : textToDraw;
      ctx.fillText(trimmed, radius - 14, 4);
      ctx.restore();
    });

    // Outer gold ring
    ctx.beginPath();
    ctx.arc(0, 0, radius - 2, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,215,0,0.9)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Center hub
    ctx.beginPath();
    ctx.fillStyle = '#111827';
    ctx.arc(0, 0, 20, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = 'var(--gold)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎰', 0, 0);

    ctx.restore();
  }

  function attachListeners() {
    // Mode tabs
    document.querySelectorAll('.btn-mode-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (isSpinning) return;
        activeMode = btn.getAttribute('data-mode');
        renderModal();
        if (activeMode === 'roulette') drawWheel();
      });
    });

    // Chicken out link in roulette
    document.getElementById('link-switch-to-even')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (isSpinning) return;
      activeMode = 'even_steven';
      renderModal();
    });

    // Amount input
    const amountInput = document.getElementById('notan-amount-input');
    amountInput?.addEventListener('input', () => {
      totalAmount = Math.max(0, parseFloat(amountInput.value) || 0);
      updateButtonsAndBanner();
    });

    // Quick amount buttons
    document.querySelectorAll('.btn-quick-amount').forEach(btn => {
      btn.addEventListener('click', () => {
        if (isSpinning) return;
        if (btn.getAttribute('data-clear') === 'true') {
          totalAmount = 0;
        } else {
          const add = parseFloat(btn.getAttribute('data-add')) || 0;
          totalAmount += add;
        }
        if (amountInput) amountInput.value = totalAmount > 0 ? totalAmount : '';
        updateButtonsAndBanner();
        if (activeMode === 'even_steven') {
          renderModal();
        }
      });
    });

    // Title input
    const titleInput = document.getElementById('notan-title-input');
    titleInput?.addEventListener('input', () => {
      customTitle = titleInput.value;
    });

    // Receipt photo triggers
    const receiptFileInput = document.getElementById('notan-receipt-file');
    document.getElementById('btn-trigger-receipt-file')?.addEventListener('click', () => {
      if (isSpinning) return;
      receiptFileInput?.click();
    });

    receiptFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        showToast(isEn ? 'Compressing receipt photo... 📷' : 'Komprimerar kvittofoto... 📷', 'info');
        receiptBase64 = await compressImage(file, 1000, 0.8);
        showToast(isEn ? 'Receipt photo attached! 🧾' : 'Kvitto bifogat! 🧾', 'success');
        renderModal();
        if (activeMode === 'roulette') drawWheel();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('btn-remove-receipt-file')?.addEventListener('click', () => {
      if (isSpinning) return;
      receiptBase64 = null;
      renderModal();
      if (activeMode === 'roulette') drawWheel();
    });

    // Friend selection toggles
    document.querySelectorAll('.btn-friend-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        if (isSpinning) return;
        const friendId = btn.getAttribute('data-friend-id');
        if (selectedFriendIds.has(friendId)) {
          selectedFriendIds.delete(friendId);
        } else {
          selectedFriendIds.add(friendId);
        }
        renderModal();
        if (activeMode === 'roulette') drawWheel();
      });
    });

    // Toggle all friends
    document.getElementById('btn-toggle-all-friends')?.addEventListener('click', () => {
      if (isSpinning) return;
      if (selectedFriendIds.size === friends.length) {
        selectedFriendIds.clear();
      } else {
        friends.forEach(f => selectedFriendIds.add(String(f.id)));
      }
      renderModal();
      if (activeMode === 'roulette') drawWheel();
    });

    // Even Steven submode switcher (Equal vs Custom)
    document.querySelectorAll('.btn-even-submode').forEach(btn => {
      btn.addEventListener('click', () => {
        if (isSpinning) return;
        evenSplitMode = btn.getAttribute('data-submode');
        if (evenSplitMode === 'custom') {
          const parts = getActiveParticipants();
          const hasAny = Object.keys(customShares).some(k => parseFloat(customShares[k]) > 0);
          if (!hasAny && totalAmount > 0 && parts.length > 0) {
            const each = Math.round((totalAmount / parts.length) * 100) / 100;
            parts.forEach(p => { customShares[p.id] = each; });
          }
        }
        renderModal();
      });
    });

    // Real-time custom share inputs (keeps focus while typing!)
    function updateCustomSummaryUI() {
      const parts = getActiveParticipants();
      const sum = getCustomSharesSummary(parts);
      
      const allocText = document.getElementById('custom-split-allocated-text');
      if (allocText) {
        allocText.textContent = `${sum.allocatedSum} / ${totalAmount} kr`;
        allocText.style.color = sum.isPerfect ? '#4ade80' : (sum.isExceeded ? '#ef4444' : 'var(--gold)');
      }

      const badge = document.getElementById('custom-split-summary-badge');
      if (badge) {
        badge.style.background = sum.isPerfect ? 'rgba(74, 222, 128, 0.12)' : (sum.isExceeded ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)');
        badge.style.color = sum.isPerfect ? '#4ade80' : (sum.isExceeded ? '#ef4444' : 'var(--gold)');
        badge.innerHTML = sum.isPerfect 
          ? `✓ ${t('arcade.splitMatch') || 'Stämmer perfekt!'}` 
          : (sum.isExceeded 
            ? `⚠️ ${t('arcade.splitExceeded') || 'Överskrider notan med'} ${Math.round(-sum.remaining)} kr!` 
            : `⚠️ ${t('arcade.splitRemaining') || 'Kvar att fördela'}: ${Math.round(sum.remaining)} kr`);
      }

      const distContainer = document.getElementById('btn-distribute-container');
      const distAmt = document.getElementById('distribute-remaining-amount');
      if (distContainer) {
        distContainer.style.display = sum.isUnder ? '' : 'none';
      }
      if (distAmt) {
        distAmt.textContent = Math.round(sum.remaining);
      }

      const evenBtn = document.getElementById('btn-submit-even-steven');
      if (evenBtn) {
        const canSubmit = parts.length >= 2 && totalAmount > 0 && sum.isPerfect;
        evenBtn.disabled = !canSubmit;
        evenBtn.style.background = canSubmit ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255,255,255,0.1)';
        evenBtn.style.boxShadow = canSubmit ? '0 4px 16px rgba(16,185,129,0.3)' : 'none';
        evenBtn.style.cursor = canSubmit ? 'pointer' : 'not-allowed';
      }
    }

    document.querySelectorAll('.custom-share-input').forEach(input => {
      input.addEventListener('input', () => {
        const uid = input.getAttribute('data-user-id');
        const val = parseFloat(input.value);
        if (isNaN(val) || val < 0) {
          customShares[uid] = 0;
        } else {
          customShares[uid] = val;
        }
        updateCustomSummaryUI();
      });
    });

    // Distribute remainder equally
    document.getElementById('btn-distribute-remaining')?.addEventListener('click', () => {
      const parts = getActiveParticipants();
      const sum = getCustomSharesSummary(parts);
      if (!sum.isUnder || sum.remaining <= 0) return;

      const zeroParts = parts.filter(p => !customShares[p.id] || customShares[p.id] <= 0);
      const targetParts = zeroParts.length > 0 ? zeroParts : parts;
      const share = Math.round((sum.remaining / targetParts.length) * 100) / 100;
      targetParts.forEach(p => {
        customShares[p.id] = (customShares[p.id] || 0) + share;
      });
      renderModal();
    });

    // Cancel button
    document.getElementById('btn-cancel-notan-roulette')?.addEventListener('click', () => {
      if (!isSpinning) closeModal();
    });

    // Spin Roulette Button
    document.getElementById('btn-spin-notan-roulette')?.addEventListener('click', () => {
      if (isSpinning) return;
      handleSpinRoulette();
    });

    // Submit Even Steven Button
    document.getElementById('btn-submit-even-steven')?.addEventListener('click', () => {
      handleSubmitEvenSteven();
    });
  }

  function updateButtonsAndBanner() {
    const participants = getActiveParticipants();
    const canProceed = participants.length >= 2 && totalAmount > 0;

    const spinBtn = document.getElementById('btn-spin-notan-roulette');
    if (spinBtn) spinBtn.disabled = !canProceed;

    const evenBtn = document.getElementById('btn-submit-even-steven');
    if (evenBtn) {
      if (evenSplitMode === 'custom') {
        const sum = getCustomSharesSummary(participants);
        evenBtn.disabled = !canProceed || !sum.isPerfect;
      } else {
        evenBtn.disabled = !canProceed;
      }
    }

    const banner = document.getElementById('notan-roulette-banner');
    if (banner) {
      if (participants.length < 2) {
        banner.textContent = isEn ? '⚠️ Select at least 1 friend!' : '⚠️ Välj minst 1 kompis runt bordet!';
        banner.style.color = '#ef4444';
      } else if (totalAmount <= 0) {
        banner.textContent = isEn ? 'Ange belopp ovanför för att snurra!' : 'Ange belopp ovanför för att snurra!';
        banner.style.color = 'var(--text-muted)';
      } else {
        banner.textContent = isEn ? `Ready! Who pays ${totalAmount} kr? 🎰` : `Klara! Vem tar notan på ${totalAmount} kr? 🎰`;
        banner.style.color = 'var(--gold)';
      }
    }
  }

  // ── Handle Spin Roulette ─────────────────────────────
  async function handleSpinRoulette() {
    const participants = getActiveParticipants();
    if (participants.length < 2 || totalAmount <= 0) return;

    isSpinning = true;
    const spinBtn = document.getElementById('btn-spin-notan-roulette');
    if (spinBtn) {
      spinBtn.disabled = true;
      spinBtn.innerHTML = `🌀 ${isEn ? 'STARTING LIVE NOT-ROULETTE...' : 'STARTAR LIVE NOT-ROULETTE...'}`;
    }

    const cleanTitle = (customTitle && customTitle.trim()) ? customTitle.trim() : (isEn ? 'Tab Roulette' : 'Not-Roulette');

    try {
      // 1. Call server: dispatches heads-up push and broadcasts live spin via WebSocket to all participants!
      const participantIds = participants.map(p => p.id);
      const liveRes = await startLiveNotanRoulette({
        title: cleanTitle,
        notes: customNotes || null,
        totalAmount,
        participantIds,
        receiptImage: receiptBase64
      });

      const actualLoserId = String(liveRes.loserId);
      const loserIndex = Math.max(0, participants.findIndex(p => String(p.id) === actualLoserId));
      const loser = participants[loserIndex];

      const numSectors = participants.length;
      const arc = (2 * Math.PI) / numSectors;

      // Arrow is at top (angle -PI/2)
      const targetSliceAngle = loserIndex * arc + arc / 2;
      const arrowAngle = 3 * Math.PI / 2; // 270 deg (top pointer)
      const normalizedTarget = (arrowAngle - targetSliceAngle + 2 * Math.PI) % (2 * Math.PI);

      const fullSpins = 6;
      const targetRotation = currentRotation + (fullSpins * 2 * Math.PI) + ((normalizedTarget - (currentRotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));

      const duration = liveRes.duration || 4200;
      const startTime = performance.now();
      const startRotation = currentRotation;
      let lastTickSector = -1;

      function easeOutCubic(x) {
        return 1 - Math.pow(1 - x, 3);
      }

      function animateSpin(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = easeOutCubic(progress);

        currentRotation = startRotation + (targetRotation - startRotation) * eased;
        drawWheel(currentRotation);

        const currentAngleNorm = (arrowAngle - currentRotation) % (2 * Math.PI);
        const positiveAngle = (currentAngleNorm + 2 * Math.PI) % (2 * Math.PI);
        const currentSector = Math.floor(positiveAngle / arc) % numSectors;

        if (currentSector !== lastTickSector) {
          playTickSound();
          lastTickSector = currentSector;
        }

        if (progress < 1) {
          requestAnimationFrame(animateSpin);
        } else {
          isSpinning = false;
          finishRoulette(loser, participants, liveRes.expense);
        }
      }

      requestAnimationFrame(animateSpin);

    } catch (err) {
      isSpinning = false;
      showToast(err.message, 'error');
      if (spinBtn) {
        spinBtn.disabled = false;
        spinBtn.innerHTML = `🎰 ${isEn ? 'SPIN NOT-ROULETTE!' : 'SNURRA NOT-ROULETTE!'}`;
      }
    }
  }

  async function finishRoulette(loser, participants, createdExpense) {
    const banner = document.getElementById('notan-roulette-banner');
    playWinSound();
    launchConfetti();

    const isMeLoser = loser.id === String(currentUser.id);
    const cleanTitle = (customTitle && customTitle.trim()) ? customTitle.trim() : (isEn ? 'Tab Roulette' : 'Not-Roulette');

    if (banner) {
      banner.style.color = isMeLoser ? '#ef4444' : 'var(--gold)';
      banner.innerHTML = isMeLoser 
        ? `💸 ${isEn ? 'YOU LOST! You pay the whole tab of' : 'DU FÖRLORADE! Du tar hela notan på'} ${totalAmount} kr! 🍻` 
        : `🎉 ${escapeHtml(loser.name)} ${isEn ? 'lost and pays the whole tab of' : 'förlorade och tar hela notan på'} ${totalAmount} kr!`;
    }

    // Show completed modal view
    showModal(`
      <div class="animate-in text-center" style="max-width: 420px; margin: 0 auto; padding: 10px 0;">
        <div style="font-size: 3.5rem; margin-bottom: 8px;">${isMeLoser ? '🍻' : '💸'}</div>
        
        <span class="badge badge-danger mb-xs" style="font-size: 0.8rem; font-weight: 800; padding: 4px 10px;">
          🎰 NOT-ROULETTE AVGJORD!
        </span>

        <h2 class="font-heading" style="color: var(--gold); margin: 8px 0 6px; font-size: 1.4rem;">
          ${isMeLoser 
            ? (isEn ? 'You took the tab!' : 'Du åkte på hela notan!') 
            : (isEn ? `${escapeHtml(loser.name)} pays the tab!` : `${escapeHtml(loser.name)} tar hela notan!`)}
        </h2>

        <div class="card my-md" style="padding: 14px; background: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.3);">
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--gold); text-transform: uppercase;">
            ${escapeHtml(cleanTitle)}
          </div>
          <div style="font-size: 1.8rem; font-weight: 900; color: var(--gold); margin: 4px 0;">
            ${totalAmount} kr
          </div>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">
            ${isMeLoser 
              ? (isEn ? 'You paid and lost the roulette. Cheers to you!' : 'Du lade ut och förlorade rouletten. Du bjöd hela bordet!') 
              : (isEn ? `${escapeHtml(loser.name)} is now registered as owing you ${totalAmount} kr in your Swish list!` : `${escapeHtml(loser.name)} är nu skyldig dig ${totalAmount} kr i din Swishlista!`)}
          </div>
        </div>

        ${receiptBase64 ? `
          <div class="mb-md flex align-center justify-center gap-xs" style="font-size: 0.8rem; color: #4ade80;">
            <span>🧾 ${isEn ? 'Receipt photo saved & attached' : 'Kvittofoto sparat och bifogat'}</span>
          </div>
        ` : ''}

        ${isMeLoser && createdExpense ? `
          <div class="mb-md">
            <button type="button" class="btn btn-secondary btn-block" id="btn-payer-veto-even" style="border-color: #10b981; color: #4ade80; font-weight: 800; padding: 10px; font-size: 0.85rem; background: rgba(16, 185, 129, 0.08);">
              ⚖️ ${isEn ? 'Convert to Even Steven (Split evenly)' : 'Gör om till Even Steven (Dela rakt)'}
            </button>
            <div class="text-center text-muted mt-xs" style="font-size: 0.72rem;">
              ${isEn ? 'Safety valve: Split the bill fairly instead of taking the whole tab.' : 'Säkerhetsventil: Dela notan rättvist istället för att bjuda på allt.'}
            </div>
          </div>
        ` : ''}

        <div class="flex gap-xs">
          <button type="button" class="btn btn-primary btn-block" id="btn-done-goto-swish" style="font-weight: 800; padding: 12px;">
            📱 ${isEn ? 'View in Swish List' : 'Öppna Swishlistan'}
          </button>
          <button type="button" class="btn btn-secondary" id="btn-done-close" style="padding: 12px;">
            ${isEn ? 'Done' : 'Klar'}
          </button>
        </div>
      </div>
    `);

    document.getElementById('btn-payer-veto-even')?.addEventListener('click', async () => {
      const confirmMsg = isEn 
        ? 'Convert this roulette to an even split (Even Steven) among everyone?' 
        : 'Vill du göra om denna Not-Roulette till en rättvis splitt (Even Steven) mellan alla runt bordet?';
      if (confirm(confirmMsg)) {
        try {
          await convertTabExpenseToEvenSteven(createdExpense.id);
          showToast(isEn ? 'Converted to Even Steven! ⚖️' : 'Notan gjordes om till Even Steven! ⚖️', 'success');
          closeModal();
          window.location.hash = '#leaderboard';
        } catch (e) {
          showToast(e.message, 'error');
        }
      }
    });

    document.getElementById('btn-done-goto-swish')?.addEventListener('click', () => {
      closeModal();
      window.location.hash = '#leaderboard';
    });

    document.getElementById('btn-done-close')?.addEventListener('click', () => {
      closeModal();
    });
  }

  // ── Handle Submit Even Steven ────────────────────────
  async function handleSubmitEvenSteven() {
    const participants = getActiveParticipants();
    if (participants.length < 2 || totalAmount <= 0) return;

    if (evenSplitMode === 'custom') {
      const sum = getCustomSharesSummary(participants);
      if (!sum.isPerfect) {
        showToast(
          sum.isExceeded 
            ? `${isEn ? 'Total allocated shares exceed tab by' : 'Fördelade belopp överskrider notan med'} ${Math.round(-sum.remaining)} kr!`
            : `${isEn ? 'Remaining to allocate:' : 'Kvar att fördela:'} ${Math.round(sum.remaining)} kr!`,
          'warning'
        );
        return;
      }
    }

    const splitEach = Math.round((totalAmount / participants.length) * 100) / 100;
    const cleanTitle = (customTitle && customTitle.trim()) ? customTitle.trim() : (isEn ? 'Even Steven' : 'Dela nota');

    const submitBtn = document.getElementById('btn-submit-even-steven');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = isEn ? 'Registering...' : 'Registrerar nota...';
    }

    try {
      const participantIds = participants.map(p => p.id);
      const payload = {
        title: cleanTitle,
        notes: customNotes || null,
        totalAmount,
        mode: 'even_steven',
        participantIds,
        receiptImage: receiptBase64
      };
      if (evenSplitMode === 'custom') {
        payload.customShares = customShares;
      }

      await createTabExpense(payload);

      playWinSound();
      launchConfetti();

      showModal(`
        <div class="animate-in text-center" style="max-width: 400px; margin: 0 auto; padding: 10px 0;">
          <div style="font-size: 3.2rem; margin-bottom: 8px;">⚖️</div>
          
          <span class="badge badge-primary mb-xs" style="font-size: 0.8rem; font-weight: 800; padding: 4px 10px;">
            ${evenSplitMode === 'custom' ? (isEn ? 'CUSTOM SPLIT SAVED!' : 'ANPASSAD NOTA SPARAD!') : 'EVEN STEVEN REGISTRERAD!'}
          </span>

          <h2 class="font-heading" style="color: #4ade80; margin: 8px 0 6px; font-size: 1.35rem;">
            ${evenSplitMode === 'custom' ? (isEn ? 'Bill Split with Custom Shares!' : 'Notan är delad med anpassade belopp!') : (isEn ? 'Bill Split Evenly!' : 'Notan är delad rakt av!')}
          </h2>

          <div class="card my-md" style="padding: 14px; background: rgba(74, 222, 128, 0.08); border-color: rgba(74, 222, 128, 0.3);">
            <div style="font-size: 0.75rem; font-weight: 700; color: #4ade80; text-transform: uppercase;">
              ${escapeHtml(cleanTitle)}
            </div>
            <div style="font-size: 1.8rem; font-weight: 900; color: #4ade80; margin: 4px 0;">
              ${totalAmount} kr
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">
              ${evenSplitMode === 'custom' 
                ? (isEn ? `Individual debts saved for ${participants.length - 1} friends.` : `Individuella skulder sparade för ${participants.length - 1} vänner.`)
                : (isEn ? `Registered ${participants.length - 1} friend debts in your Swish list (${splitEach} kr each).` : `Registrerade ${participants.length - 1} polares skulder i din Swishlista (${splitEach} kr var).`)}
            </div>
          </div>

          <div class="flex gap-xs">
            <button type="button" class="btn btn-primary btn-block" id="btn-even-goto-swish" style="font-weight: 800; padding: 12px; background: #10b981;">
              📱 ${isEn ? 'View in Swish List' : 'Öppna Swishlistan'}
            </button>
            <button type="button" class="btn btn-secondary" id="btn-even-close" style="padding: 12px;">
              ${isEn ? 'Done' : 'Klar'}
            </button>
          </div>
        </div>
      `);

      document.getElementById('btn-even-goto-swish')?.addEventListener('click', () => {
        closeModal();
        window.location.hash = '#leaderboard';
      });

      document.getElementById('btn-even-close')?.addEventListener('click', () => {
        closeModal();
      });

    } catch (err) {
      showToast(err.message, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = `⚖️ ${isEn ? `SPLIT TAB (${splitEach} kr each)` : `DELA NOTAN (${splitEach} kr var)`}`;
      }
    }
  }

  // Initial render
  renderModal();
  if (activeMode === 'roulette') {
    drawWheel();
  }
}


