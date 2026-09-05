# 04 — Security & Configuration

**Purpose:** Centralize environment variable handling, document all required secrets, audit existing security gaps, and provide step-by-step remediation guides.

**Files:**
- `_env.js` — Single-source env loader (import instead of duplicating `readEnv()` in every API module)
- `.env.example` — Documented template with all required vars, placeholders, and source instructions
- `security-audit-report.md` — 5 findings: hardcoded Resend key (HIGH), anon key exposure (LOW), service role key usage (MEDIUM), license verification gap (MEDIUM), OTP URL default (LOW)
- `fix-hardcoded-secrets.md` — 6-step checklist with grep commands and verification steps

**Dependencies:** None. This is reference + importable module. The `_env.js` replaces duplicated `readEnv()` in existing API modules.
