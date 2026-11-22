import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { searchDailyWo,type DailyWoChoice,normalizeWo } from './dailyWoPlanning'
import './activity-catalog-smartsearch.css'

type Props={
  value:string;selectedId:string;rows:DailyWoChoice[];loading?:boolean;disabled?:boolean
  onQuery:(value:string)=>void;onSelect:(row:DailyWoChoice)=>void;onClear:()=>void
}
export default function DailyWoSmartSearch({value,selectedId,rows,loading=false,disabled=false,onQuery,onSelect,onClear}:Props){
  const id=useId().replace(/:/g,'')
  const ref=useRef<HTMLDivElement>(null)
  const input=useRef<HTMLInputElement>(null)
  const [open,setOpen]=useState(false),[index,setIndex]=useState(0)
  const matches=useMemo(()=>searchDailyWo(rows,value,12),[rows,value])
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{
      if(ref.current&&!ref.current.contains(event.target as Node))setOpen(false)
    }
    document.addEventListener('pointerdown',outside)
    return()=>document.removeEventListener('pointerdown',outside)
  },[])
  const choose=(row:DailyWoChoice)=>{onSelect(row);setOpen(false);setIndex(0)}
  return <div className="activity-smartsearch daily-wo-smartsearch" ref={ref}>
    <label htmlFor={id} className="activity-smartsearch-label">Nomor WO — cari dahulu</label>
    <div className="activity-smartsearch-control">
      <input ref={input} id={id} value={value} autoComplete="off" disabled={disabled}
        role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-list'}
        aria-activedescendant={open&&matches.length?id+'-option-'+Math.min(index,matches.length-1):undefined}
        placeholder="Ketik nomor WO, contoh WO-001"
        onChange={e=>{onQuery(e.target.value);setOpen(true);setIndex(0)}}
        onFocus={()=>{setOpen(true);setIndex(0)}}
        onKeyDown={e=>{
          if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setIndex(i=>Math.min(i+1,Math.max(0,matches.length-1)))}
          else if(e.key==='ArrowUp'){e.preventDefault();setOpen(true);setIndex(i=>Math.max(0,i-1))}
          else if(e.key==='Enter'&&open){e.preventDefault();if(matches[index])choose(matches[index])}
          else if(e.key==='Escape'){e.preventDefault();setOpen(false)}
          else if(e.key==='Tab')setOpen(false)
        }}/>
      {value&&<button type="button" className="activity-smartsearch-clear" aria-label="Kosongkan nomor WO" disabled={disabled}
        onClick={()=>{onClear();setOpen(true);input.current?.focus()}}>×</button>}
      <span className="activity-smartsearch-chevron" aria-hidden="true">⌕</span>
      {open&&!disabled&&<div id={id+'-list'} role="listbox" aria-label="Hasil Work Order" className="activity-smartsearch-results">
        {matches.map((row,i)=><button type="button" role="option" key={row.id} id={id+'-option-'+i}
          aria-selected={selectedId===row.id} className={'activity-smartsearch-option'+(index===i?' focused':'')}
          onPointerDown={e=>e.preventDefault()} onMouseEnter={()=>setIndex(i)} onClick={()=>choose(row)}>
          <span className="activity-smartsearch-title">WO {row.woNumber} · {row.pid}</span>
          <span className="activity-smartsearch-meta">{row.description||row.activity} · {row.department||'-'}</span>
          <span className="activity-smartsearch-meta">Operation {row.operationCode||'-'} · CoA {row.coaCode||'-'} · Rencana Shift {row.plannedShift||'-'} · {row.monthKey}/{row.week}</span>
        </button>)}
        {!matches.length&&<div className="activity-smartsearch-empty">{loading?'Mencari WO lintas bulan di Firestore…':normalizeWo(value).length<2?'Ketik minimal 2 karakter atau pilih WO periode saat ini.':'WO tidak ditemukan / tidak aktif. Periksa nomor atau refresh.'}</div>}
        <p className="activity-smartsearch-tip">Maksimal 12 hasil. Pilih WO untuk mengisi PID, Activity, CoA dan Operation otomatis.</p>
      </div>}
    </div>
    <small>WO terikat pada PID dan Activity, tetapi Shift Aktual boleh berbeda dengan Shift Rencana.</small>
  </div>
}
