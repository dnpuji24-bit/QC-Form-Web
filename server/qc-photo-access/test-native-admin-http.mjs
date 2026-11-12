import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createNativeAdminHandler} from './nativeAdminHttp.mjs'
const origin='https://preview.example.test'
let verifies=0
const auth={verifyIdToken:async(token,revoke)=>{verifies++;assert.equal(revoke,true);if(token!=='valid')throw Object.assign(Error('invalid'),{code:'auth/invalid-id-token'});return {uid:'owner1',email:'owner@example.test'}}}
const server=createServer(createNativeAdminHandler({db:null,auth,stamp:()=>null,allowedOrigin:origin}))
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const url='http://127.0.0.1:'+server.address().port
const req=(method='POST',headers={},body='{}')=>fetch(url,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(method==='POST'?{body}:{})})
let n=0
async function check(label,p,status){const r=await p;assert.equal(r.status,status);await r.text();n++;console.log('PASS: '+label)}
try{
 await check('cross origin denied',req('POST',{Origin:'https://other.example.test'}),403)
 await check('preflight allowed',req('OPTIONS'),204)
 await check('GET rejected',req('GET'),405)
 await check('wrong content type rejected',req('POST',{'Content-Type':'text/plain'}),415)
 await check('malformed JSON rejected',req('POST',{},'{'),400)
 await check('oversized body rejected',req('POST',{},' '.repeat(17000)),413)
 await check('missing bearer rejected',req(),401)
 await check('invalid bearer rejected',req('POST',{Authorization:'Bearer invalid'}),401)
 await check('authenticated invalid command rejected',req('POST',{Authorization:'Bearer valid'}),409)
 assert.equal(verifies,2)
 console.log('SUCCESS: '+n+' native admin HTTP checks passed (local HTTP; mock Auth; no database writes)')
}finally{await new Promise(resolve=>server.close(resolve))}
