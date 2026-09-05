# Fix Hardcoded Secrets — Step-by-Step Checklist

**Goal:** Remove the hardcoded Resend API key from `EXE Setup/main.js` and audit all other secret exposures.

---

## Step 1: Fix Resend API Key in Electron (EXE Setup/main.js)

**Current (unsafe):**
```js
const RESEND_API_KEY = 're_xxxxxxxxxxxx';
```

**Replace with:**
```js
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
if (!RESEND_API_KEY) {
  console.error('RESEND_API_KEY environment variable not set');
}
```

**Testing:**
1. Set `RESEND_API_KEY` in the system environment variables
2. Restart the Electron app
3. Verify email sending still works

---

## Step 2: Add `.env` to `.gitignore`

Ensure the project has a `.gitignore` file with:

```
.env
.env.local
*.pem
```

If it doesn't exist, create one at the project root.

---

## Step 3: Verify No Other Secrets in Source

Run this grep to find potential secrets:

```bash
# Check for hardcoded keys
grep -rn "['\"]re_" api/ EXE\ Setup/ --include="*.js"
grep -rn "['\"]sk_" api/ --include="*.js"
grep -rn "['\"]fast2sms\|FAST2SMS" api/ --include="*.js"

# Check for password-like values
grep -rn "password\s*=" api/ --include="*.js" | grep -v "\.env\|process.env"
```

Any hits should be moved to environment variables.

---

## Step 4: Audit Supabase Key Usage

The anon key is public by design, but verify:

1. **RLS is enabled** on all tables:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

2. **No table has `rowsecurity = false`** that accepts anonymous writes

---

## Step 5: Environment Variable Checklist

Ensure these are set in the Vercel dashboard (or deployment platform):

| Variable | Required For | Source |
|---|---|---|
| `SUPABASE_URL` | All API functions | Supabase dashboard > Settings > API |
| `SUPABASE_ANON_KEY` | All API functions | Supabase dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | send-otp.js, deliver-report.js | Supabase dashboard > Settings > API (keep secret!) |
| `RESEND_API_KEY` | send-email.js, deliver-report.js | Resend dashboard > API Keys |
| `FAST2SMS_API_KEY` | send-alert.js, generate-digest.js | Fast2SMS dashboard |
| `ALERT_CRON_SECRET` | send-alert.js, generate-digest.js, deliver-report.js | Generate a random string |

---

## Step 6: Final Verification

1. Deploy to Vercel with env vars set
2. Run: `POST /api/send-email` — verify it works
3. Open the Electron app — verify it doesn't log any API keys
4. Check `git diff` — confirm no `.env` files are tracked
