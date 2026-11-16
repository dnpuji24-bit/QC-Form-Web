import React,{useState,useEffect,useRef} from 'react'
import {createRoot} from 'react-dom/client'
import {buildQcFormSaveIntent} from '../src/qcFormSaveIntent.mjs'
import {enqueueStrictBrowserJob,listStrictBrowserJobs,flushStrictBrowserJobs} from '../src/qcUatStrictBrowserQueue.mjs'
import {effectivePermissions} from '../src/qcUatRolePermissions.mjs'
if(window.location.origin!=='http://127.0.0.1:4385')throw Error('STRICT_PORTAL_LAB_LOOPBACK_ONLY')
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
const role=uid=>uid==='uat-spray'?'mandor_spraying':uid==='uat-fert'?'mandor_fertilizer':'pengunjung'
// Local simulated backend only. No SDK, network, credential, or production entrypoint.
const state={uid:'uat-spray',records:new Map(),objects:new Map(),uploads:0,commits:0,failUpload:false,loseAck:false}
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
const canEdit=(uid,kind)=>effectivePermissions(role(uid))[kind==='spray'?'qc_spraying':'qc_fertilizer']==='edit'
const deps={
 photoBucket:'qc-photos-uat-mock',currentUid:async()=>state.uid,
 readRecord:async id=>state.records.get(id)??null,
 putVerifiedPhoto:async(ref,bytes,job)=>{
  state.uploads++
  if(state.failUpload)throw Error('MOCK_UPLOAD_OFFLINE')
  if(state.uid!==ref.uploaderUid||!canEdit(state.uid,job.record.formType))throw Error('MOCK_PERMISSION_DENIED')
  if(hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))!==ref.sha256)throw Error('MOCK_HASH_MISMATCH')
  const data=hex(bytes),old=state.objects.get(ref.objectPath)
  if(old!==undefined&&old!==data)throw Error('MOCK_IMMUTABLE_CONFLICT')
  state.objects.set(ref.objectPath,data)
 },
 commitRecord:async({record,baseRevision,uploaderUid})=>{
  state.commits++
  if(state.uid!==uploaderUid||record.ownerUid!==uploaderUid||!canEdit(state.uid,record.formType))throw Error('MOCK_PERMISSION_DENIED')
  if((state.records.get(record.id)?.clientRevision??null)!==baseRevision)throw Error('MOCK_CAS')
  for(const p of Object.values(record.operationalPhotoManifest))if(!state.objects.has(p.objectPath))throw Error('MOCK_PHOTO_MISSING')
  state.records.set(record.id,structuredClone(record))
  if(state.loseAck){state.loseAck=false;throw Error('MOCK_ACK_LOST')}
  return record
 }
}
function Lab(){
 const [uid,setUid]=useState(state.uid),[kind,setKind]=useState('spray'),[id,setId]=useState('uat-q1'),[revision,setRevision]=useState('uat-r1'),[base,setBase]=useState(''),[area,setArea]=useState('250'),[photo,setPhoto]=useState(true),[rows,setRows]=useState([]),[msg,setMsg]=useState('Belum ada operasi'),[busy,setBusy]=useState(false)
 const lock=useRef(false)
 useEffect(()=>{let active=true;listStrictBrowserJobs(uid).then(r=>{if(active)setRows(r)}).catch(()=>{if(active)setMsg('GAGAL: QUEUE_READ')});return()=>{active=false}},[uid])
 function account(value){state.uid=value;setUid(value);setRows([]);setMsg('Akun diganti')}
 async function run(fn){
  if(lock.current)return
  lock.current=true;setBusy(true)
  try{setMsg(await fn())}catch(e){setMsg('GAGAL: '+e.message)}
  finally{try{setRows(await listStrictBrowserJobs(state.uid))}catch{setMsg('GAGAL: QUEUE_READ')}lock.current=false;setBusy(false)}
 }
 async function save(){
  if(!canEdit(uid,kind))throw Error('FORM_PERMISSION_DENIED')
  const actualArea100=Number(area)
  if(!Number.isSafeInteger(actualArea100)||actualArea100<=0)throw Error('INVALID_AREA')
  const record={testOnly:true,id,ownerUid:uid,clientRevision:revision,formType:kind,saveType:'ready',actualArea100,...(photo?{photoBase64:png}:{})}
  const intent=buildQcFormSaveIntent(record,{isNew:!base,baseRevision:base||undefined})
  const result=await enqueueStrictBrowserJob({testOnly:true,scope:'uat-strict',uploaderUid:uid,record,...intent,action:'finalizeRecord'})
  return 'QUEUED '+result.payloadFingerprint
 }
 async function flush(){
  if(!navigator.onLine)throw Error('OFFLINE')
  const r=await flushStrictBrowserJobs(uid,deps)
  return JSON.stringify(r)
 }
 return <main>
  <h1>QC Portal — Strict Queue Lab</h1><p>Data sintetis · IndexedDB asli · server tiruan</p>
  <label>Akun<select id="account" value={uid} disabled={busy} onChange={e=>account(e.target.value)}><option value="uat-spray">Mandor Spray</option><option value="uat-fert">Mandor Fertilizer</option><option value="uat-view">Pengunjung</option></select></label>
  <label>Form<select id="kind" value={kind} disabled={busy} onChange={e=>setKind(e.target.value)}><option value="spray">Spray</option><option value="fertilizer">Fertilizer</option></select></label>
  <label>ID<input id="record-id" value={id} disabled={busy} onChange={e=>setId(e.target.value)}/></label>
  <label>Revisi<input id="revision" value={revision} disabled={busy} onChange={e=>setRevision(e.target.value)}/></label>
  <label>Revisi dasar<input id="base" value={base} disabled={busy} onChange={e=>setBase(e.target.value)}/></label>
  <label>Luas (0,01 Ha)<input id="area" type="number" value={area} disabled={busy} onChange={e=>setArea(e.target.value)}/></label>
  <label>Foto sintetis<input id="photo" type="checkbox" checked={photo} disabled={busy} onChange={e=>setPhoto(e.target.checked)}/></label>
  <button id="save" disabled={busy||!canEdit(uid,kind)} onClick={()=>run(save)}>Simpan antrean</button>
  <button id="flush" disabled={busy} onClick={()=>run(flush)}>Sinkronisasi</button>
  <label>Simulasi upload gagal<input id="fail-upload" type="checkbox" disabled={busy} onChange={e=>{state.failUpload=e.target.checked}}/></label>
  <label>Simulasi ACK hilang<input id="lose-ack" type="checkbox" disabled={busy} onChange={e=>{state.loseAck=e.target.checked}}/></label>
  <p id="count">{rows.length}</p><ol id="queue">{rows.map(r=><li key={r.id}>{r.record.id} / {r.record.clientRevision} / {r.record.actualArea100}</li>)}</ol>
  <pre id="result" aria-live="polite">{msg}</pre>
 </main>
}
// Test instrumentation only, never imported by production.
globalThis.strictLab={state,deps,enqueueStrictBrowserJob,listStrictBrowserJobs,flushStrictBrowserJobs}
createRoot(document.getElementById('root')).render(<Lab/>)
