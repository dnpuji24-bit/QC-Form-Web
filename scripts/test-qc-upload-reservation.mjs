import {readFileSync} from 'node:fs'
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing'
import {doc,setDoc,getDoc,serverTimestamp,deleteDoc} from 'firebase/firestore'
const projectId='demo-qc-photo-test',host=process.env.FIRESTORE_EMULATOR_HOST||''
if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(host))throw Error('Local demo emulator only')
const [h,p]=host.split(':')
const env=await initializeTestEnvironment({projectId,firestore:{host:h,port:Number(p),rules:readFileSync('firestore.rules','utf8')}})
const id='reservation-test-qc'
const row={ownerUid:'spray1',formType:'spray',clientRevision:'r1'}
const ref=(db,id2=id)=>doc(db,'qc_photo_upload_intents',id2)
let n=0
async function check(label,p,deny=false){await (deny?assertFails(p):assertSucceeds(p));n++;console.log('PASS: '+label)}
try{
 await env.withSecurityRulesDisabled(async c=>{
  for(const [uid,role,active] of [['spray1','mandor_spraying',true],['spray2','mandor_spraying',true],['fert1','mandor_fertilizer',true],['inactive','mandor_spraying',false]])await setDoc(doc(c.firestore(),'users',uid),{role,active,username:uid})
  await setDoc(doc(c.firestore(),'role_access','mandor_spraying'),{role:'mandor_spraying',permissions:{qc_spraying:'edit',qc_records:'view'}})
  await setDoc(doc(c.firestore(),'role_access','mandor_fertilizer'),{role:'mandor_fertilizer',permissions:{qc_fertilizer:'edit',qc_records:'view'}})
  await setDoc(doc(c.firestore(),'qc_records','existing-qc'),{formType:'spray',inputtedBy:'spray1'})
 })
 const db=uid=>env.authenticatedContext(uid).firestore(),spray=db('spray1')
 const reserve=(d,recordId,data)=>setDoc(ref(d,recordId),{...data,createdAt:serverTimestamp()})
 await check('spraying creates own reservation',reserve(spray,id,row))
 await check('owner reads reservation',getDoc(ref(spray)))
 await check('other UID cannot read reservation',getDoc(ref(db('spray2'))),true)
 await check('cannot replace reservation revision',reserve(spray,id,{...row,clientRevision:'r2'}),true)
 await check('cannot reserve existing QC',reserve(spray,'existing-qc',row),true)
 await check('wrong form permission denied',reserve(db('fert1'),'wrong-form',{...row,ownerUid:'fert1'}),true)
 await check('inactive account denied',reserve(db('inactive'),'inactive-qc',{...row,ownerUid:'inactive'}),true)
 await check('forged owner denied',reserve(db('spray2'),'forged',row),true)
 await check('cannot delete reservation',deleteDoc(ref(spray)),true)
 await check('fertilizer creates own reservation',reserve(db('fert1'),'fert-new',{ownerUid:'fert1',formType:'fertilizer',clientRevision:'r1'}))
 await check('reservation permits reading missing QC',getDoc(doc(spray,'qc_records',id)))
 console.log('SUCCESS: '+n+' QC upload reservation checks passed (emulator only)')
}finally{await env.cleanup()}
