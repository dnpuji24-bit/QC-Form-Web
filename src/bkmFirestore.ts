import {collection,doc,getDocFromServer,getDocsFromServer,query,where,limit,runTransaction,setDoc,serverTimestamp} from 'firebase/firestore'
import {firebaseAuth,firestoreDb} from './firebase'
import {readApprovedFirebaseSession} from './qcFirebaseSession'
import {canViewAccess,canEditAccess} from './accessControl'
import {canSyncVerifiedNativeUid} from './nativeOfflineRuntime'
import {buildBkmCandidates,type BkmCandidate,type BkmSource} from './bkmAggregation.mjs'
import {bkmValidQuantity,type BkmActivity,type BkmPaddock} from './bkmRealization.mjs'
import {bkmOperationCandidate,bkmOperationIncomplete,operationFieldLimits,type BkmOperationFields} from './bkmOperation'
import {hasMaterial} from './bkmMaterial'
export type BkmInputRow={filterWo:string;candidate:BkmCandidate|null;bkm:string;note:string;activityFilter?:string;hiOverride?:number|null;hiManual?:boolean;hkOverride?:number|null;operationFields?:Partial<BkmOperationFields>}
export type BkmMaterialEntry={pid:string;code:string;name:string;unit:string;hi:number|null;shi:number|null;wo:string;bkm:string;note:string;extra:string[]}
export type BkmTotalInput={uom:string;hiOverride:number|null}
export type BkmDocument={id:string;revision:number;date:string;company:string;division:string;number:string;rows:BkmInputRow[];materialEntries?:BkmMaterialEntry[];materialColumns?:string[];operationTotal?:BkmTotalInput}
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
 // Master paddocks are loaded explicitly on request so unplanned work can be reported without WO.
 // Query only work lines relevant to the chosen day; no collection-wide listener.
 const byValues=async(name:string,field:string,values:string[])=>{
  const out:BkmSource[]=[]
  for(const group of chunks(values)){
   const snap=await getDocsFromServer(query(collection(db,name),where(field,'in',group)))
   assertUid();out.push(...snap.docs.map(d=>({...d.data(),id:d.id}) as BkmSource))
  }
  return [...new Map(out.map(r=>[r.id,r])).values()]
 }
 const [history,monthly,paddockSnap,materialSnap,activitySnap]=await Promise.all([
  byValues('daily_reports','monthlyPlanLineId',lines),byValues('monthly_plans','planLineId',lines),
  getDocsFromServer(collection(db,'master_paddocks')),getDocsFromServer(collection(db,'master_materials')),getDocsFromServer(collection(db,'master_activity_catalog'))
 ])
 // Older records may use the document ID itself instead of planLineId.
 for(const id of lines.filter(id=>!monthly.some(m=>text(m.planLineId||m.planCode||m.id)===id))){
  if(id.includes('/'))continue
  const snap=await getDocFromServer(doc(db,'monthly_plans',id));assertUid()
  if(snap.exists())monthly.push({...snap.data(),id:snap.id} as BkmSource)
 }
 assertUid()
 const materials=materialSnap.docs.map(d=>({...d.data(),id:d.id}) as BkmSource)
 const paddocks=paddockSnap.docs.map(d=>({...d.data(),id:d.id}) as BkmSource)
 const masterActivities:BkmActivity[]=activitySnap.docs.map(d=>({...d.data(),id:d.id}) as BkmSource).filter(d=>d.active!==false&&text(d.operationCode)&&text(d.name||d.description)).map(d=>({id:d.id,operationCode:text(d.operationCode),description:text(d.name||d.description),uom:'Ha'}))
 const masterPaddocks:BkmPaddock[]=paddocks.filter(d=>d.active!==false&&text(d.pid)&&text(d.companyCode)).map(d=>({pid:text(d.pid).toUpperCase(),company:text(d.companyCode).toUpperCase(),area:d.areaPlantedHa!=null&&Number.isFinite(Number(d.areaPlantedHa))?Number(d.areaPlantedHa):null}))
 return {masterActivities,masterPaddocks,masterMaterials:materials.filter(m=>m.active!==false).map(m=>({code:text(m.materialCode||m.materialNumber||m.noMaterial),name:text(m.materialName),unit:text(m.unit)})).filter(m=>m.name),candidates:buildBkmCandidates({date,daily,actual,history,monthly,paddocks,materials}),sourceCount:daily.length+actual.length,loadedAt:new Date().toISOString()}
}
export async function listBkm(date:string){
 assertDate(date)
 const {db,uid,user,assertUid}=await context()
 const base=collection(db,COLLECTION)
 const snap=await getDocsFromServer(user.role==='owner'?query(base,where('date','==',date),limit(200)):query(base,where('ownerUid','==',uid),where('date','==',date),limit(200)))
 assertUid()
 return snap.docs.map(d=>{const v=d.data();return {id:d.id,revision:Number(v.revision),date:text(v.date),company:text(v.company),division:text(v.division),number:text(v.number),rows:v.rows as BkmInputRow[],materialEntries:Array.isArray(v.materialEntries)?v.materialEntries as BkmMaterialEntry[]:undefined,materialColumns:Array.isArray(v.materialColumns)?v.materialColumns as string[]:undefined,operationTotal:v.operationTotal as BkmTotalInput|undefined}}).sort((a,b)=>a.number.localeCompare(b.number,'id',{numeric:true}))
}
export async function saveBkm(input:BkmDocument){
 assertDate(input.date)
 const {db,uid,user,assertUid}=await context(true)
 if(input.rows.some(row=>row.operationFields&&Object.entries(row.operationFields).some(([field,value])=>
  !Object.hasOwn(operationFieldLimits,field)||typeof value!=='string'||value.length>operationFieldLimits[field as keyof BkmOperationFields])))throw Error('Isian kolom Operation tidak valid.')
 if(input.rows.some(row=>bkmOperationIncomplete(row,input.company)))throw Error('Lengkapi Desc dan Paddock pada setiap baris Operation yang diisi.')
 const operations=input.rows.flatMap(row=>{
  const candidate=bkmOperationCandidate(row,input.company)
  return candidate?[{row,candidate}]:[]
 })
 const rows=input.rows
 if(!input.company.trim()||!input.division.trim()||!operations.length||rows.length>100)throw Error('PT, Divisi dan 1–100 pekerjaan diperlukan.')
 if(operations.some(({candidate})=>candidate.conflict||candidate.company!==input.company.toUpperCase()))throw Error('Periksa konflik Actual dan PT sebelum menyimpan.')
 if(new Set(operations.map(({candidate})=>candidate.id)).size!==operations.length)throw Error('Pekerjaan ganda tidak dapat disimpan.')
 const actualIds=operations.flatMap(({candidate})=>candidate.actualIds)
 if(new Set(actualIds).size!==actualIds.length)throw Error('Record Actual yang sama tidak boleh masuk lebih dari sekali.')
 if(rows.some(r=>!bkmValidQuantity(r.hiOverride)||!bkmValidQuantity(r.hkOverride)||(r.hiManual!==undefined&&typeof r.hiManual!=='boolean')))throw Error('HI dan HK harus berupa angka tidak negatif.')
 const materialColumns=input.materialColumns||[],materialEntries=input.materialEntries
 if(materialColumns.length>8||materialColumns.some(c=>typeof c!=='string'||!c.trim()||c.length>60)||new Set(materialColumns.map(c=>c.trim().toLowerCase())).size!==materialColumns.length)throw Error('Nama kolom tambahan tidak valid.')
 if(materialEntries&&(materialEntries.length>100||materialEntries.some(m=>
  !bkmValidQuantity(m.hi)||!bkmValidQuantity(m.shi)||!Array.isArray(m.extra)||m.extra.length!==materialColumns.length||
  m.extra.some(v=>typeof v!=='string'||v.length>800)||(hasMaterial(m)&&(!m.pid.trim()||!m.name.trim()||!m.unit.trim()))
 )))throw Error('Periksa paddock, nama, satuan dan kuantitas Material.')
 const operationTotal=input.operationTotal
 if(operationTotal&&(!operationTotal.uom.trim()||operationTotal.uom.length>operationFieldLimits.uom||
  !bkmValidQuantity(operationTotal.hiOverride)))throw Error('Periksa satuan dan angka Total HI.')
 const reportFields={...(materialEntries!==undefined?{materialEntries,materialColumns}: {}),
  ...(operationTotal?{operationTotal}:{})}
 const id=input.id||crypto.randomUUID(),ref=doc(db,COLLECTION,id)
 // For a new UUID, do not read a non-existent owner-scoped document.
 // Rules reject any collision because revision 1 cannot update existing data.
 if(!input.id){
  assertUid()
  await setDoc(ref,{schemaVersion:1,ownerUid:uid,revision:1,date:input.date,company:input.company.toUpperCase(),division:input.division,number:input.number,rows,...reportFields,updatedAt:serverTimestamp(),createdAt:serverTimestamp()})
  assertUid()
  return {id,revision:1}
 }
 const revision=await runTransaction(db,async tx=>{
  assertUid()
  const prev=await tx.get(ref)
  if(prev.exists()&&(prev.data().ownerUid!==uid&&user.role!=='owner'||prev.data().revision!==input.revision))throw Error('Dokumen telah berubah atau bukan milik akun ini. Muat ulang Data Rekap.')
  if(!prev.exists()&&input.id)throw Error('Dokumen tidak ditemukan.')
  const revision=(prev.exists()?Number(prev.data().revision):0)+1
  const value={schemaVersion:1,ownerUid:prev.exists()?prev.data().ownerUid:uid,revision,date:input.date,company:input.company.toUpperCase(),division:input.division,number:input.number,rows,...reportFields,updatedAt:serverTimestamp(),createdAt:prev.exists()?prev.data().createdAt:serverTimestamp()}
  tx.set(ref,value)
  return revision
 })
 assertUid()
 return {id,revision}
}
