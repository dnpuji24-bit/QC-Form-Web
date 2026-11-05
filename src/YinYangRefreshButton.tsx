type Props={
  busy?:boolean
  disabled?:boolean
  label?:string
  title?:string
  className?:string
  compact?:boolean
  onClick:()=>void
}

export function YinYangIcon({spinning=false}:{spinning?:boolean}){
  return <svg className={spinning?'yin-yang-icon spinning':'yin-yang-icon'} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2a10 10 0 1 0 0 20 5 5 0 0 1 0-10 5 5 0 0 0 0-10Z" fill="currentColor"/>
    <path d="M12 2a5 5 0 0 1 0 10 5 5 0 0 0 0 10 10 10 0 0 0 0-20Z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="12" cy="7" r="1.35" fill="white"/>
    <circle cx="12" cy="17" r="1.35" fill="currentColor"/>
  </svg>
}

export default function YinYangRefreshButton({busy=false,disabled=false,label='Refresh',title,className='',compact=false,onClick}:Props){
  const aria=title||label||'Refresh'
  return <button type="button" className={`yin-refresh-button ${compact?'compact':''} ${className}`.trim()} onClick={onClick} disabled={disabled||busy} aria-label={aria} title={aria}>
    <YinYangIcon spinning={busy}/>
    {label&&<span>{label}</span>}
  </button>
}
