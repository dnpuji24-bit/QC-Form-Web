// UAT-only role creation UI. No role assignment, mutation or deletion.
import {useEffect,useRef,useState} from 'react'
import {PERMISSION_CATALOG,type AccessMode,type UserPermissions} from './accessControl'
type RoleRow={id:string;name:string;kind:'builtin'|'custom';revision:number;permissions:UserPermissions}
type Adapter={list:()=>Promise<RoleRow[]>;create:(input:{name:string;permissions:UserPermissions})=>Promise<RoleRow>}
const none=()=>Object.fromEntries(PERMISSION_CATALOG.map(p=>[p.key,'none'])) as UserPermissions
export default function UatAddRolePanel({adapter}:{adapter:Adapter}){
 const [rows,setRows]=useState<RoleRow[]>([]),[name,setName]=useState(''),[permissions,setPermissions]=useState<UserPermissions>(none),[busy,setBusy]=useState(true),[blocked,setBlocked]=useState(false),[message,setMessage]=useState('')
 const alive=useRef(false),locked=useRef(false)
 async function load(){
  if(locked.current)return
  locked.current=true;setBusy(true);setBlocked(true);setMessage('')
  try{const values=await adapter.list();if(alive.current){setRows(values);setBlocked(false);setMessage('Daftar role dimuat.')}}
  catch{if(alive.current){setRows([]);setMessage('Daftar role gagal dimuat.')}}
  finally{locked.current=false;if(alive.current)setBusy(false)}
 }
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false}},[])
 async function create(){
  if(locked.current||blocked||busy||name.trim().length<3)return
  const input={name,permissions:{...permissions}}
  locked.current=true;setBusy(true);setMessage('')
  try{
   const next=await adapter.create(input)
   if(next.kind!=='custom'||next.revision!==0||Object.entries(input.permissions).some(([k,v])=>next.permissions[k as keyof UserPermissions]!==v))throw Error('UNCONFIRMED_ROLE')
   if(alive.current){setRows(old=>[...old.filter(r=>r.id!==next.id),next]);setName('');setPermissions(none());setMessage('Role berhasil dibuat.')}
  }catch{if(alive.current){setBlocked(true);setMessage('Role tidak terkonfirmasi. Refresh daftar sebelum mencoba lagi.')}}
  finally{locked.current=false;if(alive.current)setBusy(false)}
 }
 return <section aria-label="Kelola role UAT">
  <h2>Role Management</h2><p>Role baru tidak otomatis diberikan kepada pengguna. Semua permission awal Tidak akses.</p>
  <button disabled={busy} onClick={()=>void load()}>Refresh daftar role</button>
  <div data-testid="role-message" aria-live="polite">{message}</div>
  <ul aria-label="Daftar role">{rows.map(r=><li key={r.id} data-testid={'role-'+r.id}>{r.name} — {r.kind==='builtin'?'Bawaan':'Custom'}</li>)}</ul>
  <h3>Add Role</h3><label>Nama role<input aria-label="Nama role" maxLength={50} value={name} disabled={busy||blocked} onChange={e=>setName(e.target.value)}/></label>
  <table><thead><tr><th>Menu</th><th>Default role baru</th></tr></thead><tbody>{PERMISSION_CATALOG.map(p=><tr key={p.key}><th scope="row">{p.group} / {p.subMenu}</th><td><select aria-label={'role-'+p.key} disabled={busy||blocked} value={permissions[p.key]??'none'} onChange={e=>setPermissions(old=>({...old,[p.key]:e.target.value as AccessMode}))}><option value="none">Tidak akses</option><option value="view">Lihat</option><option value="edit">Edit</option></select></td></tr>)}</tbody></table>
  <button disabled={busy||blocked||name.trim().length<3} onClick={()=>void create()}>Simpan role baru</button>
 </section>
}
