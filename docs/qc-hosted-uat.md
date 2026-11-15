# Hosted QC UAT — migration hold

Target selected by operator: Firebase `form-qc-unm`, default Firestore, new Hosting preview channel `qc-cutover`. Keep Supabase UAT `tcmtqgbpafwciaflgsaa` / private `qc-photos-uat` separate from production. Cloud Shell inventory confirms only default database, Jakarta region, billing disabled. No second database or billing activation.

**Do not run the previous Daily Plan hosted UAT deployment commands.** They are retained in Git history only. The feature-branch manual preview workflow is now source-inventory only; Vite and Firebase runtime reject hosted UAT until isolation is implemented. Existing deployments and other branches are unchanged. Local emulator UAT remains available.

## Read-only checkpoint

```bash
python scripts/audit-qc-uat-isolation.py
```

## Required before enabling hosted UAT

- Design a fixed synthetic workspace path (candidate: `qc_uat_workspaces/{workspaceId}/...`) and explicit allowlisted test identities; no production user profiles or role grants for UAT identities. Same-project Auth is shared; account creation and profile/registration paths must be audited independently.
- Route every SDK path, transaction, listener, query, role/profile, registration, audit and REST path through reviewed isolation, including any admin backend and legacy fallback. Do not merely change the Firebase project ID. Reject unknown paths and prevent production identities from writing test namespace and UAT identities from reading/writing production collections. Keep old clients compatible.
- Review rules, indexes and collection-group behavior. Test cross-boundary allow/deny in emulators before any candidate rules deployment; retain exact live baseline and rollback.
- Reconfigure UAT photo endpoints to authenticate the new project, only accept explicit UAT identities and synthetic namespace/paths, and use only the private UAT bucket. Disable old origin/target before any retargeted endpoint becomes available. Review server credentials and least privilege separately; no new IAM or secrets in this checkpoint.
- Verify browser build and network deny tests for Apps Script, old Firebase project, production photo endpoints and unscoped Firestore. Only then consider a separate hosting-only release to `qc-cutover`; never replace `live` or `react-test`.
- Keep production and spreadsheet writes, billing, and admin pilot untouched until separate approved gates.

The source inventory is heuristic, not proof of complete isolation. The previous hosted UAT procedure can be inspected at commit 96bc736; it is not an active runbook.

## Foundation candidate (emulator only)

`scripts/qc-uat-isolation-foundation.mjs` derives a narrow candidate from the exact previously attested legacy-audit baseline, without changing any deployed or normal repository rules file. The only allowed UAT operation is create/get of an own immutable synthetic probe at `qc_uat_workspaces/cutover/probes/{uid}`. UAT requires a dedicated custom claim and a server-provisioned marker at `qc_uat_identities/{uid}`, with no existing production profile. A marker blocks legacy root access even if a stale token lacks the claim. Clients cannot provision or alter markers. No real identities are provisioned here. All other workspace collections remain denied.

Run `node scripts/test-qc-uat-isolation-foundation.mjs --self-test` then the demo-only emulator test. This is not the full portal, not a release candidate, and must not be deployed. Production membership checks add an existence lookup; assess Firestore rules access-call limits, query compatibility and quota/read overhead before any release. Shared Auth registration, stale tokens, provisioning order, privileged server bypass, collection-group queries, production regression coverage and actual live baseline must still be reviewed. Do not merge or deploy solely on the probe test.

Use a fresh dedicated `demo-qc-uat-foundation` emulator on loopback port 8185, not the existing local UAT emulator. The test clears only this disposable demo project. Do not run against an already-used emulator session.

## Synthetic domain candidate (emulator only)

Following the operator's successful 35 foundation checks at 510ce728, the next candidate adds explicitly enumerated Master Paddock, Master Activity, MP, DP, QC and Actual collections under the fixed cutover workspace. A server-provisioned marker role governs synthetic planning and form-specific QC writes. Bounded reads require testOnly == true. QC and Actual are create-only, same-ID atomic pairs, with matching actor, references and area. This intentionally uses a minimal synthetic schema (integer hundredths of hectares), not the production model. It does not enforce aggregate monthly or daily area, full scheduling, edits, deletion, real role permission maps, complete master types, photo upload, account provisioning or frontend routing. Do not deploy this candidate. Hosted UAT remains frozen. Run the foundation suite and domain suite separately in the fresh disposable demo emulator. No production rules or normal application files changed.

Domain generator correction: JavaScript replacement-string expansion of the literal `$'` in the ID regex caused `DOMAIN_SPLICE_MISMATCH` before emulator rules tests. Insert Rules via callback and assert literal content, single catch-all and exact round-trip. The emulator suite must still be run; no candidate rules deployed.
