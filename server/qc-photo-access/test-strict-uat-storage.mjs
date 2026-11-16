// Actual Supabase Storage smoke test. ONLY the separate hosted UAT project.
// No Firebase, portal, Edge Functions, RLS changes or production project access.
// Run explicitly with --uat-write; creates and removes only this run's synthetic objects.
import assert from 'node:assert/strict'
import {createHash,randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
const origin='https://tcmtqgbpafwciaflgsaa.supabase.co',bucket='qc-photos-uat'
const prefix='uat-strict-storage-smoke/'
const webp=Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQsmZUpv+BiOh/AAA=','base64')
const digest=b=>createHash('sha256').update(b).digest('hex')
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=','base64')
function scopedPath(runId,name){
 assert.match(runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
 assert.ok(['fixture.png','fixture.webp','bad-mime.txt','too-large.png'].includes(name))
 return prefix+runId+'/'+name
}
function runFolder(runId){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(runId))throw Error('INVALID_RUN_ID')
 return 'uat-strict-storage-smoke/'+runId
}

function safeStatus(error){
 const value=Number(error?.statusCode??error?.status)
 return Number.isInteger(value)&&value>=100&&value<=599?String(value):'unknown'
}

async function scopedListing(storage,runId){
 const r=await storage.list(runFolder(runId),{limit:100,offset:0})
 if(r.error)throw Error('CLEANUP_LIST_FAILED status='+safeStatus(r.error))
 if(!Array.isArray(r.data))throw Error('CLEANUP_LIST_INVALID')
 return r.data
}

async function cleanupRun(storage,runId,owned){
 const folder=runFolder(runId),paths=[...owned]
 if(paths.length===0||paths.some(p=>typeof p!=='string'||!['fixture.png','fixture.webp','bad-mime.txt','too-large.png'].some(name=>p===folder+'/'+name)))throw Error('CLEANUP_SCOPE_INVALID')
 const result=await storage.remove(paths)
 if(result.error)throw Error('CLEANUP_REMOVE_FAILED status='+safeStatus(result.error))
 if(!Array.isArray(result.data))throw Error('CLEANUP_REMOVE_INVALID')
 const remaining=await scopedListing(storage,runId)
 if(remaining.length!==0)throw Error('CLEANUP_OBJECTS_REMAIN count='+remaining.length)
}

async function cleanupSelfTests(){
 const run='00000000-0000-4000-8000-000000000000',path=runFolder(run)+'/fixture.png'
 let n=0
 const check=(ok)=>{if(!ok)throw Error('CLEANUP_SELF_TEST_FAILED');n++}
 const reject=async(fn,code)=>{let msg;try{await fn()}catch(e){msg=e.message}check(msg?.startsWith(code))}
 const ok={remove:async p=>{if(p.length!==1||p[0]!==path)throw Error('WRONG_REMOVE');return {data:[{name:'fixture.png'}],error:null}},list:async(folder,options)=>{if(folder!==runFolder(run)||options.limit!==100||options.offset!==0)throw Error('WRONG_LIST');return {data:[],error:null}}}
 await cleanupRun(ok,run,new Set([path]));check(true)
 await reject(()=>cleanupRun(ok,run,new Set(['other/fixture.png'])),'CLEANUP_SCOPE_INVALID')
 await reject(()=>cleanupRun(ok,run,new Set()),'CLEANUP_SCOPE_INVALID')
 await reject(()=>cleanupRun({...ok,remove:async()=>({data:null,error:{statusCode:'403'}})},run,new Set([path])),'CLEANUP_REMOVE_FAILED status=403')
 await reject(()=>cleanupRun({...ok,remove:async()=>({data:null,error:null})},run,new Set([path])),'CLEANUP_REMOVE_INVALID')
 await reject(()=>cleanupRun({...ok,list:async()=>({data:null,error:{status:503}})},run,new Set([path])),'CLEANUP_LIST_FAILED status=503')
 await reject(()=>cleanupRun({...ok,list:async()=>({data:null,error:null})},run,new Set([path])),'CLEANUP_LIST_INVALID')
 await reject(()=>cleanupRun({...ok,list:async()=>({data:[{name:'fixture.png'}],error:null})},run,new Set([path])),'CLEANUP_OBJECTS_REMAIN')
 await reject(()=>cleanupRun({...ok,list:async()=>({data:[{name:'unexpected'}],error:null})},run,new Set([path])),'CLEANUP_OBJECTS_REMAIN')
 await reject(()=>cleanupRun(ok,'../other',new Set([path])),'INVALID_RUN_ID')
 return n
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
console.log('SUCCESS: '+await cleanupSelfTests()+' scoped cleanup regression checks passed (offline)')
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
  await check('actual UAT bucket is private, capped at 2 MiB, permits JPEG PNG WebP',async()=>{const b=positive(await client.storage.getBucket(bucket),'BUCKET_LOOKUP_FAILED');assert.equal(b.id,bucket);assert.equal(b.public,false);assert.equal(Number(b.file_size_limit),2097152);assert.deepEqual([...b.allowed_mime_types].sort(),['image/jpeg','image/png','image/webp'])})
  await check('upload synthetic PNG without upsert',async()=>{positive(await upload(path,png,'image/png'),'UPLOAD_FAILED')})
  await check('actual WebP upload download and scoped listing',async()=>{const p=scopedPath(runId,'fixture.webp');positive(await upload(p,webp,'image/webp'),'WEBP_UPLOAD_FAILED');const b=positive(await storage.download(p),'WEBP_DOWNLOAD_FAILED');assert.equal(digest(Buffer.from(await b.arrayBuffer())),digest(webp));const files=await scopedListing(storage,runId);assert.deepEqual(files.map(f=>f.name).sort(),['fixture.png','fixture.webp'])})
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
  // Remove only acknowledged paths in this unique run. Verify successful
  // authenticated listing of the exact run folder, not an arbitrary GET error.
  if(owned.size){
   try{
    await cleanupRun(storage,runId,owned)
    console.log('PASS: cleanup of acknowledged synthetic objects only; run folder empty')
   }catch(e){
    failed=true
    const message=typeof e?.message==='string'&&/^(CLEANUP_(?:SCOPE_INVALID|REMOVE_INVALID|LIST_INVALID|(?:REMOVE|LIST)_FAILED status=(?:[1-5][0-9]{2}|unknown)|OBJECTS_REMAIN count=[0-9]+))$/.test(e.message)?e.message:'CLEANUP_UNEXPECTED_ERROR'
    console.error('FAIL: '+message+'; inspect run ID '+runId+' under '+prefix)
   }
  }
 }
 if(failed){console.error('Synthetic run ID for orphan review: '+runId);process.exitCode=1}
 else console.log('SUCCESS: '+count+' real Supabase UAT storage checks passed; synthetic cleanup verified')
}
