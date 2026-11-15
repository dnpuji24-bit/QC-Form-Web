import { useEffect,useState } from 'react'
import { createPortal } from 'react-dom'
import { firestoreDb } from './firebase'
import { boundsForMonthRange, exportPlanRangeExcel, validateExportBounds, type PlanExportKind } from './planPeriodExcelExport'

type Props={kind:PlanExportKind}
type PeriodMode='dates'|'months'
function localToday(){
 const now=new Date()
 return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')
}
export default function PlanPeriodExcelExport({kind}:Props){
 const now=localToday(),label=kind==='daily'?'Daily Plan':'Actual Plan'
 const[open,setOpen]=useState(false),[mode,setMode]=useState<PeriodMode>('dates')
 const[fromDate,setFromDate]=useState(now.slice(0,7)+'-01'),[toDate,setToDate]=useState(now)
 const[fromMonth,setFromMonth]=useState(now.slice(0,7)),[toMonth,setToMonth]=useState(now.slice(0,7))
 const[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[success,setSuccess]=useState(false)
 useEffect(()=>{
  if(!open)return
  const existing=document.body.style.overflow
  document.body.style.overflow='hidden'
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy)setOpen(false)}
  window.addEventListener('keydown',onKey)
  return()=>{document.body.style.overflow=existing;window.removeEventListener('keydown',onKey)}
 },[open,busy])
 async function exportExcel(){
  setSuccess(false)
  if(!firestoreDb){setStatus('Firestore belum siap. Login ulang lalu coba lagi.');return}
  let bounds
  try{bounds=mode==='dates'?validateExportBounds({start:fromDate,end:toDate}):boundsForMonthRange(fromMonth,toMonth)}
  catch(error){setStatus(error instanceof Error?error.message:'Rentang tanggal tidak valid.');return}
  setBusy(true);setStatus('Memulai export '+label+'…')
  try{
   const count=await exportPlanRangeExcel({db:firestoreDb,kind,bounds,onProgress:setStatus})
   setSuccess(true);setStatus('Berhasil menyiapkan '+count+' record '+label+'. Periksa folder unduhan browser Anda.')
  }catch(error){setStatus(error instanceof Error?error.message:'Gagal download '+label+'.')}
  finally{setBusy(false)}
 }
 return <>
   <button type="button" className="plan-period-export-trigger" onClick={()=>{setOpen(true);setStatus('');setSuccess(false)}}><span aria-hidden="true">▣</span> Export Excel {label}</button>
   {open&&createPortal(<div className="plan-period-export-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setOpen(false)}}>
    <div className="plan-period-export-dialog" role="dialog" aria-modal="true" aria-label={'Export Excel '+label}>
     <div className="plan-period-export-heading"><div className="plan-period-export-logo" aria-hidden="true">X</div><div><small>DOWNLOAD {label.toUpperCase()}</small><h3>Export {label} ke Excel</h3><p>Pilih rentang tanggal atau bulan/tahun. Seluruh data pada periode tersebut diambil langsung dari Firestore.</p></div><button type="button" className="plan-period-export-close" disabled={busy} aria-label="Tutup Export" onClick={()=>setOpen(false)}>×</button></div>
     <fieldset className="plan-period-mode"><legend>Cakupan periode</legend><label><input type="radio" checked={mode==='dates'} onChange={()=>setMode('dates')} disabled={busy}/> Rentang tanggal</label><label><input type="radio" checked={mode==='months'} onChange={()=>setMode('months')} disabled={busy}/> Rentang bulan & tahun</label></fieldset>
     {mode==='dates'?<div className="plan-period-export-grid"><label>Tanggal Mulai<input type="date" value={fromDate} disabled={busy} onChange={e=>setFromDate(e.target.value)}/></label><label>Tanggal Selesai<input type="date" value={toDate} disabled={busy} onChange={e=>setToDate(e.target.value)}/></label></div>:<div className="plan-period-export-grid"><label>Bulan / Tahun Mulai<input type="month" value={fromMonth} disabled={busy} onChange={e=>setFromMonth(e.target.value)}/></label><label>Bulan / Tahun Sampai<input type="month" value={toMonth} disabled={busy} onChange={e=>setToMonth(e.target.value)}/></label></div>}
     <p className="plan-period-export-info">Export mencakup data Web, import Excel, dan sumber QC yang tersimpan pada {kind==='daily'?'Daily Plan':'Actual Plan'}. Tidak dibatasi filter tanggal layar atau jumlah baris yang terlihat. Hasil berisi detail PID, activity, luas, shift, mandor, unit, bahan, dosis, keterkaitan Plan, serta sheet audit data lengkap.</p>
     {status&&<div className={'plan-period-export-status '+(success?'success':'')} role="status">{busy&&<span className="plan-export-spin" aria-hidden="true"/>}{status}</div>}
     <div className="plan-period-export-actions"><button type="button" onClick={()=>setOpen(false)} disabled={busy}>Tutup</button><button type="button" className="plan-period-export-submit" disabled={busy} onClick={()=>void exportExcel()}>{busy?'Memproses…':'Export Excel'}</button></div>
    </div>
   </div>,document.body)}
 </>
}
