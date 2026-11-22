import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { jsPDF } from 'jspdf'
import { firestoreDb } from './firebase'

type Raw=Record<string,unknown>
type Plan={id:string;week:string;wo:string;pid:string;activity:string;description:string;code:string;coa:string;target:number;materials:Material[]}
type Material={name:string;unit:string;dose:number}
type Actual={id:string;line:string;pid:string;activity:string;area:number;date:string}
type Usage={name:string;unit:string;planned:number;estimated:number;qc:number;qcKnown:boolean}
const WEEKS=['W1','W2','W3','W4']
const str=(v:unknown)=>String(v??'').trim()
const number=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:0}
const norm=(v:unknown)=>str(v).toLocaleLowerCase('id-ID').replace(/\s+/g,' ')
const fmt=(n:number)=>n.toLocaleString('id-ID',{maximumFractionDigits:2})
const range=(month:string,week:string)=>{
  const [year,m]=month.split('-').map(Number),last=new Date(year,m,0).getDate()
  const bounds:Record<string,[number,number]>={W1:[1,7],W2:[8,15],W3:[16,22],W4:[23,last]}
  const [a,b]=bounds[week]||[1,last]
  return String(a).padStart(2,'0')+'–'+String(b).padStart(2,'0')+' '+month
}
function materials(raw:Raw):Material[]{
  const values=Array.isArray(raw.materialsPreview)?raw.materialsPreview:Array.isArray(raw.materials)?raw.materials:Array.isArray(raw.materialLines)?raw.materialLines:Array.isArray(raw.componentsSnapshot)?raw.componentsSnapshot:[]
  return values.map((value:unknown)=>{const v=(value&&typeof value==='object'?value:{}) as Raw
    return{name:str(v.material||v.materialName||v.activeIngredient||v.label),unit:str(v.doseUnit||v.unit),dose:number(v.dosePerHa||v.dosage)}
  }).filter((m:Material)=>m.name&&m.dose>0)
}
function planFrom(id:string,r:Raw):Plan{
  return{id:str(r.planLineId||r.planCode||id),week:str(r.week).toUpperCase(),wo:str(r.woNumber),pid:str(r.pid).toUpperCase(),
    activity:str(r.activity||r.description),description:str(r.description||r.activity),code:str(r.operationCode||r.activityCode),
    coa:str(r.coaCode),target:number(r.targetAreaHa),materials:materials(r)}
}
function sameWork(plan:Plan,actual:Actual,plans:Plan[]){
  if(norm(actual.line)!==norm(plan.id)||norm(actual.pid)!==norm(plan.pid))return false
  const siblings=plans.filter(p=>norm(p.id)===norm(plan.id)&&norm(p.pid)===norm(plan.pid))
  return siblings.length===1||norm(actual.activity)===norm(plan.activity)||norm(actual.activity)===norm(plan.description)
}
function pdfText(doc:jsPDF,value:string,x:number,y:number,maxWidth:number){
  const lines=doc.splitTextToSize(value||'—',maxWidth) as string[]
  doc.text(lines.slice(0,3),x,y)
  return Math.max(1,Math.min(lines.length,3))*4
}
export default function MonthlyPlanPdfReport({monthKey}:{monthKey:string}){
  const[mode,setMode]=useState<'all'|'range'|'custom'>('all')
  const[from,setFrom]=useState('W1'),[to,setTo]=useState('W4'),[custom,setCustom]=useState<string[]>([...WEEKS])
  const[selectedIds,setSelectedIds]=useState<string[]>([])
  const[plans,setPlans]=useState<Plan[]>([]),[actuals,setActuals]=useState<Actual[]>([])
  const[qcRows,setQcRows]=useState<Raw[]>([])
  const[loading,setLoading]=useState(false),[error,setError]=useState(''),[loadedMonth,setLoadedMonth]=useState('')
  const[qcError,setQcError]=useState(''),[cutoff,setCutoff]=useState(()=>new Date().toISOString().slice(0,10))
  const[printing,setPrinting]=useState(false)
  const weeks=mode==='all'?[...WEEKS]:mode==='range'?WEEKS.filter(w=>WEEKS.indexOf(w)>=WEEKS.indexOf(from)&&WEEKS.indexOf(w)<=WEEKS.indexOf(to)):WEEKS.filter(w=>custom.includes(w))
  useEffect(()=>{
    let active=true
    async function load(){
      if(!firestoreDb)return
      const db=firestoreDb
      setLoading(true);setError('');setQcError('');setLoadedMonth('');setPlans([]);setActuals([]);setQcRows([])
      try{
        const snapshot=await getDocs(query(collection(db,'monthly_plans'),where('monthKey','==',monthKey)))
        if(!active)return
        const rows=snapshot.docs.map(d=>planFrom(d.id,d.data() as Raw)).filter(p=>WEEKS.includes(p.week))
        setPlans(rows);setSelectedIds(rows.map(p=>p.id+'|'+p.pid+'|'+p.activity))
        const ids=[...new Set(rows.map(p=>p.id))].filter(Boolean),found=new Map<string,Actual>()
        for(let i=0;i<ids.length;i+=20){
          const snap=await getDocs(query(collection(db,'daily_reports'),where('monthlyPlanLineId','in',ids.slice(i,i+20))))
          if(!active)return
          snap.docs.forEach(d=>{const r=d.data() as Raw;found.set(d.id,{id:d.id,line:str(r.monthlyPlanLineId),pid:str(r.pid||r.paddockRaw).toUpperCase(),activity:str(r.activity||r.description),area:number(r.actualAreaHa),date:str(r.date)})})
        }
        if(active){setActuals([...found.values()]);setLoadedMonth(monthKey)}
        // A second query covers same-month multi-paddock sessions, where the root plan reference may be absent.
        // Failure must NOT be represented as zero material consumption.
        try{
          const first=monthKey+'-01',last=monthKey+'-'+String(new Date(Number(monthKey.slice(0,4)),Number(monthKey.slice(5,7)),0).getDate())
          const q=await getDocs(query(collection(db,'qc_records'),where('date','>=',first),where('date','<=',last)))
          if(active)setQcRows(q.docs.map(d=>({...(d.data() as Raw),_id:d.id})))
        }catch(e){if(active)setQcError('Data QC tidak dapat dibaca sepenuhnya: '+(e instanceof Error?e.message:String(e)))}
      }catch(e){if(active)setError(e instanceof Error?e.message:'Gagal memuat Monthly Plan dan Actual.')}
      finally{if(active)setLoading(false)}
    }
    void load()
    return()=>{active=false}
  },[monthKey])
  const chosen=useMemo(()=>plans.filter(p=>weeks.includes(p.week)&&selectedIds.includes(p.id+'|'+p.pid+'|'+p.activity)),[plans,selectedIds,mode,from,to,custom])
  const summary=useMemo(()=>{
    const seenActual=new Set<string>()
    const rows=chosen.map(p=>{
      const related=actuals.filter(a=>a.date<=cutoff&&sameWork(p,a,plans)&&!seenActual.has(a.id))
      related.forEach(a=>seenActual.add(a.id))
      return{...p,actual:related.reduce((s,a)=>s+a.area,0)}
    })
    const byWeek=WEEKS.filter(w=>weeks.includes(w)).map(w=>{
      const items=rows.filter(r=>r.week===w)
      return{week:w,items,target:items.reduce((s,r)=>s+r.target,0),actual:items.reduce((s,r)=>s+r.actual,0)}
    })
    const usage=new Map<string,Usage>()
    for(const row of rows)for(const m of row.materials){
      const key=norm(m.name)+'|'+norm(m.unit)
      const entry=usage.get(key)||{name:m.name,unit:m.unit,planned:0,estimated:0,qc:0,qcKnown:false}
      entry.planned+=m.dose*row.target;entry.estimated+=m.dose*row.actual;usage.set(key,entry)
    }
    // A QC session is counted once only. Multi-paddock must supply explicit allocations;
    // otherwise mark it as unallocated rather than duplicating the total across PIDs.
    const seenQc=new Set<string>(),unallocated:string[]=[]
    for(const raw of qcRows){
      const id=str(raw._id||raw.id);if(!id||seenQc.has(id)||str(raw.date)>cutoff)continue
      if(str(raw.saveType).toLowerCase()!=='ready'&&str(raw.saveType).toLowerCase()!=='uploaded')continue
      const works=Array.isArray(raw.paddockWorks)?raw.paddockWorks as Raw[]:[]
      const selectedWorks=works.filter(w=>rows.some(p=>norm(p.id)===norm(w.monthlyPlanLineId)&&norm(p.pid)===norm(w.pid)))
      const single=works.length===0&&rows.some(p=>norm(p.id)===norm(raw.monthlyPlanLineId)&&norm(p.pid)===norm(raw.paddock||raw.pid))
      if(!selectedWorks.length&&!single)continue
      seenQc.add(id)
      if(works.length>0){
        if(selectedWorks.length!==works.length){unallocated.push(id);continue}
        for(const work of selectedWorks){
          const allocations=(work.materialAllocations&&typeof work.materialAllocations==='object'?work.materialAllocations:{}) as Raw
          for(const [key,val] of Object.entries(allocations)){
            const item=[...usage.values()].find(u=>norm(u.name)===norm(key))
            if(item&&typeof val==='number'&&Number.isFinite(val)){item.qc+=val;item.qcKnown=true}
          }
        }
      }else{
        const sources=Array.isArray(raw.multiMaterialSources)?raw.multiMaterialSources as Raw[]:[]
        if(!sources.length){unallocated.push(id);continue}
        for(const source of sources){
          const key=norm(source.material)+'|'+norm(source.unit)
          const item=usage.get(key)
          if(item&&typeof source.quantity==='number'&&Number.isFinite(source.quantity)){item.qc+=source.quantity;item.qcKnown=true}
          else unallocated.push(id)
        }
      }
    }
    return{byWeek,usage:[...usage.values()].sort((a,b)=>a.name.localeCompare(b.name)),unallocated,
      target:rows.reduce((s,r)=>s+r.target,0),actual:rows.reduce((s,r)=>s+r.actual,0),rows}
  },[chosen,actuals,plans,qcRows,cutoff,mode,from,to,custom])
  function download(){
    if(!summary.rows.length||loading||error)return
    setPrinting(true)
    try{
      const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),pageW=297,pageH=210,margin=12
      let y=17
      const page=()=>{doc.addPage();y=17}
      const ensure=(height:number)=>{if(y+height>pageH-15)page()}
      const heading=(value:string)=>{ensure(13);doc.setFillColor(29,74,59);doc.rect(margin,y-6,pageW-2*margin,9,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text(value,margin+3,y);doc.setTextColor(25,40,35);y+=10}
      const row=(cells:string[],widths:number[],bold=false)=>{
        doc.setFontSize(8);doc.setFont('helvetica',bold?'bold':'normal')
        const heights=cells.map((cell,i)=>doc.splitTextToSize(cell||'—',Math.max(10,widths[i]-3)).length)
        const height=Math.max(8,Math.min(3,Math.max(...heights))*3.8+2)
        ensure(height)
        let x=margin
        cells.forEach((cell,i)=>{pdfText(doc,cell,x+1.3,y,Math.max(8,widths[i]-3));x+=widths[i]})
        doc.setDrawColor(220,230,224);doc.line(margin,y+height-4,pageW-margin,y+height-4)
        y+=height
      }
      doc.setTextColor(24,62,51);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('MONTHLY PLAN & ACTUAL REPORT',margin,y)
      y+=7;doc.setFontSize(9);doc.setFont('helvetica','normal');doc.text('PT GLOBAL PAPUA ABADI  |  '+monthKey+'  |  As of '+cutoff,y?margin:margin,y)
      y+=8;row(['Selected weeks: '+weeks.join(', '),'Target: '+fmt(summary.target)+' Ha','Actual: '+fmt(summary.actual)+' Ha','Balance: '+fmt(summary.target-summary.actual)+' Ha'],[80,67,67,59],true)
      heading('WEEKLY SUMMARY')
      row(['Week / Date range','Target Ha','Actual Ha','Balance Ha','Progress'],[68,50,50,50,55],true)
      summary.byWeek.forEach(w=>row([w.week+' / '+range(monthKey,w.week),fmt(w.target),fmt(w.actual),fmt(w.target-w.actual),w.target?fmt(w.actual/w.target*100)+'%':'—'],[68,50,50,50,55]))
      heading('WEEKLY WO / PADDOCK DETAIL')
      for(const week of summary.byWeek){
        heading(week.week+'  |  '+range(monthKey,week.week))
        for(const p of week.items){
          ensure(20)
          doc.setFontSize(9);doc.setFont('helvetica','bold')
          doc.text((p.wo||'LEGACY / NO WO')+'  |  '+p.activity+'  |  PID '+p.pid,margin,y);y+=5
          doc.setFont('helvetica','normal');doc.setFontSize(8)
          row(['Code Description: '+p.description,'Operation Code: '+(p.code||'—'),'COA: '+(p.coa||'—')],[135,80,58])
          row(['Material / Dose','Target Ha','Actual Ha','Balance Ha'],[132,47,47,47],true)
          const mat=p.materials.length?p.materials:[{name:'—',dose:0,unit:''}]
          mat.forEach((m,i)=>row([m.name+(m.dose?' / '+fmt(m.dose)+' '+m.unit+'/Ha':''),i?'':fmt(p.target),i?'':fmt(p.actual),i?'':fmt(p.target-p.actual)],[132,47,47,47]))
        }
        row([week.week+' SUBTOTAL',fmt(week.target),fmt(week.actual),fmt(week.target-week.actual)],[132,47,47,47],true)
      }
      heading('MONTHLY MATERIAL USAGE')
      row(['Material','Unit','Planned','Estimated (Actual x Dose)','QC Actual Used','Variance (Estimate - QC)'],[71,25,38,58,43,38],true)
      summary.usage.forEach(m=>row([m.name,m.unit,fmt(m.planned),fmt(m.estimated),m.qcKnown?fmt(m.qc):'Pending QC',m.qcKnown?fmt(m.estimated-m.qc):'—'],[71,25,38,58,43,38]))
      ensure(15);doc.setFontSize(8);doc.text('QC usage is only shown for explicitly recorded, matched material quantities. Missing QC is not zero.',margin,y);y+=5
      if(qcError){doc.text('WARNING: QC read incomplete; QC figures may be partial.',margin,y);y+=5}
      if(summary.unallocated.length){doc.text('Unallocated / unmatched QC sessions: '+summary.unallocated.length+' (excluded from matched material totals).',margin,y);y+=5}
      const pages=doc.getNumberOfPages()
      for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(100);doc.text('Draft Monthly Plan Report | '+monthKey+' | Page '+i+' / '+pages,pageW-margin,pageH-7,{align:'right'})}
      doc.save('Monthly-Plan-Actual-'+monthKey+'-'+weeks.join('-')+'.pdf')
    }catch(e){setError(e instanceof Error?e.message:'PDF gagal dibuat.')}
    finally{setPrinting(false)}
  }
  return <section className="panel" style={{marginTop:16}}>
    <div className="section-head"><div><div className="eyebrow">MONTHLY REPORT</div><h3>Draft Monthly Plan & Actual PDF</h3><p className="muted">Report A4 landscape · pengelompokan Week 1–4 · Planned, Estimated, dan QC Actual terpisah.</p></div></div>
    <div className="form-grid">
      <label>Rentang Week<select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="all">Semua Week (1–4)</option><option value="range">Range berurutan</option><option value="custom">Pilih Week tertentu</option></select></label>
      <label>Actual sampai tanggal<input type="date" value={cutoff} onChange={e=>setCutoff(e.target.value)}/></label>
    </div>
    {mode==='range'&&<div className="form-grid"><label>Dari<select value={from} onChange={e=>{setFrom(e.target.value);if(WEEKS.indexOf(e.target.value)>WEEKS.indexOf(to))setTo(e.target.value)}}>{WEEKS.map(w=><option key={w}>{w}</option>)}</select></label><label>Sampai<select value={to} onChange={e=>{setTo(e.target.value);if(WEEKS.indexOf(e.target.value)<WEEKS.indexOf(from))setFrom(e.target.value)}}>{WEEKS.map(w=><option key={w}>{w}</option>)}</select></label></div>}
    {mode==='custom'&&<div style={{display:'flex',gap:14,flexWrap:'wrap'}}>{WEEKS.map(w=><label key={w}><input type="checkbox" checked={custom.includes(w)} onChange={e=>setCustom(old=>e.target.checked?[...old,w]:old.filter(x=>x!==w))}/> {w} ({range(monthKey,w)})</label>)}</div>}
    <p className="muted">Terpilih: {weeks.map(w=>w+' ('+range(monthKey,w)+')').join(' · ')||'Belum ada Week'}. Week mengikuti konfigurasi Monthly Plan, bukan ISO calendar week.</p>
    {loading&&<p role="status">Memuat laporan dan Actual terhubung…</p>}
    {error&&<p role="alert" className="alert danger">{error}</p>}
    {qcError&&<p role="alert" className="alert">{qcError} — QC Actual dianggap belum lengkap, bukan 0.</p>}
    {!loading&&loadedMonth===monthKey&&<><div className="section-head"><strong>Pilih pekerjaan ({chosen.length} terpilih)</strong><div><button type="button" onClick={()=>setSelectedIds(plans.map(p=>p.id+'|'+p.pid+'|'+p.activity))}>Pilih semua</button><button type="button" onClick={()=>setSelectedIds([])}>Kosongkan</button></div></div>
      <div style={{maxHeight:220,overflow:'auto'}}>{plans.filter(p=>weeks.includes(p.week)).map(p=>{const key=p.id+'|'+p.pid+'|'+p.activity;return <label key={key} style={{display:'block',padding:'5px 0'}}><input type="checkbox" checked={selectedIds.includes(key)} onChange={e=>setSelectedIds(old=>e.target.checked?[...old,key]:old.filter(v=>v!==key))}/> {p.week} · {p.wo||'No WO'} · {p.pid} · {p.activity} · {fmt(p.target)} Ha</label>})}</div>
      <div className="summary-wide-table"><table className="summary-plan-report-table"><thead><tr><th>Week</th><th>Target</th><th>Actual</th><th>Balance</th><th>Progress</th></tr></thead><tbody>{summary.byWeek.map(w=><tr key={w.week}><td>{w.week}</td><td>{fmt(w.target)}</td><td>{fmt(w.actual)}</td><td>{fmt(w.target-w.actual)}</td><td>{w.target?fmt(w.actual/w.target*100)+'%':'—'}</td></tr>)}</tbody></table></div>
      <h4>Material Usage Preview</h4><div className="summary-wide-table"><table className="summary-plan-report-table"><thead><tr><th>Material</th><th>Unit</th><th>Planned</th><th>Estimated</th><th>QC Actual</th><th>Variance</th></tr></thead><tbody>{summary.usage.map(m=><tr key={m.name+'|'+m.unit}><td>{m.name}</td><td>{m.unit}</td><td>{fmt(m.planned)}</td><td>{fmt(m.estimated)}</td><td>{m.qcKnown?fmt(m.qc):'Pending QC'}</td><td>{m.qcKnown?fmt(m.estimated-m.qc):'—'}</td></tr>)}</tbody></table></div>
      <p className="muted">QC hanya dihitung jika memiliki kuantitas eksplisit dan cocok dengan pekerjaan. Data QC draft, tak cocok, atau tidak teralokasi tidak dianggap sebagai pemakaian nol. Actual mengikuti referensi Monthly Plan walaupun dikerjakan pada minggu berikutnya.</p>
      <button type="button" className="summary-excel-button" disabled={!chosen.length||!weeks.length||printing||!!error||!!qcError} onClick={download}>{printing?'Membuat PDF…':'Export PDF · '+weeks.join(', ')}</button>
    </>}
  </section>
}
