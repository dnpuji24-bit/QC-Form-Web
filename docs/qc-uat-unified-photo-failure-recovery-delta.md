# 11D.5c.3b.2f.2 — Read-only UAT photo failure diagnostics (delta)

## Baseline already proven
The 3/3 photo-only correction tests passed in the operator's Cloud Shell screenshot. Earlier atomic, reconciliation, retry, JPEG/PNG/WebP, signed-preview and four-object run-scoped cleanup gates also passed. Do **not** rerun those unchanged gates for this checkpoint.

## Newly addressed risk
The existing trusted stage intentionally preserves uploaded objects if Firestore fails, and the successful-run cleanup demands exact audited ownership. However, a **failed** run previously printed only a run ID and required an operator to manually distinguish orphaned, ambiguous and already audited objects.

This checkpoint adds a **read-only** diagnostic for the live *synthetic* UAT browser test **failure path only**:
- Compares in-memory attempted paths, acknowledged paths and the **current** demo Firestore photo manifests plus their immutable same-revision audit.
- Rejects any other actor or run scope, rejects manifest/audit mismatches, and never authorizes automatic deletion.
- Returns only safe status codes and counts: `STAGED_UNCOMMITTED`, `AMBIGUOUS_UPLOAD`, `AUDIT_CONFLICT`, `SCOPE_CONFLICT`, `COMMITTED_REFERENCE_NOT_ACKNOWLEDGED`, `REFERENCES_MATCH_PROCESS_SNAPSHOT`, or `NO_PROCESS_EVIDENCE`.
- All statuses set `automatedDeletionAllowed:false` and `requiresManualReconciliation:true`, including clean-looking snapshots. The tracker and demo emulator are process-local and **cannot prove remote Storage state after process termination**.
- No key, signed URL, raw object path, private file name, Storage delete, Supabase list, or production access in this routine.
- The successful-run cleanup remains unchanged, with its separate strict four-object proof, and is never invoked after a failed/ambiguous result.
- Immutable correction audit rows remain protected. The diagnostic checks only the *current* manifest revision; it is **not** a production-wide historical archive scanner or orphan janitor.

## One short Cloud Shell command
```bash
cd ~/QC-Form-Web
git switch feature/firebase-auth-claims-supabase
git pull --ff-only origin feature/firebase-auth-claims-supabase
npm run test:uat:photo-recovery
```

Only three **offline** delta groups: (1) acknowledged current/historical audit references; (2) staged, ambiguous and missing acknowledgments; (3) tampered audit, foreign scope and empty snapshot. It also syntax-checks the edited modules. **No Firebase Emulator, Chromium, Supabase key or live upload**. Do not confuse a successful offline result with actual recovery of unknown remote objects.

Expected if the operator runs successfully:
```text
PASS: acknowledged and historical audited revisions remain protected, never auto-deleted
PASS: staged-only orphan and ambiguous upload are distinguished without any deletion
PASS: tampered audit, foreign path and empty in-process snapshot fail closed
SUCCESS: 3 read-only photo failure delta checks passed (NO emulator, NO Supabase upload)
```

## Next
With this targeted failure-path security gate confirmed, remaining major milestones are (1) operational portal integration and role UX, (2) field/manager UAT including QC/Planning/Export and shift flows, and (3) production release/rollback review. If live Storage orphan records are ever found, investigate with current run-specific metadata and explicit human authorization before deleting; this stage does not implement automatic recovery. Production `form-qc-unm` is unchanged.
