import {createAdminRestEmulator,restServerTimestamp} from '../server/qc-photo-access/adminRestTransactionEmulator.mjs'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const requireAdmin=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
const {initializeApp,deleteApp}=requireAdmin('firebase-admin/app')
const {getFirestore,FieldValue,Timestamp,GeoPoint}=requireAdmin('firebase-admin/firestore')
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing'
import {doc,getDoc,setDoc,deleteDoc} from 'firebase/firestore'
import {readFileSync} from 'node:fs'
import {archiveQc} from '../server/qc-photo-access/qcArchiveCore.mjs'
const projectId='demo-qc-photo-test',host=process.env.FIRESTORE_EMULATOR_HOST||''
if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(host))throw Error('Local demo emulator only')
const [h,p]=host.split(':')
const env=await initializeTestEnvironment({projectId,firestore:{host:h,port:Number(p),rules:readFileSync('firestore.rules','utf8')}})
const app=initializeApp({projectId}),db=getFirestore(app),actor={uid:'archiveowner',email:'owner@example.test'}
const rest=createAdminRestEmulator({host,projectId})
const q=id=>db.collection('qc_records').doc(id),a=id=>db.collection('daily_reports').doc('qcactual_'+id)
const archived=id=>db.collection('qc_archived_records').doc(id),marker=id=>db.collection('qc_archive_markers').doc(id)
const row=id=>({id,ownerUid:'mandor',inputtedBy:'mandor',formType:'spray',saveType:'uploaded',dailyPlanId:'dp1',actualAreaHa:5,clientRevision:'r1',operationalSaveId:'job1',firestoreSaveState:'confirmed',photoUrl:'https://example.test/historical',operationalPhotoManifest:{main:{objectPath:'test-only.jpg'}}})
const actual=id=>({sourceOrigin:'QC',qcRecordId:id,dailyPlanId:'dp1',actualAreaHa:5,inputtedBy:'mandor'})
const run=(id,extra={},who=actor)=>archiveQc({db:rest,actor:who,command:{recordId:id,baseRevision:'r1',reason:'Duplicate verified by Owner',operationId:'op-'+id,...extra},stamp:restServerTimestamp})
let n=0
async function check(label,fn){await fn();n++;console.log('PASS: '+label)}
try{
 await env.clearFirestore()
 await db.collection('users').doc(actor.uid).set({username:actor.uid,email:actor.email,role:'owner',status:'approved',active:true})
 await db.collection('users').doc('manager').set({username:'manager',email:'manager@example.test',role:'manager',status:'approved',active:true})
 await db.collection('users').doc('mandor').set({username:'mandor',role:'mandor_spraying',status:'approved',active:true})
 for(const id of ['archive1','archive2','archive3','archive4']){await q(id).set(row(id));await a(id).set(actual(id))}
 await q('archive5').set({...row('archive5'),operationalSaveId:''})
 await check('non-owner archive denied',()=>assert.rejects(run('archive1',{}, {uid:'manager',email:'manager@example.test'}),/OWNER_REQUIRED/))
 await check('stale revision denied',()=>assert.rejects(run('archive1',{baseRevision:'old'}),/QC_REVISION_CONFLICT/))
 await check('reason required',()=>assert.rejects(run('archive1',{reason:''}),/INVALID_COMMAND/))
 await a('archive2').set({...actual('archive2'),qcRecordId:'unrelated'})
 await check('wrong Actual linkage denied',()=>assert.rejects(run('archive2'),/QC_ACTUAL_LINK_CONFLICT/))
 await db.collection('daily_reports').doc('duplicate-link').set(actual('archive3'))
 await check('multiple Actual references denied',()=>assert.rejects(run('archive3'),/QC_ACTUAL_LINK_CONFLICT/))
 await a('archive4').delete()
 await check('missing expected Actual denied',()=>assert.rejects(run('archive4'),/QC_ACTUAL_LINK_CONFLICT/))
 await check('historical records require manual review',()=>assert.rejects(run('archive5'),/QC_HISTORICAL_REVIEW_REQUIRED/))
 await check('rejected operations leave original documents intact',async()=>{assert.ok((await q('archive1').get()).exists);assert.ok((await a('archive1').get()).exists);assert.ok(!(await marker('archive1').get()).exists)})
 await check('archive commits QC Actual marker and audit together',async()=>{await run('archive1');assert.ok(!(await q('archive1').get()).exists);assert.ok(!(await a('archive1').get()).exists);assert.ok((await marker('archive1').get()).exists);assert.deepEqual((await archived('archive1').get()).data(),row('archive1'));assert.deepEqual((await db.collection('qc_archived_actuals').doc('archive1').get()).data(),actual('archive1'));assert.ok((await db.collection('qc_admin_audit').doc('archive_op-archive1').get()).exists)})
 await check('same operation replay is idempotent',async()=>assert.equal((await run('archive1')).replayed,true))
 await check('different operation cannot archive twice',()=>assert.rejects(run('archive1',{operationId:'another'}),/QC_ALREADY_ARCHIVED/))
 const client=env.authenticatedContext(actor.uid).firestore()
 await check('client cannot delete archive marker',()=>assertFails(deleteDoc(doc(client,'qc_archive_markers','archive1'))))
 await check('client cannot overwrite archived QC',()=>assertFails(setDoc(doc(client,'qc_archived_records','archive1'),row('archive1'))))
 await check('client cannot recreate archived QC with legacy payload',()=>assertFails(setDoc(doc(client,'qc_records','archive1'),{id:'archive1',formType:'spray',inputtedBy:actor.uid})))
 await check('client cannot recreate canonical Actual',()=>assertFails(setDoc(doc(client,'daily_reports','qcactual_archive1'),{sourceOrigin:'manual'})))
 await check('client cannot recreate linked Actual under another ID',()=>assertFails(setDoc(doc(client,'daily_reports','other-actual'),actual('archive1'))))
 const legacyOwner=db.collection('users').doc(actor.uid)
 await q('legacy-archive').set(row('legacy-archive'));await a('legacy-archive').set(actual('legacy-archive'))
 await legacyOwner.update({status:'PENDING'})
 await check('legacy pending Owner cannot archive',()=>assert.rejects(run('legacy-archive'),/OWNER_REQUIRED/))
 await legacyOwner.update({status:'APPROVED',active:false})
 await check('legacy inactive Owner cannot archive',()=>assert.rejects(run('legacy-archive'),/OWNER_REQUIRED/))
 await legacyOwner.update({active:true})
 await check('legacy approved Owner archives QC and Actual atomically',async()=>{await run('legacy-archive');assert.equal((await q('legacy-archive').get()).exists,false);assert.equal((await a('legacy-archive').get()).exists,false);assert.deepEqual((await archived('legacy-archive').get()).data(),row('legacy-archive'));assert.ok((await marker('legacy-archive').get()).exists)})
 await check('legacy approved Owner reads marker but cannot write',async()=>{await assertSucceeds(getDoc(doc(client,'qc_archive_markers','legacy-archive')));await assertFails(deleteDoc(doc(client,'qc_archive_markers','legacy-archive')))})
 await q('wrong-plan').set(row('wrong-plan'));await a('wrong-plan').set({...actual('wrong-plan'),dailyPlanId:'different'})
 await check('archive refuses mismatched Actual plan ID without changes',async()=>{await assert.rejects(run('wrong-plan'),/QC_ACTUAL_LINK_CONFLICT/);assert.deepEqual((await q('wrong-plan').get()).data(),row('wrong-plan'));assert.equal((await a('wrong-plan').get()).data().dailyPlanId,'different');assert.equal((await marker('wrong-plan').get()).exists,false)})
 await q('wrong-area').set(row('wrong-area'));await a('wrong-area').set({...actual('wrong-area'),actualAreaHa:99})
 await check('archive refuses mismatched Actual area without changes',async()=>{await assert.rejects(run('wrong-area'),/QC_ACTUAL_LINK_CONFLICT/);assert.deepEqual((await q('wrong-area').get()).data(),row('wrong-area'));assert.equal((await a('wrong-area').get()).data().actualAreaHa,99);assert.equal((await marker('wrong-area').get()).exists,false)})
 await check('archive preserves timestamp, fractional value and nested HOLD manifest key',async()=>{
  const id='fidelity-archive',original={...row(id),capturedAt:new Timestamp(1794528000,123456000),operationalPhotoManifest:{main:{objectPath:'main.jpg'},'hold_hold-pilot-1':{objectPath:'hold.jpg',size:68}},holdIntervals:[{duration:1.25,notes:'test'}]}
  await q(id).set(original);await a(id).set(actual(id));await run(id)
  assert.deepEqual((await archived(id).get()).data(),original)
  assert.equal((await q(id).get()).exists,false)
 })
 await check('unsupported historical GeoPoint fails closed before archive',async()=>{
  const id='unsupported-archive',original={...row(id),location:new GeoPoint(-8.5,140.4)}
  await q(id).set(original);await a(id).set(actual(id))
  await assert.rejects(run(id),/UNSUPPORTED_REST_VALUE/)
  assert.deepEqual((await q(id).get()).data(),original)
  assert.equal((await marker(id).get()).exists,false)
  assert.equal((await archived(id).get()).exists,false)
  assert.equal((await a(id).get()).exists,true)
 })
 await check('real REST commit conflict leaves earlier QC update unapplied',async()=>{
  const id='rollback-archive',original=row(id)
  await q(id).set(original)
  await db.collection('qc_admin_audit').doc('existing-conflict').set({action:'test'})
  await assert.rejects(rest.runTransaction(async tx=>{
   const ref=rest.collection('qc_records').doc(id)
   await tx.get(ref);tx.update(ref,{actualAreaHa:99})
   tx.create(rest.collection('qc_admin_audit').doc('existing-conflict'),{action:'overwrite'})
  }),/ALREADY_EXISTS|FAILED_PRECONDITION|ABORTED/)
  assert.deepEqual((await q(id).get()).data(),original)
  assert.deepEqual((await db.collection('qc_admin_audit').doc('existing-conflict').get()).data(),{action:'test'})
 })
 console.log('SUCCESS: '+n+' QC archive REST checks passed (local Firestore emulator only)')
}finally{await env.cleanup();await deleteApp(app)}
