import {NativeNameReview} from './NativeNameRequests'
import {useEffect,useMemo,useState} from 'react'
import {collection,getDocsFromServer,query,orderBy,limit} from 'firebase/firestore'
import {firebaseAuth,firestoreDb} from './firebase'
import {readApprovedFirebaseSession} from './qcFirebaseSession'
import {listNativeRegistrations,reviewNativeRegistration,nativeRegistrationRoles,type NativeRegistrationRole,type NativeRegistrationRequest} from './qcNativeRegistration'
import {PERMISSION_CATALOG,defaultPermissionsForRole,type AccessMode} from './accessControl'
import {saveNativeRolePermissions,saveNativeUserActive,saveNativeUserRole,type NativeRolePermissions} from './nativeOwnerAccess'
import './native-users-access.css'

type Row={uid:string;username:string;fullName:string;email?:string;role:string;active:boolean;status:string}
type View='users'|'permissions'|'registrations'|'logs'
const endpoint=import.meta.env.VITE_QC_NATIVE_ADMIN_URL as string|undefined
const validMode=(v:unknown):v is AccessMode=>v==='none'||v==='view'||v==='edit'
const permissionsFor=(role:NativeRegistrationRole,raw?:Record<string,unknown>):NativeRolePermissions=>{
 const defaults=defaultPermissionsForRole(role)
 return Object.fromEntries(PERMISSION_CATALOG.map(p=>{
   const value=raw?.[p.key]
   return[p.key,validMode(value)?value:defaults[p.key]||'none']
 })) as NativeRolePermissions
}
async function owner(){
 const user=await readApprovedFirebaseSession()
 if(user.role!=='owner'||!firestoreDb||firebaseAuth?.currentUser?.uid!==user.firebaseUid)throw Error('Owner aktif diperlukan.')
 return {db:firestoreDb,uid:user.firebaseUid}
}
/** Only unrelated trusted backend operations use this endpoint. Role and
 * permission changes use authenticated Firestore transactions instead. */
export async function command(body:Record<string,unknown>,expectedUid?:string):Promise<Record<string,unknown>>{
 const {uid}=await owner()
 if(expectedUid!==undefined&&uid!==expectedUid)throw Error('Sesi berubah.')
 if(!endpoint)throw Error('Layanan aktivasi akun baru belum dikonfigurasi. Perubahan role dan permission pengguna yang sudah ada tetap tersedia.')
 const url=new URL(endpoint)
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Endpoint tidak aman.')
 const current=firebaseAuth?.currentUser
 if(!current||current.uid!==uid)throw Error('Sesi berubah.')
 const token=await current.getIdToken()
 if(firebaseAuth?.currentUser?.uid!==uid)throw Error('Sesi berubah.')
 const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',redirect:'error'})
 const result=await response.json()
 if(firebaseAuth?.currentUser?.uid!==uid)throw Error('Sesi berubah. Periksa status transaksi sebelum mencoba lagi.')
 if(!response.ok||!result||result.ok!==true)throw Error(String(result?.error||'Perubahan gagal.'))
 return result as Record<string,unknown>
}
export function NativeAdminLogs(){
 const [rows,setRows]=useState<Record<string,unknown>[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 async function load(){
   setBusy(true);setRows([])
   try{
     const{db,uid}=await owner()
     const snap=await getDocsFromServer(query(collection(db,'qc_admin_audit'),orderBy('createdAt','desc'),limit(100)))
     if(firebaseAuth?.currentUser?.uid!==uid)throw Error('Sesi berubah.')
     setRows(snap.docs.map(d=>({id:d.id,...d.data()})))
     setMessage('')
   }catch{setMessage('Log administrasi belum dapat dimuat atau akses ditolak.')}
   finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[])
 return <section className="ua-pane">
   <div className="ua-section-bar"><div><h3>Riwayat perubahan akses</h3><p>100 tindakan administrasi terbaru. Hanya Owner yang dapat melihat.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>↻ Refresh Log</button></div>
   {message&&<p role="status" className="ua-message">{message}</p>}
   <div className="ua-scroll"><table className="ua-table"><thead><tr><th>Waktu</th><th>Tindakan</th><th>Target</th><th>Nilai lama</th><th>Nilai baru</th><th>Owner UID</th></tr></thead>
     <tbody>{rows.map(row=><tr key={String(row.id)}><td>{String((row.createdAt as {toDate?:()=>Date}|undefined)?.toDate?.().toLocaleString('id-ID')||'—')}</td><td>{String(row.action||'—')}</td><td>{String(row.target||'—')}</td><td>{String(row.before||'—')}</td><td>{String(row.after||'—')}</td><td>{String(row.actorUid||'—')}</td></tr>)}</tbody>
   </table></div>{!rows.length&&!busy&&<p className="ua-muted">Belum ada log perubahan.</p>}
 </section>
}
export default function NativeUsersAccess(){
 const [users,setUsers]=useState<Row[]>([]),[requests,setRequests]=useState<NativeRegistrationRequest[]>([])
 const [serverTemplates,setServerTemplates]=useState<Record<string,NativeRolePermissions>>({})
 const [draftTemplates,setDraftTemplates]=useState<Record<string,NativeRolePermissions>>({})
 const [draftRoles,setDraftRoles]=useState<Record<string,NativeRegistrationRole>>({})
 const [requestRoles,setRequestRoles]=useState<Record<string,NativeRegistrationRole>>({})
 const [selectedRole,setSelectedRole]=useState<NativeRegistrationRole>('manager')
 const [view,setView]=useState<View>('users'),[queryText,setQueryText]=useState(''),[roleFilter,setRoleFilter]=useState('all')
 const [permissionSearch,setPermissionSearch]=useState(''),[permissionGroup,setPermissionGroup]=useState('all')
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false)
 async function load(){
   const{db,uid}=await owner()
   const [accounts,registrations,templates]=await Promise.all([
     getDocsFromServer(collection(db,'users')),listNativeRegistrations(),getDocsFromServer(collection(db,'role_access'))
   ])
   if(firebaseAuth?.currentUser?.uid!==uid)throw Error('Sesi Owner berubah.')
   const values=accounts.docs.map(d=>({...d.data(),uid:d.id} as Row)).sort((a,b)=>String(a.fullName||a.username).localeCompare(String(b.fullName||b.username),'id'))
   const mapped:Record<string,NativeRolePermissions>={}
   for(const role of nativeRegistrationRoles){
     const raw=templates.docs.find(d=>d.id===role)?.data()?.permissions as Record<string,unknown>|undefined
     mapped[role]=permissionsFor(role,raw)
   }
   setUsers(values);setRequests(registrations);setServerTemplates(mapped);setDraftTemplates(mapped)
   setDraftRoles({});setRequestRoles({})
 }
 async function run(action:()=>Promise<void>,success='Perubahan berhasil disimpan dan diverifikasi dari server.'){
   setBusy(true);setMessage('');setError(false)
   try{await action();await load();setMessage(success)}
   catch(e){setError(true);setMessage(e instanceof Error?e.message:'Perubahan gagal. Refresh sebelum mencoba kembali.')}
   finally{setBusy(false)}
 }
 function refresh(){
   if(!busy&&(dirtyPermissions>0||Object.keys(draftRoles).some(uid=>users.find(u=>u.uid===uid)?.role!==draftRoles[uid]))&&!window.confirm('Buang perubahan yang belum disimpan?'))return
   void run(async()=>{},'Data terbaru dimuat dari Firestore.')
 }
 useEffect(()=>{void run(async()=>{},'Data pengguna dan role berhasil dimuat.')},[])
 const filtered=useMemo(()=>users.filter(u=>{
   const q=queryText.trim().toLowerCase()
   return(roleFilter==='all'||roleFilter===u.role)&&(!q||[u.username,u.fullName,u.email,u.role,u.status].some(value=>String(value||'').toLowerCase().includes(q)))
 }),[users,queryText,roleFilter])
 const currentDraft=draftTemplates[selectedRole]||permissionsFor(selectedRole)
 const currentServer=serverTemplates[selectedRole]||permissionsFor(selectedRole)
 const dirtyPermissions=PERMISSION_CATALOG.filter(item=>currentDraft[item.key]!==currentServer[item.key]).length
 const permissionRows=PERMISSION_CATALOG.filter(item=>(permissionGroup==='all'||item.group===permissionGroup)
   &&(!permissionSearch.trim()||[item.group,item.menu,item.subMenu,item.key].some(x=>x.toLowerCase().includes(permissionSearch.trim().toLowerCase()))))
 async function saveRole(row:Row){
   const proposed=draftRoles[row.uid]||row.role
   if(proposed===row.role)return
   if(!window.confirm('Ubah role @'+row.username+' dari '+row.role+' menjadi '+proposed+'? Hak akses akan mengikuti role baru.'))return
   await run(()=>saveNativeUserRole(row.uid,proposed,row.role),'Role @'+row.username+' berhasil diubah menjadi '+proposed+'.')
 }
 async function toggleActive(row:Row){
   const target=!row.active
   if(!window.confirm((target?'Aktifkan kembali':'Nonaktifkan akses aplikasi')+' @'+row.username+'?'))return
   await run(()=>saveNativeUserActive(row.uid,target,row.active),
     'Akses aplikasi @'+row.username+' '+(target?'diaktifkan':'dinonaktifkan')+'.')
 }
 async function saveTemplate(){
   if(!dirtyPermissions)return
   if(!window.confirm('Simpan '+dirtyPermissions+' perubahan permission untuk seluruh pengguna dengan role '+selectedRole+'?'))return
   await run(()=>saveNativeRolePermissions(selectedRole,currentDraft),
     'Hak akses role '+selectedRole+' sudah disimpan di Firestore. Akun terkait akan menerima izin baru setelah sesi diperbarui.')
 }
 async function review(row:NativeRegistrationRequest,decision:'approve'|'reject'){
   const nextRole=requestRoles[row.uid]||row.requestedRole
   if(!window.confirm((decision==='approve'?'Setujui':'Tolak')+' registrasi @'+row.username+'? Persetujuan belum mengaktifkan akun Firebase.'))return
   await run(()=>reviewNativeRegistration(row.uid,decision,nextRole),
     'Keputusan registrasi disimpan. Persetujuan belum mengaktifkan akun baru.')
 }
 const active=users.filter(u=>u.active).length
 const pending=requests.filter(r=>r.status==='pending').length
 return <div className="ua-workspace">
   <div className="ua-intro">
     <div><h2>Users & Access</h2><p>Kelola pengguna, role dan permission langsung di Firestore. Perubahan hanya diizinkan untuk Owner.</p></div>
     <button type="button" onClick={refresh} disabled={busy}>↻ Refresh</button>
   </div>
   <div className="ua-stats">
     {[{label:'Total Pengguna',value:users.length},{label:'Aktif',value:active},{label:'Nonaktif',value:users.length-active},{label:'Registrasi Pending',value:pending}].map(x=><div key={x.label}><small>{x.label}</small><strong>{x.value}</strong></div>)}
   </div>
   <div className="ua-info"><strong>Role & permission dapat disimpan sekarang.</strong> Perubahan aktif/nonaktif mengendalikan akses aplikasi melalui Firestore Rules, bukan menghapus/men-disable akun Firebase Authentication. Aktivasi akun pendaftaran baru masih membutuhkan backend administrasi.</div>
   {message&&<p role="status" className={'ua-message '+(error?'ua-error':'ua-ok')}>{message}</p>}
   <div className="ua-tabs" role="tablist" aria-label="Pengelolaan pengguna">
     {([{key:'users',label:'Pengguna'},{key:'permissions',label:'Hak Akses Role'},{key:'registrations',label:'Registrasi'},{key:'logs',label:'Riwayat'}] as const).map(item=>
       <button type="button" role="tab" aria-selected={view===item.key} key={item.key} className={view===item.key?'ua-active':''} disabled={busy} onClick={()=>setView(item.key)}>{item.label}</button>)}
   </div>
   {view==='users'&&<section className="ua-pane">
     <div className="ua-section-bar"><div><h3>Daftar Pengguna</h3><p>Pilih role baru lalu klik Simpan pada baris yang bersangkutan. Akun Owner terlindungi.</p></div><span>{filtered.length} dari {users.length} pengguna</span></div>
     <div className="ua-filters">
       <label>Cari pengguna<input type="search" value={queryText} onChange={e=>setQueryText(e.target.value)} placeholder="Nama, username, email atau jabatan…"/></label>
       <label>Filter Role<select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="all">Semua Role</option>{['owner',...nativeRegistrationRoles].map(r=><option key={r} value={r}>{r}</option>)}</select></label>
     </div>
     <div className="ua-scroll"><table className="ua-table"><thead><tr><th>Nama / Username</th><th>Email</th><th>Role Saat Ini</th><th>Ubah Role</th><th>Status</th><th>Aksi</th></tr></thead>
       <tbody>{filtered.map(row=>{
         const locked=row.role==='owner'||!['approved','APPROVED'].includes(row.status)
         const chosen=draftRoles[row.uid]||row.role,changed=chosen!==row.role
         return <tr key={row.uid}>
           <td><strong>{row.fullName||row.username}</strong><small>@{row.username}</small></td>
           <td>{row.email||'—'}</td><td><span className="ua-role-label">{row.role}</span></td>
           <td>{locked?<span className="ua-muted">{row.role==='owner'?'Owner dilindungi':'Belum approved'}</span>:
             <select aria-label={'Role baru '+row.username} value={chosen} disabled={busy} onChange={e=>setDraftRoles(prev=>({...prev,[row.uid]:e.target.value as NativeRegistrationRole}))}>{nativeRegistrationRoles.map(r=><option key={r} value={r}>{r}</option>)}</select>}</td>
           <td><span className={'ua-state '+(row.active?'ua-state-ready':'ua-state-off')}>{row.active?'Aktif':'Nonaktif'}</span></td>
           <td><div className="ua-actions">
             {!locked&&<><button type="button" className="ua-primary" disabled={busy||!changed} onClick={()=>void saveRole(row)}>Simpan Role</button>
             <button type="button" disabled={busy} onClick={()=>void toggleActive(row)}>{row.active?'Nonaktifkan':'Aktifkan'}</button></>}
           </div></td>
         </tr>})}</tbody></table></div>
     {!filtered.length&&!busy&&<p className="ua-muted">Tidak ada pengguna yang cocok dengan pencarian.</p>}
   </section>}
   {view==='permissions'&&<section className="ua-pane">
     <div className="ua-section-bar"><div><h3>Permission per Role</h3><p>Mengatur hak akses seluruh pengguna dengan role yang sama. Perubahan tidak memengaruhi role lain.</p></div><button className="ua-primary" type="button" disabled={busy||!dirtyPermissions} onClick={()=>void saveTemplate()}>Simpan {dirtyPermissions?dirtyPermissions+' Perubahan':'Permission'}</button></div>
     <div className="ua-filters">
       <label>Pilih Role<select value={selectedRole} disabled={busy} onChange={e=>{if(dirtyPermissions&&!window.confirm('Buang perubahan permission role ini yang belum disimpan?'))return;setSelectedRole(e.target.value as NativeRegistrationRole)}}>{nativeRegistrationRoles.map(r=><option key={r} value={r}>{r}</option>)}</select></label>
       <label>Cari menu<input type="search" value={permissionSearch} onChange={e=>setPermissionSearch(e.target.value)} placeholder="Cari menu / sub-menu…"/></label>
       <label>Grup<select value={permissionGroup} onChange={e=>setPermissionGroup(e.target.value)}><option value="all">Semua</option><option value="Form QC">Form QC</option><option value="Data UnM">Data UnM</option></select></label>
     </div>
     <div className="ua-scroll"><table className="ua-table"><thead><tr><th>Grup</th><th>Menu</th><th>Sub Menu</th><th>Permission Saat Ini</th><th>Ubah Permission</th></tr></thead><tbody>{permissionRows.map(item=>{
       const previous=currentServer[item.key],draft=currentDraft[item.key]
       return <tr key={item.key} className={draft!==previous?'ua-modified':''}>
         <td>{item.group}</td><td>{item.menu}</td><td>{item.subMenu}</td><td>{previous==='edit'?'Edit':previous==='view'?'Lihat':'Tidak Akses'}</td>
         <td><select aria-label={'Permission '+item.key} value={draft} disabled={busy} onChange={e=>setDraftTemplates(current=>({...current,[selectedRole]:{...currentDraft,[item.key]:e.target.value as AccessMode}}))}>
           <option value="none">Tidak Akses</option><option value="view">Lihat</option><option value="edit">Edit</option>
         </select></td>
       </tr>})}</tbody></table></div>
     <div className="ua-footer"><span>{dirtyPermissions} perubahan belum disimpan</span><button type="button" disabled={busy||!dirtyPermissions} onClick={()=>setDraftTemplates(old=>({...old,[selectedRole]:{...currentServer}}))}>Batalkan Perubahan</button><button className="ua-primary" disabled={busy||!dirtyPermissions} onClick={()=>void saveTemplate()}>Simpan Permission Role</button></div>
   </section>}
   {view==='registrations'&&<section className="ua-pane">
     <div className="ua-section-bar"><div><h3>Permintaan Registrasi</h3><p>Review registrasi hanya tahap persetujuan. Aktivasi akun Firebase baru membutuhkan backend tepercaya.</p></div><span>{requests.length} permintaan</span></div>
     <div className="ua-scroll"><table className="ua-table"><thead><tr><th>Nama</th><th>Username / Email</th><th>Role Diminta</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{requests.map(row=><tr key={row.uid}>
       <td>{row.fullName}</td><td>@{row.username}<small>{row.email}</small></td><td>{row.requestedRole}</td><td>{row.status}</td>
       <td>{row.status==='pending'?<div className="ua-actions">
         <select aria-label={'Role persetujuan '+row.username} value={requestRoles[row.uid]||row.requestedRole} disabled={busy} onChange={e=>setRequestRoles(old=>({...old,[row.uid]:e.target.value as NativeRegistrationRole}))}>{nativeRegistrationRoles.map(r=><option key={r} value={r}>{r}</option>)}</select>
         <button type="button" disabled={busy} className="ua-primary" onClick={()=>void review(row,'approve')}>Setujui</button>
         <button type="button" disabled={busy} onClick={()=>void review(row,'reject')}>Tolak</button>
       </div>:row.status==='approved_for_provisioning'?<span className="ua-muted">Menunggu aktivasi backend — belum dapat login operasional</span>:'—'}</td>
     </tr>)}</tbody></table></div>
     {!requests.length&&!busy&&<p className="ua-muted">Belum ada permintaan registrasi.</p>}
     {endpoint?<NativeNameReview review={command}/>:<p className="ua-info">Peninjauan nama dan aktivasi Firebase Authentication masih menunggu layanan backend. Tidak ada akun dibuat atau diaktifkan otomatis dari menu ini.</p>}
   </section>}
   {view==='logs'&&<NativeAdminLogs/>}
 </div>
}
