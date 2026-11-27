import {collection,doc,getDocFromServer,getDocsFromServer,query,where,limit,runTransaction,setDoc,serverTimestamp} from 'firebase/firestore'
import {firebaseAuth,firestoreDb} from './firebase'
import {readApprovedFirebaseSession} from './qcFirebaseSession'
import {canViewAccess,canEditAccess} from './accessControl'
import {canSyncVerifiedNativeUid} from './nativeOfflineRuntime'
import {buildBkmCandidates,type BkmCandidate,type BkmSource} from './bkmAggregation.mjs'
export type BkmInputRow={filterWo:string;candidate:BkmCandidate|null;bkm:string;note:string}
export type BkmDocument={id:string;revision:number;date:string;company:string;division:string;number:string;rows:BkmInputRow[]}
const COLLECTION='foreman_work_recaps'
const text=(v:unknown)=>String(v??'').trim()
const unique=(v:string[])=>[...new Set(v.filter(Boolean))]
const chunks=(v:string[],size=25)=>Array.from({length:Math.ceil(v.length/size)},(_,i)=>v.slice(i*size,(i+1)*size))
function assertDate(date:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Tanggal tidak valid.')}
async function context(edit=false){
 const auth=firebaseAuth,db=firestoreDb
 if(!auth?.currentUser||!db||!navigator.onLine||!canSyncVerifiedNativeUid(auth.currentUser.uid))throw Error('Sambungkan internet dan verifikasi sesi sebelum membaca atau menyimpan data BKM.')
 const uid=auth.currentUser.uid,user=await readApprovedFirebaseSession()
 if(auth.currentUser?.uid!==uid||user.firebaseUid!==uid)throw Error('Akun berubah.')
 if(!canViewAccess(user,'data_plan_actual')||(edit&&!canEditAccess(user,'data_plan_actual')))throw Error('Hak akses Actual Plan diperlukan.')
 return {db,uid,user,assertUid:()=>{if(auth.currentUser?.uid!==uid||!canSyncVerifiedNativeUid(uid))throw Error('Sesi berubah; ulangi setelah verifikasi online.')}}
}
export async function loadBkmCandidates(date:string){
 assertDate(date)
 const {db,assertUid}=await context()
 const source=async(name:string,field:string,value:string)=>{const snap=await getDocsFromServer(query(collection(db,name),where(field,'==',value)));assertUid();return snap.docs.map(d=>({...d.data(),id:d.id}) as BkmSource)}
 const [daily,actual]=await Promise.all([source('daily_plans','date',date),source('daily_reports','date',date)])
 const lines=unique([...daily,...actual].map(r=>text(r.monthlyPlanLineId)))
 const pids=unique([...daily,...actual].map(r=>text(r.pid||r.paddockRaw)))
 // Query only work lines relevant to the chosen day; no collection-wide listener.
 const byValues=async(name:string,field:string,values:string[])=>{
  const out:BkmSource[]=[]
  for(const group of chunks(values)){
   const snap=await getDocsFromServer(query(collection(db,name),where(field,'in',group)))
   assertUid();out.push(...snap.docs.map(d=>({...d.data(),id:d.id}) as BkmSource))
  }
  return [...new Map(out.map(r=>[r.id,r])).values()]
 }
 const [history,monthly,paddocks,materialSnap]=await Promise.all([
  byValues('daily_reports','monthlyPlanLineId',lines),byValues('monthly_plans','planLineId',lines),
  byValues('master_paddocks','pid',pids),getDocsFromServer(collection(db,'master_materials'))
 ])
 // Older records may use the document ID itself instead of planLineId.
 for(const id of lines.filter(id=>!monthly.some(m=>text(m.planLineId||m.planCode||m.id)===id))){
  if(id.includes('/'))continue
  const snap=await getDocFromServer(doc(db,'monthly_plans',id));assertUid()
  if(snap.exists())monthly.push({...snap.data(),id:snap.id} as BkmSource)
 }
 assertUid()
 const materials=materialSnap.docs.map(d=>({...d.data(),id:d.id}) as BkmSource)
 return {candidates:buildBkmCandidates({date,daily,actual,history,monthly,paddocks,materials}),sourceCount:daily.length+actual.length,loadedAt:new Date().toISOString()}
}
export async function listBkm(date:string){
 assertDate(date)
 const {db,uid,user,assertUid}=await context()
 const base=collection(db,COLLECTION)
 const snap=await getDocsFromServer(user.role==='owner'?query(base,where('date','==',date),limit(200)):query(base,where('ownerUid','==',uid),where('date','==',date),limit(200)))
 assertUid()
 return snap.docs.map(d=>{const v=d.data();return {id:d.id,revision:Number(v.revision),date:text(v.date),company:text(v.company),division:text(v.division),number:text(v.number),rows:v.rows as BkmInputRow[]}}).sort((a,b)=>a.number.localeCompare(b.number,'id',{numeric:true}))
}
export async function saveBkm(input:BkmDocument){
 assertDate(input.date)
 const {db,uid,user,assertUid}=await context(true)
 const rows=input.rows.filter(row=>row.candidate)
 if(!input.company.trim()||!input.division.trim()||!rows.length||rows.length>100)throw Error('PT, Divisi dan 1–100 pekerjaan diperlukan.')
 if(rows.some(r=>r.candidate?.conflict||r.candidate?.company!==input.company.toUpperCase()))throw Error('Periksa konflik Actual dan PT sebelum menyimpan.')
 if(new Set(rows.map(r=>r.candidate!.id)).size!==rows.length)throw Error('Pekerjaan ganda tidak dapat disimpan.')
 const actualIds=rows.flatMap(r=>r.candidate!.actualIds)
 if(new Set(actualIds).size!==actualIds.length)throw Error('Record Actual yang sama tidak boleh masuk lebih dari sekali.')
 const id=input.id||crypto.randomUUID(),ref=doc(db,COLLECTION,id)
 // For a new UUID, do not read a non-existent owner-scoped document.
 // Rules reject any collision because revision 1 cannot update existing data.
 if(!input.id){
  assertUid()
  await setDoc(ref,{schemaVersion:1,ownerUid:uid,revision:1,date:input.date,company:input.company.toUpperCase(),division:input.division,number:input.number,rows,updatedAt:serverTimestamp(),createdAt:serverTimestamp()})
  assertUid()
  return {id,revision:1}
 }
 const revision=await runTransaction(db,async tx=>{
  assertUid()
  const prev=await tx.get(ref)
  if(prev.exists()&&(prev.data().ownerUid!==uid&&user.role!=='owner'||prev.data().revision!==input.revision))throw Error('Dokumen telah berubah atau bukan milik akun ini. Muat ulang Data Rekap.')
  if(!prev.exists()&&input.id)throw Error('Dokumen tidak ditemukan.')
  const revision=(prev.exists()?Number(prev.data().revision):0)+1
  const value={schemaVersion:1,ownerUid:prev.exists()?prev.data().ownerUid:uid,revision,date:input.date,company:input.company.toUpperCase(),division:input.division,number:input.number,rows,updatedAt:serverTimestamp(),createdAt:prev.exists()?prev.data().createdAt:serverTimestamp()}
  tx.set(ref,value)
  return revision
 })
 assertUid()
 return {id,revision}
}
