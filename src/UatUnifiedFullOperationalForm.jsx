// Separate photo-free UAT full QC form. Not production SprayForm/FertilizerForm and not using their queue.
import React,{useEffect,useRef,useState} from 'react'
import {buildUnifiedFullQc} from './qcUatUnifiedFullQcFormBuilder.mjs'
import {stageUatPhoto} from './qcUatUnifiedPhotoPreflight.mjs'
import {compressUatPhoto} from './qcUatPhotoCompression.mjs'
const fresh=()=>({
 unit:'',noUnit:'',assistant:'',startTime:'',endTime:'',notes:'',holds:[],
 areaHa:'',dropper:'',nozzle:'',waterQuality:'',weatherCondition:'',windSpeed:'',
 waterRate:'',adjuvantDosage:'',adjuvant:'',actUsageAdjuvant:'',measuredUsage:['','','',''],
 fillings:[{materialId:'',productName:'',kg:'',areaHa:'',statusHose:'Lancar',distribution:''}]
})
const nonce=()=>crypto.randomUUID().replace(/-/g,'').slice(0,20)
export default function UatUnifiedFullOperationalForm({user,kind,api}){
 const [dailyId,setDailyId]=useState(''),[source,setSource]=useState(null),[form,setForm]=useState(fresh)
 const [carryover,setCarryover]=useState(false),[actualForemanId,setActualForemanId]=useState('')
 const [photoSlot,setPhotoSlot]=useState('main'),[stagedPhotos,setStagedPhotos]=useState([])
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(null),[status,setStatus]=useState('belum memilih sumber')
 const ticket=useRef(0),locked=useRef(false)
 useEffect(()=>()=>{ticket.current++},[])
 const active=()=>api.isCurrent(user)
 const put=(key,value)=>setForm(v=>({...v,[key]:value}))
 const putMeasured=(i,value)=>setForm(v=>({...v,measuredUsage:v.measuredUsage.map((x,j)=>i===j?value:x)}))
 const putFill=(i,key,value)=>setForm(v=>({...v,fillings:v.fillings.map((f,j)=>i===j?{...f,[key]:value}:f)}))
 const clearHoldPhotos=()=>setStagedPhotos(v=>v.filter(p=>p.kind!=='hold'))
 const putHold=(i,key,value)=>{clearHoldPhotos();setForm(v=>({...v,holds:v.holds.map((h,j)=>i===j?{...h,[key]:value}:h)}))}
 async function load(){
  if(locked.current||!active()||pending)return
  locked.current=true;setBusy(true);const current=++ticket.current
  setSource(null);setForm(fresh());setPhotoSlot('main');setStagedPhotos([]);setStatus('memeriksa sumber dan master di server')
  try{
   const result=await api.fullQcSource(kind,dailyId,{carryover,actualForemanId})
   if(current!==ticket.current||!active())return
   if(result?.testOnly!==true||result.kind!==kind||result.dailyPlanId!==dailyId)throw Error('INVALID_FULL_SOURCE')
   setSource(result)
   setForm({...fresh(),fillings:[{materialId:result.materials[0]?.materialId||'',productName:'',kg:'',areaHa:'',statusHose:'Lancar',distribution:''}]})
   setStatus('sumber lengkap terverifikasi; isi data pelaksanaan')
  }catch{
   if(current===ticket.current&&active()){setSource(null);setStatus('sumber ditolak atau data master belum lengkap')}
  }finally{locked.current=false;if(current===ticket.current&&active())setBusy(false)}
 }
 async function submit(saveType){
  if(locked.current||!source||pending||!active())return
  if(stagedPhotos.length){setStatus('foto hanya staging lokal; hapus lampiran atau tunggu integrasi upload terverifikasi sebelum menyimpan');return}
  let request
  try{
   request=buildUnifiedFullQc(source,form,{uid:user.uid,nonce:nonce(),saveType,createdAt:new Date().toISOString()})
  }catch(e){setStatus('validasi formulir: '+String(e?.message||'DATA_TIDAK_LENGKAP'));return}
  setPending(request)
  await send(request)
 }
 async function send(request){
  if(locked.current||!active())return
  locked.current=true;setBusy(true);const current=++ticket.current
  setStatus('menyimpan DTO lengkap dan audit...')
  try{
   const result=await api.fullQcCommit(kind,request)
   if(current!==ticket.current||!active())return
   const expectedId=request.record.id.slice('qc-v2-'.length)
   if(result?.record?.id!==expectedId||result?.record?.formType!==kind)throw Error('INVALID_RECEIPT')
   setStatus('QC lengkap '+request.record.saveType+' tersimpan: '+expectedId+' (foto belum terintegrasi)')
   setPending(null)
  }catch{
   if(current===ticket.current&&active())setStatus('hasil belum terkonfirmasi; ulangi request yang SAMA untuk mencegah duplikasi')
  }finally{locked.current=false;if(current===ticket.current&&active())setBusy(false)}
 }
 async function stagePhoto(file){
  if(locked.current||!source||pending||!active()||!file)return
  locked.current=true;setBusy(true);const current=++ticket.current
  const slot=photoSlot,holdId=slot.startsWith('hold_')?slot.slice(5):''
  const photoKind=holdId?'hold':slot
  try{
   if(photoKind==='hold'&&!form.holds.some((_,i)=>holdId==='uat-h'+(i+1)))throw Error('PHOTO_HOLD_SOURCE_REQUIRED')
   // Compression occurs BEFORE photo manifest and SHA-256 generation.
   const processed=await compressUatPhoto(file)
   const photo=await stageUatPhoto({file:processed.file,uploaderUid:user.uid,formType:kind,kind:photoKind,holdId})
   if(current!==ticket.current||!active())return
   setStagedPhotos(v=>[...v.filter(p=>p.slot!==photo.slot),{...photo,compression:processed.details}])
   setStatus((processed.details.compressed?'Foto berhasil dikompresi dan diverifikasi':'Foto sudah kecil, diverifikasi tanpa kompresi ulang')+'; hanya staging lokal (0 diunggah), simpan QC diblokir hingga foto dihapus atau upload tersedia')
  }catch(e){
   if(current===ticket.current&&active())setStatus('foto ditolak: '+String(e?.message||'INVALID_PHOTO'))
  }finally{locked.current=false;if(current===ticket.current&&active())setBusy(false)}
 }
 const input=(name,key,type='text')=><label key={key}>{name}
  <input type={type} aria-label={'Full '+kind+' '+name} value={form[key]} disabled={busy||!!pending}
   onChange={e=>put(key,e.target.value)}/></label>
 return <section data-testid={'uat-full-'+kind} aria-label={'Form lengkap '+kind+' UAT'}>
  <h3>{kind==='spray'?'Full QC Spray':'Full QC Fertilizer'} — UAT photo-free</h3>
  <p>Editor sintetis untuk validasi DTO penuh; bukan formulir produksi dan tidak mengunggah foto.</p>
  <label>ID Daily Plan
   <input aria-label={'Full '+kind+' Daily Plan ID'} value={dailyId} disabled={busy||!!pending}
    onChange={e=>{setDailyId(e.target.value);setSource(null);setForm(fresh());setCarryover(false);setActualForemanId('');setStagedPhotos([]);setPhotoSlot('main');setStatus('belum memilih sumber')}}/>
  </label>
  <label>Melanjutkan sumber Shift 1 ke Shift 2 pada tanggal yang sama
   <input type="checkbox" aria-label={'Full '+kind+' lanjutkan Shift 1 ke Shift 2'} checked={carryover}
    disabled={busy||!!pending} onChange={e=>{setCarryover(e.target.checked);setActualForemanId('');setSource(null);setForm(fresh());setStagedPhotos([]);setPhotoSlot('main');setStatus('pilih ulang sumber dan pelaksana')}}/>
  </label>
  {carryover&&<label>ID mandor pelaksana Shift 2 (wajib dari master aktif)
   <input aria-label={'Full '+kind+' ID mandor Shift 2'} value={actualForemanId} disabled={busy||!!pending}
    onChange={e=>{setActualForemanId(e.target.value);setSource(null);setForm(fresh());setStagedPhotos([]);setPhotoSlot('main');setStatus('pilih ulang sumber dan pelaksana')}}/>
  </label>}
  <button disabled={!dailyId||busy||!!pending||(carryover&&!actualForemanId)} onClick={()=>void load()}>Full {kind} periksa sumber</button>
  <p data-testid={'uat-full-'+kind+'-status'}>{status}</p>
  {source&&<div>
   <p data-testid={'uat-full-'+kind+'-source'}>PID {source.pid} • {source.date} • sumber shift {source.sourceShift} / mandor asal {source.sourceForemanName} • shift pelaksanaan {source.executionShift} / mandor aktual {source.executionForemanName} • revisi {source.dailyRevision}</p>
   <p>Area rencana DP {(source.area100/100).toFixed(2)} Ha · bahan {source.materials.map(m=>m.material).join(', ')}</p>
   {input('Nama asisten','assistant')}
   {input('Unit','unit')}
   {input('Nomor unit','noUnit')}
   {input('Jam mulai','startTime','time')}
   {input('Jam selesai','endTime','time')}
   {input('Catatan','notes')}
   {kind==='spray'&&<div data-testid="uat-full-spray-details">
    {input('Luas aktual Ha','areaHa')}
    {input('Dropper','dropper')}
    {input('Nozzle','nozzle')}
    {input('Kualitas air','waterQuality')}
    {input('Cuaca','weatherCondition')}
    {input('Angin','windSpeed')}
    {input('Water rate L/Ha','waterRate')}
    {input('Adjuvant','adjuvant')}
    {input('Dosis adjuvant','adjuvantDosage')}
    {input('Pemakaian adjuvant','actUsageAdjuvant')}
    {source.materials.map((m,i)=><label key={m.materialId}>Pemakaian terukur {m.material} ({m.unit})
     <input aria-label={'Full spray measured '+m.material} value={form.measuredUsage[i]} disabled={busy||!!pending}
      onChange={e=>putMeasured(i,e.target.value)}/></label>)}
   </div>}
   {kind==='fertilizer'&&<div data-testid="uat-full-fertilizer-fillings">
    <p>Luas diinput per pengisian/per komponen; bukan luas fisik tunggal.</p>
    {form.fillings.map((f,i)=><fieldset key={i}>
     <legend>Pengisian {i+1}</legend>
     <label>Komponen
      <select aria-label={'Full fertilizer komponen '+(i+1)} value={f.materialId} disabled={busy||!!pending}
       onChange={e=>putFill(i,'materialId',e.target.value)}>
       {source.materials.map(m=><option value={m.materialId} key={m.materialId}>{m.material} · {m.dose10000/10000} kg/Ha</option>)}
      </select>
     </label>
     {['productName','kg','areaHa','statusHose','distribution'].map(k=><label key={k}>{({productName:'Nama produk dari master',kg:'Jumlah kg',areaHa:'Hasil kerja Ha',statusHose:'Status hose',distribution:'Pemerataan'})[k]}
      <input aria-label={'Full fertilizer '+k+' '+(i+1)} value={f[k]} disabled={busy||!!pending}
       onChange={e=>putFill(i,k,e.target.value)}/></label>)}
     <button disabled={busy||!!pending||form.fillings.length===1} onClick={()=>put('fillings',form.fillings.filter((_,j)=>j!==i))}>Hapus pengisian {i+1}</button>
    </fieldset>)}
    <button disabled={busy||!!pending||form.fillings.length>=100} onClick={()=>put('fillings',[...form.fillings,{materialId:source.materials[0].materialId,productName:'',kg:'',areaHa:'',statusHose:'Lancar',distribution:''}])}>Tambah pengisian</button>
   </div>}
   <div data-testid={'uat-full-'+kind+'-holds'}>
    <p>Hold / downtime (opsional)</p>
    {form.holds.map((h,i)=><fieldset key={i}>
     <legend>Hold {i+1}</legend>
     {['start','end','reason','note'].map(k=><label key={k}>{k}
      <input type={['start','end'].includes(k)?'time':'text'} aria-label={'Full '+kind+' hold '+k+' '+(i+1)} value={h[k]} disabled={busy||!!pending}
       onChange={e=>putHold(i,k,e.target.value)}/></label>)}
     <button disabled={busy||!!pending} onClick={()=>{clearHoldPhotos();setPhotoSlot('main');put('holds',form.holds.filter((_,j)=>j!==i))}}>Hapus hold {i+1}</button>
    </fieldset>)}
    <button disabled={busy||!!pending||form.holds.length>=20} onClick={()=>{clearHoldPhotos();setPhotoSlot('main');put('holds',[...form.holds,{start:'',end:'',reason:'',note:''}])}}>Tambah hold</button>
   </div>
   <div data-testid={'uat-full-'+kind+'-photo-staging'}>
    <h4>Foto QC (hanya staging lokal, tanpa upload)</h4>
    <p>JPEG/PNG/WebP asli maksimal 6 MB. Kompresi otomatis jika diperlukan: sisi maksimal 1.280 piksel, target hasil 800 KB, batas staging 2 MB. Format JPEG/PNG/WebP dipertahankan, termasuk transparansi PNG/WebP. Foto tetap lokal (belum diunggah); simpan QC dinonaktifkan selama ada lampiran.</p>
    <label>Slot foto
     <select aria-label={'Full '+kind+' slot foto'} value={photoSlot} disabled={busy||!!pending} onChange={e=>setPhotoSlot(e.target.value)}>
      <option value="main">Foto utama</option>
      {kind==='fertilizer'&&<option value="scan">Dokumen scan</option>}
      {form.holds.map((_,i)=><option key={i} value={'hold_uat-h'+(i+1)}>{'Foto hold '+(i+1)}</option>)}
     </select>
    </label>
    <label>Pilih file foto
     <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={'Full '+kind+' file foto'} disabled={busy||!!pending}
      onChange={e=>{const selected=e.target.files?.[0];e.target.value='';if(selected)void stagePhoto(selected)}}/>
    </label>
    <p data-testid={'uat-full-'+kind+'-photo-status'}>{stagedPhotos.length} foto diverifikasi lokal · 0 diunggah</p>
    {stagedPhotos.map(p=><div key={p.slot} data-testid={'uat-full-'+kind+'-photo-'+p.slot}>
     <img alt={'Pratinjau lokal '+p.slot} src={p.dataUrl} width="100" height="100"/>
     <span>{p.slot} · {p.fileName} · SHA256 {p.sha256.slice(0,12)} · {p.compression.originalBytes} → {p.compression.outputBytes} byte {p.compression.compressed?'(dikompresi '+({'image/jpeg':'JPEG','image/png':'PNG','image/webp':'WebP'}[p.compression.outputType]||'gambar')+')':'(asli sudah kecil)'}</span>
     <button disabled={busy||!!pending} onClick={()=>setStagedPhotos(v=>v.filter(x=>x.slot!==p.slot))}>Hapus foto lokal {p.slot}</button>
    </div>)}
   </div>
   <button disabled={busy||!!pending||stagedPhotos.length>0} onClick={()=>void submit('draft')}>Full {kind} simpan draft</button>
   <button disabled={busy||!!pending||stagedPhotos.length>0} onClick={()=>void submit('ready')}>Full {kind} simpan ready</button>
   {pending&&<button disabled={busy} onClick={()=>void send(pending)}>Full {kind} ulang request identik</button>}
  </div>}
 </section>
}
