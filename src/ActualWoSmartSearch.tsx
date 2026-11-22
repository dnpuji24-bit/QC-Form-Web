import {useEffect,useId,useMemo,useRef,useState} from 'react'
import {searchActualWo,type ActualWoChoice} from './actualWoSelection'
import './activity-catalog-smartsearch.css'

type Props={rows:ActualWoChoice[];value:string;selectedId:string;disabled?:boolean;
 onQuery:(next:string)=>void;onSelect:(row:ActualWoChoice)=>void;onClear:()=>void}

export default function ActualWoSmartSearch({rows,value,selectedId,disabled=false,onQuery,onSelect,onClear}:Props){
 const id=useId().replace(/:/g,'')
 const container=useRef<HTMLDivElement>(null)
 const input=useRef<HTMLInputElement>(null)
 const [open,setOpen]=useState(false),[focusIndex,setFocusIndex]=useState(0)
 const filtered=useMemo(()=>searchActualWo(rows,value,12),[rows,value])
 useEffect(()=>{
  const close=(event:PointerEvent)=>{if(container.current&&!container.current.contains(event.target as Node))setOpen(false)}
  document.addEventListener('pointerdown',close)
  return()=>document.removeEventListener('pointerdown',close)
 },[])
 function choose(row:ActualWoChoice){onSelect(row);setOpen(false);setFocusIndex(0)}
 return <div className="activity-smartsearch actual-wo-smartsearch" ref={container}>
  <label htmlFor={id} className="activity-smartsearch-label">Nomor WO — cari dahulu</label>
  <div className="activity-smartsearch-control">
   <input ref={input} id={id} value={value} role="combobox" aria-autocomplete="list"
    aria-expanded={open} aria-controls={id+'-list'} autoComplete="off" disabled={disabled}
    aria-activedescendant={open&&filtered.length?id+'-option-'+Math.min(focusIndex,filtered.length-1):undefined}
    placeholder="Cari WO, PID, Operation Code atau Daily ID…"
    onFocus={()=>{setOpen(true);setFocusIndex(0)}}
    onChange={e=>{onQuery(e.target.value);setOpen(true);setFocusIndex(0)}}
    onKeyDown={e=>{
     if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setFocusIndex(i=>Math.min(i+1,Math.max(0,filtered.length-1)))}
     else if(e.key==='ArrowUp'){e.preventDefault();setOpen(true);setFocusIndex(i=>Math.max(i-1,0))}
     else if(e.key==='Enter'&&open){e.preventDefault();if(filtered[focusIndex])choose(filtered[focusIndex])}
     else if(e.key==='Escape'){e.preventDefault();setOpen(false)}
     else if(e.key==='Tab')setOpen(false)
    }}/>
   {value&&<button type="button" className="activity-smartsearch-clear" aria-label="Kosongkan pilihan WO"
      disabled={disabled} onClick={()=>{onClear();setOpen(true);input.current?.focus()}}>×</button>}
   <span className="activity-smartsearch-chevron" aria-hidden="true">⌕</span>
   {open&&!disabled&&<div id={id+'-list'} className="activity-smartsearch-results" role="listbox" aria-label="WO yang tersedia pada Daily tanggal terpilih">
    {filtered.map((row,index)=><button type="button" role="option" id={id+'-option-'+index}
      aria-selected={selectedId===row.id} key={row.id}
      className={'activity-smartsearch-option'+(focusIndex===index?' focused':'')}
      onPointerDown={e=>e.preventDefault()} onMouseEnter={()=>setFocusIndex(index)}
      onClick={()=>choose(row)}>
      <span className="activity-smartsearch-title">WO {row.woNumber} · {row.pid}</span>
      <span className="activity-smartsearch-meta">{row.activity} · Daily {row.dailyPlanId} · Shift Daily {row.dailyShift}</span>
      <span className="activity-smartsearch-meta">Operation {row.operationCode||'-'} · CoA {row.coaCode||'-'} · Shift WO {row.plannedShift||'-'} · Sisa {Math.max(row.areaHa-row.doneHa,0).toLocaleString('id-ID',{maximumFractionDigits:2})} Ha</span>
     </button>)}
    {!filtered.length&&<div className="activity-smartsearch-empty">
      {value?'Tidak ada WO yang cocok pada Daily tanggal ini. Periksa tanggal atau buat Daily Plan dahulu.':'Belum ada Daily dengan WO pada tanggal ini.'}
     </div>}
    <p className="activity-smartsearch-tip">Maksimal 12 hasil. Pilih baris Daily yang sesuai jika satu WO memiliki beberapa shift.</p>
   </div>}
  </div>
  <small>WO diambil dari Daily Plan pada tanggal terpilih. Shift Aktual boleh berbeda dari Shift WO maupun Shift Daily.</small>
 </div>
}
