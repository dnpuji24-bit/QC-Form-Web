import {useEffect,useRef,useState} from 'react'
import {command} from './NativeUsersAccess'
import {nativePortalEnabled} from './qcNativePortalConfig'
import {qcFirestoreOnly} from './qcCutover'
import {historicalFormChanges,type HistoricalForm} from './qcHistoricalForm.mjs'
import type {QcRecord,User} from './types'

export const historicalCorrectionEnabled=nativePortalEnabled&&qcFirestoreOnly&&import.meta.env.VITE_QC_NATIVE_HISTORICAL==='true'&&Boolean(import.meta.env.VITE_QC_NATIVE_ADMIN_URL)
export function canCorrectHistoricalQc(user:User,record:QcRecord){
 return historicalCorrectionEnabled&&user.role==='owner'&&Boolean(user.firebaseUid)&&/^[A-Za-z0-9_-]{1,160}$/.test(record.id)&&!record.id.startsWith('qc-v2-')&&!record.operationalSaveId&&!record.operationalPhotoManifest&&record.saveType==='uploaded'&&['spray','fertilizer'].includes(record.formType)&&record.firestoreSaveState!=='queued'
}
type Dict=Record<string,unknown>
type Review={payload:Dict;before:Dict;after:Dict;actual:{before:Dict;after:Dict}|null}
const asObject=(v:unknown):Dict=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Respons preview tidak valid.');return v as Dict}
const str=(v:unknown)=>typeof v==='string'||typeof v==='number'?String(v):''
const labels:Record<string,string>={area:'Luas (Ha)',actualAreaHa:'Luas aktual (Ha)',resultArea:'Hasil kerja (Ha)',noted:'Catatan',catatan:'Catatan',productivityHaPerHour:'Produktivitas (Ha/jam)',averageActualDosage:'Dosis rata-rata (kg/Ha)',weightedActualDosage:'Dosis tertimbang (kg/Ha)',estUsageAdjuvant:'Estimasi adjuvant',actualPlanMaterials:'Material plan',materials:'Material plan',dailyVarianceHa:'Selisih luas (Ha)',notes:'Catatan Actual',pengisianList:'Pengisian pupuk'}
function show(v:unknown,key:string){
 if(v===null||v===undefined||v==='')return '—'
 if(Array.isArray(v)){
  return v.map((item,i)=>{
   const o=asObject(item)
   return key==='pengisianList'?`${i+1}. ${str(o.jenisPupuk)}: ${str(o.jumlah)} kg / ${str(o.hasilKerja)} Ha; dosis ${str(o.dosisAktual)||'—'}`:`${str(o.materialName||o.material||o.name)||'Material '+(i+1)}: ${str(o.totalMaterial)} ${str(o.unit)}`
  }).join('\n')||'—'
 }
 return typeof v==='number'||typeof v==='string'||typeof v==='boolean'?String(v):JSON.stringify(v)
}
function Diff({before,after}:{before:Dict;after:Dict}){
 return <div className="table-wrap"><table><thead><tr><th>Field</th><th>Sebelum</th><th>Sesudah</th></tr></thead><tbody>{Object.keys(after).map(k=><tr key={k}><td>{labels[k]||k}</td><td style={{whiteSpace:'pre-wrap'}}>{show(before[k],k)}</td><td style={{whiteSpace:'pre-wrap'}}>{show(after[k],k)}</td></tr>)}</tbody></table></div>
}
const errors:Record<string,string>={QC_REVISION_CONFLICT:'QC atau Actual telah berubah. Tutup form, muat data terbaru, lalu ulangi pemeriksaan.',QC_ACTUAL_LINK_CONFLICT:'Hubungan Actual Plan tidak sesuai. Record memerlukan pemeriksaan manual.',QC_HISTORICAL_REVIEW_REQUIRED:'Record atau material Actual memerlukan pemeriksaan khusus.',QC_HISTORICAL_INVALID_DATA:'Data historis tidak valid untuk perubahan ini.',QC_HISTORICAL_DISABLED:'Layanan koreksi historis belum diaktifkan.',OWNER_REQUIRED:'Hanya Owner aktif yang dapat melakukan koreksi.',INVALID_COMMAND:'Isian koreksi tidak valid.'}
const errorText=(e:unknown)=>e instanceof Error?(errors[e.message]||e.message):'Permintaan gagal.'
export function NativeHistoricalQcCorrection({record,user,onClose,onSaved}:{record:QcRecord;user:User;onClose:()=>void;onSaved:()=>void}){
 const [base,setBase]=useState<HistoricalForm|null>(null),[form,setForm]=useState<HistoricalForm|null>(null)
 const [version,setVersion]=useState(''),[reason,setReason]=useState(''),[review,setReview]=useState<Review|null>(null)
 const [busy,setBusy]=useState(true),[attempted,setAttempted]=useState(false),[saved,setSaved]=useState(false),[message,setMessage]=useState('')
 const lock=useRef(false),panel=useRef<HTMLElement|null>(null)
 const uid=user.firebaseUid
 useEffect(()=>{
  let cancelled=false
  panel.current?.scrollIntoView({block:'start'})
  setBusy(true)
  if(!canCorrectHistoricalQc(user,record)||!uid){setBusy(false);setMessage('Record tidak memenuhi syarat koreksi.');return}
  void command({action:'previewHistoricalQc',recordId:record.id},uid).then(response=>{
   if(cancelled)return
   const r=asObject(response.record)
   if(r.id!==record.id||r.formType!==record.formType||typeof response.version!=='string'||!Array.isArray(r.fillings))throw Error('Identitas preview tidak sesuai.')
   const initial:HistoricalForm={note:str(r.note),area:str(r.area),fillings:r.fillings.map(v=>{const o=asObject(v);return {jumlah:str(o.jumlah),hasilKerja:str(o.hasilKerja),jenisPupuk:str(o.jenisPupuk)}})}
   setBase(initial);setForm(initial);setVersion(response.version)
  }).catch(e=>{if(!cancelled)setMessage(errorText(e))}).finally(()=>{if(!cancelled)setBusy(false)})
  return()=>{cancelled=true}
  // Parent keys this component by record ID and authenticated UID; do not overwrite a draft on realtime updates.
 },[record.id,uid])
 function updateFilling(index:number,key:'jumlah'|'hasilKerja',value:string){
  setForm(old=>old?{...old,fillings:old.fillings.map((f,i)=>i===index?{...f,[key]:value}:f)}:old)
 }
 async function preview(){
  if(lock.current||!base||!form||!uid||!canCorrectHistoricalQc(user,record)||!navigator.onLine)return
  lock.current=true;setBusy(true);setMessage('')
  try{
   if(reason.trim().length<5||reason.length>300)throw Error('Alasan harus 5–300 karakter.')
   const changes=historicalFormChanges(record.formType,base,form)
   const payload={action:'correctHistoricalQc',recordId:record.id,operationId:crypto.randomUUID(),baseVersion:version,reason:reason.trim(),changes}
   const response=await command({...payload,action:'previewHistoricalQc'},uid)
   if(response.version!==version||!(response.actualVersion===null||typeof response.actualVersion==='string'))throw Error('Versi preview tidak sesuai.')
   const actual=response.actual===null?null:asObject(response.actual)
   setReview({payload:{...payload,baseActualVersion:response.actualVersion},before:asObject(response.before),after:asObject(response.after),actual:actual?{before:asObject(actual.before),after:asObject(actual.after)}:null})
  }catch(e){setMessage(errorText(e))}finally{lock.current=false;setBusy(false)}
 }
 async function save(){
  if(lock.current||!review||!uid||saved||!canCorrectHistoricalQc(user,record)||!navigator.onLine)return
  if(!attempted&&!window.confirm('Simpan perubahan yang telah diperiksa pada QC dan Actual Plan?'))return
  lock.current=true;setBusy(true);setAttempted(true);setMessage('')
  try{await command(review.payload,uid);setSaved(true);setMessage('Koreksi terkonfirmasi. Periksa hasil di Data QC, Dashboard dan Actual Plan.');onSaved()}
  catch(e){setMessage(errorText(e)+' Status belum terkonfirmasi; retry memakai ID transaksi yang sama. Jika konflik, tutup dan periksa data terbaru.')}
  finally{lock.current=false;setBusy(false)}
 }
 return <section className="panel" ref={panel} aria-label="Koreksi QC historis">
  <div className="section-head"><div><h3>Koreksi QC Historis</h3><p>{record.formType==='spray'?'Spraying':'Fertilizer'} · {record.paddock} · {record.date} · {record.id}</p></div><button disabled={busy} type="button" onClick={onClose}>Tutup</button></div>
  <p>Owner saja. Satu record per koreksi. Foto, identitas penginput, tanggal, paddock dan bahan asli tidak dapat diganti di form ini.</p>
  {busy&&<p role="status">Memproses permintaan…</p>}{message&&<p role="status">{message}</p>}
  {base&&form&&!review&&!saved&&<fieldset disabled={busy}>
   {record.formType==='spray'?<label>Luas pekerjaan (Ha)<input type="number" min="0" step="any" value={form.area} onChange={e=>setForm({...form,area:e.target.value})}/></label>:<div className="table-wrap"><table><thead><tr><th>Pengisian</th><th>Pupuk</th><th>Jumlah (kg)</th><th>Hasil kerja (Ha)</th></tr></thead><tbody>{form.fillings.map((f,i)=><tr key={i}><td>{i+1}</td><td>{f.jenisPupuk||'—'}</td><td><input aria-label={'Jumlah pengisian '+(i+1)} type="number" min="0" step="any" value={f.jumlah} onChange={e=>updateFilling(i,'jumlah',e.target.value)}/></td><td><input aria-label={'Luas pengisian '+(i+1)} type="number" min="0" step="any" value={f.hasilKerja} onChange={e=>updateFilling(i,'hasilKerja',e.target.value)}/></td></tr>)}</tbody></table>{!form.fillings.length&&<p>Pengisian tidak tersedia. Hanya catatan yang dapat diperiksa.</p>}</div>}
   <label>Catatan<textarea maxLength={2000} value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
   <label>Alasan koreksi (wajib)<textarea maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <button type="button" className="primary" disabled={busy||reason.trim().length<5} onClick={()=>void preview()}>Periksa perubahan</button>
  </fieldset>}
  {review&&<div><h4>Preview server — QC</h4><Diff before={review.before} after={review.after}/><h4>Actual Plan</h4>{review.actual?<Diff before={review.actual.before} after={review.actual.after}/>:<p>Tidak ada Actual terkait.</p>}<p>Alasan: {reason}</p>
   {!saved&&<div className="row-actions"><button type="button" disabled={busy||attempted} onClick={()=>{setReview(null);setMessage('')}}>Ubah kembali</button><button type="button" className="primary" disabled={busy} onClick={()=>void save()}>{attempted?'Retry transaksi yang sama':'Konfirmasi koreksi'}</button></div>}
  </div>}
 </section>
}
