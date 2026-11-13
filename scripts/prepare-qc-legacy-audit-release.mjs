// Read-only production release preparation; local private backup files only.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,statSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {homedir} from 'node:os'
import {join} from 'node:path'
import assert from 'node:assert/strict'
import {checkLiveRules} from './check-qc-live-firestore-rules.mjs'
const PROJECT='form-qc-unm'
const BASE='a945122a4238356b0eeaddbe0ed134a811549108'
const BASE_HASH='1a2eb39419522397c9a5af25418091c25506ee0822d122ac0e851038326e6de2'
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n').trimEnd()).digest('hex')
const block="    match /qc_legacy_activity_logs/{auditId} {\n      allow read: if activeUser() && profile().data.status == 'approved'\n        && (role() == 'owner' || permission('qc_logs') in ['view','edit']);\n      allow write: if false;\n    }\n\n"
const anchor='    match /{document=**} {'
function validate(baseline,candidate){
 assert.equal(hash(baseline),BASE_HASH,'BASELINE_HASH_MISMATCH')
 assert.equal(baseline.split(anchor).length,2,'BASELINE_ANCHOR_MISMATCH')
 assert.equal(candidate,baseline.replace(anchor,()=>block+anchor),'CANDIDATE_NOT_ISOLATED')
}
async function main(){
 const mode=process.argv[2]
 if(process.argv.length!==3||!['--prepare','--verify'].includes(mode))throw Error('USAGE')
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('EMULATOR_ENVIRONMENT')
 for(const k of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(process.env[k]!==PROJECT)throw Error('PROJECT_CONFIRMATION_REQUIRED')
 const baseline=execFileSync('git',['show',BASE+':firestore.rules'],{encoding:'utf8'})
 const candidate=readFileSync(new URL('./firestore.legacy-audit-release.rules',import.meta.url),'utf8')
 validate(baseline,candidate)
 const requireAdmin=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp,applicationDefault,deleteApp}=requireAdmin('firebase-admin/app')
 const {getFirestore}=requireAdmin('firebase-admin/firestore')
 const credential=applicationDefault()
 const rules=await checkLiveRules(credential,mode==='--verify'?candidate:baseline)
 if(!rules.exactMatch)throw Error('LIVE_RULES_UNEXPECTED')
 if(mode==='--verify'){
  console.log(JSON.stringify({rules,verifiedCandidateHash:hash(candidate),firestoreWrites:0,releaseApproved:false},null,2))
  console.log('SUCCESS: active release matches isolated historical rules')
  return
 }
 const app=initializeApp({credential,projectId:PROJECT})
 try{
  const db=getFirestore(app)
  const [users,roles,history]=await Promise.all([
   db.collection('users').select('active','status','role').get(),
   db.collection('role_access').select('permissions').get(),
   db.collection('qc_legacy_activity_logs').count().get()
  ])
  const permissions=new Map(roles.docs.map(d=>[d.id,d.data().permissions?.qc_logs]))
  const access={approvedActive:0,owner:0,view:0,edit:0,denied:0,unknownPermission:0}
  for(const d of users.docs){
   const u=d.data()
   if(u.active!==true||u.status!=='approved')continue
   access.approvedActive++
   const permission=permissions.get(u.role)
   if(u.role==='owner')access.owner++
   else if(permission==='view')access.view++
   else if(permission==='edit')access.edit++
   else {access.denied++;if(permission!== 'none')access.unknownPermission++}
  }
  const parent=join(homedir(),'qc-migration-private')
  mkdirSync(parent,{recursive:true,mode:0o700})
  if(statSync(parent).mode&0o077)throw Error('PRIVATE_DIRECTORY_REQUIRED')
  const dir=mkdtempSync(join(parent,'legacy-rules-release-'))
  const write=(name,data)=>writeFileSync(join(dir,name),data,{mode:0o600,flag:'wx'})
  write('rollback.rules',baseline)
  write('candidate.rules',candidate)
  write('firebase.rollback.json',JSON.stringify({firestore:{rules:'rollback.rules'}},null,2))
  write('firebase.candidate.json',JSON.stringify({firestore:{rules:'candidate.rules'}},null,2))
  write('release-backup.json',JSON.stringify({rules,baselineHash:hash(baseline),candidateHash:hash(candidate),capturedAt:new Date().toISOString()},null,2))
  const blockers=[]
  if(!access.owner)blockers.push('NO_ACTIVE_APPROVED_OWNER')
  if(history.data().count!==0)blockers.push('HISTORY_ALREADY_PRESENT_REVIEW_REQUIRED')
  console.log(JSON.stringify({project:PROJECT,liveRules:rules,candidateHash:hash(candidate),users:users.size,roleTemplates:roles.size,access,historicalCount:history.data().count,backupDirectory:dir,blockers,firestoreWrites:0,releaseApproved:false},null,2))
  if(blockers.length)process.exitCode=2
  else console.log('SUCCESS: isolated release preparation and private rules backup complete; no deployment performed')
 }finally{await deleteApp(app)}
}
main().catch(e=>{
 const m=String(e?.message||'')
 console.error(/^[A-Z][A-Z0-9_]+$/.test(m)?m:'RELEASE_PREPARATION_FAILED')
 process.exitCode=1
})
