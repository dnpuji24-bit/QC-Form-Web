import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const requireAdmin=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
const {initializeApp,deleteApp}=requireAdmin('firebase-admin/app')
const {getFirestore,FieldValue}=requireAdmin('firebase-admin/firestore')
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing'
import {doc,getDoc,setDoc} from 'firebase/firestore'
import {readFileSync} from 'node:fs'
import {archiveQc,restoreQc} from '../server/qc-photo-access/qcArchiveCore.mjs'
import {executeNativeAdmin} from '../server/qc-photo-access/nativeAdminService.mjs'
const projectId='demo-qc-photo-test',host=process.env.FIRESTORE_EMULATOR_HOST||''
if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(host))throw Error('Local demo emulator only')
const [h,p]=host.split(':')
const env=await initializeTestEnvironment({projectId,firestore:{host:h,port:Number(p),rules:readFileSync('firestore.rules','utf8')}})
const app=initializeApp({projectId}),db=getFirestore(app),actor={uid:'restoreowner',email:'owner@example.test'}
const d=(c,id)=>db.collection(c).doc(id)
const q=id=>d('qc_records',id),a=id=>d('daily_reports','qcactual_'+id)
const row=id=>({id,ownerUid:'mandor',inputtedBy:'mandor',formType:'spray',saveType:'uploaded',dailyPlanId:'dp1',actualAreaHa:5,clientRevision:'r1',operationalSaveId:'job1',firestoreSaveState:'confirmed',photoUrl:'https://example.test/historical',operationalPhotoManifest:{main:{objectPath:'test-only.jpg'}}})
const actual=id=>({sourceOrigin:'QC',qcRecordId:id,dailyPlanId:'dp1',actualAreaHa:5,inputtedBy:'mandor'})
const stamp=()=>FieldValue.serverTimestamp()
const archive=(id,extra={})=>archiveQc({db,actor,command:{recordId:id,baseRevision:'r1',reason:'Verified duplicate',operationId:'archive-'+id,...extra},stamp})
const cmd=(id,extra={})=>({action:'restoreQc',recordId:id,archiveOperationId:'archive-'+id,operationId:'restore-'+id,reason:'Verified restoration',...extra})
const restore=(id,extra={},who=actor)=>restoreQc({db,actor:who,command:cmd(id,extra),stamp})
let n=0
async function check(label,fn){await fn();n++;console.log('PASS: '+label)}
try{
 await env.clearFirestore()
 await d('users',actor.uid).set({username:actor.uid,email:actor.email,role:'owner',status:'approved',active:true})
 await d('users','manager').set({username:'manager',email:'manager@example.test',role:'manager',status:'approved',active:true})
 for(const id of ['rtest1','rtest2','rtest3','rtest4']){await q(id).set(row(id));await a(id).set(actual(id));await archive(id)}
 await check('non-owner restore denied',()=>assert.rejects(restore('rtest1',{}, {uid:'manager',email:'manager@example.test'}),/OWNER_REQUIRED/))
 await check('wrong archive operation denied',()=>assert.rejects(restore('rtest1',{archiveOperationId:'wrong'}),/QC_RESTORE_CONFLICT/))
 await check('reason required',()=>assert.rejects(restore('rtest1',{reason:''}),/INVALID_COMMAND/))
 await q('rtest2').set(row('rtest2'))
 await check('existing QC conflict denied',()=>assert.rejects(restore('rtest2'),/QC_RESTORE_CONFLICT/))
 await d('daily_reports','unexpected').set(actual('rtest3'))
 await check('existing linked Actual conflict denied',()=>assert.rejects(restore('rtest3'),/QC_RESTORE_CONFLICT/))
 await d('qc_archived_actuals','rtest4').update({actualAreaHa:99})
 await check('mismatched archived Actual denied',()=>assert.rejects(restore('rtest4'),/QC_ACTUAL_LINK_CONFLICT/))
 await check('archive HTTP operations disabled by default',()=>assert.rejects(executeNativeAdmin({db,auth:{verifyIdToken:async()=>actor},authorization:'Bearer test',command:cmd('rtest1'),stamp}),/QC_ARCHIVE_DISABLED/))
 await check('restore QC and Actual atomically',async()=>{await restore('rtest1');assert.equal((await q('rtest1').get()).data().actualAreaHa,5);assert.deepEqual((await a('rtest1').get()).data(),actual('rtest1'));assert.ok(!(await d('qc_archive_markers','rtest1').get()).exists)})
 await check('restoration rotates revision and preserves photo references',async()=>{const v=(await q('rtest1').get()).data();assert.equal(v.clientRevision,'restore_restore-rtest1');assert.notEqual(v.operationalSaveId,'job1');assert.deepEqual(v.operationalPhotoManifest,row('rtest1').operationalPhotoManifest);assert.equal(v.photoUrl,row('rtest1').photoUrl)})
 await check('original archive retained in history',async()=>{assert.deepEqual((await d('qc_archive_history_records','archive-rtest1').get()).data(),row('rtest1'));assert.deepEqual((await d('qc_archive_history_actuals','archive-rtest1').get()).data(),actual('rtest1'))})
 await check('restore audit created',async()=>{assert.ok((await d('qc_admin_audit','restore_restore-rtest1').get()).exists);assert.ok((await d('qc_operational_audit','rtest1:restore_restore-rtest1').get()).exists)})
 await check('identical restore replay is idempotent',async()=>assert.equal((await restore('rtest1')).replayed,true))
 await check('different restore operation denied',()=>assert.rejects(restore('rtest1',{operationId:'new-op'}),/QC_RESTORE_CONFLICT/))
 await check('old revision cannot archive restored record',()=>assert.rejects(archive('rtest1',{operationId:'next-archive'}),/QC_REVISION_CONFLICT/))
 const client=env.authenticatedContext(actor.uid).firestore()
 await check('client cannot overwrite restore history',()=>assertFails(setDoc(doc(client,'qc_archive_history_records','archive-rtest1'),row('rtest1'))))
 await check('restored record can be archived again with new revision',async()=>{await archive('rtest1',{operationId:'next-archive',baseRevision:'restore_restore-rtest1'});assert.ok((await d('qc_archive_markers','rtest1').get()).exists);assert.ok((await d('qc_archive_history_records','archive-rtest1').get()).exists)})
 const legacyOwner=d('users',actor.uid)
 await q('legacy-restore').set(row('legacy-restore'));await a('legacy-restore').set(actual('legacy-restore'));await archive('legacy-restore')
 await legacyOwner.update({status:'PENDING'})
 await check('legacy pending Owner cannot restore',()=>assert.rejects(restore('legacy-restore'),/OWNER_REQUIRED/))
 await legacyOwner.update({status:'APPROVED',active:false})
 await check('legacy inactive Owner cannot restore',()=>assert.rejects(restore('legacy-restore'),/OWNER_REQUIRED/))
 await legacyOwner.update({active:true})
 await check('legacy approved Owner restores QC and Actual',async()=>{await restore('legacy-restore');assert.equal((await q('legacy-restore').get()).data().clientRevision,'restore_restore-legacy-restore');assert.deepEqual((await a('legacy-restore').get()).data(),actual('legacy-restore'));assert.deepEqual((await d('qc_archive_history_records','archive-legacy-restore').get()).data(),row('legacy-restore'))})
 await check('legacy approved Owner reads immutable restore history',async()=>{await assertSucceeds(getDoc(doc(client,'qc_archive_history_records','archive-legacy-restore')));await assertFails(setDoc(doc(client,'qc_archive_history_records','archive-legacy-restore'),row('legacy-restore')))})
 console.log('SUCCESS: '+n+' QC restore checks passed (local Firestore emulator only)')
}finally{await env.cleanup();await deleteApp(app)}
