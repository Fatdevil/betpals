// ── Component: Dela utlägg (Split Expenses & Notor) ───────────────────
import { showModal, closeModal } from './modal.js';
import { createTabExpense, getFriends } from '../api.js';
import { getStoredUser } from '../auth.js';
import { showToast, escapeHtml, formatCurrency, launchConfetti } from '../utils.js';
import { compressImage } from '../imageUtils.js';
import { t, getLang } from '../i18n.js';

/**
 * Opens the dedicated "Dela utlägg" modal.
 * Can be opened in the context of an active Event (with tournamentId & event participants)
 * or standalone (with friends).
 *
 * @param {Object} options
 * @param {string} [options.tournamentId] Optional ID of the event
 * @param {string} [options.tournamentName] Optional name of the event
 * @param {Array} [options.participants] Optional list of participants: { id, name, nickname, avatarEmoji }
 * @param {string} [options.defaultTitle] Optional default title
 * @param {Function} [options.onSaved] Optional callback when expense is registered
 */
export async function openDelaUtlaggModal(options = {}) {
  const isEn = getLang() === 'en';
  const currentUser = getStoredUser();

  if (!currentUser) {
    showToast(isEn ? 'Please log in to split expenses!' : 'Logga in för att dela utlägg!', 'warning');
    return;
  }

  const tournamentId = options.tournamentId || null;
  const tournamentName = options.tournamentName || null;
  const onSaved = options.onSaved || null;

  // State
  let totalAmount = 0;
  let customTitle = options.defaultTitle || '';
  let customNotes = '';
  let receiptBase64 = null;
  let payerId = String(currentUser.id);
  let evenSplitMode = 'equal'; // 'equal' | 'custom'
  let customShares = {}; // { [userId]: number }

  // Build participants pool
  let allAvailableParticipants = [];
  const selectedParticipantIds = new Set();

  // 1. Current user always exists
  const myUserObj = {
    id: String(currentUser.id),
    name: currentUser.nickname || currentUser.realName || currentUser.name || (isEn ? 'You' : 'Du'),
    nickname: currentUser.nickname || 'Du',
    avatarEmoji: currentUser.avatar_emoji || '👤',
    isMe: true
  };

  if (options.participants && options.participants.length > 0) {
    // Participants passed from event
    const seen = new Set();
    options.participants.forEach(p => {
      const uid = String(p.id || p.userId || p.name);
      if (!seen.has(uid)) {
        seen.add(uid);
        allAvailableParticipants.push({
          id: uid,
          name: p.name || p.nickname || 'Spelare',
          nickname: p.nickname || p.name || 'Spelare',
          avatarEmoji: p.avatarEmoji || '🏌️',
          isMe: uid === String(currentUser.id)
        });
      }
    });

    // Ensure current user is in list
    if (!allAvailableParticipants.some(p => p.id === String(currentUser.id))) {
      allAvailableParticipants.unshift(myUserObj);
    }
  } else {
    // Standalone: fetch friends
    try {
      const friends = await getFriends();
      allAvailableParticipants = [myUserObj];
      if (friends && friends.length > 0) {
        friends.forEach(f => {
          allAvailableParticipants.push({
            id: String(f.id),
            name: f.nickname || f.real_name || f.name || 'Vän',
            nickname: f.nickname || 'Vän',
            avatarEmoji: f.avatar_emoji || '👤',
            isMe: false
          });
        });
      }
    } catch {
      allAvailableParticipants = [myUserObj];
    }
  }

  // Pre-select all available participants (or up to 8)
  allAvailableParticipants.forEach(p => selectedParticipantIds.add(p.id));

  function getSelectedParticipants() {
    return allAvailableParticipants.filter(p => selectedParticipantIds.has(p.id));
  }

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

  function renderModal() {
    const participants = getSelectedParticipants();
    const splitEach = participants.length > 0 && totalAmount > 0 
      ? Math.round((totalAmount / participants.length) * 100) / 100 
      : 0;
    const customSummary = getCustomSharesSummary(participants);

    const contentHtml = `
      <div class="animate-in dela-utlagg-modal" style="max-width: 480px; margin: 0 auto; text-align: left;">
        
        <!-- Header badge -->
        <div class="flex-between align-center mb-xs">
          <span class="badge badge-accent" style="font-size: 0.72rem; font-weight: 800; padding: 3px 8px; display: inline-flex; align-items: center; gap: 4px;">
            🛒 ${isEn ? 'SPLIT EXPENSE' : 'DELA UTLÄGG'}
          </span>
          ${tournamentName ? `
            <span class="badge" style="background: rgba(245, 166, 35, 0.15); color: var(--gold); border: 1px solid rgba(245, 166, 35, 0.3); font-size: 0.7rem; font-weight: 700;">
              🏆 ${escapeHtml(tournamentName)}
            </span>
          ` : ''}
        </div>

        <h2 class="font-heading" style="color: #fff; margin: 4px 0 2px; font-size: 1.25rem;">
          ${isEn ? 'Split Expense / Bill' : 'Dela utlägg & krognota'}
        </h2>
        <p class="text-muted" style="font-size: 0.78rem; margin: 0 0 var(--space-sm);">
          ${tournamentId 
            ? (isEn ? 'Logged in The Tab & settled automatically with all event bets.' : 'Bakas in i The Tab och kvittas automatiskt med eventets alla spel.')
            : (isEn ? 'Independent settlement between friends.' : 'Fristående avräkning mellan dig och dina vänner.')}
        </p>

        <!-- Form fields -->
        <div class="card mb-sm" style="padding: 12px; background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.08);">
          <!-- Expense Title -->
          <div class="form-group mb-xs">
            <label class="form-label" style="font-size: 0.75rem; font-weight: 700; margin-bottom: 2px;">
              ${isEn ? 'What was bought?' : 'Vad handlades / utlägg?'}
            </label>
            <input type="text" class="form-input" id="utlagg-title" 
              placeholder="${isEn ? 'e.g. Breakfast ICA Maxi, Club lunch, Gas' : 't.ex. Frukost ICA Maxi, Klubbhuslunch, Bensin'}" 
              value="${escapeHtml(customTitle)}" style="font-size: 0.85rem; padding: 8px 10px;" />
          </div>

          <!-- Total Amount & Payer -->
          <div class="flex gap-xs mb-xs" style="align-items: flex-start;">
            <div class="form-group" style="flex: 1;">
              <label class="form-label" style="font-size: 0.75rem; font-weight: 700; margin-bottom: 2px;">
                ${isEn ? 'Total Amount (SEK)' : 'Totalt belopp (kr)'} *
              </label>
              <div style="position: relative;">
                <input type="number" class="form-input" id="utlagg-total-amount" 
                  placeholder="0" min="1" step="any" 
                  value="${totalAmount > 0 ? totalAmount : ''}" 
                  style="font-size: 1.1rem; font-weight: 800; color: var(--gold); padding: 8px 32px 8px 10px;" />
                <span style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">
                  kr
                </span>
              </div>
            </div>

            <div class="form-group" style="flex: 1;">
              <label class="form-label" style="font-size: 0.75rem; font-weight: 700; margin-bottom: 2px;">
                ${isEn ? 'Who paid?' : 'Vem la ut pengarna?'}
              </label>
              <select class="form-input" id="utlagg-payer-select" style="font-size: 0.85rem; padding: 8px 6px;">
                ${allAvailableParticipants.map(p => `
                  <option value="${escapeHtml(p.id)}" ${p.id === payerId ? 'selected' : ''}>
                    ${escapeHtml(p.name)} ${p.isMe ? `(${isEn ? 'You' : 'Du'})` : ''}
                  </option>
                `).join('')}
              </select>
            </div>
          </div>

          <!-- Receipt Image Upload -->
          <div class="mt-xs">
            <input type="file" id="utlagg-receipt-file" accept="image/jpeg,image/png,image/webp,image/gif,image/*" capture="environment" style="display: none;" />
            <div class="flex align-center gap-xs">
              <button type="button" class="btn btn-ghost btn-xs" id="btn-utlagg-receipt-trigger" style="font-size: 0.72rem; padding: 4px 8px; border: 1px dashed rgba(255,255,255,0.2);">
                📷 ${receiptBase64 ? (isEn ? 'Change Receipt Photo' : 'Byt kvittofoto') : (isEn ? 'Attach Receipt Photo' : 'Fota/bifoga kvitto')}
              </button>
              ${receiptBase64 ? `
                <span class="badge badge-success" style="font-size: 0.65rem; padding: 2px 6px;">
                  ✓ ${isEn ? 'Receipt attached' : 'Kvitto bifogat'}
                </span>
                <button type="button" class="btn btn-ghost btn-xs" id="btn-utlagg-remove-receipt" style="color: var(--danger); font-size: 0.7rem; padding: 2px 4px;" title="${isEn ? 'Remove receipt' : 'Ta bort kvitto'}">
                  ✕
                </button>
              ` : ''}
            </div>
            ${receiptBase64 ? `
              <div style="margin-top: 6px; width: 60px; height: 60px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--gold);">
                <img src="${receiptBase64}" style="width: 100%; height: 100%; object-fit: cover;" alt="Receipt" />
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Participants Selection -->
        <div class="mb-sm">
          <div class="flex-between align-center mb-xs">
            <span style="font-size: 0.78rem; font-weight: 700; color: #fff;">
              ${isEn ? 'Who shares this cost?' : 'Vilka delar på kostnaden?'} (${participants.length})
            </span>
            <div class="flex gap-xs">
              <button type="button" class="btn btn-ghost btn-xs" id="btn-select-all-parts" style="font-size: 0.68rem; padding: 2px 6px; color: var(--gold);">
                ${isEn ? 'Select all' : 'Välj alla'}
              </button>
              <button type="button" class="btn btn-ghost btn-xs" id="btn-deselect-parts" style="font-size: 0.68rem; padding: 2px 6px; color: var(--text-muted);">
                ${isEn ? 'Clear' : 'Rensa'}
              </button>
            </div>
          </div>

          <div class="participants-pills-box" style="display: flex; flex-wrap: wrap; gap: 5px;">
            ${allAvailableParticipants.map(p => {
              const isSelected = selectedParticipantIds.has(p.id);
              return `
                <button type="button" class="btn-toggle-participant ${isSelected ? 'active' : ''}" data-uid="${escapeHtml(p.id)}" 
                  style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 0.75rem; border-radius: 20px; cursor: pointer; transition: all 0.15s; border: 1px solid ${isSelected ? 'var(--gold)' : 'rgba(255,255,255,0.1)'}; background: ${isSelected ? 'rgba(255, 215, 0, 0.15)' : 'rgba(0,0,0,0.2)'}; color: ${isSelected ? '#fff' : 'var(--text-muted)'};">
                  <span>${p.avatarEmoji || '👤'}</span>
                  <span style="font-weight: 600;">${escapeHtml(p.name)}</span>
                  ${p.id === payerId ? `<span style="font-size: 0.62rem; color: #4ade80; font-weight: 800;">(${isEn ? 'Payer' : 'Lade ut'})</span>` : ''}
                </button>`;
            }).join('')}
          </div>
        </div>

        <!-- Mode Switcher (Dela lika vs Anpassa) -->
        <div class="flex gap-xs mb-sm" style="background: rgba(0,0,0,0.35); padding: 3px; border-radius: var(--radius-sm); border: 1px solid var(--border-glass);">
          <button type="button" class="btn btn-xs btn-utlagg-mode ${evenSplitMode === 'equal' ? 'btn-primary' : 'btn-ghost'}" data-mode="equal" style="flex: 1; font-weight: 700; font-size: 0.75rem; padding: 6px 8px;">
            ⚖️ ${isEn ? 'Split Evenly' : 'Dela rakt av'}
          </button>
          <button type="button" class="btn btn-xs btn-utlagg-mode ${evenSplitMode === 'custom' ? 'btn-primary' : 'btn-ghost'}" data-mode="custom" style="flex: 1; font-weight: 700; font-size: 0.75rem; padding: 6px 8px;">
            ✏️ ${isEn ? 'Customize per Person' : 'Anpassa per person'}
          </button>
        </div>

        ${evenSplitMode === 'equal' ? `
          <!-- Equal Split Breakdown -->
          <div class="card mb-md text-center" style="background: rgba(74, 222, 128, 0.08); border-color: rgba(74, 222, 128, 0.3); padding: 12px;">
            <div style="font-size: 0.72rem; font-weight: 700; color: #4ade80; text-transform: uppercase;">
              ${isEn ? 'Fair Split Per Person' : 'Rättvis fördelning per person'}
            </div>
            <div style="font-size: 1.6rem; font-weight: 900; color: #4ade80; margin: 3px 0;">
              ${splitEach} kr <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">/ person</span>
            </div>
            <div class="text-muted" style="font-size: 0.72rem;">
              ${totalAmount} kr / ${participants.length} ${isEn ? 'people' : 'personer'}
            </div>
          </div>
        ` : `
          <!-- Custom Breakdown Card -->
          <div class="card mb-md" style="background: rgba(255,255,255,0.02); padding: 10px; border-color: rgba(255,255,255,0.08);">
            <div class="flex-between align-center mb-xs">
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--gold); text-transform: uppercase;">
                ${isEn ? 'Custom amounts' : 'Ange belopp per person'}
              </span>
              <span style="font-size: 0.78rem; font-weight: 800; color: ${customSummary.isPerfect ? '#4ade80' : (customSummary.isExceeded ? '#ef4444' : 'var(--gold)')};">
                ${customSummary.allocatedSum} / ${totalAmount} kr
              </span>
            </div>

            <!-- Status banner -->
            <div class="mb-xs p-xs text-center" style="font-size: 0.74rem; border-radius: var(--radius-sm); background: ${customSummary.isPerfect ? 'rgba(74, 222, 128, 0.12)' : (customSummary.isExceeded ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)')}; color: ${customSummary.isPerfect ? '#4ade80' : (customSummary.isExceeded ? '#ef4444' : 'var(--gold)')}; font-weight: 700;">
              ${customSummary.isPerfect 
                ? `✓ ${isEn ? 'Matches total perfectly!' : 'Stämmer på kronan!'}` 
                : (customSummary.isExceeded 
                  ? `⚠️ ${isEn ? 'Exceeds total by' : 'Överskrider totalen med'} ${Math.round(-customSummary.remaining)} kr!` 
                  : `⚠️ ${isEn ? 'Remaining to allocate' : 'Kvar att fördela'}: ${Math.round(customSummary.remaining)} kr`)}
            </div>

            <!-- Participant inputs list -->
            <div style="display: flex; flex-direction: column; gap: 5px;">
              ${participants.map(p => {
                const val = customShares[p.id] !== undefined ? customShares[p.id] : '';
                const isThePayer = p.id === payerId;
                return `
                  <div class="flex-between align-center" style="padding: 5px 8px; background: rgba(0,0,0,0.25); border-radius: var(--radius-sm); border: 1px solid var(--border-glass);">
                    <div class="flex align-center gap-xs" style="flex: 1; min-width: 0;">
                      <span>${p.avatarEmoji || '👤'}</span>
                      <span style="font-weight: 600; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.name)}</span>
                      ${isThePayer ? `<span class="badge badge-warning" style="font-size: 0.6rem; padding: 1px 4px;">${isEn ? 'Payer' : 'Lade ut'}</span>` : ''}
                    </div>
                    <div class="flex align-center gap-xs" style="flex-shrink: 0;">
                      <input type="number" class="form-input custom-share-field" data-uid="${escapeHtml(p.id)}" 
                        value="${val}" placeholder="0" min="0" step="any" 
                        style="width: 80px; text-align: right; font-weight: 800; font-size: 0.85rem; padding: 4px 6px; color: ${isThePayer ? '#4ade80' : 'var(--gold)'};" />
                      <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700;">kr</span>
                    </div>
                  </div>`;
              }).join('')}
            </div>

            <!-- Auto-distribute button -->
            <div class="mt-xs text-center" style="${customSummary.isUnder ? '' : 'display: none;'}">
              <button type="button" class="btn btn-ghost btn-xs" id="btn-distribute-remainder" style="color: var(--gold); font-size: 0.72rem; font-weight: 700; text-decoration: underline; padding: 4px 8px;">
                ⚡ ${isEn ? 'Distribute remaining evenly' : 'Dela resten jämnt'} (${Math.round(customSummary.remaining)} kr)
              </button>
            </div>
          </div>
        `}

        <!-- Submit Button -->
        <button type="button" class="btn btn-primary btn-block" id="btn-submit-dela-utlagg" 
          ${participants.length < 2 || totalAmount <= 0 || (evenSplitMode === 'custom' && !customSummary.isPerfect) ? 'disabled' : ''} 
          style="font-size: 1rem; font-weight: 800; padding: 12px; background: linear-gradient(135deg, #10b981, #059669); border: none; box-shadow: 0 4px 16px rgba(16,185,129,0.3);">
          🛒 ${isEn ? 'SAVE EXPENSE' : 'SPARA UTLÄGG'} (${totalAmount > 0 ? totalAmount + ' kr' : '0 kr'})
        </button>
      </div>
    `;

    showModal('', contentHtml, () => {}, { fullScreen: false });
    attachListeners();
  }

  function attachListeners() {
    const root = document.getElementById('modal-root');
    if (!root) return;

    // Title input
    const titleInput = root.querySelector('#utlagg-title');
    if (titleInput) {
      titleInput.addEventListener('input', (e) => {
        customTitle = e.target.value;
      });
    }

    // Total amount input
    const amountInput = root.querySelector('#utlagg-total-amount');
    if (amountInput) {
      amountInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        totalAmount = isNaN(val) || val <= 0 ? 0 : val;
        updateDynamicValues();
      });
    }

    // Payer select
    const payerSelect = root.querySelector('#utlagg-payer-select');
    if (payerSelect) {
      payerSelect.addEventListener('change', (e) => {
        payerId = e.target.value;
        // Make sure payer is in selected participants
        selectedParticipantIds.add(payerId);
        renderModal();
      });
    }

    // Receipt upload trigger
    root.querySelector('#btn-utlagg-receipt-trigger')?.addEventListener('click', () => {
      root.querySelector('#utlagg-receipt-file')?.click();
    });

    root.querySelector('#utlagg-receipt-file')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          receiptBase64 = await compressImage(file, 1000, 0.8);
          renderModal();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });

    root.querySelector('#btn-utlagg-remove-receipt')?.addEventListener('click', () => {
      receiptBase64 = null;
      renderModal();
    });

    // Participant toggles
    root.querySelectorAll('.btn-toggle-participant').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.dataset.uid;
        if (selectedParticipantIds.has(uid)) {
          // Cannot remove if only 2 selected or if it's the payer
          if (selectedParticipantIds.size <= 2) {
            showToast(isEn ? 'At least 2 people needed to split' : 'Minst 2 personer krävs för att dela', 'warning');
            return;
          }
          if (uid === payerId) {
            showToast(isEn ? 'The payer must be included' : 'Den som la ut måste ingå i fördelningen', 'warning');
            return;
          }
          selectedParticipantIds.delete(uid);
          delete customShares[uid];
        } else {
          selectedParticipantIds.add(uid);
        }
        renderModal();
      });
    });

    // Select all / Deselect
    root.querySelector('#btn-select-all-parts')?.addEventListener('click', () => {
      allAvailableParticipants.forEach(p => selectedParticipantIds.add(p.id));
      renderModal();
    });

    root.querySelector('#btn-deselect-parts')?.addEventListener('click', () => {
      // Keep only payer and 1 other
      selectedParticipantIds.clear();
      selectedParticipantIds.add(payerId);
      const other = allAvailableParticipants.find(p => p.id !== payerId);
      if (other) selectedParticipantIds.add(other.id);
      customShares = {};
      renderModal();
    });

    // Submode switcher (equal vs custom)
    root.querySelectorAll('.btn-utlagg-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode === evenSplitMode) return;
        evenSplitMode = mode;
        if (mode === 'custom' && Object.keys(customShares).length === 0 && totalAmount > 0) {
          // Pre-populate with equal amounts as starting point
          const parts = getSelectedParticipants();
          const base = Math.floor(totalAmount / parts.length);
          parts.forEach(p => {
            customShares[p.id] = base;
          });
        }
        renderModal();
      });
    });

    // Custom share inputs
    root.querySelectorAll('.custom-share-field').forEach(input => {
      input.addEventListener('input', (e) => {
        const uid = input.dataset.uid;
        const val = parseFloat(e.target.value);
        if (isNaN(val) || val < 0) {
          delete customShares[uid];
        } else {
          customShares[uid] = val;
        }
        updateDynamicValues();
      });
    });

    // Auto distribute remainder button
    root.querySelector('#btn-distribute-remainder')?.addEventListener('click', () => {
      const parts = getSelectedParticipants();
      const summary = getCustomSharesSummary(parts);
      if (summary.remaining <= 0) return;

      // Find participants who haven't entered an amount or are 0
      let targetParts = parts.filter(p => !customShares[p.id] || customShares[p.id] === 0);
      if (targetParts.length === 0) {
        // If all have amounts, divide among non-payers, or all
        targetParts = parts.filter(p => p.id !== payerId);
        if (targetParts.length === 0) targetParts = parts;
      }

      const each = Math.round((summary.remaining / targetParts.length) * 100) / 100;
      targetParts.forEach(p => {
        const current = customShares[p.id] || 0;
        customShares[p.id] = Math.round((current + each) * 100) / 100;
      });

      renderModal();
    });

    // Submit button
    root.querySelector('#btn-submit-dela-utlagg')?.addEventListener('click', handleSubmit);
  }

  function updateDynamicValues() {
    const root = document.getElementById('modal-root');
    if (!root) return;

    const parts = getSelectedParticipants();
    const submitBtn = root.querySelector('#btn-submit-dela-utlagg');

    if (evenSplitMode === 'equal') {
      const splitEach = parts.length > 0 && totalAmount > 0 
        ? Math.round((totalAmount / parts.length) * 100) / 100 
        : 0;
      const displayEl = root.querySelector('.card.text-center div[style*="font-size: 1.6rem"]');
      if (displayEl) {
        displayEl.innerHTML = `${splitEach} kr <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">/ person</span>`;
      }
      if (submitBtn) {
        submitBtn.disabled = parts.length < 2 || totalAmount <= 0;
        submitBtn.textContent = `🛒 ${isEn ? 'SAVE EXPENSE' : 'SPARA UTLÄGG'} (${totalAmount} kr)`;
      }
    } else {
      const summary = getCustomSharesSummary(parts);
      const allocatedText = root.querySelector('.card .flex-between span[style*="font-weight: 800"]');
      if (allocatedText) {
        allocatedText.textContent = `${summary.allocatedSum} / ${totalAmount} kr`;
        allocatedText.style.color = summary.isPerfect ? '#4ade80' : (summary.isExceeded ? '#ef4444' : 'var(--gold)');
      }

      const badge = root.querySelector('.card div.text-center[style*="font-size: 0.74rem"]');
      if (badge) {
        badge.style.color = summary.isPerfect ? '#4ade80' : (summary.isExceeded ? '#ef4444' : 'var(--gold)');
        badge.style.background = summary.isPerfect ? 'rgba(74, 222, 128, 0.12)' : (summary.isExceeded ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)');
        badge.textContent = summary.isPerfect 
          ? `✓ ${isEn ? 'Matches total perfectly!' : 'Stämmer på kronan!'}` 
          : (summary.isExceeded 
            ? `⚠️ ${isEn ? 'Exceeds total by' : 'Överskrider totalen med'} ${Math.round(-summary.remaining)} kr!` 
            : `⚠️ ${isEn ? 'Remaining to allocate' : 'Kvar att fördela'}: ${Math.round(summary.remaining)} kr`);
      }

      const distContainer = root.querySelector('#btn-distribute-remainder')?.parentElement;
      if (distContainer) {
        distContainer.style.display = summary.isUnder ? 'block' : 'none';
        const distBtn = root.querySelector('#btn-distribute-remainder');
        if (distBtn) {
          distBtn.textContent = `⚡ ${isEn ? 'Distribute remaining evenly' : 'Dela resten jämnt'} (${Math.round(summary.remaining)} kr)`;
        }
      }

      if (submitBtn) {
        submitBtn.disabled = parts.length < 2 || totalAmount <= 0 || !summary.isPerfect;
        submitBtn.textContent = `🛒 ${isEn ? 'SAVE EXPENSE' : 'SPARA UTLÄGG'} (${totalAmount} kr)`;
      }
    }
  }

  async function handleSubmit() {
    const participants = getSelectedParticipants();
    if (participants.length < 2 || totalAmount <= 0) {
      showToast(isEn ? 'Please fill in amount and at least 2 participants' : 'Fyll i belopp och minst 2 deltagare', 'warning');
      return;
    }

    if (evenSplitMode === 'custom') {
      const sum = getCustomSharesSummary(participants);
      if (!sum.isPerfect) {
        showToast(
          sum.isExceeded 
            ? `${isEn ? 'Total allocated shares exceed total by' : 'Fördelade belopp överskrider totalen med'} ${Math.round(-sum.remaining)} kr!`
            : `${isEn ? 'Remaining to allocate:' : 'Kvar att fördela:'} ${Math.round(sum.remaining)} kr!`,
          'warning'
        );
        return;
      }
    }

    const cleanTitle = (customTitle && customTitle.trim()) 
      ? customTitle.trim() 
      : (isEn ? 'Split Expense' : 'Dela utlägg');

    const submitBtn = document.getElementById('btn-submit-dela-utlagg');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = isEn ? 'Saving...' : 'Sparar utlägg...';
    }

    try {
      const participantIds = participants.map(p => p.id);
      const payload = {
        payerId,
        title: cleanTitle,
        notes: customNotes || null,
        totalAmount,
        mode: 'even_steven',
        participantIds,
        receiptImage: receiptBase64,
        tournamentId
      };
      if (evenSplitMode === 'custom') {
        payload.customShares = customShares;
      }

      await createTabExpense(payload);

      launchConfetti();

      // Show success modal
      const payerObj = allAvailableParticipants.find(p => p.id === payerId);
      const payerName = payerObj?.name || (isEn ? 'Payer' : 'Betalaren');

      showModal('', `
        <div class="animate-in text-center" style="max-width: 400px; margin: 0 auto; padding: 12px 0;">
          <div style="font-size: 3rem; margin-bottom: 6px;">🛒</div>
          
          <span class="badge badge-success mb-xs" style="font-size: 0.8rem; font-weight: 800; padding: 4px 10px;">
            ${isEn ? 'EXPENSE REGISTERED!' : 'UTLÄGGET REGISTRERAT!'}
          </span>

          <h2 class="font-heading" style="color: #4ade80; margin: 8px 0 6px; font-size: 1.35rem;">
            ${escapeHtml(cleanTitle)}
          </h2>

          <div style="font-size: 1.6rem; font-weight: 900; color: #fff; margin-bottom: 6px;">
            ${formatCurrency(totalAmount)}
          </div>

          <p class="text-muted" style="font-size: 0.85rem; margin: 0 auto 14px; max-width: 320px;">
            ${tournamentName 
              ? (isEn 
                ? `Saved to <b>${escapeHtml(tournamentName)}</b>. All shares are automatically settled in The Tab!` 
                : `Sparat i <b>${escapeHtml(tournamentName)}</b>. Kostnaden kvittas automatiskt i The Tab!`)
              : (isEn 
                ? `Split between ${participants.length} people. Check The Tab to settle!` 
                : `Delat på ${participants.length} personer. Kolla The Tab för avräkning!`)}
          </p>

          <button type="button" class="btn btn-primary btn-block" id="btn-utlagg-done" style="padding: 12px; font-weight: 800;">
            ${isEn ? 'Great, continue' : 'Kanon, fortsätt'} ➜
          </button>
        </div>
      `, () => {
        onSaved?.();
      });

      document.getElementById('btn-utlagg-done')?.addEventListener('click', () => {
        closeModal();
        onSaved?.();
      });

    } catch (err) {
      showToast(err.message || (isEn ? 'Failed to save expense' : 'Kunde inte spara utlägget'), 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = `🛒 ${isEn ? 'SAVE EXPENSE' : 'SPARA UTLÄGG'} (${totalAmount} kr)`;
      }
    }
  }

  // Initial render
  renderModal();
}
