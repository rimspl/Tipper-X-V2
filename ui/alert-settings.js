/* ═══════════════════════════════════════════════════════════
   DynaHaul X — Alert Settings Page Logic
   ═══════════════════════════════════════════════════════════ */

const DEFINED_RULES = [
  { event_type: 'pressure_drop', label: 'Pressure Drop Alert', desc: 'Triggered when tyre PSI falls below threshold.', defaultThreshold: 100, unit: 'PSI' },
  { event_type: 'fitment_overdue', label: 'Fitment Overdue', desc: 'Triggered when a position is empty beyond threshold hours.', defaultThreshold: 24, unit: 'hours' },
  { event_type: 'inspection_due', label: 'Inspection Due', desc: 'Triggered when a tyre has not been inspected within threshold days.', defaultThreshold: 7, unit: 'days' },
  { event_type: 'tyre_removed', label: 'Tyre Removed', desc: 'Notification when any tyre is removed.', defaultThreshold: null, unit: '' },
  { event_type: 'rtd_threshold', label: 'RTD Threshold Warning', desc: 'Triggered when RTD approaches replacement threshold.', defaultThreshold: 3, unit: 'mm' }
];

const SITE_ID = (() => {
  try {
    const raw = sessionStorage.getItem('rims_session');
    if (!raw) return null;
    return JSON.parse(raw).siteId || null;
  } catch { return null; }
})();

if (!SITE_ID) {
  document.body.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444">No active session. Please log in from the Manager Dashboard first.</div>';
}

let supabaseClient = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  supabaseClient = window.__supabase || window.supabaseClient;
  if (!supabaseClient) {
    supabaseClient = supabase.createClient(
      'https://ajbbcoygzoxdtejvhbfq.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJicXFkeXpjY2dic3NqY3lpYmJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNjk1ODksImV4cCI6MjA4MjY0NTU4OX0.1UofV5EvtJOl62S_ducJ9mAdL7P3ABKhQpTsO_TvCK8'
    );
  }
  return supabaseClient;
}

/* ── Tabs ──────────────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById(`tab-${btn.dataset.tab}`);
    if (panel) panel.classList.add('active');

    if (btn.dataset.tab === 'history') loadHistory();
  });
});

/* ── Rules ─────────────────────────────────────────────── */
async function loadRules() {
  try {
    const supabase = getSupabase();
    const { data: existing } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('site_id', SITE_ID);

    const rulesMap = {};
    if (existing) {
      existing.forEach(r => { rulesMap[r.event_type] = r; });
    }

    const container = document.getElementById('rulesList');
    container.innerHTML = DEFINED_RULES.map(def => {
      const existingRule = rulesMap[def.event_type];
      const isEnabled = existingRule ? existingRule.enabled : true;
      const threshold = existingRule?.threshold_value ?? def.defaultThreshold ?? '';

      return `
        <div class="rule-row" data-event="${def.event_type}">
          <div class="rule-label">
            <strong>${def.label}</strong>
            <span>${def.desc}</span>
          </div>
          ${def.defaultThreshold !== null ? `
            <input class="threshold-input" type="number" value="${threshold}" min="0" step="1" data-event="${def.event_type}" ${isEnabled ? '' : 'disabled'}>
            <span style="font-size:0.78rem;color:#94a3b8;width:30px">${def.unit}</span>
          ` : ''}
          <div class="toggle ${isEnabled ? 'on' : ''}" data-event="${def.event_type}"></div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const eventType = toggle.dataset.event;
        const isOn = toggle.classList.toggle('on');
        const thresholdInput = container.querySelector(`.threshold-input[data-event="${eventType}"]`);
        if (thresholdInput) thresholdInput.disabled = !isOn;
        document.getElementById('saveRulesBtn').style.display = 'block';
      });
    });

    container.querySelectorAll('.threshold-input').forEach(input => {
      input.addEventListener('change', () => {
        document.getElementById('saveRulesBtn').style.display = 'block';
      });
    });

  } catch (error) {
    console.error('Failed to load rules:', error);
  }
}

document.getElementById('saveRulesBtn')?.addEventListener('click', async () => {
  try {
    const supabase = getSupabase();
    const rows = document.querySelectorAll('.rule-row');

    for (const row of rows) {
      const eventType = row.dataset.event;
      const toggle = row.querySelector('.toggle');
      const isEnabled = toggle.classList.contains('on');
      const thresholdInput = row.querySelector('.threshold-input');
      const threshold = thresholdInput ? Number(thresholdInput.value) : null;

      const { data: existing } = await supabase
        .from('alert_rules')
        .select('id')
        .eq('site_id', SITE_ID)
        .eq('event_type', eventType)
        .maybeSingle();

      const payload = {
        site_id: SITE_ID,
        event_type: eventType,
        enabled: isEnabled,
        threshold_value: threshold
      };

      if (existing?.id) {
        await supabase.from('alert_rules').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('alert_rules').insert(payload);
      }
    }

    document.getElementById('saveRulesBtn').style.display = 'none';
    showToast('Rules saved successfully.');
  } catch (error) {
    showToast('Failed to save rules: ' + error.message, true);
  }
});

/* ── Subscribers ───────────────────────────────────────── */
async function loadSubscribers() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('subscriber_contacts')
      .select('*')
      .eq('site_id', SITE_ID)
      .order('created_at', { ascending: true });

    const list = document.getElementById('subscribersList');
    if (!data || data.length === 0) {
      list.innerHTML = '<div class="empty-state">No subscribers added yet.</div>';
      return;
    }

    list.innerHTML = data.map(sub => `
      <div class="sub-row" data-id="${sub.id}">
        <span class="sub-name">${sub.name || '—'}</span>
        <span class="sub-phone">${sub.phone}</span>
        <span class="sub-role">${sub.role}</span>
        <span><span class="badge ${sub.channels?.includes('sms') ? 'sms' : ''}">SMS</span></span>
        <span><span class="badge ${sub.channels?.includes('whatsapp') ? 'whatsapp' : ''}">WA</span></span>
        <button class="btn btn-danger" style="padding:4px 10px;font-size:0.78rem" data-id="${sub.id}">Remove</button>
      </div>
    `).join('');

    list.querySelectorAll('.btn-danger').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this subscriber?')) return;
        try {
          await supabase.from('subscriber_contacts').delete().eq('id', btn.dataset.id);
          loadSubscribers();
        } catch (error) {
          showToast('Failed to remove: ' + error.message, true);
        }
      });
    });
  } catch (error) {
    console.error('Failed to load subscribers:', error);
  }
}

document.getElementById('addSubBtn')?.addEventListener('click', async () => {
  const name = document.getElementById('subName').value.trim();
  const phone = document.getElementById('subPhone').value.trim();
  const role = document.getElementById('subRole').value;

  if (!phone) { showToast('Phone number is required.', true); return; }
  if (!/^[6-9]\d{9}$/.test(phone)) { showToast('Enter a valid 10-digit Indian mobile number.', true); return; }

  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('subscriber_contacts').insert({
      site_id: SITE_ID,
      name,
      phone,
      role,
      channels: ['sms']
    });

    if (error) throw error;
    document.getElementById('subName').value = '';
    document.getElementById('subPhone').value = '';
    loadSubscribers();
    showToast('Subscriber added.');
  } catch (error) {
    showToast('Failed to add: ' + error.message, true);
  }
});

/* ── History ───────────────────────────────────────────── */
async function loadHistory() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('alert_logs')
      .select('*')
      .eq('site_id', SITE_ID)
      .order('created_at', { ascending: false })
      .limit(50);

    const body = document.getElementById('historyBody');
    const empty = document.getElementById('historyEmpty');

    if (!data || data.length === 0) {
      body.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    body.innerHTML = data.map(log => `
      <tr>
        <td>${new Date(log.created_at).toLocaleString('en-IN')}</td>
        <td>${log.event_type}</td>
        <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${log.message || '—'}</td>
        <td>${log.channel || '—'}</td>
        <td>${log.recipient || '—'}</td>
        <td class="status-${log.status}">${log.status}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

/* ── Toast ──────────────────────────────────────────────── */
function showToast(message, isError = false) {
  const existing = document.querySelector('.toast-msg');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.textContent = message;
  Object.assign(el.style, {
    position: 'fixed', bottom: '24px', right: '24px', padding: '12px 20px',
    borderRadius: '8px', fontSize: '0.85rem', fontWeight: '500', zIndex: '9999',
    background: isError ? 'rgba(239,68,68,0.9)' : 'rgba(16,185,129,0.9)',
    color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ── Init ───────────────────────────────────────────────── */
loadRules();
loadSubscribers();
