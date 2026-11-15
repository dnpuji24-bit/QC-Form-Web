// Dedicated role demo, mock tokens; no production access or real role grants.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {marker} from '../src/qcUatRolePermissions.mjs'
import {commitSyntheticQc} from '../src/qcUatQcLifecycleContract.mjs'
const projectId='demo-qc-uat-roles',host='127.0.0.1',port=8385
const rules=readFileSync(new URL('./firestore.uat-role-demo.rules',import.meta.url),'utf8')
const config=JSON.parse(readFileSync(new URL('../firebase.uat-role-emulator.json',import.meta.url),'utf8'))
function guard(e=process.env){
 assert.equal(e.GCLOUD_PROJECT,projectId,'DEMO_PROJECT_REQUIRED')
 assert.equal(e.FIRESTORE_EMULATOR_HOST,host+':'+port,'LOOPBACK_REQUIRED')
 for(const k of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[k])assert.equal(e[k],projectId,'WRONG_PROJECT')
}
assert.ok(process.argv.length===3&&['--self-test','--emulator'].includes(process.argv[2]))
const valid={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:host+':'+port}
guard(valid)
for(const e of [{},{...valid,GCLOUD_PROJECT:'form-qc-unm'},{...valid,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8285'},{...valid,GOOGLE_CLOUD_PROJECT:'form-qc-unm'}])assert.throws(()=>guard(e))
assert.equal(config.firestore.rules,'scripts/firestore.uat-role-demo.rules')
assert.deepEqual(config.emulators.firestore,{host,port})
assert.ok(rules.includes("q.inputtedBy == request.auth.uid"))
console.log('SUCCESS: role demo environment and source guards passed (offline)')
if(process.argv[2]==='--emulator'){
 guard()
 const {initializeTestEnvironment,assertFails}=await import('@firebase/rules-unit-testing')
 const {doc,getDoc,setDoc,collection,getDocs,runTransaction,deleteDoc}=await import('firebase/firestore')
 const env=await initializeTestEnvironment({projectId,firestore:{host,port,rules}})
 const prefix=['qc_uat_workspaces','cutover']
 const path=(db,c,id)=>doc(db,...prefix,c,id)
 const actor=(uid,claim=true)=>env.authenticatedContext(uid,claim?{qcUat:true}:{}).firestore()
 const fixtures={
  'uat-owner':marker('owner'),'uat-asisten':marker('asisten'),'uat-manager':marker('manager'),'uat-admin':marker('admin'),
  'uat-spray':marker('mandor_spraying'),'uat-fert':marker('mandor_fertilizer'),'uat-visitor':marker('pengunjung'),
  'uat-other':marker('mandor_spraying'),'uat-revoked':marker('mandor_spraying',{qc_spraying:'none'}),
  'uat-view':marker('mandor_spraying',{qc_spraying:'view'}),'uat-override':marker('pengunjung',{qc_spraying:'none'},{qc_spraying:'edit'}),
  'uat-disabled':marker('owner',{}, {},false),'uat-prod':marker('owner'),
  'uat-none':marker('pengunjung',{qc_records:'none',qc_dashboard:'none'}),
  'uat-badmode':{...marker('owner'),permissions:{qc_spraying:'invalid'}},
  'uat-badrole':{...marker('owner'),role:'unknown'}
 }
 const qc=(uid,kind='spray',id='uat-q-'+uid.slice(4)+'-'+kind)=>({testOnly:true,id,ownerUid:uid,inputtedBy:uid,formType:kind,clientRevision:'uat-r1',saveType:'ready',dailyPlanId:'uat-d-'+kind,monthlyPlanLineId:'uat-m-'+kind,pid:'uat-pid',date:'2026-11-12',shift:'2',foreman:'uat-foreman',actualArea100:250,sessionId:'uat-session'})
 const daily=r=>({testOnly:true,dailyPlanId:r.dailyPlanId,monthlyPlanLineId:r.monthlyPlanLineId,pid:r.pid,date:r.date,shift:r.shift,foreman:r.foreman,formType:r.formType,area100:300})
 const run=(db,r,baseRevision=null,jobId='uat-j1')=>commitSyntheticQc({record:r,baseRevision,jobId,uploaderUid:r.ownerUid},{
  currentUid:async()=>r.ownerUid,transaction:fn=>runTransaction(db,async t=>{
   const read=async(c,id)=>{const s=await t.get(path(db,c,id));return s.exists()?s.data():null}
   return fn({readQc:id=>read('qc_records',id),readActual:id=>read('daily_reports',id),readAudit:id=>read('qc_operational_audit',id),readDaily:id=>read('daily_plans',id),writeQc:(id,r)=>t.set(path(db,'qc_records',id),r),writeActual:(id,r)=>t.set(path(db,'daily_reports',id),r),writeAudit:(id,r)=>t.set(path(db,'qc_operational_audit',id),r)})
  })
 })
 const privileged=async fn=>{let result;await env.withSecurityRulesDisabled(async ctx=>{result=await fn(ctx.firestore())});assert.notEqual(result,undefined,'PRIVILEGED_READBACK_UNDEFINED');return result}
 const read=(c,id)=>privileged(async db=>{const s=await getDoc(path(db,c,id));return s.exists()?s.data():null})
 const get=(uid,c,id,claim=true)=>getDoc(path(actor(uid,claim),c,id))
 const writeMarker=(uid,m)=>env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'qc_uat_identities',uid),m))
 let n=0
 const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
 const q=qc('uat-spray'),aid='qcactual_'+q.id,au=q.id+':'+q.clientRevision
 const assertAbsent=async r=>{for(const [c,id] of [['qc_records',r.id],['daily_reports','qcactual_'+r.id],['qc_operational_audit',r.id+':'+r.clientRevision]])assert.equal(await read(c,id),null)}
 try{
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore()
   for(const c of ['qc_records','daily_reports','qc_operational_audit','daily_plans'])assert.equal((await getDocs(collection(db,...prefix,c))).size,0,'FRESH_DEMO_REQUIRED')
   for(const [uid,m] of Object.entries(fixtures)){const d=doc(db,'qc_uat_identities',uid);assert.equal((await getDoc(d)).exists(),false,'FRESH_DEMO_REQUIRED');await setDoc(d,m)}
   await setDoc(doc(db,'users','uat-prod'),{active:true})
   await setDoc(doc(db,'daily_plans','root-sentinel'),{testOnly:false,rootSentinel:true})
   for(const r of [q,qc('uat-fert','fertilizer')])await setDoc(path(db,'daily_plans',r.dailyPlanId),daily(r))
  })
  await check('mandor spray creates own QC Actual audit',async()=>{await run(actor('uat-spray'),q);assert.equal((await read('daily_reports',aid)).ownerUid,'uat-spray')})
  await check('mandor fertilizer creates own pair',async()=>{const r=qc('uat-fert','fertilizer');await run(actor('uat-fert'),r);assert.equal((await read('daily_reports','qcactual_'+r.id)).qcFormType,'fertilizer')})
  for(const uid of ['uat-owner','uat-asisten'])await check(uid+' can create own both form types',async()=>{for(const kind of ['spray','fertilizer']){const r=qc(uid,kind);await run(actor(uid),r);assert.equal((await read('qc_records',r.id)).ownerUid,uid)}})
  for(const uid of ['uat-manager','uat-admin','uat-visitor'])await check(uid+' reads synthetic QC but cannot create form by default',async()=>{assert.equal((await get(uid,'qc_records',q.id)).data().id,q.id);const r=qc(uid);await assertFails(run(actor(uid),r));await assertAbsent(r)})
  await check('mandor sees own QC',async()=>assert.equal((await get('uat-spray','qc_records',q.id)).data().ownerUid,'uat-spray'))
  await check('same role cannot see another mandor QC',()=>assertFails(get('uat-other','qc_records',q.id)))
  await check('wrong form cannot create pair',async()=>{const r=qc('uat-spray','fertilizer');await assertFails(run(actor('uat-spray'),r));await assertAbsent(r)})
  await check('role-level none revokes form',async()=>{const r=qc('uat-revoked');await assertFails(run(actor('uat-revoked'),r));await assertAbsent(r)})
  await check('view can read DP but cannot create',async()=>{assert.equal((await get('uat-view','daily_plans',q.dailyPlanId)).data().area100,300);const r=qc('uat-view');await assertFails(run(actor('uat-view'),r));await assertAbsent(r)})
  await check('explicit user override grants own form transaction',async()=>{const r=qc('uat-override');await run(actor('uat-override'),r);assert.equal((await read('daily_reports','qcactual_'+r.id)).ownerUid,r.ownerUid)})
  await check('none denies even missing QC read',()=>assertFails(get('uat-none','qc_records','uat-missing')))
  await check('invalid role denied',()=>assertFails(get('uat-badrole','qc_records',q.id)))
  await check('invalid permission mode fails closed',()=>assertFails(get('uat-badmode','daily_plans',q.dailyPlanId)))
  await check('disabled marker denied',()=>assertFails(get('uat-disabled','qc_records',q.id)))
  await check('stale claim denied',()=>assertFails(get('uat-spray','qc_records',q.id,false)))
  await check('production profile denied',()=>assertFails(get('uat-prod','qc_records',q.id)))
  await check('missing marker denied',()=>assertFails(get('uat-unknown','qc_records',q.id)))
  await check('forged inputtedBy denied',async()=>{const r={...qc('uat-owner','spray','uat-forged'),inputtedBy:'uat-other'};await assertFails(run(actor('uat-owner'),r));await assertAbsent(r)})
  await check('manager cannot edit foreign QC even qc_records edit',async()=>{const d=path(actor('uat-manager'),'qc_records',q.id);await assertFails(setDoc(d,{...(await read('qc_records',q.id)),clientRevision:'uat-r2'}))})
  await check('manager logs view and no Actual permission',async()=>{assert.equal((await get('uat-manager','qc_operational_audit',au)).data().actorUid,q.ownerUid);await assertFails(get('uat-manager','daily_reports',aid))})
  await check('asisten Actual view works',async()=>assert.equal((await get('uat-asisten','daily_reports',aid)).data().actualArea100,250))
  await check('mandor automatic Actual read despite no menu access',async()=>assert.equal((await get('uat-spray','daily_reports',aid)).data().actualArea100,250))
  await check('server marker downgrade takes effect',async()=>{await writeMarker('uat-spray',marker('mandor_spraying',{}, {qc_spraying:'none'}));const r={...q,clientRevision:'uat-r2',actualArea100:260};await assertFails(run(actor('uat-spray'),r,'uat-r1','uat-j2'));assert.equal((await read('qc_records',q.id)).clientRevision,'uat-r1');await writeMarker('uat-spray',fixtures['uat-spray']);await run(actor('uat-spray'),r,'uat-r1','uat-j2');assert.equal((await read('daily_reports',aid)).actualArea100,260)})
  await check('owner cannot self-provision marker',()=>assertFails(setDoc(doc(actor('uat-owner'),'qc_uat_identities','uat-new'),marker('owner'))))
  await check('owner cannot write standalone Actual or delete QC',async()=>{await assertFails(setDoc(path(actor('uat-owner'),'daily_reports',aid),{...(await read('daily_reports',aid)),actualArea100:999}));await assertFails(deleteDoc(path(actor('uat-owner'),'qc_records',q.id)))})
  await check('owner cannot list or reach root',async()=>{const db=actor('uat-owner');await assertFails(getDocs(collection(db,...prefix,'qc_records')));await assertFails(getDoc(doc(db,'daily_plans','root-sentinel')));await assertFails(setDoc(doc(db,'daily_plans','root-sentinel'),{testOnly:true}))})
  await check('root sentinel unchanged',async()=>assert.deepEqual(await privileged(async db=>(await getDoc(doc(db,'daily_plans','root-sentinel'))).data()),{testOnly:false,rootSentinel:true}))
  console.log('SUCCESS: '+n+' role Firestore SDK and Rules checks passed (dedicated demo emulator only)')
 }finally{await env.cleanup()}
}
