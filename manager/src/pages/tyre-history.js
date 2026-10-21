import { exportRowsAsCsv } from '../lib/export.js';
import { requireManagerSession } from '../lib/session.js';
import { fetchManagerDataset } from '../services/data-service.js';
import { fetchEvidenceUrls } from '../services/review-service.js';

const session = requireManagerSession();
if (!session) {
  throw new Error('No manager session available');
}

const params = new URLSearchParams(window.location.search);
const requestedTyre = normalize(params.get('tyre'));
const sourceTab = resolveSourceTab(params.get('from'));

const state = {
  session,
  requestedTyre,
  sourceTab,
  page: 1,
  pageSize: 50,
  rows: [],
  pickerEntries: [],
  pickerQuery: ''
};

const elements = {
  historyUserLabel: document.getElementById('historyUserLabel'),
  historyTopBack: document.getElementById('historyTopBack'),
  historyBackBtn: document.getElementById('historyBackBtn'),
  historyTitle: document.getElementById('historyTitle'),
  historyMeta: document.getElementById('historyMeta'),
  historyExportBtn: document.getElementById('historyExportBtn'),
  historyAllTyres: document.getElementById('historyAllTyres'),
  historyPicker: document.getElementById('historyPicker'),
  historyPickerBody: document.getElementById('historyPickerBody'),
  historyPickerCount: document.getElementById('historyPickerCount'),
  historyPickerEmpty: document.getElementById('historyPickerEmpty'),
  historySearch: document.getElementById('historySearch'),
  historyFilters: document.getElementById('historyFilters'),
  historyTableFooter: document.getElementById('historyTableFooter'),
  historyTableWrap: document.getElementById('historyTableWrap'),
  historyFrom: document.getElementById('historyFrom'),
  historyTo: document.getElementById('historyTo'),
  historyTruck: document.getElementById('historyTruck'),
  historyBrand: document.getElementById('historyBrand'),
  historyActivity: document.getElementById('historyActivity'),
  historyApplyFilter: document.getElementById('historyApplyFilter'),
  historyPageMeta: document.getElementById('historyPageMeta'),
  historyPageSize: document.getElementById('historyPageSize'),
  historyPrevPage: document.getElementById('historyPrevPage'),
  historyNextPage: document.getElementById('historyNextPage'),
  historyPageInfo: document.getElementById('historyPageInfo'),
  historyTableBody: document.getElementById('historyTableBody'),
  historyEvidenceModal: document.getElementById('historyEvidenceModal'),
  historyEvidenceModalClose: document.getElementById('historyEvidenceModalClose'),
  historyEvidenceModalSub: document.getElementById('historyEvidenceModalSub'),
  historyEvidenceTableBody: document.getElementById('historyEvidenceTableBody'),
  toastHost: document.getElementById('toastHost'),
  loadingOverlay: document.getElementById('loadingOverlay')
};

init().catch((error) => {
  console.error(error);
  toast(error.message || 'Failed to load tyre history', 'error');
  if (elements.loadingOverlay) {
    elements.loadingOverlay.classList.add('fade-out');
  }
});

async function init() {
  elements.historyUserLabel.textContent = `${state.session.username} • ${state.session.siteName}`;
  const backUrl = `./index.html#${state.sourceTab}`;
  elements.historyTopBack.href = backUrl;
  elements.historyBackBtn.href = backUrl;
  if (elements.historyAllTyres) {
    elements.historyAllTyres.href = `./tyre-history.html?from=${state.sourceTab}`;
  }

  bindEvents();

  if (!state.requestedTyre) {
    await initPicker();
    return;
  }

  setPickerMode(false);
  elements.historyTitle.textContent = `Tyre History - ${state.requestedTyre}`;

  const dataset = await fetchManagerDataset(state.session.siteId, (freshData) => {
    state.rows = (freshData.inspectionRecords || [])
      .filter((row) => normalize(row.tyre_no) === state.requestedTyre)
      .sort(sortHistoryRows);
    renderHistoryTable();
    toast('History updated with live data.', 'info');
  });
  state.rows = (dataset.inspectionRecords || [])
    .filter((row) => normalize(row.tyre_no) === state.requestedTyre)
    .sort(sortHistoryRows);

  renderHistoryTable();
  dismissLoading();
}

async function initPicker() {
  setPickerMode(true);
  elements.historyTitle.textContent = 'Tyre History';
  elements.historyMeta.textContent = 'Select a tyre to see its inspection, pressure and fitment history.';

  try {
    const dataset = await fetchManagerDataset(state.session.siteId);
    state.pickerEntries = buildPickerEntries(dataset);
    renderPicker();
  } catch (error) {
    console.error(error);
    elements.historyPickerCount.textContent = 'Unavailable';
    elements.historyPickerEmpty.textContent = 'Could not load tyres. Refresh the page to try again.';
    elements.historyPickerEmpty.hidden = false;
    toast(error.message || 'Failed to load tyres', 'error');
  } finally {
    dismissLoading();
  }
}

function setPickerMode(enabled) {
  elements.historyPicker?.classList.toggle('hidden', !enabled);
  elements.historyFilters?.classList.toggle('hidden', enabled);
  elements.historyTableFooter?.classList.toggle('hidden', enabled);
  elements.historyTableWrap?.classList.toggle('hidden', enabled);
  if (elements.historyExportBtn) {
    elements.historyExportBtn.classList.toggle('hidden', enabled);
    elements.historyExportBtn.disabled = enabled;
  }
  elements.historyAllTyres?.classList.toggle('hidden', enabled);
}

function buildPickerEntries(dataset) {
  const entries = new Map();

  const upsert = (row) => {
    const key = normalize(row?.tyre_no);
    if (!key || key === '-') return;

    const entry = entries.get(key) || {
      tyre: cleanValue(row.tyre_no),
      truck: '',
      brand: '',
      status: '',
      lastInspection: null
    };

    if (!entry.truck) entry.truck = cleanValue(row.vehicle_no || row.truck);
    if (!entry.brand) entry.brand = cleanValue(row.make || row.brand);
    if (!entry.status) entry.status = cleanValue(row.status || row.tyre_status || row.current_status);

    const lastSeen = parseDateValue(row.activity_date || row.last_inspection_date || row.latest_inspection_date);
    if (lastSeen && (!entry.lastInspection || lastSeen > entry.lastInspection)) {
      entry.lastInspection = lastSeen;
    }

    entries.set(key, entry);
  };

  (dataset?.tyreRecords || []).forEach(upsert);
  (dataset?.inspectionRecords || []).forEach(upsert);

  return Array.from(entries.values()).sort((a, b) => {
    const left = b.lastInspection?.getTime() || 0;
    const right = a.lastInspection?.getTime() || 0;
    return left - right || a.tyre.localeCompare(b.tyre, undefined, { numeric: true });
  });
}

function renderPicker() {
  const query = normalize(state.pickerQuery);
  const matches = state.pickerEntries.filter((entry) => {
    if (!query) return true;
    return [entry.tyre, entry.truck, entry.brand]
      .some((value) => normalize(value).includes(query));
  });

  elements.historyPickerCount.textContent = `${matches.length} ${matches.length === 1 ? 'tyre' : 'tyres'}`;
  elements.historyPickerBody.replaceChildren();

  if (matches.length === 0) {
    elements.historyPickerEmpty.hidden = false;
    elements.historyPickerEmpty.textContent = state.pickerEntries.length === 0
      ? 'No tyres found for this site yet.'
      : 'No tyres match your search.';
    return;
  }

  elements.historyPickerEmpty.hidden = true;

  for (const entry of matches.slice(0, 100)) {
    const row = document.createElement('tr');

    const tyre = document.createElement('td');
    tyre.textContent = entry.tyre;
    const truck = document.createElement('td');
    truck.textContent = entry.truck || '-';
    const brand = document.createElement('td');
    brand.textContent = entry.brand || '-';
    const status = document.createElement('td');
    status.textContent = entry.status || '-';
    const lastInspection = document.createElement('td');
    lastInspection.textContent = entry.lastInspection
      ? entry.lastInspection.toLocaleDateString('en-IN')
      : '-';

    const open = document.createElement('td');
    const link = document.createElement('a');
    link.className = 'btn btn-secondary';
    link.href = `./tyre-history.html?tyre=${encodeURIComponent(entry.tyre)}&from=${state.sourceTab}`;
    link.textContent = 'Open history';
    link.setAttribute('aria-label', `Open history for tyre ${entry.tyre}`);
    open.appendChild(link);

    row.append(tyre, truck, brand, status, lastInspection, open);
    elements.historyPickerBody.appendChild(row);
  }
}

function dismissLoading() {
  if (!elements.loadingOverlay) return;
  elements.loadingOverlay.classList.add('fade-out');
  elements.loadingOverlay.addEventListener('transitionend', () => {
    elements.loadingOverlay.remove();
  }, { once: true });
}

function bindEvents() {
  elements.historySearch?.addEventListener('input', (event) => {
    state.pickerQuery = event.target.value;
    renderPicker();
  });

  elements.historyApplyFilter?.addEventListener('click', () => {
    state.page = 1;
    renderHistoryTable();
  });

  elements.historyExportBtn?.addEventListener('click', exportHistoryRows);

  elements.historyPageSize?.addEventListener('change', () => {
    state.pageSize = Math.max(1, Number(elements.historyPageSize.value || 50));
    state.page = 1;
    renderHistoryTable();
  });

  elements.historyPrevPage?.addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    renderHistoryTable();
  });

  elements.historyNextPage?.addEventListener('click', () => {
    state.page += 1;
    renderHistoryTable();
  });

  elements.historyEvidenceModalClose?.addEventListener('click', closeEvidenceModal);
  elements.historyEvidenceModal?.addEventListener('click', (event) => {
    if (event.target === elements.historyEvidenceModal) {
      closeEvidenceModal();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!elements.historyEvidenceModal.classList.contains('hidden')) {
      closeEvidenceModal();
    }
  });
}

function getFilteredRows() {
  const filters = {
    from: elements.historyFrom.value,
    to: elements.historyTo.value,
    truck: normalize(elements.historyTruck.value),
    brand: normalize(elements.historyBrand.value),
    activity: elements.historyActivity.value
  };

  return state.rows.filter((row) => {
    if (filters.activity && row.activity_type !== filters.activity) return false;
    if (filters.from && row.activity_date < filters.from) return false;
    if (filters.to && row.activity_date > filters.to) return false;
    if (filters.truck && !normalize(row.truck).includes(filters.truck)) return false;
    if (filters.brand && !normalize(row.brand).includes(filters.brand)) return false;
    return true;
  });
}

function renderHistoryTable() {
  const filteredRows = getFilteredRows();
  const paged = paginateRows(filteredRows, state.page, state.pageSize);
  state.page = paged.page;

  elements.historyMeta.textContent = `Total records for ${state.requestedTyre}: ${state.rows.length} | Filtered: ${filteredRows.length}`;
  elements.historyPageMeta.textContent = paged.total === 0
    ? 'Showing 0 of 0 rows'
    : `Showing ${paged.start}-${paged.end} of ${paged.total} rows`;
  elements.historyPageInfo.textContent = `Page ${paged.page} / ${paged.totalPages}`;
  elements.historyPrevPage.disabled = paged.page <= 1;
  elements.historyNextPage.disabled = paged.page >= paged.totalPages;
  elements.historyExportBtn.disabled = filteredRows.length === 0;

  elements.historyTableBody.innerHTML = '';
  if (paged.rows.length === 0) {
    elements.historyTableBody.innerHTML = '<tr><td colspan="13">No history records found for this filter.</td></tr>';
    return;
  }

  for (const row of paged.rows) {
    const tr = document.createElement('tr');
    const hasEvidence = Boolean(row.evidence_submission_id);
    tr.innerHTML = `
      <td>${row.activity_date}</td>
      <td>${row.activity_type}</td>
      <td>${row.truck}</td>
      <td>${row.tyre_no}</td>
      <td>${row.brand}</td>
      <td>${row.position}</td>
      <td>${formatNumber(row.odometer)}</td>
      <td>${row.rtd1}</td>
      <td>${row.rtd2}</td>
      <td>${row.psi_found}</td>
      <td>${row.psi_corrected}</td>
      <td>${row.remarks}</td>
      <td>
        <button class="btn btn-secondary" type="button" data-submission-id="${row.evidence_submission_id || ''}" ${hasEvidence ? '' : 'disabled'}>
          ${hasEvidence ? 'View Voice Note' : 'No Voice'}
        </button>
      </td>
    `;

    const evidenceButton = tr.querySelector('button[data-submission-id]');
    evidenceButton?.addEventListener('click', async () => {
      const submissionId = evidenceButton.dataset.submissionId;
      if (!submissionId) {
        return;
      }

      try {
        await openEvidenceModal({
          submissionId,
          title: `${row.activity_type} • ${row.tyre_no} • ${row.truck}`
        });
      } catch (error) {
        toast(error.message || 'Unable to open evidence', 'error');
      }
    });

    elements.historyTableBody.appendChild(tr);
  }
}

function exportHistoryRows() {
  const rows = getFilteredRows();
  if (rows.length === 0) {
    toast('No rows available for export.', 'info');
    return;
  }

  exportRowsAsCsv({
    filename: `tyre-history-${state.requestedTyre}-${today()}.csv`,
    columns: [
      { label: 'Date', key: 'activity_date' },
      { label: 'Activity', key: 'activity_type' },
      { label: 'Truck', key: 'truck' },
      { label: 'Tyre Number', key: 'tyre_no' },
      { label: 'Brand', key: 'brand' },
      { label: 'Position', key: 'position' },
      { label: 'Odometer', key: 'odometer' },
      { label: 'RTD1', key: 'rtd1' },
      { label: 'RTD2', key: 'rtd2' },
      { label: 'PSI Found', key: 'psi_found' },
      { label: 'PSI Corrected', key: 'psi_corrected' },
      { label: 'Remarks', key: 'remarks' }
    ],
    rows
  });

  toast(`History CSV exported (${rows.length} records).`, 'success');
}

async function openEvidenceModal({ submissionId, title }) {
  if (!submissionId) {
    toast('Submission ID missing for evidence lookup.', 'info');
    return;
  }

  elements.historyEvidenceModal.classList.remove('hidden');
  elements.historyEvidenceModalSub.textContent = `Submission: ${submissionId}`;
  elements.historyEvidenceTableBody.innerHTML = '<tr><td colspan="7">Fetching evidence from bucket...</td></tr>';

  try {
    const evidence = await fetchEvidenceUrls(submissionId);
    elements.historyEvidenceModalSub.textContent = title
      ? `${title} | Submission: ${submissionId}`
      : `Submission: ${submissionId}`;

    if (!Array.isArray(evidence) || evidence.length === 0) {
      elements.historyEvidenceTableBody.innerHTML = '<tr><td colspan="7">No evidence rows found for this submission.</td></tr>';
      return;
    }

    elements.historyEvidenceTableBody.innerHTML = '';
    for (const item of evidence) {
      const tr = document.createElement('tr');

      const hasMediaUrl = Boolean(item.signed_url);
      let mediaCell = '-';
      if (hasMediaUrl && String(item.media_kind || '').toLowerCase() === 'audio') {
        mediaCell = `<audio controls preload="none" src="${item.signed_url}"></audio>`;
      } else if (hasMediaUrl) {
        mediaCell = `<a class="inline-link" href="${item.signed_url}" target="_blank" rel="noopener noreferrer">Open file</a>`;
      }

      tr.innerHTML = `
        <td>${item.field_label || prettifyStepId(item.step_id)}</td>
        <td>${item.step_id || '-'}</td>
        <td>${item.media_kind || '-'}</td>
        <td>${formatDateTime(item.captured_at)}</td>
        <td>${mediaCell}</td>
        <td>${formatTranscript(item.transcript)}</td>
        <td>${item.storage_path || '-'}</td>
      `;
      elements.historyEvidenceTableBody.appendChild(tr);
    }
  } catch (error) {
    elements.historyEvidenceTableBody.innerHTML = `<tr><td colspan="7">${error.message || 'Failed to fetch evidence.'}</td></tr>`;
    throw error;
  }
}

function closeEvidenceModal() {
  elements.historyEvidenceModal.classList.add('hidden');
}

function sortHistoryRows(a, b) {
  const left = Date.parse(`${a.activity_date || ''}T00:00:00Z`);
  const right = Date.parse(`${b.activity_date || ''}T00:00:00Z`);

  if (Number.isFinite(left) && Number.isFinite(right) && left !== right) {
    return right - left;
  }

  return String(b.id || '').localeCompare(String(a.id || ''));
}

function paginateRows(rows, page, pageSize) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const size = Math.max(1, Number(pageSize || 50));
  const total = normalizedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(Math.max(1, Number(page || 1)), totalPages);
  const startIndex = (currentPage - 1) * size;
  const endIndex = Math.min(startIndex + size, total);

  return {
    rows: normalizedRows.slice(startIndex, endIndex),
    page: currentPage,
    totalPages,
    total,
    start: total === 0 ? 0 : startIndex + 1,
    end: endIndex
  };
}

function resolveSourceTab(value) {
  const tab = String(value || '').trim().toLowerCase();
  return tab === 'inspection' ? 'inspection' : 'tyres';
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function prettifyStepId(stepId) {
  const normalized = String(stepId || '').trim().toLowerCase();
  if (!normalized) return '-';
  return normalized
    .replace(/_voice$/i, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTranscript(transcript) {
  const text = String(transcript || '').trim();
  if (!text) return '-';
  if (text.length <= 140) {
    return text;
  }
  return `${text.slice(0, 140)}...`;
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function cleanValue(value) {
  const text = String(value ?? '').trim();
  return text && text !== '-' ? text : '';
}

function parseDateValue(value) {
  if (!value || value === '-') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '' || value === '-') {
    return '-';
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '-';
  }
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function toast(message, type = 'info') {
  const toastNode = document.createElement('div');
  toastNode.className = `toast toast-${type}`;
  toastNode.textContent = message;
  elements.toastHost.appendChild(toastNode);
  setTimeout(() => toastNode.remove(), 3200);
}
