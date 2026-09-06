import { useMemo, useState } from 'react'
import type { MasterData, QcRecord } from './types'

type Props = { records: QcRecord[]; master: MasterData; loading: boolean; onRefresh: () => void }
const num = (v: unknown) => Number(String(v ?? '').replace(',','.')) || 0

export default function OperationalDashboard({ records, master, loading, onRefresh }: Props) {
  const [type, setType] = useState<'all'|'spray'|'fertilizer'>('all')
  const [query, setQuery] = useState('')
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
    const sprayArea = spray.reduce((s,r) => s + num(r.area || r.resultArea), 0)
    const fertArea = fert.reduce((s,r) => {
      const fills = Array.isArray(r.pengisianList) ? r.pengisianList as Array<Record<string,unknown>> : []
      return s + (fills.length ? fills.reduce((a,f) => a + num(f.hasilKerja),0) : num(r.hasilKerja))
    }, 0)
    const fertKg = fert.reduce((s,r) => {
      const fills = Array.isArray(r.pengisianList) ? r.pengisianList as Array<Record<string,unknown>> : []
      return s + (fills.length ? fills.reduce((a,f) => a + num(f.jumlah),0) : num(r.jumlah))
    }, 0)
    const paddocks = new Set(filtered.map((r) => r.paddock).filter(Boolean)).size
    const units = new Set(fert.map((r) => String(r.noUnit || '')).filter(Boolean)).size
    return { spray: spray.length, fert: fert.length, uploaded: uploaded.length, pending: pending.length, sprayArea, fertArea, fertKg, paddocks, units }
  }, [filtered])

  const activityRows = useMemo(() => {
    const map = new Map<string,{records:number,area:number,uploaded:number}>()
    filtered.forEach((r) => {
      const key = String(r.activity || r.type || 'Tanpa Activity')
      const prev = map.get(key) || {records:0,area:0,uploaded:0}
      let area = r.formType === 'spray' ? num(r.area || r.resultArea) : 0
      if (r.formType === 'fertilizer') {
        const fills = Array.isArray(r.pengisianList) ? r.pengisianList as Array<Record<string,unknown>> : []
        area = fills.length ? fills.reduce((a,f) => a + num(f.hasilKerja),0) : num(r.hasilKerja)
      }
      map.set(key,{records:prev.records+1,area:prev.area+area,uploaded:prev.uploaded+(r.saveType==='uploaded'?1:0)})
    })
    return [...map.entries()].sort((a,b) => b[1].area-a[1].area)
  }, [filtered])

  const planSummary = useMemo(() => {
    const plans = (master.plans || master.plan || [])
    const plannedArea = plans.reduce((s,p) => s + num(p.area || p.luas_target),0)
    return { rows: plans.length, plannedArea }
  }, [master])

  return <section>
    <div className="section-head"><div><div className="eyebrow">OPERASIONAL</div><h2>Dashboard QC</h2></div><button className="secondary" onClick={onRefresh} disabled={loading}>{loading?'Memuat…':'Refresh'}</button></div>
    <div className="filters"><input placeholder="Cari paddock, unit, activity, mandor…" value={query} onChange={(e)=>setQuery(e.target.value)} /><select value={type} onChange={(e)=>setType(e.target.value as typeof type)}><option value="all">Semua form</option><option value="spray">Spraying</option><option value="fertilizer">Fertilizer</option></select></div>
    <div className="stats-grid">
      <Stat label="Total record" value={filtered.length} /><Stat label="Uploaded" value={stats.uploaded} /><Stat label="Draft / queue" value={stats.pending} /><Stat label="Paddock aktif" value={stats.paddocks} />
      <Stat label="Spray area" value={`${stats.sprayArea.toLocaleString('id-ID')} Ha`} /><Stat label="Fertilizer area" value={`${stats.fertArea.toLocaleString('id-ID')} Ha`} /><Stat label="Pupuk tercatat" value={`${stats.fertKg.toLocaleString('id-ID')} Kg`} /><Stat label="Unit fertilizer" value={stats.units} />
    </div>
    <div className="dashboard-grid">
      <div className="panel"><h3>Rekap per Activity</h3><div className="table-wrap"><table><thead><tr><th>Activity</th><th>Record</th><th>Area</th><th>Uploaded</th><th>Progress</th></tr></thead><tbody>{activityRows.map(([name,row]) => <tr key={name}><td>{name}</td><td>{row.records}</td><td>{row.area.toLocaleString('id-ID')} Ha</td><td>{row.uploaded}</td><td>{row.records ? Math.round(row.uploaded/row.records*100) : 0}%</td></tr>)}{!activityRows.length && <tr><td colSpan={5} className="empty">Belum ada data.</td></tr>}</tbody></table></div></div>
      <div className="panel"><h3>Ringkasan Data</h3><div className="metric-list"><div><span>Record Spraying</span><strong>{stats.spray}</strong></div><div><span>Record Fertilizer</span><strong>{stats.fert}</strong></div><div><span>Baris Plan tersedia</span><strong>{planSummary.rows}</strong></div><div><span>Total luas pada Plan</span><strong>{planSummary.plannedArea.toLocaleString('id-ID')} Ha</strong></div></div><p className="muted">Luas Plan hanya ditampilkan sebagai referensi dashboard; tidak mengisi Luas Aktual pada Form Spraying.</p></div>
    </div>
  </section>
}

function Stat({ label, value }: { label:string; value:number|string }) { return <div className="stat"><span>{label}</span><strong>{value}</strong></div> }
