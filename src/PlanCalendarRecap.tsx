import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query as fsQuery, where } from 'firebase/firestore'
import { firestoreDb } from './firebase'
import { YinYangIcon } from './YinYangRefreshButton'

type ViewMode='day'|'week'|'month'
type DailyRow={dailyPlanId:string;date:string;shift:string;activity:string;pid:string;areaHa:number;foreman:string;monthlyPlanLineId:string}
type ActualRow={actualReportId:string;dailyPlanId:string;date:string;shift:string;activity:string;pid:string;actualAreaHa:number;foreman:string;monthlyPlanLineId:string}
type RecapItem={key:string;date:string;activity:string;pid:string;plan:number;actual:number;shifts:string[];foremen:string[]}

const DAY_NAMES=['Min','Sen','Sel','Rab','Kam','Jum','Sab']
const MONTH_NAMES=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function num(value:unknown){const n=Number(value||0);return Number.isFinite(n)?n:0}
function normalize(value:unknown){return text(value).normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim().toLocaleLowerCase('id-ID')}
function parseDate(value:string){const[y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d,12,0,0,0)}
function dateKey(date:Date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')}
function addDays(value:string,amount:number){const d=parseDate(value);d.setDate(d.getDate()+amount);return dateKey(d)}
function startOfWeek(value:string){const d=parseDate(value);d.setDate(d.getDate()-d.getDay());return dateKey(d)}
function endOfWeek(value:string){return addDays(startOfWeek(value),6)}
function monthStart(value:string){const d=parseDate(value);return dateKey(new Date(d.getFullYear(),d.getMonth(),1,12))}
function monthEnd(value:string){const d=parseDate(value);return dateKey(new Date(d.getFullYear(),d.getMonth()+1,0,12))}
function monthGridStart(value:string){return startOfWeek(monthStart(value))}
function monthGridDates(value:string){const start=monthGridStart(value);return Array.from({length:42},(_,i)=>addDays(start,i))}
function fmtHa(value:number){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)+' Ha'}
function fmtDayTitle(value:string){const d=parseDate(value);return d.toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
function fmtShort(value:string){const d=parseDate(value);return d.toLocaleDateString('id-ID',{day:'2-digit',month:'short'})}
function activityLabel(value:string){return text(value)||'Tanpa Kegiatan'}
function dailyFromData(data:Record<string,unknown>,id:string):DailyRow{return{dailyPlanId:text(data.dailyPlanId||id),date:text(data.date),shift:text(data.shift),activity:activityLabel(text(data.activity||data.description)),pid:text(data.pid||data.paddockRaw).toUpperCase(),areaHa:num(data.areaHa),foreman:text(data.foreman),monthlyPlanLineId:text(data.monthlyPlanLineId)}}
function actualFromData(data:Record<string,unknown>,id:string):ActualRow{return{actualReportId:text(data.actualReportId||id),dailyPlanId:text(data.dailyPlanId),date:text(data.date),shift:text(data.shift),activity:activityLabel(text(data.activity||data.description)),pid:text(data.pid).toUpperCase(),actualAreaHa:num(data.actualAreaHa),foreman:text(data.foreman),monthlyPlanLineId:text(data.monthlyPlanLineId)}}

function CalendarIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M12 14h3M17 14h1M7 18h3M12 18h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>}
function MonthChevronIcon(){return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}

export default function PlanCalendarRecap(){
  const today=dateKey(new Date())
  const[mode,setMode]=useState<ViewMode>('month'),[cursor,setCursor]=useState(today)
  const[daily,setDaily]=useState<DailyRow[]>([]),[actual,setActual]=useState<ActualRow[]>([])
  const[busy,setBusy]=useState(false),[message,setMessage]=useState('')

  const range=useMemo(()=>{
    if(mode==='day')return{start:cursor,end:cursor}
    if(mode==='week')return{start:startOfWeek(cursor),end:endOfWeek(cursor)}
    return{start:monthStart(cursor),end:monthEnd(cursor)}
  },[mode,cursor])

  async function load(){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    setBusy(true);setMessage('Memuat Calendar Rekap…')
    try{
      const[d,a]=await Promise.all([
        getDocs(fsQuery(collection(firestoreDb,'daily_plans'),where('date','>=',range.start),where('date','<=',range.end))),
        getDocs(fsQuery(collection(firestoreDb,'daily_reports'),where('date','>=',range.start),where('date','<=',range.end))),
      ])
      setDaily(d.docs.map(x=>dailyFromData(x.data() as Record<string,unknown>,x.id)).filter(x=>x.date))
      setActual(a.docs.map(x=>actualFromData(x.data() as Record<string,unknown>,x.id)).filter(x=>x.date))
      setMessage('')
    }catch(error){setMessage(error instanceof Error?error.message:'Calendar Rekap gagal dimuat.')}finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[range.start,range.end])

  const items=useMemo<RecapItem[]>(()=>{
    const dailyById=new Map(daily.map(row=>[row.dailyPlanId,row])),map=new Map<string,{date:string;activity:string;pid:string;plan:number;actual:number;shifts:Set<string>;foremen:Set<string>}>()
    const ensure=(date:string,activity:string,pid:string)=>{
      const cleanActivity=activityLabel(activity),cleanPid=text(pid).toUpperCase()||'-',key=date+'|'+normalize(cleanActivity)+'|'+cleanPid
      let row=map.get(key);if(!row){row={date,activity:cleanActivity,pid:cleanPid,plan:0,actual:0,shifts:new Set(),foremen:new Set()};map.set(key,row)}return row
    }
    daily.forEach(row=>{const item=ensure(row.date,row.activity,row.pid);item.plan+=row.areaHa;if(row.shift)item.shifts.add(row.shift);if(row.foreman)item.foremen.add(row.foreman)})
    actual.forEach(row=>{const linked=dailyById.get(row.dailyPlanId),activity=row.activity==='Tanpa Kegiatan'&&linked?linked.activity:row.activity,pid=row.pid&&row.pid!=='-'?row.pid:(linked?.pid||'-'),item=ensure(row.date,activity,pid);item.actual+=row.actualAreaHa;if(row.shift)item.shifts.add(row.shift);if(row.foreman)item.foremen.add(row.foreman)})
    return[...map.entries()].map(([key,row])=>({key,...row,shifts:[...row.shifts].sort(),foremen:[...row.foremen].sort()})).sort((a,b)=>a.date.localeCompare(b.date)||a.activity.localeCompare(b.activity,'id-ID',{sensitivity:'base'})||a.pid.localeCompare(b.pid,undefined,{numeric:true}))
  },[daily,actual])

  const itemsByDate=useMemo(()=>{const map=new Map<string,RecapItem[]>();items.forEach(item=>{const list=map.get(item.date)||[];list.push(item);map.set(item.date,list)});return map},[items])
  const selectedItems=itemsByDate.get(cursor)||[]
  const totals=useMemo(()=>items.reduce((s,x)=>({plan:s.plan+x.plan,actual:s.actual+x.actual}),{plan:0,actual:0}),[items])
  const selectedTotals=useMemo(()=>selectedItems.reduce((s,x)=>({plan:s.plan+x.plan,actual:s.actual+x.actual}),{plan:0,actual:0}),[selectedItems])

  function move(direction:number){
    const d=parseDate(cursor)
    if(mode==='day')d.setDate(d.getDate()+direction)
    else if(mode==='week')d.setDate(d.getDate()+direction*7)
    else d.setMonth(d.getMonth()+direction)
    setCursor(dateKey(d))
  }
  function openDay(date:string){setCursor(date);setMode('day')}
  function jumpToMonth(value:string){
    if(!/^\d{4}-\d{2}$/.test(value))return
    const current=parseDate(cursor),[year,month]=value.split('-').map(Number),last=new Date(year,month,0).getDate(),day=Math.min(current.getDate(),last)
    setCursor(dateKey(new Date(year,month-1,day,12)))
  }
  function periodTitle(){
    if(mode==='day')return fmtDayTitle(cursor)
    if(mode==='week')return fmtShort(startOfWeek(cursor))+' – '+fmtShort(endOfWeek(cursor))+' '+parseDate(endOfWeek(cursor)).getFullYear()
    const d=parseDate(cursor);return MONTH_NAMES[d.getMonth()]+' '+d.getFullYear()
  }
  const weekDates=useMemo(()=>Array.from({length:7},(_,i)=>addDays(startOfWeek(cursor),i)),[cursor])
  const miniDates=useMemo(()=>monthGridDates(cursor),[cursor])
  const monthDates=useMemo(()=>{const start=monthStart(cursor),count=parseDate(monthEnd(cursor)).getDate();return Array.from({length:count},(_,i)=>addDays(start,i))},[cursor])
  const monthFirstColumn=monthDates.length?parseDate(monthDates[0]).getDay()+1:1
  const cursorMonth=parseDate(cursor).getMonth()
  const cursorMonthValue=cursor.slice(0,7)
  const monthOptions=useMemo(()=>{
    const cursorYear=parseDate(cursor).getFullYear(),todayYear=parseDate(today).getFullYear(),startYear=Math.min(todayYear-5,cursorYear-1),endYear=Math.max(todayYear+5,cursorYear+1)
    const options:{value:string;label:string}[]=[]
    for(let year=startYear;year<=endYear;year++)MONTH_NAMES.forEach((name,index)=>options.push({value:year+'-'+String(index+1).padStart(2,'0'),label:name+' '+year}))
    return options
  },[cursor,today])

  return <section className="plan-calendar-recap">
    <div className="calendar-recap-topbar premium">
      <div className="calendar-recap-heading"><span className="calendar-recap-icon"><CalendarIcon/></span><div><div className="eyebrow">CALENDAR REKAP</div><h2>Plan & Actual Calendar</h2><p className="muted">Timeline operasional Plan vs Actual — klik tanggal untuk melihat detail kegiatan dan paddock.</p></div></div>
      <div className="calendar-recap-actions">
        <button type="button" className="calendar-today-btn" onClick={()=>setCursor(today)}>Hari Ini</button>
        <div className="calendar-period-nav"><button type="button" aria-label="Periode sebelumnya" onClick={()=>move(-1)}>‹</button><button type="button" aria-label="Periode berikutnya" onClick={()=>move(1)}>›</button></div>
        {mode==='month'?<label className="calendar-month-picker" title="Pilih bulan"><select value={cursorMonthValue} onChange={e=>jumpToMonth(e.target.value)} aria-label="Pilih bulan Calendar Rekap">{monthOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><MonthChevronIcon/></label>:<strong className="calendar-period-title">{periodTitle()}</strong>}
        <div className="calendar-view-switch"><button type="button" className={mode==='day'?'active':''} onClick={()=>setMode('day')}>Day</button><button type="button" className={mode==='week'?'active':''} onClick={()=>setMode('week')}>Week</button><button type="button" className={mode==='month'?'active':''} onClick={()=>setMode('month')}>Month</button></div>
        <button type="button" className="calendar-refresh-btn" disabled={busy} onClick={()=>void load()} aria-label="Refresh Calendar Rekap" title="Refresh data"><YinYangIcon spinning={busy}/><span>Refresh</span></button>
      </div>
    </div>
    {message&&<div className="alert">{message}</div>}

    <div className={'calendar-recap-layout '+(mode==='month'?'month-mode':'')}>
      {mode!=='month'&&<aside className="calendar-recap-sidebar">
        <div className="calendar-mini-title">{MONTH_NAMES[parseDate(cursor).getMonth()]} {parseDate(cursor).getFullYear()}</div>
        <div className="calendar-mini-weekdays">{DAY_NAMES.map(day=><span key={day}>{day[0]}</span>)}</div>
        <div className="calendar-mini-grid">{miniDates.map(date=>{const d=parseDate(date),outside=d.getMonth()!==cursorMonth;return <button type="button" key={date} className={(date===cursor?'selected ':'')+(date===today?'today ':'')+(outside?'outside':'')} onClick={()=>openDay(date)}>{d.getDate()}</button>})}</div>
        <div className="calendar-recap-totals"><span>Periode aktif</span><strong>Plan {fmtHa(totals.plan)}</strong><strong>Actual {fmtHa(totals.actual)}</strong><small>Selisih {fmtHa(totals.actual-totals.plan)}</small></div>
      </aside>}

      <main className="calendar-recap-main">
        {mode==='day'&&<section className="calendar-day-view">
          <div className="calendar-day-summary"><div><span>Tanggal</span><strong>{fmtDayTitle(cursor)}</strong></div><div><span>Kegiatan</span><strong>{new Set(selectedItems.map(x=>normalize(x.activity))).size}</strong></div><div><span>Plan</span><strong>{fmtHa(selectedTotals.plan)}</strong></div><div><span>Actual</span><strong>{fmtHa(selectedTotals.actual)}</strong></div><div><span>Selisih</span><strong className={selectedTotals.actual<selectedTotals.plan?'negative':'positive'}>{fmtHa(selectedTotals.actual-selectedTotals.plan)}</strong></div></div>
          <div className="calendar-day-table-wrap"><table className="calendar-day-table"><thead><tr><th>Kegiatan</th><th>Paddock</th><th>Shift</th><th>Mandor</th><th>Plan</th><th>Actual</th><th>Selisih</th></tr></thead><tbody>{selectedItems.map(item=><tr key={item.key}><td><strong>{item.activity}</strong></td><td>{item.pid}</td><td>{item.shifts.length?item.shifts.join(', '):'-'}</td><td>{item.foremen.length?item.foremen.join(', '):'-'}</td><td>{fmtHa(item.plan)}</td><td>{fmtHa(item.actual)}</td><td className={item.actual<item.plan?'calendar-value-low':'calendar-value-good'}>{fmtHa(item.actual-item.plan)}</td></tr>)}</tbody></table></div>
          {!selectedItems.length&&<div className="calendar-empty">Belum ada Daily Plan maupun Actual Plan pada tanggal ini.</div>}
        </section>}

        {mode==='week'&&<section className="calendar-week-view">
          <div className="calendar-week-head">{weekDates.map(date=><button key={date} type="button" className={date===today?'today':''} onClick={()=>openDay(date)}><span>{DAY_NAMES[parseDate(date).getDay()]}</span><strong>{parseDate(date).getDate()}</strong></button>)}</div>
          <div className="calendar-week-grid">{weekDates.map(date=>{const rows=itemsByDate.get(date)||[],plan=rows.reduce((s,x)=>s+x.plan,0),actualValue=rows.reduce((s,x)=>s+x.actual,0),groups=[...new Map(rows.map(x=>[normalize(x.activity),x.activity])).values()];return <div className="calendar-week-day" key={date} onClick={()=>openDay(date)}><div className="calendar-week-kpis"><span>P {fmtHa(plan)}</span><span>A {fmtHa(actualValue)}</span></div>{groups.slice(0,7).map(activity=>{const scoped=rows.filter(x=>normalize(x.activity)===normalize(activity)),p=scoped.reduce((s,x)=>s+x.plan,0),a=scoped.reduce((s,x)=>s+x.actual,0);return <button type="button" key={activity} className="calendar-event-card" onClick={e=>{e.stopPropagation();openDay(date)}}><strong>{activity}</strong><span>{scoped.length} paddock</span><small>Plan {fmtHa(p)} · Actual {fmtHa(a)}</small></button>})}{groups.length>7&&<small className="calendar-more">+{groups.length-7} kegiatan lainnya</small>}{!groups.length&&<span className="calendar-no-work">Tidak ada kegiatan</span>}</div>})}</div>
        </section>}

        {mode==='month'&&<section className="calendar-month-view">
          <div className="calendar-month-summary"><div className="plan"><span>Plan Bulan</span><strong>{fmtHa(totals.plan)}</strong></div><div className="actual"><span>Actual Bulan</span><strong>{fmtHa(totals.actual)}</strong></div><div className="balance"><span>Selisih</span><strong className={totals.actual<totals.plan?'negative':'positive'}>{fmtHa(totals.actual-totals.plan)}</strong></div></div>
          <div className="calendar-month-weekdays">{DAY_NAMES.map(day=><span key={day}>{day}</span>)}</div>
          <div className="calendar-month-grid">{monthDates.map((date,index)=>{const d=parseDate(date),rows=itemsByDate.get(date)||[],activityGroups=[...new Map(rows.map(x=>[normalize(x.activity),x.activity])).values()],plan=rows.reduce((s,x)=>s+x.plan,0),actualValue=rows.reduce((s,x)=>s+x.actual,0);return <button type="button" key={date} style={index===0?{gridColumnStart:monthFirstColumn}:undefined} className={'calendar-month-cell '+(date===today?'today ':'')} onClick={()=>openDay(date)}><div className="calendar-month-date"><strong>{d.getDate()}</strong>{rows.length>0&&<span>{fmtHa(plan)} / {fmtHa(actualValue)}</span>}</div><div className="calendar-month-events">{activityGroups.slice(0,4).map(activity=><span key={activity}>{activity}</span>)}{activityGroups.length>4&&<small>+{activityGroups.length-4} lainnya</small>}</div></button>})}</div>
        </section>}
      </main>
    </div>
  </section>
}
