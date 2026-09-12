import { useEffect, useMemo, useState } from 'react'
import { saveDraftFirestoreFirst, sendOrQueue } from './offline'
import { clearDraft, loadDraft, saveDraft } from './draftStore'
import PhotoPicker from './PhotoPicker'
import type { HoldInterval, MasterData, MaterialMaster, PlanMaster, QcRecord, User } from './types'

type Props={token:string;user:User;master:MasterData;initialRecords?:QcRecord[];onCancelEdit?:()=>void;onSaved:(records:QcRecord[])=>void}
type Filling={id:string;pengisianKe:number;dosis:string;statusHose:string;jenisPupuk:string;jumlah:string;hasilKerja:string;pemerataanPupuk:string}
type Downtime={id:string;issue:string;start:string;end:string;note:string;file?:File;photoDriveUrl?:string;removePhoto?:boolean}
type UnitCard={id:string;recordId?:string;createdAt?:string;photoDriveUrl?:string;saveType?:string;removePhoto?:boolean;unit:string;noUnit:string;paddock:string;type:string;activity:string;catatan:string;photo?:File;fillings:Filling[];downtime:Downtime[]}
type FertDraft={sessionId:string;date:string;shift:string;mandor:string;assistant:string;cards:UnitCard[];activeCardId:string}

const today=()=>new Date().toISOString().slice(0,10)
const uid=()=>crypto.randomUUID()
const num=(value:unknown)=>Number(String(value??'').replace(',','.'))||0
const text=(value:unknown)=>String(value??'')
const unique=(items:unknown[])=>[...new Set(items.map(String).map(x=>x.trim()).filter(Boolean))]
function newFilling(index=1,source?:Partial<Filling>):Filling{return{id:uid(),pengisianKe:index,dosis:source?.dosis||'',statusHose:source?.statusHose||'Lancar',jenisPupuk:source?.jenisPupuk||'',jumlah:'',hasilKerja:'',pemerataanPupuk:''}}
function newCard():UnitCard{return{id:uid(),unit:'',noUnit:'',paddock:'',type:'',activity:'',catatan:'',fillings:[newFilling(1)],downtime:[]}}
function hasCardInput(card:UnitCard){return Boolean(card.recordId||card.unit||card.noUnit||card.paddock||card.activity||card.catatan||card.photo||card.photoDriveUrl||card.downtime.some(d=>d.issue||d.start||d.end||d.note||d.file||d.photoDriveUrl)||card.fillings.some(f=>f.dosis||f.jenisPupuk||f.jumlah||f.hasilKerja||f.pemerataanPupuk))}
function cardFromRecord(record:QcRecord):UnitCard{
  const rawFills=Array.isArray(record.pengisianList)?record.pengisianList as Record<string,unknown>[]:[]
  const rawDowntime=Array.isArray(record.downtimeList)?record.downtimeList as Record<string,unknown>[]:[]
  const holdPhotos=Array.isArray(record.holdIntervals)?record.holdIntervals:[]
  const fillings=rawFills.length?rawFills.map((f,i)=>({id:uid(),pengisianKe:Number(f.pengisianKe||i+1),dosis:text(f.dosis??record.dosis),statusHose:text(f.statusHose??record.statusHose)||'Lancar',jenisPupuk:text(f.jenisPupuk??record.jenisPupuk),jumlah:text(f.jumlah),hasilKerja:text(f.hasilKerja),pemerataanPupuk:text(f.pemerataanPupuk)})):[{id:uid(),pengisianKe:1,dosis:text(record.dosis),statusHose:text(record.statusHose)||'Lancar',jenisPupuk:text(record.jenisPupuk),jumlah:text(record.jumlah),hasilKerja:text(record.hasilKerja),pemerataanPupuk:text(record.pemerataanPupuk)}]
  return{id:uid(),recordId:record.id,createdAt:text(record.createdAt),photoDriveUrl:text(record.photoDriveUrl),saveType:text(record.saveType),unit:text(record.unit),noUnit:text(record.noUnit),paddock:record.paddock||'',type:text(record.type),activity:text(record.activity),catatan:text(record.catatan||record.noted).replace(/\s*\|\s*\[UNIT BERHENTI\].*$/i,''),fillings,downtime:rawDowntime.map((d,i)=>({id:uid(),issue:text(d.issue),start:text(d.start),end:text(d.end),note:text(d.note),photoDriveUrl:text(d.photoDriveUrl||holdPhotos[i]?.photoDriveUrl)}))}
}
function normalizePlans(master:MasterData){const raw=(master.plans||master.plan||[])as PlanMaster[];return raw.filter(p=>{const category=String(p.category||p.keterangan||'').trim().toLowerCase();if(category)return category==='fertilizer'||category==='fertiliser'||category==='pupuk';return Boolean(p.paddock&&(p.activity||p.type))})}
async function loadImageElement(file:Blob):Promise<HTMLImageElement>{const url=URL.createObjectURL(file);try{return await new Promise<HTMLImageElement>((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(new Error('decode'));x.src=url})}finally{window.setTimeout(()=>URL.revokeObjectURL(url),0)}}
async function photoData(file?:File):Promise<string>{
  if(!file)return''
  if(file.size>6_000_000)throw new Error('Foto asli maksimal 6 MB.')
  if(!file.type.startsWith('image/'))throw new Error('File foto tidak valid. Pilih ulang dari Kamera atau Galeri.')
  let image:CanvasImageSource|undefined,width=0,height=0,bitmap:ImageBitmap|undefined
  try{
    if('createImageBitmap'in window){try{bitmap=await createImageBitmap(file);image=bitmap;width=bitmap.width;height=bitmap.height}catch{}}
    if(!image){const img=await loadImageElement(file);image=img;width=img.naturalWidth;height=img.naturalHeight}
    if(!width||!height)throw new Error('decode')
    const scale=Math.min(1,1400/width),canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);const ctx=canvas.getContext('2d');if(!ctx)throw new Error('canvas');ctx.drawImage(image,0,0,canvas.width,canvas.height);let quality=.72,result=canvas.toDataURL('image/jpeg',quality);while(result.length>2_400_000&&quality>.42){quality-=.08;result=canvas.toDataURL('image/jpeg',quality)}if(result.length>2_700_000)throw new Error('Foto masih terlalu besar setelah kompresi.');return result
  }catch(error){if(error instanceof Error&&/terlalu besar/.test(error.message))throw error;throw new Error('Foto tidak dapat dibaca. Hapus foto tersebut lalu ambil/pilih ulang dari Kamera atau Galeri.')}
  finally{bitmap?.close?.()}
}

export default function FertilizerForm({token,user,master,initialRecords=[],onCancelEdit,onSaved}:Props){
  const firstInitial=initialRecords[0],editing=initialRecords.length>0,editingUploaded=initialRecords.some(r=>r.saveType==='uploaded'),draftKey=`fertilizer:${user.firebaseUid||user.username}`
  const[sessionId,setSessionId]=useState(()=>text(firstInitial?.sessionId)||`fertsession_${Date.now()}_${Math.random().toString(36).slice(2,7)}`)
  const[date,setDate]=useState(firstInitial?.date||today()),[shift,setShift]=useState(text(firstInitial?.shift)||'1'),[mandor,setMandor]=useState(text(firstInitial?.name)),[assistant,setAssistant]=useState(text(firstInitial?.nameOfAssistan))
  const[cards,setCards]=useState<UnitCard[]>(()=>initialRecords.length?initialRecords.map(cardFromRecord):[newCard()]),[activeCardId,setActiveCardId]=useState(()=>cards[0]?.id||''),[draftReady,setDraftReady]=useState(editing),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  useEffect(()=>{if(editing){setDraftReady(true);return}let alive=true;const legacyKey=`fertilizer:${user.username}`;void (async()=>{let saved=await loadDraft<FertDraft>(draftKey);if(!saved&&legacyKey!==draftKey)saved=await loadDraft<FertDraft>(legacyKey);if(!alive||!saved)return;setSessionId(saved.sessionId||sessionId);setDate(saved.date||today());setShift(saved.shift||'1');setMandor(saved.mandor||'');setAssistant(saved.assistant||'');if(saved.cards?.length){setCards(saved.cards);setActiveCardId(saved.activeCardId||saved.cards[0].id)}})().finally(()=>{if(alive)setDraftReady(true)});return()=>{alive=false}},[draftKey,editing,user.username])
  useEffect(()=>{if(!editing&&draftReady)void saveDraft<FertDraft>(draftKey,{sessionId,date,shift,mandor,assistant,cards,activeCardId}).catch(error=>setMessage(error instanceof Error?`Draft lokal gagal disimpan: ${error.message}`:'Draft lokal gagal disimpan.'))},[draftKey,editing,draftReady,sessionId,date,shift,mandor,assistant,cards,activeCardId])
  const plans=useMemo(()=>normalizePlans(master),[master]),paddocks=useMemo(()=>unique(plans.map(p=>p.paddock)),[plans]),unitTypes=useMemo(()=>Object.keys(master.unitMap||{}),[master.unitMap]),fertilizerNames=useMemo(()=>unique(((master.materials||[])as MaterialMaster[]).map(m=>m.material)),[master.materials])
  const total=useMemo(()=>({units:cards.filter(c=>c.noUnit||c.unit).length,totalKg:cards.reduce((s,c)=>s+c.fillings.reduce((x,f)=>x+num(f.jumlah),0),0),totalHa:cards.reduce((s,c)=>s+c.fillings.reduce((x,f)=>x+num(f.hasilKerja),0),0)}),[cards])
  const activeCard=cards.find(c=>c.id===activeCardId)||cards[0],activeIndex=Math.max(0,cards.findIndex(c=>c.id===activeCard?.id))
  function patchCard(id:string,patch:Partial<UnitCard>){setCards(old=>old.map(c=>c.id===id?{...c,...patch}:c))}
  function patchFilling(cardId:string,fillingId:string,patch:Partial<Filling>){setCards(old=>old.map(c=>c.id===cardId?{...c,fillings:c.fillings.map(f=>f.id===fillingId?{...f,...patch}:f)}:c))}
  function addFilling(cardId:string){setCards(old=>old.map(c=>c.id===cardId?{...c,fillings:[...c.fillings,newFilling(c.fillings.length+1,c.fillings[c.fillings.length-1])]}:c))}
  function removeFilling(cardId:string,fillingId:string){setCards(old=>old.map(c=>c.id===cardId?{...c,fillings:c.fillings.filter(f=>f.id!==fillingId).map((f,i)=>({...f,pengisianKe:i+1}))}:c))}
  function addUnit(){const card=newCard();setCards(old=>[...old,card]);setActiveCardId(card.id)}
  function duplicateCard(card:UnitCard){const copy:UnitCard={...card,id:uid(),recordId:undefined,createdAt:undefined,saveType:undefined,noUnit:'',photo:undefined,photoDriveUrl:undefined,removePhoto:false,fillings:card.fillings.map((f,i)=>({...f,id:uid(),pengisianKe:i+1,jumlah:'',hasilKerja:'',pemerataanPupuk:''})),downtime:[],catatan:''};setCards(old=>[...old,copy]);setActiveCardId(copy.id)}
  function removeCard(card:UnitCard){const remaining=cards.filter(c=>c.id!==card.id);setCards(remaining);setActiveCardId(remaining[Math.max(0,activeIndex-1)]?.id||remaining[0]?.id||'')}
  function addDowntime(cardId:string){setCards(old=>old.map(c=>c.id===cardId?{...c,downtime:[...c.downtime,{id:uid(),issue:'',start:'',end:'',note:''}]}:c))}
  function patchDowntime(cardId:string,downtimeId:string,patch:Partial<Downtime>){setCards(old=>old.map(c=>c.id===cardId?{...c,downtime:c.downtime.map(d=>d.id===downtimeId?{...d,...patch}:d)}:c))}
  function validateReady(activeCards:UnitCard[]){
    if(!date||!mandor)return{message:'Tanggal dan Mandor wajib diisi.',cardId:activeCards[0]?.id||''}
    if(!activeCards.length)return{message:'Isi minimal satu Unit Card sebelum disimpan.',cardId:''}
    const seen=new Set<string>()
    for(let i=0;i<activeCards.length;i++){
      const c=activeCards[i]
      if(!c.paddock||!c.unit||!c.noUnit||!c.activity)return{message:`Unit ${i+1}: lengkapi Paddock, Unit, No. Unit, dan Activity.`,cardId:c.id}
      const key=`${c.unit}|${c.noUnit}`.toLowerCase()
      if(seen.has(key))return{message:`Unit ${i+1}: ${c.noUnit} sudah digunakan pada unit lain.`,cardId:c.id}
      seen.add(key)
      if(!c.fillings.length)return{message:`Unit ${i+1}: minimal satu pengisian.`,cardId:c.id}
      for(const f of c.fillings){
        if(!f.jenisPupuk||num(f.dosis)<=0)return{message:`Unit ${c.noUnit||i+1} Pengisian ${f.pengisianKe}: Jenis Pupuk dan Dosis Target wajib diisi.`,cardId:c.id}
        if(num(f.jumlah)<=0||num(f.hasilKerja)<=0)return{message:`Unit ${c.noUnit||i+1} Pengisian ${f.pengisianKe}: Jumlah pupuk dan Hasil Kerja wajib lebih dari 0 sebelum status Ready.`,cardId:c.id}
      }
    }
    return null
  }
  function showReadyProblem(problem:{message:string;cardId:string}){if(problem.cardId)setActiveCardId(problem.cardId);setMessage(problem.message);window.setTimeout(()=>document.querySelector('.active-unit-card')?.scrollIntoView({behavior:'smooth',block:'start'}),60)}
  async function saveAll(saveType:'draft'|'ready'){
    const activeCards=cards.filter(hasCardInput),localDraft:FertDraft={sessionId,date,shift,mandor,assistant,cards,activeCardId}
    if(saveType==='draft'&&!editing)await saveDraft(draftKey,localDraft)
    if(saveType==='ready'){const problem=validateReady(activeCards);if(problem){showReadyProblem(problem);return}}
    const serverCards=saveType==='draft'?activeCards.filter(c=>Boolean(date&&mandor&&c.paddock)):activeCards
    if(saveType==='draft'&&!serverCards.length){setMessage('Draft Fertilizer tersimpan di perangkat. Isi Tanggal, Mandor, dan Paddock agar Draft juga muncul di Data QC.');return}
    setBusy(true);setMessage('')
    try{
      const records:QcRecord[]=[],savedIds=new Map<string,{recordId:string;saveType:string}>();let queued=0,firestoreFirstCount=0
      for(const card of serverCards){
        const downtimeText=card.downtime.filter(d=>d.issue||d.start||d.end||d.note).map(d=>`${d.issue||'Issue'} ${d.start||'-'}-${d.end||'-'}${d.note?`: ${d.note}`:''}`).join(' | '),catatan=[card.catatan.trim(),downtimeText?`[UNIT BERHENTI] ${downtimeText}`:''].filter(Boolean).join(' | '),pengisianList=card.fillings.map(f=>({pengisianKe:f.pengisianKe,dosis:num(f.dosis),statusHose:f.statusHose,jenisPupuk:f.jenisPupuk,jumlah:num(f.jumlah),hasilKerja:num(f.hasilKerja),dosisAktual:num(f.hasilKerja)>0?Math.round(num(f.jumlah)/num(f.hasilKerja)*100)/100:0,pemerataanPupuk:f.pemerataanPupuk})),first=pengisianList[0],uploaded=card.saveType==='uploaded',holdIntervals:HoldInterval[]=await Promise.all(card.downtime.map(async d=>({start:d.start,end:d.end,reason:d.issue,windSpeed:'',note:d.note,photoBase64:d.removePhoto?'':d.file?await photoData(d.file):'',photoDriveUrl:d.removePhoto?'':d.photoDriveUrl||''}))),downtimeList=card.downtime.map(({file,removePhoto,...d})=>d),recordId=card.recordId||`fert_${Date.now()}_${Math.random().toString(36).slice(2,7)}`
        const record:QcRecord={id:recordId,sessionId,formType:'fertilizer',date,shift,name:mandor,nameOfAssistan:assistant,status:'Working',paddock:card.paddock,unit:card.unit,noUnit:card.noUnit,type:card.type||'Fertilizer',activity:card.activity,jenisPupuk:first?.jenisPupuk||'',dosis:first?.dosis||0,statusHose:first?.statusHose||'',pengisianList,downtimeList,holdIntervals,catatan,noted:catatan,photoBase64:card.removePhoto?'':await photoData(card.photo),photoDriveUrl:card.removePhoto?'':card.photoDriveUrl||'',saveType:uploaded?'uploaded':saveType,inputtedBy:user.username,createdAt:card.createdAt||new Date().toISOString(),clientRevision:crypto.randomUUID()}
        const result=saveType==='draft'&&!uploaded?await saveDraftFirestoreFirst(token,record):await sendOrQueue(token,uploaded?'finalizeRecord':'syncRecord',record);if(result.queued)queued++;if(result.firestoreFirst)firestoreFirstCount++
        const nextSaveType=result.queued?(uploaded?'upload_queued':saveType==='draft'?'draft_queued':record.saveType):record.saveType
        records.push({...record,saveType:nextSaveType});savedIds.set(card.id,{recordId,saveType:String(nextSaveType)})
      }
      onSaved(records)
      if(saveType==='draft'&&!editingUploaded){
        if(!editing){const nextCards=cards.map(c=>{const saved=savedIds.get(c.id);return saved?{...c,recordId:saved.recordId,saveType:saved.saveType}:c});setCards(nextCards);await saveDraft(draftKey,{sessionId,date,shift,mandor,assistant,cards:nextCards,activeCardId})}
        setMessage(queued?`${records.length} unit tersimpan aman; ${queued} menunggu sinkronisasi.`:firestoreFirstCount===records.length?`Draft ${records.length} unit tersimpan di Firestore; Data QC diperbarui realtime. Sinkronisasi Spreadsheet berjalan di belakang.`:`Draft ${records.length} unit tersimpan; form tetap dipertahankan.`)
        return
      }
      await clearDraft(draftKey)
      setMessage(queued?`${records.length} unit tersimpan aman; ${queued} menunggu sinkronisasi.`:editingUploaded?'Koreksi berhasil disimpan.':`${records.length} unit berhasil disimpan.`)
      if(!editing){const fresh=newCard();setCards([fresh]);setActiveCardId(fresh.id);setSessionId(`fertsession_${Date.now()}_${Math.random().toString(36).slice(2,7)}`)}
    }catch(error){setMessage(error instanceof Error?error.message:'Gagal menyimpan sesi Fertilizer.')}finally{setBusy(false)}
  }

  const card=activeCard,numbers=card?unique(card.unit?(master.unitMap?.[card.unit]||[]):[]):[],activities=card?unique(plans.filter(p=>!card.paddock||String(p.paddock)===card.paddock).map(p=>p.activity)):[],matchingPlan=card?plans.find(p=>String(p.paddock)===card.paddock&&String(p.activity)===card.activity):undefined,cardKg=card?card.fillings.reduce((s,f)=>s+num(f.jumlah),0):0,cardHa=card?card.fillings.reduce((s,f)=>s+num(f.hasilKerja),0):0
  return <section>
    <div className="section-head"><div><div className="eyebrow">FERTILIZER DAILY SESSION</div><h2>{editingUploaded?'Koreksi Fertilizer Uploaded':editing?'Edit Daily Session Fertilizer':'Input Fertilizer per Unit'}</h2></div><span className="badge">Unit-centric</span></div>
    <div className="panel session-bar"><label>Tanggal<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Shift<select value={shift} onChange={e=>setShift(e.target.value)}>{(master.shifts?.length?master.shifts:['1','2']).map(x=><option key={x}>{x}</option>)}</select></label><label>Mandor<select value={mandor} onChange={e=>setMandor(e.target.value)}><option value="">Pilih…</option>{(master.names||[]).map(x=><option key={x}>{x}</option>)}</select></label><label>Asisten<select value={assistant} onChange={e=>setAssistant(e.target.value)}><option value="">Pilih…</option>{(master.assistants||[]).map(x=><option key={x}>{x}</option>)}</select></label></div>
    <div className="unit-tab-shell"><div className="unit-tab-rail" role="tablist" aria-label="Daftar unit">{cards.map((c,i)=><button type="button" role="tab" aria-selected={c.id===card?.id} className={`unit-tab ${c.id===card?.id?'active':''}`} key={c.id} onClick={()=>setActiveCardId(c.id)}><span>UNIT {i+1}</span><strong>{c.noUnit||'Belum dipilih'}</strong><small>{c.paddock||'Paddock -'}</small></button>)}<button type="button" className="unit-tab add-tab" onClick={addUnit}><span>+</span><strong>Tambah Unit</strong><small>Unit baru</small></button></div></div>
    {message&&<div className="alert">{message}</div>}
    {card&&<article className="unit-card active-unit-card"><div className="unit-card-head"><div><div className="eyebrow">UNIT {activeIndex+1} DARI {cards.length}</div><h3>{card.noUnit||'Unit belum dipilih'}</h3><p>{card.paddock||'Paddock -'} • {card.activity||'Activity -'}{card.saveType==='uploaded'?' • Uploaded':card.recordId?' • Draft tersimpan':''}</p></div><div className="row-actions"><button type="button" onClick={()=>duplicateCard(card)}>Duplikat</button>{cards.length>1&&!card.recordId&&<button type="button" className="danger" onClick={()=>removeCard(card)}>Hapus Unit</button>}</div></div>
      <div className="form-grid"><label>Jenis Unit<select value={card.unit} onChange={e=>patchCard(card.id,{unit:e.target.value,noUnit:''})}><option value="">Pilih…</option>{unitTypes.map(x=><option key={x}>{x}</option>)}</select></label><label>No. Unit<select value={card.noUnit} onChange={e=>patchCard(card.id,{noUnit:e.target.value})}><option value="">Pilih…</option>{numbers.map(x=><option key={x}>{x}</option>)}</select></label><label>Paddock<select value={card.paddock} onChange={e=>patchCard(card.id,{paddock:e.target.value,activity:'',type:''})}><option value="">Pilih…</option>{paddocks.map(x=><option key={x}>{x}</option>)}</select></label><label>Activity<select value={card.activity} onChange={e=>{const activity=e.target.value,p=plans.find(x=>String(x.paddock)===card.paddock&&String(x.activity)===activity);patchCard(card.id,{activity,type:String(p?.type||'')})}}><option value="">Pilih…</option>{activities.map(x=><option key={x}>{x}</option>)}</select></label><label>Type<input readOnly value={card.type||String(matchingPlan?.type||'')}/></label></div>
      <section className="subpanel working-section"><div className="section-head"><div><div className="eyebrow">WORKING • PENGISIAN</div><h4>Hasil kerja unit</h4></div><button type="button" onClick={()=>addFilling(card.id)}>+ Tambah Pengisian</button></div><div className="filling-list">{card.fillings.map(f=>{const actual=num(f.hasilKerja)>0?num(f.jumlah)/num(f.hasilKerja):0;return <div className="filling-row fertilizer-filling-row" key={f.id}><strong>#{f.pengisianKe}</strong><label>Dosis Target<input type="number" step=".01" value={f.dosis} onChange={e=>patchFilling(card.id,f.id,{dosis:e.target.value})}/></label><label>Hose<select value={f.statusHose} onChange={e=>patchFilling(card.id,f.id,{statusHose:e.target.value})}><option>Lancar</option><option>Tidak Lancar</option></select></label><label>Jenis Pupuk<input list={`fert-${card.id}`} value={f.jenisPupuk} onChange={e=>{const value=e.target.value,mat=(master.materials||[]).find((m:MaterialMaster)=>String(m.material)===value);patchFilling(card.id,f.id,{jenisPupuk:value,dosis:f.dosis||String(mat?.dosage||'')})}}/><datalist id={`fert-${card.id}`}>{fertilizerNames.map(x=><option value={x} key={x}/>)}</datalist></label><label>Jumlah (Kg)<input type="number" step=".01" value={f.jumlah} onChange={e=>patchFilling(card.id,f.id,{jumlah:e.target.value})}/></label><label>Hasil Kerja (Ha)<input type="number" step=".01" value={f.hasilKerja} onChange={e=>patchFilling(card.id,f.id,{hasilKerja:e.target.value})}/></label><label>Dosis Aktual<input readOnly value={actual?actual.toFixed(2):''}/></label><label>Meratakan Pupuk<select value={f.pemerataanPupuk} onChange={e=>patchFilling(card.id,f.id,{pemerataanPupuk:e.target.value})}><option value="">Pilih…</option><option>1</option><option>2</option><option>3</option><option>4</option><option>&gt;4</option></select></label>{card.fillings.length>1&&<button type="button" className="danger" onClick={()=>removeFilling(card.id,f.id)}>×</button>}</div>})}</div></section>
      <section className="subpanel downtime-section"><div className="section-head"><div><div className="eyebrow">HOLD • ISSUE / DOWNTIME</div><h4>Waktu unit berhenti</h4></div><button type="button" onClick={()=>addDowntime(card.id)}>+ Tambah Issue</button></div>{!card.downtime.length&&<div className="empty compact-empty">Tidak ada issue / downtime.</div>}{card.downtime.map(d=><div className="downtime-row" key={d.id}><input placeholder="Jenis issue" value={d.issue} onChange={e=>patchDowntime(card.id,d.id,{issue:e.target.value})}/><input aria-label="Jam mulai issue" type="time" value={d.start} onChange={e=>patchDowntime(card.id,d.id,{start:e.target.value})}/><input aria-label="Jam selesai issue" type="time" value={d.end} onChange={e=>patchDowntime(card.id,d.id,{end:e.target.value})}/><input placeholder="Catatan issue" value={d.note} onChange={e=>patchDowntime(card.id,d.id,{note:e.target.value})}/><PhotoPicker compact onFile={file=>patchDowntime(card.id,d.id,{file,removePhoto:file?false:d.removePhoto})} onRemove={()=>patchDowntime(card.id,d.id,{file:undefined,removePhoto:true})} selectedName={d.file?.name} existing={!d.removePhoto&&Boolean(d.photoDriveUrl)} removed={d.removePhoto}/><button type="button" className="danger" onClick={()=>patchCard(card.id,{downtime:card.downtime.filter(x=>x.id!==d.id)})}>×</button></div>)}</section>
      <div className="form-grid"><label className="span-2">Catatan<textarea rows={3} value={card.catatan} onChange={e=>patchCard(card.id,{catatan:e.target.value})}/></label><PhotoPicker onFile={file=>patchCard(card.id,{photo:file,removePhoto:file?false:card.removePhoto})} onRemove={()=>patchCard(card.id,{photo:undefined,removePhoto:true})} selectedName={card.photo?.name} existing={!card.removePhoto&&Boolean(card.photoDriveUrl)} removed={card.removePhoto}/></div>
      <div className="unit-summary"><span>Total Pupuk<strong>{cardKg.toLocaleString('id-ID')} Kg</strong></span><span>Total Hasil<strong>{cardHa.toLocaleString('id-ID')} Ha</strong></span><span>Dosis Rata-rata<strong>{cardHa?(cardKg/cardHa).toFixed(2):'0'} Kg/Ha</strong></span></div>
    </article>}
    <div className="panel session-summary"><div><span>Jumlah unit</span><strong>{total.units}</strong></div><div><span>Total pupuk</span><strong>{total.totalKg.toLocaleString('id-ID')} Kg</strong></div><div><span>Total hasil</span><strong>{total.totalHa.toLocaleString('id-ID')} Ha</strong></div></div>
    <div className="form-actions">{editing&&<button type="button" disabled={busy} onClick={onCancelEdit}>Batal Edit</button>}{!editingUploaded&&<button type="button" disabled={busy} onClick={()=>void saveAll('draft')}>{editing?'Perbarui Draft Session':'Simpan Draft Semua Unit'}</button>}<button className="primary" type="button" disabled={busy} onClick={()=>void saveAll('ready')}>{busy?'Menyimpan…':editingUploaded?'Simpan Koreksi Uploaded':editing?'Perbarui Session Siap Upload':'Simpan Semua Unit'}</button></div>
  </section>
}
