# 05 — Testing & Quality

**Purpose:** Automated test suites and pre-ship manual QA checklist.

**Files:**
- `tests/pipeline.test.js` — Fitter pipeline E2E (enqueue, sync, stale-recovery, retry)
- `tests/analytics.test.js` — CPK, variance, achievement %, rubber utilization, fleet health score
- `tests/alerts.test.js` — Template generation (EN/HI), SMS validation, rate limit, trigger logic
- `qa-checklist.md` — Manual verification: pipeline, dashboard, alerts, reports, security, regression

**Running Tests:**
```bash
npx vitest run tests/
```
