# Dead Code Inventory — DynaHaul X

Files and directories identified as candidates for deletion. Verify no active references exist before removing.

---

## Candidate 1: `fitter-camera/` (entire directory)

**Path:** `project-root/fitter-camera/`

**What it is:** Camera-specific fitter form, likely an earlier version superseded by the generic `fitter/forms.js` pipeline.

**Evidence:**
- The generic `fitter/` directory has `forms.js`, `pipeline.js`, `voice-processing.js`, `queue-engine.js` — a more complete pipeline
- `fitter-camera/` routes to a separate `.html` page rather than using the form system

**Risk:** Low. Check if any HTML links or service workers reference `fitter-camera/`.

---

## Candidate 2: `mockups/` (entire directory)

**Path:** `project-root/mockups/`

**What it is:** UI mockup HTML files, likely design prototypes or presentation demos.

**Evidence:**
- Not imported by any module
- Only relevant during design phase

**Risk:** None. Safe to delete.

---

## Candidate 3: Standalone scripts in project root

**Path:** Various top-level `.html` or `.js` files not referenced by any `index.html` or service worker.

**Known candidates:**
- Any `.html` file not in `fitter/`, `manager/`, or `forms/`
- `EXE Setup/` could also be migrated to use the centralized `_env.js` approach

**Approach:** Run `Get-ChildItem -Path . -Filter "*.html" -File` and cross-reference with all `index.html` files and service worker registration scripts. Delete unreferenced files.

---

## Candidate 4: Legacy `vehicle_no_norm` fallback queries in `api/send-otp.js`

**Not a file deletion** — these are code branches that query the `vehicle_no` column directly instead of the canonical `vehicle_no_norm` column. Since migration 009 already populates `vehicle_no_norm`, the fallback branches are dead code.

**Lines (approx):**
- `api/send-otp.js` lines ~189-205 (vehicle lookup fallback)
- `api/send-otp.js` lines ~382-405 (tyre lookup fallback)

**Risk:** Medium — only delete after verifying migration 009 has been applied in production.

---

## Verification Steps Before Any Deletion

1. `git grep -r "fitter-camera"` — check references in HTML, JS, CSS
2. `git grep -r "mockups"` — check references
3. `git grep -r "vehicle_no"` — confirm which querys use the norm column vs raw
4. Run the app and verify no broken links in the fitter navigation
