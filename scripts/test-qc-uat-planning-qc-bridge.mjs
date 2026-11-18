import assert from 'node:assert/strict'
import {nextPlanningRow} from '../src/qcUatPlanningWriteContract.mjs'
import {planningQcInput,planningQcSnapshot} from '../src/qcUatPlanningQcBridge.mjs'
const uid='uat-mandor',m={pid:'uat-p1',activityId:'uat-a1',monthKey:'2026-11',week:'W1',targetArea100:1000},d={pid:m.pid,activityId:m.activityId,sourceType:'MONTHLY',monthlyPlanLineId:'uat-m1',date:'2026-11-03',shift:'1',foreman:'uat-f1',formType:'spray',area100:500}
const create=(scope,id,fields)=>nextPlanningRow(scope,{action:'create',id,expectedRevision:null,fields},null,'uat-planner')
const mp=create('monthly','uat-m1',m),dp=create('daily','uat-d1',d)
const r={testOnly:true,id:'uat-q1',ownerUid:uid,inputtedBy:uid,formType:'spray',clientRevision:'uat-r1',saveType:'ready',dailyPlanId:dp.id,monthlyPlanLineId:mp.id,pid:d.pid,date:d.date,shift:d.shift,foreman:d.foreman,actualArea100:800,sessionId:'uat-session'}
const q={record:r,baseRevision:null,jobId:'uat-job1',uploaderUid:uid,expectedDailyRevision:0}
let n=0
const check=(label,fn)=>{fn();n++;console.log('PASS: '+label)}
const deny=(fn,message)=>assert.throws(fn,{message})
const snap=(input=q,daily=dp,parent=mp,actor=uid)=>planningQcSnapshot(input,daily,parent,actor)
check('trusted snapshot drops revision and planning metadata',()=>{const s=snap();assert.deepEqual(Object.keys(s).sort(),['testOnly','dailyPlanId','monthlyPlanLineId','pid','date','shift','foreman','formType','area100'].sort());assert.equal(s.area100,500)})
check('actual may exceed target',()=>assert.equal(snap().area100,500))
check('historical linked DP survives MP period change',()=>assert.equal(snap(q,dp,{...mp,week:'W2'}).monthlyPlanLineId,mp.id))
check('stale revision and closed DP rejected',()=>{deny(()=>snap({...q,expectedDailyRevision:1}),'DAILY_REVISION_CONFLICT');deny(()=>snap(q,{...dp,status:'cancelled'}),'PLAN_CLOSED')})
check('missing and invalid DP rejected',()=>{deny(()=>snap(q,null),'MISSING_DAILY_PLAN');deny(()=>snap(q,{...dp,testOnly:false}),'INVALID_EXISTING_PLAN')})
check('missing closed or mismatched parent rejected',()=>{deny(()=>snap(q,dp,null),'MONTHLY_PARENT_NOT_FOUND');deny(()=>snap(q,dp,{...mp,status:'cancelled'}),'MONTHLY_PARENT_CLOSED');deny(()=>snap(q,dp,{...mp,pid:'uat-other'}),'MONTHLY_PARENT_MISMATCH')})
check('link and execution mismatches rejected',()=>{for(const patch of [{pid:'uat-p2'},{monthlyPlanLineId:'uat-m2'},{shift:'2'},{foreman:'uat-f2'},{date:'2026-11-04'},{formType:'fertilizer'}])deny(()=>snap({...q,record:{...r,...patch}}),'DAILY_LINK_MISMATCH')})
check('owner and inputtedBy bound to authenticated actor',()=>{deny(()=>snap(q,dp,mp,'uat-other'),'QC_OWNER_ONLY');deny(()=>snap({...q,record:{...r,inputtedBy:'uat-other'}}),'QC_OWNER_ONLY')})
check('ADHOC and SUPPORT allow empty MP linkage',()=>{for(const sourceType of ['ADHOC','SUPPORT']){const x=create('daily','uat-d2',{...d,sourceType,monthlyPlanLineId:''});const job={...q,record:{...r,dailyPlanId:x.id,monthlyPlanLineId:''}};assert.equal(snap(job,x,null).monthlyPlanLineId,'');deny(()=>snap(job,x,mp),'UNEXPECTED_MONTHLY_PARENT')}})
check('extra DTO fields and unsafe paths rejected',()=>{deny(()=>planningQcInput({...q,area100:1}),'INVALID_PLANNING_QC_REQUEST');deny(()=>planningQcInput({...q,record:{...r,dailyPlanId:'../users'}}),'INVALID_PLANNING_QC_RECORD');deny(()=>snap({...q,record:{...r,plannedDailyArea100:1}}),'INVALID_FIELDS')})
check('no client-chosen planned revision outside integer range',()=>{for(const expectedDailyRevision of [null,-1,1.5,1000000])deny(()=>planningQcInput({...q,expectedDailyRevision}),'INVALID_DAILY_REVISION')})
console.log('SUCCESS: '+n+' Planning QC bridge checks (offline)')
