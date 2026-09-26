// ── Settle a game: pick the winner (or several for a shared win) ─
// Used from the game page's organiser panel and from the admin list.
import { finishEvent } from '../api.js';
import { showToast, launchConfetti, escapeHtml, safeImageSrc } from '../utils.js';
import { showModal, closeModal } from './modal.js';
import { t } from '../i18n.js';
import { compressImage } from '../imageUtils.js';

export function openFinishEventModal(event, { pin = '', onDone = null } = {}) {
  const stillOpen = event.status === 'open';

  showModal(t('admin.finishTitle'), `
    <p class="text-secondary mb-sm">${t('admin.whoWonPrompt')} <strong>${escapeHtml(event.name)}</strong>?</p>
    ${stillOpen ? `
      <p class="text-muted mb-md" style="font-size: 0.8rem;">🔒 Bettningen stängs när du väljer vinnare.</p>
    ` : ''}

    <div class="mb-sm flex-between" style="align-items: center; padding: 0 4px;">
      <span class="text-secondary" style="font-size: 0.78rem;">Tryck på vinnaren, eller kryssa i flera vid delad seger:</span>
      <button type="button" class="btn btn-sm btn-accent" id="confirm-tied-winners-btn" style="display: none; font-size: 0.75rem; padding: 4px 10px; font-weight: 700;">
        🤝 Dela pott (<span id="tied-count">0</span> vinnare)
      </button>
    </div>

    <div class="bet-list mb-md" id="winner-list">
      ${event.players.map(p => `
        <div class="bet-item winner-row" data-id="${escapeHtml(p.id)}" style="width:100%; display: flex; align-items: center; justify-content: space-between; padding: 10px;">
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; margin: 0; flex: 1;">
            <input type="checkbox" class="winner-checkbox" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}" style="cursor: pointer; width: 18px; height: 18px;" />
            ${p.imageUrl ? `<img src="${safeImageSrc(p.imageUrl)}" alt="${escapeHtml(p.name)}" class="player-avatar-mini" />` : ''}
            <span class="bet-item-name" style="font-weight: 600;">${escapeHtml(p.name)}</span>
          </label>
          <button type="button" class="btn btn-sm winner-select-btn" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}" style="font-size: 0.75rem; padding: 4px 10px; white-space: nowrap;">
            ${t('admin.selectWinnerBtn')} 🏆
          </button>
        </div>
      `).join('')}
    </div>

    <div class="form-group">
      <label class="form-label">📸 Resultatbild (valfritt)</label>
      <div class="image-picker-box" id="finish-proof-drop">
        <div id="finish-proof-preview-wrapper" class="image-preview-wrapper" style="display:none;">
          <img id="finish-proof-preview" alt="Resultatbild" />
          <button type="button" class="image-preview-remove" id="finish-proof-remove">✕</button>
        </div>
        <div id="finish-proof-placeholder">
          <div style="font-size: 1.8rem; margin-bottom: 2px;">📷</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">Fota slutresultat / scorekort / målgång</div>
        </div>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/*" id="finish-proof-input" style="display:none;" />
      </div>
    </div>
  `);

  let selectedWinnerProof = null;
  let busy = false;
  const proofInput = document.getElementById('finish-proof-input');
  const proofDrop = document.getElementById('finish-proof-drop');
  const proofPreview = document.getElementById('finish-proof-preview');
  const proofPreviewWrapper = document.getElementById('finish-proof-preview-wrapper');
  const proofPlaceholder = document.getElementById('finish-proof-placeholder');
  const proofRemove = document.getElementById('finish-proof-remove');

  proofDrop?.addEventListener('click', (e) => {
    if (e.target === proofRemove) return;
    proofInput.click();
  });

  proofInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      selectedWinnerProof = await compressImage(file, 1000, 0.8);
      proofPreview.src = selectedWinnerProof;
      proofPreviewWrapper.style.display = 'inline-block';
      proofPlaceholder.style.display = 'none';
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  proofRemove?.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedWinnerProof = null;
    proofInput.value = '';
    proofPreview.src = '';
    proofPreviewWrapper.style.display = 'none';
    proofPlaceholder.style.display = 'block';
  });

  const tiedBtn = document.getElementById('confirm-tied-winners-btn');
  const tiedCountSpan = document.getElementById('tied-count');
  const checkboxes = document.querySelectorAll('.winner-checkbox');

  checkboxes.forEach(cb => cb.addEventListener('change', () => {
    const selected = Array.from(checkboxes).filter(c => c.checked);
    tiedBtn.style.display = selected.length >= 2 ? 'inline-block' : 'none';
    tiedCountSpan.textContent = selected.length;
  }));

  // Settling can't be undone from here, so say exactly what happens before doing it
  async function settle(winner, label) {
    if (busy) return;
    if (!confirm(`Sätta ${label} som vinnare av "${event.name}"?\n\nPotten delas ut direkt och skulderna hamnar på THE TAB.`)) return;
    busy = true;
    try {
      const result = await finishEvent(event.id, winner, pin, selectedWinnerProof);
      closeModal();
      launchConfetti();
      showToast(Array.isArray(winner)
        ? `🤝 Delad seger: ${result.winner}. Potten delas lika.`
        : `🏆 ${result.winner} ${t('admin.toastWinnerDeclared')}`, 'success');
      onDone?.(result);
    } catch (err) {
      busy = false;
      showToast(err.message, 'error');
    }
  }

  tiedBtn?.addEventListener('click', () => {
    const selected = Array.from(checkboxes).filter(cb => cb.checked);
    if (selected.length < 2) return;
    settle(selected.map(cb => cb.dataset.id), selected.map(cb => cb.dataset.name).join(' & '));
  });

  document.querySelectorAll('.winner-select-btn').forEach(btn => {
    btn.addEventListener('click', () => settle(btn.dataset.id, btn.dataset.name));
  });
}
