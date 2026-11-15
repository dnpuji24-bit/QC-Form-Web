import assert from 'node:assert/strict'
import {need,canonicalJson,jobPayload,assertSameQueuedPayload,assertConfirmation,prepareStrictJob,enqueueStrictSyntheticJob,processStrictSyntheticJob} from '../src/qcUatStrictQueueContract.mjs'

function fixture(){return {testOnly:true,scope:'uat-strict',uploaderUid:'uat-spray',baseRevision:null,action:'finalizeRecord',record:{testOnly:true,id:'uat-q1',ownerUid:'uat-spray',clientRevision:'uat-r1',saveType:'ready',area:250},changes:[{kind:'main',action:'replace',dataUrl:'data:image/png;base64,AQID'}]}}

function pureTests(){
 let n=0
 const test=(name,fn)=>{try{fn();n++}catch(e){throw Error(name+': '+e.message)}}
 const reject=(name,fn,code)=>test(name,()=>{let err;try{fn()}catch(e){err=e.message}need(err===code,'EXPECTED '+code+' GOT '+err)})
 test('stable object ordering',()=>{const f=fixture(),r={...f,record:Object.fromEntries(Object.entries(f.record).reverse())};need(assertSameQueuedPayload(f,r),'ORDER')})
 test('ignore persistence metadata',()=>{const f=fixture();need(assertSameQueuedPayload(f,{...f,id:jobPayload(f).id,createdAt:42}),'METADATA')})
 for(const [name,edit] of [['area',f=>f.record.area=251],['photo',f=>f.changes[0].dataUrl='data:image/png;base64,BAUG'],['action',f=>f.action='syncRecord'],['base',f=>f.baseRevision='uat-old'],['remove',f=>f.changes=[]],['order',f=>{f.changes.push({kind:'scan',action:'remove'});f.changes.reverse()}]])reject('different '+name,()=>{const a=fixture(),b=fixture();if(name==='order')a.changes.push({kind:'scan',action:'remove'});edit(b);assertSameQueuedPayload(a,b)},'QC_QUEUE_PAYLOAD_CONFLICT')
 reject('wrong owner',()=>{const f=fixture();f.record.ownerUid='uat-other';jobPayload(f)},'QC_OWNER_MISMATCH')
 reject('wrong id',()=>jobPayload({...fixture(),id:'bad'}),'QUEUE_ID_MISMATCH')
 reject('real ID',()=>{const f=fixture();f.record.id='QC-123';jobPayload(f)},'SYNTHETIC_ID_REQUIRED')
 reject('undefined',()=>canonicalJson({a:undefined}),'NON_JSON_PAYLOAD')
 reject('nonfinite',()=>canonicalJson({a:Infinity}),'NON_JSON_NUMBER')
 reject('sparse',()=>canonicalJson(new Array(2)),'NON_JSON_ARRAY')
 reject('cycle',()=>{const x={};x.x=x;canonicalJson(x)},'NON_JSON_PAYLOAD')
 reject('accessor',()=>canonicalJson({get x(){throw Error('MUST_NOT_CALL')}}),'NON_JSON_FIELD')
 reject('prototype pollution',()=>canonicalJson(JSON.parse('{"__proto__":{}}')),'NON_JSON_FIELD')
 reject('reserved field',()=>{const f=fixture();f.record.operationalPayloadFingerprint='fake';jobPayload(f)},'RESERVED_FINGERPRINT_FIELD')
 const j={...fixture(),id:jobPayload(fixture()).id},fp='sha256-v1:'+'a'.repeat(64),c={...j.record,saveType:'uploaded',operationalSaveId:j.id,firestoreSaveState:'confirmed',operationalPayloadFingerprint:fp}
 test('matching confirmation',()=>need(assertConfirmation(c,j,fp)===c,'CONFIRM'))
 reject('legacy confirmation missing fingerprint',()=>assertConfirmation({...c,operationalPayloadFingerprint:undefined},j,fp),'QC_REPLAY_FINGERPRINT_MISSING')
 reject('divergent fingerprint',()=>assertConfirmation({...c,operationalPayloadFingerprint:'sha256-v1:'+'b'.repeat(64)},j,fp),'QC_REPLAY_PAYLOAD_CONFLICT')
 reject('wrong owner confirmation',()=>assertConfirmation({...c,ownerUid:'uat-other'},j,fp),'QC_COMMIT_UNCONFIRMED')
 reject('wrong status confirmation',()=>assertConfirmation({...c,saveType:'draft'},j,fp),'QC_REPLAY_STATUS_CONFLICT')
 return n
}

const pure=pureTests()
console.log('SUCCESS: '+pure+' strict queue payload checks (offline)')
let n=0
const check=async(name,fn)=>{try{await fn()}catch(e){throw Error('FAIL: '+name,{cause:e})}n++;console.log('PASS: '+name)}
const h=()=>{
 const rows=new Map(),objects=new Map()
 const state={uid:'uat-spray',current:null,uploads:0,commits:0,loseAck:false,returnOld:false,stripFingerprint:false}
 const enqueue=async j=>{if(!rows.has(j.id))rows.set(j.id,structuredClone(j));return structuredClone(rows.get(j.id))}
 const deps={photoBucket:'qc-photos-uat-mock',currentUid:async()=>state.uid,readRecord:async()=>state.current,
  putVerifiedPhoto:async(ref,bytes)=>{state.uploads++;objects.set(ref.objectPath,Array.from(bytes))},
  commitRecord:async({record,baseRevision})=>{
   state.commits++
   if(state.returnOld)return state.current
   assert.equal(state.current?.clientRevision??null,baseRevision)
   state.current=structuredClone(record)
   if(state.stripFingerprint)delete state.current.operationalPayloadFingerprint
   if(state.loseAck){state.loseAck=false;throw Error('ACK_LOST')}
   return state.current
  }}
 return {rows,objects,state,enqueue,deps}
}
await check('SHA256 stable for reordered fields and different for changed photo',async()=>{const a=fixture(),b={...a,record:Object.fromEntries(Object.entries(a.record).reverse())},p=await prepareStrictJob(a);assert.match(p.payloadFingerprint,/^sha256-v1:[0-9a-f]{64}$/);assert.equal((await prepareStrictJob(b)).payloadFingerprint,p.payloadFingerprint);b.changes=[{...a.changes[0],dataUrl:'data:image/png;base64,BAUG'}];assert.notEqual((await prepareStrictJob(b)).payloadFingerprint,p.payloadFingerprint)})
await check('persisted fingerprint mismatch rejected',async()=>{const j=await prepareStrictJob(fixture());j.record.area++;await assert.rejects(prepareStrictJob(j),/QC_QUEUE_FINGERPRINT_MISMATCH/)})
await check('same payload retry returns first queued row',async()=>{const x=h(),j=fixture();const first=await enqueueStrictSyntheticJob(j,x.enqueue);assert.deepEqual(await enqueueStrictSyntheticJob(j,x.enqueue),first);assert.equal(x.rows.size,1)})
await check('divergent queue payload rejected and original retained',async()=>{const x=h(),j=fixture();const first=await enqueueStrictSyntheticJob(j,x.enqueue);const b=fixture();b.record.area++;await assert.rejects(enqueueStrictSyntheticJob(b,x.enqueue),/QC_QUEUE_PAYLOAD_CONFLICT/);assert.deepEqual(x.rows.get(first.id),first)})
await check('legacy pending identical bytes can be recognized without rewriting',async()=>{const x=h(),j=fixture(),id=jobPayload(j).id;x.rows.set(id,{...j,id,createdAt:1});const result=await enqueueStrictSyntheticJob(j,x.enqueue);assert.equal(result.payloadFingerprint,undefined);assert.deepEqual(result,x.rows.get(id))})
await check('legacy pending divergent bytes rejected',async()=>{const x=h(),j=fixture(),id=jobPayload(j).id;x.rows.set(id,{...j,id,changes:[]});await assert.rejects(enqueueStrictSyntheticJob(j,x.enqueue),/QC_QUEUE_PAYLOAD_CONFLICT/)})
await check('lost ACK retry confirms same fingerprint without upload',async()=>{const x=h(),j=fixture();x.state.loseAck=true;await assert.rejects(processStrictSyntheticJob(j,x.deps),/ACK_LOST/);const saved=structuredClone(x.state.current),before=[x.state.uploads,x.state.commits];const r=await processStrictSyntheticJob(j,x.deps);assert.equal(r.status,'confirmed');assert.deepEqual(r.record,saved);assert.deepEqual([x.state.uploads,x.state.commits],before)})
await check('different payload same revision never fast confirms',async()=>{const x=h(),j=fixture();await processStrictSyntheticJob(j,x.deps);const b=fixture();b.record.area++;const before=[x.state.uploads,x.state.commits];await assert.rejects(processStrictSyntheticJob(b,x.deps),/QC_REPLAY_PAYLOAD_CONFLICT/);assert.deepEqual([x.state.uploads,x.state.commits],before)})
await check('legacy confirmed missing fingerprint needs review',async()=>{const x=h(),j=fixture();await processStrictSyntheticJob(j,x.deps);delete x.state.current.operationalPayloadFingerprint;await assert.rejects(processStrictSyntheticJob(j,x.deps),/QC_REPLAY_FINGERPRINT_MISSING/)})
await check('commit response missing fingerprint rejected',async()=>{const x=h();x.state.stripFingerprint=true;await assert.rejects(processStrictSyntheticJob(fixture(),x.deps),/QC_REPLAY_FINGERPRINT_MISSING/)})
await check('concurrent adapter returns conflicting confirmation rejected',async()=>{const x=h(),a=fixture(),b=fixture();b.record.area++;await processStrictSyntheticJob(a,x.deps);const old=x.state.current;x.deps.readRecord=async()=>null;x.state.returnOld=true;await assert.rejects(processStrictSyntheticJob(b,x.deps),/QC_REPLAY_PAYLOAD_CONFLICT/);assert.deepEqual(x.state.current,old)})
await check('correction uses new fingerprint and retains untouched photo',async()=>{const x=h(),a=fixture();await processStrictSyntheticJob(a,x.deps);const old=x.state.current,b={...fixture(),baseRevision:'uat-r1',record:{...a.record,clientRevision:'uat-r2',area:300},changes:[]};await processStrictSyntheticJob(b,x.deps);assert.notEqual(x.state.current.operationalPayloadFingerprint,old.operationalPayloadFingerprint);assert.deepEqual(x.state.current.operationalPhotoManifest,old.operationalPhotoManifest)})
await check('other account cannot process job',async()=>{const x=h();x.state.uid='uat-other';await assert.rejects(processStrictSyntheticJob(fixture(),x.deps),/QC_QUEUE_ACCOUNT_MISMATCH/);assert.equal(x.state.uploads,0)})
console.log('SUCCESS: '+n+' strict queue and replay checks (mock adapters only)')
