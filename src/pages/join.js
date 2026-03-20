// ── Page: Join (enter share code) ─────────────────────
import { getEvent } from '../api.js';
import { showToast } from '../utils.js';
import { navigate } from '../main.js';

export async function renderJoin() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="animate-in">
      <div class="page-header">
        <h1 class="page-title">🔗 Gå med i event</h1>
        <p class="page-subtitle">Ange delningskoden du fått av arrangören</p>
      </div>

      <div class="card">
        <form id="join-form">
          <div class="form-group">
            <label class="form-label">Delningskod</label>
            <input type="text" class="form-input" id="join-code"
                   placeholder="T.ex. ABC123" maxlength="6"
                   style="text-align: center; font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase;" />
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="join-btn">
            Gå till event →
          </button>
        </form>
      </div>

      <div class="text-center mt-lg">
        <p class="text-muted" style="font-size: 0.85rem;">
          Koden delas ut av den som skapade eventet. Den är 6 tecken lång.
        </p>
      </div>
    </div>
  `;

  document.getElementById('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    if (!code) return;

    const btn = document.getElementById('join-btn');
    btn.disabled = true;
    btn.textContent = 'Söker...';

    try {
      await getEvent(code);
      navigate('event', { code });
    } catch (err) {
      showToast('Hittar inget event med den koden', 'error');
      btn.disabled = false;
      btn.textContent = 'Gå till event →';
    }
  });

  // Auto-uppercase
  document.getElementById('join-code').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });
}
