import {useMemo,useState} from 'react'
import QcWorkOrderSmartSearch from './QcWorkOrderSmartSearch'
import type {QcDailyPlan} from './qcDailyPlanSource'
import type {QcMultiPaddockWork,QcMultiMaterialSource} from './types'
import {allocateQcMaterial,MAX_QC_PADDOCKS,validateQcMultiPaddock} from './qcMultiPaddock.mjs'
import './qc-multi-paddock.css'

type Props={
  kind:'spray'|'fertilizer'
  rows:QcDailyPlan[]
  works:QcMultiPaddockWork[]
  sources:QcMultiMaterialSource[]
  disabled?:boolean
  unitName?:string
  onChange:(works:QcMultiPaddockWork[])=>void
}
const money=(n:number)=>Number.isFinite(n)?n.toLocaleString('id-ID',{maximumFractionDigits:3}):'0'
const round=(n:number)=>Number(n.toFixed(3))
export function blankQcPaddockWork():QcMultiPaddockWork{
  return{workId:crypto.randomUUID(),dailyPlanId:'',monthlyPlanLineId:'',woNumber:'',
    pid:'',activity:'',description:'',coaCode:'',operationCode:'',department:'',
    plannedShift:'',dailyShift:'',dailyForeman:'',plannedDailyAreaHa:0,
    areaHa:0,completed:false,materialAllocations:{}}
}
export default function QcMultiPaddockSection({kind,rows,works,sources,disabled=false,unitName,onChange}:Props){
  const [error,setError]=useState('')
  const [editingId,setEditingId]=useState('')
  const totalArea=useMemo(()=>works.reduce((v,w)=>v+(Number(w.areaHa)||0),0),[works])
  const complete=works.filter(w=>w.completed).length
  const allocations=useMemo(()=>sources.map(source=>{
    const allocated=works.reduce((sum,w)=>sum+(Number(w.materialAllocations?.[source.id])||0),0)
    return {...source,allocated,remaining:round(source.quantity-allocated)}
  }),[works,sources])
  const problem=validateQcMultiPaddock(works,sources,{ready:true,totalArea})
  const update=(id:string,patch:Partial<QcMultiPaddockWork>)=>
    onChange(works.map(w=>w.workId===id?{...w,...patch}:w))
  const selectWo=(id:string,row:QcDailyPlan)=>{
    if(works.some(w=>w.workId!==id&&w.dailyPlanId===row.dailyPlanId)){
      setError('Daily ID '+row.dailyPlanId+' sudah tercatat. Edit pekerjaan tersebut; jangan input dua kali.')
      return
    }
    const old=works.find(w=>w.workId===id)
    update(id,{dailyPlanId:row.dailyPlanId,monthlyPlanLineId:row.monthlyPlanLineId,
      woNumber:row.woNumber,pid:row.pid,activity:row.activity,description:row.description,
      coaCode:row.coaCode,operationCode:row.operationCode,department:row.department,
      plannedShift:row.plannedShift,dailyShift:row.shift,dailyForeman:row.foreman,
      plannedDailyAreaHa:row.areaHa,areaHa:old?.dailyPlanId===row.dailyPlanId?old.areaHa:0,
      completed:false,materialAllocations:old?.dailyPlanId===row.dailyPlanId?old.materialAllocations:{}})
    setError('')
  }
  const finish=(work:QcMultiPaddockWork)=>{
    if(!work.dailyPlanId||!work.woNumber||!work.pid){setError('Pilih WO/Daily ID sebelum menyelesaikan paddock.');return}
    if(!(work.areaHa>0)){setError('Luas actual paddock harus lebih dari 0 Ha.');return}
    setError('')
    update(work.workId,{completed:true})
    setEditingId('')
  }
  const add=()=>{
    if(works.length>=MAX_QC_PADDOCKS){setError('Maksimal '+MAX_QC_PADDOCKS+' paddock dalam satu Unit Card.');return}
    if(works.some(w=>!w.completed)){setError('Selesaikan paddock yang aktif sebelum menambahkan WO berikutnya.');return}
    const next=blankQcPaddockWork()
    onChange([...works,next])
    setEditingId(next.workId)
    setError('')
  }
  const setAmount=(id:string,sourceId:string,value:string)=>{
    const item=works.find(w=>w.workId===id)
    if(!item)return
    update(id,{materialAllocations:{...item.materialAllocations,[sourceId]:Math.max(0,Number(value)||0)}})
  }
  return <section className="qc-multi-panel" aria-label="Multi-Paddock QC">
    <nav className="qc-multi-stage-strip" aria-label="Tahapan input QC">
      <span>1 · Unit</span><span>2 · WO/Paddock</span><span>3 · Filling</span>
      <span>4 · Working/HOLD</span><span>5 · Review</span>
    </nav>
    <div className="qc-multi-heading">
      <div><small>LANGKAH 2 · WORK ORDER</small><h4>Pekerjaan per WO / Paddock</h4>
        <p>Isi satu paddock, pilih Selesai Paddock, kemudian tambahkan WO berikutnya. Waktu dan foto tetap milik unit.</p>
      </div>
      <div className="qc-multi-summary"><b>{complete}/{works.length}</b><small>Selesai</small></div>
    </div>
    <div className="qc-multi-stats">
      <span><b>{unitName||'Unit belum dipilih'}</b><small>Unit bersama</small></span>
      <span><b>{money(totalArea)} Ha</b><small>Total luas</small></span>
      <span><b>{sources.length}</b><small>Material/Filling</small></span>
    </div>
    {works.map((work,index)=>{
      const selected=rows.find(r=>r.dailyPlanId===work.dailyPlanId)
      const isOpen=!work.completed||editingId===work.workId
      return <div className={'qc-multi-work '+(work.completed&&!isOpen?'qc-multi-complete':'')} key={work.workId}>
        <div className="qc-multi-work-head">
          <div><strong>{work.completed?'✓ ':'📍 '}Paddock {index+1} · {work.pid||'Belum dipilih'}</strong>
            <small>{work.woNumber?('WO '+work.woNumber+' · '+money(work.areaHa)+' Ha'):'Pilih WO dari Daily Plan'}</small></div>
          <div className="qc-multi-buttons">
            {work.completed&&<button type="button" disabled={disabled} onClick={()=>{setEditingId(work.workId);update(work.workId,{completed:false})}}>Edit</button>}
            {!work.completed&&works.length>1&&<button type="button" disabled={disabled}
              onClick={()=>{onChange(works.filter(w=>w.workId!==work.workId));setError('')}}>Hapus</button>}
          </div>
        </div>
        {isOpen&&<div className="qc-multi-work-body">
          <QcWorkOrderSmartSearch rows={rows} disabled={disabled}
            value={work.woNumber} selectedId={work.dailyPlanId}
            onQuery={value=>update(work.workId,{woNumber:value,dailyPlanId:'',
              pid:'',activity:'',description:'',monthlyPlanLineId:'',completed:false})}
            onSelect={row=>selectWo(work.workId,row)}
            onClear={()=>update(work.workId,{woNumber:'',dailyPlanId:'',pid:'',activity:'',description:'',completed:false})}/>
          {selected&&<div className="qc-multi-work-meta">
            <span>Daily ID: <b>{selected.dailyPlanId}</b></span>
            <span>Activity: <b>{selected.description||selected.activity}</b></span>
            <span>Operation: <b>{selected.operationCode||'-'}</b></span>
            <span>CoA: <b>{selected.coaCode||'-'}</b></span>
            <span>WO Shift: <b>{selected.plannedShift||'-'}</b></span>
            <span>Daily Shift: <b>{selected.shift||'-'}</b></span>
          </div>}
          <label className="qc-multi-area">Luas Actual Paddock (Ha)
            <input type="number" inputMode="decimal" min="0" step="0.01" disabled={disabled}
              value={work.areaHa||''} placeholder="0,00"
              onChange={e=>update(work.workId,{areaHa:Math.max(0,Number(e.target.value)||0),completed:false})}/>
            {selected&&<small>Target Daily: {money(selected.areaHa)} Ha. Kelebihan luas tetap diizinkan.</small>}
          </label>
          <button className="qc-multi-finish" type="button" disabled={disabled} onClick={()=>finish(work)}>
            ✓ Selesai Paddock
          </button>
        </div>}
      </div>
    })}
    <button className="qc-multi-add" type="button" disabled={disabled||works.length>=MAX_QC_PADDOCKS} onClick={add}>+ Tambah WO / Paddock Berikutnya</button>
    <section className="qc-multi-alloc">
      <h4>LANGKAH 3 · Pengisian dan Alokasi Bahan</h4>
      <p>Jumlah fisik diisi sekali pada bagian Material/Filling unit. Di sini bagi ke paddock yang menerima bahan. Saran otomatis mengikuti proporsi luas dan masih bisa dikoreksi.</p>
      <button type="button" className="qc-multi-goto-filling" disabled={disabled}
        onClick={()=>document.querySelector(kind==='fertilizer'?'.fertilizer-working-time':'.material-grid')
          ?.scrollIntoView({behavior:'smooth',block:'start'})}>
        Isi {kind==='fertilizer'?'Pengisian / Filling':'Bahan Kimia Aktual'} pada Unit
      </button>
      {!sources.length&&<small>Isi jumlah material pada form unit terlebih dahulu, kemudian kembali untuk mengalokasikan. Jika tidak ada material aktual, bagian ini boleh kosong.</small>}
      {allocations.map(source=><div className="qc-multi-source" key={source.id}>
        <div className="qc-multi-source-head">
          <strong>{source.material}</strong>
          <span>{money(source.quantity)} {source.unit}</span>
        </div>
        {works.filter(w=>w.dailyPlanId).map(w=><label className="qc-multi-allocation" key={w.workId}>
          <span>{w.pid} · {w.woNumber}</span>
          <input disabled={disabled} inputMode="decimal" type="number" min="0" step="0.001"
            aria-label={'Alokasi '+source.material+' untuk '+w.pid}
            value={w.materialAllocations?.[source.id]??''}
            onChange={e=>setAmount(w.workId,source.id,e.target.value)}/>
          <small>{source.unit}</small>
        </label>)}
        <div className="qc-multi-source-footer">
          <span>Dialokasikan {money(source.allocated)} {source.unit}</span>
          <b className={Math.abs(source.remaining)<0.02?'qc-multi-ok':'qc-multi-warn'}>
            {source.remaining<0?'Kelebihan':'Belum dialokasikan'} {money(Math.abs(source.remaining))} {source.unit}
          </b>
        </div>
        <button type="button" disabled={disabled||totalArea<=0}
          onClick={()=>onChange(allocateQcMaterial(works,source.id,source.quantity))}>Alokasikan otomatis menurut luas</button>
      </div>)}
    </section>
    {error&&<p className="qc-multi-error" role="alert">{error}</p>}
    <div className="qc-multi-review">
      <h4>LANGKAH 5 · Review</h4>
      <p>Unit: <b>{unitName||'-'}</b> · {works.length} paddock · {money(totalArea)} Ha · {complete} selesai</p>
      <p className={problem?'qc-multi-warn':'qc-multi-ok'}>{problem||'✓ Seluruh paddock dan alokasi siap untuk status Ready.'}</p>
      <p>Ready hanya dapat disimpan setelah seluruh paddock selesai dan alokasi setiap filling seimbang.</p>
      <small>Simpan Draft tidak membuat Actual. Saat Ready, satu QC Unit disimpan bersama Actual terpisah untuk masing-masing Daily ID/WO.</small>
    </div>
  </section>
}
