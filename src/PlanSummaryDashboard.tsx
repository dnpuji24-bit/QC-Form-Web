import { Fragment, useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query as fsQuery, where } from 'firebase/firestore'
import { firestoreDb } from './firebase'
import YinYangRefreshButton from './YinYangRefreshButton'
import { exportAllPlanSummary } from './planSummaryExcelExport'
import { activityMatchKey, aggregateActivityShares, calculateActivityAchievement, type ActivityAchievement } from './activityAchievement'

type JobType='ALL'|'SPRAY'|'FERTILIZER'
type ActivityBasis='ACTUAL'|'PLAN'
type MonthlyRow={planLineId:string;monthKey:string;week:string;companyCode:string;farm:string;pid:string;activity:string;description:string;type:string;activityCategory:string;targetAreaHa:number;manualActualAreaHa:number;variety:string;stage:string;cancelled:boolean;sourceStatus:string}
type DailyRow={dailyPlanId:string;date:string;monthKey:string;shift:string;companyCode:string;farm:string;pid:string;activity:string;type:string;areaHa:number;sourceType:string;monthlyPlanLineId:string;foreman:string}
type ActualRow={actualReportId:string;date:string;monthKey:string;shift:string;companyCode:string;farm:string;pid:string;activity:string;type:string;actualAreaHa:number;dailyPlanId:string;monthlyPlanLineId:string;foreman:string}
type MasterPaddockRow={pid:string;companyCode:string;farm:string;areaPlantedHa:number}
type MasterActivityRow={description:string;activity:string;type:string;active:boolean}
type ActivityPieRow={activity:string;value:number}
type PaddockActivityCell={activity:string;area:number;dates:string[];manual:number}
type PaddockActivityMatrixRow={pid:string;companyCode:string;farm:string;paddockAreaHa:number;cells:PaddockActivityCell[]}
type DayProductivity={date:string;plan:number;actual:number}

const MONTHS=[
  ['01','Januari'],['02','Februari'],['03','Maret'],['04','April'],['05','Mei'],['06','Juni'],
  ['07','Juli'],['08','Agustus'],['09','September'],['10','Oktober'],['11','November'],['12','Desember'],
] as const

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function num(value:unknown){const n=Number(value||0);return Number.isFinite(n)?n:0}
function monthlyFromData(data:Record<string,unknown>):MonthlyRow{return{planLineId:text(data.planLineId||data.planCode),monthKey:text(data.monthKey||data.month),week:text(data.week),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid).toUpperCase(),activity:text(data.activity||data.description),description:text(data.description),type:text(data.type).toUpperCase(),activityCategory:text(data.activityCategory).toUpperCase(),targetAreaHa:num(data.targetAreaHa),manualActualAreaHa:num(data.manualActualAreaHa),variety:text(data.variety||data.masterVariety),stage:text(data.stage),cancelled:data.cancelled===true,sourceStatus:text(data.sourceStatus)}}
function dailyFromData(data:Record<string,unknown>,id:string):DailyRow{return{dailyPlanId:text(data.dailyPlanId||id),date:text(data.date),monthKey:text(data.monthKey),shift:text(data.shift),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid).toUpperCase(),activity:text(data.activity||data.description),type:text(data.type).toUpperCase(),areaHa:num(data.areaHa),sourceType:text(data.sourceType).toUpperCase(),monthlyPlanLineId:text(data.monthlyPlanLineId),foreman:text(data.foreman)}}
function actualFromData(data:Record<string,unknown>,id:string):ActualRow{return{actualReportId:text(data.actualReportId||id),date:text(data.date),monthKey:text(data.monthKey),shift:text(data.shift),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid).toUpperCase(),activity:text(data.activity||data.description),type:text(data.type).toUpperCase(),actualAreaHa:num(data.actualAreaHa),dailyPlanId:text(data.dailyPlanId),monthlyPlanLineId:text(data.monthlyPlanLineId),foreman:text(data.foreman)}}
function masterPaddockFromData(id:string,data:Record<string,unknown>):MasterPaddockRow{return{pid:text(data.pid||id).toUpperCase(),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),areaPlantedHa:num(data.areaPlantedHa)}}
function masterActivityFromData(data:Record<string,unknown>):MasterActivityRow{return{description:text(data.description),activity:text(data.activity),type:text(data.type).toUpperCase(),active:data.active!==false}}
function normalizeActivity(value:unknown){return text(value).normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim().toLocaleLowerCase('id-ID')}
function resolveJobType(typeValue:string,activity:string,description:string,index:Map<string,string>):Exclude<JobType,'ALL'>|''{const direct=text(typeValue).toUpperCase();if(direct==='SPRAY'||direct==='FERTILIZER')return direct;for(const value of [description,activity]){const mapped=index.get(normalizeActivity(value));if(mapped==='SPRAY'||mapped==='FERTILIZER')return mapped}const fallback=normalizeActivity(description||activity);if(/\b(spray|insecticide|herbicide|fungicide|rodenticide|pre emergence|post emergence|knockdown)\b/.test(fallback))return'SPRAY';if(/\b(fertilizer|fertiliser|top dressing|basalt dressing|bassalt dressing|single dressing|manuring)\b/.test(fallback))return'FERTILIZER';return''}
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


const ACTIVITY_PIE_COLORS=['#2563eb','#f97316','#16a34a','#a855f7','#eab308','#06b6d4','#ef4444','#64748b','#ec4899','#84cc16','#0ea5e9','#f43f5e']

/** Transparent sector overlay keeps the original conic-gradient appearance and
 * makes individual wedges keyboard- and pointer-selectable. */
function pieSectorPath(startPct:number,endPct:number){
  const center=100,radius=100
  const coord=(pct:number)=>{
    const angle=(pct/100*360-90)*Math.PI/180
    return [center+radius*Math.cos(angle),center+radius*Math.sin(angle)]
  }
  const [sx,sy]=coord(startPct),[ex,ey]=coord(endPct)
  if(endPct-startPct>=99.999){
    return 'M 100 100 L 100 0 A 100 100 0 1 1 100 200 A 100 100 0 1 1 100 0 Z'
  }
  return 'M 100 100 L '+sx+' '+sy+' A 100 100 0 '+(endPct-startPct>50?1:0)+' 1 '+ex+' '+ey+' Z'
}
function ActivityCompositionPie({rows,basisLabel,onSelect}:{rows:ActivityPieRow[];basisLabel:string;onSelect:(activity:string)=>void}){
  const positive=rows.filter(row=>row.value>0),total=positive.reduce((sum,row)=>sum+row.value,0)
  if(!total)return <div className="summary-chart-empty">Belum ada luasan {basisLabel.toLowerCase()} pada filter ini.</div>
  let cursor=0
  const slices=positive.map((row,index)=>{const start=cursor/total*100,end=(cursor+row.value)/total*100,color=ACTIVITY_PIE_COLORS[index%ACTIVITY_PIE_COLORS.length];cursor+=row.value;return{...row,start,end,color,percent:row.value/total*100}})
  const gradient=slices.map(row=>row.color+' '+row.start+'% '+row.end+'%').join(',')
  return <div className="summary-activity-pie-layout">
    <div className="summary-activity-pie-visual">
      <div className="summary-activity-pie-circle" style={{background:'conic-gradient('+gradient+')'}}>
        <svg viewBox="0 0 200 200" className="summary-activity-pie-click-map" role="group" aria-label={'Pilih activity dari grafik '+basisLabel}>
          {slices.map(row=><path key={row.activity} d={pieSectorPath(row.start,row.end)} fill="transparent" stroke="transparent" role="button" tabIndex={0} aria-label={'Lihat pencapaian '+row.activity+' ('+fmtPct(row.percent)+')'} onClick={()=>onSelect(row.activity)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(row.activity)}}}/>)}
        </svg>
      </div>
      <div className="summary-activity-pie-total"><span>Total {basisLabel}</span><strong>{fmtHa(total)}</strong><small>{slices.length} activity</small></div>
      <small className="summary-activity-pie-hint">Klik warna grafik atau nama activity untuk melihat pencapaian.</small>
    </div>
    <div className="summary-activity-pie-legend">{slices.map(row=><button key={row.activity} type="button" className="summary-activity-pie-legend-row" onClick={()=>onSelect(row.activity)} title={'Lihat Daily Plan vs Actual untuk '+row.activity}><span className="summary-activity-pie-swatch" style={{background:row.color}}/><span className="summary-activity-pie-legend-text"><strong>{row.activity}</strong><small>{fmtHa(row.value)}</small></span><b>{fmtPct(row.percent)}</b></button>)}</div>
  </div>
}

function ActivityAchievementDetail({stats,onBack}:{stats:ActivityAchievement;onBack:()=>void}){
  const {plan,actual,percentage,remaining,over,planRecords,actualRecords,activity}=stats
  const clamped=percentage===null?0:Math.max(0,Math.min(percentage,100))
  const max=Math.max(plan,actual,1)
  return <div className="summary-achievement-detail">
    <div className="summary-achievement-heading">
      <div><span className="eyebrow">PLAN VS ACTUAL · ACTIVITY TERPILIH</span><h4>{activity}</h4><p>Perbandingan Daily Plan dan Actual pada filter Summary yang sedang aktif.</p></div>
      <button type="button" className="summary-achievement-back" onClick={onBack}>← Semua Activity</button>
    </div>
    <div className="summary-achievement-layout">
      <div className="summary-achievement-ring-block">
        <div className="summary-achievement-ring" style={{background:'conic-gradient(#16a34a '+clamped+'%, #e2e8f0 '+clamped+'% 100%)'}} role="img" aria-label={percentage===null?'Pencapaian belum dapat dihitung karena Daily Plan nol':'Pencapaian '+fmtPct(percentage)}>
          <div className="summary-achievement-ring-inner"><strong>{percentage===null?'—':fmtPct(percentage)}</strong><span>Pencapaian</span></div>
        </div>
        <p>{percentage===null?'Persentase tidak tersedia: tidak ada luas Daily Plan pada filter ini.':percentage>100?'Actual melebihi Daily Plan.':'Persentase Actual terhadap Daily Plan.'}</p>
      </div>
      <div className="summary-achievement-metrics">
        <div className="summary-achievement-bars">
          <div><div className="summary-achievement-bar-caption"><span>Daily Plan</span><strong>{fmtHa(plan)}</strong></div><div className="summary-achievement-track"><div className="summary-achievement-fill plan" style={{width:(plan/max*100)+'%'}}/></div></div>
          <div><div className="summary-achievement-bar-caption"><span>Actual</span><strong>{fmtHa(actual)}</strong></div><div className="summary-achievement-track"><div className="summary-achievement-fill actual" style={{width:(actual/max*100)+'%'}}/></div></div>
        </div>
        <div className="summary-achievement-cards">
          <div><span>Sisa terhadap Daily Plan</span><strong>{fmtHa(remaining)}</strong></div>
          <div><span>Kelebihan Actual</span><strong className={over>0?'summary-over-value':''}>{fmtHa(over)}</strong></div>
        </div>
        <small className="summary-achievement-footnote">{planRecords} record Daily Plan · {actualRecords} record Actual. Sumber: periode, Company, Farm, Shift, Mandor, dan Jenis Pekerjaan yang sama. Progress manual Monthly tanpa tanggal kerja tidak dimasukkan.</small>
      </div>
    </div>
  </div>
}

export default function PlanSummaryDashboard(){
  const now=new Date(),currentYear=now.getFullYear()
  const[selectedYear,setSelectedYear]=useState(String(currentYear)),[selectedMonth,setSelectedMonth]=useState(String(now.getMonth()+1).padStart(2,'0')),[selectedWeek,setSelectedWeek]=useState('ALL')
  const[monthly,setMonthly]=useState<MonthlyRow[]>([]),[daily,setDaily]=useState<DailyRow[]>([]),[actual,setActual]=useState<ActualRow[]>([]),[paddockHistoryMonthly,setPaddockHistoryMonthly]=useState<MonthlyRow[]>([]),[paddockHistoryActual,setPaddockHistoryActual]=useState<ActualRow[]>([]),[masterPaddocks,setMasterPaddocks]=useState<MasterPaddockRow[]>([]),[masterActivities,setMasterActivities]=useState<MasterActivityRow[]>([])
  const[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[paddockHistoryBusy,setPaddockHistoryBusy]=useState(false),[paddockHistoryError,setPaddockHistoryError]=useState('')
  const[excelBusy,setExcelBusy]=useState(false),[excelProgress,setExcelProgress]=useState(''),[excelMessage,setExcelMessage]=useState('')
  const[company,setCompany]=useState('ALL'),[farm,setFarm]=useState('ALL'),[shift,setShift]=useState('ALL'),[foreman,setForeman]=useState('ALL'),[jobType,setJobType]=useState<JobType>('ALL'),[activityBasis,setActivityBasis]=useState<ActivityBasis>('ACTUAL'),[selectedActivity,setSelectedActivity]=useState<string|null>(null),[paddockFilter,setPaddockFilter]=useState(''),[paddockPage,setPaddockPage]=useState(1),[paddockPageSize,setPaddockPageSize]=useState(50),[paddockHistoryRefreshKey,setPaddockHistoryRefreshKey]=useState(0)
  const monthKey=selectedYear+'-'+selectedMonth
  const yearOptions=useMemo(()=>Array.from({length:7},(_,i)=>String(currentYear-4+i)),[currentYear])

  async function load(){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    setBusy(true);setMessage('Memuat Summary '+monthKey+'…')
    try{
      const[m,d,a,p,activities]=await Promise.all([
        getDocs(fsQuery(collection(firestoreDb,'monthly_plans'),where('monthKey','==',monthKey))),
        getDocs(fsQuery(collection(firestoreDb,'daily_plans'),where('monthKey','==',monthKey))),
        getDocs(fsQuery(collection(firestoreDb,'daily_reports'),where('monthKey','==',monthKey))),
        getDocs(collection(firestoreDb,'master_paddocks')),
        getDocs(collection(firestoreDb,'master_activities')),
      ])
      setMonthly(m.docs.map(x=>monthlyFromData(x.data() as Record<string,unknown>)))
      setDaily(d.docs.map(x=>dailyFromData(x.data() as Record<string,unknown>,x.id)))
      setActual(a.docs.map(x=>actualFromData(x.data() as Record<string,unknown>,x.id)))
      setMasterPaddocks(p.docs.map(x=>masterPaddockFromData(x.id,x.data() as Record<string,unknown>)).filter(x=>x.pid))
      setMasterActivities(activities.docs.map(x=>masterActivityFromData(x.data() as Record<string,unknown>)))
      setMessage('Summary '+monthKey+' siap. Filter di bawah dipakai bersama untuk grafik produktivitas dan Summary Activity per Tanggal.')
    }catch(error){setMessage(error instanceof Error?error.message:'Summary Plan gagal dimuat.')}finally{setBusy(false)}
  }
  async function loadPaddockHistoryForPids(pids:string[]){
    const db=firestoreDb
    if(!db||!pids.length){setPaddockHistoryMonthly([]);setPaddockHistoryActual([]);return}
    setPaddockHistoryBusy(true);setPaddockHistoryError('')
    try{
      const chunks:Array<string[]>=[]
      for(let i=0;i<pids.length;i+=10)chunks.push(pids.slice(i,i+10))
      const[monthlySnaps,actualSnaps]=await Promise.all([
        Promise.all(chunks.map(part=>getDocs(fsQuery(collection(db,'monthly_plans'),where('pid','in',part))))),
        Promise.all(chunks.map(part=>getDocs(fsQuery(collection(db,'daily_reports'),where('pid','in',part))))),
      ])
      setPaddockHistoryMonthly(monthlySnaps.flatMap(snap=>snap.docs.map(x=>monthlyFromData(x.data() as Record<string,unknown>))))
      setPaddockHistoryActual(actualSnaps.flatMap(snap=>snap.docs.map(x=>actualFromData(x.data() as Record<string,unknown>,x.id))))
    }catch(error){setPaddockHistoryMonthly([]);setPaddockHistoryActual([]);setPaddockHistoryError(error instanceof Error?error.message:'Riwayat paddock gagal dimuat.')}
    finally{setPaddockHistoryBusy(false)}
  }
  useEffect(()=>{void load()},[monthKey])

  const companies=useMemo(()=>[...new Set([...monthly.map(x=>x.companyCode),...daily.map(x=>x.companyCode),...actual.map(x=>x.companyCode)].filter(Boolean))].sort(),[monthly,daily,actual])
  const farms=useMemo(()=>[...new Set([...monthly,...daily,...actual].filter(row=>company==='ALL'||row.companyCode===company).map(row=>row.farm).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[monthly,daily,actual,company])
  const shiftOptions=useMemo(()=>[...new Set([...daily.map(x=>x.shift),...actual.map(x=>x.shift)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[daily,actual])
  const foremanOptions=useMemo(()=>[...new Set([...daily.map(x=>x.foreman),...actual.map(x=>x.foreman)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[daily,actual])

  const activityTypeIndex=useMemo(()=>{const map=new Map<string,string>();masterActivities.forEach(row=>{if(row.type!=='SPRAY'&&row.type!=='FERTILIZER')return;for(const value of [row.description,row.activity]){const key=normalizeActivity(value);if(key&&!map.has(key))map.set(key,row.type)}});return map},[masterActivities])
  const monthlyBaseScope=useMemo(()=>monthly.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(selectedWeek==='ALL'||row.week===selectedWeek)),[monthly,company,farm,selectedWeek])
  const dailyBaseScope=useMemo(()=>daily.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(selectedWeek==='ALL'||weekFromDate(row.date)===selectedWeek)&&(shift==='ALL'||row.shift===shift)&&(foreman==='ALL'||row.foreman===foreman)),[daily,company,farm,selectedWeek,shift,foreman])
  const actualBaseScope=useMemo(()=>actual.filter(row=>(company==='ALL'||row.companyCode===company)&&(farm==='ALL'||row.farm===farm)&&(selectedWeek==='ALL'||weekFromDate(row.date)===selectedWeek)&&(shift==='ALL'||row.shift===shift)&&(foreman==='ALL'||row.foreman===foreman)),[actual,company,farm,selectedWeek,shift,foreman])
  const monthlyScope=useMemo(()=>jobType==='ALL'?monthlyBaseScope:monthlyBaseScope.filter(row=>resolveJobType(row.type,row.activity,row.description,activityTypeIndex)===jobType),[monthlyBaseScope,jobType,activityTypeIndex])
  const dailyScope=useMemo(()=>jobType==='ALL'?dailyBaseScope:dailyBaseScope.filter(row=>resolveJobType(row.type,row.activity,'',activityTypeIndex)===jobType),[dailyBaseScope,jobType,activityTypeIndex])
  const actualScope=useMemo(()=>jobType==='ALL'?actualBaseScope:actualBaseScope.filter(row=>resolveJobType(row.type,row.activity,'',activityTypeIndex)===jobType),[actualBaseScope,jobType,activityTypeIndex])

  const selectedDays=useMemo(()=>monthDays(monthKey).filter(date=>selectedWeek==='ALL'||weekFromDate(date)===selectedWeek),[monthKey,selectedWeek])
  const productivityRows=useMemo<DayProductivity[]>(()=>selectedDays.map(date=>({date,plan:dailyScope.filter(row=>row.date===date).reduce((sum,row)=>sum+row.areaHa,0),actual:actualScope.filter(row=>row.date===date).reduce((sum,row)=>sum+row.actualAreaHa,0)})),[selectedDays,dailyScope,actualScope])

  const activeMonthly=useMemo(()=>monthlyScope.filter(row=>!cancelled(row)),[monthlyScope])
  const activePlanIds=useMemo(()=>new Set(activeMonthly.map(row=>row.planLineId).filter(Boolean)),[activeMonthly])
  const monthlyTarget=useMemo(()=>activeMonthly.reduce((sum,row)=>sum+row.targetAreaHa,0),[activeMonthly])
  const manualActual=useMemo(()=>activeMonthly.reduce((sum,row)=>sum+row.manualActualAreaHa,0),[activeMonthly])
  const linkedMonthlyActual=useMemo(()=>actual.filter(row=>activePlanIds.has(row.monthlyPlanLineId)).reduce((sum,row)=>sum+row.actualAreaHa,0),[actual,activePlanIds])
  const monthlyActual=linkedMonthlyActual+manualActual
  const activityPieRows=useMemo<ActivityPieRow[]>(()=>aggregateActivityShares(activityBasis==='ACTUAL'
    ?actualScope.map(row=>({activity:row.activity||'Tanpa Activity',value:row.actualAreaHa}))
    :dailyScope.map(row=>({activity:row.activity||'Tanpa Activity',value:row.areaHa})),[activityBasis,dailyScope,actualScope])
  const selectedAchievement=useMemo(()=>selectedActivity===null?null:calculateActivityAchievement(selectedActivity,dailyScope,actualScope),[selectedActivity,dailyScope,actualScope])

  const activityNames=useMemo(()=>[...new Set([...monthlyScope.map(x=>x.activity),...dailyScope.map(x=>x.activity),...actualScope.map(x=>x.activity)].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[monthlyScope,dailyScope,actualScope])
  const dayMatrixRows=useMemo(()=>activityNames.map(activityName=>({activity:activityName,days:selectedDays.map(date=>({date,plan:dailyScope.filter(x=>x.activity===activityName&&x.date===date).reduce((sum,x)=>sum+x.areaHa,0),actual:actualScope.filter(x=>x.activity===activityName&&x.date===date).reduce((sum,x)=>sum+x.actualAreaHa,0)}))})),[activityNames,selectedDays,dailyScope,actualScope])

  const filteredMasterPaddocks=useMemo(()=>{const needle=paddockFilter.trim().toUpperCase();return needle?masterPaddocks.filter(row=>row.pid.includes(needle)):masterPaddocks},[masterPaddocks,paddockFilter])
  const paddockPageCount=Math.max(1,Math.ceil(filteredMasterPaddocks.length/paddockPageSize))
  const visibleMasterPaddocks=useMemo(()=>{const safePage=Math.min(paddockPage,paddockPageCount),start=(safePage-1)*paddockPageSize;return filteredMasterPaddocks.slice(start,start+paddockPageSize)},[filteredMasterPaddocks,paddockPage,paddockPageCount,paddockPageSize])
  const visiblePidKey=visibleMasterPaddocks.map(row=>row.pid).join('|')
  useEffect(()=>{if(paddockPage>paddockPageCount)setPaddockPage(paddockPageCount)},[paddockPage,paddockPageCount])
  useEffect(()=>{setPaddockPage(1)},[paddockFilter,paddockPageSize])
  useEffect(()=>{void loadPaddockHistoryForPids(visibleMasterPaddocks.map(row=>row.pid))},[visiblePidKey,paddockHistoryRefreshKey])

  const matrixMonthly=paddockHistoryMonthly
  const matrixActual=paddockHistoryActual
  const matrixActivities=useMemo(()=>[...new Set([
    ...masterActivities.filter(row=>row.active).map(row=>row.activity),
    ...matrixMonthly.map(row=>row.activity),
    ...matrixActual.map(row=>row.activity),
  ].filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[masterActivities,matrixMonthly,matrixActual])
  const monthlyByPid=useMemo(()=>{const map=new Map<string,MonthlyRow[]>();for(const row of matrixMonthly){const list=map.get(row.pid)||[];list.push(row);map.set(row.pid,list)}return map},[matrixMonthly])
  const actualByPid=useMemo(()=>{const map=new Map<string,ActualRow[]>();for(const row of matrixActual){const list=map.get(row.pid)||[];list.push(row);map.set(row.pid,list)}return map},[matrixActual])
  const paddockActivityMatrix=useMemo<PaddockActivityMatrixRow[]>(()=>visibleMasterPaddocks.map(meta=>{
    const pid=meta.pid,mm=monthlyByPid.get(pid)||[],aa=actualByPid.get(pid)||[],fallbackArea=Math.max(0,...mm.map(x=>x.targetAreaHa))
    const cells=matrixActivities.map(activityName=>{
      const activityKey=normalizeActivity(activityName),actualRows=aa.filter(x=>normalizeActivity(x.activity)===activityKey),manual=mm.filter(x=>normalizeActivity(x.activity)===activityKey).reduce((sum,x)=>sum+x.manualActualAreaHa,0),area=actualRows.reduce((sum,x)=>sum+x.actualAreaHa,0)+manual,dates=[...new Set(actualRows.map(x=>x.date).filter(Boolean))].sort()
      return{activity:activityName,area,dates,manual}
    })
    return{pid,companyCode:meta.companyCode||mm[0]?.companyCode||aa[0]?.companyCode||'',farm:meta.farm||mm[0]?.farm||aa[0]?.farm||'',paddockAreaHa:meta.areaPlantedHa||fallbackArea,cells}
  }),[visibleMasterPaddocks,monthlyByPid,actualByPid,matrixActivities])
  const paddockOptions=useMemo(()=>masterPaddocks.map(row=>row.pid).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[masterPaddocks])

  async function downloadAllSummary(){
    const db=firestoreDb
    if(!db||!masterPaddocks.length){setExcelMessage('Master Paddock belum tersedia. Refresh Summary terlebih dahulu.');return}
    setExcelBusy(true);setExcelMessage('');setExcelProgress('Menyiapkan seluruh histori Master Paddock…')
    try{
      const result=await exportAllPlanSummary({
        db,paddocks:masterPaddocks,masterActivityNames:masterActivities.filter(row=>row.active).map(row=>row.activity),
        period:monthKey+(selectedWeek==='ALL'?' · Semua Week':' · '+selectedWeek),
        filterLabels:[
          company==='ALL'?'Semua Company':company,
          farm==='ALL'?'Semua Farm':farm,
          shift==='ALL'?'Semua Shift':'Shift '+shift,
          foreman==='ALL'?'Semua Mandor':foreman,
          jobType==='ALL'?'Semua Jenis':jobType,
          'Komposisi '+(activityBasis==='ACTUAL'?'Actual':'Daily Plan'),
        ],
        monthlyTarget,monthlyActual,manualActual,
        productivity:productivityRows,activityDays:dayMatrixRows,activityShares:activityPieRows,
        onProgress:setExcelProgress,
      })
      setExcelMessage('Export Excel selesai: '+result.paddocks+' PID, '+result.activities+' activity dan '+result.detailRows+' baris detail. Semua histori dicakup, tanpa batas pagination atau filter paddock.')
    }catch(error){setExcelMessage('Export Excel gagal: '+(error instanceof Error?error.message:'Tidak dapat menyiapkan file. Data belum diunduh.'))}
    finally{setExcelBusy(false);setExcelProgress('')}
  }

  function resetFilters(){setSelectedWeek('ALL');setCompany('ALL');setFarm('ALL');setShift('ALL');setForeman('ALL');setJobType('ALL')}

  return <section className="plan-summary-dashboard">
    <div className="section-head summary-compact-head"><div><div className="eyebrow">SUMMARY PLAN</div><h2>Dashboard Daily Plan & Aktual</h2><p className="muted">Produktivitas harian, pencapaian Monthly Plan, dan Summary Activity per tanggal dalam satu filter.</p></div><div className="row-actions summary-export-head-actions"><button type="button" className="summary-excel-button" disabled={excelBusy||busy||!masterPaddocks.length} onClick={()=>void downloadAllSummary()}>{excelBusy?'Menyiapkan Excel…':'Export Excel Semua Data'}</button><YinYangRefreshButton busy={busy||paddockHistoryBusy} label="Refresh Summary" onClick={()=>{void load();setPaddockHistoryRefreshKey(key=>key+1)}}/></div></div>
    {message&&<div className="alert summary-compact-alert">{message}</div>}
    {excelProgress&&<div className="alert summary-excel-progress" role="status">{excelProgress}</div>}
    {excelMessage&&<div className="alert summary-excel-progress" role="status">{excelMessage}</div>}

    <section className="panel summary-filter-panel premium-filter-panel">
      <div className="premium-filter-head">
        <div>
          <span className="premium-filter-kicker">FILTER DASHBOARD</span>
          <strong>Atur tampilan data</strong>
          <small>Periode, area kerja, shift, mandor, dan jenis pekerjaan.</small>
        </div>
        <button type="button" className="premium-filter-reset" onClick={resetFilters}>Reset Filter</button>
      </div>
      <div className="summary-filter-grid summary-filter-grid-main premium-filter-grid">
        <label className="premium-filter-field"><span>Tahun</span><select value={selectedYear} onChange={e=>setSelectedYear(e.target.value)}>{yearOptions.map(year=><option key={year} value={year}>{year}</option>)}</select></label>
        <label className="premium-filter-field"><span>Bulan</span><select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}>{MONTHS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="premium-filter-field"><span>Week</span><select value={selectedWeek} onChange={e=>setSelectedWeek(e.target.value)}><option value="ALL">Semua Week</option>{['W1','W2','W3','W4'].map(week=><option key={week} value={week}>{week}</option>)}</select></label>
        <label className="premium-filter-field"><span>Company</span><select value={company} onChange={e=>{setCompany(e.target.value);setFarm('ALL')}}><option value="ALL">Semua Company</option>{companies.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label className="premium-filter-field"><span>Farm</span><select value={farm} onChange={e=>setFarm(e.target.value)}><option value="ALL">Semua Farm</option>{farms.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label className="premium-filter-field"><span>Shift</span><select value={shift} onChange={e=>setShift(e.target.value)}><option value="ALL">Semua Shift</option>{shiftOptions.map(x=><option key={x} value={x}>Shift {x}</option>)}</select></label>
        <label className="premium-filter-field"><span>Mandor</span><select value={foreman} onChange={e=>setForeman(e.target.value)}><option value="ALL">Semua Mandor</option>{foremanOptions.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label className="premium-filter-field summary-job-type-filter"><span>Jenis Pekerjaan</span><select value={jobType} onChange={e=>setJobType(e.target.value as JobType)}><option value="ALL">Semua Jenis</option><option value="SPRAY">Spray</option><option value="FERTILIZER">Fertilizer</option></select></label>
      </div>
      <div className="premium-filter-chips" aria-label="Filter aktif">
        <span>{selectedYear}</span><span>{MONTHS.find(([value])=>value===selectedMonth)?.[1]||selectedMonth}</span><span>{selectedWeek==='ALL'?'Semua Week':selectedWeek}</span><span>{company==='ALL'?'Semua Company':company}</span><span>{farm==='ALL'?'Semua Farm':farm}</span><span>{shift==='ALL'?'Semua Shift':'Shift '+shift}</span><span>{foreman==='ALL'?'Semua Mandor':foreman}</span><span className="job-type-chip">{jobType==='ALL'?'Semua Jenis':jobType==='SPRAY'?'Spray':'Fertilizer'}</span>
      </div>
    </section>

    <div className="summary-dashboard-grid summary-main-charts">
      <section className="panel summary-chart-panel"><div className="section-head"><div><h3>Produktivitas Harian</h3><p className="muted">Daily Plan dibanding Aktual Plan per hari. Filter Tahun, Bulan, Week, Company, Farm, Shift, Mandor, dan Jenis Pekerjaan dipakai bersama.</p></div></div><DailyProductivityChart rows={productivityRows}/></section>
      <section className="panel summary-pie-panel"><div className="section-head"><div><h3>Progress Monthly Plan</h3><p className="muted">Target Monthly dibanding Aktual terhubung + progress manual. Progress mengikuti Tahun, Bulan, Week, Company, Farm, dan Jenis Pekerjaan.</p></div></div><MonthlyProgressDonut target={monthlyTarget} actual={monthlyActual}/></section>
    </div>

    <section className="panel summary-activity-composition-panel">
      <div className="section-head summary-activity-composition-head"><div><div className="eyebrow">KOMPOSISI ACTIVITY</div><h3>Persentase Activity per Jenis Pekerjaan</h3><p className="muted">{jobType==='ALL'?'Semua jenis pekerjaan':jobType==='SPRAY'?'Spray':'Fertilizer'} · {selectedAchievement?'pencapaian Daily Plan vs Actual untuk '+selectedAchievement.activity:'persentase berdasarkan luasan '+(activityBasis==='ACTUAL'?'Actual':'Daily Plan')+'. Klik activity untuk melihat pencapaian.'}</p></div>{!selectedAchievement&&<div className="summary-pie-basis-toggle" aria-label="Basis diagram activity"><button type="button" className={activityBasis==='ACTUAL'?'active':''} onClick={()=>setActivityBasis('ACTUAL')}>Actual</button><button type="button" className={activityBasis==='PLAN'?'active':''} onClick={()=>setActivityBasis('PLAN')}>Daily Plan</button></div>}</div>
      {selectedAchievement?<ActivityAchievementDetail stats={selectedAchievement} onBack={()=>setSelectedActivity(null)}/>:<ActivityCompositionPie rows={activityPieRows} basisLabel={activityBasis==='ACTUAL'?'Actual Ha':'Daily Plan Ha'} onSelect={setSelectedActivity}/>}
    </section>

    <section className="panel summary-day-matrix-panel">
      <div className="section-head"><div><div className="eyebrow">PLAN VS AKTUAL HARIAN</div><h3>Summary Activity per Tanggal</h3><p className="muted">Semua activity ditampilkan. Filter sama dengan grafik Produktivitas Harian.</p></div><strong>{activityNames.length} activity</strong></div>
      <div className="summary-matrix-scope summary-matrix-scope-inline"><span>Periode</span><strong>{monthKey}{selectedWeek!=='ALL'?' · '+selectedWeek:''}</strong><small>{company==='ALL'?'Semua Company':company} · {farm==='ALL'?'Semua Farm':farm} · {shift==='ALL'?'Semua Shift':'Shift '+shift} · {foreman==='ALL'?'Semua Mandor':foreman} · {jobType==='ALL'?'Semua Jenis':jobType==='SPRAY'?'Spray':'Fertilizer'}</small></div>
      <div className="summary-wide-table"><table className="summary-plan-report-table"><thead><tr><th rowSpan={2} className="summary-sticky-col first">Kegiatan / Activity</th>{selectedDays.map(date=><th key={date} colSpan={2}>{dayLabel(date)}</th>)}</tr><tr>{selectedDays.map(date=><Fragment key={date}><th>Plan</th><th>Aktual</th></Fragment>)}</tr></thead><tbody>{dayMatrixRows.map(row=><tr key={row.activity}><td className="summary-sticky-col first"><strong>{row.activity}</strong></td>{row.days.map(cell=><Fragment key={row.activity+'|'+cell.date}><td className={cell.plan>0?'summary-plan-cell':''}>{cell.plan>0?fmtNumber(cell.plan):'-'}</td><td className={cell.actual<=0&&cell.plan>0?'summary-actual-low':cell.actual>0&&cell.plan>0&&cell.actual>=cell.plan?'summary-actual-good':cell.actual>0?'summary-actual-only':''}>{cell.actual>0?fmtNumber(cell.actual):cell.plan>0?'0':'-'}</td></Fragment>)}</tr>)}</tbody></table></div>
      {!dayMatrixRows.length&&<div className="daily-draft-empty">Belum ada activity pada kombinasi filter ini.</div>}
      <div className="summary-matrix-note"><span className="good">Hijau</span> Aktual ≥ Plan · <span className="low">Merah</span> Aktual &lt; Plan · Progress manual/historis tidak dimasukkan ke tanggal karena tidak memiliki tanggal kerja asli.</div>
    </section>

    <section className="panel summary-matrix-panel">
      <div className="section-head"><div><div className="eyebrow">PADDOCK × ACTIVITY · SELURUH HISTORI</div><h3>Summary Paddock per Kegiatan</h3><p className="muted">Semua Master Paddock tetap tersedia, tetapi riwayat Actual dimuat per halaman agar dashboard tidak berat atau crash.</p></div><div className="summary-export-section-actions"><strong>{filteredMasterPaddocks.length} / {masterPaddocks.length} paddock · {matrixActivities.length} activity</strong><button type="button" className="summary-excel-button" disabled={excelBusy||busy||!masterPaddocks.length} onClick={()=>void downloadAllSummary()}>{excelBusy?'Memproses…':'Export Semua PID'}</button></div></div>
      <div className="summary-matrix-scope summary-paddock-all-history-scope"><span>Cakupan</span><strong>Seluruh data / semua periode</strong><small>Filter dashboard di atas tidak memengaruhi tabel ini. Sistem hanya mengambil histori untuk PID yang sedang terlihat.</small></div>
      <div className="summary-paddock-filter"><label><span>Filter Paddock / PID</span><input list="summary-paddock-filter-options" value={paddockFilter} onChange={e=>setPaddockFilter(e.target.value.toUpperCase())} placeholder="Contoh: A-007 / JAGF-1-A-007"/><datalist id="summary-paddock-filter-options">{paddockOptions.map(pid=><option key={pid} value={pid}/>)}</datalist><small>Pencarian tetap mencakup seluruh {masterPaddocks.length} Master Paddock.</small></label>{paddockFilter&&<button type="button" onClick={()=>setPaddockFilter('')}>Reset Paddock</button>}</div>
      <div className="summary-paddock-pager"><div><span>Baris per halaman</span><select value={paddockPageSize} onChange={e=>setPaddockPageSize(Number(e.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></div><strong>Halaman {Math.min(paddockPage,paddockPageCount)} / {paddockPageCount}</strong><div className="summary-paddock-pager-actions"><button type="button" disabled={paddockPage<=1||paddockHistoryBusy} onClick={()=>setPaddockPage(page=>Math.max(1,page-1))}>← Sebelumnya</button><button type="button" disabled={paddockPage>=paddockPageCount||paddockHistoryBusy} onClick={()=>setPaddockPage(page=>Math.min(paddockPageCount,page+1))}>Berikutnya →</button></div></div>
      {paddockHistoryBusy&&<div className="alert summary-paddock-loading">Memuat histori untuk {visibleMasterPaddocks.length} paddock pada halaman ini…</div>}
      {paddockHistoryError&&<div className="alert danger">{paddockHistoryError}</div>}
      <div className="summary-wide-table summary-paddock-table-scroll"><table className="summary-paddock-activity-table"><colgroup><col className="summary-col-paddock"/><col className="summary-col-paddock-area"/>{matrixActivities.map(name=><Fragment key={name}><col className="summary-col-activity-area"/><col className="summary-col-activity-date"/></Fragment>)}</colgroup><thead><tr><th rowSpan={2} className="summary-sticky-col first">Paddock</th><th rowSpan={2} className="summary-sticky-col second">Luas Paddock</th>{matrixActivities.map(name=><th key={name} colSpan={2} className="summary-activity-head">{name}</th>)}</tr><tr>{matrixActivities.map(name=><Fragment key={name}><th>Luas</th><th>Tanggal</th></Fragment>)}</tr></thead><tbody>{paddockActivityMatrix.map(row=><tr key={row.pid}><td className="summary-sticky-col first"><strong>{row.pid}</strong><br/><span className="muted">{row.farm||'-'}</span></td><td className="summary-sticky-col second"><strong>{row.paddockAreaHa?fmtHa(row.paddockAreaHa):'-'}</strong></td>{row.cells.map(cell=><Fragment key={row.pid+'|'+cell.activity}><td className={cell.area>0?'summary-worked-cell':''}>{cell.area>0?fmtHa(cell.area):'-'}{cell.manual>0&&<small className="summary-manual-tag">Manual {fmtHa(cell.manual)}</small>}</td><td>{cell.dates.length?cell.dates.map(shortDate).join(', '):cell.manual>0?'Manual':'-'}</td></Fragment>)}</tr>)}</tbody></table></div>
      {!visibleMasterPaddocks.length&&<div className="daily-draft-empty">Tidak ada paddock yang cocok dengan filter <strong>{paddockFilter||'-'}</strong>.</div>}
    </section>
  </section>
}
