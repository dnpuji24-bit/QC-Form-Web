/**
 * Read-only Firebase Auth consistency audit for legacy QC migration.
 * Counts only: no emails, UIDs, usernames or document IDs are printed.
 * Firestore records and Auth users are NEVER modified.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const PROJECT = 'form-qc-unm'
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('This audit is for real Firebase read-only verification.')
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT) throw new Error('Wrong active Google Cloud project.')
if (!process.argv.includes('--read-only-confirmed')) {
  console.error('No requests performed. Supply --read-only-confirmed to run this read-only aggregate audit.')
  process.exit(2)
}
initializeApp({ projectId: PROJECT, credential: applicationDefault() })
const db = getFirestore()
const auth = getAuth()
const norm = x => typeof x === 'string' ? x.trim().toLowerCase() : ''
const stats = {
  usersInspected: 0, usersFoundInFirebaseAuth: 0, usersMissingFromFirebaseAuth: 0,
  usersDisabledInAuth: 0, usersEmailMismatch: 0, usersWithoutEmailToCompare: 0,
  uidLookupErrors: 0,
  qcInspected: 0, qcWithSingleFirestoreUsernameMatch: 0,
  qcWithVerifiedFirebaseAuthIdentity: 0, qcWithNonverifiedAuthIdentity: 0,
  qcWithoutUsernameMatch: 0, qcAmbiguousMatch: 0,
  qcWithNoInputtedBy: 0,
}
const mappings = new Map()
let cursor
do {
  let q = db.collection('users').orderBy('__name__').limit(100)
  if (cursor) q = q.startAfter(cursor)
  const page = await q.get()
  if (page.empty) break
  for (const doc of page.docs) {
    const value = doc.data()
    stats.usersInspected++
    let authState = 'unverified'
    try {
      const account = await auth.getUser(doc.id)
      stats.usersFoundInFirebaseAuth++
      if (account.disabled) { stats.usersDisabledInAuth++; authState = 'disabled' }
      else authState = 'enabled'
      if (norm(value.email) && norm(account.email)) {
        if (norm(value.email) !== norm(account.email)) {
          stats.usersEmailMismatch++; authState = 'email_mismatch'
        }
      } else stats.usersWithoutEmailToCompare++
    } catch (error) {
      if (error?.code === 'auth/user-not-found') {
        stats.usersMissingFromFirebaseAuth++
        authState = 'missing'
      } else {
        stats.uidLookupErrors++
        authState = 'lookup_error'
      }
    }
    const username = norm(value.username)
    if (username) {
      const arr = mappings.get(username) || []
      arr.push({ authState, approved: norm(value.status) === 'approved', active: value.active === true })
      mappings.set(username, arr)
    }
  }
  cursor = page.docs.at(-1)
  if (page.size < 100) break
} while (cursor)
cursor = undefined
do {
  let q = db.collection('qc_records').orderBy('__name__').limit(250)
  if (cursor) q = q.startAfter(cursor)
  const page = await q.get()
  if (page.empty) break
  for (const doc of page.docs) {
    const qc = doc.data()
    stats.qcInspected++
    const username = norm(qc.inputtedBy)
    if (!username) { stats.qcWithNoInputtedBy++; continue }
    const users = mappings.get(username) || []
    if (!users.length) stats.qcWithoutUsernameMatch++
    else if (users.length > 1) stats.qcAmbiguousMatch++
    else {
      stats.qcWithSingleFirestoreUsernameMatch++
      const user = users[0]
      if (user.authState === 'enabled' && user.approved && user.active) stats.qcWithVerifiedFirebaseAuthIdentity++
      else stats.qcWithNonverifiedAuthIdentity++
    }
  }
  cursor = page.docs.at(-1)
  if (page.size < 250) break
} while (cursor)
console.log('READ-ONLY FIREBASE AUTH UID CONSISTENCY AUDIT')
console.log(JSON.stringify({ project: PROJECT, stats,
  caveat: 'Existing username matches and Firebase Auth existence are not proof that historical QC records were entered by that specific individual. Manual provenance review is still needed.',
  writes: 0 }, null, 2))
if (stats.uidLookupErrors > 0) process.exitCode = 1
