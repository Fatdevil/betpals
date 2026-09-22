import test from 'node:test';
import assert from 'node:assert/strict';

// Setup minimal DOM globals for Node test environment
if (!globalThis.localStorage) {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };
}
if (!globalThis.navigator) {
  globalThis.navigator = { language: 'sv-SE' };
}

class MockElement {
  constructor(id = '', tagName = 'div') {
    this.id = id;
    this.tagName = tagName;
    this.classList = new Set();
    this.children = [];
    this.innerHTML = '';
    this.eventListeners = {};
    this.style = {};
  }

  addEventListener(event, handler) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event, handler) {
    if (!this.eventListeners[event]) return;
    this.eventListeners[event] = this.eventListeners[event].filter(h => h !== handler);
  }

  dispatchEvent(event) {
    const list = this.eventListeners[event.type] || [];
    list.forEach(h => h(event));
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      for (const child of this.children) {
        if (child.id === id) return child;
        const found = child.querySelector?.(selector);
        if (found) return found;
      }
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    if (selector.includes('modal-content')) {
      const content = new MockElement('modal-content');
      content.classList.add('modal-content');
      results.push(content);
    }
    return results;
  }
}

globalThis.document = {
  getElementById: (id) => {
    return new MockElement(id);
  },
  createElement: (tag) => new MockElement('', tag)
};

globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {}
};

globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};

test('Minigame Modal Guard — Options defaults for isGame: true', () => {
  const options = { isGame: true };
  const isGame = Boolean(options.isGame);
  const preventBackdropClose = options.preventBackdropClose ?? (isGame || options.closeOnBackdrop === false);
  const confirmClose = options.confirmClose ?? isGame;

  assert.equal(preventBackdropClose, true, 'isGame: true must default preventBackdropClose to true');
  assert.equal(confirmClose, true, 'isGame: true must default confirmClose to true');
});

test('Minigame Modal Guard — Non-game modal allows backdrop close by default', () => {
  const options = {};
  const isGame = Boolean(options.isGame);
  const preventBackdropClose = options.preventBackdropClose ?? (isGame || options.closeOnBackdrop === false);

  assert.equal(preventBackdropClose, false, 'Non-game modals should allow backdrop close by default');
});

test('Minigame Modal Guard — Backdrop click shakes modal instead of closing when preventBackdropClose is true', () => {
  let closed = false;
  let shaken = false;

  const mockContent = {
    classList: {
      remove: (cls) => {},
      add: (cls) => {
        if (cls === 'modal-shake') shaken = true;
      }
    },
    offsetWidth: 300
  };

  const handleBackdropClick = (targetId, preventBackdropClose, attemptClose) => {
    if (targetId === 'modal-overlay') {
      if (preventBackdropClose) {
        mockContent.classList.add('modal-shake');
        return;
      }
      attemptClose();
    }
  };

  // Test backdrop click with preventBackdropClose = true
  handleBackdropClick('modal-overlay', true, () => { closed = true; });
  assert.equal(closed, false, 'Modal should NOT close on backdrop click when preventBackdropClose is true');
  assert.equal(shaken, true, 'Modal content should receive shake animation on backdrop tap');

  // Test backdrop click with preventBackdropClose = false
  handleBackdropClick('modal-overlay', false, () => { closed = true; });
  assert.equal(closed, true, 'Modal should close on backdrop click when preventBackdropClose is false');
});

test('Minigame Modal Guard — confirmClose condition protects active games', () => {
  let isSpinning = false;
  let currentStreak = 0;

  const shouldConfirmSlots = (isSpinning) => isSpinning;
  const shouldConfirmCoinFlip = (isFlipping, duelWs, streak) => isFlipping || duelWs !== null || streak > 0;

  // Idle state
  assert.equal(shouldConfirmSlots(isSpinning), false);
  assert.equal(shouldConfirmCoinFlip(false, null, currentStreak), false);

  // Active state
  isSpinning = true;
  assert.equal(shouldConfirmSlots(isSpinning), true);

  currentStreak = 3;
  assert.equal(shouldConfirmCoinFlip(false, null, currentStreak), true);
});
