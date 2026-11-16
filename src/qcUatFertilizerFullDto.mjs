// Isolated synthetic full Fertilizer DTO candidate. No production import or I/O.
const need=(ok,code)=>{if(!ok)throw Error(code)}
const plain=o=>o!==null&&typeof o==='object'&&Object.getPrototypeOf(o)===Object.prototype
const exact=(o,keys)=>need(plain(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k)),'INVALID_FIELDS')
const key=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ')
const nn=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0
const near=(a,b)=>nn(a)&&nn(b)&&Math.abs(a-b)<1e-8
const round=v=>Math.round(v*100)/100
const clock=v=>{need(typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v),'INVALID_CLOCK');return Number(v.slice(0,2))*60+Number(v.slice(3))}
const strings=['id','sessionId','formType','date','shift','name','nameOfAssistan','status','dailyPlanId','monthlyPlanLineId','dailyPlanLinkStatus','dailyPlanSourceType','companyCode','farm','startTime','endTime','paddock','unit','noUnit','type','activity','jenisPupuk','statusHose','catatan','noted','photoBase64','photoDriveUrl','scanReportPhotoBase64','scanReportDriveUrl','scanRawText','scanSourceFileName','scanAppliedAt','saveType','inputtedBy','ownerUid','createdAt','clientRevision']
const nums=['plannedDailyAreaHa','actualAreaHa','dailyPlanningOrder','workingDurationMinutes','holdTotalMinutes','effectiveWorkingMinutes','productivityHaPerHour','dosis','scanConfidence','averageActualDosage','weightedActualDosage']
export function summarizeFertilizerFillings(fills){
 need(Array.isArray(fills)&&fills.length>=1&&fills.length<=100,'INVALID_FILLINGS')
 const seen=new Set()
 for(const f of fills){
  exact(f,['pengisianKe','dosis','statusHose','jenisPupuk','jumlah','hasilKerja','dosisAktual','pemerataanPupuk'])
  need(Number.isSafeInteger(f.pengisianKe)&&f.pengisianKe>0&&!seen.has(f.pengisianKe),'INVALID_FILLING_ID');seen.add(f.pengisianKe)
  for(const k of ['dosis','jumlah','hasilKerja','dosisAktual'])need(nn(f[k]),'INVALID_FILLING_NUMBER')
  for(const k of ['statusHose','jenisPupuk','pemerataanPupuk'])need(typeof f[k]==='string'&&f[k].length<=2000,'INVALID_FILLING_TEXT')
  need(near(f.dosisAktual,f.hasilKerja>0?round(f.jumlah/f.hasilKerja):0),'FILLING_DOSE_MISMATCH')
 }
 const kg=fills.reduce((s,f)=>s+f.jumlah,0),ha=fills.reduce((s,f)=>s+f.hasilKerja,0)
 const doses=fills.map(f=>f.dosisAktual).filter(v=>v>0)
 const brands=new Set(fills.map(f=>key(f.jenisPupuk)).filter(Boolean))
 return {kg,ha,average:doses.length?round(doses.reduce((s,v)=>s+v,0)/doses.length):0,weighted:ha?round(kg/ha):0,distinctProducts:brands.size}
}
export function validateFertilizerDto(r,dp){
 exact(r,['testOnly',...strings,...nums,'pengisianList','downtimeList','holdIntervals','actualPlanMaterials'])
 need(r.testOnly===true&&r.formType==='fertilizer','SYNTHETIC_FERTILIZER_ONLY')
 for(const k of strings)need(typeof r[k]==='string'&&r[k].length<=(k.endsWith('Base64')?2800000:k==='scanRawText'?12000:20000),'INVALID_TEXT_'+k)
 for(const k of nums)need(nn(r[k]),'INVALID_NUMBER_'+k)
 need(/^qc-v2-uat-[a-z0-9-]{1,100}$/.test(r.id)&&[r.sessionId,r.ownerUid,r.clientRevision].every(v=>/^uat-[a-z0-9-]{1,60}$/.test(v)),'SYNTHETIC_ID_REQUIRED')
 need(r.inputtedBy===r.ownerUid,'OWNER_MISMATCH')
 need(['draft','ready','uploaded'].includes(r.saveType)&&r.status==='Working','INVALID_STATUS')
 need(/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&Number.isFinite(Date.parse(r.createdAt)),'INVALID_DATE')
 need(['1','2'].includes(r.shift)&&key(r.name),'INVALID_EXECUTOR')
 need(dp?.testOnly===true&&dp.kind==='fertilizer'&&['1','2'].includes(dp.shift)&&key(dp.foreman)&&r.dailyPlanId===dp.dailyPlanId&&r.monthlyPlanLineId===dp.monthlyPlanLineId&&r.date===dp.date&&r.paddock===dp.pid&&r.activity===dp.activity&&r.type===dp.type&&r.companyCode===dp.companyCode&&r.farm===dp.farm&&r.dailyPlanSourceType===dp.sourceType&&r.dailyPlanningOrder===dp.planningOrder&&r.plannedDailyAreaHa===dp.areaHa&&r.dailyPlanLinkStatus==='LINKED','SOURCE_DP_MISMATCH')
 need((dp.shift===r.shift&&key(dp.foreman)===key(r.name))||(dp.shift==='1'&&r.shift==='2'),'SOURCE_SESSION_DENIED')
 const s=summarizeFertilizerFillings(r.pengisianList),first=r.pengisianList[0]
 need(r.jenisPupuk===first.jenisPupuk&&r.dosis===first.dosis&&r.statusHose===first.statusHose,'FIRST_FILLING_MISMATCH')
 need(near(r.actualAreaHa,s.ha)&&near(r.averageActualDosage,s.average)&&near(r.weightedActualDosage,s.weighted),'FILLING_TOTAL_MISMATCH')
 need(Array.isArray(dp.materials)&&Array.isArray(r.actualPlanMaterials)&&r.actualPlanMaterials.length===dp.materials.length&&dp.materials.length<=20,'MATERIAL_COUNT_MISMATCH')
 for(let i=0;i<dp.materials.length;i++){
  const m=dp.materials[i],a=r.actualPlanMaterials[i];exact(a,['material','dosePerHa','doseUnit','unit','totalMaterial'])
  need(a.material===m.material&&a.dosePerHa===m.dosePerHa&&a.doseUnit===m.doseUnit&&a.unit===m.unit&&near(a.totalMaterial,Number((m.dosePerHa*r.actualAreaHa).toFixed(4))),'PLANNED_MATERIAL_ESTIMATE_MISMATCH')
 }
 need(Array.isArray(r.holdIntervals)&&Array.isArray(r.downtimeList)&&r.holdIntervals.length<=20&&r.downtimeList.length===r.holdIntervals.length,'INVALID_HOLDS')
 const ids=new Set()
 for(let i=0;i<r.holdIntervals.length;i++){
  const h=r.holdIntervals[i],d=r.downtimeList[i]
  exact(h,['holdId','start','end','reason','windSpeed','note','photoBase64','photoDriveUrl'])
  need(typeof h.holdId==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(h.holdId)&&!ids.has(h.holdId),'INVALID_HOLD_ID');ids.add(h.holdId)
  for(const k of ['start','end','reason','windSpeed','note','photoBase64','photoDriveUrl'])need(typeof h[k]==='string','INVALID_HOLD_FIELD')
  need(plain(d)&&Object.keys(d).every(k=>['id','issue','start','end','note','photoDriveUrl'].includes(k))&&d.id===h.holdId&&d.issue===h.reason&&d.start===h.start&&d.end===h.end&&d.note===h.note,'DOWNTIME_MISMATCH')
 }
 if(r.saveType!=='draft'){
  need(s.ha>0&&key(r.unit)&&key(r.noUnit)&&r.pengisianList.every(f=>key(f.jenisPupuk)&&f.dosis>0&&f.jumlah>0&&f.hasilKerja>0),'READY_FIELDS_REQUIRED')
  // Conservative gate only: the existing DTO cannot identify overlapping physical areas.
  // Do not claim mixed products or multi-component plans are safe to commit.
  need(s.distinctProducts===1&&dp.materials.length===1,'MIXED_AREA_POLICY_UNRESOLVED')
  const start=clock(r.startTime),rawEnd=clock(r.endTime),end=rawEnd<start?rawEnd+1440:rawEnd
  need(end>start,'INVALID_WORKING')
  const day=t=>{const v=clock(t);return rawEnd<start&&v<start?v+1440:v}
  const ranges=r.holdIntervals.filter(h=>h.start||h.end).map(h=>[day(h.start),day(h.end)]).sort((a,b)=>a[0]-b[0])
  for(let i=0;i<ranges.length;i++){const [a,b]=ranges[i];need(a>=start&&b<=end&&b>a&&(!i||a>=ranges[i-1][1]),'INVALID_HOLD_RANGE')}
  const hold=ranges.reduce((s,[a,b])=>s+b-a,0),effective=end-start-hold
  need(effective>0&&r.workingDurationMinutes===end-start&&r.holdTotalMinutes===hold&&r.effectiveWorkingMinutes===effective&&near(r.productivityHaPerHour,round(r.actualAreaHa/(effective/60))),'TIMING_MISMATCH')
 }
 return r
}
