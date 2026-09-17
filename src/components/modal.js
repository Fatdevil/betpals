// ── Components: Modal ─────────────────────────────────
import { getLang } from '../i18n.js';

export function showModal(title, contentHtml, onCloseOrOptions, maybeOptions = {}) {
  const root = document.getElementById('modal-root');

  // Handle flexible signature: showModal(title, content, onClose) or showModal(title, content, onClose, options) or showModal(title, content, options)
  let onClose = null;
  let options = {};

  if (typeof onCloseOrOptions === 'function') {
    onClose = onCloseOrOptions;
    options = maybeOptions || {};
  } else if (onCloseOrOptions && typeof onCloseOrOptions === 'object') {
    options = onCloseOrOptions;
    onClose = options.onClose || null;
  }

  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-content" style="position: relative;">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" id="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body">
          ${contentHtml}
        </div>
      </div>
    </div>
  `;

  let busyChecker = options.isBusy || false;
  let customConfirmTexts = options.confirmTexts || null;

  const forceClose = () => {
    window.removeEventListener('keydown', handleKeydown);
    root.innerHTML = '';
    if (onClose) onClose();
  };

  const isBusy = () => {
    if (typeof busyChecker === 'function') {
      try { return !!busyChecker(); } catch (_) { return false; }
    }
    if (busyChecker === true) return true;
    if (root.dataset.busy === 'true' || root.dataset.gameActive === 'true' || root.dataset.gameBusy === 'true') return true;
    if (root.querySelector('[data-game-active="true"]') || root.querySelector('[data-game-busy="true"]')) return true;
    return false;
  };

  const showBusyConfirmDialog = () => {
    const isEn = getLang() === 'en';
    const contentBox = root.querySelector('.modal-content');
    if (!contentBox) {
      forceClose();
      return;
    }

    // Don't duplicate if already open
    if (contentBox.querySelector('#modal-busy-confirm-overlay')) return;

    const titleText = customConfirmTexts?.title || (isEn ? 'Leave ongoing game?' : 'Avbryta pågående spel?');
    const msgText = customConfirmTexts?.message || (isEn 
      ? 'You are in the middle of an active game. If you exit now, your current session and progress will be lost!' 
      : 'Du är mitt i en pågående spelomgång. Om du avslutar nu avbryts spelet och din runda går förlorad!');
    const stayText = customConfirmTexts?.stay || (isEn ? 'Keep Playing 🎮' : 'Fortsätt spela 🎮');
    const leaveText = customConfirmTexts?.leave || (isEn ? 'Yes, Quit Game' : 'Ja, avsluta');

    const overlay = document.createElement('div');
    overlay.id = 'modal-busy-confirm-overlay';
    overlay.className = 'modal-busy-confirm-overlay animate-in';
    overlay.innerHTML = `
      <div class="modal-busy-confirm-box">
        <div style="font-size: 2.2rem; margin-bottom: 6px; filter: drop-shadow(0 2px 8px rgba(245,158,11,0.5));">⚠️</div>
        <div style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 800; color: var(--gold); margin-bottom: 8px; letter-spacing: 0.04em;">
          ${titleText}
        </div>
        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.85); line-height: 1.45; margin-bottom: 20px;">
          ${msgText}
        </div>
        <div class="flex gap-sm justify-center" style="width: 100%;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-modal-cancel-exit" style="flex: 1; padding: 10px 8px; font-weight: 700; border-color: rgba(255,215,0,0.4); color: var(--gold);">
            ${stayText}
          </button>
          <button type="button" class="btn btn-danger btn-sm" id="btn-modal-confirm-exit" style="flex: 1; padding: 10px 8px; font-weight: 700; background: linear-gradient(135deg, #ef4444, #b91c1c); border: none; box-shadow: 0 4px 12px rgba(239,68,68,0.4);">
            ${leaveText}
          </button>
        </div>
      </div>
    `;

    contentBox.appendChild(overlay);

    overlay.querySelector('#btn-modal-cancel-exit')?.addEventListener('click', () => {
      overlay.remove();
    });

    overlay.querySelector('#btn-modal-confirm-exit')?.addEventListener('click', () => {
      forceClose();
    });
  };

  const attemptClose = () => {
    if (isBusy()) {
      showBusyConfirmDialog();
    } else {
      forceClose();
    }
  };

  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      attemptClose();
    }
  };

  window.addEventListener('keydown', handleKeydown);

  root.querySelector('#modal-close-btn')?.addEventListener('click', attemptClose);
  root.querySelector('#modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') {
      attemptClose();
    }
  });

  const setBusy = (val, customTexts = null) => {
    busyChecker = val;
    if (customTexts) customConfirmTexts = customTexts;
  };

  return { 
    close: attemptClose, 
    forceClose, 
    root, 
    setBusy 
  };
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}
