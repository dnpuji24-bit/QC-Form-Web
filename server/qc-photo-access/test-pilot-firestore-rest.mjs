import assert from 'node:assert/strict'
import {createPilotFirestoreRest} from './pilotFirestoreRest.mjs'
const recordId='qc-live-photo-pilot-12345678-1234-1234-1234-123456789012'
const path='qc_photo_live_pilot_records/'+recordId,root='https://firestore.googleapis.com/v1/projects/form-qc-unm/databases/(default)/documents/'
const calls=[]
let nextStatus=200
const value={testOnly:true,ownerUid:'synthetic',operationalPhotoManifest:{main:{size:68,kind:'main'}}}
const encoded={testOnly:{booleanValue:true},ownerUid:{stringValue:'synthetic'},operationalPhotoManifest:{mapValue:{fields:{main:{mapValue:{fields:{size:{integerValue:'68'},kind:{stringValue:'main'}}}}}}}}
const db=createPilotFirestoreRest({recordId,accessToken:()=> 'synthetic-token',fetchImpl:async(url,options)=>{
 calls.push({url,...options})
 assert.equal(options.headers.Authorization,'Bearer synthetic-token')
 return {status:nextStatus,ok:nextStatus===200,json:async()=>({name:'projects/form-qc-unm/databases/(default)/documents/'+path,updateTime:'2026-11-13T00:00:00Z',fields:encoded})}
}})
let n=0
async function check(label,fn){await fn();console.log('PASS: '+label);n++}
await check('reject operational paths',()=>assert.throws(()=>db.doc('qc_records/real'),/PILOT_PATH_DENIED/))
await check('reject other pilot IDs',()=>assert.throws(()=>db.doc('qc_photo_live_pilot_records/other'),/PILOT_PATH_DENIED/))
await check('profile and role writes prohibited',async()=>{for(const key of ['users/u','role_access/owner']){await assert.rejects(db.doc(key).create(value),/PILOT_WRITE_DENIED/);await assert.rejects(db.doc(key).delete(),/PILOT_DELETE_DENIED/)}})
await check('requires synthetic flag and refuses unowned delete',async()=>{await assert.rejects(db.doc(path).create({testOnly:false}),/PILOT_WRITE_DENIED/);await assert.rejects(db.doc(path).delete(),/PILOT_DELETE_DENIED/);assert.equal(calls.length,0)})
await check('create only with exact documentId and encoded manifest',async()=>{await db.doc(path).create(value);assert.equal(calls.at(-1).url,root+'qc_photo_live_pilot_records?documentId='+recordId);assert.equal(calls.at(-1).method,'POST');assert.deepEqual(JSON.parse(calls.at(-1).body),{fields:encoded});await assert.rejects(db.doc(path).create(value),/PILOT_WRITE_DENIED/)})
await check('read decodes nested manifest',async()=>assert.deepEqual((await db.doc(path).get()).data(),value))
await check('delete only own unchanged document with updateTime',async()=>{await db.doc(path).delete();assert.equal(calls.at(-1).method,'DELETE');assert.equal(calls.at(-1).url,root+path+'?currentDocument.updateTime=2026-11-13T00%3A00%3A00Z');await assert.rejects(db.doc(path).delete(),/PILOT_DELETE_DENIED/)})
await check('missing document and denied read handled separately',async()=>{nextStatus=404;assert.equal((await db.doc('users/u').get()).data(),undefined);nextStatus=403;await assert.rejects(db.doc('users/u').get(),/FIRESTORE_GET_HTTP_403/)})
console.log('SUCCESS: '+n+' pilot Firestore REST checks passed (mock only)')
