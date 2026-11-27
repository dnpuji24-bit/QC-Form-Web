// Pure BKM aggregation. Work identity is never the editable WO label.
const text=v=>String(v??'').trim()
const key=v=>text(v).toUpperCase()
const n=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null
const sum=(rows,field)=>rows.reduce((a,r)=>a+(n(r[field])??0),0)
const unique=rows=>[...new Map(rows.filter(r=>r.id).map(r=>[r.id,r])).values()]
const pid=r=>key(r.pid||r.paddockRaw)
const line=r=>text(r.monthlyPlanLineId||r.planLineId||r.planCode)
const label=r=>key(r.operationCode)||key(r.description||r.activity)
const company=r=>key(r.companyCode)
const qc=r=>key(r.sourceOrigin)==='QC'||!!r.qcRecordId
const cancelled=r=>r.cancelled===true||key(r.status).includes('CANCEL')
const actualKey=r=>text(r.qcRecordId)?'qc:'+text(r.qcRecordId)+'|'+text(r.qcWorkId||r.id):'actual:'+text(r.actualReportId||r.id)
const identity=r=>JSON.stringify([company(r),pid(r),line(r)?'monthly:'+line(r):'daily:'+text(r.dailyPlanId||r.id),label(r)])
export function buildBkmCandidates({date,daily=[],actual=[],history=[],monthly=[],paddocks=[],materials=[]}){
 const dailyById=new Map(daily.map(r=>[text(r.dailyPlanId||r.id),r]))
 const enrich=r=>{
  const d=dailyById.get(text(r.dailyPlanId))
  if(!d||pid(d)!==pid(r))return r
  return {...r,companyCode:r.companyCode||d.companyCode,operationCode:r.operationCode||d.operationCode,
   description:r.description||d.description,woNumber:r.woNumber||d.woNumber,monthlyPlanLineId:r.monthlyPlanLineId||d.monthlyPlanLineId}
 }
 const today=unique(actual).map(enrich).filter(r=>r.date===date&&!cancelled(r)&&pid(r)&&label(r))
 const all=unique([...history,...actual]).map(enrich).filter(r=>r.date&&r.date<=date&&!cancelled(r))
 const groups=new Map()
 for(const row of [...daily.filter(r=>r.date===date&&!cancelled(r)),...today]){
  if(!pid(row)||!label(row)||!company(row))continue
  const id=identity(row)
  if(!groups.has(id))groups.set(id,row)
 }
 const out=[]
 for(const [id,source] of groups){
  const base=identity(source)
  const matching=r=>identity(r)===base
  const current=today.filter(matching)
  const candidates=monthly.filter(m=>line(source)&&text(m.planLineId||m.planCode||m.id)===line(source)&&pid(m)===pid(source)&&(!company(m)||company(m)===company(source)))
  const targets=candidates.length===1?candidates:candidates.filter(m=>label(m)===label(source))
  const target=targets.length===1?targets[0]:null
  // Never sum a repeated WO across independent Monthly Plan lines.
  const related=line(source)?all.filter(r=>line(r)===line(source)&&pid(r)===pid(source)&&(!company(r)||company(r)===company(source))&&(label(r)===label(source)||(!r.operationCode&&key(r.description||r.activity)===key(source.description||source.activity)))):current
  const distinct=rows=>[...new Map(rows.map(r=>[actualKey(r),r])).values()]
  const hiRows=distinct(current),shiRows=distinct(related)
  const hasOverlap=rows=>{
   const seen=new Map()
   for(const r of rows){
    if(!text(r.dailyPlanId))continue
    const k=JSON.stringify([r.dailyPlanId,r.date,r.shift||r.dailyShift||''])
    const prev=seen.get(k)
    if(prev!==undefined&&prev!==qc(r))return true
    seen.set(k,qc(r))
   }
   return false
  }
  const conflict=hasOverlap(hiRows)||hasOverlap(shiRows)
  const master=paddocks.filter(p=>pid(p)===pid(source)&&(!company(p)||company(p)===company(source)))
  const area=master.length===1?n(master[0].areaPlantedHa):null
  const targetHa=target?n(target.targetAreaHa):null
  const hi=conflict?null:sum(hiRows,'actualAreaHa')
  const shi=conflict||!line(source)?null:sum(shiRows,'actualAreaHa')
  const hk=hiRows.length&&!hiRows.some(r=>qc(r)||n(r.manpower)===null||(r.workGroupId&&today.some(other=>other.workGroupId===r.workGroupId&&pid(other)!==pid(r))))?sum(hiRows,'manpower'):null
  const notes=[...new Set(hiRows.map(r=>text(r.notes)).filter(Boolean))]
  const mMap=new Map()
  if(!conflict){
   for(const r of shiRows.filter(qc)){
    for(const m of Array.isArray(r.materials)?r.materials:[]){
     // Existing single-paddock QC payloads may be plan dose × actual area.
     // Only explicit multi-paddock allocations carry a measured source filling ID.
     if(!text(m.sourceFillingId))continue
     const name=text(m.material||m.materialName),unit=text(m.unit||m.doseUnit),qty=n(m.totalMaterial)
     if(!name||!unit||qty===null)continue
     const k=JSON.stringify([key(name),key(unit)])
     const masterMatch=materials.filter(x=>key(x.materialName)===key(name)&&key(x.unit)===key(unit))
     const code=masterMatch.length===1?text(masterMatch[0].materialCode||masterMatch[0].materialNumber||masterMatch[0].noMaterial):''
     const x=mMap.get(k)||{code,name,unit,hi:0,shi:line(source)?0:null}
     if(r.date===date)x.hi+=qty
     if(x.shi!==null)x.shi+=qty
     mMap.set(k,x)
    }
   }
  }
  const warnings=[]
  if(conflict)warnings.push('QC dan Actual manual tumpang tindih; rekonsiliasi dahulu')
  if(!line(source))warnings.push('Tidak ada identitas Monthly Plan; SHI tidak dihitung')
  if(line(source)&&!target)warnings.push('Target Monthly Plan tidak ditemukan atau ambigu')
  if(hk===null&&hiRows.length)warnings.push('HK aktual tidak lengkap (QC otomatis tidak mencatat HK)')
  if(shiRows.some(r=>Array.isArray(r.materials)&&r.materials.some(m=>!qc(r)||!text(m.sourceFillingId))))warnings.push('Sebagian material masih berbasis dosis; tidak dihitung sebagai penggunaan terverifikasi')
  if(master.length!==1)warnings.push('Luas Master Paddock tidak ditemukan atau ambigu')
  out.push({id,company:company(source),pid:pid(source),wo:text(source.woNumber||target?.woNumber),operationCode:text(source.operationCode||target?.operationCode),description:text(source.description||source.activity||target?.description),area,hk,uom:'Ha',target:targetHa,hi,shi,progress:shi!==null&&targetHa!==null&&targetHa>0?shi/targetHa*100:null,notes:notes.join(' · '),warnings,conflict,actualIds:hiRows.map(r=>r.id),material:[...mMap.values()]})
 }
 return out.sort((a,b)=>a.pid.localeCompare(b.pid,undefined,{numeric:true})||a.description.localeCompare(b.description))
}
export function bkmAvailableCandidates(candidates,companyCode,wo,selectedIds=[],currentId=''){
 return candidates.filter(c=>c.company===key(companyCode)&&(!text(wo)||key(c.wo)===key(wo))&&(!selectedIds.includes(c.id)||c.id===currentId))
}
