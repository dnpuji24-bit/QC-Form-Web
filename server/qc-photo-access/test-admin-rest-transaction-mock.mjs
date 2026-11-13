import assert from 'node:assert/strict'
import {createAdminRestEmulator,restServerTimestamp} from './adminRestTransactionEmulator.mjs'
const root='projects/demo-qc-photo-test/databases/(default)/documents',time='2026-11-13T00:00:00.123456Z'
function fixture({abort=false,unknown=false,raw={active:{booleanValue:true},extra:{stringValue:'keep'}}}={}){
 const calls=[];let commits=0,begins=0
 const db=createAdminRestEmulator({host:'127.0.0.1:8085',projectId:'demo-qc-photo-test',fetchImpl:async(url,req)=>{
  assert.ok(url.startsWith('http://127.0.0.1:8085/v1/'+root+':'))
  const method=url.split(':').at(-1),body=JSON.parse(req.body);calls.push({method,body})
  let result
  if(method==='beginTransaction')result={transaction:'tx'+(++begins)}
  if(method==='batchGet')result=body.documents.map(name=>name.endsWith('/missing')?{missing:name}:{found:{name,fields:raw,updateTime:time}})
  if(method==='runQuery')result=[{readTime:time}]
  if(method==='rollback')result={}
  if(method==='commit'){
   commits++
   if(unknown)throw Error('transport failure')
   if(abort&&commits===1)return new Response(JSON.stringify({error:{status:'ABORTED'}}),{status:409})
   result={commitTime:time,writeResults:body.writes.map(()=>({updateTime:time}))}
  }
  return new Response(JSON.stringify(result),{status:200})
 }})
 return {db,calls}
}
let n=0
async function check(label,fn){await fn();console.log('PASS: '+label);n++}
await check('only demo loopback target allowed',()=>{for(const options of [{host:'127.0.0.1:8085',projectId:'form-qc-unm'},{host:'firestore.googleapis.com',projectId:'demo-qc-photo-test'}])assert.throws(()=>createAdminRestEmulator(options),/DEMO_LOOPBACK_REQUIRED/)})
await check('unknown collections, forged refs and query fields denied',async()=>{const {db}=fixture();assert.throws(()=>db.collection('other'),/COLLECTION_DENIED/);assert.throws(()=>db.collection('users').where('email','==','x'),/QUERY_DENIED/);await assert.rejects(db.runTransaction(tx=>tx.get({kind:'doc',collection:'users',id:'x'})),/INVALID_REST_REF/)})
await check('transaction update preserves unrelated fields and server timestamp',async()=>{const {db,calls}=fixture();const ref=db.collection('users').doc('u');await db.runTransaction(async tx=>{const s=await tx.get(ref);assert.equal(s.data().extra,'keep');assert.equal(s.updateTime.nanoseconds,123456000);tx.update(ref,{active:false,updatedAt:restServerTimestamp()})});const w=calls.find(c=>c.method==='commit').body.writes[0];assert.deepEqual(w.updateMask,{fieldPaths:['active']});assert.deepEqual(w.currentDocument,{updateTime:time});assert.deepEqual(w.updateTransforms,[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}])})
await check('create is insert only; update and delete require existing read',async()=>{const {db,calls}=fixture();const ref=db.collection('users').doc('missing');await db.runTransaction(async tx=>{assert.equal((await tx.get(ref)).exists,false);tx.create(ref,{active:true})});assert.deepEqual(calls.find(c=>c.method==='commit').body.writes[0].currentDocument,{exists:false});await assert.rejects(db.runTransaction(async tx=>{await tx.get(ref);tx.delete(ref)}),/REST_DOCUMENT_MISSING/)})
await check('all writes submitted in single commit with same transaction',async()=>{const {db,calls}=fixture();const ref=db.collection('users').doc('u');await db.runTransaction(async tx=>{await tx.get(ref);tx.update(ref,{active:false});tx.create(db.collection('qc_admin_audit').doc('audit1'),{action:'test',createdAt:restServerTimestamp()})});const c=calls.filter(c=>c.method==='commit');assert.equal(c.length,1);assert.equal(c[0].body.transaction,'tx1');assert.equal(c[0].body.writes.length,2)})
await check('read after write rolls back without commit',async()=>{const {db,calls}=fixture();await assert.rejects(db.runTransaction(async tx=>{tx.create(db.collection('users').doc('x'),{active:true});await tx.get(db.collection('users').doc('u'))}),/REST_READ_AFTER_WRITE/);assert.deepEqual(calls.map(c=>c.method),['beginTransaction','rollback'])})
await check('explicit ABORTED retries entire transaction only',async()=>{const {db,calls}=fixture({abort:true});let run=0;await db.runTransaction(async tx=>{run++;const ref=db.collection('users').doc('u');await tx.get(ref);tx.update(ref,{active:false})});assert.equal(run,2);assert.deepEqual(calls.filter(c=>c.method==='commit').map(c=>c.body.transaction),['tx1','tx2'])})
await check('unknown commit outcome never replayed',async()=>{const {db,calls}=fixture({unknown:true});await assert.rejects(db.runTransaction(tx=>tx.create(db.collection('users').doc('u'),{active:true})),/REST_COMMIT_OUTCOME_UNKNOWN/);assert.equal(calls.filter(c=>c.method==='commit').length,1)})
await check('unsupported document value fails closed without writes',async()=>{const {db,calls}=fixture({raw:{extra:{doubleValue:1}}});await assert.rejects(db.runTransaction(tx=>tx.get(db.collection('users').doc('u'))),/UNSUPPORTED_REST_VALUE/);assert.equal(calls.some(c=>c.method==='commit'),false)})
await check('collection scan and QC equality query use transaction',async()=>{const {db,calls}=fixture();await db.runTransaction(async tx=>{assert.equal((await tx.get(db.collection('users'))).size,0);assert.equal((await tx.get(db.collection('daily_reports').where('qcRecordId','==','qc-v2-1'))).size,0)});const q=calls.filter(c=>c.method==='runQuery');assert.equal(q.length,2);assert.equal(q[1].body.transaction,'tx1');assert.equal(q[1].body.structuredQuery.where.fieldFilter.value.stringValue,'qc-v2-1')})
console.log('SUCCESS: '+n+' admin REST transaction mock checks passed (no network or writes)')
