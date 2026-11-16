import React,{useState,useEffect,useRef} from 'react'
import {createRoot} from 'react-dom/client'
import {buildQcFormSaveIntent} from '../src/qcFormSaveIntent.mjs'
import {enqueueStrictBrowserJob,listStrictBrowserJobs,flushStrictBrowserJobsViaEndpoint} from '../src/qcUatStrictBrowserQueue.mjs'
import {syncOrigin,syncStrictPortalJob} from '../src/qcUatPortalSyncClient.mjs'
if(location.origin!==syncOrigin)throw Error('SYNC_ORIGIN_DENIED')
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
let session=null
// Fixture injection only: one emulator token in memory, no browser password,
// no persistent token and no token displayed or logged.
function installSession(value){session=value;dispatchEvent(new Event('fixture-session'))}
globalThis.portalSyncLab={installSession,listStrictBrowserJobs}
function Lab(){
 const [uid,setUid]=useState(session?.uid??''),[kind,setKind]=useState('spray'),[id,setId]=useState('uat-q-browser'),[rev,setRev]=useState('uat-r1'),[base,setBase]=useState(''),[area,setArea]=useState('250'),[photo,setPhoto]=useState(true),[rows,setRows]=useState([]),[msg,setMsg]=useState('Belum ada operasi'),[busy,setBusy]=useState(false)
 const lock=useRef(false)
 useEffect(()=>{const update=()=>{setUid(session?.uid??'');setRows([])};addEventListener('fixture-session',update);return()=>removeEventListener('fixture-session',update)},[])
 useEffect(()=>{let active=true;if(uid)listStrictBrowserJobs(uid).then(r=>{if(active)setRows(r)}).catch(()=>{if(active)setMsg('GAGAL: QUEUE_READ')});return()=>{active=false}},[uid])
 async function operate(fn){
  if(lock.current)return
  lock.current=true;setBusy(true)
  try{setMsg(await fn())}catch(e){setMsg('GAGAL: '+e.message)}
  finally{try{setRows(session?await listStrictBrowserJobs(session.uid):[])}catch{setMsg('GAGAL: QUEUE_READ')}setBusy(false);lock.current=false}
 }
 async function save(){
  if(!uid||session?.uid!==uid)throw Error('AUTH_REQUIRED')
  const actualArea100=Number(area)
  if(!Number.isSafeInteger(actualArea100)||actualArea100<=0)throw Error('INVALID_AREA')
  const record={testOnly:true,id,ownerUid:uid,inputtedBy:uid,formType:kind,clientRevision:rev,saveType:'ready',dailyPlanId:'uat-d-'+kind,monthlyPlanLineId:'uat-m-'+kind,pid:'uat-pid',date:'2026-11-12',shift:'2',foreman:'uat-foreman',actualArea100,sessionId:'uat-session',...(photo?{photoBase64:png}:{})}
  const intent=buildQcFormSaveIntent(record,{isNew:!base,baseRevision:base||undefined})
  const result=await enqueueStrictBrowserJob({testOnly:true,scope:'uat-strict',uploaderUid:uid,record,...intent,action:'finalizeRecord'})
  return 'QUEUED '+result.payloadFingerprint
 }
 async function flush(){
  if(!navigator.onLine)throw Error('OFFLINE')
  const r=await flushStrictBrowserJobsViaEndpoint(uid,{currentUid:async()=>session?.uid,syncJob:j=>syncStrictPortalJob(j,async()=>session)})
  return JSON.stringify(r)
 }
 return <main><h1>QC Portal — HTTP Sync Lab</h1><p>Data sintetis · IndexedDB · Firebase emulator · mock storage</p>
 <p id="uid">{uid||'signed-out'}</p>
 <label>Form<select id="kind" value={kind} onChange={e=>setKind(e.target.value)} disabled={busy}><option value="spray">Spray</option><option value="fertilizer">Fertilizer</option></select></label>
 <label>ID<input id="record-id" value={id} onChange={e=>setId(e.target.value)} disabled={busy}/></label>
 <label>Revisi<input id="revision" value={rev} onChange={e=>setRev(e.target.value)} disabled={busy}/></label>
 <label>Revisi dasar<input id="base" value={base} onChange={e=>setBase(e.target.value)} disabled={busy}/></label>
 <label>Luas<input id="area" value={area} type="number" onChange={e=>setArea(e.target.value)} disabled={busy}/></label>
 <label>Foto<input id="photo" checked={photo} type="checkbox" onChange={e=>setPhoto(e.target.checked)} disabled={busy}/></label>
 <button id="save" disabled={busy||!uid} onClick={()=>operate(save)}>Simpan antrean</button>
 <button id="flush" disabled={busy||!uid} onClick={()=>operate(flush)}>Sinkronisasi</button>
 <p id="count">{rows.length}</p><pre id="result" aria-live="polite">{msg}</pre></main>
}
createRoot(document.getElementById('root')).render(<Lab/>)
