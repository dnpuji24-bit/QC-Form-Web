import {useEffect,useId,useMemo,useRef,useState} from 'react'
import {qcSearchWorkOrders,type QcDailyPlan} from './qcDailyPlanSource'
import './activity-catalog-smartsearch.css'
import './qc-wo-smartsearch.css'

type Props={
  rows:QcDailyPlan[];value:string;selectedId:string;disabled?:boolean
  onQuery:(query:string)=>void;onSelect:(row:QcDailyPlan)=>void;onClear:()=>void
}
/** Per-unit explicit Daily selection; WO alone is not a unique source when
 * one WO has multiple Daily executions or planned shifts.
 */
export default function QcWorkOrderSmartSearch({rows,value,selectedId,disabled=false,onQuery,onSelect,onClear}:Props){
  const uid=useId().replace(/:/g,'')
  const root=useRef<HTMLDivElement>(null)
  const search=useRef<HTMLInputElement>(null)
  const [open,setOpen]=useState(false),[active,setActive]=useState(0)
  const results=useMemo(()=>qcSearchWorkOrders(rows,value,12),[rows,value])
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{
      if(root.current&&!root.current.contains(event.target as Node))setOpen(false)
    }
    document.addEventListener('pointerdown',outside)
    return()=>document.removeEventListener('pointerdown',outside)
  },[])
  function choose(row:QcDailyPlan){onSelect(row);setOpen(false);setActive(0)}
  return <div className="activity-smartsearch qc-work-order-search" ref={root}>
    <label htmlFor={uid} className="activity-smartsearch-label">Nomor WO — smartsearch</label>
    <div className="activity-smartsearch-control">
      <input ref={search} id={uid} value={value||''} autoComplete="off" disabled={disabled}
        role="combobox" aria-autocomplete="list" aria-expanded={open}
        aria-controls={uid+'-list'}
        aria-activedescendant={open&&results.length?uid+'-item-'+Math.min(active,results.length-1):undefined}
        placeholder="Cari WO, PID, Operation Code atau CoA…"
        onFocus={()=>{setOpen(true);setActive(0)}}
        onChange={e=>{onQuery(e.target.value);setOpen(true);setActive(0)}}
        onKeyDown={e=>{
          if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,Math.max(0,results.length-1)))}
          else if(e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,i-1))}
          else if(e.key==='Enter'&&open){e.preventDefault();if(results[active])choose(results[active])}
          else if(e.key==='Escape'){e.preventDefault();setOpen(false)}
          else if(e.key==='Tab')setOpen(false)
        }}/>
      {value&&<button type="button" className="activity-smartsearch-clear" aria-label="Kosongkan WO" disabled={disabled}
        onClick={()=>{onClear();setOpen(true);search.current?.focus()}}>×</button>}
      <span className="activity-smartsearch-chevron" aria-hidden="true">⌕</span>
      {open&&!disabled&&<div id={uid+'-list'} role="listbox" aria-label="Daily Plan yang terhubung ke WO"
        className="activity-smartsearch-results">
        {results.map((row,index)=><button type="button" role="option" key={row.id}
          id={uid+'-item-'+index} aria-selected={selectedId===row.dailyPlanId}
          className={'activity-smartsearch-option'+(index===active?' focused':'')}
          onPointerDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(index)}
          onClick={()=>choose(row)}>
          <span className="activity-smartsearch-title">WO {row.woNumber} · {row.pid}</span>
          <span className="activity-smartsearch-meta">{row.description||row.activity} · Daily {row.dailyPlanId} · Shift Daily {row.shift}</span>
          <span className="activity-smartsearch-meta">Operation {row.operationCode||'-'} · CoA {row.coaCode||'-'} · Shift WO {row.plannedShift||'-'} · Mandor Daily {row.foreman||'-'}</span>
        </button>)}
        {!results.length&&<div className="activity-smartsearch-empty">{value?'WO tidak ditemukan untuk tanggal dan jenis QC ini.':'Tidak ada Daily Plan ber-WO pada tanggal ini.'}</div>}
        <p className="activity-smartsearch-tip">Maksimum 12 hasil; pilih Daily ID yang tepat. Sumber Shift 1 atau 2 dapat dipakai oleh Shift Aktual lain.</p>
      </div>}
    </div>
    <small>Daily ID dipakai sebagai referensi tetap. Shift dan mandor QC di atas tetap pelaksana aktual.</small>
  </div>
}
