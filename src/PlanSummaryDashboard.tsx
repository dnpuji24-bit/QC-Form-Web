import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query as fsQuery, where } from 'firebase/firestore'
import { firestoreDb } from './firebase'

type MonthlyRow={planLineId:string;monthKey:string;week:string;companyCode:string;farm:string;pid:string;activity:string;description:string;targetAreaHa:number;manualActualAreaHa:number;variety:string;stage:string;cancelled:boolean;sourceStatus:string}
type DailyRow={dailyPlanId:string;date:string;monthKey:string;shift:string;companyCode:string;farm:string;pid:string;activity:string;areaHa:number;sourceType:string;monthlyPlanLineId:string;foreman:string}
type ActualRow={actualReportId:string;date:string;monthKey:string;shift:string;companyCode:string;farm:string;pid:string;activity:string;actualAreaHa:number;dailyPlanId:string;monthlyPlanLineId:string;foreman:string}
type PaddockSummary={pid:string;companyCode:string;farm:string;variety:string;stage:string;target:number;cancelledTarget:number;daily:number;actualLinked:number;manual:number;actual:number;balance:number;lastActual:string}
type ActivitySummary={activity:string;target:number;daily:number;actual:number}
type TimelineRow={key:string;date:string;pid:string;activity:string;daily:number;actual:number;foremen:string[];dailyIds:number;actualIds:number}
type MasterPaddockRow={pid:string;companyCode:string;farm:string;areaPlantedHa:number}
type PaddockActivityCell={activity:string;area:number;dates:string[];manual:number}
type PaddockActivityMatrixRow={pid:string;companyCode:string;farm:string;paddockAreaHa:number;cells:PaddockActivityCell[]}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function num(value:unknown){const n=Number(value||0);return Number.isFinite(n)?n:0}
function monthlyFromData(data:Record<string,unknown>):MonthlyRow{return{planLineId:text(data.planLineId||data.planCode),monthKey:text(data.monthKey||data.month),week:text(data.week),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid).toUpperCase(),activity:text(data.activity||data.description),description:text(data.description),targetAreaHa:num(data.targetAreaHa),manualActualAreaHa:num(data.manualActualAreaHa),variety:text(data.variety||data.masterVariety),stage:text(data.stage),cancelled:data.cancelled===true,sourceStatus:text(data.sourceStatus)}}
function dailyFromData(data:Record<string,unknown>,id:string):DailyRow{return{dailyPlanId:text(data.dailyPlanId||id),date:text(data.date),monthKey:text(data.monthKey),shift:text(data.shift),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid).toUpperCase(),activity:text(data.activity||data.description),areaHa:num(data.areaHa),sourceType:text(data.sourceType).toUpperCase(),monthlyPlanLineId:text(data.monthlyPlanLineId),foreman:text(data.foreman)}}
function actualFromData(data:Record<string,unknown>,id:string):ActualRow{return{actualReportId:text(data.actualReportId||id),date:text(data.date),monthKey:text(data.monthKey),shift:text(data.shift),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid).toUpperCase(),activity:text(data.activity||data.description),actualAreaHa:num(data.actualAreaHa),dailyPlanId:text(data.dailyPlanId),monthlyPlanLineId:text(data.monthlyPlanLineId),foreman:text(data.foreman)}}
function fmtHa(value:number,digits=2){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)+' Ha'}
function fmtPct(value:number){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:0,maximumFractionDigits:1}).format(value)+'%'}
function cancelled(row:MonthlyRow){return row.cancelled||row.sourceStatus.toUpperCase().includes('CANCEL')}
function shortDate(value:string){if(!value)return'-';const d=new Date(value+'T00:00:00');return Number.isNaN(d.getTime())?value:d.toLocaleDateString('id-ID',{day:'2-digit',month:'short'})}
function monthDays(monthKey:string){if(!/^\d{4}-\d{2}$/.test(monthKey))return[];const[y,m]=monthKey.split('-').map(Number),last=new Date(y,m,0).getDate();return Array.from({length:last},(_,i)=>monthKey+'-'+String(i+1).padStart(2,'0'))}
function masterPaddockFromData(data:Record<string,unknown>):MasterPaddockRow{return{pid:text(data.pid).toUpperCase(),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),areaPlantedHa:num(data.areaPlantedHa)}}
function dayLabel(value:string){return String(Number(value.slice(-2)))}

function CumulativeChart({monthKey,daily,actual,target}:{monthKey:string;daily:DailyRow[];actual:ActualRow[];target:number}){
  const data=useMemo(()=>{const dMap=new Map<string,number>(),aMap=new Map<string,number>();daily.forEach(row=>dMap.set(row.date,(dMap.get(row.date)||0)+row.areaHa));actual.forEach(row=>aMap.set(row.date,(aMap.get(row.date)||0)+row.actualAreaHa));let d=0,a=0;return monthDays(monthKey).map(date=>{d+=dMap.get(date)||0;a+=aMap.get(date)||0;return{date,daily:d,actual:a}})},[monthKey,daily,actual])
  if(!data.length)return <div className="summary-chart-empty">Pilih bulan untuk menampilkan grafik kumulatif.</div>
  const width=960,height=300,padX=52,padTop=24,padBottom=42,plotW=width-padX-18,plotH=height-padTop-padBottom,max=Math.max(target,...data.map(x=>Math.max(x.daily,x.actual)),1)
  const x=(i:number)=>padX+(data.length===1?0:i/(data.length-1))*plotW
  const y=(v:number)=>padTop+plotH-(v/max)*plotH
  const points=(key:'daily'|'actual')=>data.map((row,i)=>x(i)+','+y(row[key])).join(' ')
  const targetY=y(target),mid=Math.floor((data.length-1)/2),ticks=[0,max/2,max]
  return <div className="summary-chart-wrap">
    <svg className="summary-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafik kumulatif Daily Plan dan Actual terhadap target Monthly">
      {ticks.map((v,i)=><g key={i}><line x1={padX} y1={y(v)} x2={width-18} y2={y(v)} className="summary-grid-line"/><text x={padX-8} y={y(v)+4} textAnchor="end" className="summary-axis-text">{new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(v)}</text></g>)}
      <line x1={padX} y1={targetY} x2={width-18} y2={targetY} className="summary-target-line"/>
      <polyline points={points('daily')} className="summary-daily-line"/>
      <polyline points={points('actual')} className="summary-actual-line"/>
      {[0,mid,data.length-1].filter((v,i,a)=>a.indexOf(v)===i).map(i=><text key={i} x={x(i)} y={height-14} textAnchor={i===0?'start':i===data.length-1?'end':'middle'} className="summary-axis-text">{shortDate(data[i].date)}</text>)}
    </svg>
    <div className="summary-chart-legend"><span className="target">Target Monthly</span><span className="daily">Daily Plan kumulatif</span><span className="actual">Actual kumulatif</span></div>
  </div>
}

export default function PlanSummaryDashboard(){
  const now=new Date(),defaultMonth=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')
  const[month,setMonth]=useState(defaultMonth),[monthly,setMonthly]=useState<MonthlyRow[]>([]),[daily,setDaily]=useState<DailyRow[]>([]),[actual,setActual]=useState<ActualRow[]>([]),[masterPaddocks,setMasterPaddocks]=useState<MasterPaddockRow[]>([])
  const[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const[company,setCompany]=useState('ALL'),[farm,setFarm]=useState('ALL'),[activity,setActivity]=useState('ALL'),[paddockQuery,setPaddockQuery]=useState('')
  const[matrixShift,setMatrixShift]=useState('ALL'),[matrixForeman,setMatrixForeman]=useState('ALL')
  const deferredPaddock=useDeferredValue(paddockQuery)

  async function load(){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    setBusy(true);setMessage('Memuat Summary '+month+'…')
    try{
      const[m,d,a,p]=await Promise.all([
        getDocs(fsQuery(collection(firestoreDb,'monthly_plans'),where('monthKey','==',month))),
        getDocs(fsQuery(collection(firestoreDb,'daily_plans'),where('monthKey','==',month))),
        getDocs(fsQuery(collection(firestoreDb,'daily_reports'),where('monthKey','==',month))),
        getDocs(collection(firestoreDb,'master_paddocks')),
      ])
      setMonthly(m.docs.map(x=>monthlyFromData(x.data() as Record<string,unknown>)))
      setDaily(d.docs.map(x=>dailyFromData(x.data() as Record<string,unknown>,x.id)))
      setActual(a.docs.map(x=>actualFromData(x.data() as Record<string,unknown>,x.id)))
      setMasterPaddocks(p.docs.map(x=>masterPaddockFromData(x.data() as Record<string,unknown>)).filter(x=>x.pid))
      setMessage('Summary '+month+' siap. Gunakan filter Company, Farm, Activity, PID/Paddock, Shift, atau Mandor.')
    }catch(error){setMessage(error instanceof Error?error.message:'Summary Plan gagal dimuat.')}finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[month])

  const companies=useMemo(()=>[...new Set([...monthly.map(x=>x.companyCode),...daily.map(x=>x.companyCode),...actual.map(x=>x.companyCode)].filter(Boolean))].sort(),[monthly,daily,actual])
  const farms=useMemo(()=>[...new Set([...monthly,...daily,...actual].filter(row=>company==='ALL'||row.companyCode===company).map(row=>row.farm).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[monthly,daily,actual,company])
  const activities=useMemo(()=>[...new Set([...monthly.map(x=>x.activity),...daily.map(x=>x.activity),...actual.map(x=>x.activity)].filter(Boolean))].sort(),[monthly,daily,actual])
  const q=deferredPaddock.trim().toUpperCase()

  const fm=useMemo(()=>monthly.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(activity==='ALL'||row.activity===activity)&&(!q||row.pid.includes(q))),[monthly,company,farm,activity,q])
  const fd=useMemo(()=>daily.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(activity==='ALL'||row.activity===activity)&&(!q||row.pid.includes(q))),[daily,company,farm,activity,q])
  const fa=useMemo(()=>actual.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(activity==='ALL'||row.activity===activity)&&(!q||row.pid.includes(q))),[actual,company,farm,activity,q])

  const overall=useMemo(()=>{
    const target=fm.reduce((s,x)=>s+x.targetAreaHa,0),cancelledTarget=fm.filter(cancelled).reduce((s,x)=>s+x.targetAreaHa,0),effectiveTarget=target-cancelledTarget,dailyMonthly=fd.filter(x=>x.monthlyPlanLineId).reduce((s,x)=>s+x.areaHa,0),dailyOther=fd.filter(x=>!x.monthlyPlanLineId).reduce((s,x)=>s+x.areaHa,0),linkedActual=fa.reduce((s,x)=>s+x.actualAreaHa,0),manual=fm.reduce((s,x)=>s+x.manualActualAreaHa,0),actualTotal=linkedActual+manual
    return{target,cancelledTarget,effectiveTarget,dailyMonthly,dailyOther,linkedActual,manual,actualTotal,dailyPct:effectiveTarget>0?dailyMonthly/effectiveTarget*100:0,actualPct:effectiveTarget>0?actualTotal/effectiveTarget*100:0}
  },[fm,fd,fa])

  const activitySummary=useMemo<ActivitySummary[]>(()=>{
    const map=new Map<string,ActivitySummary>()
    const get=(name:string)=>{const key=name||'-',current=map.get(key)||{activity:key,target:0,daily:0,actual:0};map.set(key,current);return current}
    fm.forEach(row=>{const x=get(row.activity);if(!cancelled(row))x.target+=row.targetAreaHa;x.actual+=row.manualActualAreaHa})
    fd.filter(row=>row.monthlyPlanLineId).forEach(row=>get(row.activity).daily+=row.areaHa)
    fa.forEach(row=>get(row.activity).actual+=row.actualAreaHa)
    return[...map.values()].sort((a,b)=>b.target-a.target||b.actual-a.actual||a.activity.localeCompare(b.activity)).slice(0,20)
  },[fm,fd,fa])

  const paddockSummaries=useMemo<PaddockSummary[]>(()=>{
    const pids=[...new Set([...fm.map(x=>x.pid),...fd.map(x=>x.pid),...fa.map(x=>x.pid)].filter(Boolean))]
    return pids.map(pid=>{
      const mm=fm.filter(x=>x.pid===pid),dd=fd.filter(x=>x.pid===pid),aa=fa.filter(x=>x.pid===pid),target=mm.reduce((s,x)=>s+x.targetAreaHa,0),cancelledTarget=mm.filter(cancelled).reduce((s,x)=>s+x.targetAreaHa,0),manual=mm.reduce((s,x)=>s+x.manualActualAreaHa,0),actualLinked=aa.reduce((s,x)=>s+x.actualAreaHa,0),actualTotal=actualLinked+manual,effectiveTarget=target-cancelledTarget,lastActual=aa.map(x=>x.date).sort().at(-1)||''
      const meta=mm[0]||dd[0]||aa[0]
      return{pid,companyCode:meta?.companyCode||'',farm:meta?.farm||'',variety:mm.map(x=>x.variety).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', '),stage:mm.map(x=>x.stage).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', '),target:effectiveTarget,cancelledTarget,daily:dd.filter(x=>x.monthlyPlanLineId).reduce((s,x)=>s+x.areaHa,0),actualLinked,manual,actual:actualTotal,balance:effectiveTarget-actualTotal,lastActual}
    }).sort((a,b)=>b.actual-a.actual||a.pid.localeCompare(b.pid,undefined,{numeric:true}))
  },[fm,fd,fa])

  const timeline=useMemo<TimelineRow[]>(()=>{
    const map=new Map<string,TimelineRow>()
    const get=(date:string,pid:string,activityName:string)=>{const key=[date,pid,activityName].join('|'),current=map.get(key)||{key,date,pid,activity:activityName||'-',daily:0,actual:0,foremen:[],dailyIds:0,actualIds:0};map.set(key,current);return current}
    fd.forEach(row=>{const x=get(row.date,row.pid,row.activity);x.daily+=row.areaHa;x.dailyIds++;if(row.foreman&&!x.foremen.includes(row.foreman))x.foremen.push(row.foreman)})
    fa.forEach(row=>{const x=get(row.date,row.pid,row.activity);x.actual+=row.actualAreaHa;x.actualIds++;if(row.foreman&&!x.foremen.includes(row.foreman))x.foremen.push(row.foreman)})
    return[...map.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.pid.localeCompare(b.pid,undefined,{numeric:true})||a.activity.localeCompare(b.activity))
  },[fd,fa])

  const maxActivity=Math.max(...activitySummary.map(x=>Math.max(x.target,x.daily,x.actual)),1)
  const pidOptions=useMemo(()=>[...new Set([...monthly.map(x=>x.pid),...daily.map(x=>x.pid),...actual.map(x=>x.pid)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[monthly,daily,actual])

  const matrixMonthly=useMemo(()=>monthly.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(!q||row.pid.includes(q))),[monthly,company,farm,q])
  const matrixDailyBase=useMemo(()=>daily.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(!q||row.pid.includes(q))),[daily,company,farm,q])
  const matrixActualBase=useMemo(()=>actual.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(!q||row.pid.includes(q))),[actual,company,farm,q])
  const matrixActivities=useMemo(()=>[...new Set([...matrixMonthly.map(x=>x.activity),...matrixDailyBase.map(x=>x.activity),...matrixActualBase.map(x=>x.activity)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[matrixMonthly,matrixDailyBase,matrixActualBase])
  const masterByPid=useMemo(()=>new Map(masterPaddocks.map(row=>[row.pid,row])),[masterPaddocks])
  const paddockActivityMatrix=useMemo<PaddockActivityMatrixRow[]>(()=>{
    const pids=[...new Set([...matrixMonthly.map(x=>x.pid),...matrixDailyBase.map(x=>x.pid),...matrixActualBase.map(x=>x.pid)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
    return pids.map(pid=>{
      const mm=matrixMonthly.filter(x=>x.pid===pid),aa=matrixActualBase.filter(x=>x.pid===pid),meta=masterByPid.get(pid),fallbackArea=Math.max(0,...mm.map(x=>x.targetAreaHa))
      const cells=matrixActivities.map(activityName=>{
        const actualRows=aa.filter(x=>x.activity===activityName),manual=mm.filter(x=>x.activity===activityName).reduce((sum,x)=>sum+x.manualActualAreaHa,0),area=actualRows.reduce((sum,x)=>sum+x.actualAreaHa,0)+manual,dates=[...new Set(actualRows.map(x=>x.date).filter(Boolean))].sort()
        return{activity:activityName,area,dates,manual}
      })
      const source=meta||mm[0]||matrixDailyBase.find(x=>x.pid===pid)||aa[0]
      return{pid,companyCode:source?.companyCode||'',farm:source?.farm||'',paddockAreaHa:meta?.areaPlantedHa||fallbackArea,cells}
    })
  },[matrixMonthly,matrixDailyBase,matrixActualBase,matrixActivities,masterByPid])

  const matrixShiftOptions=useMemo(()=>[...new Set([...daily.map(x=>x.shift),...actual.map(x=>x.shift)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[daily,actual])
  const matrixForemanOptions=useMemo(()=>[...new Set([...daily.map(x=>x.foreman),...actual.map(x=>x.foreman)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[daily,actual])
  const dayMatrixDaily=useMemo(()=>daily.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(matrixShift==='ALL'||row.shift===matrixShift)&&(matrixForeman==='ALL'||row.foreman===matrixForeman)),[daily,company,farm,matrixShift,matrixForeman])
  const dayMatrixActual=useMemo(()=>actual.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(matrixShift==='ALL'||row.shift===matrixShift)&&(matrixForeman==='ALL'||row.foreman===matrixForeman)),[actual,company,farm,matrixShift,matrixForeman])
  const dayMatrixActivities=useMemo(()=>[...new Set([...monthly.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)).map(x=>x.activity),...dayMatrixDaily.map(x=>x.activity),...dayMatrixActual.map(x=>x.activity)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[monthly,company,farm,dayMatrixDaily,dayMatrixActual])
  const dayMatrixDays=useMemo(()=>monthDays(month),[month])
  const dayMatrixRows=useMemo(()=>dayMatrixActivities.map(activityName=>({
    activity:activityName,
    days:dayMatrixDays.map(date=>{
      const plan=dayMatrixDaily.filter(x=>x.activity===activityName&&x.date===date).reduce((sum,x)=>sum+x.areaHa,0)
      const report=dayMatrixActual.filter(x=>x.activity===activityName&&x.date===date).reduce((sum,x)=>sum+x.actualAreaHa,0)
      return{date,plan,report}
    })
  })),[dayMatrixActivities,dayMatrixDays,dayMatrixDaily,dayMatrixActual])

  return <section className="plan-summary-dashboard">
    <div className="section-head"><div><div className="eyebrow">SUMMARY PLAN</div><h2>Dashboard Planning & Pencapaian</h2><p className="muted">Ringkasan Monthly Target → Daily Plan → Actual, plus tracking riwayat pekerjaan per paddock.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memuat…':'Refresh Summary'}</button></div>
    {message&&<div className="alert">{message}</div>}

    <section className="panel summary-filter-panel">
      <div className="summary-filter-grid">
        <label><span>Bulan</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
        <label><span>Company</span><select value={company} onChange={e=>{setCompany(e.target.value);setFarm('ALL')}}><option value="ALL">Semua Company</option>{companies.map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span>Farm</span><select value={farm} onChange={e=>setFarm(e.target.value)}><option value="ALL">Semua Farm</option>{farms.map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span>Activity</span><select value={activity} onChange={e=>setActivity(e.target.value)}><option value="ALL">Semua Activity</option>{activities.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="summary-paddock-search"><span>Tracking Paddock / PID</span><input list="summary-paddock-options" value={paddockQuery} onChange={e=>setPaddockQuery(e.target.value.toUpperCase())} placeholder="Contoh: A-007 / JAGF-1-A-007"/><datalist id="summary-paddock-options">{pidOptions.map(pid=><option key={pid} value={pid}/>)}</datalist><small>{paddockQuery!==deferredPaddock?'Memfilter…':q?paddockSummaries.length+' paddock cocok':'Kosongkan untuk melihat semua paddock'}</small></label>
      </div>
    </section>

    <div className="cards summary-kpi-grid">
      <div className="card"><span>MONTHLY TARGET</span><strong>{fmtHa(overall.target)}</strong><small>{overall.cancelledTarget>0?'Cancelled '+fmtHa(overall.cancelledTarget):'Target seluruh plan'}</small></div>
      <div className="card"><span>TARGET EFEKTIF</span><strong>{fmtHa(overall.effectiveTarget)}</strong><small>Target − cancelled</small></div>
      <div className="card"><span>DAILY PLAN</span><strong>{fmtHa(overall.dailyMonthly)}</strong><small>{fmtPct(overall.dailyPct)} target efektif</small></div>
      <div className="card"><span>ACTUAL</span><strong>{fmtHa(overall.actualTotal)}</strong><small>{fmtPct(overall.actualPct)} · manual {fmtHa(overall.manual)}</small></div>
      <div className="card"><span>BALANCE</span><strong>{fmtHa(overall.effectiveTarget-overall.actualTotal)}</strong><small>Sisa target efektif</small></div>
      <div className="card"><span>ADHOC / SUPPORT DAILY</span><strong>{fmtHa(overall.dailyOther)}</strong><small>Di luar target Monthly</small></div>
    </div>

    <div className="summary-dashboard-grid">
      <section className="panel summary-chart-panel"><div className="section-head"><div><h3>Grafik Pencapaian Kumulatif</h3><p className="muted">Daily Plan dan Actual per tanggal dibandingkan target efektif Monthly.</p></div></div><CumulativeChart monthKey={month} daily={fd.filter(x=>x.monthlyPlanLineId)} actual={fa} target={overall.effectiveTarget}/></section>
      <section className="panel summary-progress-panel"><div className="section-head"><div><h3>Pencapaian per Activity</h3><p className="muted">Maksimal 20 activity berdasarkan target.</p></div></div><div className="summary-activity-bars">{activitySummary.map(row=><div className="summary-activity-row" key={row.activity}><div className="summary-activity-label"><strong>{row.activity}</strong><span>T {fmtHa(row.target)} · D {fmtHa(row.daily)} · A {fmtHa(row.actual)}</span></div><div className="summary-bar-track"><span className="target" style={{width:(row.target/maxActivity*100)+'%'}}/><span className="daily" style={{width:(row.daily/maxActivity*100)+'%'}}/><span className="actual" style={{width:(row.actual/maxActivity*100)+'%'}}/></div></div>)}</div>{!activitySummary.length&&<div className="daily-draft-empty">Belum ada activity pada filter ini.</div>}</section>
    </div>

    <section className="panel summary-matrix-panel">
      <div className="section-head"><div><div className="eyebrow">PADDOCK × ACTIVITY</div><h3>Summary Paddock per Kegiatan</h3><p className="muted">Format mengikuti tabel Anda: setiap activity menjadi pasangan kolom <strong>Luas</strong> dan <strong>Tanggal</strong>. Semua activity pada bulan terpilih ditampilkan.</p></div><strong>{paddockActivityMatrix.length} paddock · {matrixActivities.length} activity</strong></div>
      <div className="summary-wide-table"><table className="summary-paddock-activity-table"><thead><tr><th rowSpan={2} className="summary-sticky-col first">Paddock</th><th rowSpan={2} className="summary-sticky-col second">Luas Paddock</th>{matrixActivities.map(name=><th key={name} colSpan={2} className="summary-activity-head">{name}</th>)}</tr><tr>{matrixActivities.map(name=><><th key={name+'-area'}>Luas</th><th key={name+'-date'}>Tanggal</th></>)}</tr></thead><tbody>{paddockActivityMatrix.map(row=><tr key={row.pid}><td className="summary-sticky-col first"><strong>{row.pid}</strong><br/><span className="muted">{row.farm||'-'}</span></td><td className="summary-sticky-col second"><strong>{row.paddockAreaHa?fmtHa(row.paddockAreaHa):'-'}</strong></td>{row.cells.map(cell=><><td key={row.pid+'|'+cell.activity+'|area'} className={cell.area>0?'summary-worked-cell':''}>{cell.area>0?fmtHa(cell.area):'-'}{cell.manual>0&&<small className="summary-manual-tag">Manual {fmtHa(cell.manual)}</small>}</td><td key={row.pid+'|'+cell.activity+'|date'}>{cell.dates.length?cell.dates.map(shortDate).join(', '):cell.manual>0?'Manual':'-'}</td></>)}</tr>)}</tbody></table></div>
      {!paddockActivityMatrix.length&&<div className="daily-draft-empty">Tidak ada paddock sesuai filter.</div>}
    </section>

    <section className="panel summary-day-matrix-panel">
      <div className="section-head"><div><div className="eyebrow">PLAN VS REPORT HARIAN</div><h3>Summary Activity per Tanggal</h3><p className="muted">Format mengikuti tabel Plan / Report. Bulan mengikuti filter Summary; tampilan dapat difilter lagi berdasarkan <strong>Shift</strong> dan <strong>Mandor</strong>.</p></div><strong>{dayMatrixActivities.length} activity</strong></div>
      <div className="summary-day-matrix-filters"><label><span>Shift</span><select value={matrixShift} onChange={e=>setMatrixShift(e.target.value)}><option value="ALL">Semua Shift</option>{matrixShiftOptions.map(x=><option key={x} value={x}>Shift {x}</option>)}</select></label><label><span>Mandor</span><select value={matrixForeman} onChange={e=>setMatrixForeman(e.target.value)}><option value="ALL">Semua Mandor</option>{matrixForemanOptions.map(x=><option key={x} value={x}>{x}</option>)}</select></label><button type="button" onClick={()=>{setMatrixShift('ALL');setMatrixForeman('ALL')}}>Reset Filter</button><div className="summary-matrix-scope"><span>Bulan</span><strong>{month}</strong><small>{company==='ALL'?'Semua Company':company} · {farm==='ALL'?'Semua Farm':farm}</small></div></div>
      <div className="summary-wide-table"><table className="summary-plan-report-table"><thead><tr><th rowSpan={2} className="summary-sticky-col first">Kegiatan / Activity</th>{dayMatrixDays.map(date=><th key={date} colSpan={2}>{dayLabel(date)}</th>)}</tr><tr>{dayMatrixDays.map(date=><><th key={date+'-plan'}>Plan</th><th key={date+'-report'}>Report</th></>)}</tr></thead><tbody>{dayMatrixRows.map(row=><tr key={row.activity}><td className="summary-sticky-col first"><strong>{row.activity}</strong></td>{row.days.map(cell=><><td key={row.activity+'|'+cell.date+'|plan'} className={cell.plan>0?'summary-plan-cell':''}>{cell.plan>0?new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(cell.plan):'-'}</td><td key={row.activity+'|'+cell.date+'|report'} className={cell.report<=0&&cell.plan>0?'summary-report-low':cell.report>0&&cell.plan>0&&cell.report>=cell.plan?'summary-report-good':cell.report>0?'summary-report-only':''}>{cell.report>0?new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(cell.report):cell.plan>0?'0':'-'}</td></>)}</tr>)}</tbody></table></div>
      {!dayMatrixRows.length&&<div className="daily-draft-empty">Belum ada activity pada kombinasi filter ini.</div>}
      <div className="summary-matrix-note"><span className="good">Hijau</span> Report ≥ Plan · <span className="low">Merah</span> Report &lt; Plan · Progress manual/historis tidak dimasukkan ke tanggal karena tidak memiliki tanggal kerja asli.</div>
    </section>

    <section className="panel summary-paddock-panel">
      <div className="section-head"><div><div className="eyebrow">TRACKING BY PADDOCK</div><h3>Dashboard Paddock</h3><p className="muted">Cari PID seperti <strong>A-007</strong> untuk melihat target, rencana harian, actual, tanggal pekerjaan, dan luas yang sudah dikerjakan.</p></div><strong>{paddockSummaries.length} paddock</strong></div>
      <div className="table-wrap"><table><thead><tr><th>PID / Paddock</th><th>Farm</th><th>Variety / Stage</th><th>Target Efektif</th><th>Daily Plan</th><th>Actual</th><th>Manual</th><th>Balance</th><th>Progress</th><th>Actual Terakhir</th></tr></thead><tbody>{paddockSummaries.map(row=><tr key={row.pid}><td><strong>{row.pid}</strong><br/><span className="muted">{row.companyCode}</span></td><td>{row.farm||'-'}</td><td>{row.variety||'-'}<br/><span className="muted">{row.stage||'-'}</span></td><td>{fmtHa(row.target)}</td><td>{fmtHa(row.daily)}</td><td><strong>{fmtHa(row.actual)}</strong></td><td>{fmtHa(row.manual)}</td><td style={{color:row.balance<0?'#b91c1c':undefined}}>{fmtHa(row.balance)}</td><td>{fmtPct(row.target>0?row.actual/row.target*100:0)}</td><td>{row.lastActual?shortDate(row.lastActual):'-'}</td></tr>)}</tbody></table></div>
      {!paddockSummaries.length&&<div className="daily-draft-empty">Tidak ada paddock sesuai filter.</div>}
    </section>

    <section className="panel summary-timeline-panel">
      <div className="section-head"><div><h3>Riwayat Pekerjaan Paddock</h3><p className="muted">Satu baris = satu tanggal + PID + activity. Kolom Actual menunjukkan luas yang benar-benar tercatat dikerjakan.</p></div><strong>{timeline.length} baris</strong></div>
      <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>PID</th><th>Activity</th><th>Daily Plan</th><th>Actual Dikerjakan</th><th>Mandor</th><th>Record Daily / Actual</th></tr></thead><tbody>{timeline.map(row=><tr key={row.key}><td><strong>{shortDate(row.date)}</strong><br/><span className="muted">{row.date}</span></td><td>{row.pid}</td><td>{row.activity}</td><td>{fmtHa(row.daily)}</td><td><strong>{fmtHa(row.actual)}</strong></td><td>{row.foremen.join(', ')||'-'}</td><td>{row.dailyIds} / {row.actualIds}</td></tr>)}</tbody></table></div>
      {!timeline.length&&<div className="daily-draft-empty">Belum ada Daily/Actual pada filter ini.</div>}
      {overall.manual>0&&<div className="alert" style={{marginTop:12}}>Progress manual/historis sebesar <strong>{fmtHa(overall.manual)}</strong> ikut dihitung pada KPI Actual dan dashboard paddock, tetapi tidak dimasukkan ke riwayat tanggal karena progress manual tidak mempunyai tanggal pekerjaan asli.</div>}
    </section>
  </section>
}
