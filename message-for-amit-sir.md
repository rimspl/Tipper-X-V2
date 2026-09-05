# Message to Amit sir — DynaHaul X v2 Credentials Needed

*Drafted for Abhishek. Personal, respectful, action-oriented. Verify the email/phone field below
is right before sending, then send exactly as written (or copy-paste into WhatsApp / Outlook).*

---

## How to use this file

1. Pick **one channel** (email / WhatsApp / in-person) and replace the `Subject:` line or the opening line.
2. Remove the section marked **[DELETE BEFORE SENDING]** (this header).
3. Fill in `Recipient:` line.
4. Re-read the bullet about Supabase password — that's the only thing that has a one-shot reply.

---

## Channel A — Email

**To:**     `<amit.sir@rimspl.com>`
**Cc:**     `<your-boss-mgr@rimspl.com>` *(optional, do not add unless asked)*
**Subject:** DynaHaul X v2 — three credentials to close out the demo (Supabase · Fast2SMS · cron secret)

---

Hi Amit sir,

Hope you're well. Per your assignment, I have DynaHaul X v2 running locally on the
laptop and walked through all 13 demo URLs with my reporting manager yesterday —
Manager Dashboard, Fitter App, Site Settings (including the new Tyre Economics and
Reports Index toggles), Analytics tab, User Management, Alert Settings, and the
PWA/APK packaging guide. The local Express server auto-discovers all 19 API
handlers and is healthy on `http://127.0.0.1:3000`. Server log: `APIs mounted: 19 / 19`.

To close the demo loop and let me wire the three production paths that are intentionally
left on env-stub today, I'd need three pieces of information from your side. Each is a
5-minute swap into `.env` followed by a restart (`npm run local`). Once you provide them,
I can finish Tasks 1, 2, and 3 from the runbook I drafted (`DynaHaul-X-v2/updates.md`)
in a single afternoon.

### 1. `SUPABASE_SERVICE_ROLE_KEY` (Supabase Dashboard)
- Open **https://supabase.com/dashboard** → project **`rbqqdyzccgbssjcyibbx`**
- Left menu → **Settings → API → service_role** → click *Show* → copy the JWT
- Paste it into `SUPABASE_SERVICE_ROLE_KEY=...` in `.env`
- **Why I need it:** without it, `POST /api/create-user` and most of the Site Settings
  writes fail (server returns `403 requires SUPABASE_SERVICE_ROLE_KEY`). The anon key
  is already in `.env` and is fine for read-only — but manager-side writes need admin.

### 2. `FAST2SMS_API_KEY` (Fast2SMS Dashboard)
- Login at **https://www.fast2sms.com/dev/dashboard** (DLT registration must be active)
- Top-right → **API Keys** → Reveal / Copy
- Paste into `FAST2SMS_API_KEY=...` in `.env` (the `FAST2SMS_SENDER_ID` default
  `DYNHLX` is already set)
- **Why I need it:** without it, the alert engine (`/api/send-alert` →
  `services/sms-gateway.js` → Fast2SMS REST) is silently no-op. Pressure-drop,
  fitment-overdue, inspection-due, RTD-threshold, and daily-digest SMS will not leave
  the gateway.

### 3. `ALERT_CRON_SECRET` (locally generated, just need your OK on the chosen string)
- I will generate `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  and put the value into `.env`. The same value goes into the cron config (two jobs —
  daily 8 AM digest + Mon 8 AM report delivery) which I'll also set up on
  `cron-job.org` (free tier) so no Vercel dependency.
- **Why I need it:** the alert engine authenticates cron-to-API with `Authorization:
  Bearer <ALERT_CRON_SECRET>` — without a secret, anyone on the local network can
  fire fake alerts, which is why it stays as a per-deploy random value.

### Optional — if you can also share, even nicer
- A **demo manager email + temporary password** so I can seed the Supabase `auth.users`
  table directly and skip the email-confirmation dance before tomorrow's demo. If not,
  I'll create the user myself via the Dashboard → Add user UI; either works.
- Confirmation that **Resend** is provisioned for `rimspl.com` so the OTP email
  actually sends. Otherwise the user-creation flow completes but the OTP step
  emails a fallback address (and the live login screen will see a timeout).

### What I'll do once keys are provided (concrete)

1. Edit `.env`, restart server, run `node tools/supabase-probe.js` — should turn
   exit code **3 → 2 → 0** as each key lands.
2. Run `tools/seed-demo-site-and-profile.sql` in SQL Editor (already idempotent; one
   demo customer + site + Plan B columns + manager `user_profiles` row template).
3. Walk `/fitter/login.html` end-to-end with the demo credentials — real password
   auth via Supabase `grant_type=password`.
4. Create the two cron jobs on `cron-job.org` and prove the daily digest actually
   delivers an SMS + email.
5. Update `updates.md` Tasks 1–3 with execution log lines and pass it back to track
   sign-off.

Please share the three keys (or let me know when you can). I'll keep the laptop on
and the server running until then.

Thanks,
Abhishek

*— end of email —*

---

## Channel B — WhatsApp (terse version)

```
Hi Amit sir — quick one.
DynaHaul X v2 is running locally, all 19 API routes mounted, demo walked through.
3 things I need from your side to close the loop:

1. SUPABASE_SERVICE_ROLE_KEY (Supabase → Settings → API → service_role, click Show)
2. FAST2SMS_API_KEY (Fast2SMS dashboard, DLT-active)
3. ALERT_CRON_SECRET — I'll generate a random hex and set it; just confirming
   the cron trigger strategy (cron-job.org vs Vercel Cron vs Windows Task Scheduler).

Optional + helpful:
- a demo manager email/temp pwd if you have one assigned already
- confirmation Resend is authenticated for rimspl.com (so OTPs actually send)

Each is a 5-min swap into .env. Once provided I can finish Tasks 1–3 from
updates.md in a single afternoon. Thanks!
— Abhishek
```

---

## What I will do AFTER I receive the keys (the actual follow-through)

Nothing goes into `DynaHaul-X-v2/` source until you say "go" per task. Per
`updates.md` rules: each Task gets a 3-line change preview before any edit, and a
2-line verification afterwards. The probe script `tools/supabase-probe.js` is
already in place to confirm env health at every step (exit code 0 = green).

If you'd rather I wait for the keys before I touch anything, this draft + the probe
+ the seed SQL are the only artifacts that exist outside what Amit sir already saw
on the laptop. Source tree otherwise untouched.
