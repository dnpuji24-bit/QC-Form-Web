import assert from 'node:assert/strict'
import {initializeApp,deleteApp} from '../server/qc-photo-access/node_modules/firebase-admin/lib/esm/app/index.js'
import {getFirestore,FieldValue} from '../server/qc-photo-access/node_modules/firebase-admin/lib/esm/firestore/index.js'
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing'
import {doc,setDoc,deleteDoc} from 'firebase/firestore'
import {readFileSync} from 'node:fs'
import {archiveQc} from '../server/qc-photo-access/qcArchiveCore.mjs'
const projectId='demo-qc-photo-test',host=process.env.FIRESTORE_EMULATOR_HOST||''
if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(host))throw Error('Local demo emulator only')
const [h,p]=host.split(':')
const env=await initializeTestEnvironment({projectId,firestore:{host:h,port:Number(p),rules:readFileSync('firestore.rules','utf8')}})
const app=initializeApp({projectId}),db=getFirestore(app),actor={uid:'archiveowner',email:'owner@example.test'}
const q=id=>db.collection('qc_records').doc(id),a=id=>db.collection('daily_reports').doc('qcactual_'+id)
const archived=id=>db.collection('qc_archived_records').doc(id),marker=id=>db.collection('qc_archive_markers').doc(id)
const row=id=>({id,ownerUid:'mandor',inputtedBy:'mandor',formType:'spray',saveType:'uploaded',dailyPlanId:'dp1',actualAreaHa:5,clientRevision:'r1',operationalSaveId:'job1',firestoreSaveState:'confirmed',photoUrl:'https://example.test/historical',operationalPhotoManifest:{main:{objectPath:'test-only.jpg'}}})
const actual=id=>({sourceOrigin:'QC',qcRecordId:id,dailyPlanId:'dp1',actualAreaHa:5,inputtedBy:'mandor'})
const run=(id,extra={},who=actor)=>archiveQc({db,actor:who,command:{recordId:id,baseRevision:'r1',reason:'Duplicate verified by Owner',operationId:'op-'+id,...extra},stamp:()=>FieldValue.serverTimestamp()})
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
 console.log('SUCCESS: '+n+' QC archive checks passed (local Firestore emulator only)')
}finally{await env.cleanup();await deleteApp(app)}
