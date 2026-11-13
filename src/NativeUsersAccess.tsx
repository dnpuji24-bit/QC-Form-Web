import {NativeNameReview} from './NativeNameRequests'
import {useEffect,useState} from 'react'
import {collection,getDocsFromServer,query,orderBy,limit} from 'firebase/firestore'
import {firebaseAuth,firestoreDb} from './firebase'
import {readApprovedFirebaseSession} from './qcFirebaseSession'
import {listNativeRegistrations,reviewNativeRegistration,nativeRegistrationRoles,type NativeRegistrationRole,type NativeRegistrationRequest} from './qcNativeRegistration'
import {PERMISSION_CATALOG,type AccessMode} from './accessControl'
type Row={uid:string;username:string;fullName:string;role:string;active:boolean;status:string}
type Permissions=Record<string,AccessMode>
const endpoint=import.meta.env.VITE_QC_NATIVE_ADMIN_URL as string|undefined
async function owner(){
 const user=await readApprovedFirebaseSession()
 if(user.role!=='owner'||!firestoreDb||firebaseAuth?.currentUser?.uid!==user.firebaseUid)throw Error('Owner aktif diperlukan.')
 return {db:firestoreDb,uid:user.firebaseUid}
}
export async function command(body:Record<string,unknown>,expectedUid?:string):Promise<Record<string,unknown>>{
 const {uid}=await owner()
 if(expectedUid!==undefined&&uid!==expectedUid)throw Error('Sesi berubah.')
 if(!endpoint)throw Error('Endpoint administrasi belum dikonfigurasi.')
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
 async function load(){setBusy(true);setRows([]);try{const {db,uid}=await owner();const snap=await getDocsFromServer(query(collection(db,'qc_admin_audit'),orderBy('createdAt','desc'),limit(100)));if(firebaseAuth?.currentUser?.uid!==uid)throw Error('Sesi berubah.');setRows(snap.docs.map(d=>({id:d.id,...d.data()})));setMessage('')}catch{setMessage('Log administrasi tidak tersedia atau akses ditolak.')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[])
 return <section className="panel"><h3>Activity Logs — Administrasi</h3><p>100 tindakan administrasi terbaru. Log operasional QC historis belum dipindahkan.</p><button disabled={busy} onClick={()=>void load()}>Refresh log</button><p role="status">{message}</p><div className="table-wrap"><table><thead><tr><th>Waktu</th><th>Tindakan</th><th>Pelaksana</th><th>Target</th></tr></thead><tbody>{rows.map(r=><tr key={String(r.id)}><td>{String((r.createdAt as {toDate?:()=>Date}|undefined)?.toDate?.().toLocaleString('id-ID')||'-')}</td><td>{String(r.action||'')}</td><td>{String(r.actorUid||'')}</td><td>{String(r.target||'')}</td></tr>)}</tbody></table></div></section>
}
export default function NativeUsersAccess(){
 const [users,setUsers]=useState<Row[]>([]),[requests,setRequests]=useState<NativeRegistrationRequest[]>([]),[roles,setRoles]=useState<Record<string,NativeRegistrationRole>>({}),[templates,setTemplates]=useState<Record<string,Permissions>>({}),[selected,setSelected]=useState<NativeRegistrationRole>('manager'),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function load(){
  const {db,uid}=await owner()
  const [u,r,t]=await Promise.all([getDocsFromServer(collection(db,'users')),listNativeRegistrations(),getDocsFromServer(collection(db,'role_access'))])
  if(firebaseAuth?.currentUser?.uid!==uid)throw Error('Sesi berubah.')
  setUsers(u.docs.map(d=>({...d.data(),uid:d.id} as Row)));setRequests(r)
  setTemplates(Object.fromEntries(t.docs.map(d=>[d.id,Object.fromEntries(PERMISSION_CATALOG.map(p=>{const v=d.data().permissions?.[p.key];return [p.key,['none','view','edit'].includes(v)?v:'none']}))])))
 }
 async function act(fn:()=>Promise<unknown>){setBusy(true);setMessage('');try{await fn();await load();setMessage('Berhasil.')}catch(e){setMessage(e instanceof Error?e.message:'Gagal.')}finally{setBusy(false)}}
 useEffect(()=>{void act(async()=>{})},[])
 const permissions=templates[selected]||Object.fromEntries(PERMISSION_CATALOG.map(p=>[p.key,'none'])) as Permissions
 const roleSelect=(uid:string,role:string)=><select disabled={busy} value={roles[uid]||role} onChange={e=>setRoles(old=>({...old,[uid]:e.target.value as NativeRegistrationRole}))}>{nativeRegistrationRoles.map(r=><option key={r}>{r}</option>)}</select>
 return <section><h3>Users & Access — Firebase</h3><p role="status">{message}</p>{!endpoint&&<p className="alert">Endpoint administrasi belum tersedia. Aktivasi dan perubahan role/permission dinonaktifkan.</p>}<button disabled={busy} onClick={()=>void act(async()=>{})}>Refresh</button><div className="panel"><h3>Registrasi</h3>{requests.map(r=><div key={r.uid}><p>{r.fullName} · {r.username} · {r.status}</p>{r.status==='pending'&&<>{roleSelect(r.uid,r.requestedRole)}<button disabled={busy} onClick={()=>void act(()=>reviewNativeRegistration(r.uid,'approve',roles[r.uid]||r.requestedRole))}>Approve</button><button disabled={busy} onClick={()=>void act(()=>reviewNativeRegistration(r.uid,'reject',r.requestedRole))}>Reject</button></>}{r.status==='approved_for_provisioning'&&<button disabled={busy||!endpoint} onClick={()=>void act(()=>command({action:'activate',uid:r.uid}))}>Aktifkan</button>}</div>)}</div><div className="panel"><h3>Pengguna</h3>{users.map(u=><div key={u.uid}><p>{u.fullName} · @{u.username} · {u.role} · {u.active?'Aktif':'Nonaktif'}</p>{u.role!=='owner'&&['approved','APPROVED'].includes(u.status)&&<>{roleSelect(u.uid,u.role)}<button disabled={busy||!endpoint||!roles[u.uid]} onClick={()=>void act(()=>command({action:'setRole',uid:u.uid,role:roles[u.uid]}))}>Simpan role</button><button disabled={busy||!endpoint} onClick={()=>{if(window.confirm('Ubah status aktif akun ini?'))void act(()=>command({action:'setActive',uid:u.uid,active:!u.active}))}}>{u.active?'Nonaktifkan':'Aktifkan kembali'}</button></>}</div>)}</div><div className="panel"><h3>Hak akses per role</h3><select value={selected} onChange={e=>setSelected(e.target.value as NativeRegistrationRole)}>{nativeRegistrationRoles.map(r=><option key={r}>{r}</option>)}</select>{PERMISSION_CATALOG.map(p=><label key={p.key}>{p.group} / {p.subMenu}<select disabled={busy||!endpoint} value={permissions[p.key]} onChange={e=>setTemplates(old=>({...old,[selected]:{...permissions,[p.key]:e.target.value as AccessMode}}))}><option value="none">Tidak akses</option><option value="view">Lihat</option><option value="edit">Edit</option></select></label>)}<button disabled={busy||!endpoint} onClick={()=>{if(window.confirm('Simpan hak akses seluruh pengguna role ini?'))void act(()=>command({action:'setPermissions',role:selected,permissions}))}}>Simpan permission</button></div><NativeNameReview review={command}/><NativeAdminLogs/></section>
}
