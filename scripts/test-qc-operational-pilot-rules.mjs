import {readFileSync} from 'node:fs'
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing'
import {doc,setDoc,getDoc,deleteDoc,runTransaction} from 'firebase/firestore'
const projectId='demo-qc-photo-test',host=process.env.FIRESTORE_EMULATOR_HOST||''
if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(host))throw Error('Local demo emulator only')
const [h,p]=host.split(':')
const env=await initializeTestEnvironment({projectId,firestore:{host:h,port:Number(p),rules:readFileSync('firestore.rules','utf8')}})
const id='qc-operational-pilot-test1'
const row={id,ownerUid:'owner1',clientRevision:'rev1',formType:'spray',saveType:'uploaded',testOnly:true,operationalPhotoManifest:{},operationalSaveId:'job1',firestoreSaveState:'confirmed'}
const ref=(db,id2=id)=>doc(db,'qc_operational_pilot_records',id2)
let n=0
async function check(label,request,deny=false){await (deny?assertFails(request):assertSucceeds(request));n++;console.log('PASS: '+label)}
try{
 await env.withSecurityRulesDisabled(async c=>{
  for(const [uid,role,active] of [['owner1','owner',true],['owner2','owner',true],['manager1','manager',true],['inactive','owner',false]])await setDoc(doc(c.firestore(),'users',uid),{role,active,username:uid})
 })
 const db=uid=>env.authenticatedContext(uid).firestore(),owner=db('owner1')
 await check('owner can read missing pilot record',getDoc(ref(owner)))
 await check('owner transaction creates pilot record',runTransaction(owner,async tx=>{const r=ref(owner);await tx.get(r);tx.set(r,row)}))
 await check('owner can read own pilot',getDoc(ref(owner)))
 await check('manager cannot read pilot',getDoc(ref(db('manager1'))),true)
 await check('another owner cannot read pilot',getDoc(ref(db('owner2'))),true)
 await check('inactive owner denied',getDoc(ref(db('inactive'))),true)
 await check('same revision update denied',setDoc(ref(owner),{...row,operationalSaveId:'job2'}),true)
 await check('new revision permitted',setDoc(ref(owner),{...row,clientRevision:'rev2',operationalSaveId:'job2'}))
 await check('nonpilot ID denied',setDoc(ref(owner,'real-qc1'),{...row,id:'real-qc1'}),true)
 await check('extra operational field denied',setDoc(ref(owner),{...row,clientRevision:'rev3',actualAreaHa:1}),true)
 await check('client delete denied',deleteDoc(ref(owner)),true)
 console.log('SUCCESS: '+n+' operational pilot rules checks passed (emulator only)')
}finally{await env.cleanup()}
