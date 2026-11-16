// Synthetic full-shape SprayForm DTO validation candidate; not production rules or authorization.
export const textFields=["id","sessionId","formType","date","shift","status","name","nameOfAssistan","dailyPlanId","monthlyPlanLineId","dailyPlanLinkStatus","dailyPlanSourceType","companyCode","farm","startTime","endTime","unit","noUnit","area","activity","deskripsi","paddock","variety","type","dropper","nozzle","dropletSize","height","rowSpacing","speed","adjuvant","adjuvantDosage","actUsageAdjuvant","waterRate","waterQuality","actualUsage","windSpeed","temperature","humidity","deltaT","weatherCondition","noted","saveType","inputtedBy","ownerUid","createdAt","clientRevision","photoBase64","photoDriveUrl","estUsageAdjuvant"]
export const numberFields=["plannedDailyAreaHa","actualAreaHa","dailyPlanningOrder","workingDurationMinutes","holdTotalMinutes","effectiveWorkingMinutes","productivityHaPerHour"]
function need(v,code){if(!v)throw Error(code)}
function dec(v){if(v==='')return 0;if(typeof v==='string'&&/^\d+(?:[.,]\d+)?$/.test(v))return Number(v.replace(',','.'));if(typeof v==='number'&&Number.isFinite(v)&&v>=0)return v;throw Error('INVALID_DECIMAL')}
function near(a,b){return Math.abs(a-b)<1e-8}
function key(v){return String(v??'').trim().toLowerCase().replace(/\s+/g,' ')}
function clock(v){need(typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v),'INVALID_CLOCK');return Number(v.slice(0,2))*60+Number(v.slice(3))}
function exact(o,keys){need(o&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k)),'INVALID_FIELDS')}
export function validateSprayDto(r,dp){
 const slots=[1,2,3,4].flatMap(i=>['pesticide'+i,'dosage'+i,'estUsagePesticide'+i,'actUsagePesticide'+i])
 exact(r,['testOnly',...textFields,...numberFields,'actualPlanMaterials','holdIntervals',...slots])
 need(r.testOnly===true&&r.formType==='spray','SYNTHETIC_SPRAY_ONLY')
 for(const k of textFields)need(typeof r[k]==='string'&&r[k].length<=(k==='photoBase64'?2700000:2000),'INVALID_TEXT_'+k)
 for(const k of numberFields)need(Number.isFinite(r[k])&&r[k]>=0,'INVALID_NUMBER_'+k)
 need(/^qc-v2-uat-[a-z0-9-]{1,100}$/.test(r.id)&&/^uat-[a-z0-9-]{1,60}$/.test(r.ownerUid)&&/^uat-[a-z0-9-]{1,60}$/.test(r.clientRevision)&&/^uat-[a-z0-9-]{1,60}$/.test(r.sessionId),'SYNTHETIC_ID_REQUIRED')
 need(r.inputtedBy===r.ownerUid,'OWNER_MISMATCH')
 need(['draft','ready','uploaded'].includes(r.saveType)&&r.status==='Working','INVALID_STATUS')
 need(/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&Number.isFinite(Date.parse(r.createdAt)),'INVALID_DATE')
 need(['1','2'].includes(r.shift)&&key(r.name)&&key(r.nameOfAssistan),'INVALID_EXECUTOR')
 need(dp?.testOnly===true&&dp.kind==='spray'&&['1','2'].includes(dp.shift)&&key(dp.foreman)&&r.dailyPlanId===dp.dailyPlanId&&r.monthlyPlanLineId===dp.monthlyPlanLineId&&r.date===dp.date&&r.paddock===dp.pid&&r.activity===dp.activity&&r.deskripsi===dp.description&&r.variety===dp.masterVariety&&r.type===dp.type&&r.companyCode===dp.companyCode&&r.farm===dp.farm&&r.dailyPlanSourceType===dp.sourceType&&r.dailyPlanningOrder===dp.planningOrder&&r.plannedDailyAreaHa===dp.areaHa&&r.dailyPlanLinkStatus==='LINKED','SOURCE_DP_MISMATCH')
 need((dp.shift===r.shift&&key(dp.foreman)===key(r.name))||(dp.shift==='1'&&r.shift==='2'),'SOURCE_SESSION_DENIED')
 need(near(dec(r.area),r.actualAreaHa),'AREA_MISMATCH')
 need(Array.isArray(r.actualPlanMaterials)&&Array.isArray(dp.materials)&&r.actualPlanMaterials.length===dp.materials.length&&dp.materials.length<=20,'MATERIAL_COUNT_MISMATCH')
 for(let i=0;i<dp.materials.length;i++){
  const m=dp.materials[i],a=r.actualPlanMaterials[i];exact(a,['material','dosePerHa','doseUnit','unit','totalMaterial'])
  need(a.material===m.material&&a.dosePerHa===m.dosePerHa&&a.doseUnit===m.doseUnit&&a.unit===m.unit&&near(a.totalMaterial,Number((m.dosePerHa*r.actualAreaHa).toFixed(4))),'MATERIAL_MISMATCH')
 }
 for(let i=1;i<=4;i++){
  const m=dp.materials[i-1];need(r['pesticide'+i]===(m?.material||'')&&r['dosage'+i]===(m?.dosePerHa||'')&&r['estUsagePesticide'+i]===(m?(m.dosePerHa*r.actualAreaHa).toFixed(2):''),'PESTICIDE_SLOT_MISMATCH')
  dec(r['actUsagePesticide'+i])
 }
 need(r.estUsageAdjuvant===(dec(r.adjuvantDosage)*dec(r.waterRate)*r.actualAreaHa/1000).toFixed(2),'ADJUVANT_MISMATCH')
 need(Array.isArray(r.holdIntervals)&&r.holdIntervals.length<=20,'INVALID_HOLDS')
 const ids=new Set()
 for(const h of r.holdIntervals){exact(h,['holdId','start','end','reason','windSpeed','note','photoBase64','photoDriveUrl']);need(typeof h.holdId==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(h.holdId)&&!ids.has(h.holdId),'INVALID_HOLD_ID');ids.add(h.holdId);for(const k of ['start','end','reason','windSpeed','note','photoBase64','photoDriveUrl'])need(typeof h[k]==='string'&&h[k].length<=(k==='photoBase64'?2700000:2000),'INVALID_HOLD_FIELD')}
 if(r.saveType!=='draft'){
  need(r.actualAreaHa>0&&key(r.unit)&&key(r.noUnit),'READY_FIELDS_REQUIRED')
  const start=clock(r.startTime),rawEnd=clock(r.endTime),end=rawEnd<start?rawEnd+1440:rawEnd
  need(end>start,'INVALID_WORKING')
  const day=t=>{const v=clock(t);return rawEnd<start&&v<start?v+1440:v}
  const ranges=r.holdIntervals.filter(h=>h.start||h.end).map(h=>[day(h.start),day(h.end)]).sort((a,b)=>a[0]-b[0])
  for(let i=0;i<ranges.length;i++){const [a,b]=ranges[i];need(a>=start&&b<=end&&b>a&&(!i||a>=ranges[i-1][1]),'INVALID_HOLD_RANGE')}
  const total=ranges.reduce((s,[a,b])=>s+b-a,0),effective=end-start-total
  need(effective>0&&r.workingDurationMinutes===end-start&&r.holdTotalMinutes===total&&r.effectiveWorkingMinutes===effective&&near(r.productivityHaPerHour,Math.round(r.actualAreaHa/(effective/60)*100)/100),'TIMING_MISMATCH')
 }
 return r
}
