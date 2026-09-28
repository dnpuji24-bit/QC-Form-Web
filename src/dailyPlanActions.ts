export type DailyPlanTransfer={
  dailyPlanId:string
  workGroupId:string
  planningOrder:number
  date:string
  shift:string
  sourceType:string
  monthlyPlanLineId:string
  companyCode:string
  farm:string
  pid:string
  activity:string
  description:string
  areaHa:number
  manpower:number
  unitName:string
  unitReady:number
  unitStandby:number
  unitBreakdown:number
  foreman:string
  notes:string
  pidNotes?:string
  materials:Array<{material:string;dosePerHa:number;doseUnit:string;totalMaterial:number;unit:string}>
}

function n(v:number){return new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(v)}
function groupKey(row:DailyPlanTransfer){return row.date+'|'+(row.workGroupId||row.dailyPlanId)}
function materialLine(m:DailyPlanTransfer['materials'][number]){
  const doseUnit=m.doseUnit||m.unit||'',totalUnit=m.unit||m.doseUnit||''
  return `      - ${m.material}: ${n(m.dosePerHa)} ${doseUnit}/Ha · Total ${n(m.totalMaterial)} ${totalUnit}`
}

export function dailyPlansToWhatsApp(rows:DailyPlanTransfer[]){
  const sorted=[...rows].sort((a,b)=>a.date.localeCompare(b.date)||a.shift.localeCompare(b.shift,undefined,{numeric:true})||(a.planningOrder||0)-(b.planningOrder||0)||a.pid.localeCompare(b.pid,undefined,{numeric:true}))
  if(!sorted.length)return''
  const dates=[...new Set(sorted.map(x=>x.date))]
  const lines:string[]=['*DAILY PLANNING*',`📅 *Tanggal:* ${dates.length===1?dates[0]:dates.join(', ')}`,'────────────────────']
  let number=0
  const shifts=[...new Set(sorted.map(x=>x.shift||'-'))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
  for(const shift of shifts){
    lines.push('',`*=== SHIFT ${shift} ===*`,'')
    const shiftRows=sorted.filter(x=>(x.shift||'-')===shift)
    const groups=new Map<string,DailyPlanTransfer[]>()
    for(const row of shiftRows){const k=groupKey(row),list=groups.get(k)||[];list.push(row);groups.set(k,list)}
    for(const groupRows of groups.values()){
      const first=groupRows[0],area=groupRows.reduce((s,x)=>s+x.areaHa,0)
      number++
      const title=(first.activity||first.description||'KEGIATAN').toUpperCase()
      lines.push(`*${number}. ${title} (${n(area)} Ha)*`)
      for(const row of groupRows){
        lines.push(`📍 Pdk: ${row.pid||'-'} (${n(row.areaHa)} Ha)`)
        lines.push(`   🧾 Kegiatan: ${row.description||row.activity||'-'}`)
        lines.push('   🧪 Bahan & Dosis:')
        if(row.materials.length)lines.push(...row.materials.map(materialLine))
        else lines.push('      -')
        if(row.pidNotes)lines.push(`   ↳ Ket: ${row.pidNotes}`)
      }
      lines.push(`👷 Mandor: ${first.foreman||'-'}`)
      lines.push(`👷 HK: ${n(first.manpower)} | 🚜 Alat: ${first.unitName||'-'}`)
      lines.push(`⚙️ Stat: 🟢${n(first.unitReady)} | 🔴${n(first.unitBreakdown)} | 🟡${n(first.unitStandby)}`)
      lines.push(`ℹ️ Ket: ${first.notes||'-'}`,'')
    }
  }
  const totalArea=sorted.reduce((s,x)=>s+x.areaHa,0)
  const uniqueGroups=new Map<string,DailyPlanTransfer>()
  for(const row of sorted)if(!uniqueGroups.has(groupKey(row)))uniqueGroups.set(groupKey(row),row)
  const totalHk=[...uniqueGroups.values()].reduce((s,x)=>s+x.manpower,0)
  lines.push('────────────────────',`📊 *Total:* ${uniqueGroups.size} kegiatan | ${sorted.length} PID | ${n(totalArea)} Ha | HK ${n(totalHk)}`)
  return lines.join('\n')
}
