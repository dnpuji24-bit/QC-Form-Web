import assert from 'node:assert/strict'
import {createAdminLivePilotHandler,commitSyntheticAdminPair} from '../supabase/functions/qc-native-admin-live-pilot/handler.mjs'
const origin='https://portal.example.test',url='https://edge.example.test/qc-native-admin-live-pilot'
const actor={sub:'owner1',email:'owner@example.test',auth_time:900}
const account={localId:actor.sub,email:actor.email,disabled:false,validSince:'800'}
const profile={role:'owner',status:'APPROVED',active:true,email:actor.email}
function fixture(overrides={}){
 const calls={verify:0,account:0,profile:0,commit:0}
 const handler=createAdminLivePilotHandler({
  env:key=>({QC_NATIVE_ADMIN_LIVE_PILOT_ORIGIN:origin,QC_NATIVE_ADMIN_LIVE_PILOT_ENABLED:'true',...overrides.env})[key],
  verify:async token=>{calls.verify++;assert.equal(token,'a.b.c');if(overrides.badToken)throw Error('invalid');return {...actor,...overrides.actor}},
  readAccount:async uid=>{calls.account++;assert.equal(uid,actor.sub);if(overrides.failAccount)throw Error('unavailable');return overrides.account===null?null:{...account,...overrides.account}},
  readProfile:async uid=>{calls.profile++;assert.equal(uid,actor.sub);if(overrides.failProfile)throw Error('unavailable');return overrides.profile===null?null:{...profile,...overrides.profile}},
  commitPair:async args=>{calls.commit++;assert.deepEqual(args,{uid:actor.sub,token:'a.b.c'});return overrides.result??'committed'},
  now:()=>1000
 })
 return {calls,run:(opts={})=>handler(new Request(opts.url||url,{method:opts.method||'POST',headers:{Origin:opts.origin??origin,Authorization:opts.auth??'Bearer a.b.c',...opts.headers},...(opts.body===undefined?{}:{body:opts.body,duplex:'half'})}))}
}
let n=0
async function check(label,fn){await fn();console.log('PASS: '+label);n++}
async function status(f,s,opts){const r=await f.run(opts);assert.equal(r.status,s);return r}
const zero={verify:0,account:0,profile:0,commit:0}
await check('disabled by default; no upstream calls',async()=>{const f=fixture({env:{QC_NATIVE_ADMIN_LIVE_PILOT_ENABLED:undefined}});await status(f,503);assert.deepEqual(f.calls,zero)})
await check('invalid HTTPS origin config fails closed',async()=>{for(const v of ['http://portal.example.test',origin+'/path','']){const f=fixture({env:{QC_NATIVE_ADMIN_LIVE_PILOT_ORIGIN:v}});await status(f,503);assert.deepEqual(f.calls,zero)}})
await check('wrong origin and unknown route denied',async()=>{const f=fixture();await status(f,403,{origin:'https://other.test'});await status(f,404,{url:url+'/write'});assert.deepEqual(f.calls,zero)})
await check('preflight CORS allows authorization only; GET denied',async()=>{const f=fixture();const r=await status(f,204,{method:'OPTIONS'});assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);await status(f,405,{method:'GET'});assert.deepEqual(f.calls,zero)})
await check('administrative command and query cannot reach backend',async()=>{const f=fixture();await status(f,400,{body:'{"action":"activate"}'});await status(f,400,{url:url+'?uid=other'});assert.deepEqual(f.calls,zero)})
const stream=(chunks=[])=>new ReadableStream({start(c){for(const x of chunks)c.enqueue(x);c.close()}})
await check('zero-byte gateway body reaches authentication, never bypasses it',async()=>{
 for(const body of ['',stream(),stream([new Uint8Array(0)])]){
  const f=fixture();assert.deepEqual(await (await status(f,401,{body,auth:'Bearer invalid',headers:{'Content-Length':'0'}})).json(),{error:'UNAUTHORIZED'});assert.deepEqual(f.calls,zero)
 }
 const f=fixture();await status(f,200,{body:stream()});assert.deepEqual(f.calls,{verify:1,account:1,profile:1,commit:1})
 const denied=fixture({profile:{role:'manager'}});await status(denied,403,{body:stream()});assert.equal(denied.calls.commit,0)
})
await check('every nonempty body and ambiguous declared length rejected before verification',async()=>{
 const f=fixture()
 for(const body of [' ','{}',new Uint8Array([0]),stream([new Uint8Array(0),new Uint8Array([1])])])await status(f,400,{body,headers:{'Content-Length':'0'}})
 for(const length of ['1','00','0, 0'])await status(f,400,{headers:{'Content-Length':length}})
 assert.deepEqual(f.calls,zero)
})
await check('stalled, errored and excessive empty chunks fail closed',async()=>{
 const f=fixture()
 let cancelled=false
 await status(f,400,{body:new ReadableStream({cancel(){cancelled=true}})})
 assert.equal(cancelled,true)
 await status(f,400,{body:new ReadableStream({start(c){c.error(Error('test stream failure'))}})})
 await status(f,400,{body:stream(Array.from({length:8},()=>new Uint8Array(0)))})
 assert.deepEqual(f.calls,zero)
})
await check('missing and malformed token denied before verification',async()=>{const f=fixture();for(const auth of ['','Bearer invalid','Bearer x.y.z extra'])await status(f,401,{auth});assert.deepEqual(f.calls,zero)})
await check('invalid signature stops before Google REST',async()=>{const f=fixture({badToken:true});await status(f,401);assert.deepEqual(f.calls,{verify:1,account:0,profile:0,commit:0})})
await check('invalid UID, email and auth_time rejected',async()=>{for(const a of [{sub:'../other'},{email:''},{auth_time:2000},{auth_time:0}]){const f=fixture({actor:a});await status(f,401);assert.equal(f.calls.account,0)}})
await check('missing, disabled, revoked and mismatched accounts denied',async()=>{for(const a of [null,{disabled:true},{validSince:'901'},{validSince:''},{localId:'other'}]){const f=fixture({account:a});await status(f,401);assert.equal(f.calls.profile,0)}})
await check('pending, inactive, absent and mixed-case Owner denied',async()=>{for(const p of [null,{status:'PENDING'},{active:false},{active:'true'},{status:'Approved'}])await status(fixture({profile:p}),403)})
await check('non-Owner and email mismatch denied',async()=>{for(const p of [{role:'manager'},{email:'other@example.test'}])await status(fixture({profile:p}),403);await status(fixture({account:{email:'other@example.test'}}),403)})
await check('Google read failure fails closed with sanitized response',async()=>{for(const f of [fixture({failAccount:true}),fixture({failProfile:true})])assert.deepEqual(await (await status(f,503)).json(),{error:'ADMIN_PILOT_UNAVAILABLE'})})
await check('approved Owner uppercase and lowercase accepted with fixed synthetic response',async()=>{for(const state of ['APPROVED','approved']){const f=fixture({profile:{status:state}});const r=await status(f,200);assert.deepEqual(await r.json(),{ok:true,testOnly:true,documentsCreated:2});assert.equal(r.headers.get('Cache-Control'),'no-store');assert.deepEqual(f.calls,{verify:1,account:1,profile:1,commit:1})}})

await check('stale authentication cannot commit even for approved Owner',async()=>{const f=fixture({actor:{auth_time:699},account:{validSince:'600'}});assert.deepEqual(await (await status(f,401)).json(),{error:'RECENT_AUTH_REQUIRED'});assert.equal(f.calls.commit,0)})
await check('write denial or unknown outcome is not success and never retried',async()=>{for(const [result,code,error] of [['denied',403,'PILOT_WRITE_DENIED'],['unknown',503,'PILOT_COMMIT_OUTCOME_UNKNOWN']]){const f=fixture({result});assert.deepEqual(await (await status(f,code)).json(),{error});assert.equal(f.calls.commit,1)}})
await check('REST pair uses caller Firebase token and exactly two create-only fixed paths',async()=>{
 const calls=[]
 const result=await commitSyntheticAdminPair({uid:'owner1',token:'a.b.c',fetchImpl:async(url,opts)=>{
  calls.push({url,opts});assert.equal(url,'https://firestore.googleapis.com/v1/projects/form-qc-unm/databases/(default)/documents:commit');assert.equal(opts.method,'POST');assert.equal(opts.headers.Authorization,'Bearer a.b.c');assert.equal(opts.redirect,'error')
  const body=JSON.parse(opts.body);assert.deepEqual(Object.keys(body),['writes']);assert.equal(body.writes.length,2)
  const id=body.writes[0].update.fields.runId.stringValue;assert.match(id,/^[a-f0-9]{32}$/)
  for(const [i,kind] of ['state','audit'].entries())assert.deepEqual(body.writes[i],{update:{name:'projects/form-qc-unm/databases/(default)/documents/qc_admin_live_pilot_'+kind+'/owner1',fields:{ownerUid:{stringValue:'owner1'},runId:{stringValue:id},kind:{stringValue:kind},testOnly:{booleanValue:true}}},currentDocument:{exists:false},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]})
  return Response.json({writeResults:[{},{}],commitTime:'2026-11-13T00:00:00Z'})
 }})
 assert.equal(result,'committed');assert.equal(calls.length,1)
})
await check('REST invalid identity stops before network',async()=>{for(const [uid,token] of [['../x','a.b.c'],['owner1','invalid']])await assert.rejects(commitSyntheticAdminPair({uid,token,fetchImpl:()=>{throw Error('NETWORK_CALLED')}}),/INVALID_PILOT_IDENTITY/)})
await check('REST denied and uncertain responses never retry or leak backend details',async()=>{
 for(const [response,expected] of [[()=>new Response('secret',{status:403}),'denied'],[()=>new Response('secret',{status:503}),'unknown'],[()=>Response.json({writeResults:[{}],commitTime:'x'}),'unknown'],[()=>{throw Error('secret')},'unknown']]){
  let calls=0;assert.equal(await commitSyntheticAdminPair({uid:'owner1',token:'a.b.c',fetchImpl:async()=>{calls++;return response()}}),expected);assert.equal(calls,1)
 }
})
console.log('SUCCESS: '+n+' isolated native admin Edge pilot checks passed (mock only; no network or writes)')
