// ── Utility functions ─────────────────────────────────
import { t } from './i18n.js';

export function formatPoints(amount) {
  if (amount === null || amount === undefined) return '0';
  return Math.round(amount).toLocaleString() + ' ' + t('common.pts');
}

// Alias for backward compat during migration
export const formatCurrency = formatPoints;

export function formatOdds(odds) {
  if (odds === null || odds === undefined) return '—';
  return odds.toFixed(2) + 'x';
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

export function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

export function launchConfetti() {
  const colors = ['#ffd700', '#00ff87', '#4488ff', '#ff4466', '#ff8800', '#aa44ff', '#fff5cc'];
  const shapes = ['50%', '2px', '0'];

  function burst(count, delayMs) {
    setTimeout(() => {
      for (let i = 0; i < count; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = (10 + Math.random() * 80) + 'vw';
        piece.style.top = -20 + 'px';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = (Math.random() * 0.8) + 's';
        piece.style.animationDuration = (2.5 + Math.random() * 2) + 's';
        piece.style.width = (5 + Math.random() * 10) + 'px';
        piece.style.height = (5 + Math.random() * 10) + 'px';
        piece.style.borderRadius = shapes[Math.floor(Math.random() * shapes.length)];
        piece.style.opacity = (0.7 + Math.random() * 0.3);
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 5000);
      }
    }, delayMs);
  }

  burst(60, 0);
  burst(40, 400);
  burst(20, 800);
}

export function statusLabel(status) {
  const map = { open: 'Öppen', locked: 'Låst', finished: 'Avslutad' };
  return map[status] || status;
}

export function statusBadgeClass(status) {
  const map = { open: 'badge-open', locked: 'badge-locked', finished: 'badge-finished' };
  return map[status] || '';
}
