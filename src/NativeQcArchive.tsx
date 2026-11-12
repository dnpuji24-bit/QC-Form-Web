import {useState} from 'react'
import {collection,getDocsFromServer,query,orderBy,limit} from 'firebase/firestore'
import {firebaseAuth,firestoreDb} from './firebase'
import {readApprovedFirebaseSession} from './qcFirebaseSession'
import {command} from './NativeUsersAccess'
import {nativePortalEnabled} from './qcNativePortalConfig'
import {qcFirestoreOnly} from './qcCutover'
import {isOperationalQcId} from './qcOperationalFormBridge'
import type {QcRecord,User} from './types'

export const nativeArchiveEnabled=nativePortalEnabled&&qcFirestoreOnly&&import.meta.env.VITE_QC_NATIVE_ARCHIVE==='true'&&Boolean(import.meta.env.VITE_QC_NATIVE_ADMIN_URL)
export function canArchiveQc(user:User,record:QcRecord){
 return nativeArchiveEnabled&&user.role==='owner'&&isOperationalQcId(record.id)&&record.firestoreSaveState==='confirmed'&&typeof record.saveType==='string'&&['draft','ready','uploaded'].includes(record.saveType)&&typeof record.clientRevision==='string'
}
export async function archiveQcFromPortal(record:QcRecord,reason:string){
 if(!nativeArchiveEnabled||!isOperationalQcId(record.id)||record.firestoreSaveState!=='confirmed'||typeof record.clientRevision!=='string')throw Error('QC archive belum tersedia untuk record ini.')
 await command({action:'archiveQc',recordId:record.id,baseRevision:record.clientRevision,reason,operationId:crypto.randomUUID()})
}
type Marker={recordId:string;operationId:string;reason:string}
export function NativeQcArchive(){
 const [rows,setRows]=useState<Marker[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[selected,setSelected]=useState<Marker|null>(null),[reason,setReason]=useState('')
 async function read(){
  const user=await readApprovedFirebaseSession(),db=firestoreDb
  if(!db||user.role!=='owner'||firebaseAuth?.currentUser?.uid!==user.firebaseUid)throw Error('Owner aktif diperlukan.')
  const snap=await getDocsFromServer(query(collection(db,'qc_archive_markers'),orderBy('archivedAt','desc'),limit(100)))
  if(firebaseAuth?.currentUser?.uid!==user.firebaseUid)throw Error('Sesi berubah.')
  setRows(snap.docs.map(d=>({recordId:d.id,operationId:String(d.data().operationId||''),reason:String(d.data().reason||'')})))
 }
 async function refresh(){setBusy(true);setMessage('');setSelected(null);setRows([]);try{await read()}catch(e){setMessage(e instanceof Error?e.message:'Gagal membaca arsip.')}finally{setBusy(false)}}
 async function restore(){
  if(!selected||!nativeArchiveEnabled||reason.trim().length<5||!navigator.onLine)return
  if(!window.confirm('Pulihkan QC dan Actual Plan yang terkait?'))return
  setBusy(true);setMessage('')
  try{await command({action:'restoreQc',recordId:selected.recordId,archiveOperationId:selected.operationId,operationId:crypto.randomUUID(),reason:reason.trim()});setSelected(null);setReason('');setRows([]);setMessage('QC dipulihkan. Muat ulang daftar arsip dan verifikasi Actual Plan.')}
  catch(e){setMessage(e instanceof Error?e.message:'Restore gagal. Periksa data sebelum mencoba lagi.')}finally{setBusy(false)}
 }
 if(!nativePortalEnabled)return null
 return <section className="panel"><h3>QC Archive</h3><p>100 arsip terbaru. Foto asli tidak dihapus. Record historis belum didukung.</p>{!nativeArchiveEnabled&&<p>Archive dan Restore belum diaktifkan.</p>}<button disabled={busy} onClick={()=>void refresh()}>Muat arsip</button><p role="status">{message}</p><div className="table-wrap"><table><thead><tr><th>Record ID</th><th>Alasan pengarsipan</th><th>Aksi</th></tr></thead><tbody>{rows.map(r=><tr key={r.recordId}><td>{r.recordId}</td><td>{r.reason}</td><td><button disabled={busy||!nativeArchiveEnabled||!r.operationId} onClick={()=>{setSelected(r);setReason('')}}>Restore</button></td></tr>)}</tbody></table></div>{selected&&<div><p>Restore: {selected.recordId}</p><label>Alasan pemulihan<textarea value={reason} maxLength={300} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||reason.trim().length<5} onClick={()=>void restore()}>Konfirmasi Restore</button><button disabled={busy} onClick={()=>setSelected(null)}>Batal</button></div>}</section>
}
