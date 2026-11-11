#!/usr/bin/env node
/**
 * Safely prepare Firebase Auth for Supabase third-party authentication.
 *
 * Read-only by default. Mutates ONE existing Firebase user only when:
 *   --apply is specified AND CONFIRM_FIREBASE_CLAIM_WRITE=form-qc-unm
 *
 * Uses Application Default Credentials (ADC); never bundle a service-account key.
 * The Auth custom claim "role: authenticated" is the Supabase/Postgres role, NOT
 * the QC operational role (stored separately in Firestore users/{uid}).
 *
 * Usage:
 *   npm install --no-save firebase-admin
 *   node scripts/set-supabase-firebase-claim.mjs --uid FIREBASE_UID
 *   CONFIRM_FIREBASE_CLAIM_WRITE=form-qc-unm node scripts/set-supabase-firebase-claim.mjs --uid FIREBASE_UID --apply
 */
const PROJECT_ID = 'form-qc-unm';
const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');
if (help) {
  console.log('Usage: node scripts/set-supabase-firebase-claim.mjs --uid FIREBASE_UID [--apply]');
  console.log('Default is read-only. --apply requires CONFIRM_FIREBASE_CLAIM_WRITE=form-qc-unm.');
  process.exit(0);
}
const uidFlagIndex = args.indexOf('--uid');
const uid = uidFlagIndex >= 0 ? args[uidFlagIndex + 1] : '';
const apply = args.includes('--apply');
const expectedArgs = apply ? ['--uid', uid, '--apply'] : ['--uid', uid];
if (!uid || uid.startsWith('--') || args.length !== expectedArgs.length || args.some(a => !expectedArgs.includes(a))) {
  console.error('Specify exactly --uid FIREBASE_UID and optionally --apply. No bulk writes supported.');
  process.exit(2);
}
if (apply && process.env.CONFIRM_FIREBASE_CLAIM_WRITE !== PROJECT_ID) {
  console.error('Refusing mutation: set CONFIRM_FIREBASE_CLAIM_WRITE=form-qc-unm explicitly.');
  process.exit(2);
}
if (process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT !== PROJECT_ID) {
  console.error('Refusing: GOOGLE_CLOUD_PROJECT does not match form-qc-unm.');
  process.exit(2);
}
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT_ID) {
  console.error('Refusing: GCLOUD_PROJECT does not match form-qc-unm.');
  process.exit(2);
}
try {
  const [{ initializeApp, applicationDefault }, { getAuth }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
  ]);
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const auth = getAuth();
  const before = await auth.getUser(uid);
  const claims = { ...(before.customClaims ?? {}) };
  const current = claims.role;
  if (current && current !== 'authenticated') {
    console.error('STOP: existing Auth custom claim role is not "authenticated".');
    console.error('Review it manually to avoid overwriting an operational or security claim.');
    process.exit(3);
  }
  const after = { ...claims, role: 'authenticated' };
  console.log(JSON.stringify({
    project: PROJECT_ID,
    uid: before.uid,
    action: apply ? 'APPLY' : 'DRY_RUN',
    existingClaimNames: Object.keys(claims).sort(),
    alreadyConfigured: current === 'authenticated',
    newClaimNames: Object.keys(after).sort(),
    note: 'QC operational role remains in Firestore users/{uid}; ID token must refresh after update.',
  }, null, 2));
  if (!apply) {
    console.log('No changes made. To proceed, run with --apply and CONFIRM_FIREBASE_CLAIM_WRITE=form-qc-unm.');
    process.exit(0);
  }
  if (current === 'authenticated') {
    console.log('No changes needed: user already has the required claim.');
    process.exit(0);
  }
  await auth.setCustomUserClaims(uid, after);
  const verified = await auth.getUser(uid);
  if (verified.customClaims?.role !== 'authenticated') {
    throw new Error('Post-write verification failed.');
  }
  console.log('Verified: role=authenticated is now present on this ONE Firebase Auth user.');
} catch (error) {
  console.error('Operation failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
