# HANDS-ON GUIDE — DynaHaul X v2

> **Run every work session: `node START_DAILY_HANDS_ON.js` from `Tipper demo/`**
> This script READS your last daily log, CHECKS every connection, LISTS every industry tool, and GUIDES you to do each integration manually. AI does not auto-wire.

---

## 1) Why Hands-On

| You Do | Industry Value |
|---|---|
| `npm run local` yourself, kill port 3000 yourself | Express debugging, process management — every Node job |
| Copy `SUPABASE_SERVICE_ROLE_KEY` from dashboard → `.env` → restart | Env management, secrets handling |
| Run 3 SQL queries in Supabase Editor | Postgres + RLS + Views (011/014) — data analyst core |
| Trigger one Fast2SMS / Resend call via curl | REST API integration, auth headers |
| Inspect one Chart.js graph via DevTools Network | Viz debugging, data lineage |

AI guides, you type. This is how you build muscle memory for interviews.

---

## 2) Every Time You Start

```powershell
cd "D:\DX_User\Data_Abhishek\Abhishek\Dynahaul given by Amit sir 15july\Tipper demo"
node START_DAILY_HANDS_ON.js
# → reads D:\DX_User\Data_Abhishek\Abhishek\daily-log\ latest file
# → prints Next Steps / Learnings / Blockers
# → checks .env keys
# → asks: which connection today? which graph? create today log?
npm run local
# verify: APIs mounted: 19 / 19
```

If you skip the script, you lose continuity.

---

## 3) Connections Inventory (All in `.env`)

| Key | Where to get (YOU) | What breaks if missing |
|---|---|---|
| `SUPABASE_URL` + `SUPABASE_ANON_KEY` | `.env.example` already filled | Nothing loads |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role → Show | `POST /api/create-user`, Site Settings writes 403 |
| `FAST2SMS_API_KEY` + `FAST2SMS_SENDER_ID=DYNHLX` | fast2sms.com/dev/dashboard (DLT active) | `POST /api/send-alert` silently no-op |
| `ALERT_CRON_SECRET` | `node -e "require('crypto').randomBytes(32).toString('hex')"` you generate | Anyone can fire fake alerts |
| `RESEND_API_KEY` | resend.com/api-keys | OTP emails fallback |
| `OTP_PROVIDER_BASE_URL` | `https://dynahaulx.rimspl.com/vercel_auth` | OTP proxy fails |
| `NVIDIA_ASR_API_KEY` | build.nvidia.com or switch to Whisper | Voice extraction falls to Web Speech |

**Manual flow per key (you do, AI watches):**
1. Open provider dashboard yourself
2. Copy key yourself (no placeholder)
3. Paste into `.env` yourself
4. Restart `npm run local` yourself
5. Test: `curl` from `updates.md Task1` or `api/create-user` flow
6. Verify via `tools/supabase-probe.js` if present (exit 0 = green)

---

## 4) Industry Tech Stack You Will Touch (One per day, 30m)

1. **Node 18+ / Express 4** — `server.js` auto-discovers `api/**/*.js` via `fs.readdir` recursive mount
2. **Supabase Postgres + RLS** — `migrations/001→019`, `FIX_RLS_SECURITY.sql`, `FIX_ANON_GRANTS.sql` — anon vs service_role isolation
3. **PostgREST Views** — `011_manager_analytics_views.sql` (3 views: tyre_records, inspection_records, pressure_events) + `014/016` fleet health (CTE, DISTINCT ON, ROW_NUMBER)
4. **Supabase JS** — `supabase-init.js` `createClient` + `fetchManagerDataset:238` fallback chain `fetchFast → fetchFitter → fetchLegacy`
5. **Vanilla ESM** — 8 modules: `src/lib/{auth,session,env,database,toast,confirm,navigation,app-init}.js`
6. **IndexedDB + Service Worker** — `fitter/src/lib/idb.js` `DynaHaulCacheDB`, `fitter/sw.js` v40 cache-first fonts, network-first html
7. **PWA / APK** — `fitter/manifest.webmanifest` + `PWABuilder.com` → signed APK
8. **Chart.js 4** — `manager/src/pages/dashboard.js:1649 createChart` + 15 blocks (see `DynaHaul_XB2_Documentation.md:4`)
9. **Fast2SMS / Resend REST** — `services/sms-gateway.js` line ~54 `fetch('https://www.fast2sms.com/dev/bulkV2')`
10. **Voice AI** — `api/v1/sync/voice-pipeline-preview.js` `riva_asr.proto` gRPC vs `Web Speech API` fallback
11. **ETL xlsx** — `manager/src/pages/dashboard.js:1363 XLSX.read` fuel/tyre bulk import
12. **Vercel + localtunnel + dotenv** — `vercel.json` + `local.js` auto-kill port 3000 + `_env.js` loader

---

## 5) API Integrations — Manual Path (Pick 1 per session, ≤30m)

**Fast2SMS live SMS (Task1 in updates.md):**
```powershell
# you fill .env
FAST2SMS_API_KEY=<from dashboard>
FAST2SMS_SENDER_ID=DYNHLX
npm run local
curl -X POST http://127.0.0.1:3000/api/send-alert -H "Authorization: Bearer <ALERT_CRON_SECRET>" -H "Content-Type: application/json" -d "{\"alert_type\":\"PRESSURE_ALERT\",\"channel\":\"sms\",\"phone\":\"<real>\",\"message\":\"DynaHaul test\"}"
# verify: phone vibrates
```

**Service Role + Create User (Task2):**
- Supabase Dashboard → copy service_role → `.env` → restart → open `join-company.html` → create `dxuser1.rimspl@gmail.com` → verify `Authentication → Users`

**Cron (Task3):** generate secret → `.env` → `cron-job.org` create Daily 8AM `POST /api/generate-digest` + Weekly Mon 8AM `POST /api/deliver-report` with header `Bearer <secret>`

**Voice fallback (Task api-issue-request.md):** if NVIDIA `PermissionDenied`, you swap `api/v1/sync/voice-pipeline-preview.js` to call `https://api.openai.com/v1/audio/transcriptions` (Whisper $0.006/min) — AI guides diff, you apply.

---

## 6) Daily Log Habit

- **Template:** `daily-log/template.md`
- **Create:** script offers to create `daily-log/YYYY-MM-DD.md` — you fill, not AI
- **Must include:** file paths with line numbers, SQL you ran, env change, graph inspected
- **Time breakdown:** match `2026-09-01.md` style (e.g., 6.5h meeting + 30m SQL)

---

## 7) Your Next Session Checklist (Guided by script)

- [ ] Ran `node START_DAILY_HANDS_ON.js` and read last log
- [ ] Ran `npm run local` yourself, saw `19/19`
- [ ] Chose 1 connection to wire (A/B/C/D) and tested
- [ ] Ran 3 SQL queries in Supabase Editor
- [ ] Inspected 1 Analytics graph + noted data source
- [ ] Created/updated `daily-log/YYYY-MM-DD.md`

---

## 8) References (Read before asking AI)

- `docs/README_FIRST.md` — 6-line orientation
- `docs/memory.md` — full AI context
- `docs/ARCHITECTURE.md` — data flow topology
- `till login page.md` — login investigation + demo URLs
- `updates.md` — 6 Tasks work order (your feeding file)
- `DynaHaul_XB2_Documentation.md:1-710` — executive summary + tech stack

*No auto-magic. You wire, AI verifies.*
