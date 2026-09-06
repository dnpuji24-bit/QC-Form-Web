import { useMemo, useState } from 'react'
import { sendOrQueue } from './offline'
import type { MasterData, MaterialMaster, PlanMaster, QcRecord, User } from './types'

type Props = {
  token: string
  user: User
  master: MasterData
  initialRecords?: QcRecord[]
  onCancelEdit?: () => void
  onSaved: (records: QcRecord[]) => void
}

type Filling = {
  id: string
  pengisianKe: number
  dosis: string
  statusHose: string
  jenisPupuk: string
  jumlah: string
  hasilKerja: string
  pemerataanPupuk: string
}

type Downtime = {
  id: string
  issue: string
  start: string
  end: string
  note: string
}

type UnitCard = {
  id: string
  recordId?: string
  createdAt?: string
  photoDriveUrl?: string
  unit: string
  noUnit: string
  paddock: string
  type: string
  activity: string
  catatan: string
  photo?: File
  fillings: Filling[]
  downtime: Downtime[]
}

const today = () => new Date().toISOString().slice(0, 10)
const uid = () => crypto.randomUUID()
const num = (value: unknown) => Number(String(value ?? '').replace(',', '.')) || 0
const text = (value: unknown) => String(value ?? '')
const unique = (items: unknown[]) => [...new Set(items.map(String).map((x) => x.trim()).filter(Boolean))]

function newFilling(index = 1, source?: Partial<Filling>): Filling {
  return {
    id: uid(), pengisianKe: index,
    dosis: source?.dosis || '', statusHose: source?.statusHose || 'Lancar', jenisPupuk: source?.jenisPupuk || '',
    jumlah: '', hasilKerja: '', pemerataanPupuk: '',
  }
}
function newCard(): UnitCard {
  return { id: uid(), unit: '', noUnit: '', paddock: '', type: '', activity: '', catatan: '', fillings: [newFilling(1)], downtime: [] }
}
function cardFromRecord(record: QcRecord): UnitCard {
  const rawFills = Array.isArray(record.pengisianList) ? record.pengisianList as Record<string, unknown>[] : []
  const rawDowntime = Array.isArray(record.downtimeList) ? record.downtimeList as Record<string, unknown>[] : []
  const fillings = rawFills.length ? rawFills.map((f, i) => ({
    id: uid(), pengisianKe: Number(f.pengisianKe || i + 1), dosis: text(f.dosis ?? record.dosis),
    statusHose: text(f.statusHose ?? record.statusHose) || 'Lancar', jenisPupuk: text(f.jenisPupuk ?? record.jenisPupuk),
    jumlah: text(f.jumlah), hasilKerja: text(f.hasilKerja), pemerataanPupuk: text(f.pemerataanPupuk),
  })) : [{
    id: uid(), pengisianKe: 1, dosis: text(record.dosis), statusHose: text(record.statusHose) || 'Lancar',
    jenisPupuk: text(record.jenisPupuk), jumlah: text(record.jumlah), hasilKerja: text(record.hasilKerja), pemerataanPupuk: text(record.pemerataanPupuk),
  }]
  return {
    id: uid(), recordId: record.id, createdAt: text(record.createdAt), photoDriveUrl: text(record.photoDriveUrl),
    unit: text(record.unit), noUnit: text(record.noUnit), paddock: record.paddock || '', type: text(record.type), activity: text(record.activity),
    catatan: text(record.catatan || record.noted).replace(/\s*\|\s*\[UNIT BERHENTI\].*$/i, ''), fillings,
    downtime: rawDowntime.map((d) => ({ id: uid(), issue: text(d.issue), start: text(d.start), end: text(d.end), note: text(d.note) })),
  }
}

function normalizePlans(master: MasterData) {
  const raw = (master.plans || master.plan || []) as PlanMaster[]
  return raw.filter((p) => {
    const category = String(p.category || p.keterangan || '').trim().toLowerCase()
    if (category) return category === 'fertilizer' || category === 'fertiliser' || category === 'pupuk'
    return Boolean(p.paddock && (p.activity || p.type))
  })
}

async function photoData(file?: File): Promise<string> {
  if (!file) return ''
  if (file.size > 6_000_000) throw new Error('Foto asli maksimal 6 MB.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1400 / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Foto tidak dapat diproses.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  let quality = .72
  let result = canvas.toDataURL('image/jpeg', quality)
  while (result.length > 2_400_000 && quality > .42) { quality -= .08; result = canvas.toDataURL('image/jpeg', quality) }
  if (result.length > 2_700_000) throw new Error('Foto masih terlalu besar setelah kompresi.')
  return result
}

export default function FertilizerForm({ token, user, master, initialRecords = [], onCancelEdit, onSaved }: Props) {
  const firstInitial = initialRecords[0]
  const editing = initialRecords.length > 0
  const [sessionId] = useState(() => text(firstInitial?.sessionId) || `fertsession_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
  const [date, setDate] = useState(firstInitial?.date || today())
  const [shift, setShift] = useState(text(firstInitial?.shift) || '1')
  const [mandor, setMandor] = useState(text(firstInitial?.name))
  const [assistant, setAssistant] = useState(text(firstInitial?.nameOfAssistan))
  const [cards, setCards] = useState<UnitCard[]>(() => initialRecords.length ? initialRecords.map(cardFromRecord) : [newCard()])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const plans = useMemo(() => normalizePlans(master), [master])
  const paddocks = useMemo(() => unique(plans.map((p) => p.paddock)), [plans])
  const unitTypes = useMemo(() => Object.keys(master.unitMap || {}), [master.unitMap])
  const fertilizerNames = useMemo(() => unique(((master.materials || []) as MaterialMaster[]).map((m) => m.material)), [master.materials])
  const total = useMemo(() => {
    const totalKg = cards.reduce((sum, card) => sum + card.fillings.reduce((s, f) => s + num(f.jumlah), 0), 0)
    const totalHa = cards.reduce((sum, card) => sum + card.fillings.reduce((s, f) => s + num(f.hasilKerja), 0), 0)
    return { units: cards.filter((c) => c.noUnit || c.unit).length, totalKg, totalHa }
  }, [cards])

  function patchCard(id: string, patch: Partial<UnitCard>) { setCards((old) => old.map((card) => card.id === id ? { ...card, ...patch } : card)) }
  function patchFilling(cardId: string, fillingId: string, patch: Partial<Filling>) { setCards((old) => old.map((card) => card.id === cardId ? { ...card, fillings: card.fillings.map((f) => f.id === fillingId ? { ...f, ...patch } : f) } : card)) }
  function addFilling(cardId: string) { setCards((old) => old.map((card) => card.id === cardId ? { ...card, fillings: [...card.fillings, newFilling(card.fillings.length + 1, card.fillings[card.fillings.length - 1])] } : card)) }
  function removeFilling(cardId: string, fillingId: string) { setCards((old) => old.map((card) => card.id === cardId ? { ...card, fillings: card.fillings.filter((f) => f.id !== fillingId).map((f, i) => ({ ...f, pengisianKe: i + 1 })) } : card)) }
  function duplicateCard(card: UnitCard) {
    const copy: UnitCard = { ...card, id: uid(), recordId: undefined, createdAt: undefined, noUnit: '', photo: undefined, photoDriveUrl: undefined,
      fillings: card.fillings.map((f, i) => ({ ...f, id: uid(), pengisianKe: i + 1, jumlah: '', hasilKerja: '', pemerataanPupuk: '' })), downtime: [], catatan: '' }
    setCards((old) => [...old, copy])
  }
  function addDowntime(cardId: string) { setCards((old) => old.map((card) => card.id === cardId ? { ...card, downtime: [...card.downtime, { id: uid(), issue: '', start: '', end: '', note: '' }] } : card)) }
  function patchDowntime(cardId: string, downtimeId: string, patch: Partial<Downtime>) { setCards((old) => old.map((card) => card.id === cardId ? { ...card, downtime: card.downtime.map((d) => d.id === downtimeId ? { ...d, ...patch } : d) } : card)) }

  function validate() {
    if (!date || !mandor) return 'Tanggal dan Mandor wajib diisi.'
    if (!cards.length) return 'Tambahkan minimal satu unit.'
    const seen = new Set<string>()
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]
      if (!card.unit || !card.noUnit || !card.paddock || !card.activity) return `Unit Card ${i + 1}: lengkapi Unit, No. Unit, Paddock, dan Activity.`
      const key = `${card.unit}|${card.noUnit}`.toLowerCase()
      if (seen.has(key)) return `Unit Card ${i + 1}: ${card.noUnit} sudah digunakan pada card lain.`
      seen.add(key)
      if (!card.fillings.length) return `Unit Card ${i + 1}: minimal satu pengisian.`
      for (const fill of card.fillings) {
        if (!fill.jenisPupuk || num(fill.dosis) <= 0) return `Unit ${card.noUnit} Pengisian ${fill.pengisianKe}: Jenis Pupuk dan Dosis Target wajib diisi.`
        if (num(fill.jumlah) <= 0 || num(fill.hasilKerja) <= 0) return `Unit ${card.noUnit} Pengisian ${fill.pengisianKe}: Jumlah pupuk dan Hasil Kerja wajib lebih dari 0.`
      }
    }
    return ''
  }

  async function saveAll(saveType: 'draft' | 'ready') {
    const problem = validate()
    if (problem) return setMessage(problem)
    setBusy(true); setMessage('')
    try {
      const records: QcRecord[] = []
      let queued = 0
      for (const card of cards) {
        const downtimeText = card.downtime.filter((d) => d.issue || d.start || d.end || d.note).map((d) => `${d.issue || 'Issue'} ${d.start || '-'}-${d.end || '-'}${d.note ? `: ${d.note}` : ''}`).join(' | ')
        const catatan = [card.catatan.trim(), downtimeText ? `[UNIT BERHENTI] ${downtimeText}` : ''].filter(Boolean).join(' | ')
        const pengisianList = card.fillings.map((f) => ({ pengisianKe: f.pengisianKe, dosis: num(f.dosis), statusHose: f.statusHose, jenisPupuk: f.jenisPupuk, jumlah: num(f.jumlah), hasilKerja: num(f.hasilKerja), dosisAktual: num(f.hasilKerja) > 0 ? Math.round((num(f.jumlah) / num(f.hasilKerja)) * 100) / 100 : 0, pemerataanPupuk: f.pemerataanPupuk }))
        const first = pengisianList[0]
        const record: QcRecord = {
          id: card.recordId || `fert_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          sessionId, formType: 'fertilizer', date, shift, name: mandor, nameOfAssistan: assistant,
          status: 'Working', paddock: card.paddock, unit: card.unit, noUnit: card.noUnit, type: card.type || 'Fertilizer', activity: card.activity,
          jenisPupuk: first?.jenisPupuk || '', dosis: first?.dosis || 0, statusHose: first?.statusHose || '', pengisianList, downtimeList: card.downtime,
          catatan, noted: catatan, photoBase64: await photoData(card.photo), photoDriveUrl: card.photoDriveUrl || '', saveType,
          inputtedBy: user.username, createdAt: card.createdAt || new Date().toISOString(),
        }
        const result = await sendOrQueue(token, 'syncRecord', record)
        if (result.queued) queued += 1
        records.push(record)
      }
      onSaved(records)
      setMessage(queued ? `${records.length} unit tersimpan; ${queued} unit menunggu sinkronisasi.` : `${records.length} unit berhasil disimpan dalam Daily Session.`)
      if (!editing) setCards([newCard()])
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal menyimpan sesi Fertilizer.') }
    finally { setBusy(false) }
  }

  return <section>
    <div className="section-head"><div><div className="eyebrow">FERTILIZER DAILY SESSION</div><h2>{editing ? 'Edit Daily Session Fertilizer' : 'Input Fertilizer per Unit'}</h2><p className="muted">Session: {sessionId}</p></div><span className="badge">Unit-centric</span></div>
    {editing && <div className="alert">Mode edit: {initialRecords.length} Unit Card dibuka sebagai satu Daily Session. Record ID tiap unit tetap dipertahankan. Unit yang sudah tersimpan dihapus melalui Data QC, bukan hanya dikeluarkan dari card.</div>}
    <div className="panel session-bar">
      <label>Tanggal<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>Shift<select value={shift} onChange={(e) => setShift(e.target.value)}>{(master.shifts?.length ? master.shifts : ['1','2']).map((x) => <option key={x}>{x}</option>)}</select></label>
      <label>Mandor<select value={mandor} onChange={(e) => setMandor(e.target.value)}><option value="">Pilih…</option>{(master.names || []).map((x) => <option key={x}>{x}</option>)}</select></label>
      <label>Asisten<select value={assistant} onChange={(e) => setAssistant(e.target.value)}><option value="">Pilih…</option>{(master.assistants || []).map((x) => <option key={x}>{x}</option>)}</select></label>
    </div>
    <div className="mode-switch panel"><button className="primary" type="button">+ Input Manual</button><button type="button" disabled title="Disiapkan untuk tahap OCR tulisan tangan berikutnya">📷 Foto Laporan — segera</button><span className="muted">Unit Card mengikuti layout laporan kertas agar hasil OCR nanti dapat langsung dipetakan ke field yang sama.</span></div>
    {message && <div className="alert">{message}</div>}

    <div className="unit-card-list">{cards.map((card, index) => {
      const numbers = unique(card.unit ? (master.unitMap?.[card.unit] || []) : [])
      const activities = unique(plans.filter((p) => !card.paddock || String(p.paddock) === card.paddock).map((p) => p.activity))
      const matchingPlan = plans.find((p) => String(p.paddock) === card.paddock && String(p.activity) === card.activity)
      const cardKg = card.fillings.reduce((sum, f) => sum + num(f.jumlah), 0)
      const cardHa = card.fillings.reduce((sum, f) => sum + num(f.hasilKerja), 0)
      return <article className="unit-card" key={card.id}>
        <div className="unit-card-head"><div><div className="eyebrow">UNIT CARD {index + 1}</div><h3>{card.noUnit || 'Unit belum dipilih'}</h3><p>{card.paddock || 'Paddock -'} • {card.activity || 'Activity -'}{card.recordId ? ' • Draft tersimpan' : ''}</p></div><div className="row-actions"><button type="button" onClick={() => duplicateCard(card)}>Duplikat</button>{cards.length > 1 && !card.recordId && <button type="button" className="danger" onClick={() => setCards((old) => old.filter((x) => x.id !== card.id))}>Hapus Card</button>}</div></div>
        <div className="form-grid">
          <label>Jenis Unit<select value={card.unit} onChange={(e) => patchCard(card.id, { unit: e.target.value, noUnit: '' })}><option value="">Pilih…</option>{unitTypes.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>No. Unit<select value={card.noUnit} onChange={(e) => patchCard(card.id, { noUnit: e.target.value })}><option value="">Pilih…</option>{numbers.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Paddock<select value={card.paddock} onChange={(e) => patchCard(card.id, { paddock: e.target.value, activity: '', type: '' })}><option value="">Pilih…</option>{paddocks.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Activity<select value={card.activity} onChange={(e) => { const activity = e.target.value; const p = plans.find((x) => String(x.paddock) === card.paddock && String(x.activity) === activity); patchCard(card.id, { activity, type: String(p?.type || '') }) }}><option value="">Pilih…</option>{activities.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Type<input readOnly value={card.type || String(matchingPlan?.type || '')} /></label>
        </div>
        <section className="subpanel"><div className="section-head"><div><div className="eyebrow">PENGISIAN</div><h4>Riwayat pengisian unit</h4></div><button type="button" onClick={() => addFilling(card.id)}>+ Tambah Pengisian</button></div><div className="filling-list">{card.fillings.map((f) => {
          const actual = num(f.hasilKerja) > 0 ? num(f.jumlah) / num(f.hasilKerja) : 0
          return <div className="filling-row fertilizer-filling-row" key={f.id}><strong>#{f.pengisianKe}</strong><label>Dosis Target<input type="number" step=".01" value={f.dosis} onChange={(e) => patchFilling(card.id, f.id, { dosis: e.target.value })} /></label><label>Hose<select value={f.statusHose} onChange={(e) => patchFilling(card.id, f.id, { statusHose: e.target.value })}><option>Lancar</option><option>Tidak Lancar</option></select></label><label>Jenis Pupuk<input list={`fert-${card.id}`} value={f.jenisPupuk} onChange={(e) => { const value = e.target.value; const mat = (master.materials || []).find((m: MaterialMaster) => String(m.material) === value); patchFilling(card.id, f.id, { jenisPupuk: value, dosis: f.dosis || String(mat?.dosage || '') }) }} /><datalist id={`fert-${card.id}`}>{fertilizerNames.map((x) => <option value={x} key={x} />)}</datalist></label><label>Jumlah (Kg)<input type="number" step=".01" value={f.jumlah} onChange={(e) => patchFilling(card.id, f.id, { jumlah: e.target.value })} /></label><label>Hasil Kerja (Ha)<input type="number" step=".01" value={f.hasilKerja} onChange={(e) => patchFilling(card.id, f.id, { hasilKerja: e.target.value })} /></label><label>Dosis Aktual<input readOnly value={actual ? actual.toFixed(2) : ''} /></label><label>Meratakan Pupuk<select value={f.pemerataanPupuk} onChange={(e) => patchFilling(card.id, f.id, { pemerataanPupuk: e.target.value })}><option value="">Pilih…</option><option>1</option><option>2</option><option>3</option><option>4</option><option>&gt;4</option></select></label>{card.fillings.length > 1 && <button type="button" className="danger" onClick={() => removeFilling(card.id, f.id)}>×</button>}</div>
        })}</div></section>
        <section className="subpanel"><div className="section-head"><div><div className="eyebrow">WAKTU UNIT BERHENTI</div><h4>Issue / downtime</h4></div><button type="button" onClick={() => addDowntime(card.id)}>+ Tambah Issue</button></div>{card.downtime.map((d) => <div className="downtime-row" key={d.id}><input placeholder="Issue" value={d.issue} onChange={(e) => patchDowntime(card.id, d.id, { issue: e.target.value })} /><input type="time" value={d.start} onChange={(e) => patchDowntime(card.id, d.id, { start: e.target.value })} /><input type="time" value={d.end} onChange={(e) => patchDowntime(card.id, d.id, { end: e.target.value })} /><input placeholder="Catatan" value={d.note} onChange={(e) => patchDowntime(card.id, d.id, { note: e.target.value })} /><button type="button" className="danger" onClick={() => patchCard(card.id, { downtime: card.downtime.filter((x) => x.id !== d.id) })}>×</button></div>)}</section>
        <div className="form-grid"><label className="span-2">Catatan<textarea rows={3} value={card.catatan} onChange={(e) => patchCard(card.id, { catatan: e.target.value })} /></label><label>Foto QC<input type="file" accept="image/*" capture="environment" onChange={(e) => patchCard(card.id, { photo: e.target.files?.[0] })} />{card.photoDriveUrl && !card.photo && <small className="muted">Foto lama dipertahankan jika tidak diganti.</small>}</label></div>
        <div className="unit-summary"><span>Total Pupuk <strong>{cardKg.toLocaleString('id-ID')} Kg</strong></span><span>Total Hasil <strong>{cardHa.toLocaleString('id-ID')} Ha</strong></span><span>Dosis Rata-rata <strong>{cardHa ? (cardKg / cardHa).toFixed(2) : '0'} Kg/Ha</strong></span></div>
      </article>
    })}</div>
    <button type="button" className="add-unit-button" onClick={() => setCards((old) => [...old, newCard()])}>+ Tambah Unit</button>
    <div className="panel session-summary"><div><span>Unit aktif</span><strong>{total.units}</strong></div><div><span>Total pupuk</span><strong>{total.totalKg.toLocaleString('id-ID')} Kg</strong></div><div><span>Total hasil</span><strong>{total.totalHa.toLocaleString('id-ID')} Ha</strong></div></div>
    <div className="form-actions">{editing && <button type="button" disabled={busy} onClick={onCancelEdit}>Batal Edit</button>}<button type="button" disabled={busy} onClick={() => void saveAll('draft')}>{editing ? 'Perbarui Draft Session' : 'Simpan Draft Semua Unit'}</button><button className="primary" type="button" disabled={busy} onClick={() => void saveAll('ready')}>{busy ? 'Menyimpan…' : editing ? 'Perbarui Session Siap Upload' : 'Simpan Semua Unit'}</button></div>
  </section>
}
