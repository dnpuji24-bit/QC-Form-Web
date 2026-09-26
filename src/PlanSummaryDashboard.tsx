import { Fragment, useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query as fsQuery, where } from 'firebase/firestore'
import { firestoreDb } from './firebase'

type MonthlyRow={planLineId:string;monthKey:string;week:string;companyCode:string;farm:string;pid:string;activity:string;description:string;targetAreaHa:number;manualActualAreaHa:number;variety:string;stage:string;cancelled:boolean;sourceStatus:string}
type DailyRow={dailyPlanId:string;date:string;monthKey:string;shift:string;companyCode:string;farm:string;pid:string;activity:string;areaHa:number;sourceType:string;monthlyPlanLineId:string;foreman:string}
type ActualRow={actualReportId:string;date:string;monthKey:string;shift:string;companyCode:string;farm:string;pid:string;activity:string;actualAreaHa:number;dailyPlanId:string;monthlyPlanLineId:string;foreman:string}
type MasterPaddockRow={pid:string;companyCode:string;farm:string;areaPlantedHa:number}
type PaddockActivityCell={activity:string;area:number;dates:string[];manual:number}
type PaddockActivityMatrixRow={pid:string;companyCode:string;farm:string;paddockAreaHa:number;cells:PaddockActivityCell[]}
type DayProductivity={date:string;plan:number;actual:number}

const MONTHS=[
  ['01','Januari'],['02','Februari'],['03','Maret'],['04','April'],['05','Mei'],['06','Juni'],
  ['07','Juli'],['08','Agustus'],['09','September'],['10','Oktober'],['11','November'],['12','Desember'],
] as const

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function num(value:unknown){const n=Number(value||0);return Number.isFinite(n)?n:0}
function monthlyFromData(data:Record<string,unknown>):MonthlyRow{return{planLineId:text(data.planLineId||data.planCode),monthKey:text(data.monthKey||data.month),week:text(data.week),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid).toUpperCase(),activity:text(data.activity||data.description),description:text(data.description),targetAreaHa:num(data.targetAreaHa),manualActualAreaHa:num(data.manualActualAreaHa),variety:text(data.variety||data.masterVariety),stage:text(data.stage),cancelled:data.cancelled===true,sourceStatus:text(data.sourceStatus)}}
function dailyFromData(data:Record<string,unknown>,id:string):DailyRow{return{dailyPlanId:text(data.dailyPlanId||id),date:text(data.date),monthKey:text(data.monthKey),shift:text(data.shift),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid).toUpperCase(),activity:text(data.activity||data.description),areaHa:num(data.areaHa),sourceType:text(data.sourceType).toUpperCase(),monthlyPlanLineId:text(data.monthlyPlanLineId),foreman:text(data.foreman)}}
function actualFromData(data:Record<string,unknown>,id:string):ActualRow{return{actualReportId:text(data.actualReportId||id),date:text(data.date),monthKey:text(data.monthKey),shift:text(data.shift),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid).toUpperCase(),activity:text(data.activity||data.description),actualAreaHa:num(data.actualAreaHa),dailyPlanId:text(data.dailyPlanId),monthlyPlanLineId:text(data.monthlyPlanLineId),foreman:text(data.foreman)}}
function masterPaddockFromData(data:Record<string,unknown>):MasterPaddockRow{return{pid:text(data.pid).toUpperCase(),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),areaPlantedHa:num(data.areaPlantedHa)}}
function fmtHa(value:number,digits=2){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)+' Ha'}
function fmtNumber(value:number,digits=2){return new Intl.NumberFormat('id-ID',{maximumFractionDigits:digits}).format(value)}
function fmtPct(value:number){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:0,maximumFractionDigits:1}).format(value)+'%'}
function cancelled(row:MonthlyRow){return row.cancelled||row.sourceStatus.toUpperCase().includes('CANCEL')}
function shortDate(value:string){if(!value)return'-';const d=new Date(value+'T00:00:00');return Number.isNaN(d.getTime())?value:d.toLocaleDateString('id-ID',{day:'2-digit',month:'short'})}
function monthDays(monthKey:string){if(!/^\d{4}-\d{2}$/.test(monthKey))return[];const[y,m]=monthKey.split('-').map(Number),last=new Date(y,m,0).getDate();return Array.from({length:last},(_,i)=>monthKey+'-'+String(i+1).padStart(2,'0'))}
function weekFromDate(value:string){const day=Number(value.slice(-2));if(day<=7)return'W1';if(day<=15)return'W2';if(day<=22)return'W3';return'W4'}
function dayLabel(value:string){return String(Number(value.slice(-2)))}

function DailyProductivityChart({rows}:{rows:DayProductivity[]}){
  if(!rows.length)return <div className="summary-chart-empty">Tidak ada tanggal pada filter ini.</div>
  const width=Math.max(920,rows.length*42+90),height=320,padX=54,padTop=20,padBottom=48,plotH=height-padTop-padBottom,max=Math.max(1,...rows.map(row=>Math.max(row.plan,row.actual)))
  const plotW=width-padX-20,step=plotW/rows.length,barW=Math.max(7,Math.min(13,step*.28))
  const y=(value:number)=>padTop+plotH-(value/max)*plotH
  const ticks=[0,max/2,max]
  return <div className="summary-productivity-scroll">
    <svg className="summary-productivity-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Produktivitas harian Daily Plan dibanding Aktual Plan">
      {ticks.map((value,index)=><g key={index}><line x1={padX} y1={y(value)} x2={width-20} y2={y(value)} className="summary-grid-line"/><text x={padX-8} y={y(value)+4} textAnchor="end" className="summary-axis-text">{fmtNumber(value,0)}</text></g>)}
      {rows.map((row,index)=>{const center=padX+step*index+step/2,planHeight=Math.max(0,padTop+plotH-y(row.plan)),actualHeight=Math.max(0,padTop+plotH-y(row.actual));return <g key={row.date}>
        <rect x={center-barW-2} y={y(row.plan)} width={barW} height={planHeight} rx="2" className="summary-productivity-plan"/>
        <rect x={center+2} y={y(row.actual)} width={barW} height={actualHeight} rx="2" className="summary-productivity-actual"/>
        <text x={center} y={height-22} textAnchor="middle" className="summary-axis-text">{dayLabel(row.date)}</text>
      </g>})}
    </svg>
    <div className="summary-chart-legend"><span className="daily">Daily Plan</span><span className="actual">Aktual Plan</span></div>
  </div>
}

function MonthlyProgressDonut({target,actual}:{target:number;actual:number}){
  const progress=target>0?actual/target*100:0,clamped=Math.max(0,Math.min(progress,100)),remaining=Math.max(target-actual,0),over=Math.max(actual-target,0)
  const radius=62,circumference=2*Math.PI*radius,dash=circumference*(clamped/100)
  return <div className="summary-donut-layout">
    <div className="summary-donut-wrap">
      <svg viewBox="0 0 170 170" className="summary-donut-chart" role="img" aria-label="Progress Monthly Plan terhadap Aktual">
        <circle cx="85" cy="85" r={radius} className="summary-donut-bg"/>
        <circle cx="85" cy="85" r={radius} className="summary-donut-progress" strokeDasharray={`${dash} ${circumference-dash}`} transform="rotate(-90 85 85)"/>
        <text x="85" y="80" textAnchor="middle" className="summary-donut-percent">{fmtPct(progress)}</text>
        <text x="85" y="101" textAnchor="middle" className="summary-donut-caption">progress</text>
      </svg>
    </div>
    <div className="summary-pie-stats">
      <div><span>Target</span><strong>{fmtHa(target)}</strong></div>
      <div><span>Aktual</span><strong>{fmtHa(actual)}</strong></div>
      <div><span>Sisa</span><strong>{fmtHa(remaining)}</strong></div>
      <div><span>Over</span><strong className={over>0?'summary-over-value':''}>{fmtHa(over)}</strong></div>
    </div>
  </div>
}

export default function PlanSummaryDashboard(){
  const now=new Date(),currentYear=now.getFullYear()
  const[selectedYear,setSelectedYear]=useState(String(currentYear)),[selectedMonth,setSelectedMonth]=useState(String(now.getMonth()+1).padStart(2,'0')),[selectedWeek,setSelectedWeek]=useState('ALL')
  const[monthly,setMonthly]=useState<MonthlyRow[]>([]),[daily,setDaily]=useState<DailyRow[]>([]),[actual,setActual]=useState<ActualRow[]>([]),[masterPaddocks,setMasterPaddocks]=useState<MasterPaddockRow[]>([])
  const[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const[company,setCompany]=useState('ALL'),[farm,setFarm]=useState('ALL'),[shift,setShift]=useState('ALL'),[foreman,setForeman]=useState('ALL'),[paddockFilter,setPaddockFilter]=useState('')
  const monthKey=selectedYear+'-'+selectedMonth
  const yearOptions=useMemo(()=>Array.from({length:7},(_,i)=>String(currentYear-4+i)),[currentYear])

  async function load(){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    setBusy(true);setMessage('Memuat Summary '+monthKey+'…')
    try{
      const[m,d,a,p]=await Promise.all([
        getDocs(fsQuery(collection(firestoreDb,'monthly_plans'),where('monthKey','==',monthKey))),
        getDocs(fsQuery(collection(firestoreDb,'daily_plans'),where('monthKey','==',monthKey))),
        getDocs(fsQuery(collection(firestoreDb,'daily_reports'),where('monthKey','==',monthKey))),
        getDocs(collection(firestoreDb,'master_paddocks')),
      ])
      setMonthly(m.docs.map(x=>monthlyFromData(x.data() as Record<string,unknown>)))
      setDaily(d.docs.map(x=>dailyFromData(x.data() as Record<string,unknown>,x.id)))
      setActual(a.docs.map(x=>actualFromData(x.data() as Record<string,unknown>,x.id)))
      setMasterPaddocks(p.docs.map(x=>masterPaddockFromData(x.data() as Record<string,unknown>)).filter(x=>x.pid))
      setMessage('Summary '+monthKey+' siap. Filter di bawah dipakai bersama untuk grafik produktivitas dan Summary Activity per Tanggal.')
    }catch(error){setMessage(error instanceof Error?error.message:'Summary Plan gagal dimuat.')}finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[monthKey])

  const companies=useMemo(()=>[...new Set([...monthly.map(x=>x.companyCode),...daily.map(x=>x.companyCode),...actual.map(x=>x.companyCode)].filter(Boolean))].sort(),[monthly,daily,actual])
  const farms=useMemo(()=>[...new Set([...monthly,...daily,...actual].filter(row=>company==='ALL'||row.companyCode===company).map(row=>row.farm).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[monthly,daily,actual,company])
  const shiftOptions=useMemo(()=>[...new Set([...daily.map(x=>x.shift),...actual.map(x=>x.shift)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[daily,actual])
  const foremanOptions=useMemo(()=>[...new Set([...daily.map(x=>x.foreman),...actual.map(x=>x.foreman)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[daily,actual])

  const monthlyScope=useMemo(()=>monthly.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(selectedWeek==='ALL'||row.week===selectedWeek)),[monthly,company,farm,selectedWeek])
  const dailyScope=useMemo(()=>daily.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(selectedWeek==='ALL'||weekFromDate(row.date)===selectedWeek)&&(shift==='ALL'||row.shift===shift)&&(foreman==='ALL'||row.foreman===foreman)),[daily,company,farm,selectedWeek,shift,foreman])
  const actualScope=useMemo(()=>actual.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(selectedWeek==='ALL'||weekFromDate(row.date)===selectedWeek)&&(shift==='ALL'||row.shift===shift)&&(foreman==='ALL'||row.foreman===foreman)),[actual,company,farm,selectedWeek,shift,foreman])

  const selectedDays=useMemo(()=>monthDays(monthKey).filter(date=>selectedWeek==='ALL'||weekFromDate(date)===selectedWeek),[monthKey,selectedWeek])
  const productivityRows=useMemo<DayProductivity[]>(()=>selectedDays.map(date=>({date,plan:dailyScope.filter(row=>row.date===date).reduce((sum,row)=>sum+row.areaHa,0),actual:actualScope.filter(row=>row.date===date).reduce((sum,row)=>sum+row.actualAreaHa,0)})),[selectedDays,dailyScope,actualScope])

  const activeMonthly=useMemo(()=>monthlyScope.filter(row=>!cancelled(row)),[monthlyScope])
  const activePlanIds=useMemo(()=>new Set(activeMonthly.map(row=>row.planLineId).filter(Boolean)),[activeMonthly])
  const monthlyTarget=useMemo(()=>activeMonthly.reduce((sum,row)=>sum+row.targetAreaHa,0),[activeMonthly])
  const manualActual=useMemo(()=>activeMonthly.reduce((sum,row)=>sum+row.manualActualAreaHa,0),[activeMonthly])
  const linkedMonthlyActual=useMemo(()=>actual.filter(row=>activePlanIds.has(row.monthlyPlanLineId)).reduce((sum,row)=>sum+row.actualAreaHa,0),[actual,activePlanIds])
  const monthlyActual=linkedMonthlyActual+manualActual

  const activityNames=useMemo(()=>[...new Set([...monthlyScope.map(x=>x.activity),...dailyScope.map(x=>x.activity),...actualScope.map(x=>x.activity)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[monthlyScope,dailyScope,actualScope])
  const dayMatrixRows=useMemo(()=>activityNames.map(activityName=>({activity:activityName,days:selectedDays.map(date=>({date,plan:dailyScope.filter(x=>x.activity===activityName&&x.date===date).reduce((sum,x)=>sum+x.areaHa,0),actual:actualScope.filter(x=>x.activity===activityName&&x.date===date).reduce((sum,x)=>sum+x.actualAreaHa,0)}))})),[activityNames,selectedDays,dailyScope,actualScope])

  const matrixMonthly=monthlyScope
  const matrixDaily=dailyScope
  const matrixActual=actualScope
  const matrixActivities=activityNames
  const masterByPid=useMemo(()=>new Map(masterPaddocks.map(row=>[row.pid,row])),[masterPaddocks])
  const paddockActivityMatrix=useMemo<PaddockActivityMatrixRow[]>(()=>{
    const pids=[...new Set([...matrixMonthly.map(x=>x.pid),...matrixDaily.map(x=>x.pid),...matrixActual.map(x=>x.pid)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
    return pids.map(pid=>{
      const mm=matrixMonthly.filter(x=>x.pid===pid),aa=matrixActual.filter(x=>x.pid===pid),meta=masterByPid.get(pid),fallbackArea=Math.max(0,...mm.map(x=>x.targetAreaHa))
      const cells=matrixActivities.map(activityName=>{
        const actualRows=aa.filter(x=>x.activity===activityName),manual=mm.filter(x=>x.activity===activityName).reduce((sum,x)=>sum+x.manualActualAreaHa,0),area=actualRows.reduce((sum,x)=>sum+x.actualAreaHa,0)+manual,dates=[...new Set(actualRows.map(x=>x.date).filter(Boolean))].sort()
        return{activity:activityName,area,dates,manual}
      })
      const source=meta||mm[0]||matrixDaily.find(x=>x.pid===pid)||aa[0]
      return{pid,companyCode:source?.companyCode||'',farm:source?.farm||'',paddockAreaHa:meta?.areaPlantedHa||fallbackArea,cells}
    })
  },[matrixMonthly,matrixDaily,matrixActual,matrixActivities,masterByPid])
  const paddockOptions=useMemo(()=>paddockActivityMatrix.map(row=>row.pid).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[paddockActivityMatrix])
  const filteredPaddockActivityMatrix=useMemo(()=>{const needle=paddockFilter.trim().toUpperCase();return needle?paddockActivityMatrix.filter(row=>row.pid.includes(needle)):paddockActivityMatrix},[paddockActivityMatrix,paddockFilter])

  function resetFilters(){setSelectedWeek('ALL');setCompany('ALL');setFarm('ALL');setShift('ALL');setForeman('ALL')}

  return <section className="plan-summary-dashboard">
    <div className="section-head"><div><div className="eyebrow">SUMMARY PLAN</div><h2>Dashboard Daily Plan & Aktual</h2><p className="muted">Produktivitas harian, pencapaian Monthly Plan, dan Summary Activity per tanggal dalam satu filter.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memuat…':'Refresh Summary'}</button></div>
    {message&&<div className="alert">{message}</div>}

    <section className="panel summary-filter-panel">
      <div className="summary-filter-grid summary-filter-grid-main">
        <label><span>Tahun</span><select value={selectedYear} onChange={e=>setSelectedYear(e.target.value)}>{yearOptions.map(year=><option key={year} value={year}>{year}</option>)}</select></label>
        <label><span>Bulan</span><select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}>{MONTHS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Week</span><select value={selectedWeek} onChange={e=>setSelectedWeek(e.target.value)}><option value="ALL">Semua Week</option>{['W1','W2','W3','W4'].map(week=><option key={week} value={week}>{week}</option>)}</select></label>
        <label><span>Company</span><select value={company} onChange={e=>{setCompany(e.target.value);setFarm('ALL')}}><option value="ALL">Semua Company</option>{companies.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label><span>Farm</span><select value={farm} onChange={e=>setFarm(e.target.value)}><option value="ALL">Semua Farm</option>{farms.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label><span>Shift</span><select value={shift} onChange={e=>setShift(e.target.value)}><option value="ALL">Semua Shift</option>{shiftOptions.map(x=><option key={x} value={x}>Shift {x}</option>)}</select></label>
        <label><span>Mandor</span><select value={foreman} onChange={e=>setForeman(e.target.value)}><option value="ALL">Semua Mandor</option>{foremanOptions.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <button type="button" onClick={resetFilters}>Reset Filter</button>
      </div>
    </section>

    <div className="summary-dashboard-grid summary-main-charts">
      <section className="panel summary-chart-panel"><div className="section-head"><div><h3>Produktivitas Harian</h3><p className="muted">Daily Plan dibanding Aktual Plan per hari. Filter Tahun, Bulan, Week, Company, Farm, Shift, dan Mandor dipakai bersama.</p></div></div><DailyProductivityChart rows={productivityRows}/></section>
      <section className="panel summary-pie-panel"><div className="section-head"><div><h3>Progress Monthly Plan</h3><p className="muted">Target Monthly dibanding Aktual terhubung + progress manual. Pie mengikuti Tahun, Bulan, Week, Company, dan Farm.</p></div></div><MonthlyProgressDonut target={monthlyTarget} actual={monthlyActual}/></section>
    </div>

    <section className="panel summary-day-matrix-panel">
      <div className="section-head"><div><div className="eyebrow">PLAN VS AKTUAL HARIAN</div><h3>Summary Activity per Tanggal</h3><p className="muted">Semua activity ditampilkan. Filter sama dengan grafik Produktivitas Harian.</p></div><strong>{activityNames.length} activity</strong></div>
      <div className="summary-matrix-scope summary-matrix-scope-inline"><span>Periode</span><strong>{monthKey}{selectedWeek!=='ALL'?' · '+selectedWeek:''}</strong><small>{company==='ALL'?'Semua Company':company} · {farm==='ALL'?'Semua Farm':farm} · {shift==='ALL'?'Semua Shift':'Shift '+shift} · {foreman==='ALL'?'Semua Mandor':foreman}</small></div>
      <div className="summary-wide-table"><table className="summary-plan-report-table"><thead><tr><th rowSpan={2} className="summary-sticky-col first">Kegiatan / Activity</th>{selectedDays.map(date=><th key={date} colSpan={2}>{dayLabel(date)}</th>)}</tr><tr>{selectedDays.map(date=><Fragment key={date}><th>Plan</th><th>Aktual</th></Fragment>)}</tr></thead><tbody>{dayMatrixRows.map(row=><tr key={row.activity}><td className="summary-sticky-col first"><strong>{row.activity}</strong></td>{row.days.map(cell=><Fragment key={row.activity+'|'+cell.date}><td className={cell.plan>0?'summary-plan-cell':''}>{cell.plan>0?fmtNumber(cell.plan):'-'}</td><td className={cell.actual<=0&&cell.plan>0?'summary-actual-low':cell.actual>0&&cell.plan>0&&cell.actual>=cell.plan?'summary-actual-good':cell.actual>0?'summary-actual-only':''}>{cell.actual>0?fmtNumber(cell.actual):cell.plan>0?'0':'-'}</td></Fragment>)}</tr>)}</tbody></table></div>
      {!dayMatrixRows.length&&<div className="daily-draft-empty">Belum ada activity pada kombinasi filter ini.</div>}
      <div className="summary-matrix-note"><span className="good">Hijau</span> Aktual ≥ Plan · <span className="low">Merah</span> Aktual &lt; Plan · Progress manual/historis tidak dimasukkan ke tanggal karena tidak memiliki tanggal kerja asli.</div>
    </section>

    <section className="panel summary-matrix-panel">
      <div className="section-head"><div><div className="eyebrow">PADDOCK × ACTIVITY</div><h3>Summary Paddock per Kegiatan</h3></div><strong>{filteredPaddockActivityMatrix.length} / {paddockActivityMatrix.length} paddock · {matrixActivities.length} activity</strong></div>
      <div className="summary-paddock-filter"><label><span>Filter Paddock / PID</span><input list="summary-paddock-filter-options" value={paddockFilter} onChange={e=>setPaddockFilter(e.target.value.toUpperCase())} placeholder="Contoh: A-007 / JAGF-1-A-007"/><datalist id="summary-paddock-filter-options">{paddockOptions.map(pid=><option key={pid} value={pid}/>)}</datalist><small>Bisa ketik kode pendek seperti A-007 atau PID lengkap.</small></label>{paddockFilter&&<button type="button" onClick={()=>setPaddockFilter('')}>Reset Paddock</button>}</div>
      <div className="summary-wide-table summary-paddock-table-scroll"><table className="summary-paddock-activity-table"><colgroup><col className="summary-col-paddock"/><col className="summary-col-paddock-area"/>{matrixActivities.map(name=><Fragment key={name}><col className="summary-col-activity-area"/><col className="summary-col-activity-date"/></Fragment>)}</colgroup><thead><tr><th rowSpan={2} className="summary-sticky-col first">Paddock</th><th rowSpan={2} className="summary-sticky-col second">Luas Paddock</th>{matrixActivities.map(name=><th key={name} colSpan={2} className="summary-activity-head">{name}</th>)}</tr><tr>{matrixActivities.map(name=><Fragment key={name}><th>Luas</th><th>Tanggal</th></Fragment>)}</tr></thead><tbody>{filteredPaddockActivityMatrix.map(row=><tr key={row.pid}><td className="summary-sticky-col first"><strong>{row.pid}</strong><br/><span className="muted">{row.farm||'-'}</span></td><td className="summary-sticky-col second"><strong>{row.paddockAreaHa?fmtHa(row.paddockAreaHa):'-'}</strong></td>{row.cells.map(cell=><Fragment key={row.pid+'|'+cell.activity}><td className={cell.area>0?'summary-worked-cell':''}>{cell.area>0?fmtHa(cell.area):'-'}{cell.manual>0&&<small className="summary-manual-tag">Manual {fmtHa(cell.manual)}</small>}</td><td>{cell.dates.length?cell.dates.map(shortDate).join(', '):cell.manual>0?'Manual':'-'}</td></Fragment>)}</tr>)}</tbody></table></div>
      {!filteredPaddockActivityMatrix.length&&<div className="daily-draft-empty">Tidak ada paddock yang cocok dengan filter <strong>{paddockFilter||'-'}</strong>.</div>}
    </section>
  </section>
}
