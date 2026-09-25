// ── Components: Modal ─────────────────────────────────
import { getLang } from '../i18n.js';

// The dialog currently on screen. Only one dialog exists at a time, so a new one replaces
// it; this lets automatic pop-ups check first whether a game is in progress.
let currentDialog = null;

// True while a game dialog (e.g. a Blind 10 round or party room) is open and busy.
// Automatic pop-ups (install prompt, invitations, ...) must not replace it.
export function isGameInProgress() {
  if (!currentDialog || !currentDialog.isGame) return false;
  if (!document.getElementById('modal-root')?.childElementCount) return false;
  try {
    return currentDialog.isBusy();
  } catch {
    return false;
  }
}

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
  } else if (maybeOptions && typeof maybeOptions === 'object') {
    if (maybeOptions.onClose && !onClose) onClose = maybeOptions.onClose;
    options = { ...options, ...maybeOptions };
  }

  const isFullScreen = Boolean(options.fullScreen);
  const isGame = Boolean(options.isGame);
  const dialogState = { isGame, isBusy: () => false };
  currentDialog = dialogState;
  const preventBackdropClose = options.preventBackdropClose ?? (isGame || options.closeOnBackdrop === false);
  const backdropTriggersConfirm = Boolean(options.backdropTriggersConfirm);
  let confirmClose = options.confirmClose ?? isGame;

  if (isFullScreen) {
    root.innerHTML = `
      <div class="modal-overlay modal-overlay-fullscreen" id="modal-overlay">
        <div class="modal-content-fullscreen" id="modal-fullscreen-container">
          ${title ? `
            <div class="modal-header" style="position: absolute; top: 12px; left: 16px; right: 16px; z-index: 20;">
              <h3 class="modal-title" style="color: #fff;">${title}</h3>
              <button class="modal-close" id="modal-close-btn">&times;</button>
            </div>
          ` : ''}
          ${contentHtml}
        </div>
      </div>
    `;
  } else {
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
  }

  let busyChecker = options.isBusy || false;
  let customConfirmTexts = options.confirmTexts || null;

  const forceClose = () => {
    window.removeEventListener('keydown', handleKeydown);
    root.innerHTML = '';
    if (currentDialog === dialogState) currentDialog = null;
    if (onClose) onClose();
    try {
      root.dispatchEvent(new CustomEvent('modal-closed'));
      window.dispatchEvent(new CustomEvent('modal-closed'));
    } catch (_) {}
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

  const shouldConfirm = () => {
    if (typeof confirmClose === 'function') {
      try { return !!confirmClose(); } catch (_) { return false; }
    }
    if (confirmClose === true) return true;
    return isBusy();
  };

  const showBusyConfirmDialog = () => {
    const isEn = getLang() === 'en';
    if (!root) {
      forceClose();
      return;
    }

    // Don't duplicate if already open
    if (root.querySelector('#modal-busy-confirm-overlay')) return;

    const titleText = customConfirmTexts?.title || (isGame 
      ? (isEn ? 'Leave game?' : 'Avsluta spelet?') 
      : (isEn ? 'Leave ongoing game?' : 'Avbryta pågående spel?'));
    const msgText = customConfirmTexts?.message || (isGame 
      ? (isEn 
        ? 'Are you sure you want to exit? If you leave now, any active round or unsaved progress will be lost.' 
        : 'Är du säker på att du vill avsluta? Om du lämnar nu kan din pågående omgång eller osparade framsteg gå förlorade.')
      : (isEn 
        ? 'You are in the middle of an active game. If you exit now, your current session and progress will be lost!' 
        : 'Du är mitt i en pågående spelomgång. Om du avslutar nu avbryts spelet och din runda går förlorad!'));
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

    root.appendChild(overlay);

    overlay.querySelector('#btn-modal-cancel-exit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      overlay.remove();
    });

    overlay.querySelector('#btn-modal-confirm-exit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      forceClose();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  };

  const attemptClose = () => {
    if (shouldConfirm()) {
      showBusyConfirmDialog();
    } else {
      forceClose();
    }
  };

  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      const confirmOverlay = root.querySelector('#modal-busy-confirm-overlay');
      if (confirmOverlay) {
        confirmOverlay.remove();
        return;
      }
      attemptClose();
    }
  };

  window.addEventListener('keydown', handleKeydown);

  root.querySelector('#modal-close-btn')?.addEventListener('click', attemptClose);
  root.querySelector('#modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') {
      if (preventBackdropClose) {
        if (backdropTriggersConfirm) {
          attemptClose();
        } else {
          // Subtle shake feedback that backdrop clicks are disabled for this game
          const contentEl = root.querySelector('.modal-content, .modal-content-fullscreen');
          if (contentEl) {
            contentEl.classList.remove('modal-shake');
            void contentEl.offsetWidth;
            contentEl.classList.add('modal-shake');
          }
        }
        return;
      }
      if (!isFullScreen) {
        attemptClose();
      }
    }
  });

  const setBusy = (val, customTexts = null) => {
    busyChecker = val;
    if (customTexts) customConfirmTexts = customTexts;
  };

  dialogState.isBusy = isBusy;

  const setConfirmClose = (val, customTexts = null) => {
    confirmClose = val;
    if (customTexts) customConfirmTexts = customTexts;
  };

  return { 
    close: attemptClose, 
    forceClose, 
    root, 
    setBusy,
    setConfirmClose
  };
}

export function closeModal() {
  currentDialog = null;
  document.getElementById('modal-root').innerHTML = '';
}
