import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore'
const projectId='demo-qc-photo-test', host=process.env.FIRESTORE_EMULATOR_HOST||''
if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(host))throw Error('Local demo emulator only.')
const [h,p]=host.split(':')
const env=await initializeTestEnvironment({projectId,firestore:{host:h,port:Number(p),rules:readFileSync('firestore.rules','utf8')}})
let n=0
const pass=async(label,promise,denied=false)=>{await (denied?assertFails(promise):assertSucceeds(promise));n++;console.log('PASS:',label)}
const rec='qc-photo-staging-spray001',rev='revision001'
const parent=(db,id=rec)=>doc(db,'qc_photo_staging_records',id)
const photo=(db,id='photo001')=>doc(db,'qc_photo_staging_metadata',rec,'photos',id)
const record={formType:'spray',ownerUid:'spray01',clientRevision:rev,testOnly:true}
const metadata={photoId:'photo001',qcRecordId:rec,ownerUid:'spray01',recordRevision:rev,provider:'supabase',bucket:'qc-photos-test',kind:'main',contentType:'image/png',objectPath:'spray01/qc/'+rec+'/photo001.png',testOnly:true}
try{
  await env.withSecurityRulesDisabled(async c=>{
    const db=c.firestore()
    for(const [uid,role] of [['spray01','mandor_spraying'],['fert01','mandor_fertilizer'],['viewer01','manager'],['none01','pengunjung']])await setDoc(doc(db,'users',uid),{active:true,role,username:uid})
    for(const [role,permissions] of [['mandor_spraying',{qc_spraying:'edit',qc_records:'view'}],['mandor_fertilizer',{qc_fertilizer:'edit',qc_records:'view'}],['manager',{qc_records:'view'}],['pengunjung',{qc_records:'none'}]])await setDoc(doc(db,'role_access',role),{role,permissions})
  })
  const db=uid=>env.authenticatedContext(uid).firestore(),spray=db('spray01'),fert=db('fert01'),view=db('viewer01'),none=db('none01')
  await pass('spray creates staging parent',setDoc(parent(spray),record))
  await pass('fertilizer creates own staging parent',setDoc(parent(fert,'qc-photo-staging-fert001'),{...record,ownerUid:'fert01',formType:'fertilizer'}))
  await pass('reject wrong form role',setDoc(parent(fert,'qc-photo-staging-wrong001'),{...record,ownerUid:'fert01'}),true)
  await pass('reject operational-looking ID',setDoc(parent(spray,'qc-real001'),record),true)
  await pass('reject another owner',setDoc(parent(spray,'qc-photo-staging-spoof001'),{...record,ownerUid:'fert01'}),true)
  await pass('main photo metadata',setDoc(photo(spray),metadata))
  await pass('hold photo metadata',setDoc(photo(spray,'hold001'),{...metadata,photoId:'hold001',kind:'hold',holdId:'hold001',objectPath:'spray01/qc/'+rec+'/hold001.png'}))
  await pass('scan photo metadata',setDoc(photo(spray,'scan001'),{...metadata,photoId:'scan001',kind:'scan',objectPath:'spray01/qc/'+rec+'/scan001.png'}))
  await pass('wrong object path denied',setDoc(photo(spray,'bad001'),{...metadata,photoId:'bad001'}),true)
  await pass('viewer sees metadata',getDoc(photo(view)))
  await pass('none denied',getDoc(photo(none)),true)
  await pass('metadata cannot be overwritten',updateDoc(photo(spray),{kind:'scan'}),true)
  console.log('SUCCESS: '+n+' form-photo staging rules checks passed (local emulator only).')
}finally{await env.cleanup()}
