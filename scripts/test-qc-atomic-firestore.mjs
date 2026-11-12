import {readFileSync} from 'node:fs'
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing'
import {doc,setDoc,getDoc,runTransaction} from 'firebase/firestore'
const projectId='demo-qc-photo-test',host=process.env.FIRESTORE_EMULATOR_HOST||''
if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(host))throw Error('Local demo emulator only')
const [h,p]=host.split(':')
const env=await initializeTestEnvironment({projectId,firestore:{host:h,port:Number(p),rules:readFileSync('firestore.rules','utf8')}})
const qc={id:'atomic-spray',formType:'spray',inputtedBy:'sprayuser',ownerUid:'sprayuser',clientRevision:'r1',saveType:'uploaded',dailyPlanId:'dp1',actualAreaHa:5}
const ap=(area)=>({sourceOrigin:'QC',qcRecordId:qc.id,dailyPlanId:'dp1',actualAreaHa:area,inputtedBy:'sprayuser'})
try{
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),'users','sprayuser'),{role:'mandor_spraying',active:true,username:'sprayuser'})
  await setDoc(doc(c.firestore(),'role_access','mandor_spraying'),{role:'mandor_spraying',permissions:{qc_spraying:'edit',qc_records:'view',data_plan_actual:'none',data_plan_actual_import:'none'}})
 })
 const db=env.authenticatedContext('sprayuser').firestore(),q=doc(db,'qc_records',qc.id),a=doc(db,'daily_reports','qcactual_'+qc.id)
 const commit=(r,actual)=>runTransaction(db,async tx=>{tx.set(q,r);tx.set(a,actual)})
 await assertSucceeds(commit(qc,ap(5)));console.log('PASS: initial QC and Actual atomic create')
 await assertSucceeds(commit({...qc,clientRevision:'r2',actualAreaHa:8},ap(8)));console.log('PASS: correction checks post-transaction QC area')
 await assertFails(commit({...qc,clientRevision:'r3',actualAreaHa:9},ap(99)));console.log('PASS: mismatched Actual rejects whole transaction')
 if((await getDoc(q)).data().actualAreaHa!==8||(await getDoc(a)).data().actualAreaHa!==8)throw Error('Atomic rollback failed')
 console.log('PASS: both documents unchanged after denied transaction')
 await assertSucceeds(setDoc(a,ap(8)));console.log('PASS: legacy separate Actual write remains supported')
 await assertFails(setDoc(a,ap(99)));console.log('PASS: separate mismatched Actual denied')
 console.log('SUCCESS: 6 atomic QC/Actual Firestore rules checks passed (emulator only)')
}finally{await env.cleanup()}
