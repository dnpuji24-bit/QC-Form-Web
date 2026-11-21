# 11D.5c.4.4 — Data QC newest 100 + exact ID across months (synthetic UAT)

## Evidence already confirmed
The operator's Cloud Shell screenshot confirms the prior 11D.5c.4.3 gate **6/6 PASS**, exit code 0: audited Data QC/Actual read model, viewer access without QC edit, separate NK/DAP application hectares and same-token role revocation. No need to repeat photo, Supabase, correction, Summary or Calendar tests for this delta.

## New opt-in UAT implementation
- The **existing** bounded monthly Data QC (50 records) is untouched.
- A new strict POST route `/uat/unified/portal/qc-browse` shares the same live Firebase emulator token/role-revision gate `qc_records: view|edit`, same-origin loopback proxy and immutable full QC/operational audit + Actual verification. No production entrypoint or Firestore Rules change.
- **Latest 100**: `qc_records` queried by descending date, capped at 101 snapshots to detect older rows. Only the newest 100 are validated/projected; the response reports `hasMore`. Optional Spray/Fertilizer filter applies **inside the global 100-most-recent window**, not to an unbounded independent kind search. No infinite scrolling.
- **Exact ID lookup across all months**: an ID matching the synthetic `uat-...` format is searched as QC document ID, paddock ID, Daily Plan ID and foreman ID using exact Firestore equality (three bounded queries, each at most 101). Results are deduplicated, capped at 100, and validated against the requested identifier. If too broad the request fails closed instead of silently showing an incomplete global result. **This is not fuzzy/substring/global full-text search.**
- React's Data QC panel adds separate buttons `Muat 100 QC Terbaru` and `Cari ID QC Tepat`; month-filter mode remains available. Results never include raw full DTO, material amounts, photo paths or signed URLs. The panel clears stale responses on new requests, identity/role changes, or filter changes.
- Distinct Spray physical hectares vs Fertilizer component/application hectares are retained.
- No production `form-qc-unm` changes, no new Firebase project/Cloud Billing, no Supabase secret/Storage writes, and no external search provider.

## Single compact operator gate
```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:portal-browse
```

Only 3 offline browse-contract delta checks (strict input, bounded latest, exact-match verification & immutable audits) plus 3 focused Chromium browser checks in fresh Firebase Auth + Firestore **demo emulators**. Browser seeds four synthetic QC/Actual/audit pairs from 2025, 2026 and 2027, verifies newest order, cross-period exact DP/QC lookup and denial after role revocation. Previous gates are not repeated. No Supabase secret or live uploads.

Expected only if the operator's Cloud Shell command succeeds:
```text
SUCCESS: 3 newest-100 and exact-ID Data QC delta contracts passed (OFFLINE)
PASS: authenticated QC viewer loads audited 100-latest window across months
PASS: exact QC, paddock and DP lookup finds audited records across all periods
PASS: revoked same token cannot query latest or exact QC and browser clears cached result
SUCCESS: 3 focused newest-100 + exact-ID Data QC browser checks passed (demo Firebase only)
```

## Operational limitations / next step
The 100-latest list does not paginate beyond 100; the exact search supports identifiers only. Actual production full-text search requires an indexed search approach rather than scanning entire Firestore collections. This UAT gate does not establish inventory IN/OUT, warehouse issue/return tracking, Excel export, real field UAT, or production deployment readiness. These remain the next work areas. A successful static parse or commit does not prove browser acceptance until operator Cloud Shell confirms it.
