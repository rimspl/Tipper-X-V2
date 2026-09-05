# Pre-Ship QA Checklist — DynaHaul X

Manually verify each item before signing off a release.

---

## A. Fitter Pipeline

- [ ] Offline form fill works (aircraft mode test)
- [ ] Queue shows pending items after going offline mid-sync
- [ ] Auto-sync triggers within 45s of regaining connectivity
- [ ] Stale entries (older than 120s) are discarded gracefully
- [ ] 3 retry limit is enforced for failed syncs

## B. Manager Dashboard

- [ ] Fleet health score loads and updates with date range
- [ ] Age distribution table populates correctly
- [ ] Defect trend by brand table shows correct top 5
- [ ] Removal reason breakdown renders without error
- [ ] Date range filter updates all widgets
- [ ] Print report produces properly formatted HTML
- [ ] Mobile layout renders without horizontal scroll
- [ ] Conic gradient gauge matches score value

## C. Alert Engine

- [ ] Alert settings UI loads rules, subscribers, history tabs
- [ ] Create rule: pressure_drop with threshold 100 PSI saves correctly
- [ ] Create subscriber with valid Indian mobile number saves correctly
- [ ] History pagination works (back/forward)
- [ ] Test: `POST /api/send-alert` with valid payload returns 200
- [ ] Test: `POST /api/send-alert` with missing mobile returns 400
- [ ] Test: `POST /api/generate-digest` generates SMS with current data
- [ ] Fast2SMS rate limit (10/min) is not exceeded during tests

## D. Report Delivery

- [ ] Generate report endpoint produces complete fleet summary HTML
- [ ] Scheduled delivery (configurable via UI) triggers at correct interval
- [ ] Email delivery via Resend arrives in inbox
- [ ] Report config UI saves recipient addresses

## E. Security

- [ ] `RESEND_API_KEY` is NOT hardcoded in any file
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is NOT in client-facing HTML
- [ ] `.env` is in `.gitignore`
- [ ] `ALERT_CRON_SECRET` is required for alert/digest endpoints
- [ ] All Vercel environment variables are set in dashboard

## F. Regression

- [ ] Login (email OTP) works
- [ ] Fitter tyre card submission works online
- [ ] Fitter pressure check submission works
- [ ] Manager can see existing fleet overview (pre-existing data still displays)
- [ ] Previous migrations (001–011) still execute cleanly when re-run
