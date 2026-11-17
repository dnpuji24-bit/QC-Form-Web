// UAT candidate, not mounted in the operational portal. The trusted adapter
// must authorize every read/write using the current server identity.
import {useEffect,useRef,useState} from 'react'
import {PERMISSION_CATALOG,type AccessMode,type PermissionKey} from './accessControl'
type MapOfModes=Partial<Record<PermissionKey,AccessMode>>
export type OwnerPermissionRow={uid:string;role:string;enabled:boolean;policyRevision:number;manualOverrides:MapOfModes;permissions:MapOfModes}
export type OwnerPermissionAdapter={list:()=>Promise<OwnerPermissionRow[]>;patch:(input:{targetUid:string;expectedRevision:number;patch:MapOfModes})=>Promise<OwnerPermissionRow>}
type Props={actorUid:string;isOwner:boolean;adapter:OwnerPermissionAdapter}
export default function UatOwnerPermissionPanel(props:Props){
 if(!props.isOwner||!props.actorUid)return <p role="alert">Akses Owner diperlukan.</p>
 return <Editor key={props.actorUid} {...props}/>
}
function Editor({actorUid,adapter}:Props){
 const [rows,setRows]=useState<OwnerPermissionRow[]>([]),[target,setTarget]=useState(''),[patch,setPatch]=useState<MapOfModes>({}),[busy,setBusy]=useState(true),[message,setMessage]=useState(''),[blocked,setBlocked]=useState(false)
 const alive=useRef(false),locked=useRef(false)
 const selected=rows.find(r=>r.uid===target)
 async function load(){
  if(locked.current)return
  locked.current=true;setBusy(true);setMessage('');setPatch({});setTarget('');setRows([]);setBlocked(false)
  try{
   const data=await adapter.list()
   if(alive.current){setRows(data.filter(r=>r.uid!==actorUid&&r.role!=='owner'));setMessage('Hak akses dimuat.')}
  }catch{if(alive.current){setBlocked(true);setMessage('Hak akses tidak dapat dimuat. Refresh diperlukan.')}}
  finally{locked.current=false;if(alive.current)setBusy(false)}
 }
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false}},[])
 async function save(){
  if(!selected||busy||blocked||locked.current||!Object.keys(patch).length)return
  const input={targetUid:selected.uid,expectedRevision:selected.policyRevision,patch:{...patch}}
  locked.current=true;setBusy(true);setMessage('')
  try{
   const next=await adapter.patch(input)
   if(next.uid!==input.targetUid||next.policyRevision!==input.expectedRevision+1||Object.entries(input.patch).some(([k,v])=>next.manualOverrides[k as PermissionKey]!==v))throw Error('UNCONFIRMED_PERMISSION')
   if(alive.current){setRows(old=>old.map(r=>r.uid===next.uid?next:r));setPatch({});setMessage('Hak akses tersimpan.')}
  }catch{if(alive.current){setBlocked(true);setMessage('Perubahan tidak terkonfirmasi. Refresh sebelum mencoba lagi.')}}
  finally{locked.current=false;if(alive.current)setBusy(false)}
 }
 return <section aria-label="Hak akses pengguna UAT">
  <h2>Hak akses per pengguna</h2><p>Default role adalah baseline. Override manual hanya berlaku pada pengguna terpilih.</p>
  <button disabled={busy} onClick={()=>void load()}>Refresh hak akses</button>
  <p role="status">{message}</p>
  <label>Pengguna<select aria-label="Pengguna" disabled={busy||blocked||Object.keys(patch).length>0} value={target} onChange={e=>{setTarget(e.target.value);setPatch({});setMessage('')}}><option value="">Pilih pengguna</option>{rows.map(r=><option key={r.uid} value={r.uid}>{r.uid} — {r.role}{r.enabled?'':' (nonaktif)'}</option>)}</select></label>
  {selected&&<><p>Revisi: <output aria-label="Revisi">{selected.policyRevision}</output></p>
   <table><thead><tr><th>Menu</th><th>Efektif saat ini</th><th>Override tersimpan</th><th>Perubahan</th></tr></thead><tbody>{PERMISSION_CATALOG.map(item=><tr key={item.key}><th scope="row">{item.group} / {item.subMenu}</th><td data-testid={'effective-'+item.key}>{selected.permissions[item.key]||'none'}</td><td data-testid={'manual-'+item.key}>{selected.manualOverrides[item.key]??'Default role'}</td><td><select aria-label={item.key} disabled={busy||blocked} value={patch[item.key]??''} onChange={e=>{const v=e.target.value as AccessMode|'';setPatch(old=>{const next={...old};if(v==='')delete next[item.key];else next[item.key]=v;return next})}}><option value="">Tidak diubah</option><option value="none">Tidak akses</option><option value="view">Lihat</option><option value="edit">Edit</option></select></td></tr>)}</tbody></table>
   <button disabled={busy||blocked||!Object.keys(patch).length} onClick={()=>setPatch({})}>Batalkan perubahan</button>
   <button disabled={busy||blocked||!Object.keys(patch).length} onClick={()=>void save()}>Simpan hak akses pengguna</button>
  </>}
 </section>
}
