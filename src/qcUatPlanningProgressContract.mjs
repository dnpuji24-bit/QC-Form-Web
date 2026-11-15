// Isolated synthetic read-model candidate. No SDK, network, writes or production imports.
// All areas are explicit integer hundredths of hectares; not a production migration mapper.
export function check(ok,code){if(!ok)throw Error(code)}

function obj(v,keys){check(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_FIELDS');return v}

function sid(v){check(typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v),'INVALID_SYNTHETIC_ID');return v}

function textValue(v){check(typeof v==='string'&&v.length<=160&&v===v.trim(),'INVALID_TEXT');return v}

function nonempty(v){check(textValue(v).length>0,'EMPTY_TEXT');return v}

function area100(v){check(Number.isSafeInteger(v)&&v>=0&&v<=10000000,'INVALID_AREA100');return v}

function list(v,fn){check(Array.isArray(v)&&v.length<=100&&Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)).every(Boolean),'INVALID_LIST');return v.map(fn)}

function unique(rows,key){check(new Set(rows.map(key)).size===rows.length,'DUPLICATE_ROW');return rows}

function bool(v){check(typeof v==='boolean','INVALID_BOOLEAN');return v}

function date(v){check(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v),'INVALID_DATE');const d=new Date(v+'T00:00:00Z');check(Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v,'INVALID_DATE');return v}

export function planningWeek(monthKey,week){check(typeof monthKey==='string'&&/^(20\d{2})-(0[1-9]|1[0-2])$/.test(monthKey),'INVALID_MONTH');check(['W1','W2','W3','W4'].includes(week),'INVALID_WEEK');const [y,m]=monthKey.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate(),[a,b]={W1:[1,7],W2:[8,15],W3:[16,22],W4:[23,last]}[week];return {startDate:monthKey+'-'+String(a).padStart(2,'0'),endDate:monthKey+'-'+String(b).padStart(2,'0')}}

export function varietySelection(paddock,selected){obj(paddock,['testOnly','pid','plantArea100','varieties']);check(paddock.testOnly===true,'SYNTHETIC_ONLY');sid(paddock.pid);const plantArea100=area100(paddock.plantArea100),rows=unique(list(paddock.varieties,r=>{obj(r,['name','area100']);return {name:nonempty(r.name),area100:area100(r.area100)}}),r=>r.name);check(rows.length>0&&rows.reduce((s,r)=>s+r.area100,0)===plantArea100,'VARIETY_TOTAL_MISMATCH');let names=unique(list(selected,nonempty),v=>v);if(!names.length&&rows.length===1)names=[rows[0].name];check(names.length>0,'VARIETY_SELECTION_REQUIRED');const details=names.map(n=>{const r=rows.find(r=>r.name===n);check(r,'UNKNOWN_VARIETY');return r});return {selectedVarieties:names,selectedVarietyDetails:details,selectedPlantArea100:details.reduce((s,r)=>s+r.area100,0)}}

function taskKey(v){return nonempty(v).toLowerCase().replace(/\s+/g,' ')}

function planRow(r){obj(r,['id','planLineId','pid','description','targetArea100','manualActualArea100','monthKey','week','cancelled','finished','sourceStatus']);const {startDate,endDate}=planningWeek(r.monthKey,r.week);check(area100(r.targetArea100)>0,'INVALID_TARGET');return {id:sid(r.id),planLineId:sid(r.planLineId),pid:sid(r.pid),description:nonempty(r.description),targetArea100:r.targetArea100,manualActualArea100:area100(r.manualActualArea100),monthKey:r.monthKey,week:r.week,startDate,endDate,cancelled:bool(r.cancelled)||textValue(r.sourceStatus).toUpperCase().includes('CANCEL'),finished:bool(r.finished)||textValue(r.sourceStatus).toUpperCase()==='FINISHED'}}

function dailyRow(r){obj(r,['id','monthlyPlanLineId','pid','description','area100','date','sourceType','monthlyLinkStatus']);check(['MONTHLY','ADHOC','SUPPORT'].includes(r.sourceType),'INVALID_SOURCE');check(r.sourceType==='MONTHLY'?r.monthlyLinkStatus==='LINKED'&&Boolean(r.monthlyPlanLineId):r.monthlyLinkStatus==='NOT_APPLICABLE'&&r.monthlyPlanLineId==='','INVALID_LINK');return {id:sid(r.id),monthlyPlanLineId:r.monthlyPlanLineId?sid(r.monthlyPlanLineId):'',pid:sid(r.pid),description:nonempty(r.description),area100:area100(r.area100),date:date(r.date),sourceType:r.sourceType}}

function actualRow(r){obj(r,['id','monthlyPlanLineId','pid','description','actualArea100']);return {id:sid(r.id),monthlyPlanLineId:r.monthlyPlanLineId?sid(r.monthlyPlanLineId):textValue(r.monthlyPlanLineId),pid:sid(r.pid),description:nonempty(r.description),actualArea100:area100(r.actualArea100)}}

function resolvePlan(plans,r){if(!r.monthlyPlanLineId)return null;const candidates=plans.filter(p=>p.planLineId===r.monthlyPlanLineId&&p.pid===r.pid);check(candidates.length>0,'MISSING_MONTHLY_LINK');if(candidates.length===1)return candidates[0];const matches=candidates.filter(p=>taskKey(p.description)===taskKey(r.description));check(matches.length===1,'AMBIGUOUS_MONTHLY_LINK');return matches[0]}

export function planningProgress(input){obj(input,['testOnly','monthlyPlans','dailyPlans','actualReports']);check(input.testOnly===true,'SYNTHETIC_ONLY');const plans=unique(list(input.monthlyPlans,planRow),p=>p.id),daily=unique(list(input.dailyPlans,dailyRow),r=>r.id),actual=unique(list(input.actualReports,actualRow),r=>r.id);const dailyLinks=daily.map(r=>[r,resolvePlan(plans,r)]),actualLinks=actual.map(r=>[r,resolvePlan(plans,r)]);return {rows:plans.map(p=>{const ds=dailyLinks.filter(([,plan])=>plan?.id===p.id).map(([r])=>r),as=actualLinks.filter(([,plan])=>plan?.id===p.id).map(([r])=>r);const scheduledArea100=ds.reduce((s,r)=>s+r.area100,0),linkedActualArea100=as.reduce((s,r)=>s+r.actualArea100,0),systemActualArea100=linkedActualArea100+p.manualActualArea100,closed=p.cancelled||p.finished,rawBalance100=p.targetArea100-systemActualArea100;return {...p,scheduledArea100,linkedActualArea100,systemActualArea100,rawBalance100,systemBalance100:closed?0:rawBalance100,unallocatedArea100:closed?0:p.targetArea100-scheduledArea100,progressPct:p.cancelled?100:systemActualArea100/p.targetArea100*100,systemStatus:closed?'DONE':systemActualArea100===0?'PLANNED':rawBalance100>0?'ON PROGRESS':rawBalance100===0?'DONE':'OVER ACTUAL',outOfPeriodDailyIds:ds.filter(r=>r.date<p.startDate||r.date>p.endDate).map(r=>r.id)}}),unlinkedDailyIds:dailyLinks.filter(([,p])=>!p).map(([r])=>r.id),unlinkedActualIds:actualLinks.filter(([,p])=>!p).map(([r])=>r.id)}}
