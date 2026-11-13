import {useState,useRef,type FormEvent} from 'react'
import {EmailAuthProvider,reauthenticateWithCredential} from 'firebase/auth'
import {collection,query,where,limit,getDocsFromServer} from 'firebase/firestore'
import {firebaseAuth,firestoreDb} from './firebase'
import {readApprovedFirebaseSession} from './qcFirebaseSession'
import {nativePortalEnabled} from './qcNativePortalConfig'
import {canEditAccess} from './accessControl'
import type {User} from './types'
const endpoint=import.meta.env.VITE_QC_NATIVE_ADMIN_URL as string|undefined
const enabled=nativePortalEnabled&&import.meta.env.VITE_QC_NATIVE_NAME_REQUESTS==='true'&&Boolean(endpoint)
type Row={id:string;uid:string;username:string;oldFullName:string;newFullName:string;status:string}
async function listRequests(expectedUid:string,owner:boolean){
 const user=await readApprovedFirebaseSession()
 if(!firestoreDb||user.firebaseUid!==expectedUid||(owner&&user.role!=='owner'))throw Error('Sesi atau akses berubah.')
 const snap=await getDocsFromServer(query(collection(firestoreDb,'qc_native_name_requests'),where(owner?'status':'uid','==',owner?'pending':expectedUid),limit(100)))
 if(firebaseAuth?.currentUser?.uid!==expectedUid)throw Error('Sesi berubah.')
 return snap.docs.map(d=>({...d.data(),id:d.id} as Row))
}
export function NativeNameRequest({user}:{user:User}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[rows,setRows]=useState<Row[]>([])
 const locked=useRef(false),pending=useRef<{id:string;name:string}|null>(null)
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(locked.current||!enabled||!user.firebaseUid||!canEditAccess(user,'qc_settings'))return
  const form=e.currentTarget,data=new FormData(form),name=String(data.get('name')||'').trim()
  if(name.length<3||name.length>100||name===user.fullName)return setMessage('Nama baru harus berbeda dan terdiri dari 3–100 karakter.')
  if(pending.current&&pending.current.name!==name)return setMessage('Permintaan sebelumnya belum terkonfirmasi. Muat riwayat dahulu dan gunakan nama yang sama untuk retry.')
  locked.current=true;setBusy(true);setMessage('')
  try{
   const fresh=await readApprovedFirebaseSession(),current=firebaseAuth?.currentUser
   if(!current?.email||current.uid!==user.firebaseUid||fresh.firebaseUid!==user.firebaseUid||!canEditAccess(fresh,'qc_settings'))throw Error('Sesi atau akses berubah.')
   await reauthenticateWithCredential(current,EmailAuthProvider.credential(current.email,String(data.get('password')||'')))
   if(firebaseAuth?.currentUser?.uid!==current.uid)throw Error('Sesi berubah.')
   const token=await current.getIdToken(true)
   if(firebaseAuth?.currentUser?.uid!==current.uid)throw Error('Sesi berubah.')
   const url=new URL(endpoint!)
   if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Endpoint tidak aman.')
   const job=pending.current||{id:crypto.randomUUID(),name};pending.current=job
   const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'requestNameChange',requestId:job.id,newFullName:job.name}),redirect:'error',cache:'no-store'})
   const result=await response.json()
   if(firebaseAuth?.currentUser?.uid!==current.uid)throw Error('Sesi berubah.')
   if(!response.ok||result?.ok!==true)throw Error(String(result?.error||'Permintaan gagal.'))
   pending.current=null;form.reset();setMessage('Permintaan terkonfirmasi: '+String(result.status));setRows(await listRequests(current.uid,false))
  }catch(error){setMessage(error instanceof Error?error.message:'Permintaan belum terkonfirmasi.');const password=form.elements.namedItem('password') as HTMLInputElement|null;if(password)password.value=''}
  finally{locked.current=false;setBusy(false)}
 }
 async function load(){if(!user.firebaseUid||locked.current)return;locked.current=true;setBusy(true);setRows([]);try{const data=await listRequests(user.firebaseUid,false);setRows(data);if(pending.current&&data.some(r=>r.id===pending.current?.id))pending.current=null;setMessage('Riwayat dimuat.')}catch{setMessage('Riwayat tidak tersedia.')}finally{locked.current=false;setBusy(false)}}
 return <div className="panel form-stack"><h3>Permintaan perubahan nama</h3><p>Hanya nama lengkap. Username, UID, email, role, dan data QC lama tidak diubah.</p>{!enabled?<p>Fitur belum diaktifkan sampai permintaan akun lama selesai direkonsiliasi.</p>:<><form onSubmit={e=>void submit(e)}><fieldset disabled={busy||!canEditAccess(user,'qc_settings')}><label>Nama lengkap baru<input name="name" minLength={3} maxLength={100} required/></label><label>Password saat ini<input name="password" type="password" autoComplete="current-password" required/></label><button className="primary">Ajukan ke Owner</button></fieldset></form><button disabled={busy} onClick={()=>void load()}>Muat riwayat (maks. 100)</button>{rows.map(r=><p key={r.id}>{r.oldFullName} → {r.newFullName} · {r.status}</p>)}</>}{message&&<p role="status">{message}</p>}</div>
}
export function NativeNameReview({review}:{review:(body:Record<string,unknown>)=>Promise<unknown>}){
 const [rows,setRows]=useState<Row[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function load(){const user=await readApprovedFirebaseSession();if(!user.firebaseUid)throw Error('Sesi tidak tersedia.');setRows(await listRequests(user.firebaseUid,true))}
 async function run(fn:()=>Promise<unknown>){setBusy(true);setMessage('');try{await fn();await load();setMessage('Daftar diperbarui.')}catch(e){setMessage(e instanceof Error?e.message:'Permintaan gagal.')}finally{setBusy(false)}}
 return <div className="panel"><h3>Permintaan perubahan nama</h3>{!enabled?<p>Belum diaktifkan.</p>:<><button disabled={busy} onClick={()=>void run(async()=>{})}>Muat permintaan pending (maks. 100)</button>{rows.map(r=><div key={r.id}><p>@{r.username} · {r.oldFullName} → {r.newFullName}</p>{(['approve','reject'] as const).map(decision=><button key={decision} disabled={busy} onClick={()=>{if(window.confirm('Konfirmasi '+decision+' untuk permintaan ini?'))void run(()=>review({action:'reviewNameChange',requestId:r.id,decision}))}}>{decision==='approve'?'Approve':'Reject'}</button>)}</div>)}</>}{message&&<p role="status">{message}</p>}</div>
}
