// ── Components: Minigames Arcade ────────────────────────
import { showModal } from './modal.js';
import { launchConfetti, escapeHtml, showToast } from '../utils.js';
import { getFriends } from '../api.js';
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

// ── 1. Roller HTML ──────────────────────────────────────
export function renderMinigamesRoller() {
  return `
    <div class="minigames-section animate-in">
      <div class="minigames-header">
        <div class="minigames-title">
          <span>🎰</span> <span>${t('arcade.title')}</span>
        </div>
        <span class="badge badge-accent" style="font-size: 0.65rem; padding: 2px 8px; letter-spacing: 0.05em;">
          ${t('arcade.tagline')}
        </span>
      </div>
      <div class="minigames-roller" id="minigames-roller">
        <!-- Game 1: Singla Slant / Coin Flip -->
        <div class="minigame-card" id="card-coin-flip" title="${t('arcade.coinFlipTitle')}">
          <div class="minigame-card-icon" style="display: flex; align-items: center; justify-content: center;">
            <img src="/coin-head.jpg" alt="${t('arcade.coinFlip')}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; box-shadow: 0 2px 6px rgba(0,0,0,0.5); border: 1px solid var(--gold);" />
          </div>
          <div class="minigame-card-name">${t('arcade.coinFlip')}</div>
          <div class="minigame-card-tag">${t('arcade.coinFlipTag')}</div>
        </div>

        <!-- Game 2: Slots 777 -->
        <div class="minigame-card" id="card-slots" title="${t('arcade.slotsTitle')}">
          <div class="minigame-card-icon">🎰</div>
          <div class="minigame-card-name">${t('arcade.slots')}</div>
          <div class="minigame-card-tag">${t('arcade.slotsTag')}</div>
        </div>

        <!-- Game 3: Lyckohjul / Wheel of Fortune -->
        <div class="minigame-card" id="card-wheel" title="${t('arcade.wheelTitle')}">
          <div class="minigame-card-icon">🎡</div>
          <div class="minigame-card-name">${t('arcade.wheel')}</div>
          <div class="minigame-card-tag">${t('arcade.wheelTag')}</div>
        </div>

        <!-- Game 4: Tärningsduell / Dice Duel -->
        <div class="minigame-card" id="card-dice" title="${t('arcade.diceTitle')}">
          <div class="minigame-card-icon">🎲</div>
          <div class="minigame-card-name">${t('arcade.dice')}</div>
          <div class="minigame-card-tag">${t('arcade.diceTag')}</div>
        </div>
      </div>
    </div>
  `;
}

// ── 2. Event Listeners for Roller ───────────────────────
export function attachMinigamesListeners() {
  document.getElementById('card-coin-flip')?.addEventListener('click', openCoinFlipModal);
  document.getElementById('card-slots')?.addEventListener('click', openSlotsModal);
  document.getElementById('card-wheel')?.addEventListener('click', openWheelModal);
  document.getElementById('card-dice')?.addEventListener('click', openDiceModal);
}

// ────────────────────────────────────────────────────────
// 🪙 GAME 1: SINGLA SLANT (Coin Flip)
// ────────────────────────────────────────────────────────
function openCoinFlipModal() {
  let streak = 0;
  let isFlipping = false;
  let currentRotation = 0;
  const isEn = getLang() === 'en';

  showModal(t('arcade.coinFlipTitle'), `
    <div class="text-center" style="padding: var(--space-xs) 0;">
      <p class="text-muted mb-sm" style="font-size: 0.85rem;">
        ${t('arcade.coinFlipDesc')}
      </p>

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

      <div id="coin-result-banner" class="mb-md" style="font-family: var(--font-heading); font-size: 1.1rem; font-weight: 800; min-height: 28px; color: var(--gold);">
        ${t('arcade.coinFlipPrompt')}
      </div>

      <div class="flex gap-sm mb-md" style="justify-content: center;">
        <button type="button" class="btn btn-secondary coin-pick-btn active" data-side="head" style="flex: 1; border-color: var(--gold); font-weight: 700;">
          🪙 HEAD
        </button>
        <button type="button" class="btn btn-secondary coin-pick-btn" data-side="tails" style="flex: 1; font-weight: 700;">
          🪙 TAILS
        </button>
      </div>

      <button type="button" class="btn btn-primary btn-block mb-md" id="btn-do-coin-flip" style="font-size: 1rem; padding: 12px; font-weight: 800;">
        ${t('arcade.coinFlipBtn')}
      </button>

      <div class="flex-between" style="padding: 6px 12px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); font-size: 0.75rem;">
        <span class="text-muted">${t('arcade.coinFlipStreak')}</span>
        <span class="text-gold font-bold" id="coin-streak-val">🔥 0 ${isEn ? 'in a row' : 'i rad'}</span>
      </div>
    </div>
  `);

  let chosenSide = 'head';
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
    });
  });

  const coinEl = document.getElementById('game-coin');
  const resultBanner = document.getElementById('coin-result-banner');
  const streakVal = document.getElementById('coin-streak-val');
  const flipBtn = document.getElementById('btn-do-coin-flip');

  flipBtn?.addEventListener('click', () => {
    if (isFlipping) return;
    isFlipping = true;
    flipBtn.disabled = true;
    resultBanner.textContent = t('arcade.coinFlipSpinning');
    resultBanner.style.color = 'var(--text-secondary)';

    playCoinSound();

    const isHead = Math.random() < 0.5;
    const outcome = isHead ? 'head' : 'tails';

    // Flip 5 to 7 full rotations + target face
    const extraTurns = 5 + Math.floor(Math.random() * 3);
    const targetDeg = (extraTurns * 360) + (isHead ? 0 : 180);
    currentRotation += targetDeg;

    coinEl.style.transform = `rotateY(${currentRotation}deg)`;

    setTimeout(() => {
      isFlipping = false;
      flipBtn.disabled = false;

      const won = chosenSide === outcome;
      const sideName = isHead ? 'HEAD' : 'TAILS';
      if (won) {
        streak++;
        playWinSound();
        launchConfetti();
        resultBanner.textContent = isEn 
          ? `🎉 It landed on ${sideName}! You guessed RIGHT!` 
          : `🎉 Det blev ${sideName}! Du gissade RÄTT!`;
        resultBanner.style.color = '#4ade80';
      } else {
        streak = 0;
        resultBanner.textContent = isEn
          ? `It landed on ${sideName}! Better luck next flip!`
          : `Det blev ${sideName}! Bättre lycka nästa kast!`;
        resultBanner.style.color = 'var(--text-primary)';
      }
      streakVal.textContent = `🔥 ${streak} ${isEn ? 'in a row' : 'i rad'}`;
    }, 1800);
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

  showModal(t('arcade.slotsTitle'), `
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
      name: isEn ? '🍻 Beer Round' : '🍻 Vem bjuder på ölen?',
      items: isEn 
        ? ['Alex 🍻', 'Sam 🍺', 'Chris 🍻', 'You 🎯']
        : ['Johan 🍻', 'Sara 🍺', 'Erik 🍻', 'Du 🎯']
    },
    party: {
      name: isEn ? '🎉 Party Challenges' : '🎉 Festutmaningar',
      items: isEn
        ? ['Drink 1🍺', 'Double 2x💰', 'Give 2🎯', 'Bust!💀', 'JACKPOT👑', 'Sing🎤', 'Master🌟', 'Spin again🔄']
        : ['Drick 1🍺', 'Dubbla 2x💰', 'Ge bort 2🎯', 'Nollad!💀', 'JACKPOT👑', 'Sjung🎤', 'Mästare🌟', 'Snurra igen🔄']
    },
    food: {
      name: isEn ? '🍕 Food Choice' : '🍕 Vad äter vi?',
      items: isEn
        ? ['Pizza 🍕', 'Burger 🍔', 'Sushi 🍣', 'Tacos 🌮', 'Kebab 🥙', 'Pasta 🍝']
        : ['Pizza 🍕', 'Burgare 🍔', 'Sushi 🍣', 'Tacos 🌮', 'Kebab 🥙', 'Pasta 🍝']
    },
    choice: {
      name: isEn ? '🪙 Yes / No' : '🪙 Ja eller Nej?',
      items: isEn
        ? ['YES! 🟢', 'NO! 🔴']
        : ['JA! 🟢', 'NEJ! 🔴']
    }
  };

  let activePresetKey = 'beer';
  let items = [...PRESETS.beer.items];
  let currentRotation = 0;
  let isSpinning = false;
  let userFriends = null;
  let showFriendsPicker = false;

  showModal(t('arcade.wheelTitle'), `
    <div class="text-center" style="padding: var(--space-xs) 0;">
      <!-- Preset pills -->
      <div class="wheel-preset-pills" id="wheel-presets-container">
        <button type="button" class="wheel-preset-pill active" data-preset="beer">${isEn ? '🍻 Beer Round' : '🍻 Ölrunda'}</button>
        <button type="button" class="wheel-preset-pill" data-preset="party">${isEn ? '🎉 Party Games' : '🎉 Festspel'}</button>
        <button type="button" class="wheel-preset-pill" data-preset="food">${isEn ? '🍕 Food Choice' : '🍕 Matval'}</button>
        <button type="button" class="wheel-preset-pill" data-preset="choice">${isEn ? '🪙 Yes / No' : '🪙 Ja / Nej'}</button>
      </div>

      <!-- Wheel Canvas & Pointer -->
      <div class="wheel-container">
        <div class="wheel-pointer"></div>
        <canvas id="wheel-canvas" width="280" height="280" class="wheel-canvas"></canvas>
        <div class="wheel-center-hub">🎯</div>
      </div>

      <!-- Result Banner -->
      <div id="wheel-result-banner" class="mb-sm mt-xs" style="font-family: var(--font-heading); font-size: 1.05rem; font-weight: 800; min-height: 28px; color: var(--gold); padding: 0 8px;">
        ${t('arcade.wheelPromptBeer')}
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
        <div class="flex gap-xs" style="margin-bottom: 6px;">
          <input type="text" id="wheel-new-item-input" class="form-input" placeholder="${t('arcade.wheelInputPlaceholder')}" maxlength="20" style="padding: 6px 10px; font-size: 0.85rem; flex: 1;" />
          <button type="button" class="btn btn-secondary btn-sm" id="wheel-add-item-btn" style="padding: 6px 10px; font-size: 0.8rem; white-space: nowrap;">
            ${t('arcade.wheelAddBtn')}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" id="wheel-toggle-friends-btn" style="padding: 6px 10px; font-size: 0.8rem; white-space: nowrap; background: rgba(255,215,0,0.1); border-color: rgba(255,215,0,0.3); color: var(--gold);">
            ${t('arcade.wheelFriendsBtn')}
          </button>
        </div>

        <!-- Friends Picker Drawer (Collapsible) -->
        <div id="wheel-friends-drawer" style="display: none; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,215,0,0.2); border-radius: var(--radius-sm); padding: 8px; margin-top: 6px;">
          <div class="flex-between mb-xs" style="align-items: center;">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--gold);">${t('arcade.wheelFriendsDrawerTitle')}</span>
            <button type="button" class="btn btn-ghost btn-xs" id="wheel-add-all-friends-btn" style="font-size: 0.7rem; padding: 2px 6px; color: var(--gold);">
              ${t('arcade.wheelAddAllFriendsBtn')}
            </button>
          </div>
          <div id="wheel-friends-list" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 110px; overflow-y: auto;">
            <span class="text-muted" style="font-size: 0.75rem;">${isEn ? 'Loading friends...' : 'Laddar vänner...'}</span>
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
  const itemInput = document.getElementById('wheel-new-item-input');
  const addBtn = document.getElementById('wheel-add-item-btn');
  const clearBtn = document.getElementById('wheel-clear-btn');
  const friendsBtn = document.getElementById('wheel-toggle-friends-btn');
  const friendsDrawer = document.getElementById('wheel-friends-drawer');
  const friendsList = document.getElementById('wheel-friends-list');
  const addAllFriendsBtn = document.getElementById('wheel-add-all-friends-btn');
  const presetsContainer = document.getElementById('wheel-presets-container');

  // Pre-load friends in background
  getFriends().then(friends => {
    userFriends = friends || [];
  }).catch(() => {
    userFriends = [];
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
        renderTags();
        drawWheel();
        if (showFriendsPicker) renderFriendsList();
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
    renderTags();
    drawWheel();
    itemInput.value = '';
    itemInput.focus();
  }

  // Render friends list inside drawer
  function renderFriendsList() {
    if (!userFriends || userFriends.length === 0) {
      friendsList.innerHTML = `<span class="text-muted" style="font-size: 0.75rem;">${isEn ? 'No friends added yet. Add friends on your profile page!' : 'Inga vänner tillagda än. Lägg till vänner på din profilsida!'}</span>`;
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
        renderTags();
        drawWheel();
        renderFriendsList();
      });
    });
  }

  // Load friends and open drawer
  async function toggleFriendsDrawer() {
    showFriendsPicker = !showFriendsPicker;
    friendsDrawer.style.display = showFriendsPicker ? 'block' : 'none';
    if (showFriendsPicker) {
      if (userFriends === null) {
        try {
          userFriends = await getFriends();
        } catch {
          userFriends = [];
        }
      }
      renderFriendsList();
    }
  }

  // Event Listeners
  friendsBtn?.addEventListener('click', toggleFriendsDrawer);

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
      renderTags();
      drawWheel();
      renderFriendsList();
    }
  });

  clearBtn?.addEventListener('click', () => {
    if (isSpinning) return;
    items = [];
    renderTags();
    drawWheel();
    if (showFriendsPicker) renderFriendsList();
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

  // Preset pills switcher
  presetsContainer?.querySelectorAll('.wheel-preset-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      if (isSpinning) return;
      presetsContainer.querySelectorAll('.wheel-preset-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const presetKey = pill.getAttribute('data-preset');
      activePresetKey = presetKey;

      if (PRESETS[presetKey]) {
        items = [...PRESETS[presetKey].items];
        // If beer preset and user has friends, populate with real friends if available
        if (presetKey === 'beer' && userFriends && userFriends.length >= 2) {
          items = userFriends.slice(0, 8).map(f => `${f.nickname || f.realName} 🍻`);
          const youLabel = isEn ? 'You 🎯' : 'Du 🎯';
          if (!items.some(i => i.includes('Du') || i.includes('You'))) items.push(youLabel);
        }
        renderTags();
        drawWheel();
        if (showFriendsPicker) renderFriendsList();

        if (presetKey === 'beer') {
          banner.textContent = isEn ? 'Who buys the next beer? 🍻' : 'Vem bjuder på nästa bärs? 🍻';
        } else if (presetKey === 'party') {
          banner.textContent = isEn ? 'Press Spin Wheel!' : 'Tryck på Snurra Hjulet!';
        } else if (presetKey === 'food') {
          banner.textContent = isEn ? "What's for food today? 🍕" : 'Vad blir det för käk idag? 🍕';
        } else if (presetKey === 'choice') {
          banner.textContent = isEn ? 'Let the wheel decide: Yes or No? 🪙' : 'Låt hjulet avgöra: Ja eller Nej? 🪙';
        }
        banner.style.color = 'var(--gold)';
      }
    });
  });

  // Initial render
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

      if (activePresetKey === 'beer' || winner.includes('🍻') || winner.includes('🍺')) {
        const cleanName = winner.replace(/[🍻🍺]/g, '').trim();
        banner.innerHTML = isEn
          ? `🎉 <span style="color: #4ade80; font-size: 1.15rem;">${escapeHtml(cleanName)}</span> buys the next round! 🍻`
          : `🎉 <span style="color: #4ade80; font-size: 1.15rem;">${escapeHtml(cleanName)}</span> bjuder på nästa runda! 🍻`;
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
// 🎲 GAME 4: TÄRNINGSDUELL (Dice Duel)
// ────────────────────────────────────────────────────────
function openDiceModal() {
  const isEn = getLang() === 'en';
  let isRolling = false;
  let wins = 0;
  let losses = 0;

  showModal(t('arcade.diceTitle'), `
    <div class="text-center" style="padding: var(--space-xs) 0;">
      <p class="text-muted mb-xs" style="font-size: 0.85rem;">
        ${t('arcade.diceDesc')}
      </p>

      <div style="display: flex; justify-content: space-around; align-items: center; margin: 15px 0;">
        <!-- Player -->
        <div>
          <div style="font-weight: 700; font-size: 0.85rem; color: var(--gold); margin-bottom: 6px;">${t('arcade.diceYou')}</div>
          <div class="dice-item" id="player-dice">
            <!-- pips -->
          </div>
          <div class="font-heading font-bold mt-xs" id="player-dice-score" style="font-size: 1.1rem;">6</div>
        </div>

        <div style="font-family: var(--font-heading); font-size: 1.2rem; font-weight: 900; color: var(--text-muted);">
          VS
        </div>

        <!-- Dealer -->
        <div>
          <div style="font-weight: 700; font-size: 0.85rem; color: #f87171; margin-bottom: 6px;">${t('arcade.diceDealer')}</div>
          <div class="dice-item red" id="dealer-dice">
            <!-- pips -->
          </div>
          <div class="font-heading font-bold mt-xs" id="dealer-dice-score" style="font-size: 1.1rem;">6</div>
        </div>
      </div>

      <div id="dice-banner" class="mb-md" style="font-family: var(--font-heading); font-size: 1.05rem; font-weight: 800; min-height: 26px; color: var(--gold);">
        ${t('arcade.dicePrompt')}
      </div>

      <button type="button" class="btn btn-primary btn-block mb-md" id="btn-roll-dice" style="font-size: 1.1rem; padding: 13px;">
        ${t('arcade.diceBtn')}
      </button>

      <div class="flex-between" style="padding: 6px 12px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); font-size: 0.75rem;">
        <span class="text-muted">${t('arcade.diceScoreboard')}</span>
        <span class="font-bold" id="dice-scoreboard">🏆 0 ${isEn ? 'wins' : 'vinster'} · 💀 0 ${isEn ? 'losses' : 'förluster'}</span>
      </div>
    </div>
  `);

  const pDice = document.getElementById('player-dice');
  const dDice = document.getElementById('dealer-dice');
  const pScore = document.getElementById('player-dice-score');
  const dScore = document.getElementById('dealer-dice-score');
  const banner = document.getElementById('dice-banner');
  const scoreboard = document.getElementById('dice-scoreboard');
  const rollBtn = document.getElementById('btn-roll-dice');

  function renderDicePips(el, val) {
    el.innerHTML = '';
    // 3x3 grid positions (0 to 8)
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

  // Initial draw
  renderDicePips(pDice, 6);
  renderDicePips(dDice, 6);

  rollBtn?.addEventListener('click', () => {
    if (isRolling) return;
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
        banner.textContent = isEn 
          ? `🎉 You won! ${pVal} to ${dVal}!` 
          : `🎉 Du vann! ${pVal} mot ${dVal}!`;
        banner.style.color = '#4ade80';
        playWinSound();
        launchConfetti();
      } else if (pVal < dVal) {
        losses++;
        banner.textContent = isEn
          ? `💀 Dealer won with ${dVal} to ${pVal}!`
          : `💀 Dealern vann med ${dVal} mot ${pVal}!`;
        banner.style.color = '#f87171';
      } else {
        banner.textContent = isEn
          ? `🤝 Draw (${pVal} = ${dVal})! Roll again!`
          : `🤝 Oavgjort (${pVal} = ${dVal})! Kasta igen!`;
        banner.style.color = 'var(--gold)';
      }

      scoreboard.textContent = `🏆 ${wins} ${isEn ? 'wins' : 'vinster'} · 💀 ${losses} ${isEn ? 'losses' : 'förluster'}`;
      isRolling = false;
      rollBtn.disabled = false;
    }, 600);
  });
}
