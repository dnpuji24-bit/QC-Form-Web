import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { searchMonthlyActivities,type MonthlyActivityChoice } from './monthlyActivitySearch'
import './activity-catalog-smartsearch.css'

type Props={
  options:MonthlyActivityChoice[]
  value:string
  disabled?:boolean
  onSelect:(activityId:string)=>void
}
function display(row:MonthlyActivityChoice):string{
  return [row.description||row.activity,row.department||'Master Activity',
    row.operationCode||row.activityCode].filter(Boolean).join(' · ')
}
export default function MonthlyActivitySmartSearch({options,value,disabled=false,onSelect}:Props){
  const id=useId().replace(/:/g,'')
  const parent=useRef<HTMLDivElement>(null)
  const inputRef=useRef<HTMLInputElement>(null)
  const preserveQuery=useRef(false)
  const selected=options.find(row=>row.id===value)
  const label=selected?display(selected):value?'Referensi Activity tidak ditemukan ('+value+')':''
  const [query,setQuery]=useState(label)
  const [open,setOpen]=useState(false)
  const [active,setActive]=useState(0)
  const results=useMemo(()=>searchMonthlyActivities(options,query,10),[options,query])
  useEffect(()=>{
    if(preserveQuery.current&&!value){preserveQuery.current=false;return}
    setQuery(label)
  },[value,label])
  useEffect(()=>{
    const onOutside=(e:PointerEvent)=>{
      if(parent.current&&!parent.current.contains(e.target as Node))setOpen(false)
    }
    document.addEventListener('pointerdown',onOutside)
    return()=>document.removeEventListener('pointerdown',onOutside)
  },[])
  function choose(row:MonthlyActivityChoice){
    preserveQuery.current=false
    setQuery(display(row));setOpen(false);setActive(0);onSelect(row.id)
  }
  function change(text:string){
    setQuery(text);setOpen(true);setActive(0)
    if(value){preserveQuery.current=true;onSelect('')}
  }
  function clear(){
    preserveQuery.current=false;setQuery('');setOpen(true);setActive(0)
    if(value)onSelect('')
    inputRef.current?.focus()
  }
  return <div className="activity-smartsearch monthly-activity-smartsearch" ref={parent}>
    <label htmlFor={id} className="activity-smartsearch-label">Activity / Description</label>
    <div className="activity-smartsearch-control">
      <input id={id} ref={inputRef} value={query}
        placeholder="Cari Activity, deskripsi, Operation, CoA, ACT…"
        role="combobox" aria-autocomplete="list" aria-expanded={open}
        aria-controls={id+'-list'}
        aria-activedescendant={open&&results.length?id+'-option-'+active:undefined}
        disabled={disabled} autoComplete="off"
        onFocus={()=>{setOpen(true);setActive(0)}}
        onChange={e=>change(e.target.value)}
        onKeyDown={e=>{
          if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,Math.max(0,results.length-1)))}
          else if(e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,i-1))}
          else if(e.key==='Enter'&&open){e.preventDefault();const row=results[active];if(row)choose(row)}
          else if(e.key==='Escape'){e.preventDefault();setOpen(false)}
          else if(e.key==='Tab')setOpen(false)
        }}/>
      {query&&<button type="button" className="activity-smartsearch-clear"
        aria-label="Kosongkan pilihan Activity" disabled={disabled} onClick={clear}>×</button>}
      <span className="activity-smartsearch-chevron" aria-hidden="true">⌕</span>
      {open&&!disabled&&<div id={id+'-list'} className="activity-smartsearch-results" role="listbox" aria-label="Hasil pencarian Monthly Activity">
        {results.length?results.map((row,index)=><button key={row.id}
          type="button" id={id+'-option-'+index} role="option" aria-selected={row.id===value}
          className={'activity-smartsearch-option'+(active===index?' focused':'')}
          onPointerDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(index)}
          onClick={()=>choose(row)}>
          <span className="activity-smartsearch-title">{row.description||row.activity}</span>
          <span className="activity-smartsearch-meta">{row.activity} · {row.department||'Belum dipetakan'}</span>
          <span className="activity-smartsearch-meta">Operation {row.operationCode||'-'} · CoA {row.coaCode||'-'} · {row.activityCode||'ACT belum ada'}</span>
        </button>):<div className="activity-smartsearch-empty">Tidak ditemukan. Periksa deskripsi, CoA, atau Operation Code.</div>}
        <p className="activity-smartsearch-tip">Maksimum 10 hasil; ketik lebih spesifik. ↑ ↓ untuk memilih, Enter untuk konfirmasi.</p>
      </div>}
    </div>
    <small>Activity dipilih dari List Validasi; CoA dan Operation Code mengikuti Master Klasifikasi.</small>
  </div>
}
