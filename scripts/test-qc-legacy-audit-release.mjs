// Regression for the isolated historical-only release. Local demo emulator only.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing'
import {doc,getDoc,getDocs,collection,setDoc,updateDoc,deleteDoc} from 'firebase/firestore'
const projectId='demo-qc-photo-test'
const host=process.env.FIRESTORE_EMULATOR_HOST||''
if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(host))throw Error('Local demo emulator only')
const baseline=execFileSync('git',['show','a945122a4238356b0eeaddbe0ed134a811549108:firestore.rules'],{encoding:'utf8'})
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n').trimEnd()).digest('hex')
assert.equal(hash(baseline),'1a2eb39419522397c9a5af25418091c25506ee0822d122ac0e851038326e6de2')
const candidate=readFileSync(new URL('./firestore.legacy-audit-release.rules',import.meta.url),'utf8')
const block="    match /qc_legacy_activity_logs/{auditId} {\n      allow read: if activeUser() && profile().data.status in ['approved','APPROVED']\n        && (role() == 'owner' || permission('qc_logs') in ['view','edit']);\n      allow write: if false;\n    }\n\n"
const anchor='    match /{document=**} {'
assert.equal(baseline.split(anchor).length,2)
assert.equal(candidate,baseline.replace(anchor,()=>block+anchor))
console.log('PASS: candidate contains only the historical rule addition; exact deployed baseline preserved')
const [h,p]=host.split(':')
const env=await initializeTestEnvironment({projectId,firestore:{host:h,port:Number(p),rules:candidate}})
let n=1
async function check(label,fn){await fn();n++;console.log('PASS: '+label)}
try{
 await env.clearFirestore()
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore()
  for(const [uid,role,active,status] of [['owner1','owner',true,'approved'],['viewer1','manager',true,'approved'],['editor1','admin',true,'approved'],['none1','pengunjung',true,'approved'],['inactive1','manager',false,'approved'],['pending1','manager',true,'pending'],['mandor1','mandor_spraying',true,'approved'],['legacyOwner','owner',true,'APPROVED'],['legacyViewer','manager',true,'APPROVED'],['legacyEditor','admin',true,'APPROVED'],['legacyNone','pengunjung',true,'APPROVED'],['legacyInactive','owner',false,'APPROVED'],['legacyPending','owner',true,'PENDING'],['mixedStatus','owner',true,'Approved']]){
   await setDoc(doc(db,'users',uid),{username:uid,role,active,status})
  }
  for(const [role,logs,records,spray] of [['manager','view','view','none'],['admin','edit','view','none'],['pengunjung','none','none','none'],['mandor_spraying','none','view','edit']]){
   await setDoc(doc(db,'role_access',role),{role,permissions:{qc_logs:logs,qc_records:records,qc_spraying:spray}})
  }
  await setDoc(doc(db,'qc_legacy_activity_logs','log1'),{Description:'synthetic'})
  await setDoc(doc(db,'qc_records','old1'),{formType:'spray',inputtedBy:'mandor1'})
 })
 const db=uid=>env.authenticatedContext(uid).firestore()
 const log=uid=>doc(db(uid),'qc_legacy_activity_logs','log1')
 await check('Owner can read history',()=>assertSucceeds(getDoc(log('owner1'))))
 await check('Viewer can list history',()=>assertSucceeds(getDocs(collection(db('viewer1'),'qc_legacy_activity_logs'))))
 await check('Editor can read history',()=>assertSucceeds(getDoc(log('editor1'))))
 await check('No log permission cannot read',()=>assertFails(getDoc(log('none1'))))
 await check('Inactive user denied',()=>assertFails(getDoc(log('inactive1'))))
 await check('Pending user denied',()=>assertFails(getDoc(log('pending1'))))
 await check('Legacy uppercase Owner can read history',()=>assertSucceeds(getDoc(log('legacyOwner'))))
 await check('Legacy uppercase Viewer can list history',()=>assertSucceeds(getDocs(collection(db('legacyViewer'),'qc_legacy_activity_logs'))))
 await check('Legacy uppercase Editor can read history',()=>assertSucceeds(getDoc(log('legacyEditor'))))
 await check('Legacy uppercase user without permission denied',()=>assertFails(getDoc(log('legacyNone'))))
 await check('Legacy inactive Owner denied',()=>assertFails(getDoc(log('legacyInactive'))))
 await check('Legacy pending Owner denied',()=>assertFails(getDoc(log('legacyPending'))))
 await check('Unrecognized mixed-case status denied',()=>assertFails(getDoc(log('mixedStatus'))))
 await check('Legacy uppercase Owner cannot write history',()=>assertFails(updateDoc(log('legacyOwner'),{Description:'changed'})))
 await check('Unauthenticated user denied',()=>assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'qc_legacy_activity_logs','log1'))))
 await check('Owner cannot create historical log',()=>assertFails(setDoc(doc(db('owner1'),'qc_legacy_activity_logs','fake'),{Description:'fake'})))
 await check('Owner cannot edit historical log',()=>assertFails(updateDoc(log('owner1'),{Description:'changed'})))
 await check('Owner cannot delete historical log',()=>assertFails(deleteDoc(log('owner1'))))
 await check('Editor cannot write historical log',()=>assertFails(setDoc(log('editor1'),{Description:'changed'})))
 await check('Existing QC viewer access retained',()=>assertSucceeds(getDoc(doc(db('viewer1'),'qc_records','old1'))))
 await check('Mandor can still create own legacy QC',()=>assertSucceeds(setDoc(doc(db('mandor1'),'qc_records','new1'),{formType:'spray',inputtedBy:'mandor1'})))
 await check('Mandor cannot create QC for others',()=>assertFails(setDoc(doc(db('mandor1'),'qc_records','new2'),{formType:'spray',inputtedBy:'other'})))
 await check('Native requests remain denied',()=>assertFails(setDoc(doc(db('owner1'),'qc_native_name_requests','fake'),{status:'pending'})))
 console.log('SUCCESS: '+n+' isolated legacy audit release checks passed (local emulator only)')
}finally{await env.cleanup()}
