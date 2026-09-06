import { useMemo, useState } from 'react'
import type { MasterData, QcRecord } from './types'

type RecordPreset = { type?: 'all'|'spray'|'fertilizer'; query?: string; saveType?: string }
type Props = { records: QcRecord[]; master: MasterData; loading: boolean; onRefresh: () => void; onOpenRecords?: (preset: RecordPreset) => void }
const num = (v: unknown) => Number(String(v ?? '').replace(',','.')) || 0

function recordArea(r: QcRecord) {
  if (r.formType === 'spray') return num(r.area || r.resultArea)
  const fills = Array.isArray(r.pengisianList) ? r.pengisianList as Array<Record<string,unknown>> : []
  return fills.length ? fills.reduce((a,f) => a + num(f.hasilKerja),0) : num(r.hasilKerja)
}

export default function OperationalDashboard({ records, loading, onRefresh, onOpenRecords }: Props) {
  const [type, setType] = useState<'all'|'spray'|'fertilizer'>('all')
  const [query, setQuery] = useState('')
  const paddockOptions = useMemo(() => [...new Set(records.map((r) => String(r.paddock || '').trim()).filter(Boolean))].sort(), [records])
  const filtered = useMemo(() => records.filter((r) => {
    if (type !== 'all' && r.formType !== type) return false
    const hay = `${r.date} ${r.paddock} ${String(r.noUnit || '')} ${String(r.activity || '')} ${String(r.name || '')}`.toLowerCase()
    return hay.includes(query.toLowerCase())
  }), [records, type, query])

  const stats = useMemo(() => {
    const spray = filtered.filter((r) => r.formType === 'spray')
    const fert = filtered.filter((r) => r.formType === 'fertilizer')
    const uploaded = filtered.filter((r) => r.saveType === 'uploaded')
    const pending = filtered.filter((r) => r.saveType !== 'uploaded')
    const sprayArea = spray.reduce((s,r) => s + recordArea(r), 0)
    const fertArea = fert.reduce((s,r) => s + recordArea(r), 0)
    const fertKg = fert.reduce((s,r) => {
      const fills = Array.isArray(r.pengisianList) ? r.pengisianList as Array<Record<string,unknown>> : []
      return s + (fills.length ? fills.reduce((a,f) => a + num(f.jumlah),0) : num(r.jumlah))
    }, 0)
    const units = new Set(fert.map((r) => String(r.noUnit || '')).filter(Boolean)).size
    return { spray: spray.length, fert: fert.length, uploaded: uploaded.length, pending: pending.length, sprayArea, fertArea, totalArea: sprayArea + fertArea, fertKg, units }
  }, [filtered])

  const activityRows = useMemo(() => {
    const map = new Map<string,{records:number,area:number,uploaded:number}>()
    filtered.forEach((r) => {
      const key = String(r.activity || r.type || 'Tanpa Activity')
      const prev = map.get(key) || {records:0,area:0,uploaded:0}
      map.set(key,{records:prev.records+1,area:prev.area+recordArea(r),uploaded:prev.uploaded+(r.saveType==='uploaded'?1:0)})
    })
    return [...map.entries()].sort((a,b) => b[1].area-a[1].area)
  }, [filtered])

  const open = (preset: RecordPreset) => onOpenRecords?.(preset)
  return <section>
    <div className="dashboard-hero compact-hero">
      <div><div className="eyebrow">QUALITY CONTROL</div><h2>Dashboard QC</h2><p>Ringkasan pekerjaan yang sudah diinput dan status pelaporannya.</p></div>
    </div>
    <div className="section-head"><div><div className="eyebrow">FILTER DATA</div><h2>Ringkasan Pekerjaan</h2></div><button className="secondary" onClick={onRefresh} disabled={loading}>{loading?'Memuat…':'Refresh data'}</button></div>
    <div className="filters dashboard-filters"><div><input list="worked-paddocks" placeholder="Cari / pilih paddock yang sudah dikerjakan…" value={query} onChange={(e)=>setQuery(e.target.value)} /><datalist id="worked-paddocks">{paddockOptions.map((x)=><option value={x} key={x}/>)}</datalist></div><select value={type} onChange={(e)=>setType(e.target.value as typeof type)}><option value="all">Semua form</option><option value="spray">Spraying</option><option value="fertilizer">Fertilizer</option></select></div>
    <div className="stats-grid dashboard-stats">
      <Stat label="Total record" value={filtered.length} onClick={()=>open({type,query})} hint="Lihat semua data" />
      <Stat label="Uploaded" value={stats.uploaded} onClick={()=>open({type,query,saveType:'uploaded'})} hint="Lihat yang sudah upload" />
      <Stat label="Draft / queue" value={stats.pending} onClick={()=>open({type,query,saveType:'pending'})} hint="Lihat yang belum upload" />
      <Stat label="Total area dikerjakan" value={`${stats.totalArea.toLocaleString('id-ID')} Ha`} onClick={()=>open({type,query})} hint="Akumulasi hasil input" />
      <Stat label="Spray area" value={`${stats.sprayArea.toLocaleString('id-ID')} Ha`} onClick={()=>open({type:'spray',query})} hint={`${stats.spray} record`} />
      <Stat label="Fertilizer area" value={`${stats.fertArea.toLocaleString('id-ID')} Ha`} onClick={()=>open({type:'fertilizer',query})} hint={`${stats.fert} record`} />
      <Stat label="Pupuk tercatat" value={`${stats.fertKg.toLocaleString('id-ID')} Kg`} onClick={()=>open({type:'fertilizer',query})} hint="Dari pengisian fertilizer" />
      <Stat label="Unit fertilizer" value={stats.units} onClick={()=>open({type:'fertilizer',query})} hint="Unit unik yang tercatat" />
    </div>
    <div className="panel activity-panel"><div className="section-head"><div><div className="eyebrow">HASIL PER ACTIVITY</div><h3>Luas yang Sudah Dikerjakan</h3></div><span className={`status-pill ${stats.pending ? 'warning' : 'success'}`}>{stats.pending ? `${stats.pending} belum uploaded` : 'Semua uploaded'}</span></div>
      <div className="activity-card-list">{activityRows.map(([name,row]) => { const progress=row.records?Math.round(row.uploaded/row.records*100):0; return <button type="button" className="activity-card" key={name} onClick={()=>open({type,query:name})}><span><strong>{name}</strong><small>{row.records} record • {row.uploaded} uploaded</small></span><span className="activity-area">{row.area.toLocaleString('id-ID')} Ha<small>{progress}% uploaded</small></span></button> })}{!activityRows.length && <div className="empty">Belum ada data.</div>}</div>
    </div>
  </section>
}

function Stat({ label, value, hint, onClick }: { label:string; value:number|string; hint?:string; onClick?:()=>void }) {
  return <button type="button" className="stat stat-button" onClick={onClick}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</button>
}
