// 11D.5c.4.2 — compact read-only operational period contracts, demo UAT only.
// MP/DP/Actual totals are never mixed across fertilizer components vs physical area.
import {filteredDashboardRequest} from './qcUatPlanningDashboardFilters.mjs'
import {currentPlanningRow} from './qcUatPlanningWriteContract.mjs'

const need=(ok,code)=>{if(!ok)throw Error(code)}
const exact=(o,ks)=>o&&Object.getPrototypeOf(o)===Object.prototype&&
 Reflect.ownKeys(o).length===ks.length&&ks.every(k=>Object.hasOwn(o,k))
const sid=s=>typeof s==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(s)
const date=s=>typeof s==='string'&&/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(s)&&
 !Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s

export function operationalSummaryRequest(period,week='ALL'){
 const input={period,week,companyCode:null,farm:null,shift:null,foreman:null}
 filteredDashboardRequest(input)
 return input
}
export function operationalCalendarRequest(input){
 need(exact(input,['monthKey','source'])&&typeof input.monthKey==='string'&&
 /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(input.monthKey)&&
 ['daily','actual'].includes(input.source),'INVALID_CALENDAR_REQUEST')
 const [y,m]=input.monthKey.split('-').map(Number)
 const last=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)
 return Object.freeze({monthKey:input.monthKey,source:input.source,
  startDate:input.monthKey+'-01',endDate:last})
}
// Projection runs inside a fresh, role-authorized Firestore transaction.
// Actual results intentionally show only aggregate counts by day/shift.
export function operationalCalendarProjection(request,rows){
 const q=operationalCalendarRequest({monthKey:request.monthKey,source:request.source})
 need(Array.isArray(rows)&&rows.length<=50,'CALENDAR_SCOPE_LIMIT')
 const seen=new Set(),events=[]
 for(const {id,row} of rows){
  need(typeof id==='string'&&!seen.has(id)&&row?.testOnly===true&&date(row.date)&&
   row.date>=q.startDate&&row.date<=q.endDate&&['1','2'].includes(row.shift),
   'INVALID_CALENDAR_ROW')
  seen.add(id)
  if(q.source==='daily'){
   currentPlanningRow('daily',id,row)
   need(sid(row.pid)&&sid(row.foreman)&&['spray','fertilizer'].includes(row.formType),
    'INVALID_CALENDAR_ROW')
   events.push({date:row.date,shift:row.shift,pid:row.pid,foreman:row.foreman,
    kind:row.formType,id,plannedArea100:row.area100,status:row.status})
  }else{
   need(sid(row.dailyPlanId)&&sid(row.foreman)&&sid(row.pid)&&
    ['spray','fertilizer'].includes(row.qcFormType??row.formType),
    'INVALID_CALENDAR_ROW')
   events.push({date:row.date,shift:row.shift,kind:row.qcFormType??row.formType})
  }
 }
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.shift.localeCompare(b.shift)||
  (a.id??'').localeCompare(b.id??''))
 if(q.source==='actual'){
  const grouped=new Map()
  for(const e of events){
   const k=e.date+':'+e.shift+':'+e.kind
   grouped.set(k,(grouped.get(k)??0)+1)
  }
  return Object.freeze({testOnly:true,readOnly:true,monthKey:q.monthKey,source:q.source,
   eventCount:events.length,entries:[...grouped.entries()].map(([k,count])=>{
    const [date,shift,kind]=k.split(':');return {date,shift,kind,count}
   })})
 }
 return Object.freeze({testOnly:true,readOnly:true,monthKey:q.monthKey,source:q.source,
  eventCount:events.length,entries:events})
}
