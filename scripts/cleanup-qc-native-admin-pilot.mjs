// Operator-only cleanup of the exact synthetic pair AFTER hosted OFF and rules rollback.
// No cloud requests in --self-test or --verify-backup. Never retries a commit.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,lstatSync,realpathSync} from 'node:fs'
import {homedir} from 'node:os'
import {join,resolve,dirname} from 'node:path'
import {execFileSync} from 'node:child_process'
import {createInterface} from 'node:readline/promises'
const project='form-qc-unm',root='projects/'+project+'/databases/(default)/documents'
const releasePath='projects/'+project+'/releases/cloud.firestore'
const baselineHash='1969b01dc886befc8fa65982c5a57fcbf464581a73a1e4916e1485f8922e8e5c'
const candidateRawHash='687699e91a5c3c44f0a9e39432ed9cde637617300c5346aae88dcc96c5fc286d'
const hash=s=>createHash('sha256').update(s).digest('hex')
const norm=s=>hash(s.replace(/\r\n/g,'\n').trimEnd())
const kinds=['state','audit']
const uidOK=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s)
const runOK=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s)
const timestampOK=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3}|\.\d{6}|\.\d{9})?Z$/.test(s)&&Number.isFinite(Date.parse(s))
const name=(kind,uid)=>root+'/qc_admin_live_pilot_'+kind+'/'+uid
function inspectPair(uid,docs,expectedRun){
 if(!uidOK(uid)||expectedRun!==undefined&&!runOK(expectedRun))throw Error('INVALID_TARGET')
 if(!Array.isArray(docs)||docs.length!==2)throw Error('INVALID_PAIR')
 if(docs.every(d=>d===null))return null
 if(docs.some(d=>!d))throw Error('PARTIAL_PAIR_STOP')
 let runId,createdAt
 const writes=docs.map((d,i)=>{
  const kind=kinds[i],f=d.fields
  if(d.name!==name(kind,uid)||!timestampOK(d.updateTime)||!f||Object.keys(f).sort().join(',')!=='createdAt,kind,ownerUid,runId,testOnly')throw Error('UNEXPECTED_DOCUMENT_SHAPE')
  const v=f.runId?.stringValue,t=f.createdAt?.timestampValue
  if(!runOK(v)||!timestampOK(t)||expectedRun!==undefined&&v!==expectedRun)throw Error('UNEXPECTED_RUN_OR_TIMESTAMP')
  assert.deepEqual(f,{ownerUid:{stringValue:uid},runId:{stringValue:v},kind:{stringValue:kind},testOnly:{booleanValue:true},createdAt:{timestampValue:t}},'UNEXPECTED_SYNTHETIC_FIELDS')
  if(i===0){runId=v;createdAt=t}
  else if(v!==runId||t!==createdAt)throw Error('PAIR_MISMATCH')
  return {delete:d.name,currentDocument:{updateTime:d.updateTime}}
 })
 return {runId,writes}
}
function verifyBackup(dir){
 const parent=realpathSync(join(homedir(),'qc-migration-private')),abs=resolve(dir)
 const st=lstatSync(abs)
 if(dirname(abs)!==parent||!/^native-admin-pilot-release-[A-Za-z0-9]+$/.test(abs.split('/').at(-1))||realpathSync(abs)!==abs||!st.isDirectory()||(st.mode&0o077))throw Error('PRIVATE_BACKUP_REQUIRED')
 function read(n){const p=join(abs,n),s=lstatSync(p);if(!s.isFile()||(s.mode&0o077))throw Error('PRIVATE_BACKUP_FILE_REQUIRED');return readFileSync(p,'utf8')}
 const b=read('rollback.rules'),c=read('candidate.rules'),m=JSON.parse(read('release-backup.json'))
 if(norm(b)!==baselineHash||hash(c)!==candidateRawHash||m.project!==project||m.baselineHash!==baselineHash||m.rollbackRawHash!==hash(b)||m.candidateRawHash!==hash(c)||m.releaseApproved!==false||m.writes!==0||!Array.isArray(m.blockers)||m.blockers.length)throw Error('BACKUP_MISMATCH')
 assert.deepEqual(JSON.parse(read('firebase.rollback.json')),{firestore:{rules:'rollback.rules'}})
 assert.deepEqual(JSON.parse(read('firebase.candidate.json')),{firestore:{rules:'candidate.rules'}})
 console.log('PASS: private rollback backup, candidate and isolated CLI configs verified')
}
async function main(){
 const [mode,arg,run,...extra]=process.argv.slice(2)
 if(extra.length)throw Error('USAGE')
 if(mode==='--self-test'&&arg===undefined){
  const uid='owner1',r='a'.repeat(32),t='2026-11-13T00:00:00.123456Z'
  const docs=kinds.map(kind=>({name:name(kind,uid),updateTime:t,fields:{ownerUid:{stringValue:uid},runId:{stringValue:r},kind:{stringValue:kind},testOnly:{booleanValue:true},createdAt:{timestampValue:t}}}))
  let count=0
  function check(label,fn){fn();count++;console.log('PASS: '+label)}
  check('exact pair builds two updateTime guarded deletes',()=>assert.deepEqual(inspectPair(uid,docs,r),{runId:r,writes:docs.map(d=>({delete:d.name,currentDocument:{updateTime:t}}))}))
  check('both absent is no-op',()=>assert.equal(inspectPair(uid,[null,null],r),null))
  check('partial pair fails closed',()=>assert.throws(()=>inspectPair(uid,[docs[0],null],r),/PARTIAL_PAIR_STOP/))
  check('path injection and wrong collection rejected',()=>{assert.throws(()=>inspectPair('../x',docs));assert.throws(()=>inspectPair(uid,[{...docs[0],name:root+'/qc_records/owner1'},docs[1]]))})
  check('wrong expected run and mismatched pair rejected',()=>{assert.throws(()=>inspectPair(uid,docs,'b'.repeat(32)));assert.throws(()=>inspectPair(uid,[docs[0],{...docs[1],fields:{...docs[1].fields,runId:{stringValue:'b'.repeat(32)}}}]))})
  check('non-test marker and extra fields rejected',()=>{assert.throws(()=>inspectPair(uid,[{...docs[0],fields:{...docs[0].fields,testOnly:{booleanValue:false}}},docs[1]]));assert.throws(()=>inspectPair(uid,[{...docs[0],fields:{...docs[0].fields,extra:{stringValue:'x'}}},docs[1]]))})
  check('missing updateTime and mismatched createdAt rejected',()=>{assert.throws(()=>inspectPair(uid,[{...docs[0],updateTime:''},docs[1]]));assert.throws(()=>inspectPair(uid,[docs[0],{...docs[1],fields:{...docs[1].fields,createdAt:{timestampValue:'2026-11-13T00:00:01Z'}}}]))})
  console.log('SUCCESS: '+count+' synthetic cleanup payload checks passed (local only)')
  return
 }
 if(mode==='--verify-backup'&&arg&&run===undefined){verifyBackup(arg);return}
 if(!['--preview','--delete-confirmed'].includes(mode)||!uidOK(arg)||(mode==='--preview'?run!==undefined:!runOK(run)))throw Error('USAGE')
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('EMULATOR_ENVIRONMENT')
 for(const k of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(process.env[k]&&process.env[k]!==project)throw Error('WRONG_PROJECT')
 const cli=args=>execFileSync('gcloud',args,{encoding:'utf8'}).trim()
 if(cli(['config','get-value','project','--quiet'])!==project)throw Error('WRONG_PROJECT')
 const token=cli(['auth','print-access-token','--quiet'])
 if(!token)throw Error('GCLOUD_AUTH_REQUIRED')
 const headers={Authorization:'Bearer '+token,'X-Goog-User-Project':project}
 const fs='https://firestore.googleapis.com/v1/',rules='https://firebaserules.googleapis.com/v1/'
 async function get(url,allowMissing=false){
  const res=await fetch(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(15000)})
  if(allowMissing&&res.status===404){const b=await res.json();if(b?.error?.status==='NOT_FOUND')return null;throw Error('UNVERIFIED_NOT_FOUND')}
  if(!res.ok)throw Error('READ_HTTP_'+res.status)
  return res.json()
 }
 async function baseline(){
  const r=await get(rules+releasePath)
  if(r.name!==releasePath||!/^projects\/form-qc-unm\/rulesets\/[A-Za-z0-9_-]+$/.test(r.rulesetName||''))throw Error('INVALID_RELEASE')
  const s=await get(rules+r.rulesetName),files=s.source?.files
  if(!Array.isArray(files)||files.length!==1||typeof files[0].content!=='string'||norm(files[0].content)!==baselineHash)throw Error('RESTORE_BASELINE_FIRST')
  return r.rulesetName
 }
 const initial=await baseline()
 const readPair=()=>Promise.all(kinds.map(k=>get(fs+name(k,arg),true)))
 const pair=inspectPair(arg,await readPair(),run)
 if(!pair){console.log('SUCCESS: exact pilot pair absent; no writes');return}
 if(mode==='--preview'){console.log(JSON.stringify({testOnly:true,runId:pair.runId,documents:2,writes:0},null,2));return}
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('INTERACTIVE_CONFIRMATION_REQUIRED')
 const rl=createInterface({input:process.stdin,output:process.stdout})
 let answer
 try{answer=await rl.question('Only after hosted endpoint hard OFF and baseline rollback: type DELETE '+run+' to remove the two exact synthetic documents: ')}finally{rl.close()}
 if(answer!=='DELETE '+run)throw Error('CANCELLED')
 if(await baseline()!==initial)throw Error('LIVE_RELEASE_CHANGED')
 const fresh=inspectPair(arg,await readPair(),run)
 if(!fresh||JSON.stringify(fresh)!==JSON.stringify(pair))throw Error('PAIR_CHANGED_STOP')
 let response
 try{response=await fetch(fs+root+':commit',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({writes:pair.writes}),signal:AbortSignal.timeout(15000),redirect:'error'})}catch{throw Error('CLEANUP_OUTCOME_UNKNOWN_READBACK_REQUIRED')}
 if(!response.ok)throw Error('CLEANUP_HTTP_'+response.status+'_READBACK_REQUIRED')
 let result
 try{result=await response.json()}catch{throw Error('CLEANUP_OUTCOME_UNKNOWN_READBACK_REQUIRED')}
 if(!Array.isArray(result.writeResults)||result.writeResults.length!==2||!timestampOK(result.commitTime))throw Error('CLEANUP_OUTCOME_UNKNOWN_READBACK_REQUIRED')
 if(inspectPair(arg,await readPair(),run)!==null)throw Error('CLEANUP_READBACK_FAILED')
 console.log('SUCCESS: exact two synthetic documents deleted and absence verified')
}
main().catch(e=>{const msg=String(e?.message||'');console.error(/^[A-Z][A-Z0-9_]+$/.test(msg)?msg:'PILOT_CLEANUP_STOPPED');process.exitCode=1})
