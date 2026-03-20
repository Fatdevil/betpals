// ── Notifications System ──────────────────────────────
// Global in-app notification state + bell component

const MAX_NOTIFICATIONS = 20;
let notifications = [];
let unreadCount = 0;
let bellElement = null;

// Load from sessionStorage
try {
  const saved = sessionStorage.getItem('betpals_notifications');
  if (saved) {
    const parsed = JSON.parse(saved);
    notifications = parsed.items || [];
    unreadCount = parsed.unread || 0;
  }
} catch (e) { /* silent */ }

function save() {
  sessionStorage.setItem('betpals_notifications', JSON.stringify({
    items: notifications.slice(0, MAX_NOTIFICATIONS),
    unread: unreadCount
  }));
}

export function addNotification(notification) {
  notifications.unshift({
    ...notification,
    id: Date.now(),
    time: new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  });
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications = notifications.slice(0, MAX_NOTIFICATIONS);
  }
  unreadCount++;
  save();
  updateBellBadge();
}

export function getNotifications() {
  return notifications;
}

export function clearUnread() {
  unreadCount = 0;
  save();
  updateBellBadge();
}

export function getUnreadCount() {
  return unreadCount;
}

function updateBellBadge() {
  const badge = document.getElementById('notif-badge');
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

export function renderBell() {
  return `
    <div class="notif-bell" id="notif-bell">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <span class="notif-badge" id="notif-badge" style="display: none;">0</span>
    </div>
  `;
}

export function initBellListeners() {
  const bell = document.getElementById('notif-bell');
  if (!bell) return;

  updateBellBadge();

  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  // Close on outside click
  document.addEventListener('click', () => {
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) dropdown.remove();
  });
}

function toggleDropdown() {
  const existing = document.getElementById('notif-dropdown');
  if (existing) {
    existing.remove();
    return;
  }

  clearUnread();

  const dropdown = document.createElement('div');
  dropdown.id = 'notif-dropdown';
  dropdown.className = 'notif-dropdown';
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  if (notifications.length === 0) {
    dropdown.innerHTML = `
      <div class="notif-empty">
        <span style="font-size: 1.5rem;">🔔</span>
        <p>Inga notiser ännu</p>
      </div>
    `;
  } else {
    dropdown.innerHTML = `
      <div class="notif-header">
        <span style="font-weight: 600; font-size: 0.85rem;">Notiser</span>
        <button class="notif-clear" id="notif-clear-btn">Rensa</button>
      </div>
      <div class="notif-list">
        ${notifications.map(n => `
          <div class="notif-item">
            <span class="notif-icon">${n.icon || '🔔'}</span>
            <div class="notif-content">
              <div class="notif-text">${n.text}</div>
              <div class="notif-time">${n.time}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  document.body.appendChild(dropdown);

  // Position below bell
  const bell = document.getElementById('notif-bell');
  if (bell) {
    const rect = bell.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.right = `${window.innerWidth - rect.right}px`;
  }

  document.getElementById('notif-clear-btn')?.addEventListener('click', () => {
    notifications = [];
    unreadCount = 0;
    save();
    dropdown.remove();
  });
}

// ── Format notifications from WebSocket ─────────────
export function handleWebSocketNotification(data) {
  if (data.notification?.type === 'bet_placed') {
    const n = data.notification;
    addNotification({
      icon: '🎯',
      text: `${n.bettor} bettade ${n.amount} kr på ${n.player}`
    });
  }

  if (data.type === 'event_locked') {
    addNotification({
      icon: '🔒',
      text: 'Eventet är nu låst — inga fler bets!'
    });
  }

  if (data.type === 'event_finished') {
    addNotification({
      icon: '🏆',
      text: `${data.winner || 'Vinnaren'} tog hem det!`
    });
  }

  if (data.type === 'event_reopened') {
    addNotification({
      icon: '🔓',
      text: 'Eventet har öppnats igen!'
    });
  }
}
