// Dedicated demo project only. Never run against a shared or imported emulator.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {commitSyntheticQc} from '../src/qcUatQcLifecycleContract.mjs'
const projectId='demo-qc-uat-lifecycle',host='127.0.0.1',port=8285
const rules=readFileSync(new URL('./firestore.uat-lifecycle-demo.rules',import.meta.url),'utf8')
const config=JSON.parse(readFileSync(new URL('../firebase.uat-lifecycle-emulator.json',import.meta.url),'utf8'))
function guard(e=process.env){
  assert.equal(e.GCLOUD_PROJECT,projectId,'DEMO_PROJECT_REQUIRED')
  assert.equal(e.FIRESTORE_EMULATOR_HOST,host+':'+port,'LOOPBACK_EMULATOR_REQUIRED')
  for(const k of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[k])assert.equal(e[k],projectId,'WRONG_PROJECT')
}
function offline(){
  const valid={GCLOUD_PROJECT:projectId,FIRESTORE_EMULATOR_HOST:host+':'+port}
  guard(valid)
  for(const e of [{},{...valid,GCLOUD_PROJECT:'form-qc-unm'},{...valid,FIRESTORE_EMULATOR_HOST:'localhost:8185'},{...valid,FIRESTORE_EMULATOR_HOST:'remote:8285'},{...valid,GOOGLE_CLOUD_PROJECT:'form-qc-unm'}])assert.throws(()=>guard(e))
  assert.equal(config.firestore.rules,'scripts/firestore.uat-lifecycle-demo.rules')
  assert.deepEqual(config.emulators.firestore,{host,port})
  assert.ok(rules.includes('getAfter(')&&rules.includes('allow read, write: if false'))
  console.log('SUCCESS: lifecycle demo project, loopback and source guards passed (offline)')
}
if(process.argv.length!==3||!['--self-test','--emulator'].includes(process.argv[2]))throw Error('Use --self-test or --emulator')
offline()
if(process.argv[2]==='--emulator'){
  guard()
  const {initializeTestEnvironment,assertFails}=await import('@firebase/rules-unit-testing')
  const {doc,getDoc,setDoc,deleteDoc,collection,getDocs,writeBatch,runTransaction}=await import('firebase/firestore')
  const env=await initializeTestEnvironment({projectId,firestore:{host,port,rules}})
  const prefix=['qc_uat_workspaces','cutover']
  const path=(db,c,id)=>doc(db,...prefix,c,id)
  const actor=(uid,claim=true)=>env.authenticatedContext(uid,claim?{qcUat:true}:{}).firestore()
  const spray=actor('uat-spray'),fert=actor('uat-fert'),other=actor('uat-other'),stale=actor('uat-spray',false),disabled=actor('uat-disabled'),prod=actor('uat-prod')
  const qc=(kind='spray',id='uat-q1',owner='uat-spray')=>({testOnly:true,id,ownerUid:owner,inputtedBy:owner,formType:kind,clientRevision:'uat-r1',saveType:'draft',dailyPlanId:'uat-d-'+kind,monthlyPlanLineId:'uat-m-'+kind,pid:'uat-pid',date:'2026-11-12',shift:'2',foreman:'uat-foreman',actualArea100:250,sessionId:'uat-session'})
  const daily=r=>({testOnly:true,dailyPlanId:r.dailyPlanId,monthlyPlanLineId:r.monthlyPlanLineId,pid:r.pid,date:r.date,shift:r.shift,foreman:r.foreman,formType:r.formType,area100:300})
  const run=(db,r,baseRevision=null,jobId='uat-j1',uid=r.ownerUid)=>commitSyntheticQc({record:r,baseRevision,jobId,uploaderUid:uid},{
    currentUid:async()=>uid,
    transaction:fn=>runTransaction(db,async t=>{
      const read=async(c,id)=>{const s=await t.get(path(db,c,id));return s.exists()?s.data():null}
      return fn({readQc:id=>read('qc_records',id),readActual:id=>read('daily_reports',id),readAudit:id=>read('qc_operational_audit',id),readDaily:id=>read('daily_plans',id),
        writeQc:(id,r)=>t.set(path(db,'qc_records',id),r),writeActual:(id,r)=>t.set(path(db,'daily_reports',id),r),writeAudit:(id,r)=>t.set(path(db,'qc_operational_audit',id),r)})
    })
  })
  const read=(c,id)=>env.withSecurityRulesDisabled(async ctx=>{const s=await getDoc(path(ctx.firestore(),c,id));return s.exists()?s.data():null})
  const rootRead=()=>env.withSecurityRulesDisabled(async ctx=>(await getDoc(doc(ctx.firestore(),'daily_plans','root-sentinel'))).data())
  const seed=async()=>env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore(),sentinel=doc(db,'daily_plans','root-sentinel')
    assert.equal((await getDoc(sentinel)).exists(),false,'FRESH_DEMO_REQUIRED')
    for(const c of ['qc_records','daily_reports','qc_operational_audit','daily_plans'])assert.equal((await getDocs(collection(db,...prefix,c))).size,0,'FRESH_DEMO_REQUIRED')
    for(const [uid,role,enabled] of [['uat-spray','spray',true],['uat-fert','fertilizer',true],['uat-other','spray',true],['uat-disabled','spray',false],['uat-prod','spray',true]]){
      assert.equal((await getDoc(doc(db,'qc_uat_identities',uid))).exists(),false,'FRESH_DEMO_REQUIRED')
      await setDoc(doc(db,'qc_uat_identities',uid),{role,enabled,testOnly:true,workspace:'cutover'})
    }
    await setDoc(doc(db,'users','uat-prod'),{active:true})
    await setDoc(sentinel,{rootSentinel:true,testOnly:false})
    for(const r of [qc(),qc('fertilizer','uat-q2','uat-fert')])await setDoc(path(db,'daily_plans',r.dailyPlanId),daily(r))
  })
  let n=0
  async function check(name,fn){await fn();n++;console.log('PASS: '+name)}
  const q=qc(),aid='qcactual_'+q.id,qr=path(spray,'qc_records',q.id),ar=path(spray,'daily_reports',aid)
  const ready={...q,saveType:'ready',clientRevision:'uat-r2'},uploaded={...ready,saveType:'uploaded',clientRevision:'uat-r3',actualArea100:350}
  const auditId=r=>r.id+':'+r.clientRevision
  try{
    await seed()
    await check('draft QC plus audit without Actual',async()=>{await run(spray,q);assert.equal((await read('qc_records',q.id)).saveType,'draft');assert.equal(await read('daily_reports',aid),null);assert.equal((await read('qc_operational_audit',auditId(q))).saveType,'draft')})
    await check('ready creates Actual and audit atomically',async()=>{await run(spray,ready,'uat-r1','uat-j2');assert.equal((await read('daily_reports',aid)).actualArea100,250);assert.equal((await read('qc_operational_audit',auditId(ready))).revision,'uat-r2')})
    await check('uploaded correction keeps one Actual and signed variance',async()=>{await run(spray,uploaded,'uat-r2','uat-j3');const a=await read('daily_reports',aid);assert.equal(a.actualArea100,350);assert.equal(a.dailyVariance100,-50);assert.equal(a.actualReportId,aid)})
    await check('idempotent replay',async()=>{const before=await read('qc_records',q.id);await run(spray,uploaded,'uat-r2','uat-j3');assert.deepEqual(await read('qc_records',q.id),before)})
    await check('stale revision rejected',()=>assert.rejects(run(spray,{...uploaded,clientRevision:'uat-r4'},'uat-r1','uat-j4'),/QC_REVISION_CONFLICT/))
    await check('uploaded regression rejected',()=>assert.rejects(run(spray,{...uploaded,saveType:'ready',clientRevision:'uat-r4'},'uat-r3','uat-j4'),/QC_STATUS_REGRESSION/))
    await check('existing Actual removal rejected',()=>assert.rejects(run(spray,{...uploaded,actualArea100:0,clientRevision:'uat-r4'},'uat-r3','uat-j4'),/QC_ACTUAL_REMOVAL_REQUIRES_REVIEW/))
    await check('fertilizer form creates matching pair',async()=>{const r={...qc('fertilizer','uat-q2','uat-fert'),saveType:'ready'};await run(fert,r);assert.equal((await read('daily_reports','qcactual_'+r.id)).qcFormType,'fertilizer')})
    await check('unlinked ready creates no Actual',async()=>{const r={...qc('spray','uat-unlinked'),saveType:'ready',dailyPlanId:'',monthlyPlanLineId:''};await run(spray,r);assert.equal(await read('daily_reports','qcactual_'+r.id),null)})
    await check('cross-owner get denied',()=>assertFails(getDoc(path(other,'qc_records',q.id))))
    await check('wrong form get denied',()=>assertFails(getDoc(path(fert,'daily_plans',q.dailyPlanId))))
    await check('stale claim denied',()=>assertFails(getDoc(path(stale,'qc_records',q.id))))
    await check('disabled marker denied',()=>assertFails(getDoc(path(disabled,'daily_plans',q.dailyPlanId))))
    await check('production profile plus claim denied',()=>assertFails(getDoc(path(prod,'daily_plans',q.dailyPlanId))))
    await check('unauthenticated denied',()=>assertFails(getDoc(path(env.unauthenticatedContext().firestore(),'daily_plans',q.dailyPlanId))))
    await check('root read and write denied',async()=>{await assertFails(getDoc(doc(spray,'daily_plans','root-sentinel')));await assertFails(setDoc(doc(spray,'daily_plans','root-sentinel'),{testOnly:true}))})
    await check('other workspace denied',()=>assertFails(setDoc(doc(spray,'qc_uat_workspaces','other','qc_records','uat-x'),{testOnly:true})))
    await check('list denied',()=>assertFails(getDocs(collection(spray,...prefix,'qc_records'))))
    await check('client marker provisioning denied',()=>assertFails(setDoc(doc(spray,'qc_uat_identities','uat-new'),{testOnly:true})))
    await check('client DP mutation denied',()=>assertFails(setDoc(path(spray,'daily_plans',q.dailyPlanId),daily(q))))
    const saved=await read('qc_records',q.id),actual=await read('daily_reports',aid),audit=await read('qc_operational_audit',auditId(uploaded))
    const next={...saved,clientRevision:'uat-r4',operationalSaveId:'uat-j4',actualArea100:400}
    const nextA={...actual,clientRevision:'uat-r4',actualArea100:400,dailyVariance100:-100}
    const nextU={...audit,revision:'uat-r4'}
    const ur=path(spray,'qc_operational_audit',q.id+':uat-r4')
    const batch=(qv,av,uv)=>{const b=writeBatch(spray);if(qv)b.set(qr,qv);if(av)b.set(ar,av);if(uv)b.set(ur,uv);return b.commit()}
    await check('direct QC write without pair denied',()=>assertFails(batch(next,null,null)))
    await check('QC and Actual without audit denied',()=>assertFails(batch(next,nextA,null)))
    await check('QC and audit without updated Actual denied',()=>assertFails(batch(next,null,nextU)))
    await check('mismatched Actual area denies whole batch',()=>assertFails(batch(next,{...nextA,actualArea100:999},nextU)))
    await check('mismatched audit actor denies whole batch',()=>assertFails(batch(next,nextA,{...nextU,actorUid:'uat-other'})))
    await check('DP metadata mismatch denies whole batch',()=>assertFails(batch({...next,shift:'1'},{...nextA,shift:'1'},nextU)))
    await check('unexpected field denied',()=>assertFails(batch({...next,photoBase64:'not-allowed'},nextA,nextU)))
    await check('standalone Actual denied',()=>assertFails(setDoc(ar,{...actual,actualArea100:999})))
    await check('standalone audit denied',()=>assertFails(setDoc(ur,nextU)))
    await check('audit overwrite denied',()=>assertFails(setDoc(path(spray,'qc_operational_audit',auditId(uploaded)),audit)))
    await check('all deletes denied',async()=>{for(const d of [qr,ar,path(spray,'qc_operational_audit',auditId(uploaded))])await assertFails(deleteDoc(d))})
    await check('all denied attempts leave QC Actual audit unchanged',async()=>{assert.deepEqual(await read('qc_records',q.id),saved);assert.deepEqual(await read('daily_reports',aid),actual);assert.deepEqual(await read('qc_operational_audit',auditId(uploaded)),audit);assert.equal(await read('qc_operational_audit',q.id+':uat-r4'),null)})
    await check('valid correction after denied batches',async()=>{await run(spray,{...uploaded,clientRevision:'uat-r4',actualArea100:400},'uat-r3','uat-j4');assert.equal((await read('daily_reports',aid)).actualArea100,400)})
    await check('root sentinel unchanged',async()=>assert.deepEqual(await rootRead(),{rootSentinel:true,testOnly:false}))
    console.log('SUCCESS: '+n+' lifecycle Firestore SDK and Rules checks passed (dedicated demo emulator only)')
  }finally{await env.cleanup()}
}
