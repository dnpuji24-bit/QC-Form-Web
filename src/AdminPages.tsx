import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { qcApi } from './api'
import FirestoreMigrationPanel from './FirestoreMigrationPanel'
import { firebaseAuth, firestoreDb } from './firebase'
import type { AccountChangeRequest, Role, User } from './types'
import { defaultPermissionsForRole, PERMISSION_CATALOG, type AccessMode, type PermissionKey, type UserPermissions } from './accessControl'

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
  const [accountFeaturesReady, setAccountFeaturesReady] = useState(true)
  const [userQuery, setUserQuery] = useState('')
  const [accessUsername, setAccessUsername] = useState('')
  const [permissionDraft, setPermissionDraft] = useState<Record<string,UserPermissions>>({})

  async function load() {
    setBusy(true); setMessage('')
    try {
      const userResult = await qcApi.users(token)
      let list = (userResult.users || userResult.data || []) as User[]
      if(firestoreDb){
        try{
          const [profileSnap,accessSnap]=await Promise.all([getDocs(collection(firestoreDb,'users')),getDocs(collection(firestoreDb,'user_access'))])
          const profileByUsername=new Map(profileSnap.docs.map(item=>[String(item.data().username||'').toLowerCase(),{uid:item.id,data:item.data()}]))
          const accessByUid=new Map(accessSnap.docs.map(item=>[item.id,item.data()]))
          list=list.map(user=>{
            const profile=profileByUsername.get(user.username.toLowerCase()),uid=user.firebaseUid||profile?.uid||'',override=uid?accessByUid.get(uid):undefined
            const rawPermissions=override?.permissions&&typeof override.permissions==='object'?override.permissions:user.permissions
            return{...user,firebaseUid:uid||user.firebaseUid,permissions:rawPermissions as User['permissions']}
          })
        }catch(error){console.info('User access override belum dapat dibaca; memakai default role/API.',error)}
      }
      setUsers(list)
      setRoleDraft(Object.fromEntries(list.map((u) => [u.username, u.role])))
      setPermissionDraft(Object.fromEntries(list.map((u)=>[u.username,{...defaultPermissionsForRole(u.role),...(u.permissions||{})}])))
      try {
        const requestResult = await qcApi.accountChangeRequests(token)
        setRequests((requestResult.requests || requestResult.data || []) as AccountChangeRequest[])
        setAccountFeaturesReady(true)
      } catch {
        setRequests([])
        setAccountFeaturesReady(false)
        setMessage('Daftar user berhasil dimuat. Fitur perubahan profil membutuhkan Apps Script terbaru.')
      }
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
      const permissions=defaultPermissionsForRole(role as Role)
      if(firestoreDb&&user.firebaseUid){
        await setDoc(doc(firestoreDb,'user_access',user.firebaseUid),{username:user.username,role,permissions,updatedAt:serverTimestamp(),updatedBy:firebaseAuth?.currentUser?.email||'owner'},{merge:true})
      }
      setMessage(result.message || `Role ${user.fullName} diperbarui menjadi ${role.replaceAll('_',' ')}. Hak akses direset mengikuti default role; berlaku setelah user login ulang.`)
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Perubahan role gagal') }
    finally { setBusy(false) }
  }

  function permissionFor(username:string,key:PermissionKey):AccessMode {
    return (permissionDraft[username]?.[key]||'none') as AccessMode
  }
  function setPermission(username:string,key:PermissionKey,mode:AccessMode){
    setPermissionDraft(current=>({...current,[username]:{...(current[username]||{}),[key]:mode}}))
  }
  function resetPermissionsForRole(user:User){
    const role=(roleDraft[user.username]||user.role) as Role
    setPermissionDraft(current=>({...current,[user.username]:defaultPermissionsForRole(role)}))
    setMessage('Draft hak akses '+user.fullName+' direset mengikuti default role '+role.replaceAll('_',' ')+'. Klik Simpan Hak Akses untuk menerapkan.')
  }
  async function savePermissions(user:User){
    setBusy(true);setMessage('')
    try{
      const role=(roleDraft[user.username]||user.role) as Role
      const permissions=role==='owner'?defaultPermissionsForRole('owner'):(permissionDraft[user.username]||defaultPermissionsForRole(role))
      if(!firestoreDb)throw new Error('Firestore belum tersedia untuk menyimpan hak akses.')
      if(!user.firebaseUid)throw new Error('Firebase UID user belum tersedia. Login user tersebut minimal sekali atau refresh Users setelah provisioning Firebase.')
      await setDoc(doc(firestoreDb,'user_access',user.firebaseUid),{username:user.username,role,permissions,updatedAt:serverTimestamp(),updatedBy:firebaseAuth?.currentUser?.email||'owner'},{merge:true})
      let mirrored=false
      try{await qcApi.updateUserPermissions(token,user.username,permissions as Record<string,string>);mirrored=true}catch(error){console.info('Mirror hak akses ke Apps Script belum tersedia; Firestore override tetap aktif.',error)}
      setMessage('Hak akses '+user.fullName+' berhasil disimpan ke Firestore.'+(mirrored?' Sinkron Apps Script juga berhasil.':' Perubahan sudah aktif melalui Firestore; sinkron Apps Script menunggu deployment backend terbaru.')+' User perlu login ulang.')
      await load()
    }catch(error){setMessage(error instanceof Error?error.message:'Hak akses gagal disimpan')}finally{setBusy(false)}
  }

  async function deleteUser(user: User) {
    if (user.role === 'owner') {
      setMessage('Akun dengan role Owner tidak dapat dihapus dari web.')
      return
    }
    const confirmation = window.prompt(`Hapus akun ${user.fullName} (@${user.username})?\n\nData QC historis, foto, dan laporan tidak ikut dihapus.\nKetik username "${user.username}" untuk konfirmasi.`)
    if (confirmation === null) return
    if (confirmation.trim().toLowerCase() !== user.username.toLowerCase()) {
      setMessage('Penghapusan dibatalkan karena username konfirmasi tidak cocok.')
      return
    }
    setBusy(true); setMessage('')
    try {
      const result = await qcApi.deleteUser(token, user.username)
      setMessage(result.message || `Akun @${user.username} berhasil dihapus. Data QC historis tetap dipertahankan.`)
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Penghapusan akun gagal') }
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
  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => `${u.fullName} ${u.username} ${u.email || ''} ${u.role} ${u.status || ''} ${u.allowedForm || ''}`.toLowerCase().includes(q))
  }, [users, userQuery])

  return <section>
    <div className="section-head"><div><div className="eyebrow">ADMINISTRASI</div><h2>Users & Approval</h2></div><button className="secondary" onClick={() => void load()} disabled={busy}>Refresh</button></div>
    {message && <div className="alert">{message}</div>}
    <div className="stats-grid"><Stat label="Total user" value={users.length} /><Stat label="Pending user" value={pending.length} /><Stat label="Approved" value={approved.length} /><Stat label="Perubahan akun" value={pendingChanges.length} /></div>
    <FirestoreMigrationPanel token={token}/>

    <div className="panel"><h3>Permintaan Perubahan Akun</h3><p className="muted">Password baru tidak pernah ditampilkan. Owner hanya menyetujui atau menolak perubahan yang sudah diverifikasi dengan password lama user.</p>{!accountFeaturesReady&&<div className="alert">Menunggu backend Apps Script terbaru. Fitur ini sengaja dinonaktifkan sementara agar menu Users tetap dapat digunakan.</div>}<div className="table-wrap"><table><thead><tr><th>User</th><th>Permintaan</th><th>Nama Baru</th><th>Username Baru</th><th>Password</th><th>Waktu</th><th>Aksi</th></tr></thead><tbody>{pendingChanges.map((r) => <tr key={r.requestId}><td>{r.fullName || r.username}<br/><small>@{r.username}</small></td><td>{(r.requestType || 'credentials').replaceAll('_',' ')}</td><td>{r.newFullName || 'Tidak diubah'}</td><td>{r.newUsername || 'Tidak diubah'}</td><td>{r.passwordRequested ? 'Akan diganti' : 'Tidak diubah'}</td><td>{formatLogTime(r.timestamp)}</td><td><div className="row-actions"><button className="primary" disabled={busy||!accountFeaturesReady} onClick={() => void decideAccount(r,'approve')}>Approve</button><button className="danger" disabled={busy||!accountFeaturesReady} onClick={() => void decideAccount(r,'reject')}>Reject</button></div></td></tr>)}{!pendingChanges.length && <tr><td colSpan={7} className="empty">Tidak ada permintaan perubahan akun.</td></tr>}</tbody></table></div></div>

    <div className="panel"><h3>Menunggu Persetujuan User Baru</h3><div className="table-wrap"><table><thead><tr><th>Nama</th><th>Username</th><th>Email</th><th>Role</th><th>Aksi</th></tr></thead><tbody>{pending.map((u) => <tr key={u.username}><td>{u.fullName}</td><td>{u.username}</td><td>{u.email || '-'}</td><td><select value={roleDraft[u.username] || u.role} onChange={(e) => setRoleDraft((old) => ({...old,[u.username]:e.target.value}))}>{ROLES.map((r) => <option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</select></td><td><div className="row-actions"><button className="primary" disabled={busy} onClick={() => void decide(u,'approve')}>Approve</button><button className="danger" disabled={busy} onClick={() => void decide(u,'reject')}>Reject</button></div></td></tr>)}{!pending.length && <tr><td colSpan={5} className="empty">Tidak ada user pending.</td></tr>}</tbody></table></div></div>

    <div className="panel users-directory-panel">
      <div className="section-head"><div><h3>Pengguna Terdaftar & Edit Role</h3><p className="muted">Cari berdasarkan nama, nickname/username, email, role, status, atau form.</p></div><span className="badge">{filteredUsers.length} dari {users.length} user</span></div>
      <div className="user-search-bar"><input aria-label="Cari pengguna" placeholder="Cari nama, username/nickname, email, role…" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />{userQuery&&<button type="button" onClick={() => setUserQuery('')}>Reset</button>}</div>
      <div className="table-wrap"><table><thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Status</th><th>Form</th><th>Aksi</th></tr></thead><tbody>{filteredUsers.map((u) => <tr key={u.username}><td>{u.fullName}</td><td>{u.username}</td><td><select value={roleDraft[u.username] || u.role} disabled={!accountFeaturesReady} onChange={(e) => setRoleDraft((old) => ({...old,[u.username]:e.target.value}))}>{ROLES.map((r) => <option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</select></td><td>{u.status || '-'}</td><td>{u.allowedForm || '-'}</td><td><div className="row-actions"><button disabled={busy || !accountFeaturesReady || (roleDraft[u.username] || u.role) === u.role} onClick={() => void saveRole(u)}>Simpan Role</button><button type="button" className={accessUsername===u.username?'primary':''} onClick={()=>setAccessUsername(current=>current===u.username?'':u.username)}>Hak Akses</button><button className="danger" disabled={busy || !accountFeaturesReady || u.role === 'owner'} title={u.role === 'owner' ? 'Akun Owner dilindungi dari penghapusan.' : 'Hapus akun login; data QC historis tetap disimpan.'} onClick={() => void deleteUser(u)}>Hapus Akun</button></div></td></tr>)}{!filteredUsers.length&&<tr><td colSpan={6} className="empty">Tidak ada pengguna yang cocok dengan pencarian.</td></tr>}</tbody></table></div>
      {accessUsername&&users.find(u=>u.username===accessUsername)&&(()=>{const target=users.find(u=>u.username===accessUsername)!;return <div className="user-access-editor"><div className="section-head"><div><div className="eyebrow">HAK AKSES DETAIL</div><h3>{target.fullName} · @{target.username}</h3><p className="muted">Atur setiap menu/sub menu: Tidak Akses, Hanya Lihat, atau Edit. Role tetap menjadi preset awal; pengaturan di bawah menjadi override manual.</p></div><div className="row-actions"><button type="button" onClick={()=>resetPermissionsForRole(target)}>Reset sesuai Role</button><button type="button" className="primary" disabled={busy} onClick={()=>void savePermissions(target)}>Simpan Hak Akses</button><button type="button" onClick={()=>setAccessUsername('')}>Tutup</button></div></div>
        {(['Form QC','Data UnM'] as const).map(group=><div key={group} className="access-group"><h4>{group}</h4><div className="access-grid">{PERMISSION_CATALOG.filter(item=>item.group===group).map(item=><div className="access-row" key={item.key}><div><strong>{item.menu}</strong><span>{item.subMenu}</span></div><select value={permissionFor(target.username,item.key)} disabled={target.role==='owner'} onChange={e=>setPermission(target.username,item.key,e.target.value as AccessMode)}><option value="none">Tidak Akses</option><option value="view">Hanya Lihat</option><option value="edit">Edit</option></select></div>)}</div></div>)}
        {target.role==='owner'&&<div className="alert">Owner selalu memiliki akses Edit penuh agar administrasi sistem tidak dapat terkunci.</div>}
      </div>})()}
      <p className="muted">Role dan hak akses baru berlaku pada sesi berikutnya. Hapus Akun hanya menghapus akses login pengguna; data QC historis, foto, dan laporan tetap dipertahankan.</p>
    </div>
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
