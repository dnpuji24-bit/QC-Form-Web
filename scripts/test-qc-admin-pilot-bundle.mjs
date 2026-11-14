// Test the actual bundled entrypoints with locally generated RSA keys and mocked fetch.
// No real tokens, credentials, servers or database writes.
import assert from 'node:assert/strict'
import {generateKeyPairSync,sign} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
const [disabled,active]=process.argv.slice(2)
if(!disabled||!active||process.argv.length!==4)throw Error('USAGE')
const project='form-qc-unm',origin='https://form-qc-unm--react-test-ayyxz4hj.web.app'
const endpoint='https://mcfwnstdfhhtcbksgrlj.supabase.co/functions/v1/qc-native-admin-live-pilot'
const root='projects/'+project+'/databases/(default)/documents'
const uid='owner-bundle-test',email='owner@example.invalid'
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048})
const jwk={...publicKey.export({format:'jwk'}),kid:'local-test-key',alg:'RS256',use:'sig'}
const pem=privateKey.export({format:'pem',type:'pkcs8'}).toString()
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url')
function token(overrides={}){
 const t=Math.floor(Date.now()/1000)
 const data=b64({alg:'RS256',kid:jwk.kid,typ:'JWT'})+'.'+b64({sub:uid,email,iat:t,exp:t+600,auth_time:t,iss:'https://securetoken.google.com/'+project,aud:project,...overrides})
 return data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url')
}
let handler,enabled='true',role='owner',calls=[],commits=0
globalThis.Deno={env:{get:key=>({
 QC_NATIVE_ADMIN_LIVE_PILOT_ENABLED:enabled,
 QC_NATIVE_ADMIN_LIVE_PILOT_ORIGIN:origin,
 GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:project,client_email:'qc-photo-reader@form-qc-unm.iam.gserviceaccount.com',private_key:pem})
})[key]},serve:fn=>{assert.equal(typeof fn,'function');handler=fn}}
globalThis.fetch=async(input,opts={})=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 calls.push(url.origin+url.pathname)
 if(url.href==='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')return Response.json({keys:[jwk]})
 if(url.href==='https://oauth2.googleapis.com/token'){assert.equal(opts.method,'POST');return Response.json({access_token:'mock-read-only-token',expires_in:300})}
 if(url.href==='https://identitytoolkit.googleapis.com/v1/projects/'+project+'/accounts:lookup'){
  assert.deepEqual(JSON.parse(opts.body),{localId:[uid]})
  assert.equal(opts.headers.Authorization,'Bearer mock-read-only-token')
  return Response.json({users:[{localId:uid,email,disabled:false,validSince:'1'}]})
 }
 if(url.origin==='https://firestore.googleapis.com'&&url.pathname==='/v1/'+root+'/users/'+uid){
  assert.equal(opts.headers.Authorization,'Bearer mock-read-only-token')
  return Response.json({fields:{role:{stringValue:role},status:{stringValue:'APPROVED'},active:{booleanValue:true},email:{stringValue:email}}})
 }
 if(url.href==='https://firestore.googleapis.com/v1/'+root+':commit'){
  commits++
  assert.equal(opts.method,'POST')
  assert.equal(opts.headers.Authorization,'Bearer '+currentToken)
  const b=JSON.parse(opts.body)
  assert.deepEqual(Object.keys(b),['writes'])
  assert.equal(b.writes.length,2)
  const run=b.writes[0].update.fields.runId.stringValue
  assert.match(run,/^[a-f0-9]{32}$/)
  for(const [i,kind] of ['state','audit'].entries())assert.deepEqual(b.writes[i],{update:{name:root+'/qc_admin_live_pilot_'+kind+'/'+uid,fields:{ownerUid:{stringValue:uid},runId:{stringValue:run},kind:{stringValue:kind},testOnly:{booleanValue:true}}},currentDocument:{exists:false},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]})
  return Response.json({writeResults:[{},{}],commitTime:'2026-11-13T00:00:00Z'})
 }
 throw Error('UNEXPECTED_MOCK_URL')
}
let currentToken=token()
async function request(code,body,t=currentToken,o=origin,requestBody){
 const r=await handler(new Request(endpoint,{method:'POST',headers:{Origin:o,Authorization:'Bearer '+t},...(requestBody===undefined?{}:{body:requestBody,duplex:'half'})}))
 assert.equal(r.status,code)
 assert.deepEqual(await r.json(),body)
}
await import(pathToFileURL(resolve(disabled)).href)
await request(503,{error:'ADMIN_PILOT_DISABLED'})
assert.equal(calls.length,0)
console.log('PASS: bundled quarantine remains OFF even with true flag')
await import(pathToFileURL(resolve(active)).href)
enabled='false'
await request(503,{error:'ADMIN_PILOT_DISABLED'})
assert.equal(calls.length,0)
console.log('PASS: bundled candidate defaults to OFF')
enabled='true'
await request(403,{error:'FORBIDDEN'},currentToken,'https://invalid.example')
await request(401,{error:'UNAUTHORIZED'},'invalid')
assert.equal(calls.length,0)
console.log('PASS: origin and malformed token blocked before network')
const emptyStream=()=>new ReadableStream({start(c){c.close()}})
await request(401,{error:'UNAUTHORIZED'},'invalid',origin,emptyStream())
await request(400,{error:'INVALID_REQUEST'},currentToken,origin,' ')
await request(400,{error:'INVALID_REQUEST'},currentToken,origin,new Uint8Array([0]))
assert.equal(calls.length,0)
assert.equal(commits,0)
console.log('PASS: bundled zero-byte stream authenticates; nonempty bodies denied without upstream calls')
await request(401,{error:'UNAUTHORIZED'},token({aud:'wrong-project'}))
assert.equal(commits,0)
console.log('PASS: real signed JWT with wrong audience denied')
role='pengunjung'
await request(403,{error:'OWNER_REQUIRED'},currentToken,origin,emptyStream())
assert.equal(commits,0)
console.log('PASS: real signed non-Owner rejected')
role='owner'
await request(401,{error:'RECENT_AUTH_REQUIRED'},token({auth_time:Math.floor(Date.now()/1000)-600}))
assert.equal(commits,0)
console.log('PASS: stale signed Owner denied')
currentToken=token()
await request(200,{ok:true,testOnly:true,documentsCreated:2},currentToken,origin,emptyStream())
assert.equal(commits,1)
console.log('PASS: real signed Owner yields only exact mocked synthetic pair')
console.log('SUCCESS: 8 bundled entrypoint checks passed (mock fetch only; no live writes)')
