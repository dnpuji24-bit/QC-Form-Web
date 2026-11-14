// Read-only release preparation: no cloud mutations; private local backup only.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,lstatSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import {join} from 'node:path'
const project='form-qc-unm'
const releasePath='projects/'+project+'/releases/cloud.firestore'
const baselineHash='1969b01dc886befc8fa65982c5a57fcbf464581a73a1e4916e1485f8922e8e5c'
const candidateRawHash='687699e91a5c3c44f0a9e39432ed9cde637617300c5346aae88dcc96c5fc286d'
const raw=s=>createHash('sha256').update(s).digest('hex')
const normalized=s=>raw(s.replace(/\r\n/g,'\n').trimEnd())
const baseline=readFileSync(new URL('./firestore.legacy-audit-release.rules',import.meta.url),'utf8')
const candidate=readFileSync(new URL('./firestore.native-admin-pilot-release.rules',import.meta.url),'utf8')
const collections=['qc_admin_live_pilot_state','qc_admin_live_pilot_audit']
function validate(b,c){
 assert.equal(normalized(b),baselineHash,'BASELINE_HASH_MISMATCH')
 assert.equal(raw(c),candidateRawHash,'CANDIDATE_HASH_MISMATCH')
 const start='    // Isolated native-admin atomic pair pilot.'
 const end='    match /{document=**} {'
 const i=c.indexOf(start),j=c.indexOf(end,i)
 assert.ok(i>=0&&j>i&&c.split(start).length===2,'CANDIDATE_SCOPE_MISMATCH')
 assert.equal(c.slice(0,i)+c.slice(j),b,'BASELINE_SPLICE_MISMATCH')
}
function isEmptyPage(page){
 if(!page||typeof page!=='object'||Array.isArray(page))throw Error('INVALID_LIST_RESPONSE')
 if(page.documents!==undefined&&!Array.isArray(page.documents))throw Error('INVALID_LIST_RESPONSE')
 if(page.nextPageToken!==undefined&&typeof page.nextPageToken!=='string')throw Error('INVALID_LIST_RESPONSE')
 return !page.documents?.length&&!page.nextPageToken
}
async function main(){
 if(process.argv.length!==3)throw Error('USAGE')
 validate(baseline,candidate)
 if(process.argv[2]==='--self-test'){
  assert.throws(()=>validate(baseline+'x',candidate))
  assert.throws(()=>validate(baseline,candidate+'x'))
  assert.equal(isEmptyPage({}),true)
  assert.equal(isEmptyPage({documents:[{}]}),false)
  assert.equal(isEmptyPage({nextPageToken:'x'}),false)
  assert.throws(()=>isEmptyPage({documents:'x'}))
  console.log('SUCCESS: 7 local release preparation checks passed')
  return
 }
 if(process.argv[2]!=='--read-only-confirmed')throw Error('USAGE')
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('EMULATOR_ENVIRONMENT')
 for(const k of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(process.env[k]&&process.env[k]!==project)throw Error('WRONG_PROJECT')
 const configured=execFileSync('gcloud',['config','get-value','project','--quiet'],{encoding:'utf8'}).trim()
 if(configured!==project)throw Error('WRONG_PROJECT')
 const token=execFileSync('gcloud',['auth','print-access-token','--quiet'],{encoding:'utf8'}).trim()
 if(!token)throw Error('GCLOUD_AUTH_REQUIRED')
 const headers={Authorization:'Bearer '+token,'X-Goog-User-Project':project}
 async function get(url,label){
  const r=await fetch(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(20000)})
  if(!r.ok)throw Error(label+'_HTTP_'+r.status)
  return r.json()
 }
 const api='https://firebaserules.googleapis.com/v1/'
 const release=await get(api+releasePath,'RULES_RELEASE')
 if(release.name!==releasePath||!/^projects\/form-qc-unm\/rulesets\/[A-Za-z0-9_-]+$/.test(release.rulesetName||''))throw Error('INVALID_RELEASE')
 const ruleset=await get(api+release.rulesetName,'RULES_SOURCE')
 const files=ruleset.source?.files
 if(!Array.isArray(files)||files.length!==1||typeof files[0].content!=='string')throw Error('INVALID_RULES_SOURCE')
 const live=files[0].content
 if(normalized(live)!==baselineHash)throw Error('LIVE_BASELINE_CHANGED')
 const pilotCollections={}
 for(const collection of collections){
  const url=new URL('https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/'+collection)
  url.searchParams.set('pageSize','1')
  url.searchParams.set('mask.fieldPaths','testOnly')
  pilotCollections[collection]=isEmptyPage(await get(url,'PILOT_LIST'))?'empty':'not-proven-empty'
 }
 const latest=await get(api+releasePath,'RULES_RELEASE')
 if(latest.rulesetName!==release.rulesetName||latest.updateTime!==release.updateTime)throw Error('LIVE_RELEASE_CHANGED')
 const blockers=Object.values(pilotCollections).every(v=>v==='empty')?[]:['PILOT_COLLECTION_NOT_EMPTY']
 if(blockers.length){
  console.log(JSON.stringify({project,pilotCollections,blockers,writes:0,releaseApproved:false},null,2))
  process.exitCode=2
  return
 }
 const parent=join(homedir(),'qc-migration-private')
 mkdirSync(parent,{recursive:true,mode:0o700})
 const stat=lstatSync(parent)
 if(!stat.isDirectory()||(stat.mode&0o077))throw Error('PRIVATE_DIRECTORY_REQUIRED')
 const dir=mkdtempSync(join(parent,'native-admin-pilot-release-'))
 const write=(name,data)=>writeFileSync(join(dir,name),data,{mode:0o600,flag:'wx'})
 write('rollback.rules',live)
 write('candidate.rules',candidate)
 write('firebase.rollback.json',JSON.stringify({firestore:{rules:'rollback.rules'}},null,2))
 write('firebase.candidate.json',JSON.stringify({firestore:{rules:'candidate.rules'}},null,2))
 const report={project,baselineRuleset:release.rulesetName,baselineHash:normalized(live),rollbackRawHash:raw(live),candidateRawHash:raw(candidate),pilotCollections,backupDirectory:dir,blockers,writes:0,releaseApproved:false}
 write('release-backup.json',JSON.stringify(report,null,2))
 console.log(JSON.stringify(report,null,2))
 console.log('SUCCESS: isolated admin pilot release backup prepared; no deployment or production writes')
}
main().catch(e=>{const msg=String(e?.message||'');console.error(/^[A-Z][A-Z0-9_]+$/.test(msg)?msg:'ADMIN_PILOT_PREPARATION_FAILED');process.exitCode=1})
