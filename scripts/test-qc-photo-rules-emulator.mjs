import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'

const projectId = 'demo-qc-photo-test'
const host = process.env.FIRESTORE_EMULATOR_HOST || ''
if (process.env.FIREBASE_PROJECT_ID !== projectId || process.env.GCLOUD_PROJECT !== projectId || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) {
  console.error('SAFETY STOP: this test only runs against localhost Firestore Emulator and the demo project.')
  process.exit(2)
}
const [emulatorHost, emulatorPort] = host.split(':')
const env = await initializeTestEnvironment({ projectId, firestore: { host: emulatorHost, port: Number(emulatorPort) } })
const uid = {
  owner: 'test-owner',
  admin: 'test-admin',
  asisten: 'test-asisten',
  manager: 'test-manager',
  spray: 'test-spray-mandor',
  fertilizer: 'test-fert-mandor',
  otherSpray: 'test-other-spray',
  viewer: 'test-viewer',
  inactive: 'test-inactive',
}
const usernames = Object.fromEntries(Object.keys(uid).map(key => [key, 'username_' + key]))
const role = { owner: 'owner', admin: 'admin', asisten: 'asisten', manager: 'manager', spray: 'mandor_spraying', fertilizer: 'mandor_fertilizer', otherSpray: 'mandor_spraying', viewer: 'pengunjung', inactive: 'mandor_spraying' }
const recordId = 'qc-security-spray-001'
const fertilizerRecordId = 'qc-security-fertilizer-001'
const rev = 'revision001'
const ref = (db, rec, photoId) => doc(db, 'qc_photo_metadata', rec, 'photos', photoId)
const photo = (rec, ownerUid, photoId, kind = 'main', overrides = {}) => ({
  photoId, qcRecordId: rec, ownerUid, recordRevision: rev,
  provider: 'supabase', bucket: 'qc-photos-test',
  objectPath: `${ownerUid}/qc/${rec}/${photoId}.jpg`,
  contentType: 'image/jpeg', kind, uploadedAt: '2026-11-11T00:00:00Z',
  ...(kind === 'hold' ? { holdId: 'hold001' } : {}), ...overrides,
})
let count = 0
async function pass(label, promise) { await assertSucceeds(promise); console.log('PASS:', label); count++ }
async function deny(label, promise) { await assertFails(promise); console.log('PASS:', label, '(denied)'); count++ }
try {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore()
    for (const key of Object.keys(uid)) {
      await setDoc(doc(db, 'users', uid[key]), { username: usernames[key], role: role[key], active: key !== 'inactive' })
    }
    const rolePermissions = {
      owner: { qc_records: 'edit', qc_spraying: 'edit', qc_fertilizer: 'edit' },
      admin: { qc_records: 'edit', qc_spraying: 'view', qc_fertilizer: 'view' },
      asisten: { qc_records: 'edit', qc_spraying: 'edit', qc_fertilizer: 'edit' },
      manager: { qc_records: 'view', qc_spraying: 'view', qc_fertilizer: 'view' },
      mandor_spraying: { qc_records: 'view', qc_spraying: 'edit', qc_fertilizer: 'none' },
      mandor_fertilizer: { qc_records: 'view', qc_spraying: 'none', qc_fertilizer: 'edit' },
      pengunjung: { qc_records: 'none', qc_spraying: 'none', qc_fertilizer: 'none' },
    }
    for (const [roleName, permissions] of Object.entries(rolePermissions)) {
      await setDoc(doc(db, 'role_access', roleName), { role: roleName, permissions })
    }
    await setDoc(doc(db, 'qc_records', recordId), {
      id: recordId, ownerUid: uid.spray, inputtedBy: usernames.spray,
      clientRevision: rev, formType: 'spray', saveType: 'ready',
    })
    await setDoc(doc(db, 'qc_records', fertilizerRecordId), {
      id: fertilizerRecordId, ownerUid: uid.fertilizer, inputtedBy: usernames.fertilizer,
      clientRevision: rev, formType: 'fertilizer', saveType: 'ready',
    })
  })
  const db = Object.fromEntries(Object.keys(uid).map(key => [key, env.authenticatedContext(uid[key]).firestore()]))
  const anon = env.unauthenticatedContext().firestore()
  await pass('spray mandor creates own main photo', setDoc(ref(db.spray, recordId, 'main001'), photo(recordId, uid.spray, 'main001')))
  await pass('spray mandor creates HOLD photo', setDoc(ref(db.spray, recordId, 'hold001'), photo(recordId, uid.spray, 'hold001', 'hold')))
  await pass('spray mandor creates scan photo', setDoc(ref(db.spray, recordId, 'scan001'), photo(recordId, uid.spray, 'scan001', 'scan')))
  await pass('fertilizer mandor creates own photo', setDoc(ref(db.fertilizer, fertilizerRecordId, 'fert001'), photo(fertilizerRecordId, uid.fertilizer, 'fert001')))
  await pass('mandor can read own metadata', getDoc(ref(db.spray, recordId, 'main001')))
  await pass('owner reads metadata', getDoc(ref(db.owner, recordId, 'main001')))
  await pass('admin reads metadata', getDoc(ref(db.admin, recordId, 'main001')))
  await pass('asisten reads metadata', getDoc(ref(db.asisten, recordId, 'main001')))
  await pass('manager reads metadata when granted view', getDoc(ref(db.manager, recordId, 'main001')))
  await pass('owner lists photos for QC', getDocs(collection(db.owner, 'qc_photo_metadata', recordId, 'photos')))
  await deny('other mandor cannot read', getDoc(ref(db.otherSpray, recordId, 'main001')))
  await deny('fertilizer mandor cannot read spray', getDoc(ref(db.fertilizer, recordId, 'main001')))
  await deny('viewer has no access', getDoc(ref(db.viewer, recordId, 'main001')))
  await deny('inactive user cannot read', getDoc(ref(db.inactive, recordId, 'main001')))
  await deny('anonymous cannot read', getDoc(ref(anon, recordId, 'main001')))
  // Owner changes live role configuration: existing users must immediately obey it.
  await env.withSecurityRulesDisabled(async ctx => {
    await updateDoc(doc(ctx.firestore(), 'role_access', 'admin'), { 'permissions.qc_records': 'none' })
    await updateDoc(doc(ctx.firestore(), 'role_access', 'mandor_spraying'), { 'permissions.qc_spraying': 'view' })
  })
  await deny('admin loses metadata view after permission revoked', getDoc(ref(db.admin, recordId, 'main001')))
  await deny('mandor cannot create when spraying changes from edit to view', setDoc(ref(db.spray, recordId, 'revokedcreate'), photo(recordId, uid.spray, 'revokedcreate')))
  await pass('mandor can still read with Data QC view permission', getDoc(ref(db.spray, recordId, 'main001')))
  await env.withSecurityRulesDisabled(async ctx => {
    await updateDoc(doc(ctx.firestore(), 'role_access', 'admin'), { 'permissions.qc_records': 'edit' })
    await updateDoc(doc(ctx.firestore(), 'role_access', 'mandor_spraying'), { 'permissions.qc_spraying': 'edit' })
  })
  await pass('admin can read again after Owner grants permission', getDoc(ref(db.admin, recordId, 'main001')))
  await pass('mandor can create again after restoring edit permission', setDoc(ref(db.spray, recordId, 'restoredcreate'), photo(recordId, uid.spray, 'restoredcreate')))

  await deny('other mandor cannot create on record', setDoc(ref(db.otherSpray, recordId, 'wrong001'), photo(recordId, uid.otherSpray, 'wrong001')))
  await deny('admin cannot forge a mandor photo', setDoc(ref(db.admin, recordId, 'admin001'), photo(recordId, uid.admin, 'admin001')))
  await deny('owner cannot forge a mandor photo', setDoc(ref(db.owner, recordId, 'owner001'), photo(recordId, uid.owner, 'owner001')))
  await deny('anonymous cannot create', setDoc(ref(anon, recordId, 'anon001'), photo(recordId, uid.spray, 'anon001')))
  await deny('inactive mandor cannot create', setDoc(ref(db.inactive, recordId, 'inactive001'), photo(recordId, uid.inactive, 'inactive001')))
  await deny('wrong bucket rejected', setDoc(ref(db.spray, recordId, 'badbucket'), photo(recordId, uid.spray, 'badbucket', 'main', { bucket: 'public-photos' })))
  await deny('cross-UID path rejected', setDoc(ref(db.spray, recordId, 'badpath'), photo(recordId, uid.spray, 'badpath', 'main', { objectPath: `${uid.owner}/qc/${recordId}/badpath.jpg` })))
  await deny('stale revision rejected', setDoc(ref(db.spray, recordId, 'badrev'), photo(recordId, uid.spray, 'badrev', 'main', { recordRevision: 'oldrevision' })))
  await deny('unexpected sensitive field rejected', setDoc(ref(db.spray, recordId, 'badfield'), photo(recordId, uid.spray, 'badfield', 'main', { issueNumber: 'forged' })))
  await deny('HOLD must have holdId', setDoc(ref(db.spray, recordId, 'badhold'), (({ holdId, ...withoutHoldId }) => withoutHoldId)(photo(recordId, uid.spray, 'badhold', 'hold'))))
  await deny('main cannot inject holdId', setDoc(ref(db.spray, recordId, 'badmain'), photo(recordId, uid.spray, 'badmain', 'main', { holdId: 'hold001' })))
  await deny('no updates after create', updateDoc(ref(db.spray, recordId, 'main001'), { objectPath: `${uid.spray}/qc/${recordId}/different.jpg` }))
  await deny('no deletion', deleteDoc(ref(db.owner, recordId, 'main001')))
  await env.withSecurityRulesDisabled(async ctx => {
    await updateDoc(doc(ctx.firestore(), 'qc_records', recordId), { clientRevision: 'revision002' })
  })
  await deny('edited QC invalidates old revision', setDoc(ref(db.spray, recordId, 'late001'), photo(recordId, uid.spray, 'late001')))
  await pass('new revision permitted', setDoc(ref(db.spray, recordId, 'new001'), photo(recordId, uid.spray, 'new001', 'main', { recordRevision: 'revision002' })))
  await deny('client cannot modify QC records in test config', updateDoc(doc(db.owner, 'qc_records', recordId), { saveType: 'uploaded' }))
  console.log(`SUCCESS: ${count} Firestore Client Security Rules checks passed (emulator only).`)
} catch (error) {
  console.error('FAILED: photo security test:', error)
  process.exitCode = 1
} finally {
  await env.cleanup()
}
