// ── Settle a game: pick the winner (or several for a shared win) ─
// Used from the game page's organiser panel and from the admin list.
import { finishEvent, finishPickGame, readEventResult } from '../api.js';
import { showToast, launchConfetti, escapeHtml, safeImageSrc, sanitizeUrl } from '../utils.js';
import { showModal, closeModal } from './modal.js';
import { t } from '../i18n.js';
import { compressImage } from '../imageUtils.js';

// Straight to the live leaderboard (e.g. GameBook) to see who won
const leaderboardLink = (event) => event.resultUrl ? `
  <a class="finish-leaderboard-link" href="${escapeHtml(sanitizeUrl(event.resultUrl))}" target="_blank" rel="noopener noreferrer">📊 Öppna topplistan <span>›</span></a>
` : '';

// The AI's suggestion from the result photo; the organiser still confirms.
// One reading at a time (the server allows no more). A newer photo replaces an older one:
// the older answer is dropped and the newer photo is read next.
function photoReader(event, pin, btn, apply) {
  const label = btn.textContent;
  let current = null; // the photo whose answer we want
  let running = false;
  const idle = () => {
    btn.disabled = false;
    btn.textContent = label;
  };
  async function run() {
    if (running || !current) return;
    running = true;
    btn.disabled = true;
    btn.textContent = '🤖 Läser av bilden...';
    const image = current;
    let res = null;
    let error = null;
    try {
      res = await readEventResult(event.id, image, pin);
    } catch (err) {
      error = err;
    }
    running = false;
    if (image !== current) {
      if (current) run();
      else idle();
      return;
    }
    idle();
    if (error) return showToast(error.message, 'error');
    if (!res.winnerIds?.length) {
      return showToast(res.reason ? `Hittade ingen vinnare: ${res.reason}` : 'Kunde inte se någon vinnare på bilden – välj själv', 'info');
    }
    apply(res);
  }
  return {
    read(image) { current = image; run(); },
    cancel() { current = null; if (!running) idle(); }
  };
}

export function openFinishEventModal(event, { pin = '', onDone = null } = {}) {
  if (event.betMode === 'picks') return openPickResultModal(event, { pin, onDone });
  const stillOpen = event.status === 'open';

  showModal(t('admin.finishTitle'), `
    <p class="text-secondary mb-sm">${t('admin.whoWonPrompt')} <strong>${escapeHtml(event.name)}</strong>?</p>
    ${leaderboardLink(event)}
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
          <div style="font-size: 0.8rem; color: var(--text-secondary);">Fota slutresultat / scorekort / målgång${event.canReadResultPhoto ? ' – AI:n föreslår vinnaren' : ''}</div>
        </div>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/*" id="finish-proof-input" style="display:none;" />
      </div>
      ${event.canReadResultPhoto ? `
        <button type="button" class="btn btn-secondary btn-block btn-sm" id="finish-read-btn" style="display: none; margin-top: 8px; font-weight: 700;">🤖 Läs av vinnaren från bilden</button>
        <p class="finish-ai-note" id="finish-ai-note" style="display: none;"></p>
      ` : ''}
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

  let photoPick = 0; // a newer pick wins, even if an older photo finishes compressing later
  proofInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const pick = ++photoPick;
    // The old photo's suggestion goes at once, not after the new one is ready
    reader?.cancel();
    clearSuggestion();
    try {
      const compressed = await compressImage(file, 1000, 0.8);
      if (pick !== photoPick) return;
      selectedWinnerProof = compressed;
      proofPreview.src = selectedWinnerProof;
      proofPreviewWrapper.style.display = 'inline-block';
      proofPlaceholder.style.display = 'none';
      clearSuggestion();
      if (reader) {
        readBtn.style.display = 'block';
        reader.read(selectedWinnerProof); // at once; the organiser still picks the winner
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  proofRemove?.addEventListener('click', (e) => {
    e.stopPropagation();
    photoPick++;
    selectedWinnerProof = null;
    proofInput.value = '';
    proofPreview.src = '';
    proofPreviewWrapper.style.display = 'none';
    proofPlaceholder.style.display = 'block';
    if (readBtn) readBtn.style.display = 'none';
    reader?.cancel();
    clearSuggestion();
  });

  // ── AI suggestion from the result photo ──
  const readBtn = document.getElementById('finish-read-btn');
  const aiNote = document.getElementById('finish-ai-note');
  let aiTicked = []; // boxes the AI ticked for a shared win; undone with the suggestion
  function clearSuggestion() {
    document.querySelectorAll('.winner-row.suggested').forEach(r => r.classList.remove('suggested'));
    if (aiNote) aiNote.style.display = 'none';
    if (aiTicked.length) {
      checkboxes.forEach(cb => { if (aiTicked.includes(cb.dataset.id)) cb.checked = false; });
      aiTicked = [];
      checkboxes[0]?.dispatchEvent(new Event('change'));
    }
  }
  const reader = readBtn ? photoReader(event, pin, readBtn, showSuggestion) : null;
  readBtn?.addEventListener('click', () => {
    if (selectedWinnerProof) reader.read(selectedWinnerProof);
  });
  function showSuggestion(res) {
    clearSuggestion();
    const rows = res.winnerIds.map(id => document.querySelector(`.winner-row[data-id="${CSS.escape(id)}"]`)).filter(Boolean);
    rows.forEach(r => r.classList.add('suggested'));
    // A shared win: tick them all, so "Dela pott" is one tap away
    if (rows.length > 1) {
      checkboxes.forEach(cb => { cb.checked = res.winnerIds.includes(cb.dataset.id); });
      aiTicked = rows.map(r => r.dataset.id);
      checkboxes[0]?.dispatchEvent(new Event('change'));
    }
    const names = rows.map(r => r.querySelector('.bet-item-name')?.textContent).filter(Boolean).join(' & ');
    aiNote.innerHTML = `🤖 Förslag: <b>${escapeHtml(names)}</b>${res.reason ? ` – ${escapeHtml(res.reason)}` : ''}<br><span>Kontrollera och tryck på vinnaren för att avgöra.</span>`;
    aiNote.style.display = 'block';
    rows[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

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

// Pick N: the host ticks what actually happened; most correct tips take the pot
function openPickResultModal(event, { pin = '', onDone = null } = {}) {
  const n = event.pickCount || 0;
  const entries = event.entries || [];
  showModal('🎯 Rätt svar', `
    <p class="text-secondary mb-sm">Vilka ${n} blev det i <strong>${escapeHtml(event.name)}</strong>?</p>
    ${leaderboardLink(event)}
    ${event.canReadResultPhoto ? `
      <label class="btn btn-secondary btn-block btn-sm" for="pick-photo-input" id="pick-read-btn" role="button" style="font-weight: 700; margin-bottom: 8px;">📸 Läs av från skärmdump</label>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/*" id="pick-photo-input" class="file-input-hidden" />
      <p class="finish-ai-note" id="pick-ai-note" style="display: none;"></p>
    ` : ''}
    ${event.status === 'open' ? '<p class="text-muted mb-sm" style="font-size: 0.8rem;">🔒 Tipsen stängs när du sparar resultatet.</p>' : ''}
    <div class="bet-list mb-md" id="pick-result-list">
      ${event.players.map(p => `
        <label class="bet-item" style="display: flex; align-items: center; gap: 10px; padding: 10px; cursor: pointer;">
          <input type="checkbox" class="pick-result-cb" value="${escapeHtml(p.id)}" style="width: 18px; height: 18px;" />
          <span class="bet-item-name" style="font-weight: 600;">${escapeHtml(p.name)}</span>
        </label>
      `).join('')}
    </div>
    <button type="button" class="btn btn-primary btn-block" id="pick-result-save" disabled>Välj ${n} (0/${n})</button>
    <p class="text-muted" style="font-size: 0.75rem; margin-top: 8px;">${entries.length} har tippat. Flest rätt tar potten, och den delas vid lika. Har ingen rätt går insatserna tillbaka.</p>
  `);

  const boxes = [...document.querySelectorAll('.pick-result-cb')];
  const save = document.getElementById('pick-result-save');
  const selected = () => boxes.filter(b => b.checked).map(b => b.value);
  const refreshSave = () => {
    const count = selected().length;
    save.disabled = count !== n;
    save.textContent = count === n ? '🏆 Spara resultatet' : `Välj ${n} (${count}/${n})`;
  };
  boxes.forEach(b => b.addEventListener('change', () => {
    if (selected().length > n) { b.checked = false; showToast(`Välj exakt ${n}`, 'info'); }
    refreshSave();
  }));

  // A screenshot of the result: the AI ticks its suggestion, the organiser checks and saves
  const pickReadBtn = document.getElementById('pick-read-btn');
  const note = document.getElementById('pick-ai-note');
  let pickAiTicked = []; // what the AI ticked; undone as soon as another photo is chosen
  const pickReader = pickReadBtn ? photoReader(event, pin, pickReadBtn, (res) => {
    const ids = res.winnerIds.slice(0, n);
    boxes.forEach(b => { b.checked = ids.includes(b.value); });
    pickAiTicked = ids;
    refreshSave();
    const names = ids.map(id => event.players.find(p => p.id === id)?.name).filter(Boolean).join(', ');
    note.innerHTML = `🤖 Förslag: <b>${escapeHtml(names)}</b>${ids.length < n ? ` (${ids.length} av ${n} – kryssa i resten)` : ''}${res.reason ? ` – ${escapeHtml(res.reason)}` : ''}<br><span>Kontrollera innan du sparar.</span>`;
    note.style.display = 'block';
  }) : null;
  let photoPick = 0; // a newer pick wins, even if an older photo finishes compressing later
  document.getElementById('pick-photo-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !pickReader) return;
    const pick = ++photoPick;
    // The old photo's answer must not stay saveable while the new one is read
    pickReader.cancel();
    note.style.display = 'none';
    if (pickAiTicked.length) {
      boxes.forEach(b => { if (pickAiTicked.includes(b.value)) b.checked = false; });
      pickAiTicked = [];
      refreshSave();
    }
    try {
      const image = await compressImage(file, 1000, 0.8);
      if (pick === photoPick) pickReader.read(image); // a newer photo replaces the older one
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  let busy = false;
  save.addEventListener('click', async () => {
    if (busy || selected().length !== n) return;
    if (!confirm(`Spara resultatet för "${event.name}"?\n\nPotten delas ut direkt och skulderna hamnar på THE TAB.`)) return;
    busy = true;
    save.disabled = true;
    try {
      const result = await finishPickGame(event.id, selected(), pin);
      closeModal();
      launchConfetti();
      showToast(`🏆 ${result.winner} vann!`, 'success');
      onDone?.(result);
    } catch (err) {
      busy = false;
      save.disabled = false;
      showToast(err.message, 'error');
    }
  });
}
