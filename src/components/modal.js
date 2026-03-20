// ── Components: Modal ─────────────────────────────────

export function showModal(title, contentHtml, onClose) {
  const root = document.getElementById('modal-root');

  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-content">
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

  const close = () => {
    root.innerHTML = '';
    if (onClose) onClose();
  };

  root.querySelector('#modal-close-btn').addEventListener('click', close);
  root.querySelector('#modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') close();
  });

  return { close, root };
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}
