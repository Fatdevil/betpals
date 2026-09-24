// ── Components: Malta AI Support (Malta Chatt) ─────────
import { showModal } from './modal.js';
import { getLang } from '../i18n.js';
import { escapeHtml, showToast } from '../utils.js';

let sessionChatHistory = [];
let isSending = false;

export function openMaltaSupportModal(initialQuestion = null) {
  const isEn = getLang() === 'en';
  const isFabDisabled = localStorage.getItem('malta_fab_disabled') === 'true';

  const modalTitle = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <img src="/chip-malta-transparent.png" alt="Malta" style="width: 24px; height: 24px; object-fit: contain; filter: drop-shadow(0 2px 6px rgba(255,215,0,0.5));" />
      <span>${isEn ? 'Malta VIP Support 🇲🇹' : 'Malta Kundtjänst 🇲🇹'}</span>
    </div>
  `;

  const contentHtml = `
    <div class="malta-chat-container">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
        <div class="malta-chat-badge" style="margin: 0;">
          <span class="malta-live-indicator"></span>
          <span>${isEn ? 'AI Concierge Online • St. Julian’s • 24/7' : 'AI-Concierge Online • St. Julian’s • 24/7'}</span>
        </div>
        <button type="button" id="malta-toggle-fab-visibility-btn" class="btn btn-xs btn-secondary" style="font-size: 0.72rem; padding: 4px 9px; border-radius: 999px; opacity: 0.85;">
          ${isFabDisabled ? (isEn ? '📌 Show floating button' : '📌 Fäst ikon på skärmen') : (isEn ? '👁️ Hide floating button' : '👁️ Dölj flytande ikon')}
        </button>
      </div>

      <!-- Quick topic chips -->
      <div class="malta-quick-chips">
        <button class="malta-chip-btn" data-topic="Hur sätter vi bäst upp våra rundor och matcher i turneringen?">🏌️ Ronder & matcher</button>
        <button class="malta-chip-btn" data-topic="Hur gör vi vadslagning för mest birdies med AnyBet?">🎯 Mest birdies</button>
        <button class="malta-chip-btn" data-topic="Hur funkar BlixtBet ute på banan?">⚡ BlixtBet</button>
        <button class="malta-chip-btn" data-topic="Hur delar vi öl och lunch på The Tab?">🍻 The Tab</button>
        <button class="malta-chip-btn" data-topic="Hur funkar Swish-avräkningen?">💸 Swish</button>
        <button class="malta-chip-btn" data-topic="Någon har glömt sin PIN-kod, hur nollställer vi?">🔑 Glömt PIN</button>
      </div>

      <!-- Chat messages log -->
      <div class="malta-chat-box" id="malta-chat-messages">
        <div class="malta-msg malta-msg-bot">
          <img src="/chip-malta-transparent.png" class="malta-msg-avatar" alt="Malta" />
          <div class="malta-msg-bubble">
            ${isEn
              ? "Welcome to Malta Betting VIP Support! 🇲🇹🎰 Heading out on a legendary golf trip with the crew? Ask me about tournaments, AnyBet for most birdies, sharing drinks on The Tab, or Swish settlements!"
              : "Tjena mästaren! 🇲🇹🎰 Välkommen till Malta Betting VIP Kundtjänst! Peggar ni upp för en episk golfresa med gänget? Fråga mig om hur ni lägger upp turneringen, AnyBet på flest birdies, The Tab för bärsen eller hur Swish-avräkningen funkar!"}
          </div>
        </div>
      </div>

      <!-- Input area -->
      <form id="malta-chat-form" class="malta-chat-input-bar">
        <input 
          type="text" 
          id="malta-chat-input" 
          class="malta-chat-field" 
          placeholder="${isEn ? 'Fråga om golf, bets, PIN...' : 'Fråga Malta Support om golf, bets, PIN...'}" 
          autocomplete="off" 
          maxlength="400"
        />
        <button type="submit" id="malta-chat-send-btn" class="btn btn-primary malta-send-btn">
          <span>Skicka</span> 🚀
        </button>
      </form>
    </div>
  `;

  showModal(modalTitle, contentHtml, () => {
    // on close
  }, {
    fullScreen: false
  });

  // Attach event listeners
  setTimeout(() => {
    const form = document.getElementById('malta-chat-form');
    const input = document.getElementById('malta-chat-input');
    const chatBox = document.getElementById('malta-chat-messages');
    const toggleFabBtn = document.getElementById('malta-toggle-fab-visibility-btn');

    // Toggle FAB visibility button
    toggleFabBtn?.addEventListener('click', () => {
      const currentlyDisabled = localStorage.getItem('malta_fab_disabled') === 'true';
      const newDisabledState = !currentlyDisabled;
      localStorage.setItem('malta_fab_disabled', newDisabledState ? 'true' : 'false');

      const fab = document.getElementById('malta-support-fab');
      if (fab) {
        if (newDisabledState) {
          fab.classList.add('hidden-manual');
          showToast('Malta-ikonen är dold. Du kan alltid öppna den via "Malta AI" i menyn högst upp!', 'info');
        } else {
          fab.classList.remove('hidden-manual');
          showToast('Malta-ikonen visas nu på skärmen igen! Dra i den för att flytta.', 'success');
        }
      }

      toggleFabBtn.textContent = newDisabledState ? '📌 Fäst ikon på skärmen' : '👁️ Dölj flytande ikon';
    });

    // Render any previous history
    if (sessionChatHistory.length > 0) {
      chatBox.innerHTML = '';
      sessionChatHistory.forEach(item => {
        appendChatMessage(item.role === 'user' ? 'user' : 'bot', item.text, false);
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Quick chips click
    document.querySelectorAll('.malta-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const topic = btn.getAttribute('data-topic');
        if (topic && input) {
          input.value = topic;
          handleSend();
        }
      });
    });

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSend();
      });
    }

    if (input) {
      input.focus();
    }

    // Auto send initial question if provided
    if (initialQuestion && input) {
      input.value = initialQuestion;
      handleSend();
    }
  }, 50);
}

async function handleSend() {
  const input = document.getElementById('malta-chat-input');
  const sendBtn = document.getElementById('malta-chat-send-btn');
  const chatBox = document.getElementById('malta-chat-messages');
  if (!input || !sendBtn || !chatBox || isSending) return;

  const text = (input.value || '').trim();
  if (!text) return;

  input.value = '';
  isSending = true;
  sendBtn.disabled = true;

  // Add user bubble
  appendChatMessage('user', text, true);
  sessionChatHistory.push({ role: 'user', text });

  // Add typing indicator
  const typingEl = document.createElement('div');
  typingEl.className = 'malta-msg malta-msg-bot malta-typing-bubble';
  typingEl.id = 'malta-typing-indicator';
  typingEl.innerHTML = `
    <img src="/chip-malta-transparent.png" class="malta-msg-avatar" alt="Malta" />
    <div class="malta-msg-bubble">
      <span class="malta-typing-dots">
        <span></span><span></span><span></span>
      </span>
      <span style="font-size: 0.78rem; opacity: 0.7; margin-left: 6px;">Malta Support funderar...</span>
    </div>
  `;
  chatBox.appendChild(typingEl);
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const token = localStorage.getItem('betpals_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['x-user-token'] = token;

    const res = await fetch('/api/support/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: text,
        history: sessionChatHistory.slice(-6)
      })
    });

    const data = await res.json();
    document.getElementById('malta-typing-indicator')?.remove();

    const reply = data?.reply || 'Hoppsan! Nätet svajade till, men Malta Support finns alltid här. Prova igen!';
    appendChatMessage('bot', reply, true);
    sessionChatHistory.push({ role: 'bot', text: reply });
  } catch (err) {
    document.getElementById('malta-typing-indicator')?.remove();
    appendChatMessage('bot', 'Kunde inte nå Malta Support just nu. Kontrollera din internetuppkoppling!', true);
  } finally {
    isSending = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

function appendChatMessage(sender, rawText, scroll = true) {
  const chatBox = document.getElementById('malta-chat-messages');
  if (!chatBox) return;

  const msgEl = document.createElement('div');
  msgEl.className = `malta-msg malta-msg-${sender}`;

  // Simple formatting: newlines to <br>, bold **text** to <strong>
  let formatted = escapeHtml(rawText)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');

  if (sender === 'bot') {
    msgEl.innerHTML = `
      <img src="/chip-malta-transparent.png" class="malta-msg-avatar" alt="Malta" />
      <div class="malta-msg-bubble">${formatted}</div>
    `;
  } else {
    msgEl.innerHTML = `
      <div class="malta-msg-bubble">${formatted}</div>
    `;
  }

  chatBox.appendChild(msgEl);
  if (scroll) {
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

/**
 * Injects the floating Malta Support button into the page with full Drag & Drop,
 * magnet snap to screen edges, auto-hiding during minigames, and minimization.
 */
export function initMaltaSupportWidget() {
  if (document.getElementById('malta-support-fab')) return;

  const isHiddenExplicitly = localStorage.getItem('malta_fab_disabled') === 'true';
  const isMinimized = localStorage.getItem('malta_fab_minimized') === 'true';

  const fab = document.createElement('div');
  fab.id = 'malta-support-fab';
  fab.className = `malta-fab-btn ${isMinimized ? 'minimized' : ''} ${isHiddenExplicitly ? 'hidden-manual' : ''}`;
  fab.setAttribute('role', 'button');
  fab.setAttribute('aria-label', 'Malta AI Kundtjänst (Dra för att flytta)');
  fab.title = 'Malta AI Kundtjänst 🇲🇹 (Dra för att flytta runt)';

  fab.innerHTML = `
    <div class="malta-fab-content" id="malta-fab-main-content">
      <img src="/chip-malta-transparent.png" class="malta-fab-icon" alt="Malta Support" draggable="false" />
      <span class="malta-fab-label">Malta Support</span>
      <span class="malta-fab-dot"></span>
    </div>
    <button type="button" class="malta-fab-toggle-btn" id="malta-fab-toggle-btn" title="Minimera/Expandera" aria-label="Minimera ikon">
      <span class="malta-min-arrow">‹</span>
    </button>
  `;

  document.body.appendChild(fab);

  // Restore saved position
  restoreFabPosition(fab);

  // Setup Drag logic (Touch + Mouse with click detection)
  setupFabDrag(fab);

  // Setup MutationObserver to automatically HIDE button during minigames / modals
  setupModalAutoHider(fab);
}

function restoreFabPosition(fab) {
  try {
    const saved = JSON.parse(localStorage.getItem('malta_widget_pos') || 'null');
    if (saved && typeof saved.topRatio === 'number') {
      const fabWidth = fab.offsetWidth || 135;
      const fabHeight = fab.offsetHeight || 42;
      const targetTop = Math.max(50, Math.min(window.innerHeight * saved.topRatio, window.innerHeight - fabHeight - 65));
      const targetLeft = saved.side === 'left' ? 10 : (window.innerWidth - fabWidth - 10);
      fab.style.top = `${targetTop}px`;
      fab.style.left = `${targetLeft}px`;
      fab.style.bottom = 'auto';
      fab.style.right = 'auto';
      return;
    }
  } catch (e) {}

  // Default: bottom right above bottom navbar
  fab.style.bottom = '74px';
  fab.style.right = '14px';
}

function setupFabDrag(fab) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;
  let moved = false;

  function onStart(clientX, clientY) {
    const rect = fab.getBoundingClientRect();
    startX = clientX;
    startY = clientY;
    initialLeft = rect.left;
    initialTop = rect.top;
    isDragging = true;
    moved = false;
    fab.classList.add('is-dragging');
  }

  function onMove(clientX, clientY) {
    if (!isDragging) return;
    const dx = clientX - startX;
    const dy = clientY - startY;

    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      moved = true;
    }

    if (moved) {
      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      const fabWidth = fab.offsetWidth;
      const fabHeight = fab.offsetHeight;
      const maxLeft = window.innerWidth - fabWidth - 6;
      const maxTop = window.innerHeight - fabHeight - 65; // keep above bottom navbar

      newLeft = Math.max(6, Math.min(newLeft, maxLeft));
      newTop = Math.max(45, Math.min(newTop, maxTop)); // keep below top navbar

      fab.style.left = `${newLeft}px`;
      fab.style.top = `${newTop}px`;
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    }
  }

  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    fab.classList.remove('is-dragging');

    if (!moved) {
      // Tap!
      openMaltaSupportModal();
      return;
    }

    // Snap magnetically to nearest edge (left or right)
    const rect = fab.getBoundingClientRect();
    const fabWidth = fab.offsetWidth;
    const isLeft = (rect.left + fabWidth / 2) < (window.innerWidth / 2);
    const targetLeft = isLeft ? 10 : (window.innerWidth - fabWidth - 10);

    fab.style.transition = 'left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)';
    fab.style.left = `${targetLeft}px`;
    setTimeout(() => {
      fab.style.transition = '';
    }, 250);

    // Save position to localStorage
    try {
      const topRatio = rect.top / window.innerHeight;
      localStorage.setItem('malta_widget_pos', JSON.stringify({
        side: isLeft ? 'left' : 'right',
        topRatio: Math.max(0.08, Math.min(topRatio, 0.85))
      }));
    } catch (e) {}
  }

  // Touch handlers
  fab.addEventListener('touchstart', (e) => {
    if (e.target.closest('#malta-fab-toggle-btn')) return;
    const touch = e.touches[0];
    onStart(touch.clientX, touch.clientY);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    onMove(touch.clientX, touch.clientY);
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (isDragging) onEnd();
  }, { passive: true });

  // Mouse handlers
  fab.addEventListener('mousedown', (e) => {
    if (e.target.closest('#malta-fab-toggle-btn')) return;
    onStart(e.clientX, e.clientY);
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    onMove(e.clientX, e.clientY);
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) onEnd();
  });

  // Toggle button (minimize to compact side chip)
  const toggleBtn = fab.querySelector('#malta-fab-toggle-btn');
  toggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isMin = fab.classList.toggle('minimized');
    localStorage.setItem('malta_fab_minimized', isMin ? 'true' : 'false');

    // adjust snap after minimizing/expanding
    setTimeout(() => {
      const rect = fab.getBoundingClientRect();
      const fabWidth = fab.offsetWidth;
      const isLeft = (rect.left + fabWidth / 2) < (window.innerWidth / 2);
      fab.style.left = isLeft ? '10px' : `${window.innerWidth - fabWidth - 10}px`;
    }, 50);
  });
}

/**
 * MutationObserver that auto-hides the floating widget whenever ANY modal
 * (minigame, slot machine, Space Blitz, tournament modal) is active.
 */
function setupModalAutoHider(fab) {
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return;

  function checkModal() {
    const hasModal = modalRoot.children.length > 0 && modalRoot.innerHTML.trim() !== '';
    if (hasModal) {
      fab.classList.add('auto-hidden-modal');
    } else {
      fab.classList.remove('auto-hidden-modal');
    }
  }

  const observer = new MutationObserver(() => {
    checkModal();
  });

  observer.observe(modalRoot, { childList: true, subtree: true });
  checkModal();
}
