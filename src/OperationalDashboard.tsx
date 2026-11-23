import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Form, Input, Select, Statistic, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { onAuthStateChanged } from 'firebase/auth'
import { firebaseAuth, firestoreDb } from './firebase'
import type { MasterData, QcRecord } from './types'
import YinYangRefreshButton from './YinYangRefreshButton'

type RecordPreset = { type?: 'all'|'spray'|'fertilizer'; query?: string; saveType?: string }
type Props = { records: QcRecord[]; master: MasterData; loading: boolean; onRefresh: () => void; onOpenRecords?: (preset: RecordPreset) => void }
type ActivityRow = { name: string; records: number; area: number; uploaded: number }
const num = (v: unknown) => Number(String(v ?? '').replace(',','.')) || 0

function recordArea(r: QcRecord) {
  if (r.formType === 'spray') return num(r.area || r.resultArea)
  const fills = Array.isArray(r.pengisianList) ? r.pengisianList as Array<Record<string,unknown>> : []
  return fills.length ? fills.reduce((a,f) => a + num(f.hasilKerja),0) : num(r.hasilKerja)
}

export default function OperationalDashboard({ records, loading, onRefresh, onOpenRecords }: Props) {
  const [type, setType] = useState<'all'|'spray'|'fertilizer'>('all')
  const [query, setQuery] = useState('')
  const [realtimeActive,setRealtimeActive] = useState(Boolean(firebaseAuth?.currentUser && firestoreDb))
  useEffect(()=>{
    if(!firebaseAuth||!firestoreDb){setRealtimeActive(false);return}
    return onAuthStateChanged(firebaseAuth,current=>setRealtimeActive(Boolean(current)))
  },[])
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
    return [...map.entries()]
      .sort((a,b) => b[1].area-a[1].area)
      .map(([name, row]) => ({ name, ...row }))
  }, [filtered])

  const open = (preset: RecordPreset) => onOpenRecords?.(preset)
  const columns: TableColumnsType<ActivityRow> = [
    {
      title: 'Activity', dataIndex: 'name',
      render: (name: string) => <Button type="link" className="qc-activity-link" onClick={() => open({ type, query: name })}>{name}</Button>,
    },
    { title: 'Luas (Ha)', dataIndex: 'area', align: 'right', render: (area: number) => area.toLocaleString('id-ID') },
    { title: 'Record', dataIndex: 'records', align: 'right' },
    { title: 'Uploaded', key: 'uploaded', align: 'right', render: (_, row) => `${row.uploaded} (${Math.round(row.uploaded / row.records * 100)}%)` },
  ]
  return <section className="qc-antd-dashboard">
    <div className="qc-dashboard-heading qc-dashboard-title">
      <Typography.Title level={2}>Dashboard QC</Typography.Title>
      {realtimeActive?<Tag color="success">Pembaruan otomatis</Tag>:<YinYangRefreshButton busy={loading} label="Refresh data" onClick={onRefresh}/>}
    </div>
    <Card>
      <Form component="div" layout="vertical" className="qc-dashboard-filters">
        <Form.Item label="Cari pekerjaan" htmlFor="qc-dashboard-query">
          <Input id="qc-dashboard-query" list="worked-paddocks" placeholder="Paddock, unit, activity, atau mandor" value={query} onChange={e => setQuery(e.target.value)} />
          <datalist id="worked-paddocks">{paddockOptions.map(value => <option value={value} key={value} />)}</datalist>
        </Form.Item>
        <Form.Item label="Jenis form" htmlFor="qc-dashboard-type">
          <Select id="qc-dashboard-type" value={type} onChange={setType} virtual={false} options={[
            { value: 'all', label: 'Semua form' },
            { value: 'spray', label: 'Spraying' },
            { value: 'fertilizer', label: 'Fertilizer' },
          ]} />
        </Form.Item>
      </Form>
    </Card>
    <div className="qc-dashboard-stats">
      <Stat label="Total record" value={filtered.length} onClick={()=>open({type,query})} hint="Lihat semua data" />
      <Stat label="Uploaded" value={stats.uploaded} onClick={()=>open({type,query,saveType:'uploaded'})} hint="Lihat yang sudah upload" />
      <Stat label="Draft / queue" value={stats.pending} onClick={()=>open({type,query,saveType:'pending'})} hint="Lihat yang belum upload" />
      <Stat label="Total area dikerjakan" value={`${stats.totalArea.toLocaleString('id-ID')} Ha`} onClick={()=>open({type,query})} hint="Akumulasi hasil input" />
      <Stat label="Spray area" value={`${stats.sprayArea.toLocaleString('id-ID')} Ha`} onClick={()=>open({type:'spray',query})} hint={`${stats.spray} record`} />
      <Stat label="Fertilizer area" value={`${stats.fertArea.toLocaleString('id-ID')} Ha`} onClick={()=>open({type:'fertilizer',query})} hint={`${stats.fert} record`} />
      <Stat label="Pupuk tercatat" value={`${stats.fertKg.toLocaleString('id-ID')} Kg`} onClick={()=>open({type:'fertilizer',query})} hint="Dari pengisian fertilizer" />
      <Stat label="Unit fertilizer" value={stats.units} onClick={()=>open({type:'fertilizer',query})} hint="Unit unik yang tercatat" />
    </div>
    <Card>
      <div className="qc-dashboard-heading">
        <h3>Luas yang Sudah Dikerjakan</h3>
        <Tag color={stats.pending ? 'warning' : 'success'}>{stats.pending ? `${stats.pending} belum uploaded` : 'Semua uploaded'}</Tag>
      </div>
      <Table rowKey="name" columns={columns} dataSource={activityRows} pagination={false}
        scroll={{ x: 520 }} size="small" locale={{ emptyText: 'Belum ada data.' }} />
    </Card>
  </section>
}

function Stat({ label, value, hint, onClick }: { label:string; value:number|string; hint?:string; onClick?:()=>void }) {
  return <Card size="small">
    <Statistic title={label} value={value} groupSeparator="." />
    {hint && <Button type="link" className="qc-activity-link" onClick={onClick} aria-label={`${label}: ${hint}`}>{hint}</Button>}
  </Card>
}
