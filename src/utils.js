// ── Utility functions ─────────────────────────────────
import { t } from './i18n.js';

export function formatPoints(amount) {
  if (amount === null || amount === undefined) return '0 kr';
  return Math.round(amount).toLocaleString() + ' ' + t('common.pts');
}

// Alias for backward compat during migration
export const formatCurrency = formatPoints;

export function getAppBaseUrl() {
  if (typeof window === 'undefined') return 'https://betpals-production.up.railway.app';
  let origin = window.location.origin;
  if (!origin || origin === 'null') return 'https://betpals-production.up.railway.app';
  if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
    origin = origin.replace(/^http:\/\//i, 'https://');
  }
  return origin.replace(/\/$/, '');
}

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
  const map = { open: 'Öppen', locked: 'Låst', finished: 'Avslutad', cancelled: 'Avbruten' };
  return map[status] || status;
}

export function statusBadgeClass(status) {
  const map = { open: 'badge-open', locked: 'badge-locked', finished: 'badge-finished', cancelled: 'badge-danger' };
  return map[status] || '';
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function sanitizeUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^(https?:\/\/|\/|mailto:|tel:|swish:)/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

export function normalizeSwedishPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  let normalized = digits;
  // +46701234567 → 46701234567 (11 digits) → 0701234567
  if (digits.startsWith('46') && digits.length === 11) normalized = '0' + digits.slice(2);
  // 467XXXXXXXX (10 digits, no leading 0) → 07XXXXXXXX
  if (digits.startsWith('467') && digits.length === 10) normalized = '0' + digits.slice(1);
  // Valid Swedish mobile: 07XXXXXXXX (10 digits)
  return /^07\d{8}$/.test(normalized) ? normalized : null;
}

export function createSwishUrl({ phone, amount, message }) {
  const cleanPhone = normalizeSwedishPhone(phone);
  if (!cleanPhone) return '#';
  const swishData = JSON.stringify({
    version: 1,
    payee: { value: cleanPhone },
    amount: { value: Math.max(1, Math.round(Number(amount) || 1)) },
    message: { value: message || 'Malta Betting' }
  });
  return 'swish://payment?data=' + encodeURIComponent(swishData);
}

export function formatDeadline(closesAt) {
  if (!closesAt) return null;
  const target = new Date(closesAt).getTime();
  if (isNaN(target)) return null;
  const diff = target - Date.now();
  if (diff <= 0) {
    return {
      isExpired: true,
      remainingMs: 0,
      text: t('event.deadlineExpired') || 'Spelstopp har passerat ⌛',
      shortText: 'Tid ute ⌛'
    };
  }
  if (diff < 60 * 1000) {
    return {
      isExpired: false,
      remainingMs: diff,
      text: '<1 min kvar ⏱️',
      shortText: '<1m kvar ⏱️'
    };
  }
  if (diff < 60 * 60 * 1000) {
    const mins = Math.ceil(diff / (60 * 1000));
    return {
      isExpired: false,
      remainingMs: diff,
      text: `${mins} min kvar ⏱️`,
      shortText: `${mins}m kvar ⏱️`
    };
  }
  if (diff < 24 * 60 * 60 * 1000) {
    const hrs = Math.floor(diff / (3600 * 1000));
    const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    return {
      isExpired: false,
      remainingMs: diff,
      text: `${hrs}h ${mins}m kvar ⏱️`,
      shortText: `${hrs}h ${mins}m kvar`
    };
  }
  const days = Math.floor(diff / (86400 * 1000));
  return {
    isExpired: false,
    remainingMs: diff,
    text: `${days} dgr kvar 📅`,
    shortText: `${days}d kvar`
  };
}

export function generateIcsDataUrl({ title, description, startDate, endDate, url }) {
  const formatIcsDate = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const start = formatIcsDate(new Date(startDate || Date.now()));
  const end = formatIcsDate(new Date(endDate || (new Date(startDate || Date.now()).getTime() + 60 * 60 * 1000)));
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Malta Betting//Game Event//SV',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@maltabetting.app`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description || ''}`,
    url ? `URL:${url}` : '',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  return 'data:text/calendar;charset=utf8,' + encodeURIComponent(ics);
}

export function generateGoogleCalendarUrl({ title, description, startDate, endDate, location }) {
  const formatGDate = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const start = formatGDate(new Date(startDate || Date.now()));
  const end = formatGDate(new Date(endDate || (new Date(startDate || Date.now()).getTime() + 60 * 60 * 1000)));
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details: description || '',
    location: location || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

