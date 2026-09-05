# DynaHaul X — API Reference

*Complete reference for all 19 API endpoints. All paths work identically on Vercel (serverless) and local Express server (`npm start`).*

---

## Authentication Summary

| Auth Type | Scope | Endpoints |
|-----------|-------|-----------|
| **Service Role Key** | `SUPABASE_SERVICE_ROLE_KEY` — server-side Supabase admin | create-user, update-user-email, send-email, send-otp, all v1/review/\*, all v1/sync/\* (except previews), import-fitter-csv |
| **Bearer Token** | `ALERT_CRON_SECRET` — cron/alert secret | send-alert, generate-digest, deliver-report |
| **None** | Public preview/utility endpoints | extract-preview, photo-pipeline-preview, voice-pipeline-preview, verify-otp |

---

## Auth Endpoints

### POST /api/send-otp

Password-based Supabase Authentication sign-in.

**Auth:** Service role key (`getServiceClient()`)

**Request:**
```json
{
  "email": "manager@example.com",
  "password": "user-password"
}
```

**Response 200:**
```json
{
  "user": { "id": "uuid", "email": "manager@example.com" },
  "session": { "access_token": "...", "refresh_token": "..." }
}
```

**Response 400:** `{ "error": "Email and password are required" }`

**Response 401:** `{ "error": "Invalid login credentials" }`

---

### POST /api/verify-otp

Forward OTP to external verification API.

**Auth:** None (proxy to `verify_otp_api.php`)

**Request:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response 200:** (proxied from external API)

---

## User Management Endpoints

### POST /api/create-user

Create a new user in `auth.users` via Supabase Admin API. Creates user without email confirmation.

**Auth:** Service role key (`getAdminClient()`)

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "secure-password",
  "name": "John",
  "role": "manager",
  "site_id": "uuid",
  "customer_id": "uuid",
  "license_plate": "UP-1234"
}
```

**Response 200:**
```json
{
  "success": true,
  "user_id": "uuid",
  "message": "User created successfully"
}
```

---

### POST /api/update-user-email

Update an existing user's email address.

**Auth:** Service role key (`getAdminClient()`)

**Request:**
```json
{
  "user_id": "uuid",
  "new_email": "updated@example.com"
}
```

**Response 200:** `{ "success": true, "message": "Email updated" }`

---

### POST /api/send-email

Dual-purpose: handles `auth_login` (Supabase password sign-in with `grant_type=password`) and transactional email sending via Resend.

**Auth:** Service role key (internal) + Resend API key

**Request (auth_login):**
```json
{
  "type": "auth_login",
  "email": "user@example.com",
  "password": "secure-password"
}
```

**Request (transactional):**
```json
{
  "email": "recipient@example.com",
  "subject": "Fleet Report",
  "html": "<html>...</html>"
}
```

---

## Alert Engine

### POST /api/send-alert

Dispatch a real-time SMS alert for a domain event. Routes both `sms` and `whatsapp` channels to SMS (WhatsApp Meta approval pending).

**Auth:** `Authorization: Bearer <ALERT_CRON_SECRET>`

**Request:**
```json
{
  "site_id": "uuid",
  "event_type": "pressure_drop",
  "payload": {
    "tyreNo": "DHT-1234",
    "position": "FL",
    "truckNo": "TRK-07",
    "currentPsi": 65,
    "targetPsi": 120,
    "siteName": "Bharat West"
  }
}
```

**Supported Event Types:**

| event_type | Required Fields |
|---|---|
| `pressure_drop` | tyreNo, position, truckNo, currentPsi, targetPsi |
| `fitment_overdue` | position, truckNo, hoursElapsed |
| `inspection_due` | tyreNo, lastInspectionDate, daysSinceInspection |
| `tyre_removed` | tyreNo, position, truckNo, reason |
| `rtd_threshold` | tyreNo, currentRtd, thresholdRtd, estimatedDaysRemaining |

**Response 200:** `{ "success": true, "dispatched": 3, "failed": 0, "log_ids": ["uuid-1", ...] }`

**Response 200 (no match):** `{ "success": true, "dispatched": 0, "warning": "No matching alert rule" }`

**Flow:**
1. Validate payload has required fields for event_type
2. Query `alert_rules` for matching (site_id + event_type + is_active)
3. Fetch active `subscriber_contacts` for this site
4. Map payload to bilingual template (EN + HI) via `alert-templates.js`
5. Send via `sms-gateway.js` (rate limited: 10/min/site)
6. Write `alert_logs` for each attempt
7. Return summary

---

### POST /api/generate-digest

Generate and broadcast a daily fleet health digest SMS.

**Auth:** `Authorization: Bearer <ALERT_CRON_SECRET>`

**Request:**
```json
{ "site_id": "uuid" }
```

**Response 200:**
```json
{
  "success": true,
  "broadcast": 5,
  "subscribers": 5
}
```

**Cron:** `0 8 * * *` (daily at 8 AM)

**Flow:**
1. Query `v_fleet_health_score` for the site
2. Count recent alerts from `alert_logs` (last 24h)
3. Query active subscribers
4. Compose bilingual digest SMS
5. Dispatch to all subscribers
6. Write `alert_logs` for each dispatch

---

### POST /api/deliver-report

Generate and email scheduled fleet reports.

**Auth:** `Authorization: Bearer <ALERT_CRON_SECRET>`

**Request:**
```json
{ "site_id": "uuid" }
```
If `site_id` is omitted, all due reports are processed.

**Response 200:**
```json
{
  "success": true,
  "reports_generated": 3,
  "emails_sent": 9,
  "details": [
    { "site_id": "uuid-1", "recipients": 3, "status": "sent" }
  ]
}
```

**Cron:** `0 8 * * 1` (every Monday at 8 AM)

**Flow:**
1. Query `scheduled_reports` where `is_active = true` AND schedule matches
2. For each due report: call `generate-report.js`, build fleet health HTML, send via Resend, write `report_deliveries`
3. Return summary

---

## Admin Endpoints

### POST /api/admin/import-fitter-csv

Import fitter CSV data for a specific site.

**Auth:** Service role key + scoped to hardcoded `ALLOWED_SITE_ID`

**Request:** CSV file upload

**Response 200:** `{ "success": true, "imported": 42, "errors": [] }`

---

## Review Pipeline (v1)

### GET /api/v1/review/queue

Fetch the review queue — pending and in-progress items with evidence previews.

**Auth:** Service role key (`getAdminClient()`)

**Query params:** `site_id` (optional filter)

**Response 200:**
```json
{
  "items": [
    {
      "submission_id": "uuid",
      "status": "pending",
      "created_at": "2026-06-05T10:00:00Z",
      "evidence_count": 3
    }
  ]
}
```

---

### POST /api/v1/review/action

Approve, correct, or reject a review item.

**Auth:** Service role key + `x-user-id` header (audit identity)

**Request:**
```json
{
  "submission_id": "uuid",
  "action": "approve",
  "notes": "Looks good"
}
```

**Supported actions:** `approve`, `correct`, `reject`

**Response 200:** `{ "success": true, "new_status": "approved" }`

---

### GET /api/v1/review/evidence

Fetch evidence media (signed URLs) for a submission.

**Auth:** Service role key (`getAdminClient()`)

**Query params:** `submission_id` (required)

**Response 200:**
```json
{
  "evidence": [
    { "type": "photo", "signed_url": "https://...", "filename": "tyre_sidewall.jpg" }
  ]
}
```

---

## Sync Pipeline (v1)

### POST /api/v1/sync/submissions-register

Register a new offline submission — validates steps, creates media rows, returns signed upload URLs.

**Auth:** Service role key + `x-user-id` header

**Request:**
```json
{
  "site_id": "uuid",
  "idempotency_key": "client-generated-uuid",
  "form_data": { ... },
  "media": ["data:image/jpeg;base64,..."]
}
```

**Response 200:**
```json
{
  "submission_id": "uuid",
  "upload_urls": ["https://..."],
  "status": "registered"
}
```

---

### POST /api/v1/sync/submissions-finalize

Finalize a submission — triggers deep processing, writes audit log, updates status.

**Auth:** Service role key + `x-user-id` header

**Request:**
```json
{
  "submission_id": "uuid"
}
```

**Response 200:**
```json
{
  "success": true,
  "status": "completed",
  "processing_results": { ... }
}
```

---

### GET /api/v1/sync/submissions-status

Return the sync/processing status of a single submission.

**Auth:** Service role key (`getAdminClient()`)

**Query params:** `submission_id` or `idempotency_key`

**Response 200:**
```json
{
  "submission_id": "uuid",
  "status": "processing",
  "progress": 60,
  "created_at": "2026-06-05T10:00:00Z"
}
```

---

### POST /api/v1/sync/status-batch

Batch status lookup for multiple submission IDs.

**Auth:** Service role key (`getAdminClient()`)

**Request:**
```json
{
  "submission_ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Response 200:**
```json
{
  "statuses": {
    "uuid-1": { "status": "completed" },
    "uuid-2": { "status": "failed", "error": "..." },
    "uuid-3": { "status": "processing", "progress": 45 }
  }
}
```

---

## Preview / Utility Endpoints (Unauthenticated)

### POST /api/v1/sync/extract-preview

Preview OCR text extraction or audio transcription from submitted media data URLs.

**Auth:** None

**Request:**
```json
{
  "media_data_url": "data:image/jpeg;base64,...",
  "type": "ocr"
}
```

**Response 200:**
```json
{
  "extracted_text": "...",
  "confidence": 0.95
}
```

---

### POST /api/v1/sync/photo-pipeline-preview

Preview photo OCR pipeline — categorizes images (pressure gauge, tyre sidewall, etc.) and extracts text.

**Auth:** None

**Request:**
```json
{
  "image_data_url": "data:image/jpeg;base64,..."
}
```

**Response 200:**
```json
{
  "category": "pressure_gauge",
  "extracted_text": "120 PSI",
  "confidence": 0.92
}
```

---

### POST /api/v1/sync/voice-pipeline-preview

Preview voice transcription — converts audio data URL to text.

**Auth:** None

**Request:**
```json
{
  "audio_data_url": "data:audio/webm;base64,..."
}
```

**Response 200:**
```json
{
  "transcript": "tyre pressure 120 psi",
  "confidence": 0.88
}
```

---

## SQL Views (Read via data-queries.js)

### v_fleet_health_score
```sql
SELECT site_id, health_score, pressure_compliance_pct,
       avg_life_remaining_pct, inspection_recency_pct,
       leakage_severity, defect_rate
FROM v_fleet_health_score
WHERE site_id = '<site_id>';
```

### v_tyre_age_distribution
```sql
SELECT brand, size, total_tyres, avg_age_days, age_group
FROM v_tyre_age_distribution
WHERE site_id = '<site_id>'
ORDER BY brand, size;
```

### v_defect_trend_by_position
```sql
SELECT brand, position, defect_count, rank
FROM v_defect_trend_by_position
WHERE site_id = '<site_id>'
  AND brand IN (SELECT DISTINCT brand FROM ... WHERE rank <= 5);
```

### v_removal_reasons_pie
```sql
SELECT reason, count, percentage
FROM v_removal_reasons_pie
WHERE site_id = '<site_id>';
```

---

*DynaHaul X — June 2026 (v2.0.1)*
