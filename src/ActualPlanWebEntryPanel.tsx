import { FormEvent, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query as fsQuery, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { aggregateMaterials, clearPlanDraft, materialLinesFromComponents, planHa, planNum, planRowId, planText, readPlanDraft, writePlanDraft, type PlanMaterialLine } from './planInputUtils'
import type { User } from './types'

type Props={user:User;prefillDailyPlanIds?:string[];selectedDate?:string;onDateChange?:(date:string)=>void;onSaved?:()=>void}
type Daily={id:string;dailyPlanId:string;date:string;shift:string;monthlyPlanLineId:string;sourceType:string;companyCode:string;farm:string;pid:string;activity:string;description:string;areaHa:number;manpower:number;unitName:string;unitReady:number;unitStandby:number;unitBreakdown:number;foreman:string;notes:string;componentsSnapshot:unknown[];materials:PlanMaterialLine[]}
type ActualRef={actualReportId:string;dailyPlanId:string;date:string}
type WorkDraft={id:string;dailyId:string;area:string;manpower:string;unitName:string;unitReady:string;unitStandby:string;unitBreakdown:string;notes:string}
type Draft={date:string;foreman:string;works:WorkDraft[]}

function blankWork():WorkDraft{return{id:planRowId('actual'),dailyId:'',area:'',manpower:'0',unitName:'',unitReady:'0',unitStandby:'0',unitBreakdown:'0',notes:''}}
function materialsFromData(value:unknown):PlanMaterialLine[]{if(!Array.isArray(value))return[];return value.map(item=>{const x=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return{material:planText(x.material),dosePerHa:planNum(x.dosePerHa),doseUnit:planText(x.doseUnit),totalMaterial:planNum(x.totalMaterial),unit:planText(x.unit)}}).filter(x=>x.material)}
async function writer(appUser:User){const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum tersedia.');const current=auth.currentUser;if(!current)throw new Error('Login Firebase tidak tersedia.');const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil user tidak ditemukan.');const p=snap.data() as Record<string,unknown>;if(p.active!==true||!['owner','asisten'].includes(planText(p.role))||!['owner','asisten'].includes(appUser.role))throw new Error('Role tidak memiliki izin membuat Actual Plan.');return{db,username:planText(p.username)||appUser.username}}

export default function ActualPlanWebEntryPanel({user,prefillDailyPlanIds=[],selectedDate,onDateChange,onSaved}:Props){
  const draftKey='plan_actual_web_draft_'+user.username
  const storedInitial=readPlanDraft<Draft>(draftKey,{date:new Date().toISOString().slice(0,10),foreman:'',works:[blankWork()]})
  const initial={...storedInitial,date:selectedDate||storedInitial.date}
  const[daily,setDaily]=useState<Daily[]>([]),[actuals,setActuals]=useState<ActualRef[]>([])
  const[draft,setDraft]=useState<Draft>(()=>({...initial,works:initial.works?.length?initial.works:[blankWork()]})),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')

  async function load(date=draft.date){if(!firestoreDb||!date)return;setBusy(true);try{const[d,a]=await Promise.all([getDocs(fsQuery(collection(firestoreDb,'daily_plans'),where('date','==',date))),getDocs(fsQuery(collection(firestoreDb,'daily_reports'),where('date','==',date)))]);setDaily(d.docs.map(x=>{const r=x.data() as Record<string,unknown>;return{id:x.id,dailyPlanId:planText(r.dailyPlanId||x.id),date:planText(r.date),shift:planText(r.shift),monthlyPlanLineId:planText(r.monthlyPlanLineId),sourceType:planText(r.sourceType),companyCode:planText(r.companyCode),farm:planText(r.farm),pid:planText(r.pid),activity:planText(r.activity),description:planText(r.description),areaHa:planNum(r.areaHa),manpower:planNum(r.manpower),unitName:planText(r.unitName),unitReady:planNum(r.unitReady),unitStandby:planNum(r.unitStandby),unitBreakdown:planNum(r.unitBreakdown),foreman:planText(r.foreman),notes:planText(r.notes),componentsSnapshot:Array.isArray(r.componentsSnapshot)?r.componentsSnapshot:[],materials:materialsFromData(r.materials)}}).sort((a,b)=>a.shift.localeCompare(b.shift,undefined,{numeric:true})||a.dailyPlanId.localeCompare(b.dailyPlanId)));setActuals(a.docs.map(x=>{const r=x.data() as Record<string,unknown>;return{actualReportId:planText(r.actualReportId||x.id),dailyPlanId:planText(r.dailyPlanId),date:planText(r.date)}}))}catch(e){setMessage(e instanceof Error?e.message:'Data Actual periode gagal dimuat.')}finally{setBusy(false)}}
  useEffect(()=>{void load(draft.date);onDateChange?.(draft.date)},[draft.date])
  useEffect(()=>{if(selectedDate&&selectedDate!==draft.date)setDraft(current=>({...current,date:selectedDate}))},[selectedDate])
  useEffect(()=>{writePlanDraft(draftKey,draft)},[draft,draftKey])
  useEffect(()=>{
    if(!prefillDailyPlanIds.length||!daily.length)return
    const selected=daily.filter(row=>prefillDailyPlanIds.includes(row.dailyPlanId))
    if(!selected.length)return
    setDraft(current=>({...current,date:selected[0]?.date||current.date,foreman:selected[0]?.foreman||current.foreman,works:selected.map(row=>({id:planRowId('actual'),dailyId:row.id,area:String(row.areaHa),manpower:String(row.manpower||0),unitName:row.unitName||'',unitReady:String(row.unitReady||0),unitStandby:String(row.unitStandby||0),unitBreakdown:String(row.unitBreakdown||0),notes:row.notes||''}))}))
    setMessage(selected.length+' Daily Plan disiapkan dari Copy to Actual.')
  },[prefillDailyPlanIds.join('|'),daily.length])

  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return daily.filter(x=>!q||[x.dailyPlanId,x.monthlyPlanLineId,x.pid,x.activity,x.description,x.companyCode,x.farm,x.date].join(' ').toLowerCase().includes(q)).slice(0,450)},[daily,query])
  const workInfo=useMemo(()=>draft.works.map(work=>{const selected=daily.find(x=>x.id===work.dailyId)||null,area=planNum(work.area),variance=selected?area-selected.areaHa:0,materials=selected?.componentsSnapshot.length?materialLinesFromComponents(selected.componentsSnapshot,area):(selected?.materials||[]).map(m=>({...m,totalMaterial:Number((m.dosePerHa*area).toFixed(4))}));return{work,selected,area,variance,materials}}),[draft.works,daily])
  const totals=useMemo(()=>workInfo.reduce((acc,x)=>({area:acc.area+x.area,planned:acc.planned+(x.selected?.areaHa||0),manpower:acc.manpower+planNum(x.work.manpower),ready:acc.ready+planNum(x.work.unitReady),standby:acc.standby+planNum(x.work.unitStandby),breakdown:acc.breakdown+planNum(x.work.unitBreakdown)}),{area:0,planned:0,manpower:0,ready:0,standby:0,breakdown:0}),[workInfo])
  const totalMaterials=aggregateMaterials(workInfo.map(x=>x.materials))

  function patchDraft(patch:Partial<Draft>){setDraft(current=>({...current,...patch}))}
  function patchWork(id:string,patch:Partial<WorkDraft>){setDraft(current=>({...current,works:current.works.map(work=>work.id===id?{...work,...patch}:work)}))}
  function chooseDaily(id:string,dailyId:string){const selected=daily.find(x=>x.id===dailyId);patchWork(id,{dailyId,area:selected?String(selected.areaHa):''});if(selected&&draft.works.length===1&&!draft.works[0].dailyId)patchDraft({date:selected.date||draft.date})}
  function addWork(copy?:WorkDraft){setDraft(current=>({...current,works:[...current.works,{...(copy||blankWork()),id:planRowId('actual'),area:'',notes:''}]}))}
  function removeWork(id:string){setDraft(current=>({...current,works:current.works.length>1?current.works.filter(work=>work.id!==id):[blankWork()]}))}
  function reset(){if(!window.confirm('Kosongkan draft input Actual Plan ini?'))return;clearPlanDraft(draftKey);setDraft({date:new Date().toISOString().slice(0,10),foreman:'',works:[blankWork()]});setQuery('');setMessage('Draft Actual Plan dikosongkan.')}

  async function save(e:FormEvent){e.preventDefault();if(!draft.date){setMessage('Tanggal Actual wajib diisi.');return}
    const invalid=workInfo.find(x=>!x.selected||x.area<0)
    if(invalid){setMessage(!invalid.selected?'Pilih Daily Plan untuk semua pekerjaan.':'Luas Actual tidak boleh negatif.');return}
    const over=workInfo.filter(x=>x.selected&&x.area>x.selected.areaHa+0.0001)
    if(over.length&&!window.confirm(over.length+' Actual melebihi luas Daily Plan. Tetap simpan?'))return
    const keys=new Set<string>(),batchDup=workInfo.filter(x=>{const k=x.selected?.dailyPlanId||'';if(!k)return false;if(keys.has(k))return true;keys.add(k);return false})
    if(batchDup.length&&!window.confirm('Ada Daily Plan yang dipilih lebih dari sekali dalam sesi Actual ini. Tetap simpan sebagai record terpisah?'))return
    const existingDup=workInfo.filter(x=>x.selected&&actuals.some(a=>a.dailyPlanId===x.selected?.dailyPlanId))
    if(existingDup.length&&!window.confirm(existingDup.length+' Daily Plan sudah memiliki Actual sebelumnya. Tetap buat Actual tambahan?'))return
    setBusy(true);setMessage('Menyimpan '+workInfo.length+' Actual…')
    try{
      const{db,username}=await writer(user),batch=writeBatch(db),prefix='AR-'+draft.date.replaceAll('-','')+'-'
      let seq=actuals.map(x=>x.actualReportId.startsWith(prefix)?Number(x.actualReportId.slice(prefix.length)):0).filter(Number.isFinite).reduce((m,x)=>Math.max(m,x),0)
      const created:ActualRef[]=[]
      for(const info of workInfo){seq++;const selected=info.selected!,actualReportId=prefix+String(seq).padStart(4,'0'),monthlyPlanLineId=selected.monthlyPlanLineId;batch.set(doc(db,'daily_reports',actualReportId),{actualReportId,dailySourcePlanIdRaw:selected.dailyPlanId,sourceType:selected.sourceType||'MONTHLY',dailyPlanId:selected.dailyPlanId,dailyLinkStatus:'LINKED',monthlyPlanLineId,monthlyLinkStatus:monthlyPlanLineId?'LINKED':'NOT_APPLICABLE',date:draft.date,year:Number(draft.date.slice(0,4)),monthKey:draft.date.slice(0,7),shift:selected.shift,activity:selected.activity,paddockRaw:selected.pid,pid:selected.pid,actualAreaHa:info.area,areaUnit:'Ha',manpower:planNum(info.work.manpower),unitName:info.work.unitName,unitReady:planNum(info.work.unitReady),unitStandby:planNum(info.work.unitStandby),unitBreakdown:planNum(info.work.unitBreakdown),foreman:draft.foreman,notes:info.work.notes,materials:info.materials,plannedDailyAreaHa:selected.areaHa,dailyVarianceHa:selected.areaHa-info.area,companyCode:selected.companyCode,farm:selected.farm,masterPending:false,sourceOrigin:'WEB',lastModifiedSource:'WEB',createdAt:serverTimestamp(),createdBy:username,updatedAt:serverTimestamp(),updatedBy:username});created.push({actualReportId,dailyPlanId:selected.dailyPlanId,date:draft.date})}
      await batch.commit();setActuals(rows=>[...rows,...created]);clearPlanDraft(draftKey);setDraft(current=>({...current,works:[blankWork()]}));setMessage(created.length+' Actual berhasil disimpan. Total '+planHa(totals.area)+'; progress Monthly akan mengikuti link Daily → Monthly.');onSaved?.()
    }catch(err){setMessage(err instanceof Error?err.message:'Gagal menyimpan Actual.')}finally{setBusy(false)}
  }

  return <section className="plan-entry-screen">
    <div className="section-head"><div><div className="eyebrow">ACTUAL PLAN · BATCH INPUT</div><h2>Input Actual Plan</h2><p className="muted">Tarik beberapa Daily Plan sekaligus. Link ke Monthly dipertahankan otomatis dan selisih plan vs actual terlihat sebelum disimpan.</p></div><div className="row-actions"><button type="button" onClick={()=>void load()} disabled={busy}>Refresh</button><button type="button" className="danger" onClick={reset} disabled={busy}>Reset Draft</button></div></div>
    {message&&<div className="alert">{message}</div>}
    <form onSubmit={save} className="plan-entry-form">
      <section className="panel plan-section"><div className="plan-section-title"><div><span className="eyebrow">AKTUALISASI</span><h3>Tanggal & Penanggung Jawab</h3></div><span className="status-pill">Draft otomatis</span></div><div className="plan-grid">
        <label><span>Tanggal Actual</span><input type="date" value={draft.date} onChange={e=>patchDraft({date:e.target.value})}/></label>
        <label><span>Mandor / Foreman</span><input value={draft.foreman} onChange={e=>patchDraft({foreman:e.target.value})} placeholder="Nama mandor"/></label>
        <label className="plan-span-2"><span>Cari Daily Plan</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Daily ID / Monthly ID / PID / Activity / tanggal"/></label>
      </div></section>

      <section className="panel plan-section"><div className="plan-section-title"><div><span className="eyebrow">HASIL PEKERJAAN</span><h3>Daily → Actual</h3></div><button type="button" onClick={()=>addWork()}>+ Tambah Actual</button></div>
        <div className="plan-work-list">{workInfo.map((info,index)=><div className="plan-work-card" key={info.work.id}><div className="plan-work-head"><strong>Actual {index+1}</strong><div className="row-actions">{info.selected&&<button type="button" onClick={()=>addWork(info.work)}>Duplikat</button>}<button type="button" className="danger" onClick={()=>removeWork(info.work.id)}>Hapus</button></div></div><div className="plan-grid">
          <label className="plan-span-2"><span>Daily Plan</span><select value={info.work.dailyId} onChange={e=>chooseDaily(info.work.id,e.target.value)}><option value="">Pilih Daily Plan</option>{filtered.map(x=><option key={x.id} value={x.id}>{x.dailyPlanId} — {x.date} — Shift {x.shift||'-'} — {x.pid} — {x.activity}</option>)}</select></label>
          <label><span>Luas Actual (Ha)</span><input type="number" min="0" step="0.0001" value={info.work.area} onChange={e=>patchWork(info.work.id,{area:e.target.value})}/></label>
          <label><span>Jumlah HK</span><input type="number" min="0" step="1" value={info.work.manpower} onChange={e=>patchWork(info.work.id,{manpower:e.target.value})}/></label>
          <label><span>Kode / Nama Unit</span><input value={info.work.unitName} onChange={e=>patchWork(info.work.id,{unitName:e.target.value})} placeholder="Opsional"/></label>
          <label><span>Unit Ready</span><input type="number" min="0" step="1" value={info.work.unitReady} onChange={e=>patchWork(info.work.id,{unitReady:e.target.value})}/></label>
          <label><span>Unit Breakdown</span><input type="number" min="0" step="1" value={info.work.unitBreakdown} onChange={e=>patchWork(info.work.id,{unitBreakdown:e.target.value})}/></label>
          <label><span>Unit Standby</span><input type="number" min="0" step="1" value={info.work.unitStandby} onChange={e=>patchWork(info.work.id,{unitStandby:e.target.value})}/></label>
          <label className="plan-span-2"><span>Keterangan</span><input value={info.work.notes} onChange={e=>patchWork(info.work.id,{notes:e.target.value})} placeholder="Opsional"/></label>
        </div>{info.selected&&<><div className="plan-inline-info"><span>Daily <strong>{info.selected.dailyPlanId}</strong></span><span>Monthly <strong>{info.selected.monthlyPlanLineId||'-'}</strong></span><span>PID <strong>{info.selected.pid}</strong></span><span>Plan <strong>{planHa(info.selected.areaHa)}</strong></span><span>Selisih <strong className={info.variance>0?'plan-danger-text':info.variance<0?'plan-ok-text':''}>{info.variance>0?'+':''}{planHa(info.variance)}</strong></span></div>{info.materials.length>0&&<div className="plan-material-mini"><strong>Estimasi bahan pada luas actual</strong>{info.materials.map(m=><small key={m.material}>{m.material}: {m.dosePerHa} {m.unit}/Ha → <b>{m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</b></small>)}</div>}</>}</div>)}</div>
      </section>

      <section className="panel plan-section"><div className="plan-section-title"><div><span className="eyebrow">RINGKASAN ACTUAL</span><h3>Total Hasil</h3></div></div><div className="plan-summary-grid"><div><span>Record</span><strong>{draft.works.length}</strong></div><div><span>Plan Harian</span><strong>{planHa(totals.planned)}</strong></div><div><span>Actual</span><strong>{planHa(totals.area)}</strong></div><div><span>Selisih</span><strong className={totals.area>totals.planned?'plan-danger-text':'plan-ok-text'}>{totals.area-totals.planned>0?'+':''}{planHa(totals.area-totals.planned)}</strong></div><div><span>Total HK</span><strong>{totals.manpower}</strong></div><div><span>Ready / BD / SB</span><strong>{totals.ready} / {totals.breakdown} / {totals.standby}</strong></div></div>{totalMaterials.length>0&&<div className="plan-material-summary">{totalMaterials.map(m=><span key={m.material+'|'+m.unit}>{m.material}<strong>{m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</strong></span>)}</div>}<button type="submit" className="primary plan-save-button" disabled={busy}>{busy?'Menyimpan…':'Simpan Semua Actual'}</button></section>
    </form>
  </section>
}
