import type {SupportUnitRequirement} from './dailyUnitSupport'

export type DispatchUnitForWA={requirementId:string;unitCode:string;unitName:string}
export type DailyPlanTransfer={
  dailyPlanId:string
  workGroupId:string
  planningOrder:number
  date:string
  shift:string
  sourceType:string
  monthlyPlanLineId:string
  woNumber?:string
  plannedShift?:string
  coaCode?:string
  operationCode?:string
  companyCode:string
  farm:string
  pid:string
  activity:string
  description:string
  areaHa:number
  manpower:number
  unitName:string
  unitRequired?:number
  unitPreferredCodes?:string[]
  supportUnits?:SupportUnitRequirement[]
  dispatchUnits?:DispatchUnitForWA[]
  unitReady:number
  unitStandby:number
  unitBreakdown:number
  foreman:string
  notes:string
  pidNotes?:string
  department?:string
  materials:Array<{material:string;dosePerHa:number;doseUnit:string;totalMaterial:number;unit:string}>
}


function n(v:number){return new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(Number.isFinite(v)?v:0)}
function ha(v:number){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number.isFinite(v)?v:0)}
function tidy(v:unknown){return String(v??'').replace(/\s+/g,' ').trim()||'-'}
function groupKey(row:DailyPlanTransfer){return row.date+'|'+(row.shift||'-')+'|'+(row.workGroupId||row.dailyPlanId)}
function prettyDate(iso:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return tidy(iso)
  const date=new Date(iso+'T00:00:00Z')
  return Number.isNaN(date.getTime())?tidy(iso):
    new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date)
}
function field(label:string,value:string){return label.padEnd(14)+' : '+value}
function dosePerHaUnit(row:DailyPlanTransfer['materials'][number]){
  const unit=tidy(row.doseUnit||row.unit)
  return /\/\s*ha$/i.test(unit)?unit:unit==='-'?'-':unit+'/Ha'
}
function wrapText(value:string,width:number){
  const words=tidy(value).split(/\s+/)
  const lines:string[]=[]
  let current=''
  for(const word of words){
    let remaining=word
    while(remaining.length>width){
      if(current){lines.push(current);current=''}
      lines.push(remaining.slice(0,width))
      remaining=remaining.slice(width)
    }
    if(!remaining)continue
    if(!current)current=remaining
    else if(current.length+1+remaining.length<=width)current+=' '+remaining
    else{lines.push(current);current=remaining}
  }
  if(current)lines.push(current)
  return lines.length?lines:['-']
}
function twoColumns(left:string,right:string){
  const leftLines=wrapText(left,22),rightLines=wrapText(right,13)
  return Array.from({length:Math.max(leftLines.length,rightLines.length)},(_,index)=>
    (leftLines[index]||'').padEnd(22)+' │ '+(rightLines[index]||'')).map(line=>line.trimEnd())
}
function groupMaterials(rows:DailyPlanTransfer[]){
  const map=new Map<string,{material:string;unit:string;quantity:number}>()
  for(const row of rows)for(const m of row.materials){
    const material=tidy(m.material),unit=tidy(m.unit||m.doseUnit)
    const qty=Number(m.totalMaterial)
    if(material==='-'||!Number.isFinite(qty))continue
    const key=material.toLocaleLowerCase('id-ID')+'|'+unit.toLocaleLowerCase('id-ID')
    const current=map.get(key)
    if(current)current.quantity+=qty
    else map.set(key,{material,unit,quantity:qty})
  }
  return [...map.values()].sort((a,b)=>a.material.localeCompare(b.material,'id-ID'))
}

/** WhatsApp plain text with native bold and monospace tables.
 * Formatting only: does not modify saved Daily Plans or Firestore.
 */
export function dailyPlansToWhatsApp(rows:DailyPlanTransfer[]){
  const sorted=[...rows].sort((a,b)=>a.date.localeCompare(b.date)||
    a.shift.localeCompare(b.shift,undefined,{numeric:true})||
    (a.planningOrder||0)-(b.planningOrder||0)||
    a.pid.localeCompare(b.pid,undefined,{numeric:true}))
  if(!sorted.length)return ''
  const dates=[...new Set(sorted.map(row=>prettyDate(row.date)))]
  const lines:string[]=['*DAILY PLAN*','📅 Tanggal: '+dates.join(', ')]
  const departments=[...new Set(sorted.map(row=>tidy(row.department)).filter(dep=>dep!=='-'))]
  if(departments.length===1)lines.push('Departemen: '+departments[0])
  const shifts=[...new Set(sorted.map(row=>row.shift||'-'))]
    .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
  const mono=String.fromCharCode(96,96,96)
  let groupNumber=0
  const allGroups=new Map<string,DailyPlanTransfer[]>()
  for(const shift of shifts){
    const shiftRows=sorted.filter(row=>(row.shift||'-')===shift)
    const groups=new Map<string,DailyPlanTransfer[]>()
    for(const row of shiftRows){
      const key=groupKey(row)
      const group=groups.get(key)||[]
      group.push(row)
      groups.set(key,group)
      if(!allGroups.has(key))allGroups.set(key,group)
    }
    lines.push('','━━━━━━━━━━━━━━━━','*SHIFT KERJA '+shift+'*')
    for(const group of groups.values()){
      const first=group[0]
      const activity=tidy(first.activity||first.description).toUpperCase()
      const area=group.reduce((sum,row)=>sum+row.areaHa,0)
      const pids=new Set(group.map(row=>tidy(row.pid)))
      groupNumber++
      lines.push('','*'+String(groupNumber).padStart(2,'0')+'. '+activity+'*',
        'Total Rencana: *'+ha(area)+' Ha* · '+pids.size+' Paddock','')
      for(const [index,row] of group.entries()){
        if(index)lines.push('────────────────────','')
        lines.push('📍 *'+(index+1)+'. '+tidy(row.pid)+'*')
        const details:string[]=[]
        if(row.woNumber)details.push(field('WO',tidy(row.woNumber)))
        if(row.operationCode)details.push(field('Operation Code',tidy(row.operationCode)))
        if(row.coaCode)details.push(field('CoA',tidy(row.coaCode)))
        if(departments.length!==1&&row.department)details.push(field('Departemen',tidy(row.department)))
        details.push(field('Luas Rencana',ha(row.areaHa)+' Ha'))
        if(row.plannedShift)details.push(field('Shift WO',tidy(row.plannedShift)+' → Shift Kerja '+tidy(row.shift)))
        lines.push(mono,...details,mono)
        if(row.materials.length){
          lines.push('🧪 *MATERIAL & DOSIS*')
          for(const m of row.materials){
            lines.push('• '+tidy(m.material)+' : '+n(m.dosePerHa)+' '+dosePerHaUnit(m))
            lines.push('  Kebutuhan: '+n(m.totalMaterial)+' '+tidy(m.unit||m.doseUnit))
          }
        }
        if(row.pidNotes?.trim())lines.push('📝 Catatan PID: '+tidy(row.pidNotes))
        lines.push('')
      }
      lines.push('*RESOURCE OPERASIONAL*',mono,
        ...twoColumns('Mandor: '+tidy(first.foreman),'HK: '+n(first.manpower)),
        ...twoColumns('Unit: '+tidy(first.unitName),'Ready: '+n(first.unitReady)),
        ...twoColumns('Breakdown: '+n(first.unitBreakdown),'Standby: '+n(first.unitStandby)),
        mono)
      // Display physical unit codes as well as equipment names. Dispatch-confirmed
      // codes take priority; otherwise label Daily Plan selections as proposals.
      const dispatch=first.dispatchUnits||[]
      const selectedCodes=(requirementId:string,preferred:string[]=[])=>
        [...new Set(dispatch.filter(x=>x.requirementId===requirementId).map(x=>x.unitCode).filter(Boolean))]
          .sort((a,b)=>a.localeCompare(b,'id',{numeric:true}))
      const describe=(role:string,type:string,quantity:number,requirementId:string,preferred:string[],notes='')=>{
        if(!type.trim()&&quantity===0)return
        lines.push('• '+role+': '+tidy(type)+' — '+n(quantity)+' unit')
        const codes=selectedCodes(requirementId)
        if(codes.length)lines.push('  Kode: '+codes.join(', '))
        else if(preferred.length)lines.push('  Kode usulan: '+[...new Set(preferred)].join(', '))
        else lines.push('  Kode: belum ditentukan')
        if(notes.trim())lines.push('  Keterangan: '+tidy(notes))
      }
      lines.push('🚜 *DAFTAR UNIT & EQUIPMENT*')
      describe('Utama',first.unitName,first.unitRequired||0,'primary',first.unitPreferredCodes||[])
      for(const support of first.supportUnits||[]){
        describe('Support',support.unitName,support.unitRequired,'support:'+support.id,
          support.unitPreferredCodes,support.notes)
      }
      if(first.notes?.trim())lines.push('📝 Catatan: '+tidy(first.notes))
      lines.push('')
    }
  }
  const totalArea=sorted.reduce((sum,row)=>sum+row.areaHa,0)
  const totalHk=[...allGroups.values()].reduce((sum,group)=>sum+group[0].manpower,0)
  const distinctActivities=new Set([...allGroups.values()].map(group=>tidy(group[0].activity||group[0].description).toLocaleLowerCase('id-ID')))
  const distinctWos=new Set(sorted.map(row=>tidy(row.woNumber)).filter(wo=>wo!=='-'))
  const distinctPids=new Set(sorted.map(row=>tidy(row.pid)).filter(pid=>pid!=='-'))
  lines.push('━━━━━━━━━━━━━━━━',shifts.length===1?'*RINGKASAN SHIFT*':'*RINGKASAN DAILY PLAN*',
    mono,field('Total Activity',String(distinctActivities.size)),
    field('Total WO',String(distinctWos.size)),
    field('Total Paddock',String(distinctPids.size)),
    field('Total Luas',ha(totalArea)+' Ha'),
    field('Total HK',n(totalHk)),mono)
  const materials=groupMaterials(sorted)
  if(materials.length){
    lines.push('','*TOTAL MATERIAL*')
    for(const item of materials)lines.push('• '+item.material+' : *'+n(item.quantity)+' '+item.unit+'*')
  }
  return lines.join('\n').trim()
}
