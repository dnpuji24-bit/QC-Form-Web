// Separate UAT lab component only. Does not self-register or grant a role.
import {useEffect,useRef,useState} from 'react'
type Role={id:string;name:string}
type Registration={uid:string;status:'pending'|'approved'|'rejected'|'activated';revision:number;requestedRoleId:string;approvedRoleId:string|null;reviewedBy:string|null}
type Session={uid:string;role:string;policyRevision:number;permissions:Record<string,'none'|'view'|'edit'>}
type Adapter={roles:()=>Promise<Role[]>;status:()=>Promise<Registration|null>;submit:(roleId:string)=>Promise<Registration>;activate:()=>Promise<Session>}
export default function UatCustomRoleRegistrationPanel({actorUid,adapter}:{actorUid:string;adapter:Adapter}){
 const [roles,setRoles]=useState<Role[]>([]),[record,setRecord]=useState<Registration|null>(null),[choice,setChoice]=useState(''),[busy,setBusy]=useState(true),[blocked,setBlocked]=useState(true),[message,setMessage]=useState(''),[confirmed,setConfirmed]=useState<Session|null>(null)
 const alive=useRef(false),lock=useRef(false)
 async function load(){
  if(lock.current)return
  lock.current=true;setBusy(true);setBlocked(true);setRecord(null);setRoles([]);setConfirmed(null);setChoice('');setMessage('')
  try{
   const value=await adapter.status()
   if(value&&value.uid!==actorUid)throw Error('IDENTITY_CHANGED')
   const available=value===null?await adapter.roles():[]
   if(!Array.isArray(available)||available.some(r=>!/^custom-[a-z][a-z0-9-]{0,49}$/.test(r.id)||typeof r.name!=='string'))throw Error('INVALID_ROLE_LIST')
   if(alive.current){setRecord(value);setRoles(available);setBlocked(false);setMessage(value===null?'Pilih custom role untuk mengajukan pendaftaran.':'Status registrasi dimuat.')}
  }catch{if(alive.current){setBlocked(true);setMessage('Status tidak terkonfirmasi. Refresh sebelum melanjutkan.')}}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false}},[adapter,actorUid])
 async function submit(){
  if(lock.current||busy||blocked||record||!roles.some(r=>r.id===choice))return
  lock.current=true;setBusy(true);setMessage('')
  try{
   const result=await adapter.submit(choice)
   if(result.uid!==actorUid||result.status!=='pending'||result.revision!==0||result.requestedRoleId!==choice)throw Error('UNCONFIRMED_REGISTRATION')
   if(alive.current){setRecord(result);setRoles([]);setChoice('');setMessage('Permintaan dikirim. Menunggu persetujuan Owner.')}
  }catch{if(alive.current){setRecord(null);setRoles([]);setBlocked(true);setMessage('Pengajuan tidak terkonfirmasi. Refresh untuk melihat status terbaru.')}}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 async function activate(){
  if(lock.current||busy||blocked||record?.status!=='approved'||!record.approvedRoleId)return
  lock.current=true;setBusy(true);setMessage('')
  try{
   const session=await adapter.activate()
   if(session.uid!==actorUid||session.role!==record.approvedRoleId||session.policyRevision!==0)throw Error('UNCONFIRMED_ACTIVATION')
   const status=await adapter.status()
   if(status?.uid!==actorUid||status.status!=='activated'||status.approvedRoleId!==session.role)throw Error('UNCONFIRMED_ACTIVATION')
   if(alive.current){setConfirmed(session);setRecord(status);setMessage('Role aktif. Hak akses hanya mengikuti persetujuan Owner.')}
  }catch{if(alive.current){setRecord(null);setConfirmed(null);setBlocked(true);setMessage('Aktivasi tidak terkonfirmasi. Refresh untuk memeriksa status.')}}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 return <section aria-label="Pendaftaran custom role UAT">
  <h2>Registrasi Custom Role</h2>
  <p>Untuk akun UAT yang sudah diverifikasi. Memilih role bukan pemberian akses.</p>
  <button onClick={()=>void load()} disabled={busy}>Refresh status registrasi</button>
  <p data-testid="registration-message" role="status">{message}</p>
  <p data-testid="registration-state">{blocked?'blocked':busy?'loading':record?.status??'new'}</p>
  {record&&<div><p>Role diminta: <strong data-testid="requested-role">{record.requestedRoleId}</strong></p><p>Role disetujui: <strong data-testid="approved-role">{record.approvedRoleId??'—'}</strong></p></div>}
  {!busy&&!blocked&&!record&&<div>
   <label>Custom role yang diminta<select aria-label="Custom role yang diminta" value={choice} onChange={e=>setChoice(e.target.value)}><option value="">Pilih role</option>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
   <button disabled={!choice} onClick={()=>void submit()}>Ajukan registrasi</button>
  </div>}
  {!busy&&!blocked&&record?.status==='approved'&&<button onClick={()=>void activate()}>Aktifkan role disetujui</button>}
  {record?.status==='rejected'&&<p>Permintaan ditolak. Tidak ada akses yang diberikan.</p>}
  {record?.status==='activated'&&<p data-testid="activated-role">Role aktif: {record.approvedRoleId}</p>}
  {confirmed&&<p data-testid="activated-permission-summary">Summary: {confirmed.permissions.data_plan_summary}</p>}
 </section>
}
