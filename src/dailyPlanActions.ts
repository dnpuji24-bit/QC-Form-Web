export type DailyPlanTransfer={
  dailyPlanId:string
  workGroupId:string
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
  materials:Array<{material:string;dosePerHa:number;doseUnit:string;totalMaterial:number;unit:string}>
}

function n(v:number){return new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(v)}
function groupKey(row:DailyPlanTransfer){return row.date+'|'+(row.workGroupId||row.dailyPlanId)}
function aggregateMaterials(rows:DailyPlanTransfer[]){
  const map=new Map<string,{material:string;dosePerHa:number;doseUnit:string;totalMaterial:number;unit:string}>()
  for(const row of rows)for(const m of row.materials){
    const k=(m.material+'|'+(m.unit||m.doseUnit)).toLowerCase(),current=map.get(k)
    if(current)current.totalMaterial+=m.totalMaterial
    else map.set(k,{...m})
  }
  return[...map.values()]
}
function materialLine(m:DailyPlanTransfer['materials'][number]){
  const doseUnit=m.doseUnit||m.unit||'',totalUnit=m.unit||m.doseUnit||''
  return `   - ${m.material}: ${n(m.dosePerHa)} ${doseUnit}/Ha (Tot: ${n(m.totalMaterial)} ${totalUnit})`
}

export function dailyPlansToWhatsApp(rows:DailyPlanTransfer[]){
  const sorted=[...rows].sort((a,b)=>a.date.localeCompare(b.date)||a.shift.localeCompare(b.shift,undefined,{numeric:true})||a.activity.localeCompare(b.activity)||a.pid.localeCompare(b.pid,undefined,{numeric:true}))
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
      const first=groupRows[0],area=groupRows.reduce((s,x)=>s+x.areaHa,0),materials=aggregateMaterials(groupRows)
      number++
      const title=(first.activity||first.description||'KEGIATAN').toUpperCase()
      lines.push(`*${number}. ${title} (${n(area)} Ha)*`)
      for(const row of groupRows)lines.push(`📍 Pdk: ${row.pid||'-'} (${n(row.areaHa)} Ha)`)
      lines.push(`👷 Mandor: ${first.foreman||'-'}`)
      lines.push(`👷 HK: ${n(first.manpower)} | 🚜 Alat: ${first.unitName||'-'}`)
      lines.push(`⚙️ Stat: 🟢${n(first.unitReady)} | 🔴${n(first.unitBreakdown)} | 🟡${n(first.unitStandby)}`)
      lines.push('🧪 Bahan:')
      if(materials.length)lines.push(...materials.map(materialLine))
      else lines.push('   -')
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
