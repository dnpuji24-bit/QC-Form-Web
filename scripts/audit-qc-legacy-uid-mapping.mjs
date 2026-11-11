/**
 * Read-only UID mapping and user-status audit for QC legacy records.
 * Emits counts only. NO document identifiers, user names or photo paths.
 * Does not write or make recommendations to auto-migrate records.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT = 'form-qc-unm'
if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Production schema audit cannot run against an emulator.')
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT) throw new Error('Active Google Cloud project must be form-qc-unm.')
if (!process.argv.includes('--read-only-confirmed')) {
  console.error('No reads performed. Pass --read-only-confirmed to audit counts.')
  process.exit(2)
}
initializeApp({ projectId: PROJECT, credential: applicationDefault() })
const db = getFirestore()
const normalize = v => typeof v === 'string' ? v.trim().toLowerCase() : ''
const matchesUidShape = v => typeof v === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(v)
const usernames = new Map()
const users = { total: 0, activeTrue: 0, activeFalse: 0, activeMissing: 0, approvedWithActiveTrue: 0, approvedWithActiveFalse: 0, approvedWithActiveMissing: 0, otherStatuses: 0, duplicateUsernameGroups: 0, validDocUidShape: 0 }
let last
do {
  let q = db.collection('users').orderBy('__name__').limit(200)
  if (last) q = q.startAfter(last)
  const page = await q.get()
  for (const snap of page.docs) {
    const user = snap.data()
    users.total++
    if (matchesUidShape(snap.id)) users.validDocUidShape++
    const approved = normalize(user.status) === 'approved'
    if (!approved) users.otherStatuses++
    const flag = user.active === true ? 'True' : user.active === false ? 'False' : 'Missing'
    users['active' + flag]++
    if (approved) users['approvedWithActive' + flag]++
    const username = normalize(user.username)
    if (username) {
      const existing = usernames.get(username) || []
      existing.push({ uid: snap.id, approved, active: user.active, validUid: matchesUidShape(snap.id) })
      usernames.set(username, existing)
    }
  }
  last = page.docs.at(-1)
  if (page.size < 200) break
} while (last)
users.duplicateUsernameGroups = [...usernames.values()].filter(x => x.length > 1).length

const qc = { total: 0, uniqueUsernameMatch: 0, noUsernameMatch: 0, ambiguousUsernameMatch: 0,
  uniqueMatchApproved: 0, uniqueMatchActiveTrue: 0, uniqueMatchApprovedMissingActiveFlag: 0,
  uniqueMatchWithoutValidUid: 0, alreadyOwnerUid: 0, missingRevision: 0,
  noInputtedBy: 0 }
last = undefined
do {
  let q = db.collection('qc_records').orderBy('__name__').limit(250)
  if (last) q = q.startAfter(last)
  const page = await q.get()
  for (const snap of page.docs) {
    const data = snap.data()
    qc.total++
    if (normalize(data.ownerUid)) qc.alreadyOwnerUid++
    if (!normalize(data.clientRevision)) qc.missingRevision++
    const username = normalize(data.inputtedBy)
    if (!username) { qc.noInputtedBy++; continue }
    const candidates = usernames.get(username) || []
    if (!candidates.length) qc.noUsernameMatch++
    else if (candidates.length > 1) qc.ambiguousUsernameMatch++
    else {
      qc.uniqueUsernameMatch++
      if (candidates[0].approved) qc.uniqueMatchApproved++
      if (candidates[0].active === true) qc.uniqueMatchActiveTrue++
      if (candidates[0].approved && candidates[0].active === undefined) qc.uniqueMatchApprovedMissingActiveFlag++
      if (!candidates[0].validUid) qc.uniqueMatchWithoutValidUid++
    }
  }
  last = page.docs.at(-1)
  if (page.size < 250) break
} while (last)
console.log('READ-ONLY LEGACY UID MATCHING AUDIT — COUNTS ONLY')
console.log(JSON.stringify({ project: PROJECT, users, qc, note: 'Unique username match is evidence for manual verification, NOT proof of Firebase Auth ownership. No writes performed.' }, null, 2))
