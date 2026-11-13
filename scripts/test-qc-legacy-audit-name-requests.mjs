import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing'
import {doc,getDoc,setDoc,deleteDoc,collection,getDocs,query,where} from 'firebase/firestore'
import {prepareLegacyAudit,importLegacyAudit} from '../server/qc-photo-access/qcLegacyAudit.mjs'
import {mergeQcAuditLogs} from '../src/qcAuditMerge.mjs'
import {nativeNameRequest} from '../server/qc-photo-access/qcNativeNameRequest.mjs'
import {executeNativeAdmin} from '../server/qc-photo-access/nativeAdminService.mjs'
const projectId='demo-qc-photo-test',host=process.env.FIRESTORE_EMULATOR_HOST||''
if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(host))throw Error('Local demo emulator only')
const requireAdmin=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
const {initializeApp,deleteApp}=requireAdmin('firebase-admin/app')
const {getFirestore,FieldValue}=requireAdmin('firebase-admin/firestore')
const [h,p]=host.split(':')
const env=await initializeTestEnvironment({projectId,firestore:{host:h,port:Number(p),rules:readFileSync('firestore.rules','utf8')}})
const app=initializeApp({projectId}),db=getFirestore(app)
const d=(c,id)=>db.collection(c).doc(id),stamp=()=>FieldValue.serverTimestamp(),now=Date.now()
const actor=uid=>({uid,email:uid+'@example.test',auth_time:Math.floor(now/1000)})
const profile=(uid,role)=>({username:uid,fullName:'Original '+uid,email:actor(uid).email,role,active:true,status:'approved',firebaseUid:uid})
const call=(uid,command,overrides={})=>nativeNameRequest({db,actor:{...actor(uid),...overrides},command,stamp,now})
const request=(requestId,newFullName='New Name')=>({action:'requestNameChange',requestId,newFullName})
const review=(requestId,decision='approve')=>({action:'reviewNameChange',requestId,decision})
const timestamp='2026-10-01T01:00:00.000Z'
const log={row:2,Timestamp:timestamp,Username:'original',FullName:'Original Name',Role:'admin',ActionType:'LOGIN',Description:'Login berhasil',IP_Device:'test-device'}
const snapshot={schemaVersion:1,sourceId:'sheet-test',logSheetId:'0',exportedAt:'2026-11-13T00:00:00.000Z',logs:[log,{...log,row:3}],accountRequests:[{row:2,requestId:'acr_1',timestamp,username:'original',requestType:'name',status:'PENDING'}]}
let n=0
async function check(label,fn){await fn();n++;console.log('PASS: '+label)}
try{
 await env.clearFirestore()
 for(const [uid,role] of [['owner1','owner'],['admin1','admin'],['viewer1','manager'],['none1','pengunjung']])await d('users',uid).set(profile(uid,role))
 for(const [role,logs,settings] of [['admin','view','edit'],['manager','view','view'],['pengunjung','none','none']])await d('role_access',role).set({role,permissions:{qc_logs:logs,qc_settings:settings}})
 const prepared=prepareLegacyAudit(snapshot)
 await check('historical identical events on distinct source rows are preserved',()=>{assert.equal(prepared.logs.length,2);assert.notEqual(prepared.logs[0].id,prepared.logs[1].id);assert.equal(prepared.summary.pendingCount,1)})
 await check('snapshot rejects duplicate rows and credential fields',()=>{assert.throws(()=>prepareLegacyAudit({...snapshot,logs:[log,log]}));assert.throws(()=>prepareLegacyAudit({...snapshot,accountRequests:[{...snapshot.accountRequests[0],PasswordHash:'secret'}]}))})
 await check('snapshot rejects ambiguous timestamp',()=>assert.throws(()=>prepareLegacyAudit({...snapshot,logs:[{...log,Timestamp:'01/10/2026'}]})))
 await check('first import creates only historical audit rows',async()=>{assert.deepEqual(await importLegacyAudit(db,prepared),{created:2,unchanged:0});assert.equal((await db.collection('qc_records').get()).size,0);assert.equal((await db.collection('daily_reports').get()).size,0)})
 await check('reimport is idempotent',async()=>assert.deepEqual(await importLegacyAudit(db,prepared),{created:0,unchanged:2}))
 await check('changed source row rejected without overwrite',async()=>{await assert.rejects(importLegacyAudit(db,prepareLegacyAudit({...snapshot,logs:[{...log,Description:'changed'}]})),/LEGACY_AUDIT_SOURCE_CONFLICT/);assert.equal((await d('qc_legacy_activity_logs',prepared.logs[0].id).get()).data().Description,log.Description)})
 const client=uid=>env.authenticatedContext(uid).firestore(),logRef=uid=>doc(client(uid),'qc_legacy_activity_logs',prepared.logs[0].id)
 await check('viewer reads historical log',()=>assertSucceeds(getDoc(logRef('viewer1'))))
 await check('no logs permission denies history',()=>assertFails(getDoc(logRef('none1'))))
 await check('Owner cannot edit or delete imported log directly',async()=>{await assertFails(setDoc(logRef('owner1'),{Description:'changed'}));await assertFails(deleteDoc(logRef('owner1')))})
 await check('merge keeps separate sources, sorts time and deduplicates same source ID',()=>{const legacy={...log,id:'same'},ops={id:'same',Timestamp:'2026-11-01T00:00:00.000Z',saveType:'uploaded'};const rows=mergeQcAuditLogs([legacy,legacy],[ops],[{id:'same',Timestamp:'2026-11-02T00:00:00.000Z',action:'archiveQc'}]);assert.equal(rows.length,3);assert.equal(rows[0].Source,'Firestore Admin');assert.equal(rows[2].Source,'Apps Script (historis)')})
 await check('name request service disabled by default',()=>assert.rejects(executeNativeAdmin({db,auth:{verifyIdToken:async()=>actor('admin1')},authorization:'Bearer test',command:request('r1'),stamp}),/ACCOUNT_REQUEST_DISABLED/))
 await check('recent authentication required',()=>assert.rejects(call('admin1',request('r1'),{auth_time:0}),/RECENT_AUTH_REQUIRED/))
 await check('view-only settings cannot submit',()=>assert.rejects(call('viewer1',request('r1')),/ACCOUNT_REQUEST_FORBIDDEN/))
 await check('username and password fields rejected',()=>assert.rejects(call('admin1',{...request('r1'),newUsername:'changed',password:'secret'}),/INVALID_COMMAND/))
 await check('approved user creates pending name request without changing profile',async()=>{await call('admin1',request('r1'));assert.equal((await d('users','admin1').get()).data().fullName,'Original admin1');assert.equal((await d('qc_native_name_requests','r1').get()).data().status,'pending')})
 await check('same request replay and second pending request blocked',async()=>{assert.equal((await call('admin1',request('r1'))).replayed,true);await assert.rejects(call('admin1',request('r2')),/ACCOUNT_REQUEST_PENDING/)})
 await check('request owner can list own requests but cannot read another account',async()=>{await assertSucceeds(getDocs(query(collection(client('admin1'),'qc_native_name_requests'),where('uid','==','admin1'))));await assertFails(getDoc(doc(client('viewer1'),'qc_native_name_requests','r1')))})
 await check('client cannot forge review or pending lock',async()=>{await assertFails(setDoc(doc(client('owner1'),'qc_native_name_requests','r1'),{status:'approved'}));await assertFails(deleteDoc(doc(client('admin1'),'qc_native_name_pending','admin1')))})
 await check('non-Owner review denied',()=>assert.rejects(call('admin1',review('r1')),/OWNER_REQUIRED/))
 await check('approval changes only display name and creates audit atomically',async()=>{await d('qc_records','old').set({id:'old',inputtedBy:'admin1'});await call('owner1',review('r1'));const u=(await d('users','admin1').get()).data();assert.equal(u.fullName,'New Name');assert.equal(u.username,'admin1');assert.equal(u.firebaseUid,'admin1');assert.equal(u.role,'admin');assert.equal((await d('qc_records','old').get()).data().inputtedBy,'admin1');assert.ok((await d('qc_admin_audit','name_r1').get()).exists);assert.equal((await d('qc_native_name_pending','admin1').get()).exists,false)})
 await check('approval replay idempotent and opposite decision rejected',async()=>{assert.equal((await call('owner1',review('r1'))).replayed,true);await assert.rejects(call('owner1',review('r1','reject')),/ACCOUNT_REQUEST_CONFLICT/)})
 await check('reject keeps profile unchanged and releases pending lock',async()=>{await call('admin1',request('r2','Another Name'));await call('owner1',review('r2','reject'));assert.equal((await d('users','admin1').get()).data().fullName,'New Name');assert.equal((await d('qc_native_name_pending','admin1').get()).exists,false)})
 await check('stale display name prevents approval',async()=>{await call('admin1',request('r3','Third Name'));await d('users','admin1').update({fullName:'External change'});await assert.rejects(call('owner1',review('r3')),/ACCOUNT_REQUEST_CONFLICT/)})
 console.log('SUCCESS: '+n+' legacy audit and native name request checks passed (local Firestore emulator only)')
}finally{await env.cleanup();await deleteApp(app)}
