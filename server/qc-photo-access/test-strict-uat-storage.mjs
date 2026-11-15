// Actual Supabase Storage smoke test. ONLY the separate hosted UAT project.
// No Firebase, portal, Edge Functions, RLS changes or production project access.
// Run explicitly with --uat-write; creates and removes only this run's synthetic objects.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
const origin='https://tcmtqgbpafwciaflgsaa.supabase.co',bucket='qc-photos-uat'
const prefix='uat-strict-storage-smoke/'
const digest=b=>createHash('sha256').update(b).digest('hex')
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=','base64')
function scopedPath(runId,name){
 assert.match(runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
 assert.ok(['fixture.png','bad-mime.txt','too-large.png'].includes(name))
 return prefix+runId+'/'+name
}
function allowedURL(input){
 const u=new URL(typeof input==='string'||input instanceof URL?input:input.url)
 assert.equal(u.origin,origin,'UAT_ORIGIN_REQUIRED')
 assert.ok(!u.username&&!u.password&&u.pathname.startsWith('/storage/v1/'),'UAT_STORAGE_ONLY')
 return u
}
function signedURL(input,path){
 const u=allowedURL(input)
 assert.equal(u.pathname,'/storage/v1/object/sign/'+bucket+'/'+path,'SIGNED_PATH_MISMATCH')
 assert.ok(u.searchParams.get('token'),'SIGNED_TOKEN_MISSING')
 return u
}
function guard(e){
 assert.equal(e.QC_UAT_STORAGE_ORIGIN,origin,'UAT_ORIGIN_REQUIRED')
 assert.equal(e.QC_UAT_STORAGE_WRITE,'synthetic-only','EXPLICIT_UAT_WRITE_REQUIRED')
 assert.ok(typeof e.QC_UAT_STORAGE_SECRET==='string'&&/^sb_secret_[A-Za-z0-9_-]+$/.test(e.QC_UAT_STORAGE_SECRET),'UAT_SECRET_REQUIRED')
}
const valid={QC_UAT_STORAGE_ORIGIN:origin,QC_UAT_STORAGE_WRITE:'synthetic-only',QC_UAT_STORAGE_SECRET:'sb_secret_fake_test_only'}
assert.ok(process.argv.length===3&&['--self-test','--uat-write'].includes(process.argv[2]),'USE_EXPLICIT_MODE')
guard(valid)
for(const e of [{},{...valid,QC_UAT_STORAGE_ORIGIN:'https://mcfwnstdfhhtcbksgrlj.supabase.co'},{...valid,QC_UAT_STORAGE_ORIGIN:'https://example.com'},{...valid,QC_UAT_STORAGE_WRITE:''},{...valid,QC_UAT_STORAGE_SECRET:'sb_publishable_fake'}])assert.throws(()=>guard(e))
const testPath=scopedPath('00000000-0000-4000-8000-000000000000','fixture.png')
assert.throws(()=>scopedPath('../other','fixture.png'))
assert.throws(()=>scopedPath('00000000-0000-4000-8000-000000000000','../other.png'))
assert.throws(()=>allowedURL('https://example.com/storage/v1/bucket'))
assert.throws(()=>allowedURL(origin+'/rest/v1/users'))
assert.throws(()=>signedURL(origin+'/storage/v1/object/sign/'+bucket+'/other?token=foo',testPath))
assert.equal(signedURL(origin+'/storage/v1/object/sign/'+bucket+'/'+testPath+'?token=foo',testPath).origin,origin)
assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a')
console.log('SUCCESS: actual UAT storage origin, scope and signed URL guards passed (offline)')
if(process.argv[2]==='--uat-write'){
 guard(process.env)
 const {createClient}=await import('@supabase/supabase-js')
 // Reject every request outside this exact Storage API origin, including redirects.
 const safeFetch=(input,init={})=>{allowedURL(input);return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(30000)})}
 const client=createClient(origin,process.env.QC_UAT_STORAGE_SECRET,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},global:{fetch:safeFetch}})
 const storage=client.storage.from(bucket)
 const runId=randomUUID(),path=scopedPath(runId,'fixture.png')
 const owned=new Set()
 let count=0,stage='preflight',failed=false
 const check=async(name,fn)=>{stage=name;await fn();count++;console.log('PASS: '+name)}
 const positive=(r,label)=>{assert.ok(!r.error&&r.data,label);return r.data}
 const rejected=r=>{assert.ok(r.error,'EXPECTED_STORAGE_DENIAL');const status=Number(r.error.statusCode??r.error.status);assert.ok(status>=400&&status<500,'EXPECTED_4XX_STORAGE_DENIAL')}
 const denyHttp=async response=>{assert.ok([400,401,403,404].includes(response.status),'EXPECTED_HTTP_DENIAL');await response.body?.cancel()}
 const sign=async ttl=>signedURL(positive(await storage.createSignedUrl(path,ttl),'SIGN_FAILED').signedUrl,path)
 const upload=async(p,bytes,type)=>{const r=await storage.upload(p,bytes,{contentType:type,cacheControl:'0',upsert:false});if(!r.error)owned.add(p);return r}
 const signedGet=u=>safeFetch(u,{method:'GET',cache:'no-store',headers:{'Cache-Control':'no-cache'}})
 try{
  await check('actual UAT bucket is private, capped at 2 MiB, permits PNG',async()=>{const b=positive(await client.storage.getBucket(bucket),'BUCKET_LOOKUP_FAILED');assert.equal(b.id,bucket);assert.equal(b.public,false);assert.equal(Number(b.file_size_limit),2097152);assert.ok(b.allowed_mime_types.includes('image/png'));if(!b.allowed_mime_types.includes('image/webp'))console.log('OBSERVED: WebP not allowed by UAT bucket; compatibility gate remains open')})
  await check('upload synthetic PNG without upsert',async()=>{positive(await upload(path,png,'image/png'),'UPLOAD_FAILED')})
  await check('same immutable path cannot be overwritten without upsert',async()=>{const modified=Buffer.concat([png,Buffer.from([1])]);rejected(await storage.upload(path,modified,{contentType:'image/png',cacheControl:'0',upsert:false}))})
  await check('authenticated backend download preserves exact SHA256',async()=>{const b=positive(await storage.download(path),'DOWNLOAD_FAILED');assert.equal(digest(Buffer.from(await b.arrayBuffer())),digest(png))})
  await check('private object cannot be fetched from public URL anonymously',async()=>{await denyHttp(await signedGet(origin+'/storage/v1/object/public/'+bucket+'/'+path))})
  await check('anonymous authenticated-object endpoint denied',async()=>{await denyHttp(await signedGet(origin+'/storage/v1/object/authenticated/'+bucket+'/'+path))})
  await check('valid 60-second signed URL downloads identical PNG',async()=>{const response=await signedGet(await sign(60));assert.ok(response.ok,'SIGNED_DOWNLOAD_FAILED');assert.equal(response.headers.get('content-type')?.split(';')[0],'image/png');assert.equal(digest(Buffer.from(await response.arrayBuffer())),digest(png))})
  await check('tampered signed URL token denied',async()=>{const u=await sign(45),token=u.searchParams.get('token'),parts=token.split('.');assert.equal(parts.length,3);parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);u.searchParams.set('token',parts.join('.'));await denyHttp(await signedGet(u))})
  await check('unused short-lived signed URL denied after expiration',async()=>{const u=await sign(3);await delay(8000);await denyHttp(await signedGet(u))})
  await check('disallowed MIME rejected by bucket',async()=>{rejected(await upload(scopedPath(runId,'bad-mime.txt'),Buffer.from('synthetic only'),'text/plain'))})
  await check('object larger than 2 MiB rejected by bucket',async()=>{rejected(await upload(scopedPath(runId,'too-large.png'),Buffer.alloc(2097153),'image/png'))})
 }catch{
  failed=true
  console.error('FAIL: '+stage+' (details suppressed to protect credentials and signed URLs)')
 }finally{
  // Never list or delete pre-existing data; remove only paths acknowledged as
  // created by this unique run, including unexpected successful negative tests.
  if(owned.size){
   try{
    const result=await storage.remove([...owned])
    if(result.error)throw Error('CLEANUP_FAILED')
    for(const p of owned){const r=await storage.download(p);rejected(r)}
    console.log('PASS: cleanup of acknowledged synthetic objects only')
   }catch{failed=true;console.error('FAIL: synthetic cleanup could not be verified; inspect run ID '+runId+' under '+prefix)}
  }
 }
 if(failed){console.error('Synthetic run ID for orphan review: '+runId);process.exitCode=1}
 else console.log('SUCCESS: '+count+' real Supabase UAT storage checks passed; synthetic cleanup verified')
}
