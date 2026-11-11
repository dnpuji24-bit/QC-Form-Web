# Read-only Firebase Auth verification before QC photo migration

## Last verified production aggregates (user-run Cloud Shell)

- 670 QC records. 662 have a single username match to an active, APPROVED Firestore user. 8 have no match. None ambiguous.
- 25 Firestore users: 21 approved and active, 4 explicitly active=false.
- All 670 QC records lack `ownerUid`. 18 lack `clientRevision`.
- 256 contain Drive photo references; 143 have HOLD intervals. Do not remove/migrate those photos automatically.

## Next verification — READ ONLY
```bash
cd ~/QC-Form-Web
git pull origin feature/firebase-auth-claims-supabase
node scripts/audit-qc-auth-uid-consistency.mjs --read-only-confirmed
```
This script verifies whether each Firestore `users/{uid}` document has a matching Firebase Authentication user and whether the associated emails match (counts only). It then counts historical QC whose unique matched users are verified, approved and active. Output contains NO usernames, UIDs or emails. It performs only reads and may use Firebase Auth/Firestore quotas. If an IAM permission error appears, do not download or share credential JSON or enable new IAM permissions without review.

## Production policy for later
- Keep existing login and role templates. Data QC `view` or `edit` means all photos visible; `none` denies.
- Ensure `users/{uid}` is actually the Firebase Auth UID before any backfill.
- Never automatically assign the 8 unmatched QC records to an account.
- A matching Auth UID proves present account linkage, **not historical authorship**. Preserve audit trails and confirm with original data owner before backfill.
- A migration should support dry run, record-by-record backup, version checks, rollback, idempotency and incremental writes only. No production writes have been authorized or performed.
- Separately verify every real record's `clientRevision`, handling the 18 missing revisions without overwriting old QC content.
- Continue to display Google Drive photo references for existing records. Supabase can take over new uploads only after full live testing.

**No deployment or production data changes are part of this audit.**
