// Isolated read-model candidate. No SDK, writes, production import, or balance cap.
// Input is a current synthetic Actual snapshot in integer hundredths of hectares.
function check(ok,code){if(!ok)throw Error(code)}
function sid(v){check(typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v),'INVALID_SYNTHETIC_ID');return v}
function area(v){check(Number.isSafeInteger(v)&&v>=0&&v<=10000000,'INVALID_AREA100');return v}
function list(v){check(Array.isArray(v)&&v.length<=100,'INVALID_LIST');return v}
function unique(rows){check(new Set(rows.map(r=>r.id)).size===rows.length,'DUPLICATE_ID')}
export function dailySourceProgress(input){
 check(input?.testOnly===true,'SYNTHETIC_ONLY')
 const plans=list(input.dailyPlans),actual=list(input.actualReports)
 for(const p of plans){sid(p.id);area(p.targetArea100);check(['spray','fertilizer'].includes(p.kind),'INVALID_KIND');check(['1','2'].includes(p.shift),'INVALID_SHIFT')}
 for(const a of actual){sid(a.id);if(a.dailyPlanId!=='')sid(a.dailyPlanId);area(a.actualArea100);check(['1','2'].includes(a.shift),'INVALID_SHIFT');check(typeof a.foreman==='string'&&a.foreman.trim().length>0,'INVALID_FOREMAN')}
 unique(plans);unique(actual)
 const byId=new Map(plans.map(p=>[p.id,p]))
 const unresolvedActualIds=actual.filter(a=>!byId.has(a.dailyPlanId)).map(a=>a.id)
 const rows=plans.map(p=>{
  const linked=actual.filter(a=>a.dailyPlanId===p.id)
  const actualArea100=linked.reduce((s,a)=>s+a.actualArea100,0)
  const signedBalance100=p.targetArea100-actualArea100
  return {dailyPlanId:p.id,kind:p.kind,sourceShift:p.shift,targetArea100:p.targetArea100,actualArea100,signedBalance100,remainingArea100:Math.max(signedBalance100,0),overArea100:Math.max(-signedBalance100,0),progressPct:p.targetArea100?actualArea100/p.targetArea100*100:null,actualByShift100:{'1':linked.filter(a=>a.shift==='1').reduce((s,a)=>s+a.actualArea100,0),'2':linked.filter(a=>a.shift==='2').reduce((s,a)=>s+a.actualArea100,0)},actualIds:linked.map(a=>a.id)}
 })
 return {rows,unresolvedActualIds,totalTargetArea100:rows.reduce((s,r)=>s+r.targetArea100,0),totalLinkedActualArea100:rows.reduce((s,r)=>s+r.actualArea100,0)}
}
