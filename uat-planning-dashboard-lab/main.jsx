import React,{useState,useRef,useEffect} from 'react'
import {createRoot} from 'react-dom/client'
import {dashboardOrigin,fetchPlanningDashboard} from '../src/qcUatPlanningDashboardClient.mjs'
if(location.origin!==dashboardOrigin)throw Error('DASHBOARD_ORIGIN_DENIED')
let session=null
// Test fixture only, never stores or displays a token.
globalThis.planningDashboardLab={installSession(value){session=value;dispatchEvent(new Event('fixture-session'))}}
const defaults={period:'2026-11',week:'ALL',companyCode:null,farm:null,shift:null,foreman:null}
const ha=v=>(v/100).toLocaleString('en-GB',{maximumFractionDigits:2})+' Ha'
const mass=(v,unit)=>v===null?'Unknown':(v/1000000).toLocaleString('en-GB',{maximumFractionDigits:6})+' '+unit
function Totals({data,title}){
 const s=data.spray,f=data.fertilizer
 return <section><h2>{title}</h2><div className="cards"><article><h3>Spray</h3><p>Target <strong>{ha(s.targetArea100)}</strong></p><p>Actual <strong>{ha(s.actualArea100)}</strong></p><p>Progress <strong>{s.progressPct===null?'—':s.progressPct.toFixed(1)+'%'}</strong></p><p>Remaining {ha(s.remainingArea100)} · Over {ha(s.overArea100)}</p></article><article><h3>Fertilizer</h3><p>Component application target <strong>{ha(f.applicationTargetArea100)}</strong></p><p>Component application actual <strong>{ha(f.applicationArea100)}</strong></p><p>Completed plans {f.completedPlanCount} / {f.activePlanCount}</p><small>Application Ha is not physical land area.</small></article></div>
 <table><thead><tr><th>Material</th><th>Dose / Ha</th><th>Target</th><th>Actual</th><th>Standard usage</th><th>Measured usage</th></tr></thead><tbody>{[...s.materials,...f.materials].map((m,i)=><tr key={i}><td>{m.material}</td><td>{m.dose10000/10000} {m.unit}</td><td>{ha(m.targetArea100)}</td><td>{ha(m.actualArea100)}</td><td>{mass(m.standardMaterial1000000,m.unit)}</td><td>{mass(m.actualMaterial1000000,m.unit)}</td></tr>)}</tbody></table></section>
}
function Lab(){
 const [uid,setUid]=useState(session?.uid??''),[q,setQ]=useState(defaults),[data,setData]=useState(null),[status,setStatus]=useState('IDLE'),[basis,setBasis]=useState('monthly')
 const seq=useRef(0),active=useRef(null)
 function invalidate(){seq.current++;active.current?.abort();active.current=null;setData(null);setStatus('IDLE')}
 useEffect(()=>{const changed=()=>{invalidate();setUid(session?.uid??'')};addEventListener('fixture-session',changed);changed();return()=>{removeEventListener('fixture-session',changed);active.current?.abort()}},[])
 function change(k,v){invalidate();setQ(old=>({...old,[k]:v,...(k==='companyCode'?{farm:null}:{}),...(k==='period'&&v.length===4?{week:'ALL'}:{})}))}
 async function load(){
  invalidate()
  if(!session?.token){setStatus('AUTH_REQUIRED');return}
  const id=seq.current,controller=new AbortController();active.current=controller;setStatus('LOADING')
  try{const result=await fetchPlanningDashboard(q,session,controller.signal);if(id===seq.current){setData(result);setStatus('READY')}}
  catch(e){if(id===seq.current){setData(null);setStatus(e.name==='AbortError'?'IDLE':e.message==='Failed to fetch'?'DASHBOARD_UNAVAILABLE':e.message)}}
  finally{if(id===seq.current)active.current=null}
 }
 return <main><h1>Planning Summary Dashboard</h1><p>UAT emulator · Read only · Synthetic data</p><p id="uid">{uid||'signed-out'}</p>
 <div className="filters"><label>Period (YYYY or YYYY-MM)<input id="period" value={q.period} onChange={e=>change('period',e.target.value)}/></label>
 <label>Week<select id="week" value={q.week} disabled={q.period.length===4} onChange={e=>change('week',e.target.value)}>{['ALL','W1','W2','W3','W4'].map(w=><option key={w}>{w}</option>)}</select></label>
 <label>Company<input id="company" value={q.companyCode??''} onChange={e=>change('companyCode',e.target.value||null)}/></label>
 <label>Farm<input id="farm" disabled={!q.companyCode} value={q.farm??''} onChange={e=>change('farm',e.target.value||null)}/></label>
 <label>Shift<select id="shift" value={q.shift??''} onChange={e=>change('shift',e.target.value||null)}><option value="">All</option><option value="1">1</option><option value="2">2</option></select></label>
 <label>Foreman ID<input id="foreman" value={q.foreman??''} onChange={e=>change('foreman',e.target.value||null)}/></label></div>
 <button id="refresh" disabled={!uid||status==='LOADING'} onClick={load}>Refresh dashboard</button><p id="status" role="status">{status}</p>
 {data&&<div id="results"><p>{data.startDate} – {data.endDate} · Out-of-period DP {data.outOfPeriodDailyCount}</p><label>Plan basis<select id="basis" value={basis} onChange={e=>setBasis(e.target.value)}><option value="monthly">Monthly assigned period</option><option value="daily">Daily execution date</option><option value="sourceDaily">Source assignment (shift / foreman)</option></select></label>
 <p>Monthly and Daily totals use organization filters only. Source assignment includes all linked carry-over.</p><Totals data={data[basis]} title={basis==='monthly'?'Monthly Plan':basis==='daily'?'Daily Plan':'Source Daily Plan'}/>
 <section><h2>Actual execution — no assigned target</h2><table id="execution"><thead><tr><th>Foreman</th><th>Shift</th><th>Kind</th><th>Actual</th></tr></thead><tbody>{data.executionByForemanShift.map(r=><tr key={r.foreman+r.shift+r.kind}><td>{r.foreman}</td><td>{r.shift}</td><td>{r.kind}</td><td>{ha(r.kind==='spray'?r.actualArea100:r.applicationArea100)}</td></tr>)}</tbody></table></section></div>}
 </main>
}
createRoot(document.getElementById('root')).render(<Lab/>)
