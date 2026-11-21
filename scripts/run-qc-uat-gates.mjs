// Fast UAT regression gates. No production, Hosting, Supabase or credential access.
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url))
const mode=process.argv[2]
if(!['quick','smoke','ui','full-ui','carryover','photo-stage','photo-compress','photo-commit','photo-correction','photo-browser','portal-integration','portal-modules','portal-records','portal-browse','full'].includes(mode)||process.argv.length!==3){
 console.error('Usage: node scripts/run-qc-uat-gates.mjs quick|smoke|ui|full-ui|carryover|photo-stage|photo-compress|photo-commit|photo-correction|photo-browser|portal-integration|portal-modules|portal-records|portal-browse|full')
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
  'src/qcUatUnifiedFullQcFormBuilder.mjs',
  'src/qcUatUnifiedCarryoverSelection.mjs',
  'src/qcUatUnifiedPhotoPreflight.mjs',
  'src/qcUatPhotoCompression.mjs',
  'scripts/test-qc-uat-photo-compression-contract.mjs',
  'src/qcOperationalPhotoManifest.mjs',
  'scripts/test-qc-uat-unified-photo-preflight.mjs',
  'server/qc-photo-access/uat-unified-photo-trusted-stage.mjs',
  'src/qcUatVerifiedPhotoLedger.mjs',
  'scripts/test-qc-uat-unified-photo-ledger-contract.mjs',
  'scripts/test-qc-uat-unified-photo-atomic.mjs',
  'scripts/test-qc-uat-unified-photo-trusted-stage.mjs',
  'scripts/test-qc-uat-unified-carryover-contract.mjs',
  'src/qcUatFertilizerFullDto.mjs',
  'scripts/test-qc-uat-unified-full-qc-form.mjs',
  'scripts/test-qc-uat-unified-full-qc-ui.mjs',
  'scripts/test-qc-uat-unified-full-qc-http.mjs',
  'scripts/test-qc-uat-unified-operational-form-contract.mjs',
  'scripts/test-qc-uat-unified-operational-form-smoke.mjs'
 ])run('syntax '+s,process.execPath,['--check',s])
 node('form contract (10 cases)','scripts/test-qc-uat-unified-operational-form-contract.mjs')
 node('full operational editor DTO contract (10 cases)','scripts/test-qc-uat-unified-full-qc-form.mjs')
 node('explicit Shift 1 -> Shift 2 carryover contract (10 cases)','scripts/test-qc-uat-unified-carryover-contract.mjs')
 node('photo staging preflight contract (10 cases)','scripts/test-qc-uat-unified-photo-preflight.mjs')
 node('automatic photo compression policy (10 cases)','scripts/test-qc-uat-photo-compression-contract.mjs')
 node('server-side immutable photo readback and fresh authorization (15 cases)','scripts/test-qc-uat-unified-photo-trusted-stage.mjs')
 node('immutable QC photo ledger contract (11 cases)','scripts/test-qc-uat-unified-photo-ledger-contract.mjs')
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
function ui(){
 emu('focused React UAT portal browser, role and form visibility (17 cases)','demo-qc-uat-unified-role-planning',
  'firebase.uat-unified-role-planning-emulator.json',9285,10099,
  'scripts/test-qc-uat-unified-portal-ui.mjs','--browser',true)
}
function fullUi(){
 emu('focused Spray/Fertilizer QC browser, carryover and all image formats (11 cases)','demo-qc-uat-unified-role-planning',
  'firebase.uat-unified-role-planning-emulator.json',9285,10099,
  'scripts/test-qc-uat-unified-full-qc-ui.mjs','--browser',true)
}
function portalBrowse(){
 node('three newest-100 and exact-ID Data QC contracts','scripts/test-qc-uat-operational-records-browse-delta.mjs')
 emu('three bounded cross-period browse HTTP browser checks (demo Auth + Firestore only)',
  'demo-qc-uat-unified-role-planning','firebase.uat-unified-role-planning-emulator.json',
  9285,10099,'scripts/test-qc-uat-unified-portal-ui.mjs','--browser-browse',true)
}
function portalRecords(){
 node('three Data QC and Actual record read-only contracts','scripts/test-qc-uat-operational-records-delta.mjs')
 emu('three Data QC list/detail/role HTTP browser delta checks (demo Auth + Firestore)',
  'demo-qc-uat-unified-role-planning','firebase.uat-unified-role-planning-emulator.json',
  9285,10099,'scripts/test-qc-uat-unified-portal-ui.mjs','--browser-records',true)
}
function portalModules(){
 node('three real read-only Summary/Calendar contracts','scripts/test-qc-uat-operational-modules-delta.mjs')
 emu('three Summary and Calendar HTTP browser delta checks (demo Auth + Firestore only)',
  'demo-qc-uat-unified-role-planning','firebase.uat-unified-role-planning-emulator.json',
  9285,10099,'scripts/test-qc-uat-unified-portal-ui.mjs','--browser-modules',true)
}
function portalIntegration(){
 node('three portal access and route contracts','scripts/test-qc-uat-operational-portal-delta.mjs')
 emu('three operational portal browser navigation delta checks (demo Auth + Firestore only)',
  'demo-qc-uat-unified-role-planning','firebase.uat-unified-role-planning-emulator.json',
  9285,10099,'scripts/test-qc-uat-unified-portal-ui.mjs','--browser-portal',true)
}
function photoCorrection(){
 for(const p of [
  'src/qcUatPhotoCorrectionPolicy.mjs',
  'server/qc-photo-access/uat-planning-role-service.mjs',
  'scripts/test-qc-uat-unified-photo-atomic.mjs'
 ])run('syntax '+p,process.execPath,['--check',p])
 emu('photo-only Spray/Fertilizer correction (3 delta cases, MOCK)',
  'demo-qc-uat-unified-role-planning',
  'firebase.uat-unified-role-planning-emulator.json',
  9285,10099,'scripts/test-qc-uat-unified-photo-atomic.mjs','--photo-correction',true)
}
function photoBrowser(){
 node('browser-to-HTTP photo envelope (7 offline cases)','scripts/test-qc-uat-unified-photo-transport-contract.mjs')
 run('TypeScript','npm',['run','typecheck'])
 emu('React photo-inclusive HTTP to atomic QC/Actual (4 browser checks, MOCK only)',
  'demo-qc-uat-unified-role-planning','firebase.uat-unified-role-planning-emulator.json',
  9285,10099,'scripts/test-qc-uat-unified-full-qc-ui.mjs','--browser-photo',true)
}
function photoCommit(){
 node('immutable QC photo ledger (11 quick checks)','scripts/test-qc-uat-unified-photo-ledger-contract.mjs')
 emu('photo-inclusive QC+Actual+HTTP atomic emulator (10 checks)','demo-qc-uat-unified-role-planning',
  'firebase.uat-unified-role-planning-emulator.json',9285,10099,
  'scripts/test-qc-uat-unified-photo-atomic.mjs','--emulator',true)
 run('TypeScript','npm',['run','typecheck'])
}
function full(){
 quick()
 smoke()
 emu('existing unified Owner/Planning/QC (21)','demo-qc-uat-unified-role-planning',
  'firebase.uat-unified-role-planning-emulator.json',9285,10099,
  'scripts/test-qc-uat-unified-role-planning.mjs','--emulator',true)
 ui()
 fullUi()
 emu('Owner role lifecycle regression (16)','demo-qc-uat-owner-http',
  'firebase.uat-owner-permission-http.json',9485,10299,
  'scripts/test-qc-uat-role-lifecycle.mjs','--emulator')
 for(const [s,n] of [['planning-role',19],['planning-write',19],['planning-qc',22]]){
  emu('Planning regression '+s+' ('+n+')','demo-qc-uat-planning-role',
   'firebase.uat-planning-role-emulator.json',9085,9899,
   'scripts/test-qc-uat-'+s+'.mjs','--emulator')
 }
 console.log('\nSUCCESS: release-gate baseline 141 emulator/browser checks plus quick contract and TypeScript. This is NOT all repository tests.')
}
if(mode==='quick'){quick();console.log('\nSUCCESS: Quick Test contract and typecheck passed (no emulator)')}
if(mode==='smoke'){smoke();console.log('\nSUCCESS: targeted 16-case Spray/Fertilizer emulator smoke passed')}
if(mode==='ui'){ui();console.log('\nSUCCESS: 17-case unified UAT browser permission and UI gate passed')}
if(mode==='full-ui'){fullUi();console.log('\nSUCCESS: focused 11-case full QC React browser, retry, carryover and photo compression passed')}
if(mode==='carryover'){quick();fullUi();console.log('\nSUCCESS: 10 explicit carryover contract checks, TypeScript and 11 focused full QC browser checks passed')}
if(mode==='photo-stage'){quick();fullUi();console.log('\nSUCCESS: 10 photo preflight + 10 compression contracts, TypeScript and 11 focused QC React browser checks passed (no photo upload)')}
if(mode==='photo-compress'){quick();fullUi();console.log('\nSUCCESS: 10 compression contracts, TypeScript and 11 focused browser QC cases passed (JPEG/PNG/WebP compression before SHA256, no upload)')}
if(mode==='portal-browse'){portalBrowse();console.log('\nSUCCESS: 3 newest-100/exact-ID offline and 3 browser delta checks passed (demo emulator only)')}
if(mode==='portal-records'){portalRecords();console.log('\nSUCCESS: 3 offline Data QC/Actual contracts and 3 focused browser checks passed (demo emulator only)')}
if(mode==='portal-modules'){portalModules();console.log('\nSUCCESS: 3 offline Summary/Calendar contracts and 3 focused browser reads passed (demo emulator only)')}
if(mode==='portal-integration'){portalIntegration();console.log('\nSUCCESS: 3 offline access contracts and 3 focused operational portal browser checks passed (demo emulator only)')}
if(mode==='photo-correction'){photoCorrection();console.log('\nSUCCESS: 3 focused photo correction revisions/retry emulator checks passed (MOCK Storage only)')}
if(mode==='photo-browser'){photoBrowser();console.log('\nSUCCESS: 7 offline photo transport checks, TypeScript and 4 focused MOCK photo browser-emulator checks passed (NO Supabase upload)')}
if(mode==='photo-commit'){photoCommit();console.log('\nSUCCESS: 11 photo ledger contracts, 10 atomic photo and HTTP emulator checks, and TypeScript passed (MOCK storage only)')}
if(mode==='full')full()
