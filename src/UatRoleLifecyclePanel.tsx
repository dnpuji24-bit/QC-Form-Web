// Owner-only custom role lifecycle panel for the isolated Auth/Firestore UAT lab.
// Never grants permission locally. All writes flow through the verified Owner service.
import {useEffect,useRef,useState} from 'react'
import {PERMISSION_CATALOG,type AccessMode,type UserPermissions} from './accessControl'
type Definition={id:string;name:string;kind:'custom';revision:number;permissions:UserPermissions}
type Member={uid:string;policyRevision:number}
type Preview={definition:Definition;members:Member[];readOnly:true}
type Adapter={
 list:()=>Promise<Definition[]>
 preview:(roleId:string)=>Promise<Preview>
 update:(input:{roleId:string;expectedRevision:number;permissions:UserPermissions;expectedMembers:Member[]})=>Promise<{definition:Definition;affectedCount:number}>
 retire:(input:{roleId:string;expectedRevision:number;expectedMembers:[]})=>Promise<{roleId:string;retired:true}>
}
const keys=PERMISSION_CATALOG.map(x=>x.key)
const mode=(x:unknown):x is AccessMode=>x==='none'||x==='view'||x==='edit'
const isDefinition=(v:Definition)=>!!v&&v.kind==='custom'&&/^custom-[a-z][a-z0-9-]{0,49}$/.test(v.id)&&typeof v.name==='string'&&v.name.length>=3&&Number.isSafeInteger(v.revision)&&v.revision>=0&&v.revision<1000000&&!!v.permissions&&Object.getPrototypeOf(v.permissions)===Object.prototype&&Object.keys(v.permissions).length===keys.length&&keys.every(k=>mode(v.permissions[k]))
const isMembers=(v:Member[])=>Array.isArray(v)&&v.length<=75&&v.every((m,i)=>m&&/^uat-[a-z0-9-]{1,60}$/.test(m.uid)&&Number.isSafeInteger(m.policyRevision)&&m.policyRevision>=0&&m.policyRevision<1000000&&(i===0||v[i-1].uid<m.uid))
const samePermissions=(a:UserPermissions,b:UserPermissions)=>keys.every(k=>a[k]===b[k])
export default function UatRoleLifecyclePanel({adapter}:{adapter:Adapter}){
 const [roles,setRoles]=useState<Definition[]>([]),[selected,setSelected]=useState(''),[preview,setPreview]=useState<Preview|null>(null)
 const [draft,setDraft]=useState<UserPermissions>({}),[intent,setIntent]=useState<'edit'|'delete'|null>(null),[typed,setTyped]=useState('')
 const [busy,setBusy]=useState(true),[blocked,setBlocked]=useState(true),[message,setMessage]=useState('')
 const alive=useRef(false),locked=useRef(false),epoch=useRef(0)
 const changes=preview?PERMISSION_CATALOG.filter(k=>draft[k.key]!==preview.definition.permissions[k.key]):[]
 const canDelete=!!preview&&preview.members.length===0
 function clear(){
  setSelected('');setPreview(null);setDraft({});setIntent(null);setTyped('')
 }
 async function load(){
  if(locked.current)return
  locked.current=true
  const ticket=++epoch.current
  setBusy(true);setBlocked(true);setRoles([]);clear();setMessage('')
  try{
   const list=await adapter.list()
   if(!Array.isArray(list)||list.length>100||list.some(r=>!isDefinition(r))||new Set(list.map(r=>r.id)).size!==list.length)throw Error('INVALID_ROLE_LIST')
   if(alive.current&&ticket===epoch.current){setRoles(list);setBlocked(false);setMessage('Daftar custom role dimuat.')}
  }catch{if(alive.current&&ticket===epoch.current){setBlocked(true);setMessage('Daftar role tidak terkonfirmasi. Refresh diperlukan.')}}
  finally{locked.current=false;if(alive.current&&ticket===epoch.current)setBusy(false)}
 }
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;epoch.current++}},[adapter])
 async function choose(id:string){
  if(locked.current||busy||blocked)return
  locked.current=true;const ticket=++epoch.current
  setBusy(true);clear();setSelected(id);setMessage('')
  try{
   if(!roles.some(r=>r.id===id))throw Error('ROLE_NOT_IN_LIST')
   const value=await adapter.preview(id)
   if(!value||value.readOnly!==true||!isDefinition(value.definition)||value.definition.id!==id||!isMembers(value.members))throw Error('INVALID_PREVIEW')
   if(alive.current&&ticket===epoch.current){
    setPreview(value);setDraft({...value.definition.permissions});setMessage('Preview role dan akun terdampak dimuat.')
   }
  }catch{if(alive.current&&ticket===epoch.current){clear();setBlocked(true);setMessage('Preview role gagal. Refresh sebelum mencoba lagi.')}}
  finally{locked.current=false;if(alive.current&&ticket===epoch.current)setBusy(false)}
 }
 function editKey(key:keyof UserPermissions,value:AccessMode){
  setDraft(d=>({...d,[key]:value}));setIntent(null);setTyped('')
 }
 function review(action:'edit'|'delete'){
  if(busy||blocked||!preview||locked.current)return
  if(action==='edit'&&changes.length===0)return
  if(action==='delete'&&!canDelete)return
  setIntent(action);setTyped('')
 }
 async function commit(){
  if(locked.current||busy||blocked||!preview||!intent)return
  const roleId=preview.definition.id,revision=preview.definition.revision
  if(typed!==(intent==='edit'?'UBAH ':'HAPUS ')+roleId)return
  if(intent==='edit'&&changes.length===0||intent==='delete'&&!canDelete)return
  const action=intent
  locked.current=true;const ticket=++epoch.current
  setBusy(true);setBlocked(true);setMessage('');setIntent(null);setTyped('')
  try{
   if(action==='edit'){
    const result=await adapter.update({roleId,expectedRevision:revision,permissions:{...draft},expectedMembers:preview.members.map(m=>({...m}))})
    if(!result||!isDefinition(result.definition)||result.definition.id!==roleId||result.definition.name!==preview.definition.name||result.definition.revision!==revision+1||result.affectedCount!==preview.members.length||!samePermissions(result.definition.permissions,draft))throw Error('UNCONFIRMED_EDIT')
   }else{
    const result=await adapter.retire({roleId,expectedRevision:revision,expectedMembers:[]})
    if(!result||result.retired!==true||result.roleId!==roleId)throw Error('UNCONFIRMED_DELETE')
   }
   if(alive.current&&ticket===epoch.current){setRoles([]);clear();setMessage(action==='edit'?'Perubahan role diterima. Refresh untuk mengambil revisi terbaru.':'Role telah diarsipkan. Refresh untuk melihat daftar terbaru.')}
  }catch{if(alive.current&&ticket===epoch.current){setRoles([]);clear();setMessage('Hasil perubahan tidak terkonfirmasi. Refresh sebelum tindakan lain. Jangan ulangi pengiriman tanpa memeriksa status.')}}
  finally{locked.current=false;if(alive.current&&ticket===epoch.current)setBusy(false)}
 }
 return <section aria-label="Edit dan hapus custom role UAT">
  <h2>Edit & Delete Custom Role</h2>
  <p>Hanya role custom. Nama dan ID tidak dapat diubah; role bawaan dan Owner dilindungi.</p>
  <button disabled={busy} onClick={()=>void load()}>Refresh daftar lifecycle role</button>
  <p data-testid="lifecycle-message" role="status">{message}</p>
  <p data-testid="lifecycle-state">{busy?'loading':blocked?'blocked':preview?'preview':'ready'}</p>
  {!blocked&&<label>Role yang dikelola
   <select aria-label="Role yang dikelola" value={selected} disabled={busy} onChange={e=>void choose(e.target.value)}>
    <option value="">Pilih custom role</option>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
   </select>
  </label>}
  {!blocked&&preview&&<div>
   <h3>{preview.definition.name}</h3>
   <p>ID: <strong data-testid="lifecycle-role-id">{preview.definition.id}</strong></p>
   <p>Revisi katalog: <strong data-testid="lifecycle-revision">{preview.definition.revision}</strong></p>
   <p>Akun terdampak: <strong data-testid="lifecycle-member-count">{preview.members.length}</strong></p>
   {preview.members.length>0&&<ul aria-label="Akun yang menggunakan role">{preview.members.map(m=><li key={m.uid}>{m.uid} · revisi permission {m.policyRevision}</li>)}</ul>}
   <table><thead><tr><th>Menu</th><th>Izin saat ini</th><th>Izin baru</th></tr></thead>
    <tbody>{PERMISSION_CATALOG.map(item=><tr key={item.key}><th scope="row">{item.group} / {item.subMenu}</th><td>{preview.definition.permissions[item.key]}</td>
     <td><select aria-label={'lifecycle-'+item.key} value={draft[item.key]??'none'} disabled={busy} onChange={e=>editKey(item.key,e.target.value as AccessMode)}>
      <option value="none">Tidak akses</option><option value="view">Lihat</option><option value="edit">Edit</option>
     </select></td></tr>)}</tbody>
   </table>
   <p data-testid="lifecycle-diff-count">Permission berubah: {changes.length}</p>
   <button disabled={busy||changes.length===0} onClick={()=>review('edit')}>Tinjau edit role</button>
   <button disabled={busy||!canDelete} onClick={()=>review('delete')}>Tinjau hapus role</button>
   {!canDelete&&<p data-testid="lifecycle-delete-warning">Role masih digunakan {preview.members.length} akun. Pindahkan setiap pengguna melalui Assign Role sebelum menghapus.</p>}
   {intent&&<div role="group" aria-label="Konfirmasi perubahan role">
    <h4>{intent==='edit'?'Konfirmasi perubahan permission':'Konfirmasi pengarsipan role'}</h4>
    <p>{intent==='edit'?'Perubahan akan diterapkan ke seluruh akun yang menggunakan role; manual override tetap dipertahankan.':'Role diarsipkan permanen dan ID tidak dapat digunakan kembali. Riwayat audit dipertahankan.'}</p>
    {intent==='edit'&&<ul aria-label="Ringkasan permission berubah">{changes.map(x=><li key={x.key}>{x.key}: {preview.definition.permissions[x.key]} → {draft[x.key]}</li>)}</ul>}
    <p>Ketik <strong>{intent==='edit'?'UBAH ':'HAPUS '}{preview.definition.id}</strong> untuk konfirmasi.</p>
    <input aria-label="Ketik konfirmasi role" value={typed} onChange={e=>setTyped(e.target.value)}/>
    <button disabled={busy||typed!==(intent==='edit'?'UBAH ':'HAPUS ')+preview.definition.id} onClick={()=>void commit()}>{intent==='edit'?'Konfirmasi edit role':'Konfirmasi hapus role'}</button>
    <button disabled={busy} onClick={()=>{setIntent(null);setTyped('')}}>Batal konfirmasi</button>
   </div>}
  </div>}
 </section>
}
