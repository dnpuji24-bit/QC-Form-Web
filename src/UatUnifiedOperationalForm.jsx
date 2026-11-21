// Isolated UAT operational QC starter slice.
// This is NOT the full production SprayForm/FertilizerForm field or photo UI.
import {useEffect,useRef,useState} from 'react'
import {parseUnifiedAreaHa,prepareUnifiedOperationalQc} from './qcUatUnifiedOperationalForm.mjs'
const sid=()=>crypto.randomUUID().replace(/-/g,'').slice(0,20)
export default function UatUnifiedOperationalForm({user,kind,api}){
 const [dailyId,setDailyId]=useState('')
 const [source,setSource]=useState(null)
 const [area,setArea]=useState('')
 const [status,setStatus]=useState('pilih sumber Daily Plan')
 const [busy,setBusy]=useState(false)
 const [pending,setPending]=useState(null)
 const seq=useRef(0),locked=useRef(false)
 useEffect(()=>()=>{seq.current++},[])
 const active=()=>api.isCurrent(user)
 async function load(){
  if(locked.current||!active())return
  locked.current=true;setBusy(true);const ticket=++seq.current
  setSource(null);setPending(null);setStatus('memeriksa sumber di server')
  try{
   const row=await api.qcSource(kind,dailyId)
   if(ticket!==seq.current||!active())return
   if(row.formType!==kind||row.dailyPlanId!==dailyId||row.testOnly!==true||row.readOnly!==true)throw Error('INVALID_SOURCE')
   setSource(row);setStatus('sumber terverifikasi')
  }catch{
   if(ticket===seq.current&&active()){setSource(null);setStatus('sumber ditolak, periksa izin dan ID Daily Plan')}
  }finally{locked.current=false;if(ticket===seq.current&&active())setBusy(false)}
 }
 async function submit(saveType){
  if(locked.current||!source||pending||!active())return
  let request
  try{
   const nonce=sid()
   request=prepareUnifiedOperationalQc({
    source,uid:user.uid,recordId:'uat-q-'+nonce,sessionId:'uat-session-'+nonce,
    clientRevision:'uat-rev-'+nonce,jobId:'uat-job-'+nonce,saveType,
    actualArea100:saveType==='draft'?(area?parseUnifiedAreaHa(area):0):parseUnifiedAreaHa(area)
   })
  }catch{setStatus('luas tidak valid: masukkan Ha dengan maksimal 2 angka desimal');return}
  setPending(request);await send(request)
 }
 async function send(request){
  if(locked.current||!active())return
  locked.current=true;setBusy(true);const ticket=++seq.current
  setStatus('mengirim QC ke server...')
  try{
   const row=await api.qcCommit(request)
   if(ticket!==seq.current||!active())return
   if(row?.id!==request.record.id||row?.formType!==kind)throw Error('UNTRUSTED_RECEIPT')
   setStatus(request.record.saveType==='ready'?'QC ready dan Actual tersimpan: '+row.id:'QC draft tersimpan: '+row.id)
   setPending(null)
  }catch{
   if(ticket===seq.current&&active())setStatus('hasil belum terkonfirmasi; gunakan ulang request yang sama atau refresh')
  }finally{locked.current=false;if(ticket===seq.current&&active())setBusy(false)}
 }
 return <section aria-label={'Form QC '+kind+' UAT'} data-testid={'uat-qc-'+kind}>
  <h3>{kind==='spray'?'QC Spraying':'QC Fertilizer'} — UAT</h3>
  <p>Simulasi receipt QC–Actual tanpa foto, bahan atau dosis. Bukan formulir produksi.</p>
  <label>ID Daily Plan <input aria-label={'ID Daily Plan '+kind} value={dailyId}
   disabled={busy||Boolean(pending)}
   onChange={e=>{setDailyId(e.target.value);setSource(null);setPending(null);setStatus('pilih sumber Daily Plan')}}/></label>
  <button disabled={busy||Boolean(pending)||!dailyId} onClick={()=>void load()}>Periksa sumber {kind}</button>
  <p data-testid={'uat-qc-'+kind+'-state'}>{status}</p>
  {source&&<div>
   <p data-testid={'uat-qc-'+kind+'-source'}>PID {source.pid} · {source.date} · shift {source.shift} · mandor {source.foreman} · r{source.revision}</p>
   <p>Target DP: {(source.area100/100).toFixed(2)} Ha; luas aktual boleh melebihi target.</p>
   <label>Luas aktual (Ha) <input aria-label={'Luas aktual '+kind} value={area} disabled={busy||Boolean(pending)} onChange={e=>setArea(e.target.value)}/></label>
   <button disabled={busy||Boolean(pending)} onClick={()=>void submit('draft')}>Simpan draft {kind}</button>
   <button disabled={busy||Boolean(pending)} onClick={()=>void submit('ready')}>Simpan ready {kind}</button>
   {pending&&<button disabled={busy} onClick={()=>void send(pending)}>Ulang request terakhir {kind}</button>}
  </div>}
 </section>
}
