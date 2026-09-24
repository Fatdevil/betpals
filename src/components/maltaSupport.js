// ── Components: Malta AI Support (Malta Chatt) ─────────
import { showModal, closeModal } from './modal.js';
import { getLang } from '../i18n.js';
import { escapeHtml } from '../utils.js';

let sessionChatHistory = [];
let isSending = false;

export function openMaltaSupportModal(initialQuestion = null) {
  const isEn = getLang() === 'en';

  const modalTitle = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <img src="/chip-malta-transparent.png" alt="Malta" style="width: 24px; height: 24px; object-fit: contain; filter: drop-shadow(0 2px 6px rgba(255,215,0,0.5));" />
      <span>${isEn ? 'Malta VIP Support 🇲🇹' : 'Malta Kundtjänst 🇲🇹'}</span>
    </div>
  `;

  const contentHtml = `
    <div class="malta-chat-container">
      <div class="malta-chat-badge">
        <span class="malta-live-indicator"></span>
        <span>${isEn ? 'AI Concierge Online • St. Julian’s • 24/7' : 'AI-Concierge Online • St. Julian’s • Dygnet runt'}</span>
      </div>

      <!-- Quick topic chips -->
      <div class="malta-quick-chips">
        <button class="malta-chip-btn" data-topic="Hur sätter vi bäst upp 10 rundor golf i turneringen?">🏌️ 10 ronder golf</button>
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
              ? "Welcome to Malta Betting VIP Support! 🇲🇹🎰 Heading out on a legendary golf trip with 20 buddies? Ask me about tournaments, AnyBet for most birdies, sharing drinks on The Tab, or Swish settlements!"
              : "Tjena mästaren! 🇲🇹🎰 Välkommen till Malta Betting VIP Kundtjänst! Peggar ni upp för 10 episka rundor med 20 kompisar? Fråga mig om hur ni lägger upp turneringen, AnyBet på flest birdies, The Tab för bärsen eller hur Swish-avräkningen funkar!"}
          </div>
        </div>
      </div>

      <!-- Input area -->
      <form id="malta-chat-form" class="malta-chat-input-bar">
        <input 
          type="text" 
          id="malta-chat-input" 
          class="malta-chat-field" 
          placeholder="${isEn ? 'Ask Malta Support about golf, bets, PIN...' : 'Fråga Malta Support om golf, bets, PIN...'}" 
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
 * Injects the floating Malta Support button into the page.
 */
export function initMaltaSupportWidget() {
  if (document.getElementById('malta-support-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'malta-support-fab';
  fab.className = 'malta-fab-btn';
  fab.title = 'Malta AI Kundtjänst 🇲🇹';
  fab.setAttribute('aria-label', 'Öppna Malta Support Chat');
  fab.innerHTML = `
    <img src="/chip-malta-transparent.png" class="malta-fab-icon" alt="Malta Support" />
    <span class="malta-fab-label">Malta Support</span>
    <span class="malta-fab-dot"></span>
  `;

  fab.addEventListener('click', () => {
    openMaltaSupportModal();
  });

  document.body.appendChild(fab);
}
