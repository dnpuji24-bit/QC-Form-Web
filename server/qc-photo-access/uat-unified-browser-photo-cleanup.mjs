// 11D.5c.3b.2e.3 — exact synthetic browser run cleanup (live UAT Storage only).
// Never called after a failed/ambiguous test. No global listing or mass cleanup.
import assert from 'node:assert/strict'
import {unifiedGuard,unifiedProjectId} from './uat-unified-identity-guard.mjs'
import {guardUnifiedPhotoStorage,unifiedPhotoOrigin,unifiedPhotoBucket,
 unifiedPhotoPath,createUnifiedPhotoSafeFetch} from './uat-unified-private-photo-store.mjs'
import {assessFailedPhotoRun} from './uat-unified-photo-failure-assessment.mjs'


// Inspection only, intentionally separate from cleanupVerifiedBrowserPhotoRun.
// A failed upload may have reached Storage but not the in-memory owned tracker.
// Never infer an empty remote folder from empty process-local sets.
export async function inspectFailedBrowserPhotoRun({adb,store,runId,actorUid}){
 unifiedGuard()
 assert.equal(adb?.projectId,unifiedProjectId,'DEMO_EMULATOR_REQUIRED')
 assert.equal(store?.mode,'supabase-private-uat','REAL_UAT_STORE_REQUIRED')
 assert.equal(store.runId,runId,'RUN_SCOPE_CHANGED')
 assert.equal(store.actorUid,actorUid,'ACTOR_SCOPE_CHANGED')
 assert.match(runId,/^[a-f0-9]{32}$/)
 assert.match(actorUid,/^uat-[a-z0-9-]{1,60}$/)
 const records=await adb.collection('qc_uat_workspaces/cutover/qc_photo_manifests').limit(51).get()
 assert.ok(records.size<=50,'RECOVERY_SCOPE_TOO_LARGE')
 const rows=[]
 for(const doc of records.docs){
  if(!doc.id.startsWith('uat-'+runId+'-'))continue
  const ledger=doc.data()
  // The diagnostic does not trust the active ledger if its audit is missing.
  const revision=ledger?.clientRevision
  const audit=typeof revision==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(revision)?
   (await adb.doc('qc_uat_workspaces/cutover/qc_photo_manifest_audit/'+doc.id+':'+revision).get()).data():null
  rows.push({id:doc.id,ledger,audit})
 }
 return assessFailedPhotoRun({
  runId,actorUid,touched:store.inspectTouched(),owned:store.inspectOwned(),ledgerPairs:rows
 })
}

export async function cleanupVerifiedBrowserPhotoRun({adb,store,runId,actorUid}){
 unifiedGuard()
 guardUnifiedPhotoStorage()
 assert.equal(adb?.projectId,unifiedProjectId,'DEMO_EMULATOR_REQUIRED')
 assert.equal(store?.mode,'supabase-private-uat','REAL_UAT_STORE_REQUIRED')
 assert.equal(store.runId,runId,'RUN_SCOPE_CHANGED')
 assert.equal(store.actorUid,actorUid,'ACTOR_SCOPE_CHANGED')
 assert.match(runId,/^[0-9a-f]{32}$/)
 assert.match(actorUid,/^uat-[a-z0-9-]{1,60}$/)
 const touched=store.inspectTouched().sort(),owned=store.inspectOwned().sort()
 assert.deepEqual(touched,owned,'UNACKNOWLEDGED_UAT_PATHS_NEED_MANUAL_RECONCILIATION')
 assert.equal(owned.length,4,'FOUR_SYNTHETIC_BROWSER_PHOTOS_EXPECTED')
 const expected=new RegExp('^'+actorUid+'/qc/qc-v2-uat-'+runId+'-[a-z0-9]{1,16}/[a-f0-9]{24}_[a-f0-9]{64}\\.(?:png|jpg|webp)$')
 const ledgerDocs=await adb.collection('qc_uat_workspaces/cutover/qc_photo_manifests').get()
 assert.equal(ledgerDocs.size,2,'TWO_COMMITTED_QC_MANIFESTS_REQUIRED')
 const committed=[]
 for(const doc of ledgerDocs.docs){
  const ledger=doc.data()
  assert.equal(ledger?.testOnly,true)
  assert.equal(ledger?.storageMode,'supabase-private-uat')
  assert.equal(ledger?.bucket,unifiedPhotoBucket)
  assert.equal(ledger?.ownerUid,actorUid)
  assert.equal(ledger?.recordId,doc.id)
  assert.equal(ledger?.fullRecordId,'qc-v2-'+doc.id)
  assert.equal(ledger?.jobId?.startsWith('uat-job-'),true)
  const audit=await adb.doc('qc_uat_workspaces/cutover/qc_photo_manifest_audit/'+doc.id+':'+ledger.clientRevision).get()
  assert.deepEqual(audit.data(),ledger,'PHOTO_LEDGER_AUDIT_MISMATCH')
  for(const ref of Object.values(ledger.manifest??{})){
   const p=unifiedPhotoPath(runId,actorUid,ref)
   assert.match(p,expected,'UNEXPECTED_SYNTHETIC_PATH')
   committed.push(p)
  }
 }
 assert.deepEqual(committed.sort(),owned,'RUN_OBJECTS_NOT_EXACTLY_COMMITTED')
 const {createClient}=await import('@supabase/supabase-js')
 const client=createClient(unifiedPhotoOrigin,process.env.QC_UAT_STORAGE_SECRET,{
  auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},
  global:{fetch:createUnifiedPhotoSafeFetch()}
 })
 const storage=client.storage.from(unifiedPhotoBucket)
 const dirs=new Map()
 for(const p of owned){
  const split=p.lastIndexOf('/'),dir=p.slice(0,split),name=p.slice(split+1)
  if(!dirs.has(dir))dirs.set(dir,[])
  dirs.get(dir).push(name)
 }
 for(const [dir,names] of dirs){
  const reply=await storage.list(dir,{limit:10,offset:0})
  assert.ok(!reply.error&&Array.isArray(reply.data),'RUN_LIST_FAILED')
  assert.deepEqual(reply.data.map(x=>x.name).sort(),names.sort(),'UNEXPECTED_OBJECT_IN_RUN_DIR')
 }
 const reply=await storage.remove(owned)
 assert.ok(!reply.error&&Array.isArray(reply.data)&&reply.data.length===owned.length,
  'RUN_CLEANUP_FAILED_NEEDS_MANUAL_REVIEW')
 for(const dir of dirs.keys()){
  const result=await storage.list(dir,{limit:10,offset:0})
  assert.ok(!result.error&&Array.isArray(result.data)&&result.data.length===0,
   'RUN_POST_CLEANUP_NOT_EMPTY')
 }
 console.log('PASS: 4 exactly committed synthetic UAT photo objects removed; scoped run directories empty')
}
