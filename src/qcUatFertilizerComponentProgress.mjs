// Isolated synthetic policy/read-model candidate; no production imports or I/O.
// Area and kg in integer hundredths. Current record snapshot only; no geometric coverage claim.
export function fertilizerComponentProgress(input){
 const need=(v,c)=>{if(!v)throw Error(c)}
 const exact=(v,ks)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_FIELDS')
 const sid=v=>{need(typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v),'INVALID_ID');return v}
 const qty=v=>{need(Number.isSafeInteger(v)&&v>=0&&v<=100000000,'INVALID_QUANTITY');return v}
 const list=(v,max=100)=>{need(Array.isArray(v)&&v.length<=max&&Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)).every(Boolean),'INVALID_LIST');return v}
 const unique=(v,key)=>{need(new Set(v.map(key)).size===v.length,'DUPLICATE_ID');return v}
 const date=v=>{need(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v,'INVALID_DATE');return v}
 const name=v=>{need(typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=160,'INVALID_NAME');return v}
 const norm=v=>name(v).toLowerCase().replace(/\s+/g,' ')
 const shift=v=>{need(['1','2'].includes(v),'INVALID_SHIFT');return v}
 const component=c=>{exact(c,['componentId','targetArea100','targetDoseKgHa']);sid(c.componentId);need(qty(c.targetArea100)>0,'INVALID_TARGET');need(typeof c.targetDoseKgHa==='number'&&Number.isFinite(c.targetDoseKgHa)&&c.targetDoseKgHa>0&&c.targetDoseKgHa<=100000,'INVALID_DOSE');return c}
 const components=v=>{const cs=unique(list(v,20).map(component),c=>c.componentId);need(cs.length>0,'EMPTY_COMPONENTS');return cs}
 exact(input,['testOnly','monthlyPlans','dailyPlans','products','records']);need(input.testOnly===true,'SYNTHETIC_ONLY')
 const mp=unique(list(input.monthlyPlans).map(p=>{exact(p,['id','pid','components']);sid(p.id);sid(p.pid);components(p.components);return p}),p=>p.id)
 const mBy=new Map(mp.map(p=>[p.id,p]))
 const dp=unique(list(input.dailyPlans).map(p=>{exact(p,['id','monthlyPlanLineId','pid','date','shift','foreman','components']);sid(p.id);sid(p.pid);date(p.date);shift(p.shift);name(p.foreman);components(p.components);if(p.monthlyPlanLineId!==''){sid(p.monthlyPlanLineId);const m=mBy.get(p.monthlyPlanLineId);need(m&&m.pid===p.pid,'MONTHLY_SOURCE_MISMATCH');for(const c of p.components){const mc=m.components.find(x=>x.componentId===c.componentId);need(mc&&mc.targetDoseKgHa===c.targetDoseKgHa,'MONTHLY_COMPONENT_MISMATCH')}}return p}),p=>p.id)
 const dBy=new Map(dp.map(p=>[p.id,p]))
 const products=unique(list(input.products).map(p=>{exact(p,['id','componentId','active']);sid(p.id);sid(p.componentId);need(typeof p.active==='boolean','INVALID_PRODUCT');return p}),p=>p.id)
 const pBy=new Map(products.map(p=>[p.id,p]))
 const records=unique(list(input.records).map(r=>{
  exact(r,['id','revision','dailyPlanId','monthlyPlanLineId','pid','date','shift','foreman','saveType','fillings'])
  sid(r.id);sid(r.revision);sid(r.dailyPlanId);sid(r.pid);date(r.date);shift(r.shift);name(r.foreman)
  need(['draft','ready','uploaded'].includes(r.saveType),'INVALID_STATUS')
  const p=dBy.get(r.dailyPlanId)
  need(p&&p.monthlyPlanLineId===r.monthlyPlanLineId&&p.pid===r.pid&&p.date===r.date,'DAILY_SOURCE_MISMATCH')
  need((p.shift===r.shift&&norm(p.foreman)===norm(r.foreman))||(p.shift==='1'&&r.shift==='2'),'SOURCE_SESSION_DENIED')
  const fs=unique(list(r.fillings).map(f=>{
   exact(f,['id','componentId','productId','area100','kg100']);sid(f.id);sid(f.componentId);sid(f.productId);qty(f.area100);qty(f.kg100)
   const product=pBy.get(f.productId)
   need(product&&product.componentId===f.componentId&&p.components.some(c=>c.componentId===f.componentId),'PRODUCT_COMPONENT_MISMATCH')
   // Historical approved applications may use a product later deactivated;
   // active authorization for new writes belongs to the future server gate.
   if(r.saveType!=='draft')need(f.area100>0&&f.kg100>0,'READY_FILLING_REQUIRED')
   return f
  }),f=>f.id)
  if(r.saveType!=='draft')need(fs.length>0,'READY_FILLING_REQUIRED')
  return r
 }),r=>r.id)
 const actual=records.filter(r=>r.saveType!=='draft')
 const summarize=(p,linked)=>{
  const rows=p.components.map(c=>{
   const fs=linked.flatMap(r=>r.fillings.filter(f=>f.componentId===c.componentId).map(f=>({...f,shift:r.shift})))
   const area=fs.reduce((s,f)=>s+f.area100,0),kg=fs.reduce((s,f)=>s+f.kg100,0),signed=c.targetArea100-area
   return {...c,actualArea100:area,actualKg100:kg,estimatedKg100:Math.round(c.targetDoseKgHa*area),weightedDoseKgHa:area?kg/area:null,signedBalance100:signed,remainingArea100:Math.max(signed,0),overArea100:Math.max(-signed,0),progressPct:area/c.targetArea100*100,done:signed<=0,actualByShift100:{'1':fs.filter(f=>f.shift==='1').reduce((s,f)=>s+f.area100,0),'2':fs.filter(f=>f.shift==='2').reduce((s,f)=>s+f.area100,0)}}
  })
  const done=rows.every(c=>c.done)
  return {id:p.id,components:rows,done,status:done?'DONE':rows.some(c=>c.actualArea100>0)?'ON PROGRESS':'PLANNED',limitingProgressPct:Math.min(...rows.map(c=>c.progressPct)),applicationArea100:rows.reduce((s,c)=>s+c.actualArea100,0),applicationTargetArea100:rows.reduce((s,c)=>s+c.targetArea100,0),actualKg100:rows.reduce((s,c)=>s+c.actualKg100,0)}
 }
 return {daily:dp.map(p=>summarize(p,actual.filter(r=>r.dailyPlanId===p.id))),monthly:mp.map(p=>summarize(p,actual.filter(r=>r.monthlyPlanLineId===p.id))),adhocActualIds:actual.filter(r=>r.monthlyPlanLineId==='').map(r=>r.id)}
}
