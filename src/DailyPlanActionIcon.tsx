export type DailyActionIconName='up'|'down'|'wa'|'copy'|'edit'|'trash'|'calendar'

export default function DailyActionIcon({name}:{name:DailyActionIconName}){
  const props={width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true}
  if(name==='up')return <svg {...props}><path d="m6 15 6-6 6 6"/><path d="M12 9v10"/></svg>
  if(name==='down')return <svg {...props}><path d="m6 9 6 6 6-6"/><path d="M12 5v10"/></svg>
  if(name==='copy')return <svg {...props}><rect x="9" y="9" width="10" height="10" rx="2"/><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/></svg>
  if(name==='edit')return <svg {...props}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
  if(name==='trash')return <svg {...props}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
  if(name==='calendar')return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="m10 14 2 2 4-4"/></svg>
  return <svg {...props}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.8 9.8 0 0 1-3.7-.8L3 21l1.8-5A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8.4 8.2c.4 2.4 2.4 4.5 4.9 5.1"/><path d="m8.5 8.3 1.2 2-1 1.1"/><path d="m13.2 13.3 1.1-1 2 1.2"/></svg>
}
