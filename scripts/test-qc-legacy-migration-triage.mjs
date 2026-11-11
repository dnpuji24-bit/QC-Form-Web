import assert from 'node:assert/strict'
import { classifyLegacyQc, summarizeLegacyMigration } from './lib/qcLegacyMigrationTriage.mjs'

const user = { uid: 'firebaseUid001', username: 'mandor01', status: 'APPROVED', active: true }
const record = { id: 'qc001', inputtedBy: 'MANDOR01', clientRevision: 'rev01' }
const auth = { state: 'verified', uid: user.uid }
const cases = [
  ['good username and Auth match still needs manual provenance', record, [user], auth, 'MANUAL_PROVENANCE_REQUIRED'],
  ['missing username', { ...record, inputtedBy: '' }, [user], auth, 'MISSING_USERNAME'],
  ['no matching user', record, [], auth, 'NO_USERNAME_MATCH'],
  ['ambiguous username', record, [user, { ...user, uid: 'otherUid' }], auth, 'AMBIGUOUS_USERNAME'],
  ['inactive account', record, [{ ...user, active: false }], auth, 'ACCOUNT_NOT_APPROVED_ACTIVE'],
  ['pending account', record, [{ ...user, status: 'PENDING' }], auth, 'ACCOUNT_NOT_APPROVED_ACTIVE'],
  ['Auth not verified', record, [user], { state: 'unverified' }, 'FIREBASE_AUTH_NOT_VERIFIED'],
  ['Auth UID mismatch', record, [user], { state: 'verified', uid: 'otherUid' }, 'FIREBASE_AUTH_NOT_VERIFIED'],
  ['missing revision', { ...record, clientRevision: undefined }, [user], auth, 'REVISION_MISSING'],
  ['record with owner UID is never remapped', { ...record, ownerUid: 'existingUid' }, [user], auth, 'EXISTING_OWNER_UID'],
  ['invalid record', null, [user], auth, 'INVALID_RECORD'],
]
const results = []
for (const [name, qc, matches, verify, expected] of cases) {
  const decision = classifyLegacyQc(qc, matches, verify)
  assert.equal(decision.reason, expected, name)
  assert.ok(!Object.hasOwn(decision, 'ownerUid'), 'No write-ready UID must be returned')
  results.push(decision)
  console.log('PASS:', name)
}
const summary = summarizeLegacyMigration(results)
assert.equal(summary.total, cases.length)
assert.equal(summary.MANUAL_PROVENANCE_REQUIRED, 1)
assert.equal(summary.ALREADY_MAPPED, 1)
assert.equal(summary.BLOCKED, 1)
assert.equal(summary.REVIEW, 8)
console.log('SUCCESS: 11 fail-closed QC migration classification tests passed (no network, no writes).')
