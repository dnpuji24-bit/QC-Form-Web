import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {decodeFirestoreDocument,decodeFirestoreValue,isRetryableFirestoreTransportError,fetchFirestoreDocumentViaREST} from '../src/qcFirestoreHttpFallback.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const fields={name:'projects/form-qc-unm/databases/(default)/documents/users/owner-id',
  fields:{username:{stringValue:'owner'},role:{stringValue:'owner'},active:{booleanValue:true},
    status:{stringValue:'approved'},fullName:{stringValue:'Owner'},
    permissions:{mapValue:{fields:{qc_records:{stringValue:'edit'}}}}}}
const args={projectId:'form-qc-unm',collection:'users',documentId:'owner-id',idToken:'fake-id-token'}
const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data})
test('Firestore WebChannel fallback happens only for connectivity failures',()=>{
  for(const code of ['unavailable','firestore/unavailable','deadline-exceeded'])
    assert.equal(isRetryableFirestoreTransportError({code}),true)
  for(const code of ['permission-denied','resource-exhausted','firestore/resource-exhausted','unauthenticated','invalid-argument'])
    assert.equal(isRetryableFirestoreTransportError({code}),false)
})
test('decode only actual Firestore fields; preserve profile active and permission map',()=>{
  const x=decodeFirestoreDocument(fields)
  assert.deepEqual(x,{username:'owner',role:'owner',active:true,status:'approved',fullName:'Owner',permissions:{qc_records:'edit'}})
  assert.deepEqual(decodeFirestoreValue({arrayValue:{values:[{stringValue:'A'},{integerValue:'2'}]}}),['A',2])
  assert.equal(decodeFirestoreDocument({}),null)
})
test('authenticated HTTPS uses only Google Firestore API and no cache, user token is not exposed',async()=>{
  let requested
  const result=await fetchFirestoreDocumentViaREST({...args,appCheckToken:'fake-app-check-token',
    fetchImpl:async(...params)=>{requested=params;return response(200,fields)}})
  assert.equal(result.role,'owner')
  assert.match(requested[0],/^https:\/\/firestore\.googleapis\.com\/v1\/projects\/form-qc-unm\/databases\/\(default\)\/documents\/users\/owner-id$/)
  assert.equal(requested[1].method,'GET')
  assert.equal(requested[1].cache,'no-store')
  assert.equal(requested[1].credentials,'omit')
  assert.equal(requested[1].headers.Authorization,'Bearer fake-id-token')
  assert.equal(requested[1].headers['X-Firebase-AppCheck'],'fake-app-check-token')
  assert.ok(!JSON.stringify(result).includes('fake-id-token'))
})
test('absent profile is not fabricated and quota/permission errors remain distinct',async()=>{
  assert.equal(await fetchFirestoreDocumentViaREST({...args,fetchImpl:async()=>response(404,{})}),undefined)
  for(const [status,json,expected] of [
    [403,{error:{status:'RESOURCE_EXHAUSTED',message:'Sensitive project details'}},'resource-exhausted'],
    [403,{error:{status:'PERMISSION_DENIED'}},'permission-denied'],
    [429,{error:{status:'RESOURCE_EXHAUSTED'}},'resource-exhausted'],
    [503,{error:{status:'UNAVAILABLE'}},'unavailable'],
    [401,{error:{status:'UNAUTHENTICATED'}},'unauthenticated']
  ]){
    await assert.rejects(()=>fetchFirestoreDocumentViaREST({...args,fetchImpl:async()=>response(status,json)}),
      e=>e.code===expected&&!String(e.message).includes('Sensitive project details'))
  }
})
test('unauthorized document path, missing token and failing network cannot return a profile',async()=>{
  for(const invalid of [{documentId:'../other'},{idToken:''},{projectId:'project with spaces'}]){
    await assert.rejects(()=>fetchFirestoreDocumentViaREST({...args,...invalid,fetchImpl:async()=>{throw Error('Should not run')}}),
      e=>e.code==='invalid-argument')
  }
  await assert.rejects(()=>fetchFirestoreDocumentViaREST({...args,fetchImpl:async()=>{throw Error('network blocked')}}),
    e=>e.code==='unavailable'&&!String(e.message).includes('network blocked'))
})
test('production login still validates Owner server profile, roles, and active flag',()=>{
  const session=read('src/qcFirebaseSession.ts')
  const login=read('src/NativePortalSession.tsx')
  const rules=read('firestore.rules')
  assert.match(session,/getDocFromServer\(doc\(db,collectionName,documentId\)\)/)
  assert.match(session,/fetchFirestoreDocumentViaREST/)
  assert.match(session,/getAppCheckToken\(firebaseAppCheck,false\)/)
  assert.match(session,/auth\.currentUser\?\.uid!==uid/)
  assert.match(session,/isApprovedFirebaseProfile\(profile\)/)
  assert.match(session,/resolveFirebaseProfile\(/)
  assert.match(login,/lastVerifiedAt<300000/)
  assert.match(login,/setInterval\(\(\)=>\{if\(navigator\.onLine\)refresh\(\)\},300000\)/)
  assert.match(rules,/match \/users\/\{uid\}/)
  assert.match(rules,/allow read: if activeUser\(\) && \(request\.auth\.uid == uid \|\| role\(\) == 'owner'\)/)
  assert.doesNotMatch(session,/getDocFromCache|setDoc\(|updateDoc\(|deleteDoc\(|adminAuth|verifyIdToken/)
})
