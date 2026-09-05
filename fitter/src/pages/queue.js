import { FORM_LABELS, QUEUE_STATUS } from '../lib/constants.js';
import {
  getQueueView,
  retryQueueItemById,
  runSyncCycle
} from '../lib/queue-engine.js';
import { requireFitterSession } from '../lib/session.js';
import { formatDate, showToast, updateNetworkBadge } from '../lib/ui.js';

const session = requireFitterSession();
if (!session) {
  throw new Error('No valid fitter session');
}

const elements = {
  networkBadge: document.getElementById('networkBadge'),
  syncBadge: document.getElementById('syncBadge'),
  queueSummary: document.getElementById('queueSummary'),
  queueBody: document.getElementById('queueBody'),
  syncNowBtn: document.getElementById('syncNowBtn'),
  refreshBtn: document.getElementById('refreshBtn')
};

init().catch((error) => {
  console.error(error);
  showToast(error.message || 'Queue page init failed', 'error');
});

async function init() {
  updateNetworkBadge(elements.networkBadge);
  bindEvents();
  await refreshView();

  window.addEventListener('online', async () => {
    updateNetworkBadge(elements.networkBadge);
    await runSyncNow();
  });
  window.addEventListener('offline', () => updateNetworkBadge(elements.networkBadge));
}

function bindEvents() {
  elements.syncNowBtn.addEventListener('click', runSyncNow);
  elements.refreshBtn.addEventListener('click', refreshView);
}

async function refreshView() {
  updateNetworkBadge(elements.networkBadge);

  const queue = await getQueueView();
  const pending = queue.filter((item) => item.status === QUEUE_STATUS.pending || item.status === QUEUE_STATUS.retry || item.status === QUEUE_STATUS.running).length;
  const failed = queue.filter((item) => item.status === QUEUE_STATUS.failed).length;
  const completed = queue.filter((item) => item.status === QUEUE_STATUS.completed).length;

  elements.syncBadge.textContent = `Queue ${pending} pending`;
  elements.queueSummary.textContent = `Total ${queue.length} • Pending ${pending} • Completed ${completed} • Failed ${failed}`;

  renderRows(queue);
}

function renderRows(queue) {
  elements.queueBody.innerHTML = '';
  if (queue.length === 0) {
    elements.queueBody.innerHTML = '<tr><td colspan="7">No queue items found.</td></tr>';
    return;
  }

  for (const item of queue) {
    const row = document.createElement('tr');
    const submission = item.submission;
    const actionHtml = item.status === QUEUE_STATUS.failed
      ? `<button class="inline-btn" data-retry-id="${item.queue_id}">Retry</button>`
      : '-';

    row.innerHTML = `
      <td>${FORM_LABELS[item.form_type] || item.form_type || '-'}</td>
      <td>${item.submission_local_id.slice(0, 8)}</td>
      <td>${submission?.sync_state || item.status}</td>
      <td>${item.attempts || 0}</td>
      <td>${item.next_retry_at ? formatDate(item.next_retry_at) : '-'}</td>
      <td>${item.last_error || submission?.last_error || '-'}</td>
      <td>${actionHtml}</td>
    `;

    const retryButton = row.querySelector('button[data-retry-id]');
    if (retryButton) {
      retryButton.addEventListener('click', async () => {
        try {
          await retryQueueItemById(item.queue_id);
          showToast('Retry queued.', 'success');
          await refreshView();
        } catch (error) {
          showToast(error.message || 'Retry failed', 'error');
        }
      });
    }

    elements.queueBody.appendChild(row);
  }
}

async function runSyncNow() {
  if (!navigator.onLine) {
    showToast('Offline mode active. Sync is paused.', 'info');
    await refreshView();
    return;
  }

  elements.syncNowBtn.disabled = true;

  try {
    const result = await runSyncCycle({
      onProgress: ({ type, message }) => {
        if (type === 'failed') {
          showToast(message, 'error');
        }
      }
    });

    if (result.processed === 0) {
      showToast('No pending queue item found.', 'info');
    } else {
      showToast(`Sync complete: ${result.synced} synced, ${result.failed} failed.`, result.failed > 0 ? 'info' : 'success');
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Sync failed', 'error');
  } finally {
    elements.syncNowBtn.disabled = false;
    await refreshView();
  }
}
