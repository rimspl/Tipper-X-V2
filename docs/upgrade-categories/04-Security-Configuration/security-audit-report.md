# Security Audit Report — DynaHaul X

**Date:** June 2026
**Scope:** Source code secrets scan, authentication flow, license verification.

---

## Finding 1: Hardcoded Resend API Key — HIGH

**Location:** `EXE Setup/main.js` line 4 (Electron main process)

**Detail:** The Resend email API key is written as a plaintext string literal in the Electron main process file. This file ships to every user who installs the desktop app. Anyone with access to the executable can extract the key.

**Risk:** Unauthorized email sending through the Resend account. Potential phishing from the project's verified domain.

**Fix:** Move to environment variable read at runtime. Use `process.env.RESEND_API_KEY` in the Electron main process, same as the Vercel API functions already do.

---

## Finding 2: Supabase Anon Key in Source — LOW

**Locations:** Multiple files (`api/send-email.js`, `api/send-otp.js`, `manager/login.html`, `fitter/index.html`)

**Detail:** The Supabase anonymous key (`SUPABASE_ANON_KEY`) is embedded in client-facing HTML and serverless API files. This is standard practice — Supabase anon keys are designed to be public. Row-Level Security (RLS) policies are the actual access control.

**Risk:** Low. Anon key is meant to be public. However, ensure no database tables rely only on the anon key for write access without RLS.

**Verification:** Confirm RLS is enabled on all tables that accept writes through the anon key path.

---

## Finding 3: Service Role Key Usage — MEDIUM

**Location:** `api/send-email.js` line 40, `api/send-otp.js` line 50

**Detail:** The `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS. It is used correctly (server-side only, never in client-facing code), but:
- If an attacker gains access to a Vercel function's environment, they can extract it
- The service role key is logged in error messages on some code paths

**Fix:**
- Ensure no Vercel function logs environment variables in catch blocks
- Restrict service role key to only the Vercel project's environment secrets (not in code)

---

## Finding 4: License Verification — MEDIUM

**Location:** `api/send-email.js` lines ~108-118

**Detail:** License verification checks a boolean flag `is_active` on the `licenses` table. This is trivially bypassed if an attacker gains direct database access or if a user manipulates their profile.

**Risk:** A user with direct DB access (via leaked service role key) can set `is_active = true` on any license. Consider adding:
- Cryptographic license signing (JWT or HMAC)
- License expiry dates
- Concurrent-use detection

**Fix (near-term):** Add a license expiry timestamp and enforce server-side.
**Fix (long-term):** Implement HMAC-signed license tokens.

---

## Finding 5: OTP Provider URL Hardcoded Default — LOW

**Location:** `api/send-otp.js` line 18

**Detail:** The default OTP provider URL points to `https://dynahaulx.rimspl.com/vercel_auth`. While overrideable via env var, this URL is hardcoded in source.

**Fix:** Move to env-only (no fallback in source) or document that the fallback URL is for development only.
