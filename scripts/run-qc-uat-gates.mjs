// Fast UAT regression gates. No production, Hosting, Supabase or credential access.
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url))
const mode=process.argv[2]
if(!['quick','smoke','full'].includes(mode)||process.argv.length!==3){
 console.error('Usage: node scripts/run-qc-uat-gates.mjs quick|smoke|full')
 process.exit(2)
}
const env={...process.env}
delete env.QC_UAT_MODE
delete env.GOOGLE_CLOUD_PROJECT
delete env.FIREBASE_PROJECT_ID
const home=env.HOME||'/home/oai'
env.QC_UAT_PLAYWRIGHT_DIR ||=path.join(home,'qc-uat-playwright')
env.PLAYWRIGHT_BROWSERS_PATH ||=path.join(home,'.cache/ms-playwright')
function run(label,bin,args){
 console.log('\n=== '+label+' ===')
 const r=spawnSync(bin,args,{cwd:root,env,stdio:'inherit'})
 if(r.error){console.error('Cannot run '+bin+': '+r.error.message);process.exit(1)}
 if(r.status!==0){console.error(label+' FAILED (exit '+r.status+')');process.exit(r.status||1)}
 console.log('PASS: '+label)
}
const node=(label,script,...args)=>run(label,process.execPath,[script,...args])
function emu(label,project,config,firestore,auth,script,testMode,unified=false){
 const command=[
  'env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID -u QC_UAT_MODE',
  ...(unified?['QC_UAT_MODE=unified-lab']:[]),
  'GCLOUD_PROJECT='+project,
  'FIRESTORE_EMULATOR_HOST=127.0.0.1:'+firestore,
  'FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:'+auth,
  'node '+script+' '+testMode
 ].join(' ')
 run(label,'firebase',['emulators:exec','--only','firestore,auth','--project',project,'--config',config,command])
}
function quick(){
 for(const s of [
  'server/qc-photo-access/uat-planning-role-service.mjs',
  'server/qc-photo-access/uat-unified-planning-http.mjs',
  'server/qc-photo-access/uat-unified-browser-shell.mjs',
  'src/qcUatUnifiedOperationalForm.mjs',
  'src/qcUatUnifiedFullQcTransport.mjs',
  'scripts/test-qc-uat-unified-full-qc-http.mjs',
  'scripts/test-qc-uat-unified-operational-form-contract.mjs',
  'scripts/test-qc-uat-unified-operational-form-smoke.mjs'
 ])run('syntax '+s,process.execPath,['--check',s])
 node('form contract (10 cases)','scripts/test-qc-uat-unified-operational-form-contract.mjs')
 node('full form HTTP route and data loss guard','scripts/test-qc-uat-unified-full-qc-http.mjs','--self-test')
 node('unified source guard','scripts/test-qc-uat-unified-role-planning.mjs','--self-test')
 node('browser source guard','scripts/test-qc-uat-unified-portal-ui.mjs','--self-test')
 run('TypeScript', 'npm',['run','typecheck'])
}
function smoke(){
 emu('operational QC emulator smoke (8 cases)','demo-qc-uat-unified-role-planning',
  'firebase.uat-unified-role-planning-emulator.json',9285,10099,
  'scripts/test-qc-uat-unified-operational-form-smoke.mjs','--emulator',true)
 emu('full Spray/Fertilizer HTTP smoke (8 cases)','demo-qc-uat-unified-role-planning',
  'firebase.uat-unified-role-planning-emulator.json',9285,10099,
  'scripts/test-qc-uat-unified-full-qc-http.mjs','--emulator',true)
}
function full(){
 quick()
 smoke()
 emu('existing unified Owner/Planning/QC (21)','demo-qc-uat-unified-role-planning',
  'firebase.uat-unified-role-planning-emulator.json',9285,10099,
  'scripts/test-qc-uat-unified-role-planning.mjs','--emulator',true)
 emu('React role/Planning/QC operational portal (17)','demo-qc-uat-unified-role-planning',
  'firebase.uat-unified-role-planning-emulator.json',9285,10099,
  'scripts/test-qc-uat-unified-portal-ui.mjs','--browser',true)
 emu('Owner role lifecycle regression (16)','demo-qc-uat-owner-http',
  'firebase.uat-owner-permission-http.json',9485,10299,
  'scripts/test-qc-uat-role-lifecycle.mjs','--emulator')
 for(const [s,n] of [['planning-role',19],['planning-write',19],['planning-qc',22]]){
  emu('Planning regression '+s+' ('+n+')','demo-qc-uat-planning-role',
   'firebase.uat-planning-role-emulator.json',9085,9899,
   'scripts/test-qc-uat-'+s+'.mjs','--emulator')
 }
 console.log('\nSUCCESS: release-gate baseline 130 emulator/browser checks plus quick contract and TypeScript. This is NOT all repository tests.')
}
if(mode==='quick'){quick();console.log('\nSUCCESS: Quick Test contract and typecheck passed (no emulator)')}
if(mode==='smoke'){smoke();console.log('\nSUCCESS: targeted 16-case Spray/Fertilizer emulator smoke passed')}
if(mode==='full')full()
