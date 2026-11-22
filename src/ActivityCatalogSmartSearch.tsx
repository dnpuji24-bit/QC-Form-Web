import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CoaActivity } from './activityCatalogModel'
import { searchActivityCatalog } from './activityCatalogSearch'
import './activity-catalog-smartsearch.css'

type Props={
  options:CoaActivity[]
  value:string
  fallbackLabel?:string
  disabled?:boolean
  onSelect:(id:string)=>void
}

export default function ActivityCatalogSmartSearch({options,value,fallbackLabel='',disabled=false,onSelect}:Props){
  const id=useId().replace(/:/g,'')
  const parentRef=useRef<HTMLDivElement>(null)
  const inputRef=useRef<HTMLInputElement>(null)
  const preserveTypedText=useRef(false)
  const selected=options.find(row=>row.id===value)
  const selectedLabel=selected?
    [selected.name,selected.department,selected.operationCode,selected.coaCode].filter(Boolean).join(' · '):
    (value?fallbackLabel||'Activity historis ('+value+')':'')
  const [query,setQuery]=useState(selectedLabel)
  const [open,setOpen]=useState(false)
  const [focusedIndex,setFocusedIndex]=useState(0)
  const matches=useMemo(()=>searchActivityCatalog(options,query,10),[options,query])

  useEffect(()=>{
    if(preserveTypedText.current&&!value){preserveTypedText.current=false;return}
    setQuery(selectedLabel)
  },[value,selectedLabel])

  useEffect(()=>{
    function outside(e:PointerEvent){
      if(parentRef.current&&!parentRef.current.contains(e.target as Node))setOpen(false)
    }
    document.addEventListener('pointerdown',outside)
    return()=>document.removeEventListener('pointerdown',outside)
  },[])

  function select(id:string){
    const row=options.find(item=>item.id===id)
    if(!row)return
    preserveTypedText.current=false
    setQuery([row.name,row.department,row.operationCode,row.coaCode].filter(Boolean).join(' · '))
    setOpen(false);setFocusedIndex(0);onSelect(row.id)
  }

  function type(text:string){
    setQuery(text);setOpen(true);setFocusedIndex(0)
    // Do not silently keep a previously selected Operation Code if the user
    // starts typing another Activity or Department.
    if(value){preserveTypedText.current=true;onSelect('')}
  }

  function clear(){
    preserveTypedText.current=false;setQuery('');setOpen(true);setFocusedIndex(0)
    if(value)onSelect('')
    inputRef.current?.focus()
  }

  return <div className="activity-smartsearch" ref={parentRef}>
    <label htmlFor={id} className="activity-smartsearch-label">Activity — Master Klasifikasi</label>
    <div className="activity-smartsearch-control">
      <input id={id} ref={inputRef} type="text" role="combobox" autoComplete="off"
        aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-list'}
        aria-activedescendant={open&&matches.length?id+'-option-'+focusedIndex:undefined}
        placeholder="Cari Activity, departemen, Operation Code, atau CoA…"
        value={query} disabled={disabled}
        onFocus={()=>{setOpen(true);setFocusedIndex(0)}}
        onChange={event=>type(event.target.value)}
        onKeyDown={event=>{
          if(event.key==='ArrowDown'){event.preventDefault();setOpen(true);setFocusedIndex(i=>Math.min(i+1,Math.max(0,matches.length-1)))}
          else if(event.key==='ArrowUp'){event.preventDefault();setOpen(true);setFocusedIndex(i=>Math.max(0,i-1))}
          else if(event.key==='Enter'&&open){event.preventDefault();if(matches[focusedIndex])select(matches[focusedIndex].id)}
          else if(event.key==='Escape'){event.preventDefault();setOpen(false)}
          else if(event.key==='Tab'){setOpen(false)}
        }}/>
      {query&&<button type="button" className="activity-smartsearch-clear" aria-label="Hapus pilihan Activity" disabled={disabled} onClick={clear}>×</button>}
      <span className="activity-smartsearch-chevron" aria-hidden="true">⌕</span>
    {open&&!disabled&&<div className="activity-smartsearch-results" id={id+'-list'} role="listbox" aria-label="Hasil pencarian Activity">
      {matches.length?matches.map((row,index)=>
        <button type="button" id={id+'-option-'+index} role="option"
          aria-selected={row.id===value} key={row.id}
          className={'activity-smartsearch-option'+(index===focusedIndex?' focused':'')}
          onMouseEnter={()=>setFocusedIndex(index)}
          onPointerDown={event=>event.preventDefault()}
          onClick={()=>select(row.id)}>
          <span className="activity-smartsearch-title">{row.name}</span>
          <span className="activity-smartsearch-meta">{row.department||'Legacy'} · Operation {row.operationCode||'-'} · CoA {row.coaCode||'belum diatur'}</span>
        </button>
      ):<div className="activity-smartsearch-empty">Tidak ada Activity yang cocok. Periksa nama atau Operation Code.</div>}
      <p className="activity-smartsearch-tip">Menampilkan maksimal 10 hasil. Ketik lebih spesifik untuk mempersempit pencarian.</p>
    </div>}
    </div>
    <small>Gunakan nama, departemen, Operation Code, atau CoA. Enter untuk memilih; Esc untuk menutup. Activity dengan nama sama tetap dibedakan berdasarkan Operation Code.</small>
  </div>
}
