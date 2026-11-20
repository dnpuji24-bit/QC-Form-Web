# 11D.4f.1 — Revisioned Edit & Delete Custom Role (isolated UAT)

Operator screenshots 20 Nov 2026: 11D.4e.2 passed 45 offline/typecheck, 14 React browser checks, 55 previous backend/Owner regressions; final ALL OWNER REGRESSIONS PASSED. No change to production verified by runtime.

## Intent and safety
- Built-ins and Owner cannot be edited or deleted. Custom role ID and display name stay immutable in 4f.1. **Only the complete 21-key permission definition may be edited**, and a no-op fails.
- Role definition revision starts at 0 and increments once per successful edit, checked with expectedRevision. Legacy revision 0 stays valid. Permission overrides assigned directly to each user remain in place.
- Owner obtains a read-only preview of exact assigned members and their current policy revisions; to edit, Owner submits the full sorted {uid,policyRevision} array. Preview and mutate are transactions against Firebase Auth and Firestore emulators. Missing, forged, extra or stale member versions fail without changes.
- Edit validates every assigned user marker, current materialized permissions and absence of production profile; recalculates all assigned permission maps, increments each policyRevision, updates catalog and creates individual permission audit and catalog audit **in one Firestore transaction**. A collision or concurrency failure rolls back all. Same token next request sees revised access.
- Editing or retiring a role used by unresolved registration requests (pending or approved, including requested or approved role identity) is blocked until a terminal decision or activation. This prevents approvals from silently acquiring a changed role definition. Rejected/activated registration records remain historical; activated accounts are covered by the member scan.
- Delete is a **retirement**: refused with any assigned users or unresolved registrations. After safe confirmation it atomically creates a permanent tombstone containing the last definition, removes the active role_catalog row, and creates an immutable catalog audit. Recreating the same role ID is blocked by tombstone, so historical role identities are not reused. No silent reassignment or deletion of users; Owner must explicitly reassign each person through existing audited role-assignment service before retirement.
- Bounds: 75 role members, 100 registration rows, no pagination. Exceeding limits fails closed. Tests include full catalog/audit collision rollback, concurrent update, direct client write denial and Owner revocation.
- No production role updates, no deployment, no Supabase changes, no hard deletes of audit or identities. UI Edit/Delete panel is a **separate next gate 11D.4f.2** after backend tests pass.
- Note: Firestore user markers materialize effective permissions; current validation checks exact role catalog. Changes are visible at the next authorized request, not unsolicited pushed updates.
- Live registration/signup and other production flows are out of scope.

## HTTP endpoints (existing dedicated Owner HTTP port 4497)
- POST /uat/owner/permissions/roles-preview — {roleId}; returns {preview:{definition,members,readOnly:true}}.
- POST /uat/owner/permissions/roles-update — {roleId,expectedRevision,permissions,expectedMembers}. Strict complete permission map and exact sorted member revision list, audited transaction. Returns {update:{definition,affectedCount}}.
- POST /uat/owner/permissions/roles-delete — {roleId,expectedRevision,expectedMembers:[]}. Blocks any active member and unresolved registration, saves tombstone. Returns {deleted:{roleId,retired:true}}.

## Operator test plan
1. Offline: node scripts/test-qc-uat-role-lifecycle-contract.mjs (11); existing custom role/assignment/Owner permission tests (8+8+20); existing registration contract (9), node scripts/test-qc-uat-role-lifecycle.mjs --self-test and existing UI isolation guards; npm run typecheck. Total old offline checks 45 plus new 11 = 56.
2. Emulator: node scripts/test-qc-uat-role-lifecycle.mjs --emulator in fresh project demo-qc-uat-owner-http (16 authored checks).
3. Regression in fresh emulators: scripts/test-qc-uat-custom-role-registration.mjs --emulator (15), scripts/test-qc-uat-owner-permission-http.mjs --emulator (29), scripts/test-qc-uat-owner-session-browser.mjs --browser (11), scripts/test-qc-uat-custom-role-registration-ui.mjs --browser (14). Total 69 regression checks, 141 expected checks including 1 and 2.

**Runtime status: authored in GitHub, not yet executed via Cloud Shell. Do not activate on production.**
