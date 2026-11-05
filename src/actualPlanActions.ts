import type { SavedActualRow } from './actualPlanWorkspaceTypes'

function n(value:number,digits=2){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)}
function sortRows(rows:SavedActualRow[]){return [...rows].sort((a,b)=>a.date.localeCompare(b.date)||a.shift.localeCompare(b.shift,undefined,{numeric:true})||(a.planningOrder||999999)-(b.planningOrder||999999)||a.pid.localeCompare(b.pid,undefined,{numeric:true}))}

export function actualPlansToWhatsApp(rows:SavedActualRow[]){
  const ordered=sortRows(rows)
  if(!ordered.length)return''
  const dates=[...new Set(ordered.map(row=>row.date))]
  const lines=['*ACTUAL PEKERJAAN*',`📅 *Tanggal:* ${dates.join(', ')}`,'']
  const shifts=[...new Set(ordered.map(row=>row.shift||'-'))]
  for(const shift of shifts){
    lines.push(`*SHIFT ${shift}*`)
    const source=ordered.filter(row=>(row.shift||'-')===shift)
    source.forEach((row,index)=>{
      lines.push(`${index+1}. *${row.activity||'-'}* — ${row.pid||'-'} — ${n(row.actualAreaHa)} Ha`)
      lines.push(`   👷 ${row.foreman||'-'} · HK ${row.manpower} · 🚜 ${row.unitName||'-'} · 🟢${row.unitReady} 🔴${row.unitBreakdown} 🟡${row.unitStandby}`)
      if(row.notes)lines.push(`   ℹ️ ${row.notes}`)
      if(row.materials.length){
        const material=row.materials.map(m=>`${m.material} ${n(m.totalMaterial,4)} ${m.unit}`).join('; ')
        lines.push(`   🧪 ${material}`)
      }
    })
    lines.push('')
  }
  const area=ordered.reduce((sum,row)=>sum+row.actualAreaHa,0),hk=ordered.reduce((sum,row)=>sum+row.manpower,0)
  lines.push(`📊 *Total:* ${n(area)} Ha · HK ${hk}`)
  return lines.join('\n').trim()
}
