// 11D.5c.3b.2e.1 — photo-inclusive browser/HTTP payload contract.
// Offline only: NO Firebase, Supabase SDK, network, secret or production writes.
import assert from 'node:assert/strict'
import {buildUnifiedPhotoCommitEnvelope} from '../src/qcUatUnifiedPhotoCommitEnvelope.mjs'
import {shellRoute,planningPrefix} from '../server/qc-photo-access/uat-unified-browser-shell.mjs'
import {unifiedPaths,unifiedPlanningOrigin} from '../server/qc-photo-access/uat-unified-planning-http.mjs'
const data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGM0atryn4GBgYGJAQoAJCYCa4s7a6wAAAAASUVORK5CYII='
const size=Buffer.from(data.slice(data.indexOf(',')+1),'base64').length
const photo=(kind,slot,holdId='')=>({kind,slot,holdId,dataUrl:data,contentType:'image/png',size,sha256:'a'.repeat(64)})
const record={testOnly:true,id:'qc-v2-uat-photo-demo',ownerUid:'uat-user',inputtedBy:'uat-user',
 formType:'spray',clientRevision:'uat-r1',saveType:'ready',
 dailyPlanId:'uat-d1',date:'2026-11-21',shift:'2',holdIntervals:[{holdId:'uat-h1'}]}
const request={record,baseRevision:null,jobId:'uat-job',uploaderUid:'uat-user',
 expectedDailyRevision:2,foremanId:'uat-f2'}
const same=(r=request,items=[photo('main','main')])=>buildUnifiedPhotoCommitEnvelope(r,items)
let n=0
const check=(label,fn)=>{fn();n++;console.log('PASS: '+label)}
const reject=(fn,code)=>assert.throws(fn,{message:code})
check('same Shift1 source and Shift2 actual foreman preserved exactly',()=>{
 const result=same()
 assert.deepEqual(result.sourceRequest,{dailyPlanId:'uat-d1',expectedDailyRevision:2,
  formType:'spray',date:'2026-11-21',shift:'2',foreman:'uat-f2'})
 assert.equal(result.request,request,'lossless original DTO pointer')
 assert.deepEqual(result.photos,[{action:'replace',kind:'main',dataUrl:data}])
 assert.deepEqual(same(),result,'exact retry has identical payload')
})
check('Spray main + HOLD and Fertilizer main + scan + HOLD are exact',()=>{
 const one=same(request,[photo('main','main'),photo('hold','hold_uat-h1','uat-h1')])
 assert.deepEqual(Object.keys(one.photos[1]),['action','kind','dataUrl','holdId'])
 assert.equal(one.photos[1].holdId,'uat-h1')
 const f={...request,record:{...record,formType:'fertilizer'}}
 const two=same(f,[photo('main','main'),photo('scan','scan'),photo('hold','hold_uat-h1','uat-h1')])
 assert.deepEqual(two.photos.map(x=>x.kind),['main','scan','hold'])
})
check('photo request never accepts browser-selected object paths or URLs',()=>{
 const packet=same()
 for(const key of ['objectPath','signedUrl','bucket','uploaderUid','mimeType'])
  assert.equal(Object.hasOwn(packet.photos[0],key),false)
 assert.equal(Object.hasOwn(packet.request.record,'photoBase64'),false)
})
check('duplicated, forged, deleted or wrong-form slots are denied',()=>{
 reject(()=>same(request,[photo('main','main'),photo('main','main')]),'PHOTO_STAGE_SLOT_INVALID')
 reject(()=>same(request,[photo('hold','hold_uat-h2','uat-h2')]),'PHOTO_STAGE_SLOT_INVALID')
 reject(()=>same(request,[photo('scan','scan')]),'PHOTO_SCAN_ONLY_FERTILIZER')
 reject(()=>same(request,[photo('hold','main','uat-h1')]),'PHOTO_STAGE_SLOT_INVALID')
 reject(()=>same(request,[]),'PHOTO_STAGE_COUNT_INVALID')
 reject(()=>same(request,Array.from({length:5},()=>photo('main','main'))),'PHOTO_STAGE_COUNT_INVALID')
})
check('lossless photo payload enforces strict MIME, bytes and canonical base64',()=>{
 reject(()=>same(request,[{...photo('main','main'),contentType:'image/svg+xml'}]),'PHOTO_STAGE_INVALID')
 reject(()=>same(request,[{...photo('main','main'),size:size+1}]),'PHOTO_STAGE_SIZE_INVALID')
 reject(()=>same(request,[{...photo('main','main'),dataUrl:data+'!'}]),'PHOTO_STAGE_DATA_INVALID')
 reject(()=>same(request,[{...photo('main','main'),dataUrl:data.replace('image/png','image/jpeg')}]),'PHOTO_STAGE_DATA_INVALID')
 reject(()=>same(request,[{...photo('main','main'),sha256:'wrong'}]),'PHOTO_STAGE_INVALID')
})
check('foreign identity and invalid source references denied',()=>{
 reject(()=>same({...request,uploaderUid:'uat-other'}),'PHOTO_FULL_REQUEST_INVALID')
 reject(()=>same({...request,record:{...record,saveType:'uploaded'}}),'PHOTO_FULL_REQUEST_INVALID')
 reject(()=>same({...request,record:{...record,shift:'3'}}),'INVALID_QC_SOURCE_FORM')
})
check('HTTP photo endpoint fixed to exact loopback, no alternate owner/query route',()=>{
 const route=planningPrefix+unifiedPaths.fullPhotoCommit
 assert.equal(shellRoute(route)?.target,unifiedPlanningOrigin+unifiedPaths.fullPhotoCommit)
 for(const invalid of [route+'?url=https://evil.test',route+'#fragment','/api/owner'+unifiedPaths.fullPhotoCommit])
  assert.equal(shellRoute(invalid),null)
})
console.log('SUCCESS: '+n+' isolated photo browser-to-HTTP transport contracts passed (OFFLINE, NO photo upload)')
