# Lifecycle Firestore SDK and Rules — isolated demo candidate

Operator Cloud Shell at a3eec8a confirmed 26 expanded planning, 28 progress, 8 atomic core and 38 lifecycle mock checks, plus offline browser guards. This does not prove database enforcement.

New standalone deny-by-default Rules use only demo-qc-uat-lifecycle at 127.0.0.1:8285 and workspace cutover. Separate config firebase.uat-lifecycle-emulator.json; NEVER deploy it. No production rules, legacy baseline, previous demo lab, Auth, Supabase, hosting or production app modified. No real identities; rule-unit-testing mock tokens. Seed dedicated marker and DP records only with emulator-admin bypass. Test refuses known nonempty fixture collections/sentinel; always launch fresh with no import/export. No clearing existing data. Root and unknown workspaces denied. No list, client plan writes, deletes or marker provisioning.

QC changes require current actor marker/claim/form and exact synthetic payload, matching DP snapshot, new immutable audit and eligible matching Actual via getAfter. Actual and audit cannot independently change without QC revision change. Existing Actual cannot silently disappear. SDK adapter uses actual Firestore runTransaction and unchanged core via the synthetic lifecycle contract. Direct hostile batches test that rules enforce integrity rather than relying on the client. Rules enforce revision change and immutable revision audit, but cannot prove client baseRevision or every historical job ID; concurrency/retry and real Auth are later gates. Calendar validity beyond date format is checked by JS only. Existing malformed data, role overrides, historical transport, time/HOLD, photo fields, legacy production compatibility and access-call limits under expanded workflows remain unresolved. Standalone deny rules are not a production candidate.

Offline: node scripts/test-qc-uat-lifecycle-emulator.mjs --self-test

Emulator (from repo root, existing Firebase CLI and rules-unit-testing dependencies):
firebase emulators:exec --only firestore --project demo-qc-uat-lifecycle --config firebase.uat-lifecycle-emulator.json 'env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID GCLOUD_PROJECT=demo-qc-uat-lifecycle FIRESTORE_EMULATOR_HOST=127.0.0.1:8285 node scripts/test-qc-uat-lifecycle-emulator.mjs --emulator'

Planned 34 SDK/Rules checks. Source authored and static-reviewed; actual Rules compile and emulator execution NOT yet performed. Operator must run the command and report exact failures before any further gate. Hosted UAT stays OFF.

## Readback harness correction

Operator screenshot at `a258b0a` shows emulator startup and offline guards passed, followed by TypeError reading saveType in the first draft check. `withSecurityRulesDisabled` returns Promise<void> rather than forwarding the callback result. Both privileged readback helpers now capture values within the callback and return them outside, preserve null for missing documents, and explicitly reject undefined. Five focused offline regressions exercise the void-return API, null, missing result and exception propagation. Named failures and explicit draft QC/audit existence checks improve diagnostics. No rules, demo config, production data, or transaction engine changes. The 34 emulator checks still require a fresh rerun; do not mark them passed or advance the release gate yet.
