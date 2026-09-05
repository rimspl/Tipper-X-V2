/**
 * supabase-probe.js
 *
 * One-shot diagnostic, no side-effects, no credentials invented.
 *
 * What it does:
 *   1. Loads ./.env via dotenv (so the AI never has to paste keys).
 *   2. Prints which of the seven known credentials are present
 *      (PRESENT / MISSING — never echoes values).
 *   3. Calls Supabase's PostgREST /sites endpoint with the ANON key
 *      and reports HTTP status + first row's invite_code if reachable.
 *   4. Exits with code 0 (everything ok), 2 (anon ok but service-role
 *      missing — recommended for tomorrow), or 3 (anon failed —
 *      network or credentials problem).
 *
 * Run with:   node tools/supabase-probe.js
 * Do NOT commit.
 */

import 'dotenv/config';

const KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'FAST2SMS_API_KEY',
  'FAST2SMS_SENDER_ID',
  'OTP_PROVIDER_BASE_URL',
  'ALERT_CRON_SECRET',
];

function short(value) {
  if (!value) return 'MISSING';
  if (value.length <= 12) return `PRESENT (${value.length} chars)`;
  return `PRESENT (${value.length} chars)`;
}

function presence(value) {
  return value ? 'PRESENT' : 'MISSING';
}

async function main() {
  console.log('--- DynaHaul X v2 — Supabase probe ---');
  console.log('cwd       :', process.cwd());
  console.log('Node      :', process.version);
  console.log('');

  console.log('--- env keys ---');
  const summary = {};
  for (const k of KEYS) {
    const v = String(process.env[k] || '').trim();
    summary[k] = v;
    console.log(`  ${k.padEnd(30)} ${presence(v)}`);
  }
  console.log('');

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon) {
    console.log('SKIP live probe — SUPABASE_URL or SUPABASE_ANON_KEY missing.');
    process.exit(2);
  }

  console.log('--- live probe (anon key, /sites?select=invite_code&limit=1) ---');
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  let httpStatus = '???';
  let exitCode = 3;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/sites?select=invite_code,site_name&limit=1`, {
      method: 'GET',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      signal: controller.signal,
    });
    httpStatus = res.status;
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.log(`  HTTP ${res.status}  ${res.statusText}`);
      console.log(`  body: ${txt.slice(0, 240)}`);
      process.exit(3);
    }
    const arr = await res.json();
    console.log(`  HTTP 200  rows=${Array.isArray(arr) ? arr.length : '?'}`);
    const first = Array.isArray(arr) && arr[0];
    if (first) {
      const ic = first.invite_code || '';
      const sn = first.site_name || '';
      console.log(`  site_name   = ${sn}`);
      console.log(`  invite_code = ${ic}`);
    } else {
      console.log('  (no rows — your sites table is empty, run tools/seed-demo-site-and-profile.sql)');
    }
    exitCode = service ? 0 : 2;
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'timed out' : (err?.message || String(err));
    console.log(`  ERR  ${msg}`);
    exitCode = 3;
  } finally {
    clearTimeout(t);
  }

  console.log('');
  if (exitCode === 0) {
    console.log('VERDICT: anon + service-role both present — fully wired.');
  } else if (exitCode === 2) {
    console.log('VERDICT: anon reachable, service-role missing.');
    console.log('         login + read will work; admin ops (create-user, site-save) will not.');
    console.log('         Action: ask Amit sir for SUPABASE_SERVICE_ROLE_KEY, then rerun.');
  } else {
    console.log('VERDICT: anon unreachable. Check internet/VPN and rerun.');
  }
  process.exit(exitCode);
}

main();
