import { FormEvent, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { aggregateMaterials, clearPlanDraft, materialLinesFromComponents, planHa, planNum, planRowId, planText, readPlanDraft, writePlanDraft } from './planInputUtils'
import type { User } from './types'

type Props={user:User}
type Monthly={id:string;planLineId:string;monthKey:string;week:string;companyCode:string;farm:string;pid:string;description:string;activity:string;targetAreaHa:number;type:string;activityCategory:string;stage:string;masterVariety:string;componentsSnapshot:unknown[]}
type Daily={dailyPlanId:string;monthlyPlanLineId:string;date:string;shift:string;areaHa:number}
type WorkDraft={id:string;monthlyId:string;area:string;manpower:string;unitName:string;unitReady:string;unitStandby:string;unitBreakdown:string;notes:string}
type Draft={date:string;shift:string;foreman:string;works:WorkDraft[]}

function blankWork():WorkDraft{return{id:planRowId('daily'),monthlyId:'',area:'',manpower:'0',unitName:'',unitReady:'0',unitStandby:'0',unitBreakdown:'0',notes:''}}
async function writer(appUser:User){const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum tersedia.');const current=auth.currentUser;if(!current)throw new Error('Login Firebase tidak tersedia.');const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil user tidak ditemukan.');const p=snap.data() as Record<string,unknown>;if(p.active!==true||!['owner','asisten'].includes(planText(p.role))||!['owner','asisten'].includes(appUser.role))throw new Error('Role tidak memiliki izin membuat Daily Plan.');return{db,username:planText(p.username)||appUser.username}}

export default function DailyPlanWebEntryPanel({user}:Props){
  const draftKey='plan_daily_web_draft_'+user.username
  const initial=readPlanDraft<Draft>(draftKey,{date:new Date().toISOString().slice(0,10),shift:'1',foreman:'',works:[blankWork()]})
  const[monthly,setMonthly]=useState<Monthly[]>([]),[daily,setDaily]=useState<Daily[]>([])
  const[draft,setDraft]=useState<Draft>(()=>({...initial,works:initial.works?.length?initial.works:[blankWork()]})),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')

  async function load(){if(!firestoreDb)return;setBusy(true);try{const[m,d]=await Promise.all([getDocs(collection(firestoreDb,'monthly_plans')),getDocs(collection(firestoreDb,'daily_plans'))]);setMonthly(m.docs.map(x=>{const r=x.data() as Record<string,unknown>;return{id:x.id,planLineId:planText(r.planLineId||x.id),monthKey:planText(r.monthKey),week:planText(r.week),companyCode:planText(r.companyCode),farm:planText(r.farm),pid:planText(r.pid),description:planText(r.description),activity:planText(r.activity),targetAreaHa:planNum(r.targetAreaHa),type:planText(r.type),activityCategory:planText(r.activityCategory),stage:planText(r.stage),masterVariety:planText(r.masterVariety),componentsSnapshot:Array.isArray(r.componentsSnapshot)?r.componentsSnapshot:[]}}).sort((a,b)=>b.monthKey.localeCompare(a.monthKey)||a.planLineId.localeCompare(b.planLineId,undefined,{numeric:true})));setDaily(d.docs.map(x=>{const r=x.data() as Record<string,unknown>;return{dailyPlanId:planText(r.dailyPlanId||x.id),monthlyPlanLineId:planText(r.monthlyPlanLineId),date:planText(r.date),shift:planText(r.shift),areaHa:planNum(r.areaHa)}}))}catch(e){setMessage(e instanceof Error?e.message:'Data Plan gagal dimuat.')}finally{setBusy(false)}}
  useEffect(()=>{void load()},[])
  useEffect(()=>{writePlanDraft(draftKey,draft)},[draft,draftKey])

  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return monthly.filter(x=>!q||[x.planLineId,x.pid,x.description,x.activity,x.companyCode,x.farm,x.monthKey].join(' ').toLowerCase().includes(q)).slice(0,400)},[monthly,query])
  const workInfo=useMemo(()=>draft.works.map(work=>{const selected=monthly.find(x=>x.id===work.monthlyId)||null,area=planNum(work.area),scheduled=selected?daily.filter(x=>x.monthlyPlanLineId===selected.planLineId).reduce((s,x)=>s+x.areaHa,0):0,remaining=selected?selected.targetAreaHa-scheduled:0,materials=materialLinesFromComponents(selected?.componentsSnapshot||[],area);return{work,selected,area,scheduled,remaining,materials}}),[draft.works,monthly,daily])
  const totals=useMemo(()=>workInfo.reduce((acc,x)=>({area:acc.area+x.area,manpower:acc.manpower+planNum(x.work.manpower),ready:acc.ready+planNum(x.work.unitReady),standby:acc.standby+planNum(x.work.unitStandby),breakdown:acc.breakdown+planNum(x.work.unitBreakdown)}),{area:0,manpower:0,ready:0,standby:0,breakdown:0}),[workInfo])
  const totalMaterials=aggregateMaterials(workInfo.map(x=>x.materials))

  function patchDraft(patch:Partial<Draft>){setDraft(current=>({...current,...patch}))}
  function patchWork(id:string,patch:Partial<WorkDraft>){setDraft(current=>({...current,works:current.works.map(work=>work.id===id?{...work,...patch}:work)}))}
  function addWork(copy?:WorkDraft){setDraft(current=>({...current,works:[...current.works,{...(copy||blankWork()),id:planRowId('daily'),area:'',notes:''}]}))}
  function removeWork(id:string){setDraft(current=>({...current,works:current.works.length>1?current.works.filter(work=>work.id!==id):[blankWork()]}))}
  function reset(){if(!window.confirm('Kosongkan draft input Daily Plan ini?'))return;clearPlanDraft(draftKey);setDraft({date:new Date().toISOString().slice(0,10),shift:'1',foreman:'',works:[blankWork()]});setQuery('');setMessage('Draft Daily Plan dikosongkan.')}

  async function save(e:FormEvent){e.preventDefault();if(!draft.date||!draft.shift){setMessage('Tanggal dan Shift wajib diisi.');return}
    const invalid=workInfo.find(x=>!x.selected||x.area<=0)
    if(invalid){setMessage(!invalid.selected?'Pilih Monthly Plan untuk semua pekerjaan.':'Luas Plan Harian harus lebih dari 0.');return}
    const over=workInfo.filter(x=>x.selected&&x.area>x.remaining+0.0001)
    if(over.length&&!window.confirm(over.length+' pekerjaan melebihi sisa Monthly Plan. Tetap simpan?'))return
    const keys=new Set<string>(),batchDup=workInfo.filter(x=>{const k=x.selected?.planLineId||'';if(!k)return false;if(keys.has(k))return true;keys.add(k);return false})
    if(batchDup.length&&!window.confirm('Ada Monthly Plan yang dipilih lebih dari sekali dalam sesi ini. Lanjutkan sebagai pekerjaan terpisah?'))return
    const existingDup=workInfo.filter(x=>x.selected&&daily.some(d=>d.date===draft.date&&d.shift===draft.shift&&d.monthlyPlanLineId===x.selected?.planLineId))
    if(existingDup.length&&!window.confirm(existingDup.length+' pekerjaan sudah memiliki Daily Plan pada tanggal/shift yang sama. Tetap buat Daily Plan baru?'))return
    setBusy(true);setMessage('Menyimpan '+workInfo.length+' Daily Plan…')
    try{
      const{db,username}=await writer(user),batch=writeBatch(db),prefix='DP-'+draft.date.replaceAll('-','')+'-'
      let seq=daily.map(x=>x.dailyPlanId.startsWith(prefix)?Number(x.dailyPlanId.slice(prefix.length)):0).filter(Number.isFinite).reduce((m,x)=>Math.max(m,x),0)
      const created:Daily[]=[]
      for(const info of workInfo){seq++;const selected=info.selected!,dailyPlanId=prefix+String(seq).padStart(4,'0');batch.set(doc(db,'daily_plans',dailyPlanId),{dailyPlanId,sourcePlanIdRaw:selected.planLineId,sourceType:'MONTHLY',monthlyLinkStatus:'LINKED',monthlyPlanLineId:selected.planLineId,date:draft.date,year:Number(draft.date.slice(0,4)),monthKey:draft.date.slice(0,7),shift:draft.shift,activity:selected.activity,description:selected.description,paddockRaw:selected.pid,pid:selected.pid,areaHa:info.area,areaUnit:'Ha',manpower:planNum(info.work.manpower),unitName:info.work.unitName,unitReady:planNum(info.work.unitReady),unitStandby:planNum(info.work.unitStandby),unitBreakdown:planNum(info.work.unitBreakdown),foreman:draft.foreman,notes:info.work.notes,companyCode:selected.companyCode,farm:selected.farm,stage:selected.stage,masterVariety:selected.masterVariety,masterPending:false,materials:info.materials,componentsSnapshot:selected.componentsSnapshot,type:selected.type,activityCategory:selected.activityCategory,sourceOrigin:'WEB',lastModifiedSource:'WEB',createdAt:serverTimestamp(),createdBy:username,updatedAt:serverTimestamp(),updatedBy:username});created.push({dailyPlanId,monthlyPlanLineId:selected.planLineId,date:draft.date,shift:draft.shift,areaHa:info.area})}
      await batch.commit();setDaily(rows=>[...rows,...created]);clearPlanDraft(draftKey);setDraft(current=>({...current,works:[blankWork()]}));setMessage(created.length+' Daily Plan berhasil dibuat. Total '+planHa(totals.area)+'.')
    }catch(err){setMessage(err instanceof Error?err.message:'Gagal membuat Daily Plan.')}finally{setBusy(false)}
  }

  return <section className="plan-entry-screen">
    <div className="section-head"><div><div className="eyebrow">DAILY PLAN · BATCH INPUT</div><h2>Input Daily Plan</h2><p className="muted">Tarik pekerjaan dari Monthly Plan, atur luas harian, tenaga/unit, dan material dihitung otomatis dari snapshot Activity.</p></div><div className="row-actions"><button type="button" onClick={()=>void load()} disabled={busy}>Refresh</button><button type="button" className="danger" onClick={reset} disabled={busy}>Reset Draft</button></div></div>
    {message&&<div className="alert">{message}</div>}
    <form onSubmit={save} className="plan-entry-form">
      <section className="panel plan-section"><div className="plan-section-title"><div><span className="eyebrow">INPUT PLANNING</span><h3>Tanggal & Penanggung Jawab</h3></div><span className="status-pill">Draft otomatis</span></div><div className="plan-grid">
        <label><span>Tanggal Daily Plan</span><input type="date" value={draft.date} onChange={e=>patchDraft({date:e.target.value})}/></label>
        <label><span>Shift</span><input value={draft.shift} onChange={e=>patchDraft({shift:e.target.value})} placeholder="1 / 2 / 3"/></label>
        <label><span>Mandor / Foreman</span><input value={draft.foreman} onChange={e=>patchDraft({foreman:e.target.value})} placeholder="Nama mandor"/></label>
        <label><span>Cari Monthly Plan</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Plan ID / PID / Activity / bulan"/></label>
      </div></section>

      <section className="panel plan-section"><div className="plan-section-title"><div><span className="eyebrow">PEKERJAAN HARIAN</span><h3>Monthly → Daily</h3></div><button type="button" onClick={()=>addWork()}>+ Tambah Pekerjaan</button></div>
        <div className="plan-work-list">{workInfo.map((info,index)=><div className="plan-work-card" key={info.work.id}><div className="plan-work-head"><strong>Pekerjaan {index+1}</strong><div className="row-actions">{info.selected&&<button type="button" onClick={()=>addWork(info.work)}>Duplikat</button>}<button type="button" className="danger" onClick={()=>removeWork(info.work.id)}>Hapus</button></div></div><div className="plan-grid">
          <label className="plan-span-2"><span>Monthly Plan</span><select value={info.work.monthlyId} onChange={e=>patchWork(info.work.id,{monthlyId:e.target.value})}><option value="">Pilih Monthly Plan</option>{filtered.map(x=><option key={x.id} value={x.id}>{x.planLineId} — {x.pid} — {x.description}</option>)}</select></label>
          <label><span>Luas Plan Harian (Ha)</span><input type="number" min="0" step="0.0001" value={info.work.area} onChange={e=>patchWork(info.work.id,{area:e.target.value})}/></label>
          <label><span>Jumlah HK</span><input type="number" min="0" step="1" value={info.work.manpower} onChange={e=>patchWork(info.work.id,{manpower:e.target.value})}/></label>
          <label><span>Kode / Nama Unit</span><input value={info.work.unitName} onChange={e=>patchWork(info.work.id,{unitName:e.target.value})} placeholder="Opsional"/></label>
          <label><span>Unit Ready</span><input type="number" min="0" step="1" value={info.work.unitReady} onChange={e=>patchWork(info.work.id,{unitReady:e.target.value})}/></label>
          <label><span>Unit Breakdown</span><input type="number" min="0" step="1" value={info.work.unitBreakdown} onChange={e=>patchWork(info.work.id,{unitBreakdown:e.target.value})}/></label>
          <label><span>Unit Standby</span><input type="number" min="0" step="1" value={info.work.unitStandby} onChange={e=>patchWork(info.work.id,{unitStandby:e.target.value})}/></label>
          <label className="plan-span-2"><span>Keterangan</span><input value={info.work.notes} onChange={e=>patchWork(info.work.id,{notes:e.target.value})} placeholder="Opsional"/></label>
        </div>{info.selected&&<><div className="plan-inline-info"><span>Monthly <strong>{info.selected.planLineId}</strong></span><span>PID <strong>{info.selected.pid}</strong></span><span>Target <strong>{planHa(info.selected.targetAreaHa)}</strong></span><span>Terjadwal <strong>{planHa(info.scheduled)}</strong></span><span>Sisa <strong className={info.area>info.remaining?'plan-danger-text':''}>{planHa(info.remaining)}</strong></span></div>{info.materials.length>0&&<div className="plan-material-mini"><strong>Bahan kerja otomatis</strong>{info.materials.map(m=><small key={m.material}>{m.material}: {m.dosePerHa} {m.unit}/Ha → <b>{m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</b></small>)}</div>}</>}</div>)}</div>
      </section>

      <section className="panel plan-section"><div className="plan-section-title"><div><span className="eyebrow">RINGKASAN HARIAN</span><h3>Total Rencana</h3></div></div><div className="plan-summary-grid"><div><span>Pekerjaan</span><strong>{draft.works.length}</strong></div><div><span>Total Luas</span><strong>{planHa(totals.area)}</strong></div><div><span>Total HK</span><strong>{totals.manpower}</strong></div><div><span>Ready</span><strong>{totals.ready}</strong></div><div><span>Breakdown</span><strong>{totals.breakdown}</strong></div><div><span>Standby</span><strong>{totals.standby}</strong></div></div>{totalMaterials.length>0&&<div className="plan-material-summary">{totalMaterials.map(m=><span key={m.material+'|'+m.unit}>{m.material}<strong>{m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</strong></span>)}</div>}<button type="submit" className="primary plan-save-button" disabled={busy}>{busy?'Menyimpan…':'Simpan Semua Daily Plan'}</button></section>
    </form>
  </section>
}
