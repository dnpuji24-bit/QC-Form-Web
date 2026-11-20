// Only shown after a verified Owner session in dedicated browser lab.
import {useEffect,useRef,useState} from 'react'
type Role={id:string;name:string}
type Registration={uid:string;status:'pending'|'approved'|'rejected'|'activated';revision:number;requestedRoleId:string;approvedRoleId:string|null;reviewedBy:string|null}
type Adapter={roles:()=>Promise<Role[]>;inbox:()=>Promise<Registration[]>;review:(input:{targetUid:string;expectedRevision:number;decision:'approve'|'reject';approvedRoleId:string|null})=>Promise<Registration>}
export default function UatCustomRoleApprovalPanel({adapter}:{adapter:Adapter}){
 const [rows,setRows]=useState<Registration[]>([]),[roles,setRoles]=useState<Role[]>([]),[target,setTarget]=useState(''),[approved,setApproved]=useState(''),[busy,setBusy]=useState(true),[blocked,setBlocked]=useState(true),[message,setMessage]=useState('')
 const alive=useRef(false),lock=useRef(false)
 const chosen=rows.find(r=>r.uid===target&&r.status==='pending'&&r.revision===0)
 async function load(){
  if(lock.current)return
  lock.current=true;setBusy(true);setBlocked(true);setRows([]);setRoles([]);setTarget('');setApproved('');setMessage('')
  try{
   const [items,options]=await Promise.all([adapter.inbox(),adapter.roles()])
   if(!Array.isArray(items)||items.length>100||new Set(items.map(x=>x.uid)).size!==items.length||items.some(x=>!/^uat-[a-z0-9-]{1,60}$/.test(x.uid)))throw Error('INVALID_INBOX')
   if(!Array.isArray(options)||options.some(x=>!/^custom-[a-z][a-z0-9-]{0,49}$/.test(x.id)))throw Error('INVALID_ROLES')
   if(alive.current){setRows(items);setRoles(options);setBlocked(false);setMessage('Daftar permintaan dimuat.')}
  }catch{if(alive.current){setBlocked(true);setMessage('Daftar permintaan tidak terkonfirmasi. Refresh sebelum melanjutkan.')}}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false}},[adapter])
 async function decide(decision:'approve'|'reject'){
  if(!chosen||lock.current||busy||blocked||(decision==='approve'&&!roles.some(r=>r.id===approved)))return
  const input={targetUid:chosen.uid,expectedRevision:0,decision,approvedRoleId:decision==='approve'?approved:null}
  lock.current=true;setBusy(true);setMessage('')
  try{
   const result=await adapter.review(input)
   if(result.uid!==chosen.uid||result.revision!==1||result.status!==(decision==='approve'?'approved':'rejected')||result.approvedRoleId!==input.approvedRoleId)throw Error('UNCONFIRMED_REVIEW')
   if(alive.current){setRows(old=>old.map(r=>r.uid===result.uid?result:r));setTarget('');setApproved('');setMessage(decision==='approve'?'Permintaan disetujui.':'Permintaan ditolak.')}
  }catch{if(alive.current){setRows([]);setRoles([]);setTarget('');setApproved('');setBlocked(true);setMessage('Keputusan tidak terkonfirmasi. Refresh sebelum mencoba kembali.')}}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 return <section aria-label="Persetujuan registrasi custom role">
  <h2>Review Registrasi Custom Role</h2>
  <p>Owner memilih role yang disetujui secara eksplisit. Persetujuan belum mengaktifkan akun.</p>
  <button disabled={busy} onClick={()=>void load()}>Refresh permintaan Owner</button>
  <p data-testid="owner-registration-message" role="status">{message}</p>
  <p data-testid="owner-registration-state">{blocked?'blocked':busy?'loading':'ready'}</p>
  {!blocked&&<div>
    <label>Permintaan menunggu keputusan<select aria-label="Permintaan menunggu keputusan" disabled={busy} value={target} onChange={e=>{setTarget(e.target.value);setApproved('')}}><option value="">Pilih permintaan</option>{rows.filter(r=>r.status==='pending').map(r=><option key={r.uid} value={r.uid}>{r.uid} — {r.requestedRoleId}</option>)}</select></label>
    {chosen&&<div><p>Pengguna: <strong>{chosen.uid}</strong></p><p>Role yang diminta: <strong data-testid="owner-requested-role">{chosen.requestedRoleId}</strong></p>
      <label>Role disetujui oleh Owner<select aria-label="Role disetujui oleh Owner" value={approved} disabled={busy} onChange={e=>setApproved(e.target.value)}><option value="">Pilih role</option>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <button disabled={busy||!approved} onClick={()=>void decide('approve')}>Setujui registrasi</button>
      <button disabled={busy} onClick={()=>void decide('reject')}>Tolak registrasi</button>
    </div>}
    <ul aria-label="Riwayat keputusan">{rows.filter(r=>r.status!=='pending').map(r=><li key={r.uid}>{r.uid} — {r.status}</li>)}</ul>
   </div>}
 </section>
}
