import assert from 'node:assert/strict'
import {createAdminReadinessHandler} from '../supabase/functions/qc-native-admin-readiness/handler.mjs'
const origin='https://portal.example.test',url='https://edge.example.test/qc-native-admin-readiness'
const actor={sub:'owner1',email:'owner@example.test',auth_time:900}
const account={localId:actor.sub,email:actor.email,disabled:false,validSince:'800'}
const profile={role:'owner',status:'APPROVED',active:true,email:actor.email}
function fixture(overrides={}){
 const calls={verify:0,account:0,profile:0}
 const handler=createAdminReadinessHandler({
  env:key=>({QC_NATIVE_ADMIN_READINESS_ORIGIN:origin,QC_NATIVE_ADMIN_READINESS_ENABLED:'true',...overrides.env})[key],
  verify:async token=>{calls.verify++;assert.equal(token,'a.b.c');if(overrides.badToken)throw Error('invalid');return {...actor,...overrides.actor}},
  readAccount:async uid=>{calls.account++;assert.equal(uid,actor.sub);if(overrides.failAccount)throw Error('unavailable');return overrides.account===null?null:{...account,...overrides.account}},
  readProfile:async uid=>{calls.profile++;assert.equal(uid,actor.sub);if(overrides.failProfile)throw Error('unavailable');return overrides.profile===null?null:{...profile,...overrides.profile}},
  now:()=>1000
 })
 return {calls,run:(opts={})=>handler(new Request(opts.url||url,{method:opts.method||'POST',headers:{Origin:opts.origin??origin,Authorization:opts.auth??'Bearer a.b.c'},...(opts.body===undefined?{}:{body:opts.body})}))}
}
let n=0
async function check(label,fn){await fn();console.log('PASS: '+label);n++}
async function status(f,s,opts){const r=await f.run(opts);assert.equal(r.status,s);return r}
const zero={verify:0,account:0,profile:0}
await check('disabled by default; no upstream calls',async()=>{const f=fixture({env:{QC_NATIVE_ADMIN_READINESS_ENABLED:undefined}});await status(f,503);assert.deepEqual(f.calls,zero)})
await check('invalid HTTPS origin config fails closed',async()=>{for(const v of ['http://portal.example.test',origin+'/path','']){const f=fixture({env:{QC_NATIVE_ADMIN_READINESS_ORIGIN:v}});await status(f,503);assert.deepEqual(f.calls,zero)}})
await check('wrong origin and unknown route denied',async()=>{const f=fixture();await status(f,403,{origin:'https://other.test'});await status(f,404,{url:url+'/write'});assert.deepEqual(f.calls,zero)})
await check('preflight CORS allows authorization only; GET denied',async()=>{const f=fixture();const r=await status(f,204,{method:'OPTIONS'});assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);await status(f,405,{method:'GET'});assert.deepEqual(f.calls,zero)})
await check('administrative command and query cannot reach backend',async()=>{const f=fixture();await status(f,400,{body:'{"action":"activate"}'});await status(f,400,{url:url+'?uid=other'});assert.deepEqual(f.calls,zero)})
await check('missing and malformed token denied before verification',async()=>{const f=fixture();for(const auth of ['','Bearer invalid','Bearer x.y.z extra'])await status(f,401,{auth});assert.deepEqual(f.calls,zero)})
await check('invalid signature stops before Google REST',async()=>{const f=fixture({badToken:true});await status(f,401);assert.deepEqual(f.calls,{verify:1,account:0,profile:0})})
await check('invalid UID, email and auth_time rejected',async()=>{for(const a of [{sub:'../other'},{email:''},{auth_time:2000},{auth_time:0}]){const f=fixture({actor:a});await status(f,401);assert.equal(f.calls.account,0)}})
await check('missing, disabled, revoked and mismatched accounts denied',async()=>{for(const a of [null,{disabled:true},{validSince:'901'},{validSince:''},{localId:'other'}]){const f=fixture({account:a});await status(f,401);assert.equal(f.calls.profile,0)}})
await check('pending, inactive, absent and mixed-case Owner denied',async()=>{for(const p of [null,{status:'PENDING'},{active:false},{active:'true'},{status:'Approved'}])await status(fixture({profile:p}),403)})
await check('non-Owner and email mismatch denied',async()=>{for(const p of [{role:'manager'},{email:'other@example.test'}])await status(fixture({profile:p}),403);await status(fixture({account:{email:'other@example.test'}}),403)})
await check('Google read failure fails closed with sanitized response',async()=>{for(const f of [fixture({failAccount:true}),fixture({failProfile:true})])assert.deepEqual(await (await status(f,503)).json(),{error:'READINESS_UNAVAILABLE'})})
await check('approved Owner uppercase and lowercase accepted with fixed read-only response',async()=>{for(const state of ['APPROVED','approved']){const f=fixture({profile:{status:state}});const r=await status(f,200);assert.deepEqual(await r.json(),{ok:true,role:'owner',profileVerified:true,writesEnabled:false});assert.equal(r.headers.get('Cache-Control'),'no-store');assert.deepEqual(f.calls,{verify:1,account:1,profile:1})}})
console.log('SUCCESS: '+n+' native admin Edge readiness checks passed (mock only; no network or writes)')
