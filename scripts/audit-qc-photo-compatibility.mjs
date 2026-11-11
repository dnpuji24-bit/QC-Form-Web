/**
 * READ-ONLY production compatibility audit for QC photo migration.
 * Loads aggregate counts only; prints no names, emails, UIDs, content, or photo URLs.
 * Never calls set/update/delete, and never creates Supabase objects.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT = 'form-qc-unm'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT &&
    process.env.FIREBASE_PROJECT_ID !== PROJECT) {
  throw new Error('Unexpected GCP project. Switch Cloud Shell to form-qc-unm for this audit.')
}
if (process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('This script audits production compatibility, not the emulator.')
}
if (!process.argv.includes('--read-only-confirmed')) {
  console.error('No queries performed. To run this read-only audit, pass --read-only-confirmed.')
  process.exit(2)
}
initializeApp({ credential: applicationDefault(), projectId: PROJECT })
const db = getFirestore()
const expectedKeys = ['qc_records', 'qc_spraying', 'qc_fertilizer']
const stats = {
  scannedQcRecords: 0, missingOwnerUid: 0, missingClientRevision: 0,
  missingFormType: 0, invalidFormType: 0, missingInputtedBy: 0,
  withAnyDriveReference: 0, withHoldIntervals: 0,
  missingBothOwnerAndRevision: 0,
  withSupabasePhotoRefs: 0,
  scannedUsers: 0, inactiveOrMissingActive: 0, statusApproved: 0,
  scannedRoleTemplates: 0, missingQcRecordsPermission: 0,
  unsupportedQcRecordsPermission: 0,
}
function str(v) { return typeof v === 'string' ? v.trim() : '' }
function hasText(v) { return str(v).length > 0 }
async function inspectQc() {
  let last
  while (stats.scannedQcRecords < 3000) {
    let query = db.collection('qc_records').orderBy('__name__').limit(250)
    if (last) query = query.startAfter(last)
    const page = await query.get()
    if (page.empty) break
    for (const snap of page.docs) {
      const data = snap.data()
      stats.scannedQcRecords++
      const ownerMissing = !hasText(data.ownerUid)
      const revisionMissing = !hasText(data.clientRevision)
      if (ownerMissing) stats.missingOwnerUid++
      if (revisionMissing) stats.missingClientRevision++
      if (ownerMissing && revisionMissing) stats.missingBothOwnerAndRevision++
      if (!hasText(data.inputtedBy)) stats.missingInputtedBy++
      if (!hasText(data.formType)) stats.missingFormType++
      else if (!['spray', 'fertilizer'].includes(data.formType)) stats.invalidFormType++
      if (hasText(data.photoDriveUrl) || hasText(data.scanReportDriveUrl) ||
          (Array.isArray(data.holdIntervals) && data.holdIntervals.some(h => hasText(h?.photoDriveUrl)))) stats.withAnyDriveReference++
      if (Array.isArray(data.holdIntervals) && data.holdIntervals.length > 0) stats.withHoldIntervals++
      if (Array.isArray(data.supabasePhotoRefs) && data.supabasePhotoRefs.length) stats.withSupabasePhotoRefs++
    }
    last = page.docs.at(-1)
    if (page.size < 250) break
  }
}
async function inspectUsers() {
  const page = await db.collection('users').limit(500).get()
  for (const snap of page.docs) {
    const u = snap.data()
    stats.scannedUsers++
    if (u.active !== true) stats.inactiveOrMissingActive++
    if (str(u.status).toUpperCase() === 'APPROVED') stats.statusApproved++
  }
}
async function inspectRoles() {
  const page = await db.collection('role_access').limit(100).get()
  for (const snap of page.docs) {
    const permissions = snap.data().permissions || {}
    stats.scannedRoleTemplates++
    if (!Object.hasOwn(permissions, 'qc_records')) stats.missingQcRecordsPermission++
    if (!['none','view','edit'].includes(permissions.qc_records)) stats.unsupportedQcRecordsPermission++
  }
}
await Promise.all([inspectQc(), inspectUsers(), inspectRoles()])
console.log('READ-ONLY QC PHOTO COMPATIBILITY AUDIT')
console.log(JSON.stringify({ project: PROJECT, ...stats,
  scannedQcCap: 3000,
  note: 'Counts only. No documents were modified, and no personally identifying data was printed.' }, null, 2))
console.log('Follow-up: review missing ownerUid/clientRevision and user active flags before enabling signed photo URLs.')
