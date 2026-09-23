export type DailyPlanTransfer={
  dailyPlanId:string
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
function materialDose(m:DailyPlanTransfer['materials'][number]){
  const doseUnit=m.doseUnit||m.unit||''
  const totalUnit=m.unit||m.doseUnit||''
  return `   - ${m.material}: ${n(m.dosePerHa)} ${doseUnit}/Ha (Tot: ${n(m.totalMaterial)} ${totalUnit})`
}

export function dailyPlansToWhatsApp(rows:DailyPlanTransfer[]){
  const sorted=[...rows].sort((a,b)=>a.date.localeCompare(b.date)||a.shift.localeCompare(b.shift,undefined,{numeric:true})||a.activity.localeCompare(b.activity))
  if(!sorted.length)return''
  const dates=[...new Set(sorted.map(x=>x.date))]
  const lines:string[]=['*DAILY PLANNING*',`📅 *Tanggal:* ${dates.length===1?dates[0]:dates.join(', ')}`,'────────────────────']
  let number=0
  const shifts=[...new Set(sorted.map(x=>x.shift||'-'))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
  for(const shift of shifts){
    lines.push('',`*=== SHIFT ${shift} ===*`,'')
    for(const row of sorted.filter(x=>(x.shift||'-')===shift)){
      number++
      const title=(row.activity||row.description||'KEGIATAN').toUpperCase()
      lines.push(`*${number}. ${title} (${n(row.areaHa)} Ha)*`)
      lines.push(`📍 Pdk: ${row.pid||'-'} (${n(row.areaHa)} Ha)`)
      lines.push(`👷 Mandor: ${row.foreman||'-'}`)
      lines.push(`👷 HK: ${n(row.manpower)} | 🚜 Alat: ${row.unitName||'-'}`)
      lines.push(`⚙️ Stat: 🟢${n(row.unitReady)} | 🔴${n(row.unitBreakdown)} | 🟡${n(row.unitStandby)}`)
      lines.push('🧪 Bahan:')
      if(row.materials.length)lines.push(...row.materials.map(materialDose))
      else lines.push('   -')
      lines.push(`ℹ️ Ket: ${row.notes||'-'}`,'')
    }
  }
  const totalArea=sorted.reduce((s,x)=>s+x.areaHa,0)
  const totalHk=sorted.reduce((s,x)=>s+x.manpower,0)
  lines.push('────────────────────',`📊 *Total:* ${sorted.length} pekerjaan | ${n(totalArea)} Ha | HK ${n(totalHk)}`)
  return lines.join('\n')
}
