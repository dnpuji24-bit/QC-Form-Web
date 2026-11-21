// 11D.5c.4.2 — only new read-only operational module contracts.
// No emulator, photos, Supabase secret, production import or network.
import assert from 'node:assert/strict'
import {nextPlanningRow} from '../src/qcUatPlanningWriteContract.mjs'
import {operationalSummaryRequest,operationalCalendarRequest,operationalCalendarProjection} from '../src/qcUatOperationalPeriod.mjs'

let passed=0
function check(title,fn){fn();passed++;console.log('PASS: '+title)}
const id='uat-calendar-d1'
const row=nextPlanningRow('daily',{
 action:'create',id,expectedRevision:null,fields:{
  pid:'uat-p1',activityId:'uat-a1',sourceType:'ADHOC',monthlyPlanLineId:'',
  date:'2026-11-03',shift:'2',foreman:'uat-foreman',formType:'spray',area100:1200
 }
},null,'uat-owner')
const day={id,row}
const actual={id:'qcactual_uat-r1',row:{
 testOnly:true,date:'2026-11-03',shift:'2',dailyPlanId:id,foreman:'uat-foreman',
 pid:'uat-p1',qcFormType:'spray'}}
check('Summary uses existing strict filtered dashboard contract with no arbitrary source',()=>{
 const req=operationalSummaryRequest('2027-01')
 assert.deepEqual(req,{period:'2027-01',week:'ALL',companyCode:null,farm:null,shift:null,foreman:null})
 assert.equal(operationalSummaryRequest('2027-01','W2').week,'W2')
 assert.throws(()=>operationalSummaryRequest('2027-13'),{message:'INVALID_DASHBOARD_PERIOD'})
 assert.throws(()=>operationalSummaryRequest('2027-01','W7'),{message:'INVALID_WEEK'})
})
check('Daily calendar validates canonical rows and returns only bounded safe projection',()=>{
 const q=operationalCalendarRequest({monthKey:'2026-11',source:'daily'})
 assert.equal(q.endDate,'2026-11-30')
 const result=operationalCalendarProjection(q,[day])
 assert.equal(result.readOnly,true)
 assert.equal(result.eventCount,1)
 assert.deepEqual(result.entries,[{
  date:'2026-11-03',shift:'2',pid:'uat-p1',foreman:'uat-foreman',
  kind:'spray',id,plannedArea100:1200,status:'open'
 }])
 assert.throws(()=>operationalCalendarProjection(q,[day,day]),{message:'INVALID_CALENDAR_ROW'})
 assert.throws(()=>operationalCalendarProjection(q,[{id,row:{...row,testOnly:false}}]),{message:'INVALID_CALENDAR_ROW'})
 assert.throws(()=>operationalCalendarProjection(q,[{id,row:{...row,date:'2026-12-01'}}]),{message:'INVALID_CALENDAR_ROW'})
})
check('Actual calendar aggregates counts without exposing raw QC/photo records',()=>{
 const q=operationalCalendarRequest({monthKey:'2026-11',source:'actual'})
 const other={id:'qcactual_uat-r2',row:{...actual.row}}
 const result=operationalCalendarProjection(q,[actual,other])
 assert.deepEqual(result.entries,[{date:'2026-11-03',shift:'2',kind:'spray',count:2}])
 assert.equal(result.eventCount,2)
 assert.equal(JSON.stringify(result).includes('qcRecordId'),false)
 assert.equal(JSON.stringify(result).includes('ownerUid'),false)
 assert.throws(()=>operationalCalendarRequest({monthKey:'2026-11',source:'photos'}),{message:'INVALID_CALENDAR_REQUEST'})
 assert.throws(()=>operationalCalendarProjection(q,[{...actual,row:{...actual.row,pid:'external'}}]),{message:'INVALID_CALENDAR_ROW'})
})
console.log('SUCCESS: '+passed+' read-only operational Summary/Calendar delta contracts passed (OFFLINE)')
