// Stage 18C: aggregate-only, read-only production preflight. No Firebase writes.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import assert from 'node:assert/strict'
import { prepareLegacyAudit } from '../server/qc-photo-access/qcLegacyAudit.mjs'

const PROJECT = 'form-qc-unm'
const COLLECTIONS = ['qc_records','users','role_access','qc_legacy_activity_logs','qc_native_name_requests','qc_native_name_pending','qc_admin_audit','qc_photo_metadata']
const hash = v => createHash('sha256').update(v).digest('hex')

function reconcilePending(requests, locks) {
  const pending = requests.filter(r => r.data.status === 'pending')
  const requestById = new Map(pending.map(r => [r.id, r.data]))
  const lockByUid = new Map(locks.map(r => [r.id, r.data]))
  const seenUids = new Set()
  let duplicatePending = 0, missingOrWrongLock = 0, orphanOrWrongLock = 0, invalidStatus = 0
  for (const r of requests) {
    if (!['pending','approved','rejected'].includes(r.data.status)) invalidStatus++
  }
  for (const r of pending) {
    const uid = r.data.uid
    if (seenUids.has(uid)) duplicatePending++
    seenUids.add(uid)
    if (typeof uid !== 'string' || !uid || lockByUid.get(uid)?.requestId !== r.id) missingOrWrongLock++
  }
  for (const l of locks) {
    if (requestById.get(l.data.requestId)?.uid !== l.id) orphanOrWrongLock++
  }
  return { pending: pending.length, locks: locks.length, duplicatePending, missingOrWrongLock, orphanOrWrongLock, invalidStatus }
}

function reconcileHistorical(expected, actual, sourceKey) {
  const expectedById = new Map(expected.map(r => [r.id, r.data]))
  const actualById = new Map(actual.map(r => [r.id, r.data]))
  let unchanged = 0, missing = 0, conflicts = 0, unexpectedSourceRows = 0
  for (const [id, data] of expectedById) {
    if (!actualById.has(id)) missing++
    else if (isDeepStrictEqual(data, actualById.get(id))) unchanged++
    else conflicts++
  }
  for (const [id, data] of actualById) {
    if (data.sourceKey === sourceKey && !expectedById.has(id)) unexpectedSourceRows++
  }
  return { expected: expected.length, unchanged, missing, conflicts, unexpectedSourceRows }
}

function selfTest() {
  const pending = [{id:'r1',data:{uid:'u1',status:'pending'}}]
  const lock = [{id:'u1',data:{requestId:'r1'}}]
  assert.deepEqual(reconcilePending(pending,lock),{pending:1,locks:1,duplicatePending:0,missingOrWrongLock:0,orphanOrWrongLock:0,invalidStatus:0})
  assert.equal(reconcilePending(pending,[]).missingOrWrongLock,1)
  assert.equal(reconcilePending([],lock).orphanOrWrongLock,1)
  assert.equal(reconcilePending([...pending,{id:'r2',data:{uid:'u1',status:'pending'}}],lock).duplicatePending,1)
  assert.equal(reconcilePending([{id:'x',data:{status:'invalid'}}],[]).invalidStatus,1)
  const a={id:'a',data:{sourceKey:'s',sourceHash:'1'}}
  assert.deepEqual(reconcileHistorical([a],[a],'s'),{expected:1,unchanged:1,missing:0,conflicts:0,unexpectedSourceRows:0})
  assert.equal(reconcileHistorical([a],[],'s').missing,1)
  assert.equal(reconcileHistorical([a],[{id:'a',data:{sourceKey:'s',sourceHash:'2'}}],'s').conflicts,1)
  assert.equal(reconcileHistorical([a],[a,{id:'b',data:{sourceKey:'s'}}],'s').unexpectedSourceRows,1)
  assert.equal(reconcileHistorical([a],[a,{id:'b',data:{sourceKey:'other'}}],'s').unexpectedSourceRows,0)
  console.log('SUCCESS: 10 read-only preflight logic checks passed (offline)')
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--self-test') return selfTest()
  if (args[0] !== '--read-only-confirmed' || !(args.length === 1 || (args.length === 3 && args[1] === '--snapshot' && args[2]))) throw Error('USAGE')
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error('EMULATOR_ENVIRONMENT')
  for (const k of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID']) {
    if (process.env[k] && process.env[k] !== PROJECT) throw Error('WRONG_PROJECT')
  }
  // Validate the optional private snapshot before making any network request.
  const snapshot = args.length === 3 ? JSON.parse(readFileSync(args[2],'utf8')) : null
  const prepared = snapshot ? prepareLegacyAudit(snapshot) : null
  const requireAdmin = createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
  const {initializeApp,applicationDefault,deleteApp} = requireAdmin('firebase-admin/app')
  const {getFirestore,FieldPath} = requireAdmin('firebase-admin/firestore')
  const app = initializeApp({credential:applicationDefault(),projectId:PROJECT})
  const db = getFirestore(app)
  // Query pages without writes or output of individual document IDs or personal fields.
  async function scan(query) {
    const result=[]
    let last
    while (true) {
      let pageQuery=query.orderBy(FieldPath.documentId()).limit(200)
      if (last) pageQuery=pageQuery.startAfter(last)
      const page=await pageQuery.get()
      for (const doc of page.docs) result.push({id:doc.id,data:doc.data()})
      if (page.size<200) return result
      last=page.docs.at(-1)
    }
  }
  try {
    const counts = Object.fromEntries(await Promise.all(COLLECTIONS.map(async name=>[name,(await db.collection(name).count().get()).data().count])))
    const [requests,locks] = await Promise.all([
      scan(db.collection('qc_native_name_requests').select('uid','status')),
      scan(db.collection('qc_native_name_pending').select('requestId'))
    ])
    const nativeRequests = reconcilePending(requests,locks)
    let historical = null
    if (prepared) {
      const sourceKey=hash(JSON.stringify([snapshot.sourceId,snapshot.logSheetId]))
      const collection=db.collection('qc_legacy_activity_logs')
      const actual=await scan(collection.where('sourceKey','==',sourceKey))
      const actualIds=new Set(actual.map(r=>r.id))
      // Detect pre-existing expected IDs even when their sourceKey is incorrect.
      const absent=prepared.logs.filter(r=>!actualIds.has(r.id))
      for(let i=0;i<absent.length;i+=100){
        const docs=await db.getAll(...absent.slice(i,i+100).map(r=>collection.doc(r.id)))
        for(const d of docs) if(d.exists) actual.push({id:d.id,data:d.data()})
      }
      historical={...reconcileHistorical(prepared.logs,actual,sourceKey),snapshotSummary:prepared.summary}
    }
    const blockers=[]
    if(nativeRequests.duplicatePending||nativeRequests.missingOrWrongLock||nativeRequests.orphanOrWrongLock||nativeRequests.invalidStatus) blockers.push('NATIVE_REQUEST_INCONSISTENCY')
    if(!historical) blockers.push('REAL_LEGACY_SNAPSHOT_REQUIRED')
    else {
      if(historical.conflicts||historical.unexpectedSourceRows) blockers.push('HISTORICAL_SOURCE_CONFLICT')
      if(historical.missing) blockers.push('HISTORICAL_IMPORT_NOT_COMPLETE')
      if(historical.snapshotSummary.pendingCount) blockers.push('LEGACY_PENDING_REQUESTS')
    }
    console.log(JSON.stringify({project:PROJECT,mode:'production-read-only',counts,nativeRequests,historical,blockers,writes:0,releaseApproved:false},null,2))
    console.log('SUCCESS: Stage 18C read-only preflight completed; this is not deployment approval')
  } finally { await deleteApp(app) }
}
main().catch(e=>{
  const safe=['USAGE','EMULATOR_ENVIRONMENT','WRONG_PROJECT','INVALID_LEGACY_AUDIT_SNAPSHOT'].includes(e?.message)?e.message:'PREFLIGHT_FAILED'
  console.error(safe)
  process.exitCode=1
})
