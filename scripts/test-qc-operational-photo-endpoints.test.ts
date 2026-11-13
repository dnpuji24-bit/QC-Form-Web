// Real Request/Response handlers, locally signed JWTs, mocked Google REST and storage.
// No production credentials, network permissions, Firestore writes or storage writes.
import assert from 'node:assert/strict'
import {createLocalJWKSet,exportJWK,generateKeyPair,jwtVerify,SignJWT} from 'npm:jose@6.1.0'
import {createHandler as createUpload} from '../supabase/functions/qc-photo-upload/handler.ts'
import {createHandler as createSigner} from '../supabase/functions/qc-photo-sign-operational/handler.ts'
import {prepareOperationalPhotoManifest} from '../src/qcOperationalPhotoManifest.mjs'
const origin='https://photo-test.example.test',project='form-qc-unm'
const recordId='qc-v2-synthetic-001',revision='rev1'
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
const now=Math.floor(Date.now()/1000)
const keys=await generateKeyPair('RS256',{extractable:true})
const jwk=await exportJWK(keys.publicKey)
const local=createLocalJWKSet({keys:[{...jwk,kid:'test-key',alg:'RS256',use:'sig'}]})
async function token(uid:string,aud=project,expiration=now+300){
 return new SignJWT({email:uid+'@example.test',auth_time:now-10})
   .setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject(uid)
   .setIssuer('https://securetoken.google.com/'+project).setAudience(aud)
   .setIssuedAt(now-10).setExpirationTime(expiration).sign(keys.privateKey)
}
const tokens:Record<string,string>={}
for(const uid of ['owner','mandor','viewer','none','pending','inactive','revoked','other'])tokens[uid]=await token(uid)
function field(value:any):any{
 if(typeof value==='string')return {stringValue:value}
 if(typeof value==='boolean')return {booleanValue:value}
 if(Number.isInteger(value))return {integerValue:String(value)}
 if(value&&typeof value==='object')return {mapValue:{fields:fields(value)}}
 throw Error('Unsupported fixture')
}
function fields(row:Record<string,any>){return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,field(v)]))}
function fixture(){
 const docs=new Map<string,Record<string,any>>()
 const objects=new Map<string,Blob>()
 const stats={uploads:0,downloads:0,signs:0,google:0,verifies:0}
 let enabled=true
 const roleMap:Record<string,string>={owner:'owner',mandor:'mandor_spraying',viewer:'manager',none:'pengunjung',pending:'owner',inactive:'owner',revoked:'owner',other:'mandor_spraying'}
 for(const [uid,role] of Object.entries(roleMap))docs.set('users/'+uid,{email:uid+'@example.test',role,active:uid!=='inactive',status:uid==='pending'?'PENDING':'APPROVED'})
 for(const [role,permissions] of Object.entries({mandor_spraying:{qc_spraying:'edit',qc_records:'view'},manager:{qc_spraying:'view',qc_records:'view'},pengunjung:{qc_spraying:'none',qc_records:'none'}}))docs.set('role_access/'+role,{role,permissions})
 const intent={ownerUid:'mandor',formType:'spray',clientRevision:revision}
 docs.set('qc_photo_upload_intents/'+recordId,intent)
 const deps={
  env:(key:string)=>({QC_OPERATIONAL_PHOTO_ALLOWED_ORIGIN:origin,QC_OPERATIONAL_PHOTO_ENABLED:enabled?'true':'false',GOOGLE_SERVICE_ACCOUNT_JSON:'{}',SUPABASE_SECRET_KEYS:'{"default":"sb_secret_synthetic"}'} as Record<string,string>)[key],
  jwtVerify:async(jwt:string,_remote:any,options:any)=>{stats.verifies++;return jwtVerify(jwt,local,options)},
  googleAccessToken:async()=> 'mock-oauth',
  googleJson:async(url:string,oauth:string,body?:any)=>{
   assert.equal(oauth,'mock-oauth');stats.google++
   if(url.includes('/accounts:lookup')){
    const uid=body.localId[0]
    return {users:[{localId:uid,email:uid+'@example.test',disabled:false,validSince:String(uid==='revoked'?now:now-100)}]}
   }
   const prefix='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/'
   assert.ok(url.startsWith(prefix));const row=docs.get(url.slice(prefix.length))
   return row?{fields:fields(row)}:null
  },
  createClient:(url:string,key:string)=>{assert.equal(url,'https://mcfwnstdfhhtcbksgrlj.supabase.co');assert.equal(key,'sb_secret_synthetic');return {storage:{from(bucket:string){
   assert.equal(bucket,'qc-photos')
   return {
    async upload(path:string,blob:Blob,options:any){stats.uploads++;assert.equal(options.upsert,false);if(objects.has(path))return {error:{message:'duplicate'}};objects.set(path,blob);return {error:null}},
    async download(path:string){stats.downloads++;const data=objects.get(path);return {data,error:data?null:{message:'missing'}}},
    async createSignedUrl(path:string,ttl:number){stats.signs++;assert.equal(ttl,60);assert.ok(objects.has(path));return {data:{signedUrl:'https://example.test/synthetic'},error:null}},
   }
  }}}},
 }
 // Only local test doubles are cast; production uses the typed defaults.
 const upload=createUpload(deps as unknown as NonNullable<Parameters<typeof createUpload>[0]>)
 const sign=createSigner(deps as unknown as NonNullable<Parameters<typeof createSigner>[0]>)
 const request=(data:unknown,uid='mandor',opts:{origin?:string;token?:string;method?:string}={})=>new Request('https://example.test/function',{method:opts.method||'POST',headers:{Origin:opts.origin??origin,Authorization:'Bearer '+(opts.token??tokens[uid]),'Content-Type':'application/json'},...(opts.method==='OPTIONS'||opts.method==='GET'?{}:{body:JSON.stringify(data)})})
 const input={recordId,formType:'spray',baseRevision:null,clientRevision:revision,kind:'main',contentType:'image/png',base64:png}
 async function confirmed(){
  const response=await upload(request(input));assert.equal(response.status,200)
  const uploaded=await response.json()
  const prepared=await prepareOperationalPhotoManifest({recordId,uploaderUid:'mandor',changes:[{kind:'main',action:'replace',dataUrl:'data:image/png;base64,'+png}]})
  const ref=prepared.manifest.main
  for(const k of ['photoId','objectPath','bucket','sha256','size'])assert.deepEqual(uploaded[k],ref[k])
  docs.set('qc_records/'+recordId,{...intent,firestoreSaveState:'confirmed',operationalPhotoManifest:prepared.manifest})
  return {recordId,photoId:ref.photoId}
 }
 return {docs,objects,stats,upload,sign,request,input,confirmed,disable:()=>{enabled=false}}
}
Deno.test('default write/sign gate stops all backend calls',async()=>{
 const f=fixture();f.disable()
 assert.equal((await f.upload(f.request(f.input))).status,503)
 assert.equal((await f.sign(f.request({recordId,photoId:'fake'}))).status,503)
 assert.deepEqual(f.stats,{uploads:0,downloads:0,signs:0,google:0,verifies:0})
})
Deno.test('CORS denied for other origin; allowed OPTIONS works',async()=>{
 const f=fixture()
 for(const h of [f.upload,f.sign]){
  assert.equal((await h(f.request({},'mandor',{origin:'https://wrong.test'}))).status,403)
  assert.equal((await h(f.request({},'mandor',{method:'OPTIONS'}))).headers.get('Access-Control-Allow-Origin'),origin)
 }
 assert.equal(f.stats.google,0)
})
Deno.test('real signature, audience and expiration verification reject invalid JWTs',async()=>{
 const f=fixture()
 for(const jwt of ['invalid',await token('mandor','wrong-project'),await token('mandor',project,now-60)]){
  assert.equal((await f.upload(f.request(f.input,'mandor',{token:jwt}))).status,401)
  assert.equal((await f.sign(f.request({recordId,photoId:'fake'},'mandor',{token:jwt}))).status,401)
 }
 assert.equal(f.stats.google,0)
})
Deno.test('revoked token denied',async()=>{
 const f=fixture();assert.equal((await f.upload(f.request(f.input,'revoked'))).status,401)
 assert.equal((await f.sign(f.request({recordId,photoId:'fake'},'revoked'))).status,401)
 assert.equal(f.stats.uploads,0);assert.equal(f.stats.signs,0)
})
Deno.test('pending and inactive profiles denied on both endpoints',async()=>{
 const f=fixture()
 for(const uid of ['pending','inactive']){
  assert.equal((await f.upload(f.request(f.input,uid))).status,403)
  assert.equal((await f.sign(f.request({recordId,photoId:'fake'},uid))).status,403)
 }
 assert.equal(f.stats.uploads,0);assert.equal(f.stats.signs,0)
})
Deno.test('non-operational IDs cannot reach production storage',async()=>{
 const f=fixture()
 for(const id of ['qc-photo-staging-1','qc-operational-pilot-1','legacy-1']){
  assert.equal((await f.upload(f.request({...f.input,recordId:id}))).status,403)
  assert.equal((await f.sign(f.request({recordId:id,photoId:'fake'}))).status,403)
 }
 assert.equal(f.stats.uploads,0);assert.equal(f.stats.signs,0)
})
Deno.test('missing reservation and wrong revision block upload',async()=>{
 const f=fixture();assert.equal((await f.upload(f.request({...f.input,clientRevision:'bad'}))).status,409)
 f.docs.delete('qc_photo_upload_intents/'+recordId)
 assert.equal((await f.upload(f.request(f.input))).status,409);assert.equal(f.stats.uploads,0)
})
Deno.test('archived records cannot upload through leftover reservation',async()=>{
 const f=fixture();f.docs.set('qc_archive_markers/'+recordId,{recordId})
 assert.equal((await f.upload(f.request(f.input))).status,409);assert.equal(f.stats.uploads,0)
})
Deno.test('upload requires own record and edit permission',async()=>{
 const f=fixture()
 assert.equal((await f.upload(f.request(f.input,'other'))).status,403)
 f.docs.set('qc_photo_upload_intents/'+recordId,{ownerUid:'viewer',clientRevision:revision,formType:'spray'})
 assert.equal((await f.upload(f.request(f.input,'viewer'))).status,403)
 assert.equal(f.stats.uploads,0)
})
Deno.test('wrong form, invalid image and hold ID denied',async()=>{
 const f=fixture()
 assert.equal((await f.upload(f.request({...f.input,formType:'fertilizer'}))).status,409)
 assert.equal((await f.upload(f.request({...f.input,base64:'AQID'}))).status,400)
 assert.equal((await f.upload(f.request({...f.input,kind:'hold',holdId:'../bad'}))).status,400)
 assert.equal(f.stats.uploads,0)
})
Deno.test('upload result matches actual client manifest and immutable retry',async()=>{
 const f=fixture();const target=await f.confirmed()
 const qc=f.docs.get('qc_records/'+recordId)!
 f.docs.delete('qc_records/'+recordId)
 const retry=await f.upload(f.request(f.input));assert.equal(retry.status,200)
 assert.equal((await retry.json()).photoId,target.photoId);assert.equal(f.objects.size,1)
 f.docs.set('qc_records/'+recordId,qc)
})
Deno.test('changed bytes at existing path cannot pass download verification',async()=>{
 const f=fixture();await f.confirmed()
 f.docs.delete('qc_records/'+recordId)
 const path=[...f.objects.keys()][0];f.objects.set(path,new Blob(['wrong']))
 assert.equal((await f.upload(f.request(f.input))).status,409)
})
Deno.test('signed URL for confirmed record is available to owner and authorized viewer',async()=>{
 const f=fixture();const data=await f.confirmed()
 for(const uid of ['mandor','owner','viewer']){
  const result=await f.sign(f.request(data,uid));assert.equal(result.status,200)
  assert.deepEqual(await result.json(),{signedUrl:'https://example.test/synthetic',expiresIn:60})
 }
 assert.equal(f.stats.signs,3)
})
Deno.test('cross-user no-permission and unconfirmed record cannot sign',async()=>{
 const f=fixture();const data=await f.confirmed()
 assert.equal((await f.sign(f.request(data,'none'))).status,403)
 f.docs.get('qc_records/'+recordId)!.firestoreSaveState='pending'
 assert.equal((await f.sign(f.request(data,'owner'))).status,403)
 assert.equal(f.stats.signs,0)
})
Deno.test('client supplied path and forged stored reference denied',async()=>{
 const f=fixture();const data=await f.confirmed()
 assert.equal((await f.sign(f.request({...data,objectPath:'other/path'},'owner'))).status,400)
 f.docs.get('qc_records/'+recordId)!.operationalPhotoManifest.main.objectPath='other/path'
 assert.equal((await f.sign(f.request(data,'owner'))).status,403);assert.equal(f.stats.signs,0)
})
Deno.test('missing reservation or photo ID cannot sign',async()=>{
 const f=fixture();const data=await f.confirmed()
 assert.equal((await f.sign(f.request({...data,photoId:'wrong'},'owner'))).status,403)
 f.docs.delete('qc_photo_upload_intents/'+recordId)
 assert.equal((await f.sign(f.request(data,'owner'))).status,403);assert.equal(f.stats.signs,0)
})
Deno.test('signer bounds request body and rejects non-POST',async()=>{
 const f=fixture()
 assert.equal((await f.sign(f.request({recordId,photoId:'x'.repeat(1500)}))).status,413)
 assert.equal((await f.sign(f.request({},'owner',{method:'GET'}))).status,405)
 assert.equal(f.stats.signs,0)
})
