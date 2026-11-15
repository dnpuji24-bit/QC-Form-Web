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
