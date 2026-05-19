// Shared utilities

function timeAgo(ts) {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function expiresIn(ts) {
  const now = Math.floor(Date.now() / 1000);
  const diff = ts - now;
  if (diff <= 0) return 'expired';
  if (diff < 3600) return `expires in ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `expires in ${Math.floor(diff / 3600)}h`;
  return `expires in ${Math.floor(diff / 86400)}d`;
}

function showToast(msg, duration = 2000) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), duration);
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Auth state
let currentUser = null;
async function loadUser() {
  try {
    currentUser = await apiFetch('/api/auth/me');
  } catch { currentUser = { loggedIn: false }; }
  return currentUser;
}

function renderNav(user) {
  const navRight = document.getElementById('nav-right');
  if (!navRight) return;
  if (user.loggedIn) {
    navRight.innerHTML = `
      <span class="nav-username">${user.username}</span>
      <button class="btn btn-ghost" id="logout-btn">Log out</button>
      <a href="/new" class="btn btn-primary">+ Post</a>
    `;
    document.getElementById('logout-btn').onclick = async () => {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      location.reload();
    };
  } else {
    navRight.innerHTML = `
      <button class="btn btn-secondary" id="open-auth">Log in / Register</button>
      <a href="/new" class="btn btn-primary">+ Post</a>
    `;
    document.getElementById('open-auth').onclick = () => openAuthModal();
  }
}

// Auth Modal
function openAuthModal() {
  document.getElementById('auth-modal').classList.add('open');
}
function closeAuthModal() {
  document.getElementById('auth-modal').classList.remove('open');
}

function initAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;

  const tabs = modal.querySelectorAll('.modal-tab');
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      modal.querySelectorAll('.auth-panel').forEach(p => p.style.display = 'none');
      modal.querySelector(`#panel-${tab.dataset.tab}`).style.display = 'block';
      modal.querySelector('.error-msg').textContent = '';
    };
  });

  modal.querySelector('#auth-overlay-bg').onclick = closeAuthModal;

  // Login
  modal.querySelector('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const err = modal.querySelector('.error-msg');
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: modal.querySelector('#login-username').value,
          password: modal.querySelector('#login-password').value,
        })
      });
      showToast(`Welcome back, ${data.username}!`);
      closeAuthModal();
      location.reload();
    } catch (e) { err.textContent = e.message; }
  };

  // Register
  modal.querySelector('#register-form').onsubmit = async (e) => {
    e.preventDefault();
    const err = modal.querySelector('.error-msg');
    try {
      const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: modal.querySelector('#reg-username').value,
          password: modal.querySelector('#reg-password').value,
        })
      });
      showToast(`Welcome, ${data.username}!`);
      closeAuthModal();
      location.reload();
    } catch (e) { err.textContent = e.message; }
  };
}

function authModalHTML() {
  return `
  <div class="modal-overlay" id="auth-modal">
    <div id="auth-overlay-bg" style="position:absolute;inset:0;"></div>
    <div class="modal" style="position:relative;z-index:1;">
      <div class="modal-tabs">
        <button class="modal-tab active" data-tab="login">Log in</button>
        <button class="modal-tab" data-tab="register">Register</button>
      </div>
      <p class="error-msg" id="auth-error"></p>

      <div class="auth-panel" id="panel-login">
        <form id="login-form">
          <div class="form-group">
            <label class="form-label">Username</label>
            <input class="form-input" id="login-username" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-input" type="password" id="login-password" autocomplete="current-password" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Log in</button>
        </form>
      </div>

      <div class="auth-panel" id="panel-register" style="display:none;">
        <form id="register-form">
          <div class="form-group">
            <label class="form-label">Username</label>
            <input class="form-input" id="reg-username" autocomplete="username" required minlength="3">
            <p class="form-hint">Min 3 characters</p>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-input" type="password" id="reg-password" autocomplete="new-password" required minlength="6">
            <p class="form-hint">Min 6 characters</p>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Create account</button>
        </form>
      </div>
    </div>
  </div>`;
}
