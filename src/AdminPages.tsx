import { useEffect, useMemo, useState } from 'react'
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { qcApi } from './api'
import FirestoreMigrationPanel from './FirestoreMigrationPanel'
import { firebaseAuth, firestoreDb } from './firebase'
import type { AccountChangeRequest, Role, User } from './types'
import { defaultPermissionsForRole, PERMISSION_CATALOG, type AccessMode, type PermissionKey, type UserPermissions } from './accessControl'

const ROLES: Role[] = ['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung']
const ROLE_LABELS:Record<Role,string>={
  owner:'Owner',manager:'Manager',admin:'Admin',asisten:'Asisten',
  mandor_spraying:'Mandor Spraying',mandor_fertilizer:'Mandor Fertilizer',pengunjung:'Pengunjung',
}
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
  const [selectedAccessRole,setSelectedAccessRole]=useState<Role>('asisten')
  const [roleAccessDraft,setRoleAccessDraft]=useState<Record<Role,UserPermissions>>(
    Object.fromEntries(ROLES.map(role=>[role,defaultPermissionsForRole(role)])) as Record<Role,UserPermissions>
  )

  async function load() {
    setBusy(true); setMessage('')
    try {
      const userResult = await qcApi.users(token)
      let list = (userResult.users || userResult.data || []) as User[]
      const requestedRoleByUsername=new Map<string,string>()
      const roleAccessByRole=new Map<Role,UserPermissions>()
      if(firestoreDb){
        try{
          const [profileSnap,registrationSnap,roleAccessSnap]=await Promise.all([
            getDocs(collection(firestoreDb,'users')),
            getDocs(collection(firestoreDb,'registration_requests')),
            getDocs(collection(firestoreDb,'role_access')),
          ])
          const profileByUsername=new Map(profileSnap.docs.map(item=>[String(item.data().username||'').toLowerCase(),{uid:item.id,data:item.data()}]))
          registrationSnap.docs.forEach(item=>{
            const data=item.data(),username=String(data.username||'').toLowerCase(),role=String(data.requestedRole||'')
            if(username&&ROLES.includes(role as Role))requestedRoleByUsername.set(username,role)
          })
          roleAccessSnap.docs.forEach(item=>{
            const role=item.id as Role,data=item.data(),permissions=data.permissions
            if(ROLES.includes(role)&&permissions&&typeof permissions==='object')roleAccessByRole.set(role,permissions as UserPermissions)
          })
          list=list.map(user=>{
            const profile=profileByUsername.get(user.username.toLowerCase()),uid=user.firebaseUid||profile?.uid||''
            return{...user,firebaseUid:uid||user.firebaseUid}
          })
        }catch(error){console.info('Role access/registration data belum dapat dibaca; memakai default role.',error)}
      }
      setUsers(list)
      setRoleDraft(Object.fromEntries(list.map((u) => [u.username, requestedRoleByUsername.get(u.username.toLowerCase())||u.role])))
      setRoleAccessDraft(Object.fromEntries(ROLES.map(role=>[
        role,
        role==='owner'?defaultPermissionsForRole('owner'):{...defaultPermissionsForRole(role),...(roleAccessByRole.get(role)||{})},
      ])) as Record<Role,UserPermissions>)
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
      if(firestoreDb&&user.firebaseUid){try{await deleteDoc(doc(firestoreDb,'registration_requests',user.firebaseUid))}catch(error){console.info('Cleanup role request dilewati.',error)}}
      setMessage(action === 'approve'
        ? `${user.fullName} disetujui sebagai ${ROLE_LABELS[role as Role]||role}. Hak akses otomatis mengikuti template role.`
        : `${user.fullName} ditolak.`)
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
      if(firestoreDb&&user.firebaseUid){
        try{await deleteDoc(doc(firestoreDb,'user_access',user.firebaseUid))}catch(error){console.info('Cleanup legacy user access dilewati.',error)}
      }
      setMessage(result.message || `Role ${user.fullName} diperbarui menjadi ${ROLE_LABELS[role as Role]||role}. Hak akses otomatis mengikuti role tersebut.`)
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Perubahan role gagal') }
    finally { setBusy(false) }
  }

  function rolePermission(role:Role,key:PermissionKey):AccessMode {
    return (roleAccessDraft[role]?.[key]||'none') as AccessMode
  }
  function setRolePermission(role:Role,key:PermissionKey,mode:AccessMode){
    if(role==='owner')return
    setRoleAccessDraft(current=>({...current,[role]:{...(current[role]||{}),[key]:mode}}))
  }
  function resetRolePermissions(role:Role){
    setRoleAccessDraft(current=>({...current,[role]:defaultPermissionsForRole(role)}))
    setMessage(`Draft hak akses ${ROLE_LABELS[role]} dikembalikan ke default. Klik Simpan Hak Akses Role untuk menerapkan.`)
  }
  async function saveRolePermissions(role:Role){
    if(role==='owner'){setMessage('Owner selalu menggunakan akses Edit penuh agar administrasi sistem tidak dapat terkunci.');return}
    setBusy(true);setMessage('')
    try{
      const permissions=roleAccessDraft[role]||defaultPermissionsForRole(role)
      const db=firestoreDb
      if(!db)throw new Error('Firestore belum tersedia untuk menyimpan hak akses role.')
      await setDoc(doc(db,'role_access',role),{
        role,permissions,updatedAt:serverTimestamp(),updatedBy:firebaseAuth?.currentUser?.email||'owner',
      },{merge:true})
      const legacyUsers=users.filter(user=>user.role===role&&user.firebaseUid)
      await Promise.all(legacyUsers.map(async user=>{try{await deleteDoc(doc(db,'user_access',user.firebaseUid!))}catch{}}))
      let mirrored=false
      try{await qcApi.updateRolePermissions(token,role,permissions as Record<string,string>);mirrored=true}catch(error){console.info('Mirror role access ke Apps Script belum tersedia; Firestore role template tetap aktif.',error)}
      const count=users.filter(user=>user.role===role).length
      setMessage(`Hak akses role ${ROLE_LABELS[role]} berhasil disimpan. ${count} user dengan role ini akan mengikuti pengaturan yang sama.${mirrored?' Backend Apps Script juga tersinkron.':' Firestore sudah aktif; sinkron Apps Script menunggu deployment backend terbaru.'}`)
    }catch(error){setMessage(error instanceof Error?error.message:'Hak akses role gagal disimpan')}finally{setBusy(false)}
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
      if(firestoreDb&&user.firebaseUid){try{await deleteDoc(doc(firestoreDb,'user_access',user.firebaseUid))}catch{}}
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
  const selectedRoleUserCount=users.filter(user=>user.role===selectedAccessRole).length

  return <section>
    <div className="section-head"><div><div className="eyebrow">ADMINISTRASI</div><h2>Users & Approval</h2></div><button className="secondary" onClick={() => void load()} disabled={busy}>Refresh</button></div>
    {message && <div className="alert">{message}</div>}
    <div className="stats-grid"><Stat label="Total user" value={users.length} /><Stat label="Pending user" value={pending.length} /><Stat label="Approved" value={approved.length} /><Stat label="Perubahan akun" value={pendingChanges.length} /></div>
    <FirestoreMigrationPanel token={token}/>

    <div className="panel role-access-panel">
      <div className="section-head"><div><div className="eyebrow">HAK AKSES TERPUSAT</div><h3>Hak Akses per Role</h3><p className="muted">Atur sekali untuk sebuah role. Semua user yang memakai role tersebut otomatis mengikuti hak akses yang sama.</p></div><span className="badge">{selectedRoleUserCount} user · {ROLE_LABELS[selectedAccessRole]}</span></div>
      <div className="role-access-tabs">
        {ROLES.map(role=><button type="button" key={role} className={selectedAccessRole===role?'active':''} onClick={()=>setSelectedAccessRole(role)}><strong>{ROLE_LABELS[role]}</strong><span>{users.filter(user=>user.role===role).length} user</span></button>)}
      </div>
      <div className="user-access-editor role-access-editor">
        <div className="section-head"><div><div className="eyebrow">TEMPLATE ROLE</div><h3>{ROLE_LABELS[selectedAccessRole]}</h3><p className="muted">{selectedAccessRole==='owner'?'Owner dikunci ke Edit penuh.':`Perubahan di sini berlaku untuk semua user ${ROLE_LABELS[selectedAccessRole]}, termasuk user baru yang nanti disetujui dengan role ini.`}</p></div><div className="row-actions"><button type="button" disabled={busy||selectedAccessRole==='owner'} onClick={()=>resetRolePermissions(selectedAccessRole)}>Reset Default</button><button type="button" className="primary" disabled={busy||selectedAccessRole==='owner'} onClick={()=>void saveRolePermissions(selectedAccessRole)}>Simpan Hak Akses Role</button></div></div>
        {(['Form QC','Data UnM'] as const).map(group=><div key={group} className="access-group"><h4>{group}</h4><div className="access-grid">{PERMISSION_CATALOG.filter(item=>item.group===group).map(item=><div className="access-row" key={item.key}><div><strong>{item.menu}</strong><span>{item.subMenu}</span></div><select value={rolePermission(selectedAccessRole,item.key)} disabled={selectedAccessRole==='owner'} onChange={e=>setRolePermission(selectedAccessRole,item.key,e.target.value as AccessMode)}><option value="none">Tidak Akses</option><option value="view">Hanya Lihat</option><option value="edit">Edit</option></select></div>)}</div></div>)}
        {selectedAccessRole==='owner'&&<div className="alert">Owner selalu memiliki akses Edit penuh agar konfigurasi role dan administrasi user tidak dapat terkunci.</div>}
      </div>
    </div>

    <div className="panel"><h3>Permintaan Perubahan Akun</h3><p className="muted">Password baru tidak pernah ditampilkan. Owner hanya menyetujui atau menolak perubahan yang sudah diverifikasi dengan password lama user.</p>{!accountFeaturesReady&&<div className="alert">Menunggu backend Apps Script terbaru. Fitur ini sengaja dinonaktifkan sementara agar menu Users tetap dapat digunakan.</div>}<div className="table-wrap"><table><thead><tr><th>User</th><th>Permintaan</th><th>Nama Baru</th><th>Username Baru</th><th>Password</th><th>Waktu</th><th>Aksi</th></tr></thead><tbody>{pendingChanges.map((r) => <tr key={r.requestId}><td>{r.fullName || r.username}<br/><small>@{r.username}</small></td><td>{(r.requestType || 'credentials').replaceAll('_',' ')}</td><td>{r.newFullName || 'Tidak diubah'}</td><td>{r.newUsername || 'Tidak diubah'}</td><td>{r.passwordRequested ? 'Akan diganti' : 'Tidak diubah'}</td><td>{formatLogTime(r.timestamp)}</td><td><div className="row-actions"><button className="primary" disabled={busy||!accountFeaturesReady} onClick={() => void decideAccount(r,'approve')}>Approve</button><button className="danger" disabled={busy||!accountFeaturesReady} onClick={() => void decideAccount(r,'reject')}>Reject</button></div></td></tr>)}{!pendingChanges.length && <tr><td colSpan={7} className="empty">Tidak ada permintaan perubahan akun.</td></tr>}</tbody></table></div></div>

    <div className="panel"><h3>Menunggu Persetujuan User Baru</h3><p className="muted">Pilih role saat approval. Hak akses user akan otomatis mengikuti template role tersebut.</p><div className="table-wrap"><table><thead><tr><th>Nama</th><th>Username</th><th>Email</th><th>Role</th><th>Aksi</th></tr></thead><tbody>{pending.map((u) => <tr key={u.username}><td>{u.fullName}</td><td>{u.username}</td><td>{u.email || '-'}</td><td><select value={roleDraft[u.username] || u.role} onChange={(e) => setRoleDraft((old) => ({...old,[u.username]:e.target.value}))}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></td><td><div className="row-actions"><button className="primary" disabled={busy} onClick={() => void decide(u,'approve')}>Approve</button><button className="danger" disabled={busy} onClick={() => void decide(u,'reject')}>Reject</button></div></td></tr>)}{!pending.length && <tr><td colSpan={5} className="empty">Tidak ada user pending.</td></tr>}</tbody></table></div></div>

    <div className="panel users-directory-panel">
      <div className="section-head"><div><h3>Pengguna Terdaftar & Role</h3><p className="muted">Hak akses tidak perlu diubah per user. Cukup ubah template role di bagian Hak Akses per Role.</p></div><span className="badge">{filteredUsers.length} dari {users.length} user</span></div>
      <div className="user-search-bar"><input aria-label="Cari pengguna" placeholder="Cari nama, username/nickname, email, role…" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />{userQuery&&<button type="button" onClick={() => setUserQuery('')}>Reset</button>}</div>
      <div className="table-wrap"><table><thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Status</th><th>Form</th><th>Aksi</th></tr></thead><tbody>{filteredUsers.map((u) => <tr key={u.username}><td>{u.fullName}</td><td>{u.username}</td><td><select value={roleDraft[u.username] || u.role} disabled={!accountFeaturesReady} onChange={(e) => setRoleDraft((old) => ({...old,[u.username]:e.target.value}))}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></td><td>{u.status || '-'}</td><td>{u.allowedForm || '-'}</td><td><div className="row-actions"><button disabled={busy || !accountFeaturesReady || (roleDraft[u.username] || u.role) === u.role} onClick={() => void saveRole(u)}>Simpan Role</button><button className="danger" disabled={busy || !accountFeaturesReady || u.role === 'owner'} title={u.role === 'owner' ? 'Akun Owner dilindungi dari penghapusan.' : 'Hapus akun login; data QC historis tetap disimpan.'} onClick={() => void deleteUser(u)}>Hapus Akun</button></div></td></tr>)}{!filteredUsers.length&&<tr><td colSpan={6} className="empty">Tidak ada pengguna yang cocok dengan pencarian.</td></tr>}</tbody></table></div>
      <p className="muted">Saat role user diubah, hak aksesnya otomatis berpindah mengikuti template role baru. Hapus Akun hanya menghapus akses login pengguna; data QC historis, foto, dan laporan tetap dipertahankan.</p>
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
