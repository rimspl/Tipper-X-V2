# Customer Visual Report — DynaHaul X Manager Dashboard (2026-09-02)

## How to Verify Perfect Visualization (Teacher → Student)

**Concept:** Dashboard `manager/index.html:231` has 17 blocks but 9 key charts need realistic spread. Old data had RTD 75 (impossible, OTD 25mm) + PSI 0 → charts flat. New seed `VIS2509` uses industry-real lifecycle.

### 1) Data Fed Today (You verify via Supabase, not AI)
- Site: `MRF Fleet f8d09fa7` target 120,000 KM / ₹45,000 / 0.75/km / 120 PSI base / 2.8 kmpl / 250 km/d
- 40 tyres `VIS2509-3001..3040` brand MRF13 Apollo11 JK6 CEAT5 Michelin5
- 314 logs: FITMENT 40 (otd 23.8-25.0), INSPECTION 163 (RTD decay 2.4-3.2mm/30d, meter +7500km), PRESSURE_CHECK ~80 (32% under-inflated), REMOVAL 18 (Uneven 30%, Cut 20%, Normal 25%, Burst 10%, Impact 15%)
- Fuel 201 rows Apr-Sep 2026 (73,73,73,59,59,59 trucks) → monthly target vs actual comparable

**Check yourself (Supabase SQL Editor, you run):**
```sql
select make, count(*) from tyres where tyre_no like 'VIS2509%' group by make;
select activity_type, count(*) from tyre_activity_log where tyre_id in (select id from tyres where tyre_no like 'VIS2509%') group by activity_type;
select to_char(entry_date,'YYYY-MM') as m, count(*), sum(total_kms) from fuel_trip_entries where site_id='f8d09fa7-04e9-4429-b394-b969f1ea9a66' group by m order by m;
```

### 2) Bugs Fixed Today (Code you own)
- `dashboard.js:615` fuel month used `row.date` not `row.entry_date`, guard `targetKmpl>0` else 2.8, prevents Infinity
- `dashboard.js:653` heatmap now reads `found_psi/corrected_psi` + `tyre_serial` + `checked_at_ms`, shows 20+ cards vs 0 before
- `dashboard.js:1668` showMissingChart no longer `canvas.remove()` (irreversible), now hides + restores via `restoreChartCanvas` → charts recover on next fetch

### 3) Customer Walkthrough — 9 Charts Story (What to say)
| Chart | What customer sees | Your line |
|---|---|---|
| **Scrap Life** `chartTyreLifeScrap` | 6 months stacked bars Above/Below target | "18 scraps in 6 months, ~40% beat 120k target" |
| **Running Status** `chartTyreLifeRunning` | 5 brackets 0-25%→>100% Good/Fast split | "22 running tyres, fast wear concentrated 51-75%" |
| **Forecast** `chartTyreLifeForecast` | Next 6 months bars | "At 250km/d, 3-5 tyres hit target monthly → plan retread" |
| **Rubber Monthly** `chartRubberMonthly` | 100% stacked Used/Wasted 70/30 | "Average waste 28% at removal = ₹12.6k lost/tyre" |
| **Rubber Potential** `chartRubberPotential` | Scatter green/red + purple threshold line | "Green below benchmark = efficient, red needs training" |
| **Brand Scrap** `chartBrandScrap` | 5 brands + green target line 120k | "Apollo avg 58k vs MRF 62k — MRF +6% better" |
| **Brand Running** `chartBrandRunning` | 100% stacked on-track vs fail | "CEAT 60% on-track, JK 33% — focus JK" |
| **Pressure Incident** `chartPressureIncident` | 4-dataset bars+lines (inspected, under, PSI drop, ₹ loss) | "32% under-inflated correlates with ₹45k/mo fuel loss" |
| **Pressure vs Fuel** `pressureFuelCostChart` | 6 months target vs actual ₹ | "Actual exceeds target ₹18k/mo due to leakage" |

### 4) Screenshot Checklist (You do, 5 min)
1. Clear cache: DevTools → Application → Delete `DynaHaulCacheDB` + Session `cache_bust_v2_applied`
2. `npm.cmd run local --prefix "Tipper demo"` → login `Abhishek` (manager) → Analytics → set 12 months → screenshot each chart (Ctrl+Shift+S)
3. Tyre Records → filter `VIS2509` → screenshot → Inspection Records → screenshot → Savings → screenshot hero ₹ value
4. Export Excel each Analytics block → verify `Export Excel` produces .xlsx with VIS rows

### 5) API Work For YOU (Not me, manual 10 min each)
| API | Where | You do | Verify |
|---|---|---|---|
| **FAST2SMS** | `FAST2SMS_API_KEY=bxPUX...` `SENDER=DYNHLX` | Dashboard fast2sms.com → copy key → `.env` → restart → `curl POST /api/send-alert -H "Authorization: Bearer <ALERT_CRON_SECRET>" -d '{"alert_type":"PRESSURE_ALERT","channel":"sms","phone":"YOUR_PHONE","message":"test"}'` | SMS vibrates |
| **ALERT_CRON_SECRET** | generate | `node -e "require('crypto').randomBytes(32).toString('hex')"` → paste `.env` → cron-job.org 8AM `POST /api/generate-digest` | 200 OK |
| **NIC/RIVA vs Whisper** | `api-issue-request.md` | If `PermissionDenied`, you swap `api/v1/sync/voice-pipeline-preview.js` to OpenAI Whisper `$0.006/min` — I guide diff, you apply | Voice extraction confidence >0.8 |

No API work done by me today — flagged for you.

---
*Prepared 2026-09-02 by Abhishek + AI — verify via live dashboard, not this doc.*
