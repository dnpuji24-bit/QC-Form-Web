import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing'
import {doc,setDoc,getDoc,deleteDoc,updateDoc,writeBatch,serverTimestamp} from 'firebase/firestore'
const projectId='demo-qc-photo-test',host=process.env.FIRESTORE_EMULATOR_HOST||''
if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(host))throw Error('Local demo emulator only')
const [h,p]=host.split(':')
const env=await initializeTestEnvironment({projectId,firestore:{host:h,port:Number(p),rules:readFileSync('firestore.rules','utf8')}})
const id='audit-spray',uid='auditmandor'
const qc=(rev,area=5)=>({id,formType:'spray',inputtedBy:uid,ownerUid:uid,clientRevision:rev,saveType:'uploaded',dailyPlanId:'dp1',actualAreaHa:area,operationalSaveId:'job-'+rev,firestoreSaveState:'confirmed'})
const ap=area=>({sourceOrigin:'QC',qcRecordId:id,dailyPlanId:'dp1',actualAreaHa:area,inputtedBy:uid})
const log=(rev,extra={})=>({recordId:id,revision:rev,actorUid:uid,username:uid,formType:'spray',saveType:'uploaded',createdAt:serverTimestamp(),...extra})
let n=0
const check=async(label,fn)=>{await fn();n++;console.log('PASS: '+label)}
try{
 await env.clearFirestore()
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore()
  for(const [u,role,active] of [[uid,'mandor_spraying',true],['auditviewer','manager',true],['auditnone','admin',true],['auditowner','owner',true],['auditinactive','manager',false]])await setDoc(doc(db,'users',u),{role,active,username:u,status:'approved'})
  for(const [role,permissions] of [['mandor_spraying',{qc_spraying:'edit',qc_records:'view',qc_logs:'none',data_plan_actual:'none',data_plan_actual_import:'none'}],['manager',{qc_logs:'view'}],['admin',{qc_logs:'none'}]])await setDoc(doc(db,'role_access',role),{role,permissions})
 })
 const db=env.authenticatedContext(uid).firestore(),q=doc(db,'qc_records',id),a=doc(db,'daily_reports','qcactual_'+id)
 const audit=(db,rev)=>doc(db,'qc_operational_audit',id+':'+rev)
 const commit=(rev,area,actual=area,extra={},includeLog=true)=>{const b=writeBatch(db);b.set(q,qc(rev,area));b.set(a,ap(actual));if(includeLog)b.set(audit(db,rev),log(rev,extra));return b.commit()}
 const owner=env.authenticatedContext('auditowner').firestore(),viewer=env.authenticatedContext('auditviewer').firestore(),none=env.authenticatedContext('auditnone').firestore(),inactive=env.authenticatedContext('auditinactive').firestore()
 await check('operational save without log denied',()=>assertFails(commit('r1',5,5,{},false)))
 await check('QC Actual and audit atomic create',()=>assertSucceeds(commit('r1',5)))
 await check('authorized viewer can read audit',()=>assertSucceeds(getDoc(audit(viewer,'r1'))))
 await check('Owner can read audit',()=>assertSucceeds(getDoc(audit(owner,'r1'))))
 await check('no permission denies audit read',()=>assertFails(getDoc(audit(none,'r1'))))
 await check('inactive viewer denied',()=>assertFails(getDoc(audit(inactive,'r1'))))
 await check('mandor without qc_logs denied',()=>assertFails(getDoc(audit(db,'r1'))))
 await check('forged actor denied',()=>assertFails(commit('r2',6,6,{actorUid:'auditowner'})))
 await check('forged form denied',()=>assertFails(commit('r2',6,6,{formType:'fertilizer'})))
 await check('standalone fabricated log denied',()=>assertFails(setDoc(audit(db,'r2'),log('r2'))))
 await check('incorrect Actual rolls back all writes',()=>assertFails(commit('r2',6,99)))
 await check('failed revision leaves QC Actual and audit unchanged',async()=>{assert.equal((await getDoc(q)).data().actualAreaHa,5);assert.equal((await getDoc(a)).data().actualAreaHa,5);assert.equal((await getDoc(audit(owner,'r2'))).exists(),false)})
 await check('new revision creates new audit',()=>assertSucceeds(commit('r2',6)))
 await check('same revision replay cannot overwrite audit',()=>assertFails(commit('r2',6)))
 await check('Owner cannot delete audit',()=>assertFails(deleteDoc(audit(owner,'r1'))))
 await check('Owner cannot overwrite audit',()=>assertFails(setDoc(audit(owner,'r1'),log('r1'))))
 await check('operational marker cannot be removed',async()=>{const row=qc('r3',6);delete row.operationalSaveId;await assertFails(setDoc(q,row))})
 await check('historical audit remains after correction',async()=>{assert.equal((await getDoc(audit(owner,'r1'))).data().revision,'r1');assert.equal((await getDoc(audit(owner,'r2'))).data().revision,'r2')})
 async function updateProfile(u,patch){await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'users',u),patch))}
 await updateProfile(uid,{status:'APPROVED'})
 await updateProfile('auditviewer',{status:'APPROVED'})
 await updateProfile('auditowner',{status:'APPROVED'})
 await updateProfile('auditnone',{status:'APPROVED'})
 await check('legacy approved mandor commits QC Actual and audit',()=>assertSucceeds(commit('r3',7)))
 await check('legacy approved viewer and Owner can read audit',async()=>{await assertSucceeds(getDoc(audit(viewer,'r3')));await assertSucceeds(getDoc(audit(owner,'r3')))})
 await check('legacy approved user without logs permission denied',()=>assertFails(getDoc(audit(none,'r3'))))
 await updateProfile(uid,{status:'PENDING'})
 await check('legacy pending mandor cannot commit operational audit',()=>assertFails(commit('r4',8)))
 await updateProfile('auditviewer',{status:'PENDING'})
 await check('legacy pending viewer cannot read audit',()=>assertFails(getDoc(audit(viewer,'r3'))))
 await updateProfile('auditowner',{active:false})
 await check('legacy inactive Owner cannot read audit',()=>assertFails(getDoc(audit(owner,'r3'))))
 await updateProfile('auditowner',{active:true})
 await check('legacy approved Owner cannot overwrite operational audit',()=>assertFails(setDoc(audit(owner,'r3'),log('r3'))))
 await check('denied legacy revision did not change QC Actual or audit',async()=>{await updateProfile(uid,{status:'APPROVED'});assert.equal((await getDoc(q)).data().actualAreaHa,7);assert.equal((await getDoc(a)).data().actualAreaHa,7);assert.equal((await getDoc(audit(owner,'r4'))).exists(),false)})
 console.log('SUCCESS: '+n+' operational audit rules checks passed (emulator only)')
}finally{await env.cleanup()}
