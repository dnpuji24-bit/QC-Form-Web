// 11D.5c.2b: focused full operational Spray/Fertilizer HTTP UAT, photo-free.
// Uses the real trusted group/snapshot + full DTO commit services through the unified router.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {permissionsForIdentity} from '../src/qcUatCustomRoles.mjs'
import {prepareUnifiedFullQc} from '../src/qcUatUnifiedFullQcTransport.mjs'
import {planningSprayFixture} from './qc-uat-planning-spray-fixture.mjs'
import {planningFertilizerFixture} from './qc-uat-planning-fertilizer-fixture.mjs'
import {unifiedGuard,unifiedProjectId,unifiedHost,unifiedAuthPort,unifiedFirestorePort} from '../server/qc-photo-access/uat-unified-identity-guard.mjs'
import {createPlanningMasterSnapshotService} from '../server/qc-photo-access/uat-planning-role-service.mjs'
import {createUnifiedPlanningHttp,unifiedPaths,unifiedPlanningOrigin,unifiedPlanningPort,classifyUnifiedPlanningError} from '../server/qc-photo-access/uat-unified-planning-http.mjs'
import {shellRoute,planningPrefix} from '../server/qc-photo-access/uat-unified-browser-shell.mjs'

assert.ok(['--self-test','--emulator'].includes(process.argv[2])&&process.argv.length===3)
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const fullRoutes=[unifiedPaths.fullSource,unifiedPaths.fullSprayCommit,unifiedPaths.fullFertilizerCommit]
for(const route of fullRoutes){
 assert.equal(shellRoute(planningPrefix+route)?.target,unifiedPlanningOrigin+route)
 assert.equal(shellRoute(planningPrefix+route+'?query=evil'),null)
}
assert.equal(new Set(Object.values(unifiedPaths)).size,Object.values(unifiedPaths).length)
assert.deepEqual(classifyUnifiedPlanningError(Error('PLANNING_FORM_MISMATCH')),[409,'CONTRACT_REJECTED'])
assert.deepEqual(classifyUnifiedPlanningError(Error('MISSING_DAILY_PLAN')),[409,'CONTRACT_REJECTED'])
assert.deepEqual(classifyUnifiedPlanningError(Error('QC_PERMISSION_DENIED')),[403,'ACCESS_DENIED'])
assert.deepEqual(classifyUnifiedPlanningError(Error('UNEXPECTED_SERVER_FAILURE')),[500,'SERVICE_UNAVAILABLE'])
assert.equal(shellRoute('/api/owner'+unifiedPaths.fullSprayCommit),null)
for(const p of ['src/main.tsx','src/App.tsx','server/qc-photo-access/index.mjs']){
 assert.doesNotMatch(src(p),/UatUnifiedOperationalForm|uat-unified-planning-http|qcUatUnifiedFullQcTransport/)
}
const fakeSource={testOnly:true,kind:'spray',dailyPlanId:'uat-d',date:'2026-11-03',dailyRevision:0,executionShift:'1',executionForemanId:'uat-f'}
assert.throws(()=>prepareUnifiedFullQc({source:fakeSource}),{message:'INVALID_FULL_QC_ENVELOPE'})
assert.throws(()=>prepareUnifiedFullQc({source:fakeSource,record:{formType:'spray',ownerUid:'uat-a',inputtedBy:'uat-a',photoBase64:'secret',saveType:'ready'},baseRevision:null,jobId:'uat-j',uploaderUid:'uat-a',expectedDailyRevision:0,foremanId:'uat-f'}),{message:'PHOTO_GATE_PENDING'})
console.log('SUCCESS: full DTO unified UAT exact routes, photo and source isolation guards passed (offline)')
if(process.argv[2]==='--emulator'){
 unifiedGuard()
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp:adminInit,deleteApp:adminDelete}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore')
 const {initializeApp:clientInit,deleteApp:clientDelete}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,setDoc,terminate}=await import('firebase/firestore')
 const admin=adminInit({projectId:unifiedProjectId},'uat-full-forms-http')
 const authAdmin=getAuth(admin),adb=getFirestore(admin),clients=[],base='qc_uat_workspaces/cutover'
 const root=(c,id)=>adb.doc(base+'/'+c+'/'+id)
 const mark=uid=>adb.doc('qc_uat_identities/'+uid)
 const server=createUnifiedPlanningHttp({adb,authAdmin}),uid='uat-fullop'
 let n=0
 const check=async(label,fn)=>{try{await fn()}catch(cause){throw Error('FAIL: '+label,{cause})}n++;console.log('PASS: '+label)}
 const baseMarker=(role,manual={})=>{const m={...marker(role),policyRevision:0,roleOverrides:{},manualOverrides:manual};return {...m,permissions:permissionsForIdentity(m)}}
 async function client(account){
  const app=clientInit({projectId:unifiedProjectId,apiKey:'demo-only-not-a-real-key'},'full-client-'+account)
  const auth=initializeAuth(app,{persistence:inMemoryPersistence})
  connectAuthEmulator(auth,'http://'+unifiedHost+':'+unifiedAuthPort,{disableWarnings:true})
  const db=initializeFirestore(app,{})
  connectFirestoreEmulator(db,unifiedHost,unifiedFirestorePort)
  clients.push({app,auth,db})
  await signInWithEmailAndPassword(auth,account+'@full-forms.example.test','Synthetic-2026-'+account)
  return {token:await auth.currentUser.getIdToken(),db}
 }
 const post=async(token,path,input)=>{
  const r=await fetch(unifiedPlanningOrigin+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(input)})
  assert.equal(r.headers.get('cache-control'),'no-store')
  return {status:r.status,body:await r.json()}
 }
 const sourceRequest=(id,formType)=>({dailyPlanId:id,expectedDailyRevision:0,formType,date:'2026-11-03',shift:'1',foreman:'uat-f1'})
 const readSource=(token,id,kind)=>post(token,unifiedPaths.fullSource,{request:sourceRequest(id,kind)})
 const request=(record,source,revision=null)=>{
  const r={record,baseRevision:revision,jobId:'uat-job-'+record.id.slice('qc-v2-uat-'.length)+'-'+record.clientRevision.slice(4),uploaderUid:uid,expectedDailyRevision:source.dailyRevision,foremanId:source.executionForemanId}
  const out=prepareUnifiedFullQc({...r,source})
  assert.deepEqual(out,r)
  assert.strictEqual(out.record,record,'LOSSLESS_RECORD_REQUIRED')
  return out
 }
 try{
  assert.equal((await authAdmin.listUsers(1)).users.length,0,'FRESH_AUTH_REQUIRED')
  const collections=['users','qc_uat_identities','monthly_plans',...['monthly_plans','daily_plans','daily_work_groups','daily_group_members','monthly_plan_snapshots','daily_plan_snapshots','daily_group_snapshots','qc_records','daily_reports','qc_spray_full','qc_fertilizer_full','qc_operational_audit','qc_spray_full_audit','qc_fertilizer_full_audit'].map(v=>base+'/'+v)]
  for(const c of collections)assert.equal((await adb.collection(c).limit(1).get()).size,0,'FRESH_FIRESTORE_REQUIRED')
  for(const account of [uid,'uat-visitor']){
   await authAdmin.createUser({uid:account,email:account+'@full-forms.example.test',password:'Synthetic-2026-'+account,emailVerified:true})
   await authAdmin.setCustomUserClaims(account,{qcUat:true})
  }
  await mark(uid).set(baseMarker('asisten'))
  await mark('uat-visitor').set(baseMarker('pengunjung'))
  const p=(c,id,row)=>root(c,id).set(row)
  await adb.doc('users/root-sentinel').set({protected:true})
  await p('master_companies','uat-company',{testOnly:true,code:'uat-company',active:true})
  await p('master_paddocks','uat-p1',{testOnly:true,pid:'uat-p1',active:true,companyCode:'uat-company',farm:'Farm A',stage:'Ratoon',variety:'V1/V2',areaPaddock100:2000,plantArea100:1800,varietyBreakdown:[{variety:'V1',area100:800},{variety:'V2',area100:1000}]})
  await p('master_foremen','uat-f1',{testOnly:true,id:'uat-f1',active:true,name:'Mandor A'})
  await p('master_shifts','1',{testOnly:true,code:'1',active:true})
  await p('master_units','uat-unit',{testOnly:true,id:'uat-unit',name:'Unit 01',active:true})
  await p('master_activities','uat-as',{testOnly:true,id:'uat-as',active:true,formType:'spray',companyScope:'GLOBAL',activity:'Spray',description:'Post Emergence',components:[{materialId:'uat-herb',dosePerHa:'1.2345',unit:'L'}]})
  await p('master_materials','uat-herb',{testOnly:true,id:'uat-herb',active:true,materialName:'Synthetic Herbicide',unit:'L'})
  await p('master_activities','uat-af',{testOnly:true,id:'uat-af',active:true,formType:'fertilizer',companyScope:'GLOBAL',activity:'Fertilizer',description:'Top Dressing',components:[{materialId:'uat-nk',dosePerHa:450,unit:'kg'},{materialId:'uat-dap',dosePerHa:150,unit:'kg'}]})
  for(const [id,name] of [['uat-nk','NK'],['uat-dap','DAP']])await p('master_materials',id,{testOnly:true,id,active:true,materialName:name,unit:'kg'})
  for(const [productId,name,componentId,material] of [['uat-brand-nk','Synthetic NK','uat-nk','NK'],['uat-brand-dap','Synthetic DAP','uat-dap','DAP']]){
   await p('master_fertilizer_products',productId,{testOnly:true,productId,name,componentId,material,active:true})
  }
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(unifiedPlanningPort,unifiedHost,resolve)})
  const operator=await client(uid),visitor=await client('uat-visitor')
  const svc=createPlanningMasterSnapshotService({adb,authAdmin})
  const mpfields={pid:'uat-p1',monthKey:'2026-11',week:'W1',targetArea100:1000,activityId:'uat-as'}
  for(const [mid,activityId] of [['uat-ms','uat-as'],['uat-mf','uat-af']])await svc.createMonthly(operator.token,{id:mid,fields:{...mpfields,activityId},selectedVarieties:['V1']})
  const group=(id,activityId,formType,mid,did)=>({
   workGroupId:id,planningOrder:1,date:'2026-11-03',shift:'1',foreman:'uat-f1',activityId,formType,sourceType:'MONTHLY',
   manpower:7,unitName:'Unit 01',unitReady:1,unitStandby:0,unitBreakdown:0,notes:'',
   rows:[{dailyPlanId:did,pid:'uat-p1',monthlyPlanLineId:mid,area100:1000}]
  })
  await svc.createGroup(operator.token,group('uat-gs','uat-as','spray','uat-ms','uat-ds'))
  await svc.createGroup(operator.token,group('uat-gf','uat-af','fertilizer','uat-mf','uat-df'))
  const revised={...baseMarker('asisten',{data_plan_monthly:'none',data_plan_daily:'none'}),policyRevision:1}
  await mark(uid).set(revised)
  let ss,fs
  await check('full Spray/Fertilizer source with current QC Edit but no Planning grant',async()=>{
   assert.equal((await post(operator.token,unifiedPaths.check,{scope:'daily',operation:'view'})).status,403)
   const a=await readSource(operator.token,'uat-ds','spray')
   const b=await readSource(operator.token,'uat-df','fertilizer')
   assert.equal(a.status,200);assert.equal(b.status,200)
   ss=a.body.source;fs=b.body.source
   assert.equal(ss.areaSemantics,'SCALAR_APPLICATION')
   assert.equal(fs.areaSemantics,'COMPONENT_APPLICATION_ONLY')
   assert.equal(ss.materials.length,1);assert.equal(fs.materials.length,2)
   assert.equal(ss.sourceForemanId,'uat-f1');assert.equal(fs.executionForemanId,'uat-f1')
  })
  await check('wrong form, unknown source and visitor denied without raw document leaks',async()=>{
   assert.equal((await readSource(operator.token,'uat-df','spray')).status,409)
   assert.equal((await readSource(operator.token,'uat-missing','spray')).status,409)
   assert.equal((await readSource(visitor.token,'uat-ds','spray')).status,403)
   assert.equal((await readSource(visitor.token,'uat-df','fertilizer')).status,403)
  })
  const spray=planningSprayFixture(ss,{id:'qc-v2-uat-sprayfull',uid,revision:'uat-r1',area:9})
  const fert=planningFertilizerFixture(fs,{id:'qc-v2-uat-fertfull',uid,revision:'uat-r1'})
  const sj=request(spray,ss),fj=request(fert,fs)
  await check('full Spray saves all form fields, measured material and canonical Actual in one transaction',async()=>{
   const x=await post(operator.token,unifiedPaths.fullSprayCommit,{request:sj})
   assert.equal(x.status,200,JSON.stringify(x.body))
   assert.equal(x.body.qc.record.id,'uat-sprayfull')
   assert.deepEqual((await root('qc_spray_full','uat-sprayfull').get()).data().form,spray)
   const actual=(await root('daily_reports','qcactual_uat-sprayfull').get()).data()
   assert.equal(actual.actualArea100,900)
   assert.equal((await root('qc_operational_audit','uat-sprayfull:uat-r1').get()).exists,true)
  })
  await check('Spray exact replay is idempotent, forged measured material cannot replay',async()=>{
   assert.equal((await post(operator.token,unifiedPaths.fullSprayCommit,{request:sj})).status,200)
   const mod={...spray,actUsagePesticide1:'2000'}
   const r=await post(operator.token,unifiedPaths.fullSprayCommit,{request:{...sj,record:mod}})
   assert.notEqual(r.status,200)
   assert.equal((await adb.collection(base+'/qc_spray_full_audit').get()).size,1)
  })
  await check('full Fertilizer preserves separate NK/DAP component hectares, mass and immutable detail',async()=>{
   const x=await post(operator.token,unifiedPaths.fullFertilizerCommit,{request:fj})
   assert.equal(x.status,200,JSON.stringify(x.body))
   assert.equal(x.body.qc.record.areaSemantics,'APPLICATION_HA_ONLY')
   assert.equal(x.body.qc.actual.applicationArea100,1300)
   assert.deepEqual(x.body.qc.actual.fertilizerComponents.map(v=>v.actualArea100),[800,500])
   assert.ok(!Object.hasOwn(x.body.qc.actual,'actualArea100'))
   assert.deepEqual((await root('qc_fertilizer_full','uat-fertfull').get()).data().form,fert)
   assert.equal((await root('qc_fertilizer_full_audit','uat-fertfull:uat-r1').get()).exists,true)
  })
  await check('Fertilizer retry idempotent and Spray/Fertilizer full record paths isolated',async()=>{
   assert.equal((await post(operator.token,unifiedPaths.fullFertilizerCommit,{request:fj})).status,200)
   assert.notEqual((await post(operator.token,unifiedPaths.fullSprayCommit,{request:fj})).status,200)
   assert.equal((await adb.collection(base+'/daily_reports').get()).size,2)
   assert.equal((await adb.collection(base+'/qc_fertilizer_full_audit').get()).size,1)
  })
  await check('photo payload is rejected; no silent scanner or URL state; direct browser writes denied',async()=>{
   assert.throws(()=>prepareUnifiedFullQc({...sj,source:ss,record:{...spray,photoBase64:'data:image/jpeg;base64,AA=='}}),{message:'PHOTO_GATE_PENDING'})
   assert.throws(()=>prepareUnifiedFullQc({...fj,source:fs,record:{...fert,scanReportDriveUrl:'https://photo.example'}}),{message:'PHOTO_GATE_PENDING'})
   const huge=await post(operator.token,unifiedPaths.fullSprayCommit,{request:sj,padding:'x'.repeat(70000)})
   assert.equal(huge.status,413,'ONLY_BOUNDED_FULL_DTO')
   await assert.rejects(setDoc(doc(operator.db,base+'/qc_spray_full/uat-injected'),{testOnly:true}),{code:'permission-denied'})
   assert.deepEqual((await adb.doc('users/root-sentinel').get()).data(),{protected:true})
  })
  await check('same-token role revocation blocks new full sources, commits and replay',async()=>{
   const revoked={...baseMarker('asisten',{data_plan_monthly:'none',data_plan_daily:'none',qc_spraying:'none',qc_fertilizer:'none'}),policyRevision:2}
   await mark(uid).set(revoked)
   for(const type of ['spray','fertilizer']){
    assert.equal((await readSource(operator.token,type==='spray'?'uat-ds':'uat-df',type)).status,403)
   }
   assert.equal((await post(operator.token,unifiedPaths.fullSprayCommit,{request:sj})).status,403)
   assert.equal((await post(operator.token,unifiedPaths.fullFertilizerCommit,{request:fj})).status,403)
   assert.equal((await adb.collection(base+'/daily_reports').get()).size,2)
  })
  console.log('SUCCESS: '+n+' unified full Spray/Fertilizer UAT HTTP emulator checks passed (photo-free)')
 }finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve))
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await clientDelete(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
