import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { firestoreDb } from './firebase'
import { conditionAt, unitMatchesType, normalizeAssignment, normalizeEvent, normalizeUnitNumber, overlaps, shiftWindow, type UnitAssignment, type UnitEvent, type UnitNumber } from './unitDispatchModel'

type Props={unitName:string;date:string;shift:string;required:number;preferred:string[];onPreferred:(codes:string[])=>void}
export default function DailyUnitAvailability({unitName,date,shift,required,preferred,onPreferred}:Props){
  const[units,setUnits]=useState<UnitNumber[]>([]),[events,setEvents]=useState<UnitEvent[]>([]),[assignments,setAssignments]=useState<UnitAssignment[]>([])
  const[error,setError]=useState(''),[loading,setLoading]=useState(false)
  const hasUnit=Boolean(unitName.trim())
  useEffect(()=>{
    if(!hasUnit)return
    let valid=true;setLoading(true);setError('')
    async function load(){
      if(!firestoreDb)return
      const [numberSnap,eventSnap,assignedSnap]=await Promise.all([
        getDocs(collection(firestoreDb,'master_unit_numbers')),
        getDocs(collection(firestoreDb,'unit_events')),
        getDocs(collection(firestoreDb,'unit_assignments')),
      ])
      if(!valid)return
      setUnits(numberSnap.docs.map(d=>normalizeUnitNumber(d.id,d.data())).filter(u=>u.active))
      setEvents(eventSnap.docs.map(d=>normalizeEvent(d.id,d.data())))
      setAssignments(assignedSnap.docs.map(d=>normalizeAssignment(d.id,d.data())))
    }
    void load().catch(e=>{if(valid)setError(e instanceof Error?e.message:'Status unit tidak tersedia.')}).finally(()=>{if(valid)setLoading(false)})
    return()=>{valid=false}
  },[date,shift,hasUnit])
  const summary=useMemo(()=>{
    const range=shiftWindow(date,shift)
    const matching=units.filter(u=>unitMatchesType(u,unitName))
    const results=matching.map(u=>{
      const condition=conditionAt(events,u.id,range.startMinute)
      const allocated=assignments.some(a=>a.unitId===u.id&&a.status!=='CANCELLED'&&a.status!=='REPLACED'&&overlaps(a,range))
      return{...u,condition,allocated}
    })
    const ready=results.filter(u=>u.condition==='READY')
    const available=ready.filter(u=>!u.allocated)
    return{results,ready,available,breakdown:results.filter(u=>u.condition==='BREAKDOWN').length,maintenance:results.filter(u=>u.condition==='MAINTENANCE').length,out:results.filter(u=>u.condition==='OUT_OF_SERVICE').length}
  },[units,events,assignments,date,shift,unitName])
  if(!unitName.trim())return <small className="muted">Pilih jenis unit terlebih dahulu.</small>
  return <div style={{gridColumn:'1/-1',background:'#f6f9fc',border:'1px solid #e0e8f0',borderRadius:10,padding:12,display:'grid',gap:9}}>
    <strong style={{fontSize:13}}>Ketersediaan Unit — otomatis dari Dispatch</strong>
    {loading&&<small>Memeriksa kondisi dan jadwal unit…</small>}
    {error&&<p role="alert" className="alert">{error} · Ketersediaan belum dapat diverifikasi.</p>}
    {!loading&&!error&&<div style={{display:'flex',gap:14,flexWrap:'wrap',fontSize:13}}>
      <span>Total <b>{summary.results.length}</b></span>
      <span>Ready <b>{summary.ready.length}</b></span>
      <span>Standby <b>{summary.available.length}</b></span>
      <span>Breakdown <b>{summary.breakdown}</b></span>
      <span>Maintenance <b>{summary.maintenance}</b></span>
      <span>Out of Service <b>{summary.out}</b></span>
    </div>}
    <small className="muted">Required {required} unit · Dapat diusulkan sekarang {summary.available.length} unit · {Math.max(0,required-summary.available.length)} unit berpotensi kurang. Jumlah yang tersedia dapat berubah menurut jadwal.</small>
    {required>0&&<div style={{display:'grid',gap:5}}>
      <strong style={{fontSize:12}}>Pilih unit untuk pekerjaan ini (opsional)</strong>
      <small className="muted">Unit Ready tersedia untuk Shift 1 maupun 2. Centang unit untuk usulan Daily Plan, lalu atur jam kerja di Unit Dispatch agar tidak bentrok.</small>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {summary.available.map(u=><label key={u.id} style={{display:'inline-flex',gap:5,alignItems:'center',padding:'6px 8px',border:'1px solid #dce5ef',borderRadius:8,fontSize:12}}>
          <input type="checkbox" checked={preferred.includes(u.code)} disabled={!preferred.includes(u.code)&&preferred.length>=required} onChange={e=>onPreferred(e.target.checked?[...preferred,u.code]:preferred.filter(c=>c!==u.code))}/>
          {u.code}
        </label>)}
        {!summary.available.length&&<small className="muted">Tidak ada unit Ready yang bebas pada waktu shift ini. Periksa status Breakdown/Maintenance atau jadwal unit.</small>}
      </div>
    </div>}
  </div>
}
