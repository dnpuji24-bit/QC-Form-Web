import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const requireAdmin=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
const {initializeApp,deleteApp}=requireAdmin('firebase-admin/app')
const {getFirestore,FieldValue}=requireAdmin('firebase-admin/firestore')
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing'
import {doc,setDoc,deleteDoc} from 'firebase/firestore'
import {readFileSync} from 'node:fs'
import {historicalQc,historicalPatch} from '../server/qc-photo-access/qcHistoricalCorrection.mjs'
import {executeNativeAdmin} from '../server/qc-photo-access/nativeAdminService.mjs'
const projectId='demo-qc-photo-test',host=process.env.FIRESTORE_EMULATOR_HOST||''
if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(host))throw Error('Local demo emulator only')
const [h,p]=host.split(':')
const env=await initializeTestEnvironment({projectId,firestore:{host:h,port:Number(p),rules:readFileSync('firestore.rules','utf8')}})
const app=initializeApp({projectId}),db=getFirestore(app),actor={uid:'histowner',email:'owner@example.test'}
const d=(c,id)=>db.collection(c).doc(id),q=id=>d('qc_records',id),a=id=>d('daily_reports','qcactual_'+id),stamp=()=>FieldValue.serverTimestamp()
const spray=id=>({id,formType:'spray',saveType:'uploaded',inputtedBy:'old-mandor',paddock:'A-007',date:'2026-10-01',dailyPlanId:'dp1',area:'5',actualAreaHa:5,plannedDailyAreaHa:10,effectiveWorkingMinutes:120,pesticide1:'Herbicide',dosage1:'2',estUsagePesticide1:'10.00',actUsagePesticide1:'9',adjuvantDosage:'0.5',waterRate:'200',actualPlanMaterials:[{dosePerHa:2,totalMaterial:10}],photoDriveUrl:'https://example.test/old',holdIntervals:[{photoDriveUrl:'https://example.test/hold'}],noted:'old note'})
const fert=id=>({...spray(id),formType:'fertilizer',catatan:'old | [UNIT BERHENTI] service',noted:'old | [UNIT BERHENTI] service',pengisianList:[{jumlah:600,hasilKerja:2,jenisPupuk:'NK'},{jumlah:900,hasilKerja:3,jenisPupuk:'NK'}],scanReportDriveUrl:'https://example.test/scan'})
const actual=id=>({sourceOrigin:'QC',qcRecordId:id,dailyPlanId:'dp1',actualAreaHa:5,plannedDailyAreaHa:10,materials:[{dosePerHa:2,totalMaterial:10}],inputtedBy:'old-mandor'})
const call=(command,who=actor)=>historicalQc({db,actor:who,command,stamp})
const preview=id=>call({action:'previewHistoricalQc',recordId:id})
const cmd=(id,baseVersion,changes,operationId='op-'+id)=>({action:'correctHistoricalQc',recordId:id,baseVersion,changes,operationId,reason:'Verified correction'})
let n=0
async function check(label,fn){await fn();n++;console.log('PASS: '+label)}
try{
 await env.clearFirestore()
 await d('users',actor.uid).set({username:actor.uid,email:actor.email,role:'owner',status:'approved',active:true})
 await d('users','manager').set({username:'manager',email:'manager@example.test',role:'manager',status:'approved',active:true})
 for(const id of ['old1','old2','old3','old4','old5']){await q(id).set(id==='old2'?fert(id):spray(id));await a(id).set(actual(id))}
 await check('historical service disabled by default',()=>assert.rejects(executeNativeAdmin({db,auth:{verifyIdToken:async()=>actor},authorization:'Bearer test',command:{action:'previewHistoricalQc',recordId:'old1'},stamp}),/QC_HISTORICAL_DISABLED/))
 await check('non-owner preview denied',()=>assert.rejects(call({action:'previewHistoricalQc',recordId:'old1'},{uid:'manager',email:'manager@example.test'}),/OWNER_REQUIRED/))
 const v=(await preview('old1')).version
 await check('preview is read only',async()=>assert.equal((await preview('old1')).version,v))
 await check('stale version denied',()=>assert.rejects(call(cmd('old1','wrong',{area:6})),/QC_REVISION_CONFLICT/))
 await check('owner and photo fields cannot be patched',()=>assert.rejects(call(cmd('old1',v,{ownerUid:'histowner',photoDriveUrl:'x'})),/INVALID_COMMAND/))
 await check('negative area denied',()=>assert.rejects(call(cmd('old1',v,{area:-1})),/QC_HISTORICAL_INVALID_DATA/))
 await check('spray correction recalculates derived values',async()=>{await call(cmd('old1',v,{area:6,note:'corrected'}));const r=(await q('old1').get()).data();assert.equal(r.actualAreaHa,6);assert.equal(r.area,'6');assert.equal(r.estUsagePesticide1,'12.00');assert.equal(r.estUsageAdjuvant,'0.60');assert.equal(r.productivityHaPerHour,3);assert.equal(r.actUsagePesticide1,'9');assert.equal(r.inputtedBy,'old-mandor');assert.equal(r.ownerUid,undefined);assert.equal(r.photoDriveUrl,spray('old1').photoDriveUrl);assert.deepEqual(r.holdIntervals,spray('old1').holdIntervals)})
 await check('Actual and audit committed together',async()=>{const r=(await a('old1').get()).data();assert.equal(r.actualAreaHa,6);assert.equal(r.dailyVarianceHa,4);assert.equal(r.materials[0].totalMaterial,12);assert.ok((await d('qc_admin_audit','historical_op-old1').get()).exists)})
 await check('identical replay does not duplicate correction',async()=>assert.equal((await call(cmd('old1',v,{area:6,note:'corrected'}))).replayed,true))
 await check('reused operation with different payload denied',()=>assert.rejects(call(cmd('old1',v,{area:7})),/QC_HISTORICAL_CONFLICT/))
 await check('fertilizer filling correction recalculates dose',async()=>{const ver=(await preview('old2')).version;await call(cmd('old2',ver,{fillings:[{jumlah:600,hasilKerja:2},{jumlah:900,hasilKerja:4}],note:'new'}));const r=(await q('old2').get()).data();assert.equal(r.actualAreaHa,6);assert.equal(r.weightedActualDosage,250);assert.equal(r.averageActualDosage,262.5);assert.equal(r.pengisianList[1].dosisAktual,225);assert.equal(r.catatan,'new | [UNIT BERHENTI] service');assert.equal(r.scanReportDriveUrl,fert('old2').scanReportDriveUrl)})
 await a('old3').update({actualAreaHa:99})
 await check('mismatched Actual denied without writes',async()=>{await assert.rejects(call(cmd('old3',(await preview('old3')).version,{area:7})),/QC_ACTUAL_LINK_CONFLICT/);assert.equal((await q('old3').get()).data().actualAreaHa,5)})
 await d('daily_reports','duplicate').set(actual('old4'))
 await check('duplicate Actual linkage denied',async()=>assert.rejects(call(cmd('old4',(await preview('old4')).version,{area:7})),/QC_ACTUAL_LINK_CONFLICT/))
 await a('old5').delete()
 await check('missing expected Actual denied',async()=>assert.rejects(call(cmd('old5',(await preview('old5')).version,{note:'new'})),/QC_ACTUAL_LINK_CONFLICT/))
 const client=env.authenticatedContext(actor.uid).firestore()
 await check('client cannot overwrite corrected historical QC',()=>assertFails(setDoc(doc(client,'qc_records','old1'),spray('old1'))))
 await check('client cannot delete corrected Actual',()=>assertFails(deleteDoc(doc(client,'daily_reports','qcactual_old1'))))
 await check('client cannot remove historical lock',()=>assertFails(deleteDoc(doc(client,'qc_historical_correction_locks','old1'))))
 await check('new verified version permits later correction',async()=>{await call(cmd('old1',(await preview('old1')).version,{note:'second correction'},'second'));assert.equal((await q('old1').get()).data().noted,'second correction')})
 // Stage 17: exact, read-only server preview plus QC and Actual version checks.
 for(const id of ['preview1','preview2','preview3']){await q(id).set(id==='preview3'?fert(id):spray(id));await a(id).set(actual(id))}
 const before=(await preview('preview1')).version
 const change=cmd('preview1',before,{area:7,note:'verified preview'})
 const preflight=()=>call({...change,action:'previewHistoricalQc'})
 let checked
 await check('server preview returns exact QC and Actual before-after values',async()=>{
  checked=await preflight()
  assert.equal(checked.version,before);assert.equal(typeof checked.actualVersion,'string')
  assert.equal(checked.before.actualAreaHa,5);assert.equal(checked.after.actualAreaHa,7)
  assert.equal(checked.after.estUsagePesticide1,'14.00');assert.equal(checked.after.productivityHaPerHour,3.5)
  assert.equal(checked.actual.before.actualAreaHa,5);assert.equal(checked.actual.after.actualAreaHa,7)
  assert.equal(checked.actual.after.dailyVarianceHa,3)
 })
 await check('verified preview changes no documents or audit logs',async()=>{
  assert.equal((await preview('preview1')).version,before)
  assert.equal((await a('preview1').get()).data().actualAreaHa,5)
  assert.equal((await d('qc_admin_audit','historical_op-preview1').get()).exists,false)
  assert.equal((await d('qc_historical_correction_locks','preview1').get()).exists,false)
 })
 await check('manager cannot request verified preview',()=>assert.rejects(call({...change,action:'previewHistoricalQc'},{uid:'manager',email:'manager@example.test'}),/OWNER_REQUIRED/))
 await check('Actual version changed after preview rejects confirmation',async()=>{
  await a('preview1').update({plannedDailyAreaHa:11})
  await assert.rejects(call({...change,baseActualVersion:checked.actualVersion}),/QC_REVISION_CONFLICT/)
  assert.equal((await q('preview1').get()).data().actualAreaHa,5)
  assert.equal((await d('qc_admin_audit','historical_op-preview1').get()).exists,false)
 })
 await check('refreshed preview matches committed result',async()=>{
  const again=await preflight()
  assert.equal(again.actual.after.dailyVarianceHa,4)
  const final={...change,baseActualVersion:again.actualVersion}
  await call(final)
  assert.equal((await q('preview1').get()).data().actualAreaHa,again.after.actualAreaHa)
  assert.equal((await a('preview1').get()).data().dailyVarianceHa,again.actual.after.dailyVarianceHa)
  assert.equal((await call(final)).replayed,true)
 })
 await check('invalid linked Actual rejected at preview stage',async()=>{
  await a('preview2').update({actualAreaHa:99})
  const c=cmd('preview2',(await preview('preview2')).version,{area:8})
  await assert.rejects(call({...c,action:'previewHistoricalQc'}),/QC_ACTUAL_LINK_CONFLICT/)
  assert.equal((await q('preview2').get()).data().actualAreaHa,5)
 })
 await check('fertilizer verified preview derives dosage without writes',async()=>{
  const c=cmd('preview3',(await preview('preview3')).version,{fillings:[{jumlah:600,hasilKerja:2},{jumlah:900,hasilKerja:4}]})
  const p=await call({...c,action:'previewHistoricalQc'})
  assert.equal(p.after.weightedActualDosage,250);assert.equal(p.after.averageActualDosage,262.5)
  assert.equal(p.after.pengisianList[1].dosisAktual,225)
  assert.equal((await q('preview3').get()).data().pengisianList[1].hasilKerja,3)
 })
 await check('forbidden field rejected during verified preview',async()=>{
  const c=cmd('preview3',(await preview('preview3')).version,{ownerUid:'histowner'})
  await assert.rejects(call({...c,action:'previewHistoricalQc'}),/INVALID_COMMAND/)
 })
 console.log('SUCCESS: '+n+' historical QC correction checks passed (local Firestore emulator only)')
}finally{await env.cleanup();await deleteApp(app)}
