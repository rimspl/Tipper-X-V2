const recentToastMap = new Map();

export function showToast(message, type = 'info') {
  if (type === 'error' || type === 'warning') {
    return showModalAlert(message, type);
  }

  const host = document.getElementById('toastHost');
  if (!host) return;

  const key = `${type}:${String(message || '')}`;
  const now = Date.now();
  const last = recentToastMap.get(key) || 0;
  if (now - last < 900) {
    return;
  }
  recentToastMap.set(key, now);

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  host.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 240);
  }, 3200);
}

export function showModalAlert(message, type = 'error') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  const title = type === 'error' ? 'Alert' : 'Warning';
  const icon = type === 'error' ? '⚠️' : 'ℹ️';

  overlay.innerHTML = `
    <div class="modal-dialog modal-${type}">
      <div class="modal-header">
        <h3>${icon} ${title}</h3>
        <button class="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <p>${message}</p>
      </div>
      <div class="modal-footer">
        <button class="modal-ok-btn">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('.modal-close-btn');
  const okBtn = overlay.querySelector('.modal-ok-btn');

  const dismiss = () => {
    overlay.classList.add('modal-hide');
    setTimeout(() => overlay.remove(), 250);
  };

  closeBtn.addEventListener('click', dismiss);
  okBtn.addEventListener('click', dismiss);
}

export function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

export function formatState(state) {
  const map = {
    ready_to_sync: 'Ready',
    syncing: 'Syncing',
    synced: 'Synced',
    processing: 'Processing',
    report_ready: 'Report Ready',
    failed: 'Failed'
  };
  return map[state] || state || '-';
}

export function updateNetworkBadge(element) {
  if (!element) return;
  const online = navigator.onLine;
  element.textContent = online ? 'Online' : 'Offline';
  element.className = `chip ${online ? 'chip-online' : 'chip-offline'}`;
}

export function createId() {
  if (crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `fallback-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
