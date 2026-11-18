import assert from 'node:assert/strict'
import {nextPlanningRow} from '../src/qcUatPlanningWriteContract.mjs'
import {planningQcSnapshot,planningCarryoverSnapshot} from '../src/qcUatPlanningQcBridge.mjs'
import {dailySourceProgress} from '../src/qcUatDailySourceProgress.mjs'
const uid='uat-mandor',m={pid:'uat-p1',activityId:'uat-a1',monthKey:'2026-11',week:'W1',targetArea100:1000},d={pid:m.pid,activityId:m.activityId,sourceType:'MONTHLY',monthlyPlanLineId:'uat-m1',date:'2026-11-03',shift:'1',foreman:'uat-f1',formType:'spray',area100:500}
const create=(scope,id,fields)=>nextPlanningRow(scope,{action:'create',id,expectedRevision:null,fields},null,'uat-planner')
const mp=create('monthly','uat-m1',m),dp=create('daily','uat-d1',d)
const r={testOnly:true,id:'uat-q1',ownerUid:uid,inputtedBy:uid,formType:'spray',clientRevision:'uat-r1',saveType:'ready',dailyPlanId:dp.id,monthlyPlanLineId:mp.id,pid:d.pid,date:d.date,shift:'2',foreman:'uat-f2',actualArea100:800,sessionId:'uat-session'}
const q={record:r,baseRevision:null,jobId:'uat-job1',uploaderUid:uid,expectedDailyRevision:0}
const snap=(input=q,daily=dp,parent=mp,actor=uid)=>planningCarryoverSnapshot(input,daily,parent,actor)
let n=0
const check=(label,fn)=>{fn();n++;console.log('PASS: '+label)}
const deny=(fn,message)=>assert.throws(fn,{message})
check('explicit carryover preserves source IDs and actual execution',()=>{const s=snap();assert.equal(s.dailyPlanId,dp.id);assert.equal(s.monthlyPlanLineId,mp.id);assert.equal(s.shift,'2');assert.equal(s.foreman,'uat-f2');assert.equal(s.area100,500);assert.equal(dp.shift,'1');assert.equal(dp.foreman,'uat-f1')})
check('strict existing service still refuses different shift',()=>deny(()=>planningQcSnapshot(q,dp,mp,uid),'DAILY_LINK_MISMATCH'))
check('same foreman may continue in shift 2',()=>assert.equal(snap({...q,record:{...r,foreman:d.foreman}}).foreman,d.foreman))
check('reverse same-shift and cross-date denied',()=>{for(const [record,source] of [[{...r,shift:'1'},dp],[r,{...dp,shift:'2'}],[{...r,date:'2026-11-04'},dp]])deny(()=>snap({...q,record},source),'CARRYOVER_SESSION_DENIED')})
check('actual foreman must be valid synthetic ID',()=>deny(()=>snap({...q,record:{...r,foreman:'../users'}}),'INVALID_SYNTHETIC_ID'))
check('wrong source MP PID form rejected',()=>{for(const patch of [{monthlyPlanLineId:'uat-other'},{pid:'uat-other'},{formType:'fertilizer'}])deny(()=>snap({...q,record:{...r,...patch}}),'DAILY_LINK_MISMATCH')})
check('missing cancelled or stale DP denied',()=>{deny(()=>snap(q,null),'MISSING_DAILY_PLAN');deny(()=>snap(q,{...dp,status:'cancelled'}),'PLAN_CLOSED');deny(()=>snap({...q,expectedDailyRevision:1}),'DAILY_REVISION_CONFLICT')})
check('foreign actor and forged inputtedBy denied',()=>{deny(()=>snap(q,dp,mp,'uat-other'),'QC_OWNER_ONLY');deny(()=>snap({...q,record:{...r,inputtedBy:'uat-other'}}),'QC_OWNER_ONLY')})
check('historical source survives MP period change',()=>assert.equal(snap(q,dp,{...mp,week:'W2'}).monthlyPlanLineId,mp.id))
check('fertilizer ADHOC and SUPPORT allow empty MP link',()=>{for(const sourceType of ['ADHOC','SUPPORT']){const f=create('daily','uat-fert',{...d,sourceType,monthlyPlanLineId:'',formType:'fertilizer'});const j={...q,record:{...r,dailyPlanId:f.id,monthlyPlanLineId:'',formType:'fertilizer'}};assert.equal(snap(j,f,null).formType,'fertilizer')}})
check('source target counted once across shifts including overage',()=>{const out=dailySourceProgress({testOnly:true,dailyPlans:[{id:dp.id,targetArea100:500,kind:'spray',shift:'1'}],actualReports:[{id:'uat-q0',dailyPlanId:dp.id,actualArea100:300,shift:'1',foreman:'uat-f1'},{id:r.id,dailyPlanId:dp.id,actualArea100:800,shift:'2',foreman:r.foreman}]});assert.equal(out.totalTargetArea100,500);assert.equal(out.rows[0].actualArea100,1100);assert.equal(out.rows[0].overArea100,600);assert.equal(out.rows[0].progressPct,220)})
console.log('SUCCESS: '+n+' Planning carryover contract checks (offline)')
