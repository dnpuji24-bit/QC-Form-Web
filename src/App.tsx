import { FormEvent, useEffect, useMemo, useState } from 'react'
import { getApiUrl, qcApi, setApiUrl } from './api'
import { discardQueuedRecord, sendOrQueue } from './offline'
import SprayForm from './SprayForm'
import FertilizerForm from './FertilizerForm'
import OperationalDashboard from './OperationalDashboard'
import { ActivityLogs, UsersApproval } from './AdminPages'
import type { MasterData, QcRecord, User } from './types'

type View = 'dashboard' | 'spray' | 'fertilizer' | 'records' | 'users' | 'logs' | 'settings'
type RecordPreset = { type?: 'all'|'spray'|'fertilizer'; query?: string; saveType?: string; date?: string; mandor?: string }
const TOKEN_KEY = 'qc_token'
const USER_KEY = 'qc_user'
const MASTER_KEY = 'qc_master_react'

function readUser(): User | null { try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null') as User | null } catch { return null } }
function readMaster(): MasterData { try { return JSON.parse(localStorage.getItem(MASTER_KEY) || '{}') as MasterData } catch { return {} } }
function canSpray(user: User) { return ['owner', 'asisten', 'mandor_spraying'].includes(user.role) }
function canFertilizer(user: User) { return ['owner', 'asisten', 'mandor_fertilizer'].includes(user.role) }
function canDelete(user: User) { return ['owner', 'manager', 'admin', 'asisten'].includes(user.role) }
function canLogs(user: User) { return ['owner', 'manager', 'admin', 'asisten'].includes(user.role) }
function canEditSpray(user: User, record: QcRecord) {
  if (!canSpray(user) || record.formType !== 'spray' || record.saveType === 'upload_queued') return false
  return user.role !== 'mandor_spraying' || record.inputtedBy === user.username
}
function canEditFertilizer(user: User, record: QcRecord) {
  if (!canFertilizer(user) || record.formType !== 'fertilizer' || record.saveType === 'upload_queued') return false
  return user.role !== 'mandor_fertilizer' || record.inputtedBy === user.username
}
function canFinalize(user: User, record: QcRecord) {
  if (record.saveType === 'uploaded' || record.saveType === 'upload_queued') return false
  if (record.formType === 'spray') return canSpray(user) && (user.role !== 'mandor_spraying' || record.inputtedBy === user.username)
  return canFertilizer(user) && (user.role !== 'mandor_fertilizer' || record.inputtedBy === user.username)
}
function sameFertilizerSession(a: QcRecord, b: QcRecord) {
  if (a.formType !== 'fertilizer' || b.formType !== 'fertilizer') return false
  const aSession = String(a.sessionId || '')
  const bSession = String(b.sessionId || '')
  return aSession && bSession ? aSession === bSession : a.id === b.id
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [user, setUser] = useState<User | null>(() => readUser())
  const [records, setRecords] = useState<QcRecord[]>([])
  const [master, setMaster] = useState<MasterData>(() => readMaster())
  const [view, setView] = useState<View>('dashboard')
  const [editingRecord, setEditingRecord] = useState<QcRecord | null>(null)
  const [editingFertilizerRecords, setEditingFertilizerRecords] = useState<QcRecord[]>([])
  const [recordPreset, setRecordPreset] = useState<RecordPreset>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { if (token && user) void refreshSession() }, [])

  async function refreshSession() {
    try {
      const result = await qcApi.me(token)
      if (result.user) { setUser(result.user); sessionStorage.setItem(USER_KEY, JSON.stringify(result.user)) }
      await Promise.all([refreshRecords(), refreshMaster()])
    } catch { clearSession() }
  }
  async function refreshMaster() {
    if (!token) return
    try {
      const result = await qcApi.masterData(token)
      if (result.data) { setMaster(result.data); localStorage.setItem(MASTER_KEY, JSON.stringify(result.data)) }
    } catch (error) { if (!Object.keys(master).length) setMessage(error instanceof Error ? error.message : 'Master data gagal dimuat') }
  }
  async function refreshRecords() {
    if (!token) return
    setBusy(true); setMessage('')
    try {
      const result = await qcApi.records(token)
      setRecords((result.records || (Array.isArray(result.data) ? result.data : [])) as QcRecord[])
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal memuat data') }
    finally { setBusy(false) }
  }
  function saveSession(nextToken: string, nextUser: User) {
    setToken(nextToken); setUser(nextUser)
    sessionStorage.setItem(TOKEN_KEY, nextToken); sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser))
    queueMicrotask(() => { void refreshAfterLogin(nextToken) })
  }
  async function refreshAfterLogin(nextToken: string) {
    try {
      const [recordResult, masterResult] = await Promise.all([qcApi.records(nextToken), qcApi.masterData(nextToken)])
      setRecords((recordResult.records || recordResult.data || []) as QcRecord[])
      if (masterResult.data) { setMaster(masterResult.data); localStorage.setItem(MASTER_KEY, JSON.stringify(masterResult.data)) }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Data awal gagal dimuat') }
  }
  function clearSession() {
    setToken(''); setUser(null); setRecords([]); setEditingRecord(null); setEditingFertilizerRecords([])
    sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY)
  }
  async function logout() { try { if (token) await qcApi.logout(token) } catch { /* clear regardless */ } clearSession() }

  function handleSpraySaved(record: QcRecord) {
    setRecords((old) => [record, ...old.filter((x) => x.id !== record.id)])
    setEditingRecord(null)
  }
  function handleFertilizerSaved(nextRecords: QcRecord[]) {
    setRecords((old) => [...nextRecords, ...old.filter((existing) => !nextRecords.some((record) => record.id === existing.id))])
    setEditingFertilizerRecords([])
  }
  function startEdit(record: QcRecord) {
    if (!user) return
    if (record.formType === 'spray') {
      if (!canEditSpray(user, record)) return
      setEditingRecord(record); setEditingFertilizerRecords([]); setView('spray')
      setMessage(record.saveType === 'uploaded' ? 'Mode koreksi data uploaded aktif. Simpan akan memperbarui baris Spreadsheet dengan Record ID yang sama.' : 'Mode edit Spraying aktif. Record ID tetap dipertahankan.')
      return
    }
    if (!canEditFertilizer(user, record)) return
    const group = records.filter((item) => sameFertilizerSession(record, item) && canEditFertilizer(user, item))
    setEditingRecord(null); setEditingFertilizerRecords(group.length ? group : [record]); setView('fertilizer')
    setMessage(record.saveType === 'uploaded' ? `Mode koreksi session uploaded aktif: ${group.length || 1} unit.` : `Mode edit Daily Session Fertilizer aktif: ${group.length || 1} unit dibuka bersama.`)
  }
  function openRecords(preset: RecordPreset = {}) { setRecordPreset({ ...preset }); setView('records') }

  async function finalize(record: QcRecord) {
    const targets = record.formType === 'fertilizer' ? records.filter((item) => sameFertilizerSession(record, item) && canFinalize(user!, item)) : [record]
    if (!targets.length) return
    setBusy(true); setMessage('')
    let queued = 0, completed = 0, failed = 0, lastError = ''
    for (const target of targets) {
      try {
        const result = await sendOrQueue(token, 'finalizeRecord', { ...target, saveType: 'ready' })
        if (result.queued) queued += 1
        const next: QcRecord = { ...target, saveType: result.queued ? 'upload_queued' : 'uploaded' }
        setRecords((old) => old.map((item) => item.id === target.id ? next : item))
        completed += 1
      } catch (error) {
        failed += 1; lastError = error instanceof Error ? error.message : 'Upload unit gagal'
        if (/sesi|login|izin|auth/i.test(lastError)) break
      }
    }
    if (record.formType === 'fertilizer') {
      const parts = [`${completed} dari ${targets.length} unit diproses`]
      if (queued) parts.push(`${queued} menunggu jaringan`)
      if (failed) parts.push(`${failed} gagal${lastError ? `: ${lastError}` : ''}`)
      setMessage(parts.join('; ') + '.')
    } else setMessage(failed ? lastError : queued ? 'Upload masuk antrean dan akan dikirim saat online.' : 'Data berhasil di-upload ke Form QC Spray.')
    setBusy(false)
  }

  async function remove(record: QcRecord) {
    if (!user || !canDelete(user)) return
    if (!window.confirm(`Hapus record ${record.paddock} (${record.date})?`)) return
    if (!navigator.onLine) { setMessage('Penghapusan membutuhkan koneksi internet agar konsisten dengan Spreadsheet.'); return }
    setBusy(true); setMessage('')
    try {
      await qcApi.deleteRecord(token, record.id)
      discardQueuedRecord(record.id)
      setRecords((old) => old.filter((item) => item.id !== record.id))
      if (editingRecord?.id === record.id) setEditingRecord(null)
      setEditingFertilizerRecords((old) => old.filter((item) => item.id !== record.id))
      setMessage('Record berhasil dihapus.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Hapus record gagal') }
    finally { setBusy(false) }
  }

  if (!token || !user) return <AuthScreen onLogin={saveSession} />
  return <div className="app-shell">
    <header className="topbar"><div><div className="eyebrow">QUALITY CONTROL</div><h1>QC Form Web</h1></div><div className="user-box"><div><strong>{user.fullName}</strong><span>{user.role.replaceAll('_', ' ')}</span></div><button className="ghost" onClick={() => void logout()}>Keluar</button></div></header>
    <nav className="tabs" aria-label="Navigasi utama">
      <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>Dashboard</button>
      {canSpray(user) && <button className={view === 'spray' ? 'active' : ''} onClick={() => { setEditingRecord(null); setEditingFertilizerRecords([]); setView('spray') }}>Input Spraying</button>}
      {canFertilizer(user) && <button className={view === 'fertilizer' ? 'active' : ''} onClick={() => { setEditingFertilizerRecords([]); setEditingRecord(null); setView('fertilizer') }}>Input Fertilizer</button>}
      <button className={view === 'records' ? 'active' : ''} onClick={() => openRecords({})}>Data QC</button>
      {user.role === 'owner' && <button className={view === 'users' ? 'active' : ''} onClick={() => setView('users')}>Users</button>}
      {canLogs(user) && <button className={view === 'logs' ? 'active' : ''} onClick={() => setView('logs')}>Activity Logs</button>}
      <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}>Pengaturan</button>
    </nav>
    <main className="content">
      {message && <div className="alert">{message}</div>}
      {view === 'dashboard' && <OperationalDashboard records={records} master={master} loading={busy} onRefresh={() => void Promise.all([refreshRecords(), refreshMaster()])} onOpenRecords={openRecords} />}
      {view === 'spray' && canSpray(user) && <SprayForm key={editingRecord?.id || 'new'} token={token} user={user} master={master} initialRecord={editingRecord || undefined} onCancelEdit={() => { setEditingRecord(null); setView('records') }} onSaved={handleSpraySaved} />}
      {view === 'fertilizer' && canFertilizer(user) && <FertilizerForm key={String(editingFertilizerRecords[0]?.sessionId || editingFertilizerRecords[0]?.id || 'new-fert')} token={token} user={user} master={master} initialRecords={editingFertilizerRecords} onCancelEdit={() => { setEditingFertilizerRecords([]); setView('records') }} onSaved={handleFertilizerSaved} />}
      {view === 'records' && <Records records={records} user={user} loading={busy} preset={recordPreset} onRefresh={() => void refreshRecords()} onEdit={startEdit} onDelete={(r) => void remove(r)} onFinalize={(r) => void finalize(r)} />}
      {view === 'users' && user.role === 'owner' && <UsersApproval token={token} />}
      {view === 'logs' && canLogs(user) && <ActivityLogs token={token} />}
      {view === 'settings' && <Settings />}
    </main>
  </div>
}

function AuthScreen({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login'); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('')
  async function login(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setMessage(''); try { const result = await qcApi.login(String(data.get('username') || ''), String(data.get('password') || '')); if (!result.token || !result.user) throw new Error('Respons login tidak lengkap'); onLogin(result.token, result.user) } catch (error) { setMessage(error instanceof Error ? error.message : 'Login gagal') } finally { setBusy(false) } }
  async function register(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); setBusy(true); setMessage(''); try { const result = await qcApi.register(data); setMessage(result.message || 'Pendaftaran terkirim.'); form.reset(); setMode('login') } catch (error) { setMessage(error instanceof Error ? error.message : 'Pendaftaran gagal') } finally { setBusy(false) } }
  return <main className="auth-page"><section className="auth-card"><div className="brand-mark">QC</div><div className="eyebrow">PT. GLOBAL PAPUA ABADI</div><h1>QC Form Web</h1><p className="muted">Frontend React + TypeScript. Backend Google Apps Script dan data Spreadsheet tetap digunakan.</p><div className="segmented"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Masuk</button><button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Daftar</button></div>{message && <div className="alert">{message}</div>}{mode === 'login' ? <form className="form-stack" onSubmit={(event) => void login(event)}><label>Username atau email<input name="username" autoComplete="username" required /></label><label>Kata sandi<input name="password" type="password" autoComplete="current-password" minLength={4} required /></label><button className="primary" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button></form> : <form className="form-stack" onSubmit={(event) => void register(event)}><label>Nama lengkap<input name="fullName" minLength={3} required /></label><label>Username<input name="username" minLength={3} required /></label><label>Email<input name="email" type="email" required /></label><label>Role<select name="role" defaultValue="mandor_spraying"><option value="mandor_spraying">Mandor Spraying</option><option value="mandor_fertilizer">Mandor Fertilizer</option><option value="asisten">Asisten</option><option value="pengunjung">Pengunjung</option></select></label><label>Kata sandi<input name="password" type="password" minLength={8} required /></label><button className="primary" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim pendaftaran'}</button></form>}</section></main>
}

function Records({ records, user, loading, preset, onRefresh, onFinalize, onEdit, onDelete }: { records: QcRecord[]; user: User; loading: boolean; preset: RecordPreset; onRefresh: () => void; onFinalize: (record: QcRecord) => void; onEdit: (record: QcRecord) => void; onDelete: (record: QcRecord) => void }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | 'spray' | 'fertilizer'>('all')
  const [date, setDate] = useState('')
  const [mandor, setMandor] = useState('')
  const [saveType, setSaveType] = useState('all')
  const [reportRecord, setReportRecord] = useState<QcRecord | null>(null)
  useEffect(() => { setQuery(preset.query || ''); setType(preset.type || 'all'); setDate(preset.date || ''); setMandor(preset.mandor || ''); setSaveType(preset.saveType || 'all') }, [preset])
  const mandors = useMemo(() => [...new Set(records.map((r) => String(r.name || '')).filter(Boolean))].sort(), [records])
  const filtered = useMemo(() => records.filter((record) => {
    if (type !== 'all' && record.formType !== type) return false
    if (date && record.date !== date) return false
    if (mandor && String(record.name || '') !== mandor) return false
    if (saveType === 'uploaded' && record.saveType !== 'uploaded') return false
    if (saveType === 'pending' && record.saveType === 'uploaded') return false
    return `${record.date} ${record.paddock} ${record.name || ''} ${String(record.noUnit || '')} ${String(record.activity || '')} ${record.status || ''}`.toLowerCase().includes(query.toLowerCase())
  }), [records, query, type, date, mandor, saveType])
  function sessionSize(record: QcRecord) { return record.formType === 'fertilizer' ? records.filter((item) => sameFertilizerSession(record, item)).length : 1 }
  function pendingSessionSize(record: QcRecord) { return record.formType === 'fertilizer' ? records.filter((item) => sameFertilizerSession(record, item) && canFinalize(user,item)).length : 1 }
  return <section><div className="section-head"><div><div className="eyebrow">MONITORING</div><h2>Data QC</h2></div><button className="secondary" onClick={onRefresh} disabled={loading}>{loading ? 'Memuat…' : 'Refresh'}</button></div>
    <div className="record-filters"><input placeholder="Cari paddock, unit, activity, status…" value={query} onChange={(e) => setQuery(e.target.value)} /><select value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="all">Semua jenis</option><option value="spray">Spraying</option><option value="fertilizer">Fertilizer</option></select><input type="date" value={date} onChange={(e)=>setDate(e.target.value)} /><select value={mandor} onChange={(e)=>setMandor(e.target.value)}><option value="">Semua mandor</option>{mandors.map((x)=><option key={x}>{x}</option>)}</select><select value={saveType} onChange={(e)=>setSaveType(e.target.value)}><option value="all">Semua status simpan</option><option value="uploaded">Uploaded</option><option value="pending">Draft / queue</option></select><button type="button" onClick={()=>{setQuery('');setType('all');setDate('');setMandor('');setSaveType('all')}}>Reset Filter</button></div>
    <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Paddock / Unit</th><th>Activity</th><th>Mandor</th><th>Simpan</th><th>Aksi</th></tr></thead><tbody>{filtered.map((record) => {
      const size = sessionSize(record), pendingSize = pendingSessionSize(record)
      const editable = record.formType === 'spray' ? canEditSpray(user, record) : canEditFertilizer(user, record)
      return <tr key={record.id}><td>{record.date}</td><td>{record.formType}{record.formType === 'fertilizer' && size > 1 ? ` • session ${size} unit` : ''}</td><td>{record.paddock}{record.formType === 'fertilizer' && record.noUnit ? ` / ${String(record.noUnit)}` : ''}</td><td>{String(record.activity || '-')}</td><td>{record.name || '-'}</td><td><span className={`status-pill ${record.saveType==='uploaded'?'success':'warning'}`}>{record.saveType || '-'}</span></td><td><div className="row-actions">{editable && <button onClick={() => onEdit(record)}>{record.saveType === 'uploaded' ? 'Koreksi' : record.formType === 'fertilizer' ? 'Edit Session' : 'Edit'}</button>}<button onClick={()=>setReportRecord(record)}>Laporan</button>{canFinalize(user, record) && <button className="primary" disabled={loading} onClick={() => onFinalize(record)}>{record.formType === 'fertilizer' && pendingSize > 1 ? `Upload ${pendingSize} Unit` : 'Upload'}</button>}{canDelete(user) && <button className="danger" disabled={loading} onClick={() => onDelete(record)}>Hapus</button>}</div></td></tr>
    })}{!filtered.length && <tr><td colSpan={7} className="empty">Belum ada data yang cocok.</td></tr>}</tbody></table></div>{reportRecord && <RecordReport record={reportRecord} onClose={()=>setReportRecord(null)} />}</section>
}

function RecordReport({ record, onClose }: { record: QcRecord; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const safeName = `QC_${record.formType}_${record.date}_${record.paddock}`.replace(/[^a-z0-9_-]/gi,'_')
  const rows: Array<[string,string]> = [
    ['Tanggal', record.date || '-'], ['Jenis Form', record.formType], ['Status Simpan', String(record.saveType || '-')], ['Mandor', String(record.name || '-')],
    ['Asisten', String(record.nameOfAssistan || '-')], ['Paddock', String(record.paddock || '-')], ['Activity', String(record.activity || '-')], ['Type', String(record.type || '-')],
    ['Unit', String(record.unit || '-')], ['No. Unit', String(record.noUnit || '-')], ['Luas / Hasil', record.formType === 'spray' ? `${String(record.area || 0)} Ha` : `${String(record.hasilKerja || '')} Ha`],
    ['Catatan', String(record.noted || record.catatan || '-')], ['Record ID', record.id]
  ]
  async function canvas() { const el=document.getElementById('record-report-sheet'); if(!el) throw new Error('Laporan tidak ditemukan'); const mod=await import('html2canvas'); return mod.default(el,{scale:2,backgroundColor:'#ffffff'}) }
  async function jpg() { setBusy(true); try { const c=await canvas(); const a=document.createElement('a'); a.href=c.toDataURL('image/jpeg',.92); a.download=`${safeName}.jpg`; a.click() } finally { setBusy(false) } }
  async function pdf() { setBusy(true); try { const c=await canvas(); const { jsPDF }=await import('jspdf'); const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'}); const w=190, h=c.height*w/c.width; doc.addImage(c.toDataURL('image/jpeg',.92),'JPEG',10,10,w,Math.min(h,277)); doc.save(`${safeName}.pdf`) } finally { setBusy(false) } }
  return <div className="report-backdrop" role="dialog" aria-modal="true"><div className="report-dialog"><div className="report-toolbar"><strong>Preview Laporan QC</strong><div className="row-actions"><button disabled={busy} onClick={()=>void jpg()}>JPG</button><button className="primary" disabled={busy} onClick={()=>void pdf()}>PDF</button><button onClick={onClose}>Tutup</button></div></div><article id="record-report-sheet" className="report-sheet"><div className="report-title"><div><small>PT. GLOBAL PAPUA ABADI</small><h2>Laporan Quality Control</h2></div><strong>{record.formType === 'spray' ? 'SPRAYING' : 'FERTILIZER'}</strong></div><div className="report-grid">{rows.map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>{record.formType==='fertilizer' && Array.isArray(record.pengisianList) && <div className="report-section"><h3>Pengisian Fertilizer</h3>{(record.pengisianList as Array<Record<string,unknown>>).map((f,i)=><p key={i}>#{String(f.pengisianKe || i+1)} • {String(f.jenisPupuk || '-')} • {String(f.jumlah || 0)} Kg • {String(f.hasilKerja || 0)} Ha • Dosis {String(f.dosisAktual || f.dosis || '-')} Kg/Ha</p>)}</div>}{record.formType==='spray' && Array.isArray(record.holdIntervals) && record.holdIntervals.length>0 && <div className="report-section"><h3>HOLD / Issue</h3>{record.holdIntervals.map((h,i)=><p key={i}>HOLD {i+1}: {h.start || '-'}–{h.end || '-'} • {h.reason || '-'} {h.note ? `• ${h.note}` : ''}</p>)}</div>}<div className="report-footer">Dibuat dari QC Form Web • {new Date().toLocaleString('id-ID')}</div></article></div></div>
}

function Settings() {
  const [url, setUrl] = useState(getApiUrl()); const [message, setMessage] = useState('')
  function save(event: FormEvent) { event.preventDefault(); try { setApiUrl(url.trim()); setMessage('URL Apps Script tersimpan di perangkat ini.') } catch (error) { setMessage(error instanceof Error ? error.message : 'URL tidak valid') } }
  return <section><div className="section-head"><div><div className="eyebrow">KONFIGURASI</div><h2>Pengaturan</h2></div></div><form className="panel form-stack" onSubmit={save}><label>Apps Script API URL<input value={url} onChange={(e) => setUrl(e.target.value)} /></label><p className="muted">Backend tetap menggunakan deployment <code>/exec</code> yang sama.</p>{message && <div className="alert">{message}</div>}<button className="primary">Simpan</button></form></section>
}
