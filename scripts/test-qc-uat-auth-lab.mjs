import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {demoProject} from './qc-uat-isolation-foundation.mjs'
import {domainRules} from './qc-uat-domain-candidate.mjs'
import {guard,identities,createAuthLabClient} from './qc-uat-auth-lab-client.mjs'
const valid={GCLOUD_PROJECT:demoProject,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8185',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9199'}
const mp={pid:'uat-p1',activityId:'uat-a1',targetArea100:800}
const dp={...mp,monthlyPlanLineId:'uat-m1',targetArea100:500,formType:'spray'}
const qc={pid:'uat-p1',monthlyPlanLineId:'uat-m1',dailyPlanId:'uat-d1',formType:'spray',actualArea100:400}
function offline(){
 guard(valid)
 for(const e of [{...valid,GCLOUD_PROJECT:'form-qc-unm'},{...valid,FIRESTORE_EMULATOR_HOST:'remote:8185'},{...valid,FIREBASE_AUTH_EMULATOR_HOST:'remote:9199'},{...valid,GOOGLE_CLOUD_PROJECT:'form-qc-unm'},{}])assert.throws(()=>guard(e))
 console.log('SUCCESS: 6 Auth lab environment guard checks passed (offline)')
}
if(process.argv.length!==3)throw Error('Use --self-test or --emulator')
if(process.argv[2]==='--self-test'){offline();await assert.rejects(()=>createAuthLabClient(),/DEMO_PROJECT_REQUIRED|LOOPBACK_EMULATOR_REQUIRED|AUTH_EMULATOR_REQUIRED/)}
else if(process.argv[2]==='--emulator'){
 guard();offline()
 const {initializeTestEnvironment}=await import('@firebase/rules-unit-testing')
 const {doc,getDoc,setDoc}=await import('firebase/firestore')
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp,deleteApp}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth')
 const app=initializeApp({projectId:demoProject},'auth-lab-seed')
 let env,s,owned=false,n=0
 async function check(label,fn){await fn();n++;console.log('PASS: '+label)}
 const denied=fn=>assert.rejects(fn,{code:'permission-denied'})
 try{
  const admin=getAuth(app)
  if((await admin.listUsers(1)).users.length)throw Error('LAB_AUTH_NOT_EMPTY')
  env=await initializeTestEnvironment({projectId:demoProject,firestore:{host:'127.0.0.1',port:8185,rules:domainRules()}})
  await env.clearFirestore();owned=true
  for(const [key,a] of Object.entries(identities)){
   await admin.createUser({uid:a.uid,email:a.email,password:a.password,emailVerified:true})
   if(a.claim)await admin.setCustomUserClaims(a.uid,{qcUat:true})
   await env.withSecurityRulesDisabled(async c=>{
    const d=c.firestore()
    if(key==='prod')await setDoc(doc(d,'users',a.uid),{role:'owner',active:true,status:'approved',username:a.uid})
    else await setDoc(doc(d,'qc_uat_identities',a.uid),{role:a.role,enabled:a.enabled,testOnly:true,workspace:'cutover'})
   })
  }
  await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'daily_plans','root-sentinel'),{testOnly:false,rootSentinel:true}))
  s=await createAuthLabClient()
  await check('signed-out read rejected',()=>assert.rejects(()=>s.list('daily_plans'),/LAB_LOGIN_REQUIRED/))
  await check('real emulator planner login includes claim',async()=>assert.deepEqual(await s.signIn('planner'),{uid:'lab-planner',claim:true}))
  await check('planner writes linked masters and plans',async()=>{await s.createPlan('master_paddocks','uat-p1',{area100:1000});await s.createPlan('master_activities','uat-a1',{formType:'spray'});await s.createPlan('monthly_plans','uat-m1',mp);await s.createPlan('daily_plans','uat-d1',dp)})
  await check('planner query scoped',async()=>assert.deepEqual((await s.list('daily_plans')).map(x=>x.id),['uat-d1']))
  await check('production path denied locally',()=>assert.rejects(()=>s.read('users','uat-p1'),/INVALID_UAT_COLLECTION/))
  await check('viewer signs in and reads',async()=>{assert.equal((await s.signIn('viewer')).claim,true);assert.equal((await s.read('daily_plans','uat-d1')).data.targetArea100,500)})
  await check('viewer cannot write pair',()=>denied(()=>s.createQcPair('uat-q1',qc)))
  await check('wrong mandor cannot write spray',async()=>{await s.signIn('fert');await denied(()=>s.createQcPair('uat-q1',qc))})
  await check('denied operations leave both absent',()=>env.withSecurityRulesDisabled(async c=>{for(const name of ['qc_records','daily_reports'])assert.equal((await getDoc(doc(c.firestore(),'qc_uat_workspaces','cutover',name,'uat-q1'))).exists(),false)}))
  await check('sprayer login creates atomic pair',async()=>{await s.signIn('sprayer');await s.createQcPair('uat-q1',qc)})
  await check('pair owner and timestamp match actor',async()=>{const q=(await s.read('qc_records','uat-q1')).data,a=(await s.read('daily_reports','uat-q1')).data;assert.equal(q.ownerUid,'lab-sprayer');assert.ok(q.createdAt.isEqual(a.createdAt));assert.deepEqual({...q,sourceOrigin:'QC',qcRecordId:'uat-q1'},a)})
  await check('repeat pair cannot overwrite',()=>denied(()=>s.createQcPair('uat-q1',qc)))
  await check('stale claim denied',async()=>{assert.equal((await s.signIn('stale')).claim,false);await assert.rejects(()=>s.list('daily_plans'),/LAB_CLAIM_REQUIRED/)})
  await check('disabled marker denied by Rules',async()=>{await s.signIn('disabled');await denied(()=>s.list('daily_plans'))})
  await check('production identity cannot use adapter',async()=>{assert.equal((await s.signIn('prod')).claim,false);await assert.rejects(()=>s.list('daily_plans'),/LAB_CLAIM_REQUIRED/)})
  await check('fertilizer login creates matching pair',async()=>{await s.signIn('planner');await s.createPlan('master_activities','uat-a2',{formType:'fertilizer'});await s.createPlan('monthly_plans','uat-m2',{...mp,activityId:'uat-a2'});await s.createPlan('daily_plans','uat-d2',{...dp,activityId:'uat-a2',monthlyPlanLineId:'uat-m2',formType:'fertilizer'});await s.signIn('fert');await s.createQcPair('uat-q2',{...qc,monthlyPlanLineId:'uat-m2',dailyPlanId:'uat-d2',formType:'fertilizer'});assert.equal((await s.read('daily_reports','uat-q2')).data.ownerUid,'lab-fert')})
  await check('root sentinel unchanged',()=>env.withSecurityRulesDisabled(async c=>assert.deepEqual((await getDoc(doc(c.firestore(),'daily_plans','root-sentinel'))).data(),{testOnly:false,rootSentinel:true})))
  await check('signout removes access',async()=>{await s.signOut();await assert.rejects(()=>s.list('daily_plans'),/LAB_LOGIN_REQUIRED/)})
  await check('closed session cannot sign in',async()=>{await s.close();await assert.rejects(()=>s.signIn('planner'),/LAB_CLOSED/)})
  console.log('SUCCESS: '+n+' authenticated UAT SDK checks passed (Auth + Firestore demo emulators only)')
 }finally{try{if(s)await s.close();if(owned)await env.clearFirestore()}finally{try{if(env)await env.cleanup()}finally{await deleteApp(app)}}}
}else throw Error('Use --self-test or --emulator')
