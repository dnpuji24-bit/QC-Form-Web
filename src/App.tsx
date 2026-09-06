import { FormEvent, useEffect, useMemo, useState } from 'react'
import { getApiUrl, qcApi, setApiUrl } from './api'
import SprayForm from './SprayForm'
import type { MasterData, QcRecord, User } from './types'

type View = 'dashboard' | 'spray' | 'records' | 'settings'

const TOKEN_KEY = 'qc_token'
const USER_KEY = 'qc_user'
const MASTER_KEY = 'qc_master_react'

function readUser(): User | null {
  try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null') as User | null } catch { return null }
}
function readMaster(): MasterData {
  try { return JSON.parse(localStorage.getItem(MASTER_KEY) || '{}') as MasterData } catch { return {} }
}
function canSpray(user: User) { return ['owner', 'asisten', 'mandor_spraying'].includes(user.role) }

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [user, setUser] = useState<User | null>(() => readUser())
  const [records, setRecords] = useState<QcRecord[]>([])
  const [master, setMaster] = useState<MasterData>(() => readMaster())
  const [view, setView] = useState<View>('dashboard')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { if (token && user) void refreshSession() }, [])

  async function refreshSession() {
    try {
      const result = await qcApi.me(token)
      if (result.user) {
        setUser(result.user)
        sessionStorage.setItem(USER_KEY, JSON.stringify(result.user))
      }
      await Promise.all([refreshRecords(), refreshMaster()])
    } catch { clearSession() }
  }

  async function refreshMaster() {
    if (!token) return
    try {
      const result = await qcApi.masterData(token)
      if (result.data) {
        setMaster(result.data)
        localStorage.setItem(MASTER_KEY, JSON.stringify(result.data))
      }
    } catch (error) {
      if (!Object.keys(master).length) setMessage(error instanceof Error ? error.message : 'Master data gagal dimuat')
    }
  }

  async function refreshRecords() {
    if (!token) return
    setBusy(true); setMessage('')
    try {
      const result = await qcApi.records(token)
      const next = result.records || (Array.isArray(result.data) ? result.data : [])
      setRecords(next as QcRecord[])
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal memuat data') }
    finally { setBusy(false) }
  }

  function saveSession(nextToken: string, nextUser: User) {
    setToken(nextToken); setUser(nextUser)
    sessionStorage.setItem(TOKEN_KEY, nextToken)
    sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser))
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
    setToken(''); setUser(null); setRecords([])
    sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY)
  }

  async function logout() {
    try { if (token) await qcApi.logout(token) } catch { /* clear local session regardless */ }
    clearSession()
  }

  function handleSpraySaved(record: QcRecord) {
    setRecords((old) => [record, ...old.filter((x) => x.id !== record.id)])
  }

  if (!token || !user) return <AuthScreen onLogin={saveSession} />

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><div className="eyebrow">QUALITY CONTROL</div><h1>QC Form Web</h1></div>
        <div className="user-box"><div><strong>{user.fullName}</strong><span>{user.role.replaceAll('_', ' ')}</span></div><button className="ghost" onClick={() => void logout()}>Keluar</button></div>
      </header>

      <nav className="tabs" aria-label="Navigasi utama">
        <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>Dashboard</button>
        {canSpray(user) && <button className={view === 'spray' ? 'active' : ''} onClick={() => setView('spray')}>Input Spraying</button>}
        <button className={view === 'records' ? 'active' : ''} onClick={() => setView('records')}>Data QC</button>
        <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}>Pengaturan</button>
      </nav>

      <main className="content">
        {message && <div className="alert error">{message}</div>}
        {view === 'dashboard' && <Dashboard records={records} loading={busy} onRefresh={() => void Promise.all([refreshRecords(), refreshMaster()])} />}
        {view === 'spray' && canSpray(user) && <SprayForm token={token} user={user} master={master} onSaved={handleSpraySaved} />}
        {view === 'records' && <Records records={records} loading={busy} onRefresh={() => void refreshRecords()} />}
        {view === 'settings' && <Settings />}
      </main>
    </div>
  )
}

function AuthScreen({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setMessage('')
    try {
      const result = await qcApi.login(String(data.get('username') || ''), String(data.get('password') || ''))
      if (!result.token || !result.user) throw new Error('Respons login tidak lengkap')
      onLogin(result.token, result.user)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Login gagal') }
    finally { setBusy(false) }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); setBusy(true); setMessage('')
    try { const result = await qcApi.register(data); setMessage(result.message || 'Pendaftaran terkirim.'); form.reset(); setMode('login') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Pendaftaran gagal') }
    finally { setBusy(false) }
  }

  return <main className="auth-page"><section className="auth-card">
    <div className="brand-mark">QC</div><div className="eyebrow">PT. GLOBAL PAPUA ABADI</div><h1>QC Form Web</h1>
    <p className="muted">Frontend React + TypeScript. Backend Google Apps Script dan data Spreadsheet tetap digunakan.</p>
    <div className="segmented"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Masuk</button><button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Daftar</button></div>
    {message && <div className="alert">{message}</div>}
    {mode === 'login' ? <form className="form-stack" onSubmit={(event) => void login(event)}><label>Username atau email<input name="username" autoComplete="username" required /></label><label>Kata sandi<input name="password" type="password" autoComplete="current-password" minLength={4} required /></label><button className="primary" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button></form>
      : <form className="form-stack" onSubmit={(event) => void register(event)}><label>Nama lengkap<input name="fullName" minLength={3} required /></label><label>Username<input name="username" minLength={3} required /></label><label>Email<input name="email" type="email" required /></label><label>Role<select name="role" defaultValue="mandor_spraying"><option value="mandor_spraying">Mandor Spraying</option><option value="mandor_fertilizer">Mandor Fertilizer</option><option value="asisten">Asisten</option><option value="pengunjung">Pengunjung</option></select></label><label>Kata sandi<input name="password" type="password" minLength={8} required /></label><button className="primary" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim pendaftaran'}</button></form>}
  </section></main>
}

function Dashboard({ records, loading, onRefresh }: { records: QcRecord[]; loading: boolean; onRefresh: () => void }) {
  const summary = useMemo(() => {
    const spray = records.filter((record) => record.formType === 'spray').length
    const fertilizer = records.filter((record) => record.formType === 'fertilizer').length
    const draft = records.filter((record) => record.saveType !== 'uploaded').length
    const uploaded = records.filter((record) => record.saveType === 'uploaded').length
    return { spray, fertilizer, draft, uploaded }
  }, [records])
  return <section><div className="section-head"><div><div className="eyebrow">RINGKASAN</div><h2>Dashboard QC</h2></div><button className="secondary" onClick={onRefresh} disabled={loading}>{loading ? 'Memuat…' : 'Refresh'}</button></div><div className="stats-grid"><Stat label="Total record" value={records.length} /><Stat label="Spraying" value={summary.spray} /><Stat label="Fertilizer" value={summary.fertilizer} /><Stat label="Draft / sync" value={summary.draft} /><Stat label="Uploaded" value={summary.uploaded} /></div><div className="panel"><h3>Migrasi Spraying aktif</h3><p>Form Spraying React memakai endpoint dan format record yang sama dengan frontend lama. Backend dan Spreadsheet tidak diubah.</p></div></section>
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="stat"><span>{label}</span><strong>{value}</strong></div> }

function Records({ records, loading, onRefresh }: { records: QcRecord[]; loading: boolean; onRefresh: () => void }) {
  const [query, setQuery] = useState(''); const [type, setType] = useState<'all' | 'spray' | 'fertilizer'>('all')
  const filtered = useMemo(() => records.filter((record) => { if (type !== 'all' && record.formType !== type) return false; const text = `${record.date} ${record.paddock} ${record.name || ''} ${record.status || ''}`.toLowerCase(); return text.includes(query.toLowerCase()) }), [records, query, type])
  return <section><div className="section-head"><div><div className="eyebrow">MONITORING</div><h2>Data QC</h2></div><button className="secondary" onClick={onRefresh} disabled={loading}>{loading ? 'Memuat…' : 'Refresh'}</button></div><div className="filters"><input placeholder="Cari paddock, mandor, status…" value={query} onChange={(e) => setQuery(e.target.value)} /><select value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="all">Semua jenis</option><option value="spray">Spraying</option><option value="fertilizer">Fertilizer</option></select></div><div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Paddock</th><th>Mandor</th><th>Status</th><th>Simpan</th></tr></thead><tbody>{filtered.map((record) => <tr key={record.id}><td>{record.date}</td><td>{record.formType}</td><td>{record.paddock}</td><td>{record.name || '-'}</td><td>{record.status || '-'}</td><td>{record.saveType || '-'}</td></tr>)}{!filtered.length && <tr><td colSpan={6} className="empty">Belum ada data yang cocok.</td></tr>}</tbody></table></div></section>
}

function Settings() {
  const [url, setUrl] = useState(getApiUrl()); const [message, setMessage] = useState('')
  function save(event: FormEvent) { event.preventDefault(); try { setApiUrl(url.trim()); setMessage('URL Apps Script tersimpan di perangkat ini.') } catch (error) { setMessage(error instanceof Error ? error.message : 'URL tidak valid') } }
  return <section><div className="section-head"><div><div className="eyebrow">KONFIGURASI</div><h2>Pengaturan</h2></div></div><form className="panel form-stack" onSubmit={save}><label>Apps Script API URL<input value={url} onChange={(e) => setUrl(e.target.value)} /></label><p className="muted">Backend tetap menggunakan deployment <code>/exec</code> yang sama.</p>{message && <div className="alert">{message}</div>}<button className="primary">Simpan</button></form></section>
}
