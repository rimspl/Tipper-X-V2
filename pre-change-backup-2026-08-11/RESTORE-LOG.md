# Pre-Change Backup Log — 2026-08-11 15:15:15
# Project: DynaHaul X v2 — Tipper Demo
# Purpose: Revert point for tyre position selector + manager data flow fixes

## fitter\src\pages\home.js
- Size: 112985 bytes
- Lines: 3494
- Modified: 08/07/2026 12:37:22

## fitter\sw.js
- Size: 4690 bytes
- Lines: 163
- Modified: 08/07/2026 11:27:58

## api\send-otp.js
- Size: 37199 bytes
- Lines: 1187
- Modified: 08/07/2026 09:34:28

## manager\src\services\data-service.js
- Size: 80455 bytes
- Lines: 2262
- Modified: 08/07/2026 15:57:12

## fitter\src\styles\app.css
- Size: 38700 bytes
- Lines: 2006
- Modified: 08/07/2026 12:37:23

## Key Line References (pre-change)
- home.js:112-131 = MODULE_SEQUENCE_CONFIG (no fitment entry)
- home.js:109 = FITMENT_INTRO_FIELD_IDS
- home.js:686-687 = fitmentIntroPassed init
- home.js:749 = isFitmentIntroStage var
- home.js:764-772 = fitment intro banner
- home.js:1822 = fitment intro guard in selectSequencePosition
- home.js:2048 = fitmentIntroPassed in flow init
- home.js:2430-2476 = resolveVisibleFields (no fitment case)
- home.js:2560-2582 = continueFitmentIntro function
- home.js:1174 = fitment intro continue button
- send-otp.js:928 = createIfMissing: false
- sw.js:1 = CACHE version dynahaul-fitter-v40
- data-service.js:266-289 = fetchManagerDataset fallback logic

## Restore Command
# Copy .bak files back and rename:
# Copy-Item "D:\DX_User\Data_Abhishek\Abhishek\Dynahaul given by Amit sir 15july\Tipper demo\pre-change-backup-2026-08-11\fitter_src_pages_home.js.bak" "D:\DX_User\Data_Abhishek\Abhishek\Dynahaul given by Amit sir 15july\Tipper demo\fitter\src\pages\home.js"
# Copy-Item "D:\DX_User\Data_Abhishek\Abhishek\Dynahaul given by Amit sir 15july\Tipper demo\pre-change-backup-2026-08-11\fitter_sw.js.bak" "D:\DX_User\Data_Abhishek\Abhishek\Dynahaul given by Amit sir 15july\Tipper demo\fitter\sw.js"
# Copy-Item "D:\DX_User\Data_Abhishek\Abhishek\Dynahaul given by Amit sir 15july\Tipper demo\pre-change-backup-2026-08-11\api_send-otp.js.bak" "D:\DX_User\Data_Abhishek\Abhishek\Dynahaul given by Amit sir 15july\Tipper demo\api\send-otp.js"
# Copy-Item "D:\DX_User\Data_Abhishek\Abhishek\Dynahaul given by Amit sir 15july\Tipper demo\pre-change-backup-2026-08-11\manager_src_services_data-service.js.bak" "D:\DX_User\Data_Abhishek\Abhishek\Dynahaul given by Amit sir 15july\Tipper demo\manager\src\services\data-service.js"
# Copy-Item "D:\DX_User\Data_Abhishek\Abhishek\Dynahaul given by Amit sir 15july\Tipper demo\pre-change-backup-2026-08-11\fitter_src_styles_app.css.bak" "D:\DX_User\Data_Abhishek\Abhishek\Dynahaul given by Amit sir 15july\Tipper demo\fitter\src\styles\app.css"
