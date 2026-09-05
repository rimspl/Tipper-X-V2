#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DAILY_LOG_DIR = path.resolve(__dirname, '..', '..', 'daily-log')
const TIPPER_DEMO_DIR = __dirname
const ENV_PATH = path.join(TIPPER_DEMO_DIR, '.env')
const UPDATES_PATH = path.join(TIPPER_DEMO_DIR, 'updates.md')
const DOC_PATH = path.join(TIPPER_DEMO_DIR, 'DynaHaul_XB2_Documentation.md')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(res => rl.question(q, ans => res(ans.trim())))

function findLatestLog() {
  if (!fs.existsSync(DAILY_LOG_DIR)) return null
  const files = fs.readdirSync(DAILY_LOG_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse()
  if (!files.length) return null
  const latest = files[0]
  const full = path.join(DAILY_LOG_DIR, latest)
  return { file: latest, full, content: fs.readFileSync(full, 'utf8'), all: files }
}

function extractSection(md, title) {
  const regex = new RegExp(`###.*${title}[\\s\\S]*?(?=###|$)`, 'i')
  const m = md.match(regex)
  return m ? m[0].trim().slice(0, 1200) : '(not found)'
}

function parseEnv() {
  if (!fs.existsSync(ENV_PATH)) return { exists: false, vals: {} }
  const raw = fs.readFileSync(ENV_PATH, 'utf8')
  const vals = {}
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    vals[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
  }
  return { exists: true, vals, raw }
}

function checkConnections(env) {
  const keys = [
    ['SUPABASE_URL', 'Supabase Postgres + Auth + Storage', 'https://supabase.com/dashboard'],
    ['SUPABASE_ANON_KEY', 'Supabase Anon (client)', ''],
    ['SUPABASE_SERVICE_ROLE_KEY', 'Supabase Service Role (admin writes)', 'Supabase → Settings → API → service_role'],
    ['RESEND_API_KEY', 'Resend Email OTP', 'https://resend.com/api-keys'],
    ['FAST2SMS_API_KEY', 'Fast2SMS SMS Alerts', 'https://www.fast2sms.com/dev/dashboard'],
    ['FAST2SMS_SENDER_ID', 'DLT Sender ID (DYNHLX)', ''],
    ['OTP_PROVIDER_BASE_URL', 'OTP Provider PHP endpoint', 'https://dynahaulx.rimspl.com/vercel_auth'],
    ['ALERT_CRON_SECRET', 'Cron Auth Bearer', 'locally generated: node -e "require(\'crypto\').randomBytes(32).toString(\'hex\')"'],
    ['NVIDIA_ASR_API_KEY', 'NVIDIA Riva ASR (voice)', 'https://build.nvidia.com'],
  ]
  return keys.map(([k, desc, where]) => {
    const v = env.vals[k] || ''
    const ok = v && v.length > 6 && !v.includes('BLANK')
    return { key: k, desc, where, ok, preview: ok ? v.slice(0, 14) + '…' : '— MISSING —' }
  })
}

const TECH_STACK = [
  ['Node.js 18+ / Express 4', 'Runtime + 19 auto-discovered APIs server.js', 'Industry: every backend job requires this'],
  ['Supabase Postgres + RLS + Views', 'migrations 001→019, v_manager_* views, FIX_RLS_SECURITY.sql', 'Industry: SQL + RLS is core data analyst skill'],
  ['Supabase JS v2 + PostgREST', 'supabase-init.js, supabaseClient.from().select().eq()', 'Industry: BaaS pattern'],
  ['Vanilla JS ESM + HTML', 'No framework, ~30KB bundle, src/lib 8 modules', 'Industry: performance-first'],
  ['IndexedDB + Service Worker', 'fitter/src/lib/idb.js DynaHaulCacheDB, fitter/sw.js v40', 'Industry: offline-first PWA'],
  ['Chart.js v4', 'manager/src/pages/dashboard.js 15 blocks', 'Industry: analytics viz'],
  ['PWA + PWABuilder APK', 'fitter/manifest.webmanifest + icons', 'Industry: mobile installable'],
  ['Resend + Fast2SMS REST', 'services/sms-gateway.js, api/send-alert.js', 'Industry: transactional comms'],
  ['NVIDIA Riva gRPC / Web Speech API', 'api/v1/sync/voice-pipeline-preview', 'Industry: voice AI'],
  ['Vercel / localtunnel', 'vercel.json, local.js port 3000', 'Industry: deploy + tunneling'],
  ['xlsx', 'fuel/tyre upload parsing dashboard.js:1359 XLSX.read', 'Industry: ETL'],
]

const MANUAL_STEPS = [
  {
    id: '1', title: 'Read Last Daily Log (YOU do this)',
    why: 'Builds continuity habit. Never ask AI to summarize blindly.',
    do: [
      'Open DAILY_LOG_DIR/latest file in VS Code',
      'Read: Completed Today / Learnings / Next Steps',
      'Say aloud 1 thing you will continue today',
    ],
    verify: 'You can explain last day in 30 seconds'
  },
  {
    id: '2', title: 'Start Server YOURSELF (no auto)',
    why: 'Hands-on port & log debugging',
    do: [
      'Kill stale: netstat -ano | findstr :3000  → taskkill /PID <pid> /F  (or npm run local auto-kills)',
      'Run: npm run local   (from Tipper demo folder)',
      'Check banner: APIs mounted: 19 / 19  (see till login page.md:33)',
      'Open http://127.0.0.1:3000/manager/  (add rims_session demo if needed)',
    ],
    verify: 'Manager dashboard loads, no 500'
  },
  {
    id: '3', title: 'Wire ONE Connection Manually (pick 1 per day, max 30m)',
    why: 'Each key = industry integration skill',
    options: [
      'A) SUPABASE_SERVICE_ROLE_KEY → copy from Supabase Dashboard → paste .env → restart → test POST /api/create-user',
      'B) FAST2SMS_API_KEY → Fast2SMS → .env → test curl POST /api/send-alert (see updates.md Task1)',
      'C) ALERT_CRON_SECRET → node -e "require(\'crypto\').randomBytes(32).toString(\'hex\')" → .env + cron-job.org 8AM jobs',
      'D) NVIDIA Riva fallback → switch to OpenAI Whisper REST if PermissionDenied (api-issue-request.md)',
    ],
    verify: 'One real external call succeeds (SMS/email hits phone)'
  },
  {
    id: '4', title: 'Practice 30m Supabase SQL YOURSELF',
    why: 'Your daily-log 2026-08-31/09-01 shows this is your growth lever',
    do: [
      'Supabase SQL Editor → SELECT on tyres, vehicles, tyre_activity_log',
      'Try 1 JOIN: tyre_activity_log → tyres → vehicles',
      'Try 1 view: SELECT * FROM v_manager_tyre_records WHERE site_id = \'<your site>\' LIMIT 5',
      'Compare to JS: supabase.from(\'tyres\').select().eq() mapping',
    ],
    verify: 'You ran 3 queries and understand CTE / DISTINCT ON / ROW_NUMBER in 011/014'
  },
  {
    id: '5', title: 'Inspect ONE Manager Graph Manually',
    why: 'Data analyst eye',
    do: [
      'Open Analytics tab → pick one block (e.g., Pressure vs Fuel Cost)',
      'Open DevTools → Network → fetchManagerDataset payload',
      'Trace to data-service.js:buildAnalyticsSnapshot → which view feeds it',
      'Note: what looks right / what is empty due to no data',
    ],
    verify: 'You can state data source + improvement idea for that graph'
  },
  {
    id: '6', title: 'Write Today Daily Log YOURSELF',
    why: 'Portfolio & interview story',
    do: [
      'Duplicate template.md → YYYY-MM-DD.md',
      'Fill: Completed / Learnings (include tool name + why) / Blockers / Next Steps / Time',
      'Reference file paths with line numbers (e.g., manager/src/pages/dashboard.js:615)',
    ],
    verify: 'Log created before you close laptop'
  },
]

async function main() {
  console.clear()
  console.log('┌─────────────────────────────────────────────────────────────────┐')
  console.log('│  DynaHaul X v2 — HANDS-ON DAILY BOOTSTRAP                      │')
  console.log('│  Run this EVERY time you start work. Nothing auto-wires.       │')
  console.log('│  You do every connection; AI only guides.                      │')
  console.log('└─────────────────────────────────────────────────────────────────┘\n')

  const latest = findLatestLog()
  const env = parseEnv()
  const today = new Date().toISOString().slice(0, 10)

  console.log(`► Project: ${TIPPER_DEMO_DIR}`)
  console.log(`► Daily logs: ${DAILY_LOG_DIR}`)
  console.log(`► Today: ${today}\n`)

  if (!latest) {
    console.log('⚠ No daily log found. Starting fresh from template.md\n')
  } else {
    console.log(`━━━ LAST LOG: ${latest.file} ━━━`)
    console.log(latest.content.slice(0, 1800))
    console.log('\n— End excerpt —\n')
    console.log('📋 Extracted Next Steps:')
    console.log(extractSection(latest.content, 'Next Steps'))
    console.log('\n📚 Last Learnings:')
    console.log(extractSection(latest.content, 'Learnings'))
    console.log('\n🚧 Last Blockers:')
    console.log(extractSection(latest.content, 'Blockers'))
    console.log(`\n(Other logs: ${latest.all.slice(0, 5).join(', ')} ... ${latest.all.length} total)\n`)
  }

  console.log('━━━ CONNECTIONS — Check .env YOURSELF ━━━')
  const conns = checkConnections(env)
  for (const c of conns) {
    const icon = c.ok ? '✓' : '✗'
    console.log(` ${icon} ${c.key.padEnd(27)} ${c.preview.padEnd(20)} — ${c.desc}`)
    if (!c.ok && c.where) console.log(`     → Get it: ${c.where}`)
  }
  console.log(`\n .env exists: ${env.exists ? 'yes' : 'NO — copy .env.example → .env' }`)
  if (fs.existsSync(UPDATES_PATH)) console.log(` updates.md: present (Tasks 1-6 pending wiring)`)
  console.log('')

  console.log('━━━ INDUSTRY TECH STACK — You will touch each manually this week ━━━')
  for (const [tech, where, value] of TECH_STACK) {
    console.log(` • ${tech.padEnd(32)} → ${where}`)
    console.log(`   Why industry: ${value}`)
  }
  console.log('')

  console.log('━━━ TODAY HANDS-ON PLAN — Do step-by-step, I guide, you execute ━━━\n')
  for (const s of MANUAL_STEPS) {
    console.log(`[${s.id}] ${s.title}`)
    console.log(`    Why: ${s.why}`)
    for (const d of (s.do || s.options || [])) console.log(`    → ${d}`)
    if (s.verify) console.log(`    ✔ Verify: ${s.verify}`)
    console.log('')
  }

  console.log('━━━ INTERACTIVE CHECKPOINTS ━━━\n')
  const a1 = await ask('1) Did you READ the last log aloud? (y/n) ')
  const a2 = await ask('2) Which connection will you wire TODAY? (A/B/C/D or skip) ')
  const a3 = await ask('3) Will you do 30m SQL practice after server start? (y/n) ')
  const a4 = await ask('4) Which Analytics graph will you inspect today? (name or skip) ')
  const a5 = await ask('Create today daily-log file now? (y/n) ')

  if (a5.toLowerCase() === 'y') {
    const templatePath = path.join(DAILY_LOG_DIR, 'template.md')
    const todayPath = path.join(DAILY_LOG_DIR, `${today}.md`)
    if (fs.existsSync(todayPath)) {
      console.log(`\n→ Today log already exists: ${todayPath}`)
    } else {
      const tpl = fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : '# Daily Log\n## ' + today + '\n'
      const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      const day = dayNames[new Date().getDay()]
      const content = tpl.replace('[YYYY-MM-DD]', today).replace('[Day of Week]', day)
        + `\n\n> Started via START_DAILY_HANDS_ON.js — continuing from ${latest ? latest.file : 'fresh'}\n`
        + `> Connections check: ${conns.filter(c=>c.ok).length}/${conns.length} keys present\n`
        + `> Today focus: ${a2} | SQL: ${a3} | Graph: ${a4}\n`
      fs.writeFileSync(todayPath, content, 'utf8')
      console.log(`\n✓ Created: ${todayPath}`)
      console.log('  Now open it and fill as you work — do not let AI fill it.')
    }
  }

  console.log('\n━━━ QUICK COMMANDS — YOU run these, not AI ━━━')
  console.log('  cd "D:\\DX_User\\Data_Abhishek\\Abhishek\\Dynahaul given by Amit sir 15july\\Tipper demo"')
  console.log('  npm run local                          # start server (you)')
  console.log('  node -e "require(\'crypto\').randomBytes(32).toString(\'hex\')"  # make ALERT_CRON_SECRET (you)')
  console.log('  # Supabase SQL Editor → run migrations/016_analytics_views_fixed.sql (you)')
  console.log('  # Test SMS → curl POST /api/send-alert (you, see updates.md Task1)')
  console.log('')

  console.log('━━━ RULES ━━━')
  console.log('  • AI never auto-creates users / never pastes keys / never runs migrations without your y')
  console.log('  • Every API integration: you copy key → you paste → you restart → you test → AI verifies')
  console.log('  • End of day: you write daily log, AI reviews')
  console.log('')
  console.log(`Answers: read=${a1} | conn=${a2} | sql=${a3} | graph=${a4} | log=${a5}`)
  console.log('\n→ Next: run npm run local yourself, then pick one connection to wire.\n')

  rl.close()
}

main().catch(e => { console.error(e); rl.close(); process.exit(1) })
