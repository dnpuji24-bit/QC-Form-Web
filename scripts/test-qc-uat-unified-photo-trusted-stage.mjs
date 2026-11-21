// Valid PNG with CRC-verified IHDR/IDAT/IEND chunks; the previous tiny fixture
// had a corrupt IDAT CRC. Chromium correctly refuses to decode the old fixture.
import assert from 'node:assert/strict'
import {buildUnifiedFullQc} from '../src/qcUatUnifiedFullQcFormBuilder.mjs'
import {createMemoryPhotoObjectStore,createTrustedPhotoStage,mockBucket} from '../server/qc-photo-access/uat-unified-photo-trusted-stage.mjs'
const source={testOnly:true,kind:'spray',areaSemantics:'SCALAR_APPLICATION',dailyPlanId:'uat-ds',monthlyPlanLineId:'uat-ms',pid:'uat-p1',sourceType:'MONTHLY',date:'2026-11-03',sourceShift:'1',sourceForemanId:'uat-f1',sourceForemanName:'Mandor A',executionShift:'1',executionForemanId:'uat-f1',executionForemanName:'Mandor A',dailyRevision:0,planningOrder:1,companyCode:'uat-company',farm:'Farm A',activity:'Spray',description:'Post Emergence',stage:'Ratoon',masterVariety:'V1',selectedVarieties:['V1'],area100:1000,materials:[{materialId:'uat-herb',material:'Synthetic Herbicide',unit:'L',doseUnit:'L',dose10000:12345,totalMaterial1000000:12345000}]}
const defaults=()=>({unit:'Boom',noUnit:'BS001',assistant:'Asisten',startTime:'08:00',endTime:'17:00',notes:'Mock only',holds:[{start:'12:00',end:'13:00',reason:'Hold',note:''}],areaHa:'9.00',dropper:'No',nozzle:'TeeJet',waterQuality:'Normal',weatherCondition:'Clear',windSpeed:'2',waterRate:'350',adjuvantDosage:'0.5',adjuvant:'Synthetic',actUsageAdjuvant:'1.5',measuredUsage:['11.3','','',''],fillings:[]})
const actor={uid:'uat-field',nonce:'photostage',saveType:'ready',createdAt:'2026-11-03T08:00:00Z'}
const q=buildUnifiedFullQc(source,defaults(),actor)
const sourceRequest={dailyPlanId:'uat-ds',expectedDailyRevision:0,formType:'spray',date:'2026-11-03',shift:'1',foreman:'uat-f1'}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGM0atryn4GBgYGJAQoAJCYCa4s7a6wAAAAASUVORK5CYII='
const change={action:'replace',kind:'main',dataUrl:png}
const mk=(delta={})=>({sourceRequest,request:q,photos:[change],...delta})
const create=(over={})=>{
 const store=over.store??createMemoryPhotoObjectStore()
 let enabled=true
 const stage=createTrustedPhotoStage({store,
  authenticatedUid:over.authenticatedUid??(async raw=>raw==='valid'?'uat-field':'uat-wrong'),
  readSource:over.readSource??(async raw=>{if(raw!=='valid'||!enabled)throw Error('QC_PERMISSION_DENIED');return structuredClone(source)})
 })
 return {stage,store,revoke:()=>{enabled=false}}
}
let n=0
const check=async(name,fn)=>{await fn();console.log('PASS: '+name);n++}
await check('full verified source, bytes and immutable mock receipt; no QC/Actual writes',async()=>{
 const {stage,store}=create()
 const x=await stage.stage('valid',mk())
 assert.equal(x.status,'verified-staged-only');assert.equal(x.storageMode,'in-memory-mock')
 assert.equal(x.ownerUid,'uat-field');assert.equal(x.recordId,q.record.id)
 assert.equal(x.bucket,mockBucket);assert.equal(Object.keys(x.manifest).length,1)
 assert.match(x.manifestSha256,/^[0-9a-f]{64}$/)
 assert.equal(store.stats.puts,1);assert.equal(store.stats.reads,1)
})
await check('exact replay deduplicates immutable object and deterministic proof',async()=>{
 const {stage,store}=create()
 const x=await stage.stage('valid',mk()),y=await stage.stage('valid',mk())
 assert.deepEqual(x,y);assert.equal(store.stats.puts,1);assert.equal(store.stats.reuses,1)
})
await check('HOLD slot bound to actual full form holdId',async()=>{
 const {stage}=create()
 const x=await stage.stage('valid',mk({photos:[{...change,kind:'hold',holdId:'uat-h1'}]}))
 assert.ok(x.manifest['hold_uat-h1'])
})
await check('invalid HOLD never uploads any object',async()=>{
 const {stage,store}=create()
 await assert.rejects(()=>stage.stage('valid',mk({photos:[{...change,kind:'hold',holdId:'uat-h9'}]})),{message:'PHOTO_HOLD_NOT_IN_FORM'})
 assert.equal(store.stats.puts,0)
})
await check('forged UID and other account token rejected before storage',async()=>{
 const {stage,store}=create()
 await assert.rejects(()=>stage.stage('foreign',mk()),{message:'PHOTO_OWNER_DENIED'})
 await assert.rejects(()=>stage.stage('valid',mk({request:{...q,uploaderUid:'uat-other'}})),{message:'PHOTO_OWNER_DENIED'})
 assert.equal(store.stats.puts,0)
})
await check('source tamper, revision and executor mismatch denied without upload',async()=>{
 const {stage,store}=create()
 await assert.rejects(()=>stage.stage('valid',mk({request:{...q,foremanId:'uat-f2'}})))
 await assert.rejects(()=>stage.stage('valid',mk({request:{...q,expectedDailyRevision:1}})))
 await assert.rejects(()=>stage.stage('valid',mk({request:{...q,record:{...q.record,paddock:'uat-other'}}})))
 assert.equal(store.stats.puts,0)
})
await check('photo-free record exact field set and unexpected upload fields denied',async()=>{
 const {stage,store}=create()
 await assert.rejects(()=>stage.stage('valid',{...mk(),extra:'bad'}),{message:'PHOTO_STAGE_FIELDS'})
 await assert.rejects(()=>stage.stage('valid',mk({photos:[{...change,objectPath:'prod/path'}]})),{message:'PHOTO_CHANGE_FIELDS'})
 assert.equal(store.stats.puts,0)
})
await check('MIME spoofing, noncanonical base64 and disallowed SVG rejected',async()=>{
 const {stage,store}=create()
 for(const bad of ['data:image/jpeg;base64,'+png.split(',')[1],png.replace('image/png','image/svg+xml'),png+'A']){
  await assert.rejects(()=>stage.stage('valid',mk({photos:[{...change,dataUrl:bad}]})))
 }
 assert.equal(store.stats.puts,0)
})
await check('staged bytes never accepted after corrupted storage readback',async()=>{
 const store=createMemoryPhotoObjectStore()
 const altered={bucket:store.bucket,putImmutable:async(ref,bytes)=>{await store.putImmutable(ref,bytes);store.tamperForTest(ref,Buffer.from('wrong'))},read:ref=>store.read(ref)}
 const {stage}=create({store:altered})
 await assert.rejects(()=>stage.stage('valid',mk()),{message:'PHOTO_READBACK_MISMATCH'})
})
await check('session revoke after upload fails closed but leaves an explicit orphan',async()=>{
 let calls=0
 const {stage,store}=create({authenticatedUid:async()=>++calls===1?'uat-field':'uat-other'})
 await assert.rejects(()=>stage.stage('valid',mk()),{message:'PHOTO_SESSION_REVOKED'})
 assert.equal(store.stats.puts,1)
})
await check('source change after upload requires new preflight',async()=>{
 let calls=0
 const {stage,store}=create({readSource:async()=>{calls++;return {...source,dailyRevision:calls===1?0:1}}})
 await assert.rejects(()=>stage.stage('valid',mk()),{message:'PHOTO_SOURCE_CHANGED'})
 assert.equal(store.stats.puts,1)
})
await check('no photo, duplicate slot and excessive photo count all rejected',async()=>{
 const {stage,store}=create()
 for(const photos of [[],[change,change],[change,change,change,change,change]]){
  await assert.rejects(()=>stage.stage('valid',mk({photos})))
 }
 assert.equal(store.stats.puts,0)
})
await check('inactive/disallowed scan in Spray must not stage',async()=>{
 const {stage,store}=create()
 await assert.rejects(()=>stage.stage('valid',mk({photos:[{...change,kind:'scan'}]})),{message:'PHOTO_SLOT_DENIED'})
 assert.equal(store.stats.puts,0)
})
await check('cancelled roles cannot stage and old token is not accepted',async()=>{
 const {stage,store}=create()
 await assert.rejects(()=>stage.stage('old-token',mk()),{message:'PHOTO_OWNER_DENIED'})
 assert.equal(store.stats.puts,0)
})
await check('status is STAGED ONLY: receipt is not a QC commit result',async()=>{
 const {stage}=create()
 const x=await stage.stage('valid',mk())
 assert.equal(x.status,'verified-staged-only')
 assert.equal(Object.hasOwn(x,'qc'),false)
 assert.equal(Object.hasOwn(x,'actual'),false)
 assert.equal(Object.hasOwn(x,'signedUrl'),false)
})
console.log('SUCCESS: '+n+' trusted photo byte readback, identity and source preflight checks passed (MOCK storage, no QC commit)')
