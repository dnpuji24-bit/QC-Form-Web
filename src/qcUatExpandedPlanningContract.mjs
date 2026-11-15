// Offline synthetic planning fixture candidate. No SDK, network, storage, or production import.
// These are proposed DTO checks, not operational policy or deployed Rules.
export function requireThat(ok,code){if(!ok)throw Error(code)}

function record(d,required,optional=[]){requireThat(d&&Object.getPrototypeOf(d)===Object.prototype,'INVALID_RECORD');const keys=Reflect.ownKeys(d);requireThat(required.every(k=>Object.hasOwn(d,k))&&keys.every(k=>typeof k==='string'&&[...required,...optional].includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(d,k),'value')),'INVALID_FIELDS');return d}

function label(v){requireThat(typeof v==='string'&&v.length>0&&v.length<=160&&v===v.trim(),'INVALID_LABEL');return v}

function id(v){requireThat(typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v),'INVALID_SYNTHETIC_ID');return v}

function flag(v){requireThat(typeof v==='boolean','INVALID_FLAG');return v}

function integer(v,min=0,max=100000){requireThat(Number.isSafeInteger(v)&&v>=min&&v<=max,'INVALID_INTEGER');return v}

function list(v,mapper){requireThat(Array.isArray(v)&&v.length<=100&&Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)).every(Boolean),'INVALID_LIST');return v.map(mapper)}

function unique(v,key){requireThat(new Set(v.map(key)).size===v.length,'DUPLICATE_KEY');return v}

export function hectares100(v){requireThat(typeof v==='number'||typeof v==='string','INVALID_HECTARES');const s=String(v);requireThat(/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(s),'UNREPRESENTABLE_HECTARES');const [whole,fraction='']=s.split('.');return integer(Number(whole)*100+Number(fraction.padEnd(2,'0')),0,100000)}

function alias(d,keys,mapper){const present=keys.filter(k=>Object.hasOwn(d,k));requireThat(present.length>0,'MISSING_ALIAS');const values=present.map(k=>mapper(d[k]));requireThat(values.every(v=>v===values[0]),'CONFLICTING_ALIAS');return values[0]}

function positive(v){requireThat(typeof v==='number'&&Number.isFinite(v)&&v>0,'INVALID_DOSE');return v}

function date(v){requireThat(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v),'INVALID_DATE');const t=new Date(v+'T00:00:00Z');requireThat(Number.isFinite(t.getTime())&&t.toISOString().slice(0,10)===v,'INVALID_DATE');return v}

function month(v){requireThat(typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v),'INVALID_MONTH');return v}

function company(d){record(d,['id','code','name','prefixes','active']);return {id:id(d.id),code:id(d.code),name:label(d.name),prefixes:unique(list(d.prefixes,id),v=>v),active:flag(d.active)}}

function paddock(d){record(d,['pid','companyCode','farm','variety','varietyBreakdown'],['stage','currentStage','areaPaddockHa','areaPlantedHa','plantAreaHa','varietyAreaTotalHa']);const areaPaddock100=alias(d,['areaPaddockHa','areaPlantedHa'],hectares100),plantArea100=alias(d,['plantAreaHa','varietyAreaTotalHa'],hectares100);const varietyBreakdown=unique(list(d.varietyBreakdown,v=>{record(v,['variety','areaHa']);return {variety:label(v.variety),area100:hectares100(v.areaHa)}}),v=>v.variety);requireThat(plantArea100<=areaPaddock100,'PLANTED_EXCEEDS_PADDOCK');requireThat(!varietyBreakdown.length||varietyBreakdown.reduce((s,v)=>s+v.area100,0)===plantArea100,'VARIETY_TOTAL_MISMATCH');return {pid:id(d.pid),companyCode:id(d.companyCode),farm:label(d.farm),variety:label(d.variety),stage:alias(d,['stage','currentStage'],label),areaPaddock100,plantArea100,varietyBreakdown}}

function material(d){record(d,['id','materialName','unit','active']);return {id:id(d.id),materialName:label(d.materialName),unit:label(d.unit),active:flag(d.active)}}

function activity(d){record(d,['id','activityCode','description','activity','type','activityCategory','companyScope','active','components']);return {id:id(d.id),activityCode:label(d.activityCode),description:label(d.description),activity:label(d.activity),type:label(d.type),activityCategory:label(d.activityCategory),companyScope:d.companyScope==='GLOBAL'?'GLOBAL':id(d.companyScope),active:flag(d.active),components:unique(list(d.components,c=>{record(c,['sequence','label','activeIngredient','dosePerHa','unit']);return {sequence:integer(c.sequence,1,100),label:label(c.label),activeIngredient:label(c.activeIngredient),dosePerHa:positive(c.dosePerHa),unit:label(c.unit)}}),c=>c.sequence)}}

function monthly(d){record(d,['planLineId','pid','companyCode','farm','activityId','activity','description','monthKey','year','week','startDate','endDate','targetAreaHa','actualAreaHa','balanceHa','manualActualAreaHa','cancelled','finished']);const monthKey=month(d.monthKey),startDate=date(d.startDate),endDate=date(d.endDate);requireThat(['W1','W2','W3','W4'].includes(d.week)&&d.year===Number(monthKey.slice(0,4))&&startDate.startsWith(monthKey)&&endDate.startsWith(monthKey)&&startDate<=endDate,'INVALID_PERIOD');const cancelled=flag(d.cancelled),finished=flag(d.finished);return {planLineId:id(d.planLineId),pid:id(d.pid),companyCode:id(d.companyCode),farm:label(d.farm),activityId:id(d.activityId),activity:label(d.activity),description:label(d.description),monthKey,year:d.year,week:d.week,startDate,endDate,targetArea100:integer(hectares100(d.targetAreaHa),1),actualArea100:hectares100(d.actualAreaHa),balanceArea100:hectares100(d.balanceHa),manualActualArea100:hectares100(d.manualActualAreaHa),cancelled,finished}}

function daily(d){record(d,['dailyPlanId','workGroupId','workGroupPidCount','planningOrder','sourceType','monthlyLinkStatus','monthlyPlanLineId','date','monthKey','shift','pid','activityId','activity','description','areaHa','foreman','manpower','unitName','unitReady','unitStandby','unitBreakdown','companyCode','farm','materials']);const day=date(d.date),monthKey=month(d.monthKey);requireThat(day.startsWith(monthKey),'INVALID_PERIOD');return {dailyPlanId:id(d.dailyPlanId),workGroupId:id(d.workGroupId),workGroupPidCount:integer(d.workGroupPidCount,1,100),planningOrder:integer(d.planningOrder,1),sourceType:label(d.sourceType),monthlyLinkStatus:label(d.monthlyLinkStatus),monthlyPlanLineId:id(d.monthlyPlanLineId),date:day,monthKey,shift:label(d.shift),pid:id(d.pid),activityId:id(d.activityId),activity:label(d.activity),description:label(d.description),area100:integer(hectares100(d.areaHa),1),foreman:label(d.foreman),manpower:integer(d.manpower),unitName:label(d.unitName),unitReady:integer(d.unitReady),unitStandby:integer(d.unitStandby),unitBreakdown:integer(d.unitBreakdown),companyCode:id(d.companyCode),farm:label(d.farm),materials:unique(list(d.materials,m=>{record(m,['material','dosePerHa','doseUnit','totalMaterial','unit']);return {material:label(m.material),dosePerHa:positive(m.dosePerHa),doseUnit:label(m.doseUnit),totalMaterial:positive(m.totalMaterial),unit:label(m.unit)}}),m=>m.material)}}

function by(rows,key,v){const found=rows.find(r=>r[key]===v);requireThat(found,'MISSING_REFERENCE');return found}

function groupDaily(rows){const groups=new Map();for(const r of rows){const g=groups.get(r.workGroupId)||[];g.push(r);groups.set(r.workGroupId,g)}return [...groups].map(([workGroupId,rs])=>{const first=rs[0];const fields=['workGroupPidCount','planningOrder','date','shift','foreman','activityId','activity','description','sourceType','companyCode','farm','manpower','unitName','unitReady','unitStandby','unitBreakdown'];requireThat(rs.length===first.workGroupPidCount&&rs.every(r=>fields.every(k=>r[k]===first[k])),'GROUP_MISMATCH');unique(rs,r=>r.pid);return {workGroupId,planningOrder:first.planningOrder,date:first.date,shift:first.shift,foreman:first.foreman,activityId:first.activityId,rows:[...rs].sort((a,b)=>a.pid.localeCompare(b.pid)),totalArea100:rs.reduce((s,r)=>s+r.area100,0)}}).sort((a,b)=>a.date.localeCompare(b.date)||a.shift.localeCompare(b.shift)||a.planningOrder-b.planningOrder||a.workGroupId.localeCompare(b.workGroupId))}

export function expandedPlanningFixture(input){record(input,['testOnly','companies','paddocks','materials','activities','monthlyPlans','dailyPlans']);requireThat(input.testOnly===true,'SYNTHETIC_ONLY');const companies=unique(list(input.companies,company),r=>r.code),paddocks=unique(list(input.paddocks,paddock),r=>r.pid),materials=unique(list(input.materials,material),r=>r.materialName),activities=unique(list(input.activities,activity),r=>r.id),monthlyPlans=unique(list(input.monthlyPlans,monthly),r=>r.planLineId),dailyPlans=unique(list(input.dailyPlans,daily),r=>r.dailyPlanId);unique(companies,r=>r.id);unique(materials,r=>r.id);
for(const p of paddocks)requireThat(by(companies,'code',p.companyCode).active,'INACTIVE_COMPANY');
for(const a of activities){if(a.companyScope!=='GLOBAL')by(companies,'code',a.companyScope);if(a.active)for(const c of a.components){const m=by(materials,'materialName',c.activeIngredient);requireThat(m.active&&m.unit===c.unit,'MATERIAL_UNIT_OR_STATUS')}}
for(const m of monthlyPlans){const p=by(paddocks,'pid',m.pid),a=by(activities,'id',m.activityId);requireThat(p.companyCode===m.companyCode&&p.farm===m.farm&&a.active&&(a.companyScope==='GLOBAL'||a.companyScope===m.companyCode)&&a.activity===m.activity&&a.description===m.description,'MONTHLY_REFERENCE_MISMATCH')}
for(const d of dailyPlans){const m=by(monthlyPlans,'planLineId',d.monthlyPlanLineId);requireThat(!m.cancelled&&!m.finished&&['pid','companyCode','farm','activityId','activity','description','monthKey'].every(k=>m[k]===d[k])&&d.date>=m.startDate&&d.date<=m.endDate,'DAILY_REFERENCE_MISMATCH');for(const line of d.materials){const mat=by(materials,'materialName',line.material);requireThat(mat.active&&mat.unit===line.doseUnit&&mat.unit===line.unit,'MATERIAL_UNIT_OR_STATUS')}}
return {testOnly:true,companies,paddocks,materials,activities,monthlyPlans,dailyPlans,dailyGroups:groupDaily(dailyPlans)}}
