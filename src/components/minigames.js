// ── Components: Minigames Arcade ────────────────────────
import { showModal } from './modal.js';
import { launchConfetti } from '../utils.js';

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
          <span>🎰</span> <span>BetPals Arkad</span>
        </div>
        <span class="badge badge-accent" style="font-size: 0.65rem; padding: 2px 8px; letter-spacing: 0.05em;">
          SPELA DIREKT
        </span>
      </div>
      <div class="minigames-roller" id="minigames-roller">
        <!-- Game 1: Singla Slant -->
        <div class="minigame-card" id="card-coin-flip" title="Singla Slant">
          <div class="minigame-card-icon">🪙</div>
          <div class="minigame-card-name">Slantsingling</div>
          <div class="minigame-card-tag">50 / 50</div>
        </div>

        <!-- Game 2: Slots 777 -->
        <div class="minigame-card" id="card-slots" title="Enarmad Bandit">
          <div class="minigame-card-icon">🎰</div>
          <div class="minigame-card-name">Bandit 777</div>
          <div class="minigame-card-tag">Jackpot</div>
        </div>

        <!-- Game 3: Lyckohjul -->
        <div class="minigame-card" id="card-wheel" title="Lyckohjulet">
          <div class="minigame-card-icon">🎡</div>
          <div class="minigame-card-name">Lyckohjul</div>
          <div class="minigame-card-tag">Party</div>
        </div>

        <!-- Game 4: Tärningsduell -->
        <div class="minigame-card" id="card-dice" title="Tärningsduell">
          <div class="minigame-card-icon">🎲</div>
          <div class="minigame-card-name">Tärningsduell</div>
          <div class="minigame-card-tag">Duell</div>
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

  showModal('🪙 Singla Slant', `
    <div class="text-center" style="padding: var(--space-xs) 0;">
      <p class="text-muted mb-sm" style="font-size: 0.85rem;">
        Avgör vem som tar notan, bjuder på ölen eller servar först!
      </p>

      <div class="coin-stage">
        <div class="coin-flip-coin" id="game-coin">
          <div class="coin-side coin-front">
            <div class="coin-symbol">👑</div>
            <div class="coin-label">Krona</div>
          </div>
          <div class="coin-side coin-back">
            <div class="coin-symbol">🦁</div>
            <div class="coin-label">Klave</div>
          </div>
        </div>
      </div>

      <div id="coin-result-banner" class="mb-md" style="font-family: var(--font-heading); font-size: 1.1rem; font-weight: 800; min-height: 28px; color: var(--gold);">
        Välj sida och klicka på Singla!
      </div>

      <div class="flex gap-sm mb-md" style="justify-content: center;">
        <button type="button" class="btn btn-secondary coin-pick-btn active" data-side="krona" style="flex: 1; border-color: var(--gold);">
          👑 Krona
        </button>
        <button type="button" class="btn btn-secondary coin-pick-btn" data-side="klave" style="flex: 1;">
          🦁 Klave
        </button>
      </div>

      <button type="button" class="btn btn-primary btn-block mb-md" id="btn-do-coin-flip" style="font-size: 1rem; padding: 12px;">
        🪙 Singla Slanten!
      </button>

      <div class="flex-between" style="padding: 6px 12px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); font-size: 0.75rem;">
        <span class="text-muted">Gissnings-streak:</span>
        <span class="text-gold font-bold" id="coin-streak-val">🔥 0 i rad</span>
      </div>
    </div>
  `);

  let chosenSide = 'krona';
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
    resultBanner.textContent = 'Snurrar... 🌀';
    resultBanner.style.color = 'var(--text-secondary)';

    playCoinSound();

    const isKrona = Math.random() < 0.5;
    const outcome = isKrona ? 'krona' : 'klave';

    // Flip 5 to 7 full rotations + target face
    const extraTurns = 5 + Math.floor(Math.random() * 3);
    const targetDeg = (extraTurns * 360) + (isKrona ? 0 : 180);
    currentRotation += targetDeg;

    coinEl.style.transform = `rotateY(${currentRotation}deg)`;

    setTimeout(() => {
      isFlipping = false;
      flipBtn.disabled = false;

      const won = chosenSide === outcome;
      if (won) {
        streak++;
        playWinSound();
        launchConfetti();
        resultBanner.textContent = `🎉 Det blev ${isKrona ? 'Krona 👑' : 'Klave 🦁'}! Du gissade RÄTT!`;
        resultBanner.style.color = '#4ade80';
      } else {
        streak = 0;
        resultBanner.textContent = `Det blev ${isKrona ? 'Krona 👑' : 'Klave 🦁'}! Bättre lycka nästa kast!`;
        resultBanner.style.color = 'var(--text-primary)';
      }
      streakVal.textContent = `🔥 ${streak} i rad`;
    }, 1800);
  });
}

// ────────────────────────────────────────────────────────
// 🎰 GAME 2: ENARMAD BANDIT (Vegas 777 Slots)
// ────────────────────────────────────────────────────────
function openSlotsModal() {
  const symbols = ['🍒', '🍋', '🍺', '🔔', '💎', '7️⃣', '👑'];
  let currentChips = getChips();
  let currentBet = 10;
  let isSpinning = false;

  showModal('🎰 Enarmad Bandit 777', `
    <div class="text-center" style="padding: var(--space-xs) 0;">
      <!-- Chips & Bet Bar -->
      <div class="flex-between mb-sm" style="align-items: center; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: var(--radius-md);">
        <div>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Dina marker:</span>
          <span class="text-gold font-bold" id="slot-chips-display" style="font-size: 1rem; margin-left: 4px;">💰 ${currentChips}</span>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" id="btn-refill-chips" style="font-size: 0.7rem; padding: 2px 8px;">
          +100 Gratis
        </button>
      </div>

      <!-- Slots Cabinet -->
      <div class="slots-cabinet mb-md">
        <div class="slots-window">
          <div class="slot-reel" id="reel-1"><div class="slot-symbol-wrap">7️⃣</div></div>
          <div class="slot-reel" id="reel-2"><div class="slot-symbol-wrap">7️⃣</div></div>
          <div class="slot-reel" id="reel-3"><div class="slot-symbol-wrap">7️⃣</div></div>
        </div>
      </div>

      <!-- Result Banner -->
      <div id="slot-banner" class="mb-md" style="font-family: var(--font-heading); font-size: 1rem; font-weight: 700; min-height: 24px; color: var(--gold);">
        Dra i spaken för att spela!
      </div>

      <!-- Bet Selector -->
      <div class="flex gap-xs mb-md" style="justify-content: center; align-items: center;">
        <span style="font-size: 0.75rem; color: var(--text-muted); margin-right: 4px;">Insats:</span>
        <button type="button" class="btn btn-secondary btn-sm slot-bet-btn active" data-bet="10" style="border-color: var(--gold);">10</button>
        <button type="button" class="btn btn-secondary btn-sm slot-bet-btn" data-bet="25">25</button>
        <button type="button" class="btn btn-secondary btn-sm slot-bet-btn" data-bet="50">50</button>
      </div>

      <!-- Spin Button -->
      <button type="button" class="btn btn-primary btn-block" id="btn-slot-spin" style="font-size: 1.1rem; padding: 14px; font-weight: 800; letter-spacing: 0.05em;">
        🎰 SPINN!
      </button>

      <!-- Paytable note -->
      <div class="text-muted mt-sm" style="font-size: 0.7rem;">
        👑👑👑 Jackpot 50x · 7️⃣7️⃣7️⃣ 30x · 3 lika 15x · 2 lika 3x
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
    banner.textContent = 'Fyllde på med +100 marker! 🎁';
  });

  // Spin
  spinBtn?.addEventListener('click', () => {
    if (isSpinning) return;
    if (currentChips < currentBet) {
      banner.textContent = 'Slut på marker! Tryck på "+100 Gratis" ovanför! 👆';
      banner.style.color = '#ef4444';
      return;
    }

    currentChips -= currentBet;
    setChips(currentChips);
    chipsDisplay.textContent = `💰 ${currentChips}`;

    isSpinning = true;
    spinBtn.disabled = true;
    banner.textContent = 'Hjulen snurrar... 🎰';
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
    reels[index].querySelector('.slot-symbol-wrap').textContent = symbol;
    playTone(300 + index * 100, 'triangle', 0.1, 0.15);
  }

  function evaluateSlotWin(results) {
    const [s1, s2, s3] = results;
    let multiplier = 0;
    let winMessage = '';

    if (s1 === s2 && s2 === s3) {
      if (s1 === '👑') {
        multiplier = 50;
        winMessage = `👑 MEGA JACKPOT! +${currentBet * multiplier} MARKER! 👑`;
      } else if (s1 === '7️⃣') {
        multiplier = 30;
        winMessage = `7️⃣ 7️⃣ 7️⃣ VEGAS JACKPOT! +${currentBet * multiplier} MARKER! 🎉`;
      } else {
        multiplier = 15;
        winMessage = `🎉 TRIPLAR! 3x ${s1}! +${currentBet * multiplier} MARKER!`;
      }
    } else if (s1 === s2 || s2 === s3 || s1 === s3) {
      multiplier = 3;
      winMessage = `✨ Par! Vinst +${currentBet * multiplier} marker!`;
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
      banner.textContent = 'Ingen vinst denna gång. Snurra igen!';
      banner.style.color = 'var(--text-muted)';
    }
  }
}

// ────────────────────────────────────────────────────────
// 🎡 GAME 3: LYCKOHJULET (Party & Bet Wheel)
// ────────────────────────────────────────────────────────
function openWheelModal() {
  const sectors = [
    { label: 'Drick 1🍺', color: '#e63946', desc: 'Ta en klunk av valfri dryck!' },
    { label: 'Dubbla 2x💰', color: '#f59e0b', desc: 'Dubbla din satsning!' },
    { label: 'Ge bort 2🎯', color: '#10b981', desc: 'Ge bort 2 klunkar till en kompis!' },
    { label: 'Nollad!💀', color: '#374151', desc: 'Ingen vinst! Bättre lycka nästa gång!' },
    { label: 'JACKPOT👑', color: '#8b5cf6', desc: 'JACKPOT! Skåla för mästaren!' },
    { label: 'Sjung🎤', color: '#ec4899', desc: 'Sjung en refräng från valfri låt!' },
    { label: 'Mästare🌟', color: '#3b82f6', desc: 'Du bestämmer nästa regel!' },
    { label: 'Snurra igen🔄', color: '#06b6d4', desc: 'Få ett gratissnurr!' }
  ];

  let currentRotation = 0;
  let isSpinning = false;

  showModal('🎡 Lyckohjulet', `
    <div class="text-center" style="padding: var(--space-xs) 0;">
      <p class="text-muted mb-xs" style="font-size: 0.85rem;">
        Snurra fest- och bettinghjulet och se vad ödet bestämmer!
      </p>

      <div class="wheel-container">
        <div class="wheel-pointer"></div>
        <canvas id="wheel-canvas" width="280" height="280" class="wheel-canvas"></canvas>
        <div class="wheel-center-hub">🎯</div>
      </div>

      <div id="wheel-result-banner" class="mb-md mt-sm" style="font-family: var(--font-heading); font-size: 1.1rem; font-weight: 800; min-height: 28px; color: var(--gold);">
        Tryck på Snurra Hjulet!
      </div>

      <button type="button" class="btn btn-primary btn-block" id="btn-spin-wheel" style="font-size: 1.1rem; padding: 13px;">
        🎡 Snurra Hjulet!
      </button>
    </div>
  `);

  const canvas = document.getElementById('wheel-canvas');
  const ctx = canvas.getContext('2d');
  const banner = document.getElementById('wheel-result-banner');
  const spinBtn = document.getElementById('btn-spin-wheel');

  // Draw wheel on canvas
  function drawWheel() {
    const numSectors = sectors.length;
    const arc = (2 * Math.PI) / numSectors;
    const radius = 140;

    ctx.clearRect(0, 0, 280, 280);

    sectors.forEach((sec, i) => {
      const angle = i * arc;
      ctx.beginPath();
      ctx.fillStyle = sec.color;
      ctx.moveTo(radius, radius);
      ctx.arc(radius, radius, radius, angle, angle + arc);
      ctx.lineTo(radius, radius);
      ctx.fill();
      ctx.stroke();

      // Draw Text
      ctx.save();
      ctx.translate(radius, radius);
      ctx.rotate(angle + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 3;
      ctx.fillText(sec.label, radius - 15, 4);
      ctx.restore();
    });
  }

  drawWheel();

  spinBtn?.addEventListener('click', () => {
    if (isSpinning) return;
    isSpinning = true;
    spinBtn.disabled = true;
    banner.textContent = 'Hjulet snurrar... 🎡';
    banner.style.color = 'var(--text-secondary)';

    const numSectors = sectors.length;
    const extraRotations = 4 + Math.floor(Math.random() * 3); // 4-6 full turns
    const winningIndex = Math.floor(Math.random() * numSectors);

    // Needle is at TOP (270 degrees or -90 degrees)
    // Sector angle
    const arcDeg = 360 / numSectors;
    // Calculate degree so winningIndex lands at top
    const targetDeg = (360 - (winningIndex * arcDeg) - (arcDeg / 2)) + 270;
    const totalRotation = currentRotation + (extraRotations * 360) + (targetDeg % 360);
    currentRotation = totalRotation;

    canvas.style.transform = `rotate(${totalRotation}deg)`;

    // Audio ticks during spin
    let tickCount = 0;
    const tickInterval = setInterval(() => {
      tickCount++;
      if (tickCount < 25) playTickSound();
    }, 150);

    setTimeout(() => {
      clearInterval(tickInterval);
      isSpinning = false;
      spinBtn.disabled = false;

      const result = sectors[winningIndex];
      banner.textContent = `${result.label} — ${result.desc}`;
      banner.style.color = result.color === '#e63946' ? '#f87171' : 'var(--gold)';

      if (result.label.includes('JACKPOT') || result.label.includes('Dubbla')) {
        playWinSound();
        launchConfetti();
      } else {
        playTone(500, 'triangle', 0.2, 0.1);
      }
    }, 4500);
  });
}

// ────────────────────────────────────────────────────────
// 🎲 GAME 4: TÄRNINGSDUELL (Dice Duel)
// ────────────────────────────────────────────────────────
function openDiceModal() {
  let isRolling = false;
  let wins = 0;
  let losses = 0;

  showModal('🎲 Tärningsduell', `
    <div class="text-center" style="padding: var(--space-xs) 0;">
      <p class="text-muted mb-xs" style="font-size: 0.85rem;">
        Slå dina tärningar mot Dealern! Högst summa vinner omgången.
      </p>

      <div style="display: flex; justify-content: space-around; align-items: center; margin: 15px 0;">
        <!-- Player -->
        <div>
          <div style="font-weight: 700; font-size: 0.85rem; color: var(--gold); margin-bottom: 6px;">DU</div>
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
          <div style="font-weight: 700; font-size: 0.85rem; color: #f87171; margin-bottom: 6px;">DEALER</div>
          <div class="dice-item red" id="dealer-dice">
            <!-- pips -->
          </div>
          <div class="font-heading font-bold mt-xs" id="dealer-dice-score" style="font-size: 1.1rem;">6</div>
        </div>
      </div>

      <div id="dice-banner" class="mb-md" style="font-family: var(--font-heading); font-size: 1.05rem; font-weight: 800; min-height: 26px; color: var(--gold);">
        Kasta för att utmana dealern!
      </div>

      <button type="button" class="btn btn-primary btn-block mb-md" id="btn-roll-dice" style="font-size: 1.1rem; padding: 13px;">
        🎲 Kasta Tärningarna!
      </button>

      <div class="flex-between" style="padding: 6px 12px; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); font-size: 0.75rem;">
        <span class="text-muted">Resultat:</span>
        <span class="font-bold" id="dice-scoreboard">🏆 ${wins} vinster · 💀 ${losses} förluster</span>
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
    banner.textContent = 'Tärningarna rullar... 🎲';
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
        banner.textContent = `🎉 Du vann! ${pVal} mot ${dVal}!`;
        banner.style.color = '#4ade80';
        playWinSound();
        launchConfetti();
      } else if (pVal < dVal) {
        losses++;
        banner.textContent = `💀 Dealern vann med ${dVal} mot ${pVal}!`;
        banner.style.color = '#f87171';
      } else {
        banner.textContent = `🤝 Oavgjort (${pVal} = ${dVal})! Kasta igen!`;
        banner.style.color = 'var(--gold)';
      }

      scoreboard.textContent = `🏆 ${wins} vinster · 💀 ${losses} förluster`;
      isRolling = false;
      rollBtn.disabled = false;
    }, 600);
  });
}
