import assert from 'node:assert/strict'
import {syntheticPath,syntheticLimit,planCreate,qcPair} from '../src/qcUatDomainContract.mjs'
import {assertDemoEnvironment,demoProject} from './qc-uat-isolation-foundation.mjs'
import {domainRules,uatPath} from './qc-uat-domain-candidate.mjs'
import {createSyntheticDemoClient} from './qc-uat-domain-client.mjs'
const pad={area100:1000}
const act={formType:'spray'}
const mp={pid:'uat-p1',activityId:'uat-a1',targetArea100:800}
const dp={...mp,monthlyPlanLineId:'uat-m1',targetArea100:500,formType:'spray'}
const qc={pid:'uat-p1',monthlyPlanLineId:'uat-m1',dailyPlanId:'uat-d1',formType:'spray',actualArea100:400}
let n=0
function ok(label,fn){fn();n++;console.log('PASS: '+label)}
async function check(label,fn,deny=false){
 if(deny)await assert.rejects(fn,{code:'permission-denied'})
 else await fn()
 n++;console.log('PASS: '+label)
}
function offline(){
 const ts=Symbol('timestamp')
 ok('all six paths match candidate contract',()=>{for(const c of ['master_paddocks','master_activities','monthly_plans','daily_plans','qc_records','daily_reports'])assert.deepEqual(syntheticPath(c,'uat-x'),uatPath(c,'uat-x'))})
 ok('root and path injection rejected',()=>{for(const [c,id] of [['users','uat-x'],['qc_records','../uat-x'],['qc_records','real-id'],['qc_records','uat-X']])assert.throws(()=>syntheticPath(c,id))})
 ok('query bounds validated',()=>{assert.equal(syntheticLimit(),20);for(const v of [0,101,1.5,'20',null])assert.throws(()=>syntheticLimit(v))})
 ok('paddock ID and metadata generated',()=>assert.deepEqual(planCreate('master_paddocks','uat-p1',pad,'planner',ts),{testOnly:true,ownerUid:'planner',createdAt:ts,pid:'uat-p1',area100:1000}))
 ok('activity form validated',()=>{assert.equal(planCreate('master_activities','uat-a1',act,'planner',ts).formType,'spray');assert.throws(()=>planCreate('master_activities','uat-a1',{formType:'other'},'planner',ts))})
 ok('MP and DP fields mapped exactly',()=>{for(const [c,d] of [['monthly_plans',mp],['daily_plans',dp]])assert.deepEqual(planCreate(c,'uat-x',d,'planner',ts),{testOnly:true,ownerUid:'planner',createdAt:ts,...d})})
 ok('QC and Actual share exact metadata and linkage',()=>{const p=qcPair('uat-q1',qc,'sprayer',ts);assert.deepEqual(p.qc,{testOnly:true,ownerUid:'sprayer',createdAt:ts,...qc});assert.deepEqual(p.actual,{...p.qc,sourceOrigin:'QC',qcRecordId:'uat-q1'})})
 ok('caller cannot supply actor, timestamp, test marker or photo',()=>{for(const extra of [{ownerUid:'other'},{createdAt:0},{testOnly:false},{photoDriveUrl:'x'},{sourceOrigin:'QC'}])assert.throws(()=>qcPair('uat-q1',{...qc,...extra},'sprayer',ts))})
 ok('invalid area and references denied before SDK',()=>{for(const v of [0,-1,1.5,100001,'20',NaN])assert.throws(()=>qcPair('uat-q1',{...qc,actualArea100:v},'sprayer',ts));assert.throws(()=>qcPair('uat-q1',{...qc,dailyPlanId:'production'},'sprayer',ts))})
 ok('no standalone QC or Actual write mapper',()=>{for(const c of ['qc_records','daily_reports'])assert.throws(()=>planCreate(c,'uat-x',qc,'sprayer',ts))})
 ok('accessor, custom prototype and invalid actor rejected',()=>{assert.throws(()=>planCreate('master_paddocks','uat-x',{get area100(){return 1}},'planner',ts));assert.throws(()=>planCreate('master_paddocks','uat-x',Object.assign(Object.create({}),pad),'planner',ts));assert.throws(()=>qcPair('uat-x',qc,'a/b',ts))})
 console.log('SUCCESS: '+n+' synthetic UAT DTO contract checks passed (offline)')
}
if(process.argv.length!==3)throw Error('Use --self-test or --emulator')
if(process.argv[2]==='--self-test'){
 offline()
 await assert.rejects(()=>createSyntheticDemoClient('planner'),/DEMO_PROJECT_REQUIRED|LOOPBACK_EMULATOR_REQUIRED|WRONG_PROJECT/)
 console.log('PASS: SDK adapter refuses non-demo environment')
}else if(process.argv[2]==='--emulator'){
 assertDemoEnvironment();offline();n=0
 const {initializeTestEnvironment}=await import('@firebase/rules-unit-testing')
 const {doc,setDoc,getDoc}=await import('firebase/firestore')
 const env=await initializeTestEnvironment({projectId:demoProject,firestore:{host:'127.0.0.1',port:8185,rules:domainRules()}})
 const clients=[]
 const client=async(uid,claim=true)=>{const c=await createSyntheticDemoClient(uid,claim);clients.push(c);return c}
 try{
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async c=>{
   const db=c.firestore()
   for(const [uid,role,enabled] of [['planner','asisten',true],['sprayer','mandor_spraying',true],['fert','mandor_fertilizer',true],['viewer','pengunjung',true],['disabled','owner',false]]){
    await setDoc(doc(db,'qc_uat_identities',uid),{role,enabled,testOnly:true,workspace:'cutover'})
   }
   await setDoc(doc(db,'users','prod'),{role:'owner',active:true,status:'approved',username:'prod'})
   await setDoc(doc(db,'daily_plans','uat-d1'),{rootSentinel:true})
  })
  const planner=await client('planner'),sprayer=await client('sprayer'),fert=await client('fert'),viewer=await client('viewer'),prod=await client('prod',false),stale=await client('planner',false),disabled=await client('disabled'),unknown=await client('unknown')
  await check('SDK planner creates paddock',()=>planner.createPlan('master_paddocks','uat-p1',pad))
  await check('SDK planner creates activity',()=>planner.createPlan('master_activities','uat-a1',act))
  await check('SDK planner creates MP',()=>planner.createPlan('monthly_plans','uat-m1',mp))
  await check('SDK planner creates DP',()=>planner.createPlan('daily_plans','uat-d1',dp))
  await check('SDK viewer reads DP',async()=>assert.equal((await viewer.read('daily_plans','uat-d1')).data.targetArea100,500))
  await check('SDK viewer lists bounded synthetic DP',async()=>assert.deepEqual((await viewer.list('daily_plans',10)).map(x=>x.id),['uat-d1']))
  await check('SDK viewer cannot create plan',()=>viewer.createPlan('monthly_plans','uat-m2',mp),true)
  await check('SDK production identity cannot list staging',()=>prod.list('daily_plans'),true)
  await check('SDK stale claim denied',()=>stale.read('daily_plans','uat-d1'),true)
  await check('SDK disabled identity denied',()=>disabled.read('daily_plans','uat-d1'),true)
  await check('SDK unmarked identity denied',()=>unknown.read('daily_plans','uat-d1'),true)
  await check('SDK wrong mandor form denied',()=>fert.createQcPair('uat-q1',qc),true)
  await check('SDK viewer cannot create pair',()=>viewer.createQcPair('uat-q1',qc),true)
  await check('SDK oversized linked area denied',()=>sprayer.createQcPair('uat-q1',{...qc,actualArea100:501}),true)
  await check('SDK wrong DP denied',()=>sprayer.createQcPair('uat-q1',{...qc,dailyPlanId:'uat-missing'}),true)
  await check('failed pairs leave both docs absent',()=>env.withSecurityRulesDisabled(async c=>{for(const name of ['qc_records','daily_reports'])assert.equal((await getDoc(doc(c.firestore(),...uatPath(name,'uat-q1')))).exists(),false)}))
  await check('SDK creates QC and Actual together',()=>sprayer.createQcPair('uat-q1',qc))
  await check('SDK readback confirms exact pair and timestamp',async()=>{const q=(await viewer.read('qc_records','uat-q1')).data,a=(await viewer.read('daily_reports','uat-q1')).data;assert.equal(q.ownerUid,'sprayer');assert.equal(q.actualArea100,400);assert.equal(q.createdAt.isEqual(a.createdAt),true);assert.deepEqual({...q,sourceOrigin:'QC',qcRecordId:'uat-q1'},a)})
  await check('SDK replay cannot overwrite',()=>sprayer.createQcPair('uat-q1',qc),true)
  await check('SDK duplicate plan cannot overwrite',()=>planner.createPlan('daily_plans','uat-d1',dp),true)
  await check('SDK fertilizer path works with matching masters',async()=>{await planner.createPlan('master_activities','uat-a2',{formType:'fertilizer'});await planner.createPlan('monthly_plans','uat-m2',{...mp,activityId:'uat-a2'});await planner.createPlan('daily_plans','uat-d2',{...dp,activityId:'uat-a2',monthlyPlanLineId:'uat-m2',formType:'fertilizer'});await fert.createQcPair('uat-q2',{...qc,monthlyPlanLineId:'uat-m2',dailyPlanId:'uat-d2',formType:'fertilizer'});assert.equal((await viewer.read('daily_reports','uat-q2')).data.formType,'fertilizer')})
  await check('SDK root sentinel unchanged',()=>env.withSecurityRulesDisabled(async c=>assert.deepEqual((await getDoc(doc(c.firestore(),'daily_plans','uat-d1'))).data(),{rootSentinel:true})))
  await assert.rejects(()=>planner.read('users','uat-d1'),/INVALID_UAT_COLLECTION/);n++;console.log('PASS: SDK adapter has no root path')
  await planner.close();await assert.rejects(()=>planner.list('daily_plans'),/UAT_CLIENT_CLOSED/);n++;console.log('PASS: closed SDK adapter cannot be reused')
  console.log('SUCCESS: '+n+' synthetic UAT SDK adapter checks passed (demo emulator only)')
 }finally{try{await Promise.allSettled(clients.map(c=>c.close()));await env.clearFirestore()}finally{await env.cleanup()}}
}else throw Error('Use --self-test or --emulator')
