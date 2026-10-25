import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { firestoreDb } from './firebase'

type Severity='ERROR'|'WARNING'|'INFO'
type MonthlyRow={id:string;planLineId:string;monthKey:string;week:string;companyCode:string;farm:string;pid:string;description:string;activity:string;targetAreaHa:number}
type DailyRow={id:string;dailyPlanId:string;sourceType:string;monthlyLinkStatus:string;monthlyPlanLineId:string;date:string;monthKey:string;pid:string;activity:string;areaHa:number}
type ActualRow={id:string;actualReportId:string;sourceType:string;dailyPlanId:string;dailyLinkStatus:string;monthlyPlanLineId:string;monthlyLinkStatus:string;date:string;monthKey:string;pid:string;activity:string;actualAreaHa:number}
type MonthlyFlow=MonthlyRow&{dailyAreaHa:number;actualAreaHa:number;dailyVarianceHa:number;actualVarianceHa:number;issueCount:number}
type AuditIssue={id:string;severity:Severity;code:string;entityType:'MONTHLY'|'DAILY'|'ACTUAL';entityId:string;monthKey:string;companyCode:string;farm:string;monthlyPlanLineId:string;dailyPlanId:string;pid:string;activity:string;message:string}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function num(value:unknown){const n=Number(value||0);return Number.isFinite(n)?n:0}
function formatHa(value:number,digits=2){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)+' Ha'}
function monthlyFromData(id:string,data:Record<string,unknown>):MonthlyRow{return{id,planLineId:text(data.planLineId||data.planCode||id),monthKey:text(data.monthKey||data.month),week:text(data.week),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid),description:text(data.description),activity:text(data.activity),targetAreaHa:num(data.targetAreaHa)}}
function dailyFromData(id:string,data:Record<string,unknown>):DailyRow{return{id,dailyPlanId:text(data.dailyPlanId||id),sourceType:text(data.sourceType).toUpperCase(),monthlyLinkStatus:text(data.monthlyLinkStatus).toUpperCase(),monthlyPlanLineId:text(data.monthlyPlanLineId),date:text(data.date),monthKey:text(data.monthKey),pid:text(data.pid),activity:text(data.activity),areaHa:num(data.areaHa)}}
function actualFromData(id:string,data:Record<string,unknown>):ActualRow{return{id,actualReportId:text(data.actualReportId||id),sourceType:text(data.sourceType).toUpperCase(),dailyPlanId:text(data.dailyPlanId),dailyLinkStatus:text(data.dailyLinkStatus).toUpperCase(),monthlyPlanLineId:text(data.monthlyPlanLineId),monthlyLinkStatus:text(data.monthlyLinkStatus).toUpperCase(),date:text(data.date),monthKey:text(data.monthKey),pid:text(data.pid),activity:text(data.activity),actualAreaHa:num(data.actualAreaHa)}}
function issueId(code:string,entityType:string,entityId:string){return code+'¦'+entityType+'¦'+entityId}
function severityRank(value:Severity){return value==='ERROR'?0:value==='WARNING'?1:2}

export default function PlanReconciliationPanel(){
  const[monthly,setMonthly]=useState<MonthlyRow[]>([])
  const[daily,setDaily]=useState<DailyRow[]>([])
  const[actual,setActual]=useState<ActualRow[]>([])
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const[severity,setSeverity]=useState<'ALL'|Severity>('ALL')
  const[month,setMonth]=useState('ALL')
  const[company,setCompany]=useState('ALL')
  const[code,setCode]=useState('ALL')
  const[query,setQuery]=useState('')
  const[issuePage,setIssuePage]=useState(1)
  const[flowPage,setFlowPage]=useState(1)
  const PAGE_SIZE=50
  const deferredQuery=useDeferredValue(query)

  async function load(){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    setBusy(true);setMessage('Memeriksa hubungan Monthly → Daily → Actual…')
    try{
      const[m,d,a]=await Promise.all([
        getDocs(collection(firestoreDb,'monthly_plans')),
        getDocs(collection(firestoreDb,'daily_plans')),
        getDocs(collection(firestoreDb,'daily_reports'))
      ])
      const mm=m.docs.map(x=>monthlyFromData(x.id,x.data() as Record<string,unknown>))
      const dd=d.docs.map(x=>dailyFromData(x.id,x.data() as Record<string,unknown>))
      const aa=a.docs.map(x=>actualFromData(x.id,x.data() as Record<string,unknown>))
      setMonthly(mm);setDaily(dd);setActual(aa)
      setMessage('Audit selesai. Rekonsiliasi hanya membaca data; tidak ada record yang diubah.')
    }catch(error){setMessage(error instanceof Error?error.message:'Rekonsiliasi gagal dimuat.')}finally{setBusy(false)}
  }

  useEffect(()=>{void load()},[])

  const audit=useMemo(()=>{
    const monthlyMap=new Map(monthly.map(x=>[x.planLineId,x]))
    const dailyMap=new Map(daily.map(x=>[x.dailyPlanId,x]))
    const dailyByMonthly=new Map<string,DailyRow[]>()
    const actualByMonthly=new Map<string,ActualRow[]>()
    daily.forEach(row=>{if(!row.monthlyPlanLineId)return;const list=dailyByMonthly.get(row.monthlyPlanLineId)||[];list.push(row);dailyByMonthly.set(row.monthlyPlanLineId,list)})
    actual.forEach(row=>{if(!row.monthlyPlanLineId)return;const list=actualByMonthly.get(row.monthlyPlanLineId)||[];list.push(row);actualByMonthly.set(row.monthlyPlanLineId,list)})

    const issues:AuditIssue[]=[]
    const push=(issue:Omit<AuditIssue,'id'>)=>issues.push({...issue,id:issueId(issue.code,issue.entityType,issue.entityId)})

    daily.forEach(row=>{
      const linkedMonthly=row.monthlyPlanLineId?monthlyMap.get(row.monthlyPlanLineId):undefined
      if(row.sourceType==='MONTHLY'&&!row.monthlyPlanLineId){
        push({severity:'ERROR',code:'DAILY_MONTHLY_MISSING',entityType:'DAILY',entityId:row.dailyPlanId,monthKey:row.monthKey,companyCode:'',farm:'',monthlyPlanLineId:'',dailyPlanId:row.dailyPlanId,pid:row.pid,activity:row.activity,message:'Daily Plan bertipe MONTHLY belum memiliki monthlyPlanLineId.'})
      }else if(row.monthlyPlanLineId&&!linkedMonthly){
        push({severity:'ERROR',code:'DAILY_MONTHLY_ORPHAN',entityType:'DAILY',entityId:row.dailyPlanId,monthKey:row.monthKey,companyCode:'',farm:'',monthlyPlanLineId:row.monthlyPlanLineId,dailyPlanId:row.dailyPlanId,pid:row.pid,activity:row.activity,message:'Daily Plan menunjuk Monthly Plan yang tidak ditemukan: '+row.monthlyPlanLineId+'.'})
      }else if(row.sourceType==='MONTHLY'&&row.monthlyLinkStatus&&row.monthlyLinkStatus!=='LINKED'){
        push({severity:'WARNING',code:'DAILY_LINK_STATUS',entityType:'DAILY',entityId:row.dailyPlanId,monthKey:row.monthKey,companyCode:linkedMonthly?.companyCode||'',farm:linkedMonthly?.farm||'',monthlyPlanLineId:row.monthlyPlanLineId,dailyPlanId:row.dailyPlanId,pid:row.pid,activity:row.activity,message:'Daily Plan MONTHLY memiliki status link '+row.monthlyLinkStatus+' walaupun perlu direview.'})
      }
    })

    actual.forEach(row=>{
      const linkedDaily=row.dailyPlanId?dailyMap.get(row.dailyPlanId):undefined
      const linkedMonthly=row.monthlyPlanLineId?monthlyMap.get(row.monthlyPlanLineId):undefined
      if(!row.dailyPlanId||row.dailyLinkStatus!=='LINKED'){
        push({severity:'ERROR',code:'ACTUAL_DAILY_MISSING',entityType:'ACTUAL',entityId:row.actualReportId,monthKey:row.monthKey,companyCode:linkedMonthly?.companyCode||'',farm:linkedMonthly?.farm||'',monthlyPlanLineId:row.monthlyPlanLineId,dailyPlanId:row.dailyPlanId,pid:row.pid,activity:row.activity,message:'Actual belum terhubung ke Daily Plan yang valid.'})
      }else if(!linkedDaily){
        push({severity:'ERROR',code:'ACTUAL_DAILY_ORPHAN',entityType:'ACTUAL',entityId:row.actualReportId,monthKey:row.monthKey,companyCode:linkedMonthly?.companyCode||'',farm:linkedMonthly?.farm||'',monthlyPlanLineId:row.monthlyPlanLineId,dailyPlanId:row.dailyPlanId,pid:row.pid,activity:row.activity,message:'Actual menunjuk Daily Plan yang tidak ditemukan: '+row.dailyPlanId+'.'})
      }
      if(row.monthlyPlanLineId&&!linkedMonthly){
        push({severity:'ERROR',code:'ACTUAL_MONTHLY_ORPHAN',entityType:'ACTUAL',entityId:row.actualReportId,monthKey:row.monthKey,companyCode:'',farm:'',monthlyPlanLineId:row.monthlyPlanLineId,dailyPlanId:row.dailyPlanId,pid:row.pid,activity:row.activity,message:'Actual menunjuk Monthly Plan yang tidak ditemukan: '+row.monthlyPlanLineId+'.'})
      }
      if(linkedDaily&&row.monthlyPlanLineId&&linkedDaily.monthlyPlanLineId&&row.monthlyPlanLineId!==linkedDaily.monthlyPlanLineId){
        push({severity:'ERROR',code:'ACTUAL_DAILY_MONTHLY_MISMATCH',entityType:'ACTUAL',entityId:row.actualReportId,monthKey:row.monthKey,companyCode:linkedMonthly?.companyCode||'',farm:linkedMonthly?.farm||'',monthlyPlanLineId:row.monthlyPlanLineId,dailyPlanId:row.dailyPlanId,pid:row.pid,activity:row.activity,message:'Monthly link Actual ('+row.monthlyPlanLineId+') berbeda dari Monthly link Daily ('+linkedDaily.monthlyPlanLineId+').'})
      }
    })

    const flows:MonthlyFlow[]=monthly.map(row=>{
      const dailyRows=dailyByMonthly.get(row.planLineId)||[],actualRows=actualByMonthly.get(row.planLineId)||[]
      const dailyAreaHa=dailyRows.reduce((sum,x)=>sum+x.areaHa,0),actualAreaHa=actualRows.reduce((sum,x)=>sum+x.actualAreaHa,0)
      const dailyVarianceHa=dailyAreaHa-row.targetAreaHa,actualVarianceHa=actualAreaHa-row.targetAreaHa
      if(dailyAreaHa>row.targetAreaHa+0.02){
        push({severity:'WARNING',code:'DAILY_OVER_TARGET',entityType:'MONTHLY',entityId:row.planLineId,monthKey:row.monthKey,companyCode:row.companyCode,farm:row.farm,monthlyPlanLineId:row.planLineId,dailyPlanId:'',pid:row.pid,activity:row.activity,message:'Total Daily Plan '+formatHa(dailyAreaHa)+' melebihi target Monthly '+formatHa(row.targetAreaHa)+' sebesar '+formatHa(dailyAreaHa-row.targetAreaHa)+'.'})
      }
      if(actualAreaHa>row.targetAreaHa+0.02){
        push({severity:'WARNING',code:'ACTUAL_OVER_TARGET',entityType:'MONTHLY',entityId:row.planLineId,monthKey:row.monthKey,companyCode:row.companyCode,farm:row.farm,monthlyPlanLineId:row.planLineId,dailyPlanId:'',pid:row.pid,activity:row.activity,message:'Total Actual '+formatHa(actualAreaHa)+' melebihi target Monthly '+formatHa(row.targetAreaHa)+' sebesar '+formatHa(actualAreaHa-row.targetAreaHa)+'.'})
      }
      if(actualAreaHa>0&&dailyAreaHa<=0.0001){
        push({severity:'ERROR',code:'ACTUAL_WITHOUT_DAILY',entityType:'MONTHLY',entityId:row.planLineId,monthKey:row.monthKey,companyCode:row.companyCode,farm:row.farm,monthlyPlanLineId:row.planLineId,dailyPlanId:'',pid:row.pid,activity:row.activity,message:'Monthly memiliki Actual '+formatHa(actualAreaHa)+' tetapi tidak memiliki Daily Plan linked.'})
      }else if(dailyAreaHa>0&&actualAreaHa>dailyAreaHa+0.02){
        push({severity:'WARNING',code:'ACTUAL_OVER_DAILY',entityType:'MONTHLY',entityId:row.planLineId,monthKey:row.monthKey,companyCode:row.companyCode,farm:row.farm,monthlyPlanLineId:row.planLineId,dailyPlanId:'',pid:row.pid,activity:row.activity,message:'Actual '+formatHa(actualAreaHa)+' melebihi total Daily Plan '+formatHa(dailyAreaHa)+' sebesar '+formatHa(actualAreaHa-dailyAreaHa)+'.'})
      }
      return{...row,dailyAreaHa,actualAreaHa,dailyVarianceHa,actualVarianceHa,issueCount:0}
    })

    const issueCountByMonthly=new Map<string,number>()
    issues.forEach(item=>{if(item.monthlyPlanLineId)issueCountByMonthly.set(item.monthlyPlanLineId,(issueCountByMonthly.get(item.monthlyPlanLineId)||0)+1)})
    flows.forEach(row=>{row.issueCount=issueCountByMonthly.get(row.planLineId)||0})

    issues.sort((a,b)=>severityRank(a.severity)-severityRank(b.severity)||b.monthKey.localeCompare(a.monthKey)||a.entityId.localeCompare(b.entityId,undefined,{numeric:true}))
    return{
      issues,flows,
      dailyMonthly:daily.filter(x=>x.sourceType==='MONTHLY').length,
      dailyMonthlyLinked:daily.filter(x=>x.sourceType==='MONTHLY'&&x.monthlyPlanLineId&&monthlyMap.has(x.monthlyPlanLineId)).length,
      dailyAdhocSupport:daily.filter(x=>['ADHOC','SUPPORT'].includes(x.sourceType)).length,
      actualDailyLinked:actual.filter(x=>x.dailyPlanId&&x.dailyLinkStatus==='LINKED'&&dailyMap.has(x.dailyPlanId)).length,
      actualMonthlyLinked:actual.filter(x=>x.monthlyPlanLineId&&monthlyMap.has(x.monthlyPlanLineId)).length,
    }
  },[monthly,daily,actual])

  const months=useMemo(()=>[...new Set([...monthly.map(x=>x.monthKey),...daily.map(x=>x.monthKey),...actual.map(x=>x.monthKey)].filter(Boolean))].sort().reverse(),[monthly,daily,actual])
  const companies=useMemo(()=>[...new Set(monthly.map(x=>x.companyCode).filter(Boolean))].sort(),[monthly])
  const codes=useMemo(()=>[...new Set(audit.issues.map(x=>x.code))].sort(),[audit.issues])
  const filteredIssues=useMemo(()=>{const q=deferredQuery.trim().toLowerCase();return audit.issues.filter(item=>(severity==='ALL'||item.severity===severity)&&(month==='ALL'||item.monthKey===month)&&(company==='ALL'||item.companyCode===company)&&(code==='ALL'||item.code===code)&&(!q||[item.entityId,item.monthlyPlanLineId,item.dailyPlanId,item.pid,item.activity,item.message,item.code].join(' ').toLowerCase().includes(q)))},[audit.issues,severity,month,company,code,deferredQuery])
  const filteredFlows=useMemo(()=>{const q=deferredQuery.trim().toLowerCase();return audit.flows.filter(row=>(month==='ALL'||row.monthKey===month)&&(company==='ALL'||row.companyCode===company)&&(!q||[row.planLineId,row.pid,row.activity,row.description,row.companyCode,row.farm].join(' ').toLowerCase().includes(q))).sort((a,b)=>b.issueCount-a.issueCount||b.monthKey.localeCompare(a.monthKey)||a.planLineId.localeCompare(b.planLineId,undefined,{numeric:true}))},[audit.flows,month,company,deferredQuery])
  const issuePages=Math.max(1,Math.ceil(filteredIssues.length/PAGE_SIZE)),flowPages=Math.max(1,Math.ceil(filteredFlows.length/PAGE_SIZE))
  const safeIssuePage=Math.min(issuePage,issuePages),safeFlowPage=Math.min(flowPage,flowPages)
  const pagedIssues=useMemo(()=>filteredIssues.slice((safeIssuePage-1)*PAGE_SIZE,safeIssuePage*PAGE_SIZE),[filteredIssues,safeIssuePage])
  const pagedFlows=useMemo(()=>filteredFlows.slice((safeFlowPage-1)*PAGE_SIZE,safeFlowPage*PAGE_SIZE),[filteredFlows,safeFlowPage])
  useEffect(()=>{setIssuePage(1);setFlowPage(1)},[severity,month,company,code,deferredQuery])
  const errors=audit.issues.filter(x=>x.severity==='ERROR').length,warnings=audit.issues.filter(x=>x.severity==='WARNING').length
  const healthyMonthly=audit.flows.filter(x=>x.issueCount===0).length

  return <section>
    <div className="section-head"><div><div className="eyebrow">REKONSILIASI PLAN</div><h2>Audit Monthly → Daily → Actual</h2><p className="muted">Halaman ini hanya membaca Firestore. Tidak ada data yang diubah. ADHOC dan SUPPORT tidak dianggap error hanya karena tidak mempunyai Monthly Plan.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memeriksa…':'Jalankan Audit Ulang'}</button></div>
    {message&&<div className="alert">{message}</div>}
    <div className="cards" style={{marginTop:18}}>
      <div className="card"><span>MONTHLY</span><strong>{monthly.length}</strong></div>
      <div className="card"><span>DAILY</span><strong>{daily.length}</strong></div>
      <div className="card"><span>ACTUAL</span><strong>{actual.length}</strong></div>
      <div className="card"><span>MONTHLY SEHAT</span><strong>{healthyMonthly}</strong></div>
      <div className="card"><span>ERROR LINK</span><strong style={{color:errors?'#b91c1c':undefined}}>{errors}</strong></div>
      <div className="card"><span>WARNING</span><strong>{warnings}</strong></div>
      <div className="card"><span>ADHOC / SUPPORT</span><strong>{audit.dailyAdhocSupport}</strong></div>
    </div>
    <div className="panel" style={{marginTop:18}}>
      <h3>Coverage Link</h3>
      <div className="cards" style={{marginTop:12}}>
        <div className="card"><span>DAILY MONTHLY LINKED</span><strong>{audit.dailyMonthlyLinked} / {audit.dailyMonthly}</strong></div>
        <div className="card"><span>ACTUAL → DAILY LINKED</span><strong>{audit.actualDailyLinked} / {actual.length}</strong></div>
        <div className="card"><span>ACTUAL → MONTHLY LINKED</span><strong>{audit.actualMonthlyLinked} / {actual.length}</strong></div>
      </div>
      {!errors&&!warnings&&<div className="alert" style={{marginTop:14}}><strong>Struktur link sehat.</strong> Tidak ditemukan link rusak, orphan, mismatch, atau over-target pada data saat ini.</div>}
    </div>
    <div className="panel premium-filter-panel compact-filter-panel" style={{marginTop:18}}>
      <div className="premium-filter-grid filter-grid-auto">
        <label className="premium-filter-field"><span>Severity</span><select value={severity} onChange={e=>setSeverity(e.target.value as 'ALL'|Severity)}><option value="ALL">Semua</option><option value="ERROR">ERROR</option><option value="WARNING">WARNING</option><option value="INFO">INFO</option></select></label>
        <label className="premium-filter-field"><span>Bulan</span><select value={month} onChange={e=>setMonth(e.target.value)}><option value="ALL">Semua Bulan</option>{months.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="premium-filter-field"><span>Company</span><select value={company} onChange={e=>setCompany(e.target.value)}><option value="ALL">Semua Company</option>{companies.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="premium-filter-field"><span>Jenis Temuan</span><select value={code} onChange={e=>setCode(e.target.value)}><option value="ALL">Semua Jenis</option>{codes.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="premium-filter-field"><span>Cari</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Plan ID / Daily ID / PID / activity"/>{query!==deferredQuery&&<small>Memfilter…</small>}</label>
      </div>
    </div>
    <div className="panel" style={{marginTop:18}}>
      <div className="section-head"><div><h3>Temuan Audit</h3><p className="muted">ERROR = hubungan data rusak atau hilang. WARNING = data terhubung tetapi nilainya perlu diperiksa.</p></div><strong>{filteredIssues.length} temuan</strong></div>
      <div className="table-wrap"><table><thead><tr><th>Severity</th><th>Jenis</th><th>Entity</th><th>Bulan</th><th>Monthly</th><th>Daily</th><th>PID</th><th>Activity</th><th>Keterangan</th></tr></thead><tbody>{pagedIssues.map(item=><tr key={item.id}><td><strong style={{color:item.severity==='ERROR'?'#b91c1c':undefined}}>{item.severity}</strong></td><td>{item.code}</td><td>{item.entityType}<br/><span className="muted">{item.entityId}</span></td><td>{item.monthKey||'-'}</td><td>{item.monthlyPlanLineId||'-'}</td><td>{item.dailyPlanId||'-'}</td><td>{item.pid||'-'}</td><td>{item.activity||'-'}</td><td>{item.message}</td></tr>)}</tbody></table></div>
      {!filteredIssues.length&&<p className="muted">Tidak ada temuan sesuai filter.</p>}
      {filteredIssues.length>0&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginTop:14}}><span className="muted">Menampilkan {(safeIssuePage-1)*PAGE_SIZE+1}–{Math.min(safeIssuePage*PAGE_SIZE,filteredIssues.length)} dari {filteredIssues.length} temuan.</span><div style={{display:'flex',gap:8,alignItems:'center'}}><button type="button" disabled={safeIssuePage<=1} onClick={()=>setIssuePage(p=>Math.max(1,p-1))}>← Sebelumnya</button><strong>Halaman {safeIssuePage} / {issuePages}</strong><button type="button" disabled={safeIssuePage>=issuePages} onClick={()=>setIssuePage(p=>Math.min(issuePages,p+1))}>Berikutnya →</button></div></div>}
    </div>
    <div className="panel" style={{marginTop:18}}>
      <div className="section-head"><div><h3>Ringkasan Flow per Monthly Plan</h3><p className="muted">Urutan awal menampilkan Monthly Plan dengan jumlah temuan terbanyak.</p></div><strong>{filteredFlows.length} plan</strong></div>
      <div className="table-wrap"><table><thead><tr><th>Plan ID</th><th>Bulan / Week</th><th>Company / Farm</th><th>PID</th><th>Activity</th><th>Target</th><th>Daily</th><th>Actual</th><th>Daily - Target</th><th>Actual - Target</th><th>Temuan</th></tr></thead><tbody>{pagedFlows.map(row=><tr key={row.id}><td><strong>{row.planLineId}</strong></td><td>{row.monthKey}<br/><span className="muted">{row.week}</span></td><td>{row.companyCode||'-'}<br/><span className="muted">{row.farm||'-'}</span></td><td>{row.pid}</td><td>{row.description}<br/><span className="muted">{row.activity||'-'}</span></td><td>{formatHa(row.targetAreaHa)}</td><td>{formatHa(row.dailyAreaHa)}</td><td>{formatHa(row.actualAreaHa)}</td><td style={{color:row.dailyVarianceHa>0.02?'#b91c1c':undefined}}>{formatHa(row.dailyVarianceHa)}</td><td style={{color:row.actualVarianceHa>0.02?'#b91c1c':undefined}}>{formatHa(row.actualVarianceHa)}</td><td><strong>{row.issueCount}</strong></td></tr>)}</tbody></table></div>
      {filteredFlows.length>0&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginTop:14}}><span className="muted">Menampilkan {(safeFlowPage-1)*PAGE_SIZE+1}–{Math.min(safeFlowPage*PAGE_SIZE,filteredFlows.length)} dari {filteredFlows.length} Monthly Plan.</span><div style={{display:'flex',gap:8,alignItems:'center'}}><button type="button" disabled={safeFlowPage<=1} onClick={()=>setFlowPage(p=>Math.max(1,p-1))}>← Sebelumnya</button><strong>Halaman {safeFlowPage} / {flowPages}</strong><button type="button" disabled={safeFlowPage>=flowPages} onClick={()=>setFlowPage(p=>Math.min(flowPages,p+1))}>Berikutnya →</button></div></div>}
    </div>
  </section>
}
