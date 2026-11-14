// Operator-only preflight and future one-shot synthetic transaction; no deployment or cleanup.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createInterface} from 'node:readline/promises'
const project='form-qc-unm',origin='https://form-qc-unm--react-test-ayyxz4hj.web.app'
const endpoint='https://mcfwnstdfhhtcbksgrlj.supabase.co/functions/v1/qc-native-admin-live-pilot'
const root='projects/'+project+'/databases/(default)/documents'
const releasePath='projects/'+project+'/releases/cloud.firestore'
const fs='https://firestore.googleapis.com/v1/',rules='https://firebaserules.googleapis.com/v1/'
const baselineHash='1969b01dc886befc8fa65982c5a57fcbf464581a73a1e4916e1485f8922e8e5c'
const candidateRawHash='687699e91a5c3c44f0a9e39432ed9cde637617300c5346aae88dcc96c5fc286d'
const kinds=['state','audit'],uidOK=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s)
const hash=s=>createHash('sha256').update(s).digest('hex'),norm=s=>hash(s.replace(/\r\n/g,'\n').trimEnd())
const doc=(k,uid)=>root+'/qc_admin_live_pilot_'+k+'/'+uid
const email=s=>typeof s==='string'?s.trim().toLowerCase():''
const timestamp=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3}|\.\d{6}|\.\d{9})?Z$/.test(s)&&Number.isFinite(Date.parse(s))
function pair(uid,docs){
 if(!uidOK(uid)||!Array.isArray(docs)||docs.length!==2)throw Error('INVALID_PAIR')
 if(docs.every(d=>d===null))return null
 if(docs.some(d=>!d))throw Error('PARTIAL_PAIR_STOP')
 let run,at
 for(const [i,k] of kinds.entries()){
  const d=docs[i],f=d.fields,r=f?.runId?.stringValue,t=f?.createdAt?.timestampValue
  if(d.name!==doc(k,uid)||!/^[a-f0-9]{32}$/.test(r||'')||!timestamp(t)||!timestamp(d.updateTime))throw Error('INVALID_PAIR_DOCUMENT')
  assert.deepEqual(f,{ownerUid:{stringValue:uid},runId:{stringValue:r},kind:{stringValue:k},testOnly:{booleanValue:true},createdAt:{timestampValue:t}})
  if(i===0){run=r;at=t}else if(run!==r||at!==t)throw Error('PAIR_MISMATCH')
 }
 return run
}
function identity(label,c,a,p){
 const uid=c?.sub,now=Math.floor(Date.now()/1000),raw=a?.validSince
 const since=typeof raw==='string'&&/^\d+$/.test(raw)?Number(raw):typeof raw==='number'?raw:NaN
 if(!uidOK(uid)||c.aud!==project||c.iss!=='https://securetoken.google.com/'+project||!Number.isInteger(c.exp)||c.exp<=now||!Number.isInteger(c.auth_time)||c.auth_time<=0||c.auth_time>now+5||now-c.auth_time>300)throw Error('SESSION_INVALID')
 if(!a||a.localId!==uid||a.disabled===true||!Number.isSafeInteger(since)||since<0||c.auth_time<since||!email(c.email)||email(a.email)!==email(c.email))throw Error('ACCOUNT_INVALID')
 if(p?.active?.booleanValue!==true||!['APPROVED','approved'].includes(p.status?.stringValue)||email(p.email?.stringValue)!==email(c.email))throw Error('PROFILE_INVALID')
 const role=p.role?.stringValue
 if(typeof role!=='string'||!role||(label==='OWNER'?role!=='owner':role==='owner'))throw Error('ROLE_INVALID')
 return uid
}
const empty=p=>p&&typeof p==='object'&&!Array.isArray(p)&&(p.documents===undefined||Array.isArray(p.documents)&&p.documents.length===0)&&(p.nextPageToken===undefined||p.nextPageToken==='')
function reply(r,status,body){assert.equal(r.status,status);assert.deepEqual(r.body,body)}
function selfTest(){
 const uid='owner1',r='a'.repeat(32),t='2026-11-13T00:00:00.123456Z'
 const docs=kinds.map(k=>({name:doc(k,uid),updateTime:t,fields:{ownerUid:{stringValue:uid},runId:{stringValue:r},kind:{stringValue:k},testOnly:{booleanValue:true},createdAt:{timestampValue:t}}}))
 let n=0
 const check=(s,fn)=>{fn();n++;console.log('PASS: '+s)}
 check('absent and exact pair accepted',()=>{assert.equal(pair(uid,[null,null]),null);assert.equal(pair(uid,docs),r)})
 check('partial pair rejected',()=>assert.throws(()=>pair(uid,[docs[0],null])))
 check('wrong path and run rejected',()=>{assert.throws(()=>pair(uid,[{...docs[0],name:root+'/qc_records/x'},docs[1]]));assert.throws(()=>pair(uid,[docs[0],{...docs[1],fields:{...docs[1].fields,runId:{stringValue:'b'.repeat(32)}}}]))})
 check('non-test, extra field and invalid timestamp rejected',()=>{assert.throws(()=>pair(uid,[{...docs[0],fields:{...docs[0].fields,testOnly:{booleanValue:false}}},docs[1]]));assert.throws(()=>pair(uid,[{...docs[0],fields:{...docs[0].fields,x:{stringValue:'x'}}},docs[1]]));assert.throws(()=>pair(uid,[{...docs[0],updateTime:''},docs[1]]))})
 check('collection emptiness fails closed',()=>{assert.ok(empty({}));for(const p of [null,{documents:[{}]},{nextPageToken:'x'},{documents:'bad'},{nextPageToken:1}])assert.ok(!empty(p))})
 const now=Math.floor(Date.now()/1000),c={sub:uid,aud:project,iss:'https://securetoken.google.com/'+project,exp:now+600,auth_time:now,email:'owner@example.invalid'},a={localId:uid,email:c.email,validSince:'1'},p={email:{stringValue:c.email},role:{stringValue:'owner'},status:{stringValue:'APPROVED'},active:{booleanValue:true}}
 check('role separation',()=>{assert.equal(identity('OWNER',c,a,p),uid);assert.throws(()=>identity('DENIED',c,a,p));assert.equal(identity('DENIED',c,a,{...p,role:{stringValue:'pengunjung'}}),uid)})
 check('stale, revoked, inactive and wrong project rejected',()=>{assert.throws(()=>identity('OWNER',{...c,auth_time:now-301},a,p));assert.throws(()=>identity('OWNER',c,{...a,validSince:String(now+1)},p));assert.throws(()=>identity('OWNER',c,a,{...p,active:{booleanValue:false}}));assert.throws(()=>identity('OWNER',{...c,aud:'wrong'},a,p))})
 check('exact HTTP and response required',()=>{reply({status:503,body:{error:'ADMIN_PILOT_DISABLED'}},503,{error:'ADMIN_PILOT_DISABLED'});assert.throws(()=>reply({status:200,body:{ok:true}},200,{ok:true,testOnly:true,documentsCreated:2}))})
 console.log('SUCCESS: '+n+' admin transaction runner guard checks passed (offline)')
}
async function main(){
 const mode=process.argv[2]
 if(process.argv.length!==3)throw Error('USAGE')
 if(mode==='--self-test'){selfTest();return}
 if(!['--preflight-confirmed','--synthetic-live-confirmed'].includes(mode)||!process.stdin.isTTY||!process.stdout.isTTY)throw Error('INTERACTIVE_REQUIRED')
 const live=mode==='--synthetic-live-confirmed'
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('EMULATOR_ENVIRONMENT')
 for(const k of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(process.env[k]&&process.env[k]!==project)throw Error('WRONG_PROJECT')
 const cli=args=>execFileSync('gcloud',args,{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:30000}).trim()
 if(cli(['config','get-value','project','--quiet'])!==project)throw Error('WRONG_PROJECT')
 const token=cli(['auth','print-access-token','--quiet'])
 if(!token)throw Error('GCLOUD_AUTH_REQUIRED')
 const headers={Authorization:'Bearer '+token,'X-Goog-User-Project':project}
 async function get(url,missing=false){
  const r=await fetch(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(15000)})
  if(missing&&r.status===404){const b=await r.json();if(b?.error?.status==='NOT_FOUND')return null}
  if(!r.ok)throw Error('READ_HTTP_'+r.status)
  return r.json()
 }
 const candidate=readFileSync(new URL('./firestore.native-admin-pilot-release.rules',import.meta.url),'utf8')
 if(hash(candidate)!==candidateRawHash)throw Error('CANDIDATE_HASH_MISMATCH')
 async function verifyRules(){
  const r=await get(rules+releasePath)
  if(r.name!==releasePath||!/^projects\/form-qc-unm\/rulesets\/[A-Za-z0-9_-]+$/.test(r.rulesetName||''))throw Error('INVALID_RELEASE')
  const f=(await get(rules+r.rulesetName)).source?.files
  if(!Array.isArray(f)||f.length!==1||typeof f[0].content!=='string'||norm(f[0].content)!==(live?norm(candidate):baselineHash))throw Error('UNEXPECTED_LIVE_RULES')
  const latest=await get(rules+releasePath)
  if(latest.rulesetName!==r.rulesetName||latest.updateTime!==r.updateTime)throw Error('LIVE_RELEASE_CHANGED')
  return r.rulesetName
 }
 async function verifyEmpty(){for(const k of kinds){const u=new URL(fs+root+'/qc_admin_live_pilot_'+k);u.searchParams.set('pageSize','1');u.searchParams.set('mask.fieldPaths','testOnly');if(!empty(await get(u)))throw Error('PILOT_NOT_EMPTY')}}
 const release=await verifyRules();await verifyEmpty()
 console.log('PASS: expected rules and both pilot collections empty')
 async function call(t,o=origin){const r=await fetch(endpoint,{method:'POST',headers:{Origin:o,Authorization:'Bearer '+t},redirect:'error',signal:AbortSignal.timeout(60000)});return {status:r.status,body:await r.json()}}
 const expect=async(t,status,body,o)=>reply(await call(t,o),status,body)
 await expect('invalid',live?401:503,{error:live?'UNAUTHORIZED':'ADMIN_PILOT_DISABLED'})
 await expect('invalid',403,{error:'FORBIDDEN'},'https://invalid.example')
 console.log('PASS: hosted gate and origin match requested mode')
 const apiKey=readFileSync(new URL('../src/firebase.ts',import.meta.url),'utf8').match(/VITE_FIREBASE_API_KEY \|\| '([^']+)'/)?.[1]
 if(!apiKey)throw Error('FIREBASE_CONFIG_MISSING')
 async function authPost(route,data){
  const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:'+route+'?key='+encodeURIComponent(apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),redirect:'error',signal:AbortSignal.timeout(20000)})
  if(!r.ok)throw Error('FIREBASE_AUTH_HTTP_'+r.status)
  return r.json()
 }
 async function login(label){
  const e=process.env['TEST_'+label+'_EMAIL'],p=process.env['TEST_'+label+'_PASSWORD']
  delete process.env['TEST_'+label+'_EMAIL'];delete process.env['TEST_'+label+'_PASSWORD']
  if(!e||!p)throw Error('CREDENTIALS_REQUIRED')
  const d=await authPost('signInWithPassword',{email:e,password:p,returnSecureToken:true}),idToken=d.idToken
  if(typeof idToken!=='string'||!/^([A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+$/.test(idToken)||idToken.length>8192)throw Error('TOKEN_INVALID')
  // Firebase lookup validates the fresh token; claims decoded only for consistency.
  const c=JSON.parse(Buffer.from(idToken.split('.')[1],'base64url').toString())
  if(!uidOK(c.sub)||d.localId!==c.sub)throw Error('UID_INVALID')
  const a=(await authPost('lookup',{idToken})).users?.[0]
  const profile=(await get(fs+root+'/users/'+c.sub+'?mask.fieldPaths=role&mask.fieldPaths=status&mask.fieldPaths=active&mask.fieldPaths=email')).fields
  const uid=identity(label,c,a,profile)
  console.log('PASS: '+label+' Firebase account and current profile verified')
  return {uid,idToken}
 }
 const denied=await login('DENIED'),owner=await login('OWNER')
 if(owner.uid===denied.uid)throw Error('DISTINCT_ACCOUNTS_REQUIRED')
 const readPair=uid=>Promise.all(kinds.map(k=>get(fs+doc(k,uid),true)))
 for(const a of [owner,denied])assert.equal(pair(a.uid,await readPair(a.uid)),null)
 await expect(denied.idToken,live?403:503,{error:live?'OWNER_REQUIRED':'ADMIN_PILOT_DISABLED'})
 if(!live){
  await expect(owner.idToken,503,{error:'ADMIN_PILOT_DISABLED'})
  await verifyEmpty();if(await verifyRules()!==release)throw Error('LIVE_RELEASE_CHANGED')
  console.log('SUCCESS: admin pilot preflight passed; no document writes or deployment')
  return
 }
 // This mode is NOT authorized by the current preflight stage.
 const rl=createInterface({input:process.stdin,output:process.stdout})
 let answer
 try{answer=await rl.question('Only after explicit release approval and with rollback ready: type TEST SYNTHETIC PAIR: ')}finally{rl.close()}
 if(answer!=='TEST SYNTHETIC PAIR')throw Error('CANCELLED')
 await verifyEmpty();if(await verifyRules()!==release)throw Error('LIVE_RELEASE_CHANGED')
 console.log('LIVE: one Owner request; never retry an uncertain outcome')
 console.log('Private cleanup UID (redact screenshot): '+owner.uid)
 let response=null
 try{response=await call(owner.idToken)}catch{console.error('LIVE_RESPONSE_UNKNOWN_READBACK_REQUIRED')}
 let run
 try{run=pair(owner.uid,await readPair(owner.uid));console.log('Owner pair: '+(run?'present':'absent'));if(run)console.log('Private cleanup run ID: '+run);assert.equal(pair(denied.uid,await readPair(denied.uid)),null);if(await verifyRules()!==release)throw Error('LIVE_RELEASE_CHANGED')}catch{throw Error('LIVE_READBACK_FAILED_DISABLE_AND_REVIEW')}
 if(!response||!run)throw Error('LIVE_OUTCOME_NOT_CONFIRMED_DISABLE_AND_REVIEW')
 reply(response,200,{ok:true,testOnly:true,documentsCreated:2})
 console.log('SUCCESS: exact live synthetic pair verified; disable endpoint, rollback rules, then separately clean up')
}
main().catch(e=>{const m=String(e?.message||'');console.error(/^[A-Z][A-Z0-9_]+$/.test(m)?m:'ADMIN_TRANSACTION_STOPPED');process.exitCode=1})
