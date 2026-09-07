import { useEffect, useMemo, useState } from 'react'
import { qcApi } from './api'
import FirestoreMigrationPanel from './FirestoreMigrationPanel'
import type { AccountChangeRequest, Role, User } from './types'

const ROLES: Role[] = ['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung']
const formatLogTime = (value: unknown) => {
  const raw = String(value || '')
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw || '-'
  return date.toLocaleString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' })
}

type UsersProps = { token: string }
export function UsersApproval({ token }: UsersProps) {
  const [users, setUsers] = useState<User[]>([])
  const [requests, setRequests] = useState<AccountChangeRequest[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({})

  async function load() {
    setBusy(true); setMessage('')
    try {
      const [userResult, requestResult] = await Promise.all([qcApi.users(token), qcApi.accountChangeRequests(token)])
      const list = (userResult.users || userResult.data || []) as User[]
      setUsers(list)
      setRequests((requestResult.requests || requestResult.data || []) as AccountChangeRequest[])
      setRoleDraft(Object.fromEntries(list.map((u) => [u.username, u.role])))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal memuat administrasi pengguna') }
    finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [token])

  async function decide(user: User, action: 'approve' | 'reject') {
    const role = roleDraft[user.username] || user.role
    setBusy(true); setMessage('')
    try {
      if (action === 'approve') await qcApi.approveUser(token, user.username, role)
      else await qcApi.rejectUser(token, user.username, role)
      setMessage(action === 'approve' ? `${user.fullName} disetujui sebagai ${role}.` : `${user.fullName} ditolak.`)
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Proses approval gagal') }
    finally { setBusy(false) }
  }

  async function saveRole(user: User) {
    const role = roleDraft[user.username] || user.role
    if (role === user.role) return setMessage(`Role ${user.fullName} belum berubah.`)
    setBusy(true); setMessage('')
    try {
      const result = await qcApi.updateUserRole(token, user.username, role)
      setMessage(result.message || `Role ${user.fullName} diperbarui menjadi ${role.replaceAll('_',' ')}. Perubahan berlaku setelah user login ulang.`)
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Perubahan role gagal') }
    finally { setBusy(false) }
  }

  async function decideAccount(request: AccountChangeRequest, decision: 'approve' | 'reject') {
    const verb = decision === 'approve' ? 'menyetujui' : 'menolak'
    if (!window.confirm(`Yakin ${verb} perubahan akun @${request.username}?`)) return
    setBusy(true); setMessage('')
    try {
      const result = await qcApi.decideAccountChange(token, request.requestId, decision)
      setMessage(result.message || (decision === 'approve' ? 'Perubahan akun disetujui.' : 'Perubahan akun ditolak.'))
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Keputusan perubahan akun gagal') }
    finally { setBusy(false) }
  }

  const pending = users.filter((u) => String(u.status || '').toUpperCase() === 'PENDING')
  const approved = users.filter((u) => String(u.status || '').toUpperCase() === 'APPROVED')
  const pendingChanges = requests.filter((r) => String(r.status || '').toUpperCase() === 'PENDING')
  return <section>
    <div className="section-head"><div><div className="eyebrow">ADMINISTRASI</div><h2>Users & Approval</h2></div><button className="secondary" onClick={() => void load()} disabled={busy}>Refresh</button></div>
    {message && <div className="alert">{message}</div>}
    <div className="stats-grid"><Stat label="Total user" value={users.length} /><Stat label="Pending user" value={pending.length} /><Stat label="Approved" value={approved.length} /><Stat label="Perubahan akun" value={pendingChanges.length} /></div>
    <FirestoreMigrationPanel token={token}/>
    <div className="panel"><h3>Permintaan Perubahan Akun</h3><p className="muted">Password baru tidak pernah ditampilkan. Owner hanya menyetujui atau menolak perubahan yang sudah diverifikasi dengan password lama user.</p><div className="table-wrap"><table><thead><tr><th>User</th><th>Permintaan</th><th>Username Baru</th><th>Password</th><th>Waktu</th><th>Aksi</th></tr></thead><tbody>{pendingChanges.map((r) => <tr key={r.requestId}><td>{r.fullName || r.username}<br/><small>@{r.username}</small></td><td>{(r.requestType || 'credentials').replaceAll('_',' ')}</td><td>{r.newUsername || 'Tidak diubah'}</td><td>{r.passwordRequested ? 'Akan diganti' : 'Tidak diubah'}</td><td>{formatLogTime(r.timestamp)}</td><td><div className="row-actions"><button className="primary" disabled={busy} onClick={() => void decideAccount(r,'approve')}>Approve</button><button className="danger" disabled={busy} onClick={() => void decideAccount(r,'reject')}>Reject</button></div></td></tr>)}{!pendingChanges.length && <tr><td colSpan={6} className="empty">Tidak ada permintaan perubahan akun.</td></tr>}</tbody></table></div></div>
    <div className="panel"><h3>Menunggu Persetujuan User Baru</h3><div className="table-wrap"><table><thead><tr><th>Nama</th><th>Username</th><th>Email</th><th>Role</th><th>Aksi</th></tr></thead><tbody>{pending.map((u) => <tr key={u.username}><td>{u.fullName}</td><td>{u.username}</td><td>{u.email || '-'}</td><td><select value={roleDraft[u.username] || u.role} onChange={(e) => setRoleDraft((old) => ({...old,[u.username]:e.target.value}))}>{ROLES.map((r) => <option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</select></td><td><div className="row-actions"><button className="primary" disabled={busy} onClick={() => void decide(u,'approve')}>Approve</button><button className="danger" disabled={busy} onClick={() => void decide(u,'reject')}>Reject</button></div></td></tr>)}{!pending.length && <tr><td colSpan={5} className="empty">Tidak ada user pending.</td></tr>}</tbody></table></div></div>
    <div className="panel"><h3>Pengguna Terdaftar & Edit Role</h3><div className="table-wrap"><table><thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Status</th><th>Form</th><th>Aksi</th></tr></thead><tbody>{users.map((u) => <tr key={u.username}><td>{u.fullName}</td><td>{u.username}</td><td><select value={roleDraft[u.username] || u.role} onChange={(e) => setRoleDraft((old) => ({...old,[u.username]:e.target.value}))}>{ROLES.map((r) => <option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</select></td><td>{u.status || '-'}</td><td>{u.allowedForm || '-'}</td><td><button disabled={busy || (roleDraft[u.username] || u.role) === u.role} onClick={() => void saveRole(u)}>Simpan Role</button></td></tr>)}</tbody></table></div><p className="muted">Role baru berlaku pada sesi berikutnya. User yang sedang login perlu logout lalu login kembali.</p></div>
  </section>
}

type LogsProps = { token: string }
export function ActivityLogs({ token }: LogsProps) {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([])
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  async function load() {
    setBusy(true); setMessage('')
    try { const result = await qcApi.logs(token); setLogs((result.logs || result.data || []) as Record<string, unknown>[]) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal memuat activity logs') }
    finally { setBusy(false) }
  }
  useEffect(() => { void load() }, [token])
  const filtered = useMemo(() => logs.filter((log) => JSON.stringify(log).toLowerCase().includes(query.toLowerCase())), [logs, query])
  return <section>
    <div className="section-head"><div><div className="eyebrow">AUDIT TRAIL</div><h2>Activity Logs</h2></div><button className="secondary" onClick={() => void load()} disabled={busy}>Refresh</button></div>
    {message && <div className="alert">{message}</div>}
    <div className="filters"><input placeholder="Cari user, aksi, deskripsi…" value={query} onChange={(e) => setQuery(e.target.value)} /><span className="badge">{filtered.length} log</span></div>
    <div className="table-wrap activity-log-table"><table><thead><tr><th>Waktu</th><th>User</th><th>Role</th><th>Aksi</th><th>Deskripsi</th><th>Device</th></tr></thead><tbody>{filtered.map((log, i) => <tr key={i}><td><span className="log-time">{formatLogTime(log.Timestamp)}</span></td><td>{String(log.FullName || log.Username || '-')}<br/><small>{String(log.Username || '')}</small></td><td>{String(log.Role || '-')}</td><td>{String(log.ActionType || '-')}</td><td>{String(log.Description || '-')}</td><td>{String(log.IP_Device || '-')}</td></tr>)}{!filtered.length && <tr><td colSpan={6} className="empty">Tidak ada log yang cocok.</td></tr>}</tbody></table></div>
  </section>
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="stat"><span>{label}</span><strong>{value}</strong></div> }
