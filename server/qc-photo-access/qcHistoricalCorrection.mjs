// Historical corrections: trusted Owner, explicit version, narrow field allowlist.
const norm=v=>String(v??'').trim().toLowerCase()
const valid=(v,n)=>typeof v==='string'&&v.length<=n&&/^[A-Za-z0-9_-]+$/.test(v)
const round=(v,n=2)=>Number(v.toFixed(n))
const num=v=>{if((typeof v!=='number'&&typeof v!=='string')||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<0)throw Error('QC_HISTORICAL_INVALID_DATA');return Number(v)}
const optional=v=>v===undefined||v===null||v===''?0:num(v)
const areaOf=r=>num(r.actualAreaHa??r.area??r.resultArea)
const version=s=>s.updateTime.seconds+':'+s.updateTime.nanoseconds
function checkRow(s,id){
 if(!s.exists)throw Error('QC_HISTORICAL_CONFLICT')
 const r=s.data()
 if((r.id&&r.id!==id)||id.startsWith('qc-v2-')||r.operationalSaveId||r.operationalPhotoManifest||r.saveType!=='uploaded'||!['spray','fertilizer'].includes(r.formType))throw Error('QC_HISTORICAL_REVIEW_REQUIRED')
 return r
}
export function historicalPatch(row,changes){
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||!Object.keys(changes).length)throw Error('INVALID_COMMAND')
 const keys=Object.keys(changes),allowed=row.formType==='spray'?['note','area']:['note','fillings']
 if(keys.some(k=>!allowed.includes(k)))throw Error('INVALID_COMMAND')
 const p={}
 if('note'in changes){
  if(typeof changes.note!=='string'||changes.note.length>2000||changes.note.includes('[UNIT BERHENTI]'))throw Error('INVALID_COMMAND')
  if(row.formType==='fertilizer'){
   const suffix=String(row.catatan||row.noted||'').match(/(?:^|\s*\|\s*)\[UNIT BERHENTI\].*$/is)?.[0]?.replace(/^\s*\|\s*/,'')||''
   p.catatan=[changes.note.trim(),suffix].filter(Boolean).join(' | ');p.noted=p.catatan
  }else p.noted=changes.note.trim()
 }
 if('area'in changes||'fillings'in changes){
  let area
  if(row.formType==='spray'){
   area=num(changes.area);if(area<=0)throw Error('QC_HISTORICAL_INVALID_DATA')
   p.area=String(area)
   if('resultArea'in row)p.resultArea=area
   for(let i=1;i<=4;i++)if(row['pesticide'+i])p['estUsagePesticide'+i]=(num(row['dosage'+i])*area).toFixed(2)
   p.estUsageAdjuvant=(optional(row.adjuvantDosage)*optional(row.waterRate)*area/1000).toFixed(2)
  }else{
   if(!Array.isArray(row.pengisianList)||!row.pengisianList.length||!Array.isArray(changes.fillings)||changes.fillings.length!==row.pengisianList.length||changes.fillings.length>100)throw Error('QC_HISTORICAL_INVALID_DATA')
   p.pengisianList=row.pengisianList.map((old,i)=>{
    const f=changes.fillings[i]
    if(!f||typeof f!=='object'||Object.keys(f).sort().join(',')!=='hasilKerja,jumlah')throw Error('INVALID_COMMAND')
    const jumlah=num(f.jumlah),hasilKerja=num(f.hasilKerja)
    return {...old,jumlah,hasilKerja,dosisAktual:hasilKerja>0?round(jumlah/hasilKerja):0}
   })
   area=p.pengisianList.reduce((a,f)=>a+f.hasilKerja,0)
   if(area<=0)throw Error('QC_HISTORICAL_INVALID_DATA')
   const doses=p.pengisianList.map(f=>f.dosisAktual).filter(v=>v>0)
   p.averageActualDosage=doses.length?round(doses.reduce((a,b)=>a+b,0)/doses.length):0
   p.weightedActualDosage=round(p.pengisianList.reduce((a,f)=>a+f.jumlah,0)/area)
   if('area'in row)p.area=area
   if('resultArea'in row)p.resultArea=area
  }
  p.actualAreaHa=area
  const minutes=optional(row.effectiveWorkingMinutes)
  p.productivityHaPerHour=minutes>0?round(area/(minutes/60)):0
  if(row.actualPlanMaterials!==undefined){
   if(!Array.isArray(row.actualPlanMaterials))throw Error('QC_HISTORICAL_INVALID_DATA')
   p.actualPlanMaterials=row.actualPlanMaterials.map(m=>({...m,totalMaterial:round(num(m.dosePerHa)*area,4)}))
  }
 }
 return p
}
async function requireOwner(tx,db,actor){
 const p=(await tx.get(db.collection('users').doc(actor.uid))).data()
 if(!p||p.role!=='owner'||p.active!==true||p.status!=='approved'||!actor.email||norm(p.email)!==norm(actor.email))throw Error('OWNER_REQUIRED')
 return p
}
export async function historicalQc({db,actor,command,stamp}){
 const {recordId,operationId,baseVersion,reason,changes}=command
 if(!valid(recordId,160))throw Error('INVALID_COMMAND')
 return db.runTransaction(async tx=>{
  const profile=await requireOwner(tx,db,actor)
  const q=db.collection('qc_records').doc(recordId),a=db.collection('daily_reports').doc('qcactual_'+recordId)
  const marker=db.collection('qc_historical_correction_locks').doc(recordId)
  const qs=await tx.get(q),r=checkRow(qs,recordId)
  if(command.action==='previewHistoricalQc'){
   return {ok:true,version:version(qs),record:{id:recordId,formType:r.formType,paddock:r.paddock||'',date:r.date||'',note:String(r.noted||r.catatan||''),area:areaOf(r),fillings:Array.isArray(r.pengisianList)?r.pengisianList.map(f=>({jumlah:f.jumlah,hasilKerja:f.hasilKerja,jenisPupuk:f.jenisPupuk||''})):[]}}
  }
  if(command.action!=='correctHistoricalQc'||!valid(operationId,100)||typeof baseVersion!=='string'||typeof reason!=='string'||reason.trim().length<5||reason.length>300)throw Error('INVALID_COMMAND')
  const log=db.collection('qc_admin_audit').doc('historical_'+operationId)
  const [as,ls,ms,linked]=await Promise.all([tx.get(a),tx.get(log),tx.get(marker),tx.get(db.collection('daily_reports').where('qcRecordId','==',recordId))])
  if(ls.exists){
   const l=ls.data()
   if(l.action==='correctHistoricalQc'&&l.target===recordId&&l.actorUid===actor.uid&&l.baseVersion===baseVersion&&l.reason===reason.trim()&&JSON.stringify(l.changes)===JSON.stringify(changes))return {ok:true,replayed:true}
   throw Error('QC_HISTORICAL_CONFLICT')
  }
  if(version(qs)!==baseVersion)throw Error('QC_REVISION_CONFLICT')
  const oldArea=areaOf(r),oldActual=as.exists?as.data():null
  if(linked.docs.some(d=>d.id!==a.id)||oldActual&&(oldActual.sourceOrigin!=='QC'||oldActual.qcRecordId!==recordId||String(oldActual.dailyPlanId||'')!==String(r.dailyPlanId||'')||num(oldActual.actualAreaHa)!==oldArea)||Boolean(r.dailyPlanId&&oldArea>0)!==Boolean(oldActual))throw Error('QC_ACTUAL_LINK_CONFLICT')
  const patch=historicalPatch(r,changes),next={...r,...patch},revision='historical_'+operationId
  const actualPatch={}
  if(oldActual){
   if('actualAreaHa'in patch){
    actualPatch.actualAreaHa=patch.actualAreaHa
    actualPatch.dailyVarianceHa=optional(oldActual.plannedDailyAreaHa??r.plannedDailyAreaHa)-patch.actualAreaHa
    if('actualPlanMaterials'in patch)actualPatch.materials=patch.actualPlanMaterials
    else if(Array.isArray(oldActual.materials)&&oldActual.materials.length)throw Error('QC_HISTORICAL_REVIEW_REQUIRED')
   }
   if('note'in changes)actualPatch.notes=['AUTO QC',r.formType.toUpperCase(),next.noted||next.catatan||''].filter(Boolean).join(' · ')
  }
  tx.update(q,{...patch,clientRevision:revision,updatedAt:stamp(),updatedBy:profile.username||actor.uid})
  if(oldActual)tx.update(a,{...actualPatch,updatedAt:stamp(),updatedBy:profile.username||actor.uid,lastModifiedSource:'QC_HISTORICAL_CORRECTION'})
  tx.set(marker,{recordId,lastOperationId:operationId,updatedAt:stamp()})
  tx.create(log,{action:'correctHistoricalQc',actorUid:actor.uid,target:recordId,reason:reason.trim(),baseVersion,revision,changes,before:Object.fromEntries(Object.keys(patch).map(k=>[k,r[k]??null])),after:patch,createdAt:stamp()})
  return {ok:true,replayed:false}
 })
}
