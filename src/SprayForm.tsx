import { FormEvent, useMemo, useState } from 'react'
import { qcApi } from './api'
import type { HoldInterval, MasterData, MaterialMaster, PlanMaster, QcRecord, User } from './types'

type Props = {
  token: string
  user: User
  master: MasterData
  onSaved: (record: QcRecord) => void
}

type SprayState = Record<string, string> & {
  date: string; shift: string; status: string; startTime: string; endTime: string
  name: string; nameOfAssistan: string; unit: string; noUnit: string; area: string
  activity: string; deskripsi: string; paddock: string; variety: string; type: string
  dropper: string; nozzle: string; dropletSize: string; height: string; rowSpacing: string; speed: string
  adjuvant: string; adjuvantDosage: string; actUsageAdjuvant: string; waterRate: string
  waterQuality: string; actualUsage: string; windSpeed: string; temperature: string; humidity: string
  deltaT: string; weatherCondition: string; noted: string
}

const today = () => new Date().toISOString().slice(0, 10)
const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
const n = (value: unknown) => Number(String(value ?? '').replace(',', '.')) || 0
const unique = (values: unknown[]) => [...new Set(values.map(String).map((x) => x.trim()).filter(Boolean))]

function initialState(user: User): SprayState {
  return {
    date: today(), shift: '1', status: 'Working', startTime: '', endTime: '', name: '', nameOfAssistan: '',
    unit: '', noUnit: '', area: '', activity: '', deskripsi: '', paddock: '', variety: '', type: '', dropper: 'No',
    nozzle: '', dropletSize: '', height: '', rowSpacing: '', speed: '', adjuvant: '', adjuvantDosage: '',
    actUsageAdjuvant: '', waterRate: '', waterQuality: '', actualUsage: '', windSpeed: '', temperature: '',
    humidity: '', deltaT: '', weatherCondition: '', noted: '', inputtedBy: user.username,
  }
}

function normalizePlans(master: MasterData): PlanMaster[] {
  const raw = (master.plans || master.plan || []) as PlanMaster[]
  return raw.filter((p) => {
    const category = String(p.category || p.keterangan || '').trim().toLowerCase()
    if (category) return category === 'spray'
    return Boolean(p.type || p.activity || p.description || p.deskripsi)
  })
}

function Choice({ values, value, onChange, multiple = false }: { values: string[]; value: string; onChange: (value: string) => void; multiple?: boolean }) {
  const selected = new Set(value.split(',').map((x) => x.trim()).filter(Boolean))
  return <div className="choice-group">{values.length ? values.map((item) => {
    const active = selected.has(item)
    return <button key={item} type="button" className={active ? 'selected' : ''} onClick={() => {
      if (!multiple) return onChange(item)
      const next = new Set(selected); active ? next.delete(item) : next.add(item); onChange([...next].join(', '))
    }}>{item}</button>
  }) : <span className="muted">Tidak ada pilihan</span>}</div>
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN
}

function durationLabel(value: number) {
  return `${Math.floor(value / 60)}j ${String(value % 60).padStart(2, '0')}m`
}

export default function SprayForm({ token, user, master, onSaved }: Props) {
  const [form, setForm] = useState<SprayState>(() => initialState(user))
  const [holds, setHolds] = useState<HoldInterval[]>([])
  const [actualMaterials, setActualMaterials] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const plans = useMemo(() => normalizePlans(master), [master])
  const activities = useMemo(() => unique(plans.map((p) => p.activity)), [plans])
  const descriptions = useMemo(() => unique(plans.filter((p) => String(p.activity) === form.activity).map((p) => p.description || p.deskripsi)), [plans, form.activity])
  const types = useMemo(() => unique(plans.filter((p) => String(p.activity) === form.activity && String(p.description || p.deskripsi) === form.deskripsi).map((p) => p.type)), [plans, form.activity, form.deskripsi])
  const candidatePlans = useMemo(() => plans.filter((p) => String(p.activity) === form.activity && String(p.description || p.deskripsi) === form.deskripsi && (!form.type || String(p.type) === form.type)), [plans, form.activity, form.deskripsi, form.type])
  const paddocks = useMemo(() => unique(candidatePlans.map((p) => p.paddock)), [candidatePlans])
  const varieties = useMemo(() => unique(candidatePlans.filter((p) => String(p.paddock) === form.paddock).map((p) => p.variety)), [candidatePlans, form.paddock])
  const materials = useMemo(() => ((master.materials || []) as MaterialMaster[])
    .filter((x) => String(x.description || '').trim() === form.deskripsi && /^Pesticide\s*[1-4]$/i.test(String(x.slot || '').trim()))
    .sort((a, b) => String(a.slot).localeCompare(String(b.slot))).slice(0, 4), [master.materials, form.deskripsi])
  const adjuvants = useMemo(() => unique(((master.materials || []) as MaterialMaster[])
    .filter((x) => /adjuvant/i.test(`${x.slot || ''} ${x.unit || ''} ${x.description || ''}`)).map((x) => x.material)), [master.materials])

  const units = Object.keys(master.unitMap || {})
  const unitNumbers = unique(form.unit.split(',').map((x) => x.trim()).filter(Boolean).flatMap((unit) => master.unitMap?.[unit] || []))
  const estimatedAdjuvant = ((n(form.adjuvantDosage) * n(form.waterRate) * n(form.area)) / 1000).toFixed(2)

  const timing = useMemo(() => {
    const start = minutes(form.startTime), end = minutes(form.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { ready: false, total: 0, working: 0, effective: 0, error: 'Isi jam mulai dan selesai dengan benar.' }
    const ranges: Array<[number, number]> = []
    for (const [i, h] of holds.entries()) {
      if (!h.start && !h.end) continue
      const a = minutes(h.start), b = minutes(h.end)
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return { ready: false, total: 0, working: end - start, effective: 0, error: `HOLD ${i + 1}: jam tidak valid.` }
      if (a < start || b > end) return { ready: false, total: 0, working: end - start, effective: 0, error: `HOLD ${i + 1}: harus berada dalam jam kerja.` }
      ranges.push([a, b])
    }
    ranges.sort((a, b) => a[0] - b[0])
    for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) return { ready: false, total: 0, working: end - start, effective: 0, error: 'Waktu HOLD tidak boleh bertumpuk.' }
    const total = ranges.reduce((sum, [a, b]) => sum + b - a, 0), working = end - start
    return { ready: true, total, working, effective: working - total, error: '' }
  }, [form.startTime, form.endTime, holds])

  function set(key: keyof SprayState, value: string) { setForm((old) => ({ ...old, [key]: value })) }
  function chooseActivity(value: string) {
    setForm((old) => ({ ...old, activity: value, deskripsi: '', paddock: '', variety: '', type: '' }))
    setActualMaterials({})
  }
  function chooseDescription(value: string) {
    const matchingTypes = unique(plans.filter((p) => String(p.activity) === form.activity && String(p.description || p.deskripsi) === value).map((p) => p.type))
    setForm((old) => ({ ...old, deskripsi: value, paddock: '', variety: '', type: matchingTypes.length === 1 ? matchingTypes[0] : '' }))
    setActualMaterials({})
  }
  function choosePaddock(value: string) {
    const match = candidatePlans.filter((p) => String(p.paddock) === value)
    const vars = unique(match.map((p) => p.variety))
    setForm((old) => ({ ...old, paddock: value, variety: vars.length === 1 ? vars[0] : '' }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const saveType = submitter?.value || 'draft'
    if (!form.activity || !form.deskripsi || !form.paddock || !form.variety || !form.type) return setMessage('Lengkapi Activity, Deskripsi, Paddock, Variety, dan Type.')
    if (!form.date || !form.name || n(form.area) <= 0) return setMessage('Tanggal, Mandor, dan Luas aktual wajib diisi.')
    if (!timing.ready) return setMessage(timing.error)
    setBusy(true); setMessage('')
    try {
      const record: QcRecord = {
        ...form,
        id: `qc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        formType: 'spray', saveType, inputtedBy: user.username, createdAt: new Date().toISOString(),
        estUsageAdjuvant: estimatedAdjuvant,
        holdIntervals: holds,
        workingDurationMinutes: timing.working, holdTotalMinutes: timing.total, effectiveWorkingMinutes: timing.effective,
      }
      for (let i = 0; i < 4; i++) {
        const item = materials[i]
        record[`pesticide${i + 1}`] = item?.material || ''
        record[`dosage${i + 1}`] = item?.dosage || ''
        record[`estUsagePesticide${i + 1}`] = item ? (n(item.dosage) * n(form.area)).toFixed(2) : ''
        record[`actUsagePesticide${i + 1}`] = actualMaterials[i] || ''
      }
      await qcApi.syncRecord(token, record)
      onSaved(record)
      setForm(initialState(user)); setHolds([]); setActualMaterials({})
      setMessage('Data Spraying tersimpan dan tersinkron.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal menyimpan data Spraying') }
    finally { setBusy(false) }
  }

  return <section>
    <div className="section-head"><div><div className="eyebrow">INPUT LAPANGAN</div><h2>Form QC Spraying</h2></div><span className="badge">React + TypeScript</span></div>
    {message && <div className="alert">{message}</div>}
    <form className="stack" onSubmit={(e) => void submit(e)}>
      <div className="panel form-grid">
        <label>Tanggal<input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required /></label>
        <fieldset><legend>Shift</legend><Choice values={master.shifts?.length ? master.shifts : ['1','2']} value={form.shift} onChange={(v) => set('shift', v)} /></fieldset>
        <fieldset><legend>Status</legend><Choice values={master.statuses?.length ? master.statuses : ['Working','Hold']} value={form.status} onChange={(v) => set('status', v)} /></fieldset>
        <label>Jam mulai<div className="inline-field"><input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} /><button type="button" onClick={() => set('startTime', nowTime())}>Saat ini</button></div></label>
        <label>Jam selesai<div className="inline-field"><input type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} /><button type="button" onClick={() => set('endTime', nowTime())}>Saat ini</button></div></label>
        <label>Mandor<select value={form.name} onChange={(e) => set('name', e.target.value)} required><option value="">Pilih…</option>{(master.names || []).map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Asisten<select value={form.nameOfAssistan} onChange={(e) => set('nameOfAssistan', e.target.value)}><option value="">Pilih…</option>{(master.assistants || []).map((x) => <option key={x}>{x}</option>)}</select></label>
        <fieldset className="span-2"><legend>Unit — bisa lebih dari satu</legend><Choice values={units} value={form.unit} multiple onChange={(v) => { set('unit', v); set('noUnit', '') }} /></fieldset>
        <fieldset className="span-2"><legend>No. Unit</legend><Choice values={unitNumbers} value={form.noUnit} multiple onChange={(v) => set('noUnit', v)} /></fieldset>
        <label>Luas aktual (Ha)<input type="number" step=".01" min="0" value={form.area} onChange={(e) => set('area', e.target.value)} required /><small className="muted">Diisi manual sesuai luas pekerjaan aktual. Luas pada sheet Plan tidak dipakai untuk mengisi field ini.</small></label>
      </div>

      <div className="panel stack">
        <h3>Program & Paddock</h3>
        <fieldset><legend>Activity</legend><Choice values={activities} value={form.activity} onChange={chooseActivity} /></fieldset>
        <fieldset><legend>Deskripsi</legend><Choice values={descriptions} value={form.deskripsi} onChange={chooseDescription} /></fieldset>
        <fieldset><legend>Type</legend><Choice values={types} value={form.type} onChange={(v) => setForm((old) => ({ ...old, type: v, paddock: '', variety: '' }))} /></fieldset>
        <fieldset><legend>Paddock</legend><Choice values={paddocks} value={form.paddock} onChange={choosePaddock} /></fieldset>
        <fieldset><legend>Variety</legend><Choice values={varieties} value={form.variety} onChange={(v) => set('variety', v)} /></fieldset>
        <div className="form-grid">
          <fieldset><legend>Dropper</legend><Choice values={master.dropper?.length ? master.dropper : ['Yes','No']} value={form.dropper} onChange={(v) => set('dropper', v)} /></fieldset>
          <fieldset className="span-2"><legend>Nozzle</legend><Choice values={master.nozzles || []} value={form.nozzle} onChange={(v) => set('nozzle', v)} /></fieldset>
          <label>Droplet Size (µm)<input type="number" value={form.dropletSize} onChange={(e) => set('dropletSize', e.target.value)} /></label>
          <label>Height (m)<input type="number" step=".01" value={form.height} onChange={(e) => set('height', e.target.value)} /></label>
          <label>Row Spacing (m)<input type="number" step=".01" value={form.rowSpacing} onChange={(e) => set('rowSpacing', e.target.value)} /></label>
          <label>Speed (km/jam)<input type="number" step=".01" value={form.speed} onChange={(e) => set('speed', e.target.value)} /></label>
        </div>
      </div>

      <div className="panel stack"><h3>Bahan Kimia Otomatis</h3><p className="muted">Estimated Usage dihitung otomatis: Dosis/Ha × Luas aktual.</p>
        <div className="material-grid">{materials.length ? materials.map((item, i) => <article className="material-card" key={`${item.slot}-${i}`}><strong>{item.slot}<br />{item.material} <small>({item.unit || '-'})</small></strong><label>Dosis/Ha<input readOnly value={String(item.dosage || '')} /></label><label>Estimated Usage<input readOnly value={(n(item.dosage) * n(form.area)).toFixed(2)} /></label><label>Actual Used<input type="number" step=".001" value={actualMaterials[i] || ''} onChange={(e) => setActualMaterials((old) => ({ ...old, [i]: e.target.value }))} /></label></article>) : <p className="muted">Pilih Deskripsi untuk memuat Pesticide 1–4.</p>}</div>
      </div>

      <div className="panel stack"><h3>Adjuvant & Kondisi Lapangan</h3><div className="form-grid">
        <label>Nama adjuvant<input list="adjuvants" value={form.adjuvant} onChange={(e) => set('adjuvant', e.target.value)} /><datalist id="adjuvants">{adjuvants.map((x) => <option value={x} key={x} />)}</datalist></label>
        <label>Dosis Adjuvant (mL/L)<input type="number" step=".01" value={form.adjuvantDosage} onChange={(e) => set('adjuvantDosage', e.target.value)} /></label>
        <label>Estimated Adjuvant (L)<input readOnly value={estimatedAdjuvant} /><small className="muted">Otomatis: dosis mL/L × water rate × luas aktual ÷ 1.000.</small></label>
        <label>Actual Adjuvant (L)<input type="number" step=".01" value={form.actUsageAdjuvant} onChange={(e) => set('actUsageAdjuvant', e.target.value)} /></label>
        <label>Water Rate (L/Ha)<input type="number" step=".01" value={form.waterRate} onChange={(e) => set('waterRate', e.target.value)} /></label>
        <fieldset className="span-2"><legend>Water Quality</legend><Choice values={master.waterQualities || []} value={form.waterQuality} onChange={(v) => set('waterQuality', v)} /></fieldset>
        <label>Actual Usage Air (L)<input type="number" step=".01" value={form.actualUsage} onChange={(e) => set('actualUsage', e.target.value)} /></label>
        <label>Wind Speed (km/jam)<input type="number" step=".01" value={form.windSpeed} onChange={(e) => set('windSpeed', e.target.value)} /></label>
        <label>Temperature (°C)<input type="number" step=".01" value={form.temperature} onChange={(e) => set('temperature', e.target.value)} /></label>
        <label>Humidity (%)<input type="number" step=".01" value={form.humidity} onChange={(e) => set('humidity', e.target.value)} /></label>
        <label>Delta T (°C)<input type="number" step=".01" value={form.deltaT} onChange={(e) => set('deltaT', e.target.value)} /></label>
        <fieldset className="span-2"><legend>Weather Condition</legend><Choice values={master.weatherConditions || []} value={form.weatherCondition} onChange={(v) => set('weatherCondition', v)} /></fieldset>
      </div></div>

      <div className="panel stack"><div className="section-head"><div><div className="eyebrow">REKAP WAKTU</div><h3>Working & HOLD</h3></div><button type="button" onClick={() => setHolds((old) => [...old, { start: '', end: '', reason: '', windSpeed: '', note: '' }])}>+ Tambah HOLD</button></div>
        {timing.ready ? <div className="stats-grid"><Stat label="Working" value={durationLabel(timing.working)} /><Stat label="HOLD" value={durationLabel(timing.total)} /><Stat label="Efektif" value={durationLabel(timing.effective)} /></div> : <div className="alert">{timing.error}</div>}
        {holds.map((hold, i) => <div className="hold-row-react" key={i}><strong>HOLD {i + 1}</strong><input type="time" value={hold.start} onChange={(e) => setHolds((old) => old.map((h, x) => x === i ? { ...h, start: e.target.value } : h))} /><input type="time" value={hold.end} onChange={(e) => setHolds((old) => old.map((h, x) => x === i ? { ...h, end: e.target.value } : h))} /><input placeholder="Alasan HOLD" value={hold.reason} onChange={(e) => setHolds((old) => old.map((h, x) => x === i ? { ...h, reason: e.target.value } : h))} /><input type="number" step=".1" placeholder="Angin km/jam" value={hold.windSpeed} onChange={(e) => setHolds((old) => old.map((h, x) => x === i ? { ...h, windSpeed: e.target.value } : h))} /><button type="button" className="danger" onClick={() => setHolds((old) => old.filter((_, x) => x !== i))}>×</button></div>)}
      </div>

      <div className="panel"><label>Catatan<textarea rows={3} value={form.noted} onChange={(e) => set('noted', e.target.value)} /></label></div>
      <div className="form-actions"><button type="button" onClick={() => { setForm(initialState(user)); setHolds([]); setActualMaterials({}); setMessage('') }}>Bersihkan</button><button type="submit" name="saveType" value="draft" disabled={busy}>Simpan Draft</button><button className="primary" type="submit" name="saveType" value="ready" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan Data QC'}</button></div>
    </form>
  </section>
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="stat"><span>{label}</span><strong>{value}</strong></div> }
