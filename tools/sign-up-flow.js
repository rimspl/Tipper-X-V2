/**
 * sign-up-flow.js
 *
 * Pre-flight check for the self-signup page (signup.html).
 * Run before opening the signup page to confirm:
 *   1. SUPABASE_SERVICE_ROLE_KEY is present in .env
 *   2. At least one site exists in the DB (dropdown needs a row)
 *   3. Resend key is present (OTP will need it after signup)
 *
 * If any are missing, it prints a clear action to take.
 * Reads .env via dotenv (no secrets echoed).
 *
 * Run with:   node tools/sign-up-flow.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

function presence(value, label) {
  if (!value || String(value).startsWith('#PENDING')) return 'MISSING';
  return 'PRESENT';
}

async function main() {
  const heading = (text) => { console.log(''); console.log(text); };
  const gap = () => console.log('');

  heading('--- Sign-Up Flow Pre-Flight ---');
  console.log('SUPABASE_URL             :', presence(SUPABASE_URL, 'url'));
  console.log('SUPABASE_SERVICE_ROLE_KEY:', presence(SUPABASE_SERVICE_ROLE_KEY, 'service_role'));
  console.log('RESEND_API_KEY           :', presence(RESEND_API_KEY, 'email'));

  let exitCode = 0;

  if (!SUPABASE_URL) {
    console.log('  -> ACTION: fill SUPABASE_URL in .env.');
    exitCode = Math.max(exitCode, 2);
  }
  if (!SUPABASE_SERVICE_ROLE_KEY || String(SUPABASE_SERVICE_ROLE_KEY).startsWith('#PENDING')) {
    console.log('');
    console.log('  ⚠ SUPABASE_SERVICE_ROLE_KEY is missing or stubbed.');
    console.log('    The signup page will POST to /api/create-user but');
    console.log('    create-user.js requires this key.');
    console.log('    wait for Amit sir, then replace .env line 9 with the real JWT.');
    exitCode = Math.max(exitCode, 2);
  }
  if (!RESEND_API_KEY || String(RESEND_API_KEY).startsWith('#PENDING')) {
    console.log('');
    console.log('  ⚠ RESEND_API_KEY is missing.');
    console.log('    OTP emails will not send after signup. Login will reach the');
    console.log('    OTP screen but the email step will fail.');
    exitCode = Math.max(exitCode, 1);
  }

  if (exitCode !== 0) {
    console.log('');
    console.log('VERDICT: not yet ready for full sign-up flow.');
    console.log('         temporarly, use DevTools rims_session bypass for demo.');
    process.exit(exitCode);
  }

  gap();

  // Live probe: count sites
  heading('--- Sites count (anon key) ---');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const { data, error, count } = await supabase
      .from('sites')
      .select('id, site_name, invite_code', { count: 'exact' });
    if (error) throw error;
    console.log('sites found:', count ?? 0);
    if (count > 0) {
      console.log('  signup dropdown will populate with:');
      for (const s of data.slice(0, 5)) {
        console.log(`    ${s.site_name}  (invite: ${s.invite_code || '—'})`);
      }
    } else {
      console.log('  -> ACTION: run tools/seed-demo-site-and-profile.sql in Supabase SQL Editor');
      console.log('     to create the demo site with invite_code DEMO0001.');
    }
  } catch (err) {
    console.log('  ERR:', err?.message || String(err));
  }

  gap();
  heading('--- Ready ---');
  console.log('  Open http://127.0.0.1:3000/signup.html');
  console.log('  Fill name + email + password + role + site → Create Account');
  console.log('  After creation, /fitter/login.html auto-redirects to OTP.');
  process.exit(0);
}

main();