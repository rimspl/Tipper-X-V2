2026-07-18 DynaHaul X v2 — Post-Demo Follow-Up Work Order (Feeding File)

*This file is a compact, machine-readable work order. Paste it back to the AI assistant
as your first message after a successful demo, and it has everything needed to wire the
features we deferred today in one continuous flow without re-explaining the codebase.*

═══════════════════════════════════════════════════════════════════════════
PART 1 — CONTEXT (do not skip reading this part)
═══════════════════════════════════════════════════════════════════════════

Project:   DynaHaul X v2 — Tyre Fleet Management
Path:      D:\DX_User\Abhishek\Dynahaul given by Amit sir 15july\DynaHaul-X-v2
Repo type: Static web app + Node.js Express backend + Supabase Postgres
Stack:     Node 18+ (we have v24.18), Express 4, Supabase JS v2, Fast2SMS, Resend,
           Chart.js, IndexedDB (fitter offline), vanilla JS ESM modules
Server:    `npm run local` (auto-kills stale port 3000 then runs server.js)
Entry URLs:
  Manager:  http://127.0.0.1:3000/manager/
  Fitter:   http://127.0.0.1:3000/fitter/login.html
  Setup:    http://127.0.0.1:3000/setup.html
Demo passed today. UI + login screen + dashboard + 17 analytics blocks
+ Reports Index toggle all rendered cleanly on the laptop without internet.

═══════════════════════════════════════════════════════════════════════════
PART 2 — CREDENTIALS ALREADY PRESENT IN .env (do not ask again)
═══════════════════════════════════════════════════════════════════════════

✓ SUPABASE_URL              = https://rbqqdyzccgbssjcyibbx.supabase.co
✓ SUPABASE_ANON_KEY         = eyJhbGciOi... (present, full value in .env)
✓ RESEND_API_KEY            = re_V6bPznTf_... (present)
✗ SUPABASE_SERVICE_ROLE_KEY = BLANK
✗ FAST2SMS_API_KEY          = BLANK
✗ ALERT_CRON_SECRET         = BLANK

═══════════════════════════════════════════════════════════════════════════
PART 3 — TASKS REQUESTED (do these in the listed order)
═══════════════════════════════════════════════════════════════════════════

TASK 1 — Fast2SMS live wiring (~30 min)
  Goal: Real SMS leaves the gateway for an alert.
  Steps:
    A. Confirm `FAST2SMS_API_KEY` from Amit sir (DLT-registered).
    B. Open .env, fill:
         FAST2SMS_API_KEY=<value from Amit sir>
         FAST2SMS_SENDER_ID=DYNHLX
    C. Restart `npm run local`.
    D. Test:
         curl -X POST http://127.0.0.1:3000/api/send-alert \
           -H "Authorization: Bearer <ALERT_CRON_SECRET>" \
           -H "Content-Type: application/json" \
           -d '{"alert_type":"PRESSURE_ALERT","channel":"sms","phone":"<a real test number>","message":"DynaHaul SMS test from Abhishek","site_id":"<any site uuid>"}'
    E. Confirm SMS received. Screenshot the phone.
    F. Files likely involved (read-only check first):
         - services/sms-gateway.js  (Fast2SMS call lives here)
         - api/send-alert.js        (alert dispatch entry)
  Acceptance: SMS received on a real phone within 30 seconds.

TASK 2 — Supabase Service Role + user creation flow (~30 min)
  Goal: A new user can sign up via the Join Company page and land in Supabase auth.users.
  Steps:
    A. Get `SUPABASE_SERVICE_ROLE_KEY` from Supabase Dashboard
       → Settings → API → service_role (secret).
    B. Open .env, fill SUPABASE_SERVICE_ROLE_KEY=<value>.
    C. Restart server.
    D. Walk through /join-company.html, create a user, verify in
       Supabase Dashboard → Authentication → Users that the row appears.
    E. Files involved:
         - api/create-user.js
         - api/update-user-email.js
         - api/send-otp.js
         - api/send-email.js (which handles auth_login)
  Acceptance: New user exists in auth.users; can log in via OTP.

TASK 3 — Alert cron secret + scheduled cron (~15 min)
  Goal: Daily 8 AM digest and weekly Monday report actually fire.
  Steps:
    A. Generate a strong secret on the laptop:
         node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    B. Put it in .env as ALERT_CRON_SECRET=<value>.
    C. Pick a scheduler:
         - Windows: Task Scheduler (action: curl POST)
         - Cloud (free): cron-job.org
    D. Create two cron jobs:
         Daily 8 AM:
           URL:    http://127.0.0.1:3000/api/generate-digest
           Method: POST
           Header: Authorization: Bearer <ALERT_CRON_SECRET>
           Body:   {"site_id":"<site uuid>"}        (or {} for all)
         Weekly Mon 8 AM:
           URL:    http://127.0.0.1:3000/api/deliver-report
           Method: POST
           Header: Authorization: Bearer <ALERT_CRON_SECRET>
           Body:   {}
    E. Files involved:
         - api/generate-digest.js
         - api/deliver-report.js
  Acceptance: Cron triggers fire; SMS/email digest received by a subscriber.

TASK 4 — Seed demo data so analytics blocks aren't empty (~30 min, optional)
  Goal: Manager dashboard shows non-empty charts tomorrow during the real demo.
  Steps:
    A. Write a Node script under `tools/seed-demo-data.js` that:
         - Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env
         - Picks one site_id (fetch it: GET /rest/v1/sites?select=id&limit=1)
         - Inserts ~8 tyres with varied makes (Apollo, MRF, JK, CEAT)
         - Inserts ~30 inspection rows across those tyres
         - Inserts ~25 pressure_check rows
         - Inserts ~12 fuel_trip_entries across 2 months
       Use @supabase/supabase-js. Console.log every insert.
    B. Run: `node tools/seed-demo-data.js`
    C. Refresh /manager/ and confirm Fleet Health, Pressure Heatmap,
       Brand Cost-per-KM, P&L per Tyre have visible data.
  Acceptance: At least 4 analytics blocks show real numbers, not "No data".

TASK 5 — Android APK build (~60 min, optional, only if remote teams need it)
  Goal: A signed APK that fitters install on phones.
  Steps:
    A. `vercel --prod` (requires Vercel CLI: `npm i -g vercel`).
       Vercel gives a URL like https://dynahaul-x-v2.vercel.app
    B. Open https://pwabuilder.com, paste
       https://dynahaul-x-v2.vercel.app/fitter/
    C. Package for Android → Signed → Download.
    D. Transfer APK to a phone, install, verify the
       DynaHaul icon appears and the fitter app opens full-screen.
    E. Files involved:
         - fitter/manifest.webmanifest  (already present)
         - fitter/icons/icon-192.png, icon-512.png, icon-512-maskable.png
         - fitter/sw.js                 (already present)
  Acceptance: APK installs; tapping icon opens fitter login standalone.

TASK 6 — Generate Fleet Report PDF (~20 min, optional)
  Goal: A printable/saveable PDF of the full dashboard.
  Steps:
    A. From /manager/index.html click "Generate Fleet Report"
       (the link in the top strip — opens /manager/reports/ or the report route).
    B. Verify the printable HTML opens.
    C. Use the browser Print → Save as PDF.
    D. File involved:
         - manager/src/report/generate-report.js
  Acceptance: PDF file is produced and looks like the dashboard.

═══════════════════════════════════════════════════════════════════════════
PART 4 — STRICT RULES FOR THE AI ASSISTANT (Boundary)
═══════════════════════════════════════════════════════════════════════════

RULE 1 — Read-only until you start a numbered Task. Do not edit any file
         until you are inside TASK N execution.
RULE 2 — Before each edit, print a 3-line "Change Preview":
             FILE    : <path>
             OLD LINE: <the line(s) you're replacing>
             NEW LINE: <what it'll become>
         Then pause one second and proceed.
RULE 3 — After each Task, print a 2-line "Did it work?" verification:
             - Command run, exit code, key log line
             - Visible UI / API response confirming success
RULE 4 — Never invent credentials. If a key the user hasn't supplied is
         needed, ask; do not paste a placeholder.
RULE 5 — After all 6 tasks, or earlier on user request, stop and present
         a summary table of files-changed (must be empty if the user
         asked for behavior via env vars only).
RULE 6 — If a Task requires a credential the user hasn't pasted in here,
         skip it cleanly and list it under "BLOCKERS REMAINING".

═══════════════════════════════════════════════════════════════════════════
PART 5 — KEY FILE INDEX (for quick navigation)
═══════════════════════════════════════════════════════════════════════════

server.js                       : Express wrapper, mounts api/* at file paths
local.js                        : Auto-kill + spawn on port 3000
.env                            : Credentials live here
.env.example                    : Template

src/lib/auth.js                 : enforceAuth(), redirectToLogin()
src/lib/session.js              : getSession/saveSession/clearSession
src/lib/env.js                  : readEnv() — canonical env loader
src/lib/database.js             : CORE object — master data + save forms

manager/index.html              : Manager Dashboard — 4 tabs + 17 analytics
manager/site-settings.html      : Tyre Economics + Reports Index (17 checkboxes)
manager/src/pages/dashboard.js  : renderAllHeavyModules(), applyReportVisibility()
manager/src/services/data-service.js : fetchSiteTargets, fetchRetreadCounts
manager/src/report/generate-report.js : Fleet report HTML generator

fitter/login.html               : OTP login
fitter/index.html               : Fitter mobile dashboard
fitter/src/lib/idb.js           : IndexedDB schema (DynaHaulCacheDB)
fitter/src/lib/queue-engine.js  : Offline submission queue
fitter/src/lib/sync-api.js      : Calls /api/v1/sync/* endpoints
fitter/sw.js                    : Service worker (offline cache)
fitter/manifest.webmanifest     : PWA manifest for PWABuilder

api/send-otp.js                 : Password-based Supabase sign-in
api/verify-otp.js               : Proxy to external verify_otp_api.php
api/create-user.js              : Admin-create user in auth.users
api/send-email.js               : Resend transactional (and auth_login)
api/send-alert.js               : Alert dispatch (SMS/email via gateways)
api/generate-digest.js          : Daily fleet health digest
api/deliver-report.js           : Scheduled weekly report
api/admin/import-fitter-csv.js  : CSV bulk-import
api/v1/sync/{register,finalize,status}.js : Fitter offline sync

services/sms-gateway.js         : Fast2SMS wrapper (line ~54 actual call)

migrations/001 → 014            : Already applied to Supabase
migrations/015_plan_b_fields.sql: NOT YET APPLIED — adds retread_cost,
                                   rate_per_km, enabled_reports. If the
                                   AI is asked to apply it, use:
                                   psql or Supabase SQL editor.

docs/README_FIRST.md            : Read before any work
docs/memory.md                  : Full AI context document
docs/USER_MANUAL.md             : Operation manual
docs/DEPLOYMENT_CHECKLIST.md    : Local WiFi steps in Step 10 (lines 267-296)
docs/FEATURES-TO-ADD-LATER.md   : Deferred features — DO NOT BUILD WITHOUT
                                   EXPLICIT USER REQUEST (4-6+ hours each)

═══════════════════════════════════════════════════════════════════════════
PART 6 — KNOWN PENDING ITEMS (do not block demo, but listed)
═══════════════════════════════════════════════════════════════════════════

- Hardcoded Resend API key in "EXE Setup/main.js" — security audit flagged it,
  not on today's path. See docs/upgrade-categories/security-audit-report.md.
- "EXE Setup" folder (Electron desktop) is intentionally deprecated.
- YOLOv8 + speech-to-text features in fitter are LIVE — do not remove.
- /EXE Setup/, /fitter-camera/, /mockups/  → dead-code candidates per
  docs/upgrade-categories/dead-code-inventory.md (deferred).

═══════════════════════════════════════════════════════════════════════════
END OF WORK ORDER. Drop this into the AI and say "execute".
═══════════════════════════════════════════════════════════════════════════
