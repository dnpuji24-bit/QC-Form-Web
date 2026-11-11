/**
 * Read-only production migration manifest.
 * Writes local PRIVATE files in Cloud Shell only. No Firestore writes.
 * Never upload the detailed file to GitHub or share it publicly.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { mkdir, writeFile, chmod } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const PROJECT = 'form-qc-unm'
const target = resolve(process.env.HOME || '.', 'qc-migration-private')
if (!process.argv.includes('--read-only-confirmed')) {
  console.error('No reads performed. Supply --read-only-confirmed.'); process.exit(2)
}
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT) throw new Error('Wrong active Google project')
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Unexpected emulator')
const app = initializeApp({ projectId: PROJECT, credential: applicationDefault() })
const db = getFirestore(app), auth = getAuth(app)
const norm = v => typeof v === 'string' ? v.trim().toLowerCase() : ''
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const identities = new Map()
let last
do {
  let query = db.collection('users').orderBy('__name__').limit(100)
  if (last) query = query.startAfter(last)
  const snap = await query.get()
  for (const doc of snap.docs) {
    const user = doc.data(), username = norm(user.username)
    if (!username) continue
    let verified = false
    try {
      const account = await auth.getUser(doc.id)
      verified = !account.disabled && norm(account.email) === norm(user.email) && !!norm(account.email) &&
        user.active === true && norm(user.status) === 'approved'
    } catch { verified = false }
    const existing = identities.get(username) || []
    existing.push({ uid: doc.id, verified })
    identities.set(username, existing)
  }
  last = snap.docs.at(-1)
  if (snap.size < 100) break
} while (last)

const rows = [], summary = { total: 0, legacyDrivePreserved: 0, holdRecordCount: 0,
  verifiedCandidate: 0, needsReview: 0, existingOwnerUid: 0, missingRevision: 0,
  missingUsername: 0, noMatch: 0, ambiguous: 0, authUnverified: 0 }
last = undefined
do {
  let query = db.collection('qc_records').orderBy('__name__').limit(250)
  if (last) query = query.startAfter(last)
  const snap = await query.get()
  for (const doc of snap.docs) {
    const record = doc.data(), username = norm(record.inputtedBy)
    const matches = identities.get(username) || []
    const missingRevision = !norm(record.clientRevision)
    const existingOwner = !!norm(record.ownerUid)
    const existingDrive = !!norm(record.photoDriveUrl) || !!norm(record.scanReportDriveUrl) ||
      (Array.isArray(record.holdIntervals) && record.holdIntervals.some(h => norm(h?.photoDriveUrl)))
    if (existingDrive) summary.legacyDrivePreserved++
    if (Array.isArray(record.holdIntervals) && record.holdIntervals.length) summary.holdRecordCount++
    if (missingRevision) summary.missingRevision++
    if (existingOwner) summary.existingOwnerUid++
    summary.total++
    let category = 'VERIFIED_CANDIDATE', reason = 'PROVENANCE_REVIEW_REQUIRED'
    if (!username) { category = 'REVIEW'; reason = 'MISSING_USERNAME'; summary.missingUsername++ }
    else if (!matches.length) { category = 'REVIEW'; reason = 'NO_USER_MATCH'; summary.noMatch++ }
    else if (matches.length > 1) { category = 'REVIEW'; reason = 'AMBIGUOUS_MATCH'; summary.ambiguous++ }
    else if (!matches[0].verified) { category = 'REVIEW'; reason = 'AUTH_NOT_VERIFIED'; summary.authUnverified++ }
    if (category === 'REVIEW') summary.needsReview++
    else summary.verifiedCandidate++
    rows.push({
      recordId: doc.id,
      snapshotHash: fingerprint({
        id: doc.id, ownerUid: record.ownerUid ?? null,
        clientRevision: record.clientRevision ?? null, inputtedBy: record.inputtedBy ?? null,
        updatedAt: record.updatedAt?.toDate?.()?.toISOString?.() || String(record.updatedAt || ''),
      }),
      category, reason, revisionPresent: !missingRevision,
      existingOwnerUid: existingOwner ? String(record.ownerUid) : null,
      candidateUid: matches.length === 1 && matches[0].verified ? matches[0].uid : null,
      preserveLegacyDrive: existingDrive,
      hasHoldIntervals: Array.isArray(record.holdIntervals) && !!record.holdIntervals.length,
      proposedAction: 'NO_WRITE_LEGACY_FALLBACK',
    })
  }
  last = snap.docs.at(-1)
  if (snap.size < 250) break
} while (last)

await mkdir(target, { recursive: true, mode: 0o700 })
await chmod(target, 0o700)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const reportFile = join(target, `qc-legacy-manifest-${stamp}.json`)
const summaryFile = join(target, `qc-legacy-summary-${stamp}.json`)
const report = { generatedAt: new Date().toISOString(), project: PROJECT,
  mode: 'READ_ONLY', legacyAction: 'KEEP_GOOGLE_DRIVE_REFERENCES',
  notes: 'Sensitive record IDs and candidate UIDs: keep locally. Candidates are not proof of historical authorship.',
  records: rows }
await writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' })
await writeFile(summaryFile, JSON.stringify({ project: PROJECT, ...summary, action: 'No legacy data migration required for new Supabase photos', writes: 0 }, null, 2), { mode: 0o600, flag: 'wx' })
console.log(JSON.stringify({ ...summary, writes: 0, outputDirectory: target, manifestFile: reportFile, summaryFile }, null, 2))
console.log('DO NOT upload the detailed manifest to GitHub. It contains QC IDs and UID candidates.')
