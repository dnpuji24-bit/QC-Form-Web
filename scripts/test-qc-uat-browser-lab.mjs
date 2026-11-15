// Browser lab only. Never invoke tests/browser_offline_smoke.mjs here (legacy transport).
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {guard,identities} from './qc-uat-auth-lab-client.mjs'
import {assertBrowserLab,demoProject} from '../uat-domain-lab/client.mjs'
import {domainRules} from './qc-uat-domain-candidate.mjs'
const origin='http://127.0.0.1:4185'
const allowed=new Set([origin,'http://127.0.0.1:8185','http://127.0.0.1:9199'])
const root=fileURLToPath(new URL('../',import.meta.url))
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
async function offline(){
 assertBrowserLab({origin})
 for(const o of ['https://127.0.0.1:4185','http://localhost:4185','http://127.0.0.1:5173','https://form-qc-unm.web.app'])assert.throws(()=>assertBrowserLab({origin:o}),/LAB_LOOPBACK_BROWSER_REQUIRED/)
 const cfg=(await import('../vite.qc-uat-lab.config.mjs')).default
 assert.throws(()=>cfg({command:'build'}),/QC_UAT_LAB_BUILD_FORBIDDEN/)
 const dev=cfg({command:'serve'})
 assert.equal(dev.server.host,'127.0.0.1');assert.equal(dev.server.port,4185);assert.equal(dev.server.strictPort,true);assert.equal(dev.server.hmr,false);assert.equal(dev.publicDir,false);assert.equal(dev.envDir,false)
 assert.match(dev.server.headers['Content-Security-Policy'],/connect-src 'self' http:\/\/127\.0\.0\.1:8185 http:\/\/127\.0\.0\.1:9199;/)
 for(const path of ['uat-domain-lab/main.jsx','uat-domain-lab/client.mjs']){
  const s=source(path)
  assert.doesNotMatch(s,/from ['"].*(?:\/api|\/firebase\.ts|\/App|\/offline|\/PortalRouter|\/main\.tsx)|https:\/\/|mockUserToken/)
 }
 assert.match(source('uat-domain-lab/client.mjs'),/connectAuthEmulator\(auth,'http:\/\/127\.0\.0\.1:9199'/)
 assert.match(source('uat-domain-lab/client.mjs'),/connectFirestoreEmulator\(db,'127\.0\.0\.1',8185\)/)
 console.log('SUCCESS: browser lab source, origin, CSP and build guards passed (offline)')
}
if(process.argv.length!==3)throw Error('Use --self-test or --emulator')
if(process.argv[2]==='--self-test')await offline()
else if(process.argv[2]==='--emulator'){
 guard();await offline()
 const require=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp,deleteApp}=require('firebase-admin/app')
 const {getAuth}=require('firebase-admin/auth')
 const {initializeTestEnvironment}=await import('@firebase/rules-unit-testing')
 const {doc,setDoc,getDoc}=await import('firebase/firestore')
 const browserDir=process.env.QC_UAT_PLAYWRIGHT_DIR
 if(!browserDir?.startsWith('/'))throw Error('QC_UAT_PLAYWRIGHT_DIR_REQUIRED')
 const {chromium}=createRequire(browserDir+'/package.json')('playwright')
 const app=initializeApp({projectId:demoProject},'browser-lab-seed')
 let env,dev,browser,context,owned=false,n=0
 const violations=[]
 let devOutput=''
 try{
  const auth=getAuth(app)
  if((await auth.listUsers(1)).users.length)throw Error('LAB_AUTH_NOT_EMPTY')
  // Never attach to an existing Vite process.
  try{await fetch(origin,{signal:AbortSignal.timeout(1000)});throw Error('LAB_PORT_ALREADY_IN_USE')}catch(e){if(e.message==='LAB_PORT_ALREADY_IN_USE')throw e}
  env=await initializeTestEnvironment({projectId:demoProject,firestore:{host:'127.0.0.1',port:8185,rules:domainRules()}})
  await env.clearFirestore();owned=true
  for(const [key,a] of Object.entries(identities)){
   await auth.createUser({uid:a.uid,email:a.email,password:a.password,emailVerified:true})
   if(a.claim)await auth.setCustomUserClaims(a.uid,{qcUat:true})
   await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),key==='prod'?'users':'qc_uat_identities',a.uid),key==='prod'?{role:'owner',active:true,status:'approved',username:a.uid}:{role:a.role,enabled:a.enabled,testOnly:true,workspace:'cutover'}))
  }
  await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'daily_plans','root-sentinel'),{testOnly:false,rootSentinel:true}))
  const childEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','HOME','USER','LANG','LC_ALL','TMPDIR','NODE_ENV'].includes(k)))
  dev=spawn(process.execPath,[root+'node_modules/vite/bin/vite.js','--config','vite.qc-uat-lab.config.mjs'],{cwd:root,env:childEnv,stdio:['ignore','pipe','pipe']})
  for(const stream of [dev.stdout,dev.stderr])stream.on('data',d=>{devOutput=(devOutput+d.toString()).slice(-4000)})
  let ready=false
  for(let i=0;i<120;i++){
   if(dev.exitCode!==null)throw Error('LAB_VITE_EXITED: '+devOutput)
   try{const res=await fetch(origin,{signal:AbortSignal.timeout(1000)});if(res.ok&&(await res.text()).includes('QC UnM — Lab Emulator')){ready=true;break}}catch{}
   await new Promise(r=>setTimeout(r,250))
  }
  assert.ok(ready,'LAB_VITE_NOT_READY')
  browser=await chromium.launch({headless:true})
  context=await browser.newContext({serviceWorkers:'block'})
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(allowed.has(url.origin))await route.continue();else{violations.push('blocked origin '+url.origin);await route.abort()}})
  await context.routeWebSocket('**/*',ws=>{violations.push('unexpected websocket '+new URL(ws.url()).origin);ws.close()})
  await context.addInitScript(()=>{window.__labCsp=[];document.addEventListener('securitypolicyviolation',e=>window.__labCsp.push(e.effectiveDirective))})
  const page=await context.newPage();page.setDefaultTimeout(30000)
  page.on('pageerror',e=>violations.push('pageerror '+e.name))
  await page.goto(origin)
  await page.locator('#login').waitFor()
  const result=page.locator('#result')
  async function check(label,fn){await fn();n++;console.log('PASS: '+label)}
  async function op(button,state='success'){
   await page.locator('#'+button).click()
   await page.waitForFunction(v=>document.querySelector('#result')?.dataset.status===v,state)
   return await result.innerText()
  }
  async function login(key){await page.selectOption('#account',key);const out=JSON.parse(await op('login'));assert.equal(out.uid,identities[key].uid);assert.equal(out.claim,identities[key].claim)}
  async function nav(c){await page.getByTestId('nav-'+c).click()}
  async function field(k,v){const p=page.locator('#field-'+k);if(k==='formType')await p.selectOption(v);else await p.fill(String(v))}
  const read=async()=>JSON.parse(await op('read'))
  await check('browser starts signed out',async()=>{assert.equal(await page.locator('#session').innerText(),'Belum login');assert.ok(await page.locator('#create').isDisabled());assert.ok(await page.locator('#read').isDisabled())})
  await check('planner signs in with real emulator token',()=>login('planner'))
  await check('planner creates master paddock and activity through UI',async()=>{await nav('master_paddocks');await op('create');await nav('master_activities');await op('create')})
  await check('planner creates MP and DP through UI',async()=>{await nav('monthly_plans');await op('create');await nav('daily_plans');await op('create');assert.equal((await read()).data.targetArea100,500)})
  await check('viewer lists DP but cannot create another',async()=>{await login('viewer');assert.equal(JSON.parse(await op('list')).length,1);await page.locator('#record-id').fill('uat-d9');assert.match(await op('create','error'),/permission-denied/)})
  await check('fertilizer mandor cannot create spray QC',async()=>{await login('fert');await nav('qc_records');assert.match(await op('create','error'),/permission-denied/)})
  await check('failed pair remains absent',async()=>{assert.deepEqual(JSON.parse(await op('list')),[]);await nav('daily_reports');assert.deepEqual(JSON.parse(await op('list')),[]);await env.withSecurityRulesDisabled(async c=>{for(const name of ['qc_records','daily_reports'])assert.equal((await getDoc(doc(c.firestore(),'qc_uat_workspaces','cutover',name,'uat-q1'))).exists(),false)})})
  await check('sprayer creates atomic QC and Actual through UI',async()=>{await login('sprayer');await nav('qc_records');await op('create');const q=await read();await nav('daily_reports');const a=await read();assert.equal(q.data.ownerUid,'lab-sprayer');assert.equal(a.data.qcRecordId,'uat-q1');assert.deepEqual(a.data.createdAt,q.data.createdAt);assert.equal(a.data.actualArea100,400);assert.ok(await page.locator('#create').isDisabled())})
  await check('duplicate QC cannot overwrite',async()=>{await nav('qc_records');assert.match(await op('create','error'),/permission-denied/)})
  await check('planner creates linked fertilizer plans',async()=>{await login('planner');await nav('master_activities');await page.locator('#record-id').fill('uat-a2');await field('formType','fertilizer');await op('create');await nav('monthly_plans');await page.locator('#record-id').fill('uat-m2');await field('activityId','uat-a2');await op('create');await nav('daily_plans');await page.locator('#record-id').fill('uat-d2');await field('activityId','uat-a2');await field('monthlyPlanLineId','uat-m2');await field('formType','fertilizer');await op('create')})
  await check('fertilizer mandor creates matching QC and Actual',async()=>{await login('fert');await nav('qc_records');await page.locator('#record-id').fill('uat-q2');await field('monthlyPlanLineId','uat-m2');await field('dailyPlanId','uat-d2');await field('formType','fertilizer');await op('create');await nav('daily_reports');await page.locator('#record-id').fill('uat-q2');assert.equal((await read()).data.ownerUid,'lab-fert')})
  await check('stale and production claims denied',async()=>{for(const k of ['stale','prod']){await login(k);assert.match(await op('list','error'),/LAB_CLAIM_REQUIRED/)}})
  await check('disabled marker denied',async()=>{await login('disabled');assert.match(await op('list','error'),/permission-denied/)})
  await check('logout disables access and reload has no session',async()=>{await op('logout');assert.ok(await page.locator('#read').isDisabled());assert.deepEqual(await page.evaluate(()=>window.__labCsp),[]);await page.reload();await page.locator('#login').waitFor();assert.equal(await page.locator('#session').innerText(),'Belum login')})
  await check('production root sentinel unchanged',()=>env.withSecurityRulesDisabled(async c=>assert.deepEqual((await getDoc(doc(c.firestore(),'daily_plans','root-sentinel'))).data(),{testOnly:false,rootSentinel:true})))
  await check('no external network, websocket, page error or CSP violation',async()=>{assert.deepEqual(await page.evaluate(()=>window.__labCsp),[]);assert.deepEqual(violations,[])})
  console.log('SUCCESS: '+n+' React browser UAT checks passed (demo emulators only)')
 }finally{try{if(context)await context.close();if(browser)await browser.close()}finally{if(dev)dev.kill('SIGTERM');try{if(owned)await env.clearFirestore()}finally{try{if(env)await env.cleanup()}finally{await deleteApp(app)}}}}
}else throw Error('Use --self-test or --emulator')
