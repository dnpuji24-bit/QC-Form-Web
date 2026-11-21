# 11D.5c.4.2 — Read-only Summary and Calendar modules in isolated operational UAT

## Baseline
Operator Cloud Shell evidence confirmed 6/6 portal navigation checks passed (3 offline + 3 browser). The earlier QC photo, role, correction, permission and Supabase UAT tests remain valid and are not re-run in this delta.

## Added (candidate, operator test pending)
- `src/qcUatOperationalPeriod.mjs`: exact period and source request validation plus bounded, safe read-only Daily/Actual calendar projection. It validates canonical synthetic Daily rows and returns **aggregated Actual counts**, never full Actual/QC/photos or arbitrary raw documents. No mixed fertilizer application and physical hectares.
- `createPlanningCalendarService` in `uat-planning-role-service.mjs`: fresh Firebase token and role revision authorization **within a Firestore Emulator transaction**, scoped to Daily or Actual read grants independently, strict 50-record month limit, fail closed for malformed or non-UAT data.
- Two fixed routes in `uat-unified-planning-http.mjs`: `/uat/unified/portal/summary` calls the existing verified filtered Dashboard service, and `/uat/unified/portal/calendar` calls the new calendar read service. Both are loopback-only POST, authenticated, 8-KiB JSON bounded, no writes.
- `uat-unified-portal-lab/main.jsx`: replaces **Summary** and **Calendar Rekap** placeholders with a live read-only UAT view (month/week selector, MP Spray target, DP Spray actual, fertilizer *application* area and Daily/Actual calendar). It uses the browser's current in-memory Firebase Auth token through the existing fixed same-origin Planning proxy, validates response shape, and clears data on user/role changes.
- Navigation now requires an actual Daily or Actual read grant for Calendar instead of treating Summary permission alone as sufficient. No new entrypoint is imported into `src/main.tsx`, `src/PortalRouter.tsx`, or production Hosting.
- No new trusted write routes, Supabase calls, photo uploads, public RLS, legacy Spreadsheet dependence, new projects, or Cloud Billing.

## One compact delta gate — operator Cloud Shell
```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:portal-modules
```

This runs only **3 offline contracts** for period validation and safe Daily/Actual projections, followed by **3 focused Chromium checks** using isolated Firebase Auth/Firestore demo emulators. The browser checks use synthetic seeded Daily rows, read an empty 2027-01 Summary period, list three DP rows for November 2026, retrieve an empty Actual calendar, and verify an authenticated QC viewer is denied both server endpoints (403). No historical photo or full portal tests are repeated. No Supabase key required.

Expected only after operator execution:
```text
SUCCESS: 3 read-only operational Summary/Calendar delta contracts passed (OFFLINE)
PASS: only authenticated Owner can open operational Summary and Calendar panels
PASS: Summary reads verified filtered Planning data and preserves fertilizer-area semantics
PASS: Daily and Actual Calendar use current authorized read-only Planning HTTP
SUCCESS: 3 focused operational Summary and Calendar real-read browser delta checks passed (demo Firebase only)
```

## Still open
This is not full production portal integration. The next work is operational Data QC listing, AP detail, materials tracking, complete MP/DP/AP menus, manager/mandor real-user UAT, full export Excel, and a carefully controlled cutover/rollback review. Dashboard is backed by an existing service, but this gate only checks a *zero-row* summary period; a separate targeted nonempty snapshot test is needed before declaring operational reporting complete. Calendar is capped at 50 rows per month until scoped pagination is designed. Firestore Rules/Hosting and production `form-qc-unm` remain unchanged.

## Verification status
Code committed and static checks in GitHub completed. **New Cloud Shell emulator/browser run not yet confirmed.**
