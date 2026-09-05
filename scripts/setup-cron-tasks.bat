@echo off
REM ═══════════════════════════════════════════════════════════
REM  DynaHaul X — Windows Task Scheduler Setup
REM  Run this ONCE as Administrator to create cron jobs.
REM ═══════════════════════════════════════════════════════════

set CRON_SECRET=b88df86ea59cd219c383cedfbc02e7412beadd022ac8cc903a0272113046538f
set SITE_ID=af3ce2d5-b742-4b3d-a5e9-b148d081dc0a
set BASE_URL=http://127.0.0.1:3000

echo Creating DynaHaul Daily Digest (8:00 AM daily)...
schtasks /create /tn "DynaHaul Daily Digest" /tr "curl -s -X POST %BASE_URL%/api/generate-digest -H \"Authorization: Bearer %CRON_SECRET%\" -H \"Content-Type: application/json\" -d \"{\\\"site_id\\\":\\\"%SITE_ID%\\\"}\"" /sc daily /st 08:00 /f

echo Creating DynaHaul Weekly Report (Monday 8:00 AM)...
schtasks /create /tn "DynaHaul Weekly Report" /tr "curl -s -X POST %BASE_URL%/api/deliver-report -H \"Authorization: Bearer %CRON_SECRET%\" -H \"Content-Type: application/json\" -d \"{}\"" /sc weekly /d MON /st 08:00 /f

echo.
echo Done! Verify with: schtasks /query /tn "DynaHaul*"
