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
import {createPlanningMasterSnapshotService,createPlanningPhotoCommitService} from '../server/qc-photo-access/uat-planning-role-service.mjs'
import {createMemoryPhotoObjectStore} from '../server/qc-photo-access/uat-unified-photo-trusted-stage.mjs'
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

   const store=createMemoryPhotoObjectStore(),service=createPlanningPhotoCommitService({adb,authAdmin,photoStore:store})
   const ss=(await readSource(operator.token,'uat-ds','spray')).body.source
   const fs=(await readSource(operator.token,'uat-df','fertilizer')).body.source
   const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGM0atryn4GBgYGJAQoAJCYCa4s7a6wAAAAASUVORK5CYII='
   const photo={action:'replace',kind:'main',dataUrl:png}
   const spray=planningSprayFixture(ss,{id:'qc-v2-uat-photo-s',uid,revision:'uat-r1',area:9})
   const fert=planningFertilizerFixture(fs,{id:'qc-v2-uat-photo-f',uid,revision:'uat-r1'})
   const sr=request(spray,ss),fr=request(fert,fs)
   const si={sourceRequest:sourceRequest('uat-ds','spray'),request:sr,photos:[photo]}
   const fi={sourceRequest:sourceRequest('uat-df','fertilizer'),request:fr,photos:[photo,{action:'replace',kind:'scan',dataUrl:png}]}
   const get=(c,id)=>root(c,id).get()
   await check('Spray full QC + Actual + verified photo manifest and immutable audit are atomic',async()=>{
    const out=await service.commit(operator.token,si)
    assert.equal(out.photo.status,'committed');assert.equal(out.photo.count,1)
    assert.equal((await get('qc_records','uat-photo-s')).exists,true)
    assert.equal((await get('daily_reports','qcactual_uat-photo-s')).data().actualArea100,900)
    assert.deepEqual((await get('qc_spray_full','uat-photo-s')).data().form,spray)
    const manifest=(await get('qc_photo_manifests','uat-photo-s')).data()
    assert.deepEqual((await get('qc_photo_manifest_audit','uat-photo-s:uat-r1')).data(),manifest)
    assert.equal(manifest.manifest.main.bucket,store.bucket);assert.equal(store.stats.puts,1)
   })
   await check('Spray replay idempotent; photo-free HTTP cannot strip existing refs',async()=>{
    await service.commit(operator.token,si)
    assert.equal(store.stats.puts,1)
    assert.equal((await post(operator.token,unifiedPaths.fullSprayCommit,{request:sr})).status,409)
    assert.equal((await adb.collection(base+'/qc_photo_manifest_audit').get()).size,1)
   })
   await check('Fertilizer main+scan produces independent NK/DAP Actual and photo ledger',async()=>{
    const out=await service.commit(operator.token,fi)
    assert.equal(out.photo.count,2)
    const a=(await get('daily_reports','qcactual_uat-photo-f')).data()
    assert.deepEqual(a.fertilizerComponents.map(x=>x.actualArea100),[800,500])
    assert.equal(a.applicationArea100,1300)
    assert.ok(!Object.hasOwn(a,'actualArea100'))
    assert.deepEqual((await get('qc_fertilizer_full','uat-photo-f')).data().form,fert)
    const m=(await get('qc_photo_manifests','uat-photo-f')).data()
    assert.deepEqual(Object.keys(m.manifest).sort(),['main','scan'])
    assert.deepEqual((await get('qc_photo_manifest_audit','uat-photo-f:uat-r1')).data(),m)
    assert.equal(store.stats.puts,3)
   })
   await check('Fertilizer exact retry creates no duplicate; old photo-free path denies',async()=>{
    await service.commit(operator.token,fi)
    assert.equal(store.stats.puts,3)
    assert.equal((await post(operator.token,unifiedPaths.fullFertilizerCommit,{request:fr})).status,409)
    assert.equal((await adb.collection(base+'/qc_photo_manifest_audit').get()).size,2)
   })
   await check('changing record revision remains blocked until photo correction is tested',async()=>{
    const newer={...spray,clientRevision:'uat-r2'}
    const r={...sr,record:newer,baseRevision:'uat-r1',jobId:'uat-job-photo-v2'}
    await assert.rejects(()=>service.commit(operator.token,{...si,request:r}),{message:'PHOTO_CORRECTION_NOT_ENABLED'})
    assert.equal((await get('qc_photo_manifest_audit','uat-photo-s:uat-r2')).exists,false)
    assert.equal((await get('qc_records','uat-photo-s')).data().clientRevision,'uat-r1')
   })
   await check('conflicting audit rolls Firestore back but leaves explicitly uncommitted staged object',async()=>{
    const rec=planningSprayFixture(ss,{id:'qc-v2-uat-photo-failed',uid,revision:'uat-r1',area:8})
    await root('qc_operational_audit','uat-photo-failed:uat-r1').set({testOnly:true,collision:true})
    await assert.rejects(()=>service.commit(operator.token,{...si,request:request(rec,ss)}))
    for(const [c,id] of [['qc_records','uat-photo-failed'],['daily_reports','qcactual_uat-photo-failed'],
      ['qc_spray_full','uat-photo-failed'],['qc_photo_manifests','uat-photo-failed'],
      ['qc_photo_manifest_audit','uat-photo-failed:uat-r1']])assert.equal((await get(c,id)).exists,false,c)
    assert.equal(store.stats.puts,4,'mock staged object remains uncommitted, never auto-deleted')
    assert.ok(store.inspect().some(p=>p.includes('photo-failed')))
   })
   await check('foreign/forged identity blocked before photo upload',async()=>{
    const before=store.stats.puts
    await assert.rejects(()=>service.commit(visitor.token,si))
    await assert.rejects(()=>service.commit(operator.token,{...si,request:{...sr,uploaderUid:'uat-visitor'}}))
    assert.equal(store.stats.puts,before)
   })
   await check('role revocation blocks same token for original and new photo commits',async()=>{
    await mark(uid).set({...baseMarker('asisten',{qc_spraying:'none',qc_fertilizer:'none'}),policyRevision:2})
    const before=store.stats.puts
    await assert.rejects(()=>service.commit(operator.token,si))
    await assert.rejects(()=>service.commit(operator.token,fi))
    assert.equal(store.stats.puts,before)
   })
   await check('direct browser writes remain denied, no production or root mutation',async()=>{
    await assert.rejects(setDoc(doc(operator.db,base+'/qc_photo_manifests/uat-forged'),{testOnly:true}),{code:'permission-denied'})
    assert.deepEqual((await adb.doc('users/root-sentinel').get()).data(),{protected:true})
    assert.equal((await adb.collection(base+'/qc_photo_manifests').get()).size,2)
    assert.equal((await adb.collection(base+'/daily_reports').get()).size,2)
   })
   console.log('SUCCESS: '+n+' isolated atomic photo/QC/Actual emulator checks passed (MOCK photos, NO Supabase upload)')

 }finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve))
  for(const c of clients){await signOut(c.auth);await terminate(c.db);await clientDelete(c.app)}
  await adb.terminate();await adminDelete(admin)
 }
}
