# 11D.5c.4.1 — Operational portal navigation bridge (isolated UAT; delta-only)

## Starting point
Operator's Cloud Shell screenshot confirmed all **3/3 photo recovery delta checks PASS**, offline. Earlier photo compression, immutable QC/Actual, private Supabase, signed preview, permission revocation, photo correction, and cleanup gates have passed. Repeating those tests now would not validate the newly changed portal menu.

The actual app uses `src/PortalRouter.tsx` as the chooser for **Form QC**, **Data UnM**, **Summary**, **Calendar Rekap**, and **Users & Access**. It uses `src/accessControl.ts` permission keys. Its runtime is separate from the synthetic UAT shell in `uat-unified-portal-lab/main.jsx`.

## Candidate implementation
- A new pure module `src/qcUatOperationalPortalNavigation.mjs` projects these five portal destinations **only from server-confirmed UAT permissions**. No role-based fallback, Storage SDK, localStorage, embedded token, arbitrary URL, or network call.
- The existing UAT shell now supports an explicit build-only `__QC_UAT_OPERATIONAL_PORTAL__=true` flag. **The default is disabled.** Only the dedicated local Playwright test bundle sets it true; no production or hosted entrypoint has been modified.
- When enabled, it shows one chooser and active area. QC Spray/Fertilizer editors are rendered in Form QC, Monthly/Daily read-only UAT actions in Data UnM, and the role lifecycle editor only under Users & Access for a confirmed Owner. Summary and Calendar are **permission-gated placeholders**, not connected production modules.
- Permission updates, logout or account switch make the menu return to Home, and no disallowed area or edit form remains visible. The trusted HTTP backend continues to re-verify Firebase Auth token, marker, roles, source and write permissions, so the menu itself never grants server authority.
- No new endpoints, Firebase rules, Apps Script/Spreadsheet integration, production Build/Hosting, Supabase operation, or persistent browser storage.

## One short Cloud Shell command

```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:portal-integration
```

The command runs 3 offline permission/route contracts and 3 isolated Chromium navigation checks under **Firebase Auth/Firestore demo emulators**. No new photo upload, Supabase key or production data involved. The suite is shorter than the full 17-case portal role regression, which remains unchanged.

Expected **only after operator execution**:

```text
SUCCESS: 3 isolated operational portal permission and route contracts passed (OFFLINE)
PASS: portal navigation hidden until Firebase server session is confirmed
PASS: Owner, custom Monthly and viewer see role-specific operational entry routes
PASS: permission change and account switch reset navigation without root mutations
SUCCESS: 3 isolated operational portal navigation browser delta checks passed (demo Firebase only)
SUCCESS: 3 offline access contracts and 3 focused operational portal browser checks passed (demo emulator only)
```

## Outstanding scope
This checkpoint integrates the **menu and session/permission contract within the isolated portal**, not the complete production portal. Remaining tasks before final:
1. Connect actual operational modules and feature-level permissions in a controlled nonproduction pilot, without bypassing the existing native Firebase session or falling back to Apps Script/Spreadsheet.
2. Run focused user acceptance across asisten, mandor, manager, owner, Shift 1/2, MP/DP/AP, QC and Excel export; only affected flows and cross-module integration.
3. Prepare a non-destructive production release and rollback checklist, backup/export and data migration verification. Only deploy to `form-qc-unm` with explicit release authorization.

Status: committed candidate; source-level validation completed, browser/emulator execution pending.
