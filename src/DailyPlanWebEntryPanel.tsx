import { FormEvent, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { aggregateMaterials, clearPlanDraft, materialLinesFromComponents, planHa, planNum, planRowId, planText, readPlanDraft, writePlanDraft } from './planInputUtils'
import type { User } from './types'

type Props={user:User}
type Monthly={id:string;planLineId:string;monthKey:string;week:string;companyCode:string;farm:string;pid:string;description:string;activity:string;targetAreaHa:number;type:string;activityCategory:string;stage:string;masterVariety:string;componentsSnapshot:unknown[]}
type Daily={dailyPlanId:string;monthlyPlanLineId:string;date:string;shift:string;areaHa:number}
type MasterPaddock={pid:string;companyCode:string;farm:string;stage:string;variety:string}
type MasterActivity={id:string;description:string;activity:string;componentsSnapshot:unknown[]}
type PidDraft={id:string;search:string;monthlyId:string;pid:string;area:string}
type WorkDraft={id:string;sourceType:'MONTHLY'|'ADHOC'|'SUPPORT';shift:string;foreman:string;activitySearch:string;manpower:string;unitName:string;unitReady:string;unitStandby:string;unitBreakdown:string;notes:string;pids:PidDraft[]}
type Draft={date:string;works:WorkDraft[]}

function blankPid():PidDraft{return{id:planRowId('pid'),search:'',monthlyId:'',pid:'',area:''}}
function blankWork():WorkDraft{return{id:planRowId('daily'),sourceType:'MONTHLY',shift:'1',foreman:'',activitySearch:'',manpower:'0',unitName:'',unitReady:'0',unitStandby:'0',unitBreakdown:'0',notes:'',pids:[blankPid()]}}
function normalizeDraft(raw:unknown):Draft{
  const base:Draft={date:new Date().toISOString().slice(0,10),works:[blankWork()]}
  if(!raw||typeof raw!=='object')return base
  const old=raw as Record<string,unknown>,date=planText(old.date)||base.date,legacyShift=planText(old.shift)||'1',legacyForeman=planText(old.foreman)
  if(!Array.isArray(old.works)||!old.works.length)return{date,works:[blankWork()]}
  const works=old.works.map(item=>{
    const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>
    if(Array.isArray(row.pids))return{...blankWork(),...row,id:planText(row.id)||planRowId('daily'),pids:row.pids.length?row.pids.map(p=>({...blankPid(),...((p&&typeof p==='object'?p:{}) as Record<string,unknown>),id:planText((p as Record<string,unknown>)?.id)||planRowId('pid')} as PidDraft)):[blankPid()]} as WorkDraft
    return{...blankWork(),id:planText(row.id)||planRowId('daily'),sourceType:(['MONTHLY','ADHOC','SUPPORT'].includes(planText(row.sourceType))?planText(row.sourceType):'MONTHLY') as WorkDraft['sourceType'],shift:legacyShift,foreman:legacyForeman,activitySearch:planText(row.adhocActivity),manpower:planText(row.manpower)||'0',unitName:planText(row.unitName),unitReady:planText(row.unitReady)||'0',unitStandby:planText(row.unitStandby)||'0',unitBreakdown:planText(row.unitBreakdown)||'0',notes:planText(row.notes),pids:[{...blankPid(),search:planText(row.search),monthlyId:planText(row.monthlyId),pid:planText(row.adhocPid),area:planText(row.area)}]} as WorkDraft
  })
  return{date,works}
}
function searchKey(value:unknown){return planText(value).toLowerCase().replace(/\s+/g,' ').trim()}
function monthlyOptionLabel(row:Monthly){return row.pid+' — '+row.planLineId+' — '+(row.description||row.activity)}
function activityLabel(row:Monthly){return planText(row.description||row.activity)}
function paddockKey(value:unknown){return planText(value).toUpperCase().replace(/\s+/g,'').trim()}
function shortPaddockCode(pid:string){const parts=paddockKey(pid).split('-').filter(Boolean);return parts.length>=2?parts.slice(-2).join('-'):parts.join('-')}
function looksLikePaddockSearch(value:string){const q=paddockKey(value);return /-[0-9]+$/.test(q)}
function smartMonthlyChoices(rows:Monthly[],input:string,activity:string){
  const activityKey=searchKey(activity)
  const scoped=activityKey?rows.filter(row=>searchKey(activityLabel(row))===activityKey):rows
  const q=searchKey(input)
  if(!q)return scoped.slice(0,120)
  if(looksLikePaddockSearch(input)){
    const code=paddockKey(input),shortQuery=code.split('-').length<=2,complete=/-\d{3,4}$/.test(code)
    return scoped.filter(row=>{const full=paddockKey(row.pid),short=shortPaddockCode(row.pid),target=shortQuery?short:full;return complete?target===code:target.startsWith(code)}).slice(0,120)
  }
  return scoped.filter(row=>searchKey(row.planLineId).startsWith(q)||searchKey(row.pid).startsWith(q)).slice(0,120)
}
function activityChoices(rows:Monthly[],input:string){
  const q=searchKey(input),seen=new Set<string>(),out:string[]=[]
  for(const row of rows){const label=activityLabel(row),key=searchKey(label);if(!label||seen.has(key)||q&&!key.startsWith(q))continue;seen.add(key);out.push(label)}
  return out.sort((a,b)=>a.localeCompare(b)).slice(0,80)
}
async function writer(appUser:User){const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum tersedia.');const current=auth.currentUser;if(!current)throw new Error('Login Firebase tidak tersedia.');const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil user tidak ditemukan.');const p=snap.data() as Record<string,unknown>;if(p.active!==true||!['owner','asisten'].includes(planText(p.role))||!['owner','asisten'].includes(appUser.role))throw new Error('Role tidak memiliki izin membuat Daily Plan.');return{db,username:planText(p.username)||appUser.username}}

export default function DailyPlanWebEntryPanel({user}:Props){
  const draftKey='plan_daily_web_draft_'+user.username
  const initial=normalizeDraft(readPlanDraft<unknown>(draftKey,null))
  const[monthly,setMonthly]=useState<Monthly[]>([]),[daily,setDaily]=useState<Daily[]>([]),[paddocks,setPaddocks]=useState<MasterPaddock[]>([]),[activities,setActivities]=useState<MasterActivity[]>([])
  const[draft,setDraft]=useState<Draft>(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState('')

  async function load(){if(!firestoreDb)return;setBusy(true);try{const[m,d,p,a]=await Promise.all([getDocs(collection(firestoreDb,'monthly_plans')),getDocs(collection(firestoreDb,'daily_plans')),getDocs(collection(firestoreDb,'master_paddocks')),getDocs(collection(firestoreDb,'master_activities'))]);setMonthly(m.docs.map(x=>{const r=x.data() as Record<string,unknown>;return{id:x.id,planLineId:planText(r.planLineId||x.id),monthKey:planText(r.monthKey),week:planText(r.week),companyCode:planText(r.companyCode),farm:planText(r.farm),pid:planText(r.pid),description:planText(r.description),activity:planText(r.activity),targetAreaHa:planNum(r.targetAreaHa),type:planText(r.type),activityCategory:planText(r.activityCategory),stage:planText(r.stage),masterVariety:planText(r.masterVariety),componentsSnapshot:Array.isArray(r.componentsSnapshot)?r.componentsSnapshot:[]}}).sort((a,b)=>b.monthKey.localeCompare(a.monthKey)||a.planLineId.localeCompare(b.planLineId,undefined,{numeric:true})));setDaily(d.docs.map(x=>{const r=x.data() as Record<string,unknown>;return{dailyPlanId:planText(r.dailyPlanId||x.id),monthlyPlanLineId:planText(r.monthlyPlanLineId),date:planText(r.date),shift:planText(r.shift),areaHa:planNum(r.areaHa)}}));setPaddocks(p.docs.map(x=>{const r=x.data() as Record<string,unknown>;return{pid:planText(r.pid||x.id).toUpperCase(),companyCode:planText(r.companyCode).toUpperCase(),farm:planText(r.farm),stage:planText(r.currentStage||r.stage),variety:planText(r.variety)}}));setActivities(a.docs.map(x=>{const r=x.data() as Record<string,unknown>;return{id:x.id,description:planText(r.description),activity:planText(r.activity),componentsSnapshot:Array.isArray(r.components)?r.components:[]}}).filter(x=>x.activity||x.description))}catch(e){setMessage(e instanceof Error?e.message:'Data Plan gagal dimuat.')}finally{setBusy(false)}}
  useEffect(()=>{void load()},[])
  useEffect(()=>{writePlanDraft(draftKey,draft)},[draft,draftKey])

  const workInfo=useMemo(()=>draft.works.map(work=>{
    const groupActivity=work.activitySearch.trim(),manualActivity=activities.find(a=>[a.activity,a.description].some(v=>searchKey(v)===searchKey(groupActivity)))||null,activityReference=monthly.find(row=>searchKey(activityLabel(row))===searchKey(groupActivity))||null
    const activityComponents=work.sourceType==='MONTHLY'?(activityReference?.componentsSnapshot||[]):(manualActivity?.componentsSnapshot||[])
    const activityDosePreview=materialLinesFromComponents(activityComponents,1)
    const pids=work.pids.map(pid=>{const choices=work.sourceType==='MONTHLY'?smartMonthlyChoices(monthly,pid.search,groupActivity):[],selected=monthly.find(x=>x.id===pid.monthlyId)||null,paddock=paddocks.find(p=>p.pid===pid.pid.toUpperCase())||null,area=planNum(pid.area),scheduled=selected?daily.filter(x=>x.monthlyPlanLineId===selected.planLineId).reduce((s,x)=>s+x.areaHa,0):0,remaining=selected?selected.targetAreaHa-scheduled:0,materials=materialLinesFromComponents(work.sourceType==='MONTHLY'?(selected?.componentsSnapshot||activityComponents):(manualActivity?.componentsSnapshot||[]),area);return{pid,choices,selected,paddock,area,scheduled,remaining,materials}})
    return{work,activityOptions:work.sourceType==='MONTHLY'?activityChoices(monthly,groupActivity):activities.map(a=>a.activity||a.description).filter(Boolean),manualActivity,activityReference,activityDosePreview,pids,area:pids.reduce((s,x)=>s+x.area,0),materials:aggregateMaterials(pids.map(x=>x.materials))}
  }),[draft.works,monthly,daily,activities,paddocks])
  const totals=useMemo(()=>workInfo.reduce((acc,g)=>({groups:acc.groups+1,pids:acc.pids+g.pids.length,area:acc.area+g.area,manpower:acc.manpower+planNum(g.work.manpower),ready:acc.ready+planNum(g.work.unitReady),standby:acc.standby+planNum(g.work.unitStandby),breakdown:acc.breakdown+planNum(g.work.unitBreakdown)}),{groups:0,pids:0,area:0,manpower:0,ready:0,standby:0,breakdown:0}),[workInfo])
  const totalMaterials=aggregateMaterials(workInfo.flatMap(g=>g.pids.map(x=>x.materials)))

  function patchDraft(patch:Partial<Draft>){setDraft(current=>({...current,...patch}))}
  function patchWork(id:string,patch:Partial<WorkDraft>){setDraft(current=>({...current,works:current.works.map(work=>work.id===id?{...work,...patch}:work)}))}
  function patchPid(workId:string,pidId:string,patch:Partial<PidDraft>){setDraft(current=>({...current,works:current.works.map(work=>work.id===workId?{...work,pids:work.pids.map(pid=>pid.id===pidId?{...pid,...patch}:pid)}:work)}))}
  function addPid(workId:string){setDraft(current=>({...current,works:current.works.map(work=>work.id===workId?{...work,pids:[...work.pids,blankPid()]}:work)}))}
  function removePid(workId:string,pidId:string){setDraft(current=>({...current,works:current.works.map(work=>work.id===workId?{...work,pids:work.pids.length>1?work.pids.filter(pid=>pid.id!==pidId):[blankPid()]}:work)}))}
  function addWork(copy?:WorkDraft){const base=copy?{...copy,id:planRowId('daily'),activitySearch:'',notes:'',pids:[blankPid()]}:blankWork();setDraft(current=>({...current,works:[...current.works,base]}))}
  function removeWork(id:string){setDraft(current=>({...current,works:current.works.length>1?current.works.filter(work=>work.id!==id):[blankWork()]}))}
  function reset(){if(!window.confirm('Kosongkan draft input Daily Plan ini?'))return;clearPlanDraft(draftKey);setDraft({date:new Date().toISOString().slice(0,10),works:[blankWork()]});setMessage('Draft Daily Plan dikosongkan.')}

  async function save(e:FormEvent){e.preventDefault();if(!draft.date){setMessage('Tanggal Daily Plan wajib diisi.');return}
    const invalidGroup=workInfo.find(g=>!g.work.shift.trim()||!g.work.foreman.trim()||!g.work.activitySearch.trim())
    if(invalidGroup){setMessage('Setiap card kegiatan wajib memiliki Shift, Mandor, dan Kegiatan.');return}
    const invalidPid=workInfo.flatMap(g=>g.pids.map(p=>({g,p}))).find(({g,p})=>p.area<=0||(g.work.sourceType==='MONTHLY'&&!p.selected)||(g.work.sourceType!=='MONTHLY'&&!p.pid.pid.trim()))
    if(invalidPid){setMessage(invalidPid.p.area<=0?'Luas setiap PID harus lebih dari 0.':invalidPid.g.work.sourceType==='MONTHLY'?'Pilih Monthly Plan/PID yang valid untuk semua baris.':'Paddock wajib diisi untuk semua baris ADHOC/SUPPORT.');return}
    const mismatch=workInfo.flatMap(g=>g.pids.map(p=>({g,p}))).filter(({g,p})=>g.work.sourceType==='MONTHLY'&&p.selected&&searchKey(activityLabel(p.selected))!==searchKey(g.work.activitySearch))
    if(mismatch.length){setMessage('Ada PID Monthly yang kegiatannya berbeda dari kegiatan pada card. Pilih PID dengan kegiatan yang sama.');return}
    const over=workInfo.flatMap(g=>g.pids.map(p=>({g,p}))).filter(({g,p})=>g.work.sourceType==='MONTHLY'&&p.selected&&p.area>p.remaining+0.0001)
    if(over.length&&!window.confirm(over.length+' PID melebihi sisa Monthly Plan. Tetap simpan?'))return
    const keys=new Set<string>(),allPidRows=workInfo.flatMap(g=>g.pids.map(p=>({g,p}))),batchDup=allPidRows.filter(({g,p})=>{const k=g.work.sourceType==='MONTHLY'?(p.selected?.planLineId||''):[g.work.sourceType,p.pid.pid,g.work.activitySearch].join('|');if(!k)return false;if(keys.has(k))return true;keys.add(k);return false})
    if(batchDup.length&&!window.confirm('Ada Monthly Plan/PID yang dipilih lebih dari sekali. Tetap simpan?'))return
    const existingDup=allPidRows.filter(({g,p})=>g.work.sourceType==='MONTHLY'&&p.selected&&daily.some(d=>d.date===draft.date&&d.shift===g.work.shift&&d.monthlyPlanLineId===p.selected?.planLineId))
    if(existingDup.length&&!window.confirm(existingDup.length+' PID sudah memiliki Daily Plan pada tanggal/shift yang sama. Tetap buat Daily Plan baru?'))return
    setBusy(true);setMessage('Menyimpan '+allPidRows.length+' Daily Plan dari '+workInfo.length+' card kegiatan…')
    try{
      const{db,username}=await writer(user),batch=writeBatch(db),prefix='DP-'+draft.date.replaceAll('-','')+'-'
      let seq=daily.map(x=>x.dailyPlanId.startsWith(prefix)?Number(x.dailyPlanId.slice(prefix.length)):0).filter(Number.isFinite).reduce((m,x)=>Math.max(m,x),0)
      const created:Daily[]=[]
      for(const group of workInfo){
        const isMonthly=group.work.sourceType==='MONTHLY'
        for(const row of group.pids){
          seq++;const selected=row.selected,dailyPlanId=prefix+String(seq).padStart(4,'0'),pid=isMonthly?(selected?.pid||''):row.pid.pid.toUpperCase(),paddock=row.paddock,activity=isMonthly?(selected?.activity||group.work.activitySearch):group.work.activitySearch.trim(),description=isMonthly?(selected?.description||group.work.activitySearch):group.work.activitySearch.trim(),components=isMonthly?(selected?.componentsSnapshot||[]):(group.manualActivity?.componentsSnapshot||[])
          batch.set(doc(db,'daily_plans',dailyPlanId),{dailyPlanId,workGroupId:group.work.id,workGroupPidCount:group.pids.length,sourcePlanIdRaw:isMonthly?(selected?.planLineId||''):'',sourceType:group.work.sourceType,monthlyLinkStatus:isMonthly?'LINKED':'NOT_APPLICABLE',monthlyPlanLineId:isMonthly?(selected?.planLineId||''):'',date:draft.date,year:Number(draft.date.slice(0,4)),monthKey:draft.date.slice(0,7),shift:group.work.shift,activity,description,paddockRaw:pid,pid,areaHa:row.area,areaUnit:'Ha',manpower:planNum(group.work.manpower),unitName:group.work.unitName,unitReady:planNum(group.work.unitReady),unitStandby:planNum(group.work.unitStandby),unitBreakdown:planNum(group.work.unitBreakdown),foreman:group.work.foreman,notes:group.work.notes,companyCode:isMonthly?(selected?.companyCode||''):(paddock?.companyCode||''),farm:isMonthly?(selected?.farm||''):(paddock?.farm||''),stage:isMonthly?(selected?.stage||''):(paddock?.stage||''),masterVariety:isMonthly?(selected?.masterVariety||''):(paddock?.variety||''),masterPending:!isMonthly&&!paddock,materials:row.materials,componentsSnapshot:components,type:isMonthly?(selected?.type||''):'',activityCategory:isMonthly?(selected?.activityCategory||''):'',sourceOrigin:'WEB',lastModifiedSource:'WEB',createdAt:serverTimestamp(),createdBy:username,updatedAt:serverTimestamp(),updatedBy:username})
          created.push({dailyPlanId,monthlyPlanLineId:isMonthly?(selected?.planLineId||''):'',date:draft.date,shift:group.work.shift,areaHa:row.area})
        }
      }
      await batch.commit();setDaily(rows=>[...rows,...created]);clearPlanDraft(draftKey);setDraft({date:draft.date,works:[blankWork()]});setMessage(created.length+' Daily Plan berhasil dibuat dari '+workInfo.length+' card kegiatan. Total '+planHa(totals.area)+'.')
    }catch(err){setMessage(err instanceof Error?err.message:'Gagal membuat Daily Plan.')}finally{setBusy(false)}
  }

  return <section className="plan-entry-screen">
    <div className="section-head"><div><div className="eyebrow">DAILY PLAN · MULTI PID</div><h2>Input Daily Plan</h2><p className="muted">Satu card mewakili satu kegiatan, shift, mandor, HK dan unit. Tambahkan banyak PID di dalam card tanpa mengulang setting pekerjaan.</p></div><div className="row-actions"><button type="button" onClick={()=>void load()} disabled={busy}>Refresh</button><button type="button" className="danger" onClick={reset} disabled={busy}>Reset Draft</button></div></div>
    {message&&<div className="alert">{message}</div>}
    <form onSubmit={save} className="plan-entry-form">
      <section className="panel plan-section"><div className="plan-section-title"><div><span className="eyebrow">TANGGAL PLANNING</span><h3>Daily Planning</h3></div><span className="status-pill">Draft otomatis</span></div><div className="plan-grid"><label><span>Tanggal Daily Plan</span><input type="date" value={draft.date} onChange={e=>patchDraft({date:e.target.value})}/></label></div></section>

      <section className="panel plan-section"><div className="plan-section-title"><div><span className="eyebrow">CARD KEGIATAN</span><h3>Kegiatan, Mandor & Multiple PID</h3></div><button type="button" onClick={()=>addWork()}>+ Tambah Card Kegiatan</button></div>
        <div className="plan-work-list">{workInfo.map((group,index)=><div className="plan-work-card daily-activity-card" key={group.work.id}>
          <div className="plan-work-head"><div><strong>Kegiatan {index+1}</strong><span className="daily-card-subtitle">{group.work.activitySearch||'Belum memilih kegiatan'} · Shift {group.work.shift||'-'} · {group.pids.length} PID</span></div><div className="row-actions"><button type="button" onClick={()=>addWork(group.work)}>Duplikat Setting</button><button type="button" className="danger" onClick={()=>removeWork(group.work.id)}>Hapus Card</button></div></div>
          <div className="plan-grid">
            <label><span>Shift</span><input value={group.work.shift} onChange={e=>patchWork(group.work.id,{shift:e.target.value})} placeholder="1 / 2 / 3"/></label>
            <label><span>Mandor / Foreman</span><input value={group.work.foreman} onChange={e=>patchWork(group.work.id,{foreman:e.target.value})} placeholder="Nama mandor"/></label>
            <label><span>Sumber</span><select value={group.work.sourceType} onChange={e=>patchWork(group.work.id,{sourceType:e.target.value as WorkDraft['sourceType'],activitySearch:'',pids:[blankPid()]})}><option value="MONTHLY">MONTHLY</option><option value="ADHOC">ADHOC</option><option value="SUPPORT">SUPPORT</option></select></label>
            <label><span>Kegiatan</span><input list={'daily-group-activities-'+group.work.id} value={group.work.activitySearch} onChange={e=>patchWork(group.work.id,{activitySearch:e.target.value,pids:group.work.pids.map(pid=>({...pid,search:'',monthlyId:''}))})} placeholder="Ketik top dressing / pre"/><datalist id={'daily-group-activities-'+group.work.id}>{group.activityOptions.map(x=><option key={x} value={x}/>)}</datalist></label>
            <label><span>Jumlah HK</span><input type="number" min="0" step="1" value={group.work.manpower} onChange={e=>patchWork(group.work.id,{manpower:e.target.value})}/></label>
            <label><span>Kode / Nama Unit</span><input value={group.work.unitName} onChange={e=>patchWork(group.work.id,{unitName:e.target.value})} placeholder="Contoh: Stool Splitter"/></label>
            <label><span>Unit Ready</span><input type="number" min="0" step="1" value={group.work.unitReady} onChange={e=>patchWork(group.work.id,{unitReady:e.target.value})}/></label>
            <label><span>Unit Breakdown</span><input type="number" min="0" step="1" value={group.work.unitBreakdown} onChange={e=>patchWork(group.work.id,{unitBreakdown:e.target.value})}/></label>
            <label><span>Unit Standby</span><input type="number" min="0" step="1" value={group.work.unitStandby} onChange={e=>patchWork(group.work.id,{unitStandby:e.target.value})}/></label>
            <label className="plan-span-2"><span>Keterangan Kegiatan</span><input value={group.work.notes} onChange={e=>patchWork(group.work.id,{notes:e.target.value})} placeholder="Opsional"/></label>
          </div>

          <div className="daily-activity-material-preview">
            <div className="daily-material-preview-head"><div><span className="eyebrow">BAHAN & DOSIS ACUAN</span><strong>{group.work.activitySearch||'Pilih kegiatan terlebih dahulu'}</strong></div>{group.area>0&&<span className="status-pill">{planHa(group.area)} total PID</span>}</div>
            {group.activityDosePreview.length>0?<div className="daily-material-dose-list">{group.activityDosePreview.map(m=>{const total=group.materials.find(x=>x.material===m.material&&x.unit===m.unit)?.totalMaterial||0;return <div key={m.material+'|'+m.unit}><span><b>{m.material}</b><small>Dosis {m.dosePerHa.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}/Ha</small></span><strong>{group.area>0?('Total '+total.toLocaleString('id-ID',{maximumFractionDigits:4})+' '+m.unit):'Isi luas PID untuk total'}</strong></div>})}</div>:<div className="daily-material-empty">{group.work.activitySearch?'Belum ada bahan/dosis pada Master Activity atau Monthly Plan untuk kegiatan ini.':'Pilih kegiatan untuk melihat bahan dan dosis.'}</div>}
          </div>

          <div className="daily-pid-section"><div className="daily-pid-head"><div><strong>Multiple PID</strong><span>{group.work.sourceType==='MONTHLY'?'Pilihan PID dibatasi ke kegiatan pada card':'Masukkan paddock dan luas aktual rencana'}</span></div><button type="button" onClick={()=>addPid(group.work.id)}>+ Tambah PID</button></div>
            <div className="daily-pid-list">{group.pids.map((row,pidIndex)=><div className="daily-pid-row" key={row.pid.id}><span className="daily-pid-number">{pidIndex+1}</span>
              {group.work.sourceType==='MONTHLY'?<label className="daily-pid-search"><span>PID / Monthly Plan</span><input list={'monthly-plan-options-'+row.pid.id} value={row.pid.search} onFocus={e=>e.currentTarget.select()} onChange={e=>{const value=e.target.value,matched=monthly.find(month=>monthlyOptionLabel(month)===value||month.planLineId===value);patchPid(group.work.id,row.pid.id,{search:value,monthlyId:matched?.id||''})}} placeholder="Ketik G-007"/><datalist id={'monthly-plan-options-'+row.pid.id}>{row.choices.map(x=><option key={x.id} value={monthlyOptionLabel(x)}/>)}</datalist><small className="plan-search-hint">{row.selected?'Terpilih: '+monthlyOptionLabel(row.selected):group.work.activitySearch?(row.pid.search?row.choices.length+' pilihan cocok':'Ketik kode paddock'):'Pilih kegiatan pada card dahulu'}</small></label>:<label className="daily-pid-search"><span>Paddock</span><input list={'daily-paddocks-'+row.pid.id} value={row.pid.pid} onChange={e=>patchPid(group.work.id,row.pid.id,{pid:e.target.value.toUpperCase()})} placeholder="Contoh: JAGF-2-G-007"/><datalist id={'daily-paddocks-'+row.pid.id}>{paddocks.map(p=><option key={p.pid} value={p.pid}/>)}</datalist></label>}
              <label className="daily-pid-area"><span>Luas (Ha)</span><input type="number" min="0" step="0.0001" value={row.pid.area} onChange={e=>patchPid(group.work.id,row.pid.id,{area:e.target.value})}/></label>
              <button type="button" className="danger daily-pid-remove" onClick={()=>removePid(group.work.id,row.pid.id)}>Hapus</button>
              {row.selected&&<div className="daily-pid-meta"><span>{row.selected.planLineId}</span><span>Target {planHa(row.selected.targetAreaHa)}</span><span>Terjadwal {planHa(row.scheduled)}</span><span>Sisa <b className={row.area>row.remaining?'plan-danger-text':''}>{planHa(row.remaining)}</b></span></div>}
            </div>)}</div>
          </div>

          {group.materials.length>0&&<div className="plan-material-mini"><strong>Bahan & dosis card kegiatan</strong>{group.materials.map(m=><small key={m.material}>{m.material}: <b>{m.dosePerHa} {m.unit}/Ha</b> → Total semua PID {m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</small>)}</div>}
          <div className="plan-inline-info"><span>Jumlah PID <strong>{group.pids.length}</strong></span><span>Total Luas <strong>{planHa(group.area)}</strong></span><span>HK Bersama <strong>{planNum(group.work.manpower)}</strong></span><span>Unit <strong>{group.work.unitName||'-'}</strong></span></div>
        </div>)}</div>
      </section>

      <section className="panel plan-section"><div className="plan-section-title"><div><span className="eyebrow">RINGKASAN HARIAN</span><h3>Total Rencana</h3></div></div><div className="plan-summary-grid"><div><span>Card Kegiatan</span><strong>{totals.groups}</strong></div><div><span>Total PID</span><strong>{totals.pids}</strong></div><div><span>Total Luas</span><strong>{planHa(totals.area)}</strong></div><div><span>Total HK</span><strong>{totals.manpower}</strong></div><div><span>Ready / BD / SB</span><strong>{totals.ready} / {totals.breakdown} / {totals.standby}</strong></div></div>{totalMaterials.length>0&&<div className="plan-material-summary">{totalMaterials.map(m=><span key={m.material+'|'+m.unit}>{m.material}<strong>{m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</strong></span>)}</div>}<button type="submit" className="primary plan-save-button" disabled={busy}>{busy?'Menyimpan…':'Simpan Semua Daily Plan'}</button></section>
    </form>
  </section>
}
