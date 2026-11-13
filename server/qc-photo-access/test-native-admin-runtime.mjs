import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createNativeAdminRuntime} from './nativeAdminRuntime.mjs'
const origin='https://preview.example.test'
let reads=0,verifies=0,readFailure=false
const owner={role:'owner',active:true,status:'APPROVED',email:'owner@example.test'}
const profiles={owner,lower:{...owner,status:'approved',email:'lower@example.test'},pending:{...owner,status:'PENDING',email:'pending@example.test'},inactive:{...owner,active:false,email:'inactive@example.test'},manager:{...owner,role:'manager',email:'manager@example.test'},mismatch:{...owner,email:'wrong@example.test'}}
const auth={verifyIdToken:async(token,revoked)=>{verifies++;assert.equal(revoked,true);if(!Object.hasOwn(profiles,token)&&token!=='missing')throw Error('invalid');return {uid:token,email:token+'@example.test'}}}
const db={collection(name){assert.equal(name,'users');return {doc(uid){return {get:async()=>{reads++;if(readFailure)throw Error('offline');return {data:()=>profiles[uid]}}}}}}}
const runtime=createNativeAdminRuntime({db,auth,stamp:()=>{throw Error('unexpected write')},allowedOrigin:origin})
const server=createServer((req,res)=>void runtime(req,res))
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const url='http://127.0.0.1:'+server.address().port
let n=0
const check=async(label,fn)=>{await fn();n++;console.log('PASS: '+label)}
const request=(path='/native-admin/readiness',method='POST',token,requestOrigin=origin)=>fetch(url+path,{method,headers:{Origin:requestOrigin,...(token?{Authorization:'Bearer '+token}:{})}})
async function expect(p,status){const r=await p;assert.equal(r.status,status);return r.status===204?null:r.json()}
try{
 await check('health exposes read-only mode',async()=>assert.deepEqual(await expect(request('/healthz','GET'),200),{ok:true,service:'qc-native-admin',writesEnabled:false}))
 await check('unknown route rejected',()=>expect(request('/other','GET'),404))
 await check('other origin denied before verification',async()=>{await expect(request(undefined,'POST','owner','https://wrong.example.test'),403);assert.equal(verifies,0);assert.equal(reads,0)})
 await check('readiness preflight succeeds',()=>expect(request(undefined,'OPTIONS'),204))
 await check('readiness GET rejected',()=>expect(request(undefined,'GET'),405))
 await check('missing token rejected',()=>expect(request(),401))
 await check('invalid token rejected',()=>expect(request(undefined,'POST','bad'),401))
 await check('legacy uppercase Owner verified',async()=>assert.deepEqual(await expect(request(undefined,'POST','owner'),200),{ok:true,role:'owner',profileVerified:true,writesEnabled:false}))
 await check('native lowercase Owner verified',()=>expect(request(undefined,'POST','lower'),200))
 await check('pending Owner denied',()=>expect(request(undefined,'POST','pending'),403))
 await check('inactive Owner denied',()=>expect(request(undefined,'POST','inactive'),403))
 await check('non-Owner denied',()=>expect(request(undefined,'POST','manager'),403))
 await check('mismatched email denied',()=>expect(request(undefined,'POST','mismatch'),403))
 await check('missing profile denied',()=>expect(request(undefined,'POST','missing'),403))
 await check('read failure is not authorization',async()=>{readFailure=true;await expect(request(undefined,'POST','owner'),503);readFailure=false})
 await check('administrative route disabled without database access',async()=>{const before=[verifies,reads];assert.deepEqual(await expect(request('/native-admin','POST','owner'),503),{error:'NATIVE_ADMIN_WRITES_DISABLED'});assert.deepEqual([verifies,reads],before)})
 await check('dangerous feature flags require master write gate',()=>assert.throws(()=>createNativeAdminRuntime({db,auth,allowedOrigin:origin,archiveEnabled:true}),/WRITE_GATE_REQUIRED/))
 await check('HTTP or path-bearing origin rejected',()=>{for(const value of ['http://preview.example.test','https://preview.example.test/path'])assert.throws(()=>createNativeAdminRuntime({db,auth,allowedOrigin:value}),/INVALID_HTTPS_ORIGIN/)})
 console.log('SUCCESS: '+n+' native admin runtime checks passed (mock Auth/Firestore, no network backend or writes)')
}finally{await new Promise(resolve=>server.close(resolve))}
