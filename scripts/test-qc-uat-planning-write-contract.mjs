import assert from 'node:assert/strict'
import {planningRequest,nextPlanningRow,verifyMonthlyParent} from '../src/qcUatPlanningWriteContract.mjs'
const uid='uat-owner',m={pid:'uat-p1',activityId:'uat-a1',monthKey:'2026-11',week:'W1',targetArea100:1000},d={pid:m.pid,activityId:m.activityId,sourceType:'MONTHLY',monthlyPlanLineId:'uat-m1',date:'2026-11-03',shift:'1',foreman:'uat-f1',formType:'spray',area100:1500}
const create=(id,fields)=>({action:'create',id,expectedRevision:null,fields})
const update=(id,fields,expectedRevision=0)=>({action:'update',id,expectedRevision,fields})
const cancel=(id,expectedRevision=0)=>({action:'cancel',id,expectedRevision})
const mp=nextPlanningRow('monthly',create('uat-m1',m),null,uid),dp=nextPlanningRow('daily',create('uat-d1',d),null,uid)
let n=0
const check=(name,fn)=>{fn();n++;console.log('PASS: '+name)}
const deny=(fn,message)=>assert.throws(fn,{message})
check('canonical create stamps trusted actor and revision',()=>{assert.equal(mp.createdBy,uid);assert.equal(mp.revision,0);assert.equal(dp.dailyPlanId,dp.id)})
check('valid parent permits DP target above MP',()=>verifyMonthlyParent(dp,mp))
check('area must be positive integer hundredths',()=>{for(const targetArea100 of [0,-1,1.5,NaN,10000001])deny(()=>planningRequest('monthly',create('uat-m1',{...m,targetArea100})),'INVALID_PLANNING_AREA')})
check('unknown fields and actor injection denied',()=>deny(()=>planningRequest('monthly',create('uat-m1',{...m,createdBy:uid})),'INVALID_PLANNING_FIELDS'))
check('invalid scope and live ID denied',()=>{deny(()=>planningRequest('actual',create('uat-m1',m)),'INVALID_PLANNING_SCOPE');deny(()=>planningRequest('monthly',create('real-id',m)),'INVALID_SYNTHETIC_ID')})
check('invalid calendar dates denied',()=>deny(()=>planningRequest('daily',create('uat-d1',{...d,date:'2026-02-30'})),'INVALID_PLANNING_DATE'))
check('ADHOC and SUPPORT require empty MP linkage',()=>{for(const sourceType of ['ADHOC','SUPPORT']){deny(()=>planningRequest('daily',create('uat-d1',{...d,sourceType})),'INVALID_PLANNING_LINK');assert.equal(planningRequest('daily',create('uat-d1',{...d,sourceType,monthlyPlanLineId:''})).fields.monthlyPlanLineId,'')}})
check('missing and mismatched MP denied',()=>{deny(()=>verifyMonthlyParent(dp,null),'MONTHLY_PARENT_NOT_FOUND');deny(()=>verifyMonthlyParent(dp,{...mp,pid:'uat-p2'}),'MONTHLY_PARENT_MISMATCH')})
check('new linked DP outside MP period denied',()=>deny(()=>verifyMonthlyParent({...dp,date:'2026-11-15'},mp),'MONTHLY_PARENT_PERIOD_MISMATCH'))
check('create duplicate and stale update denied',()=>{deny(()=>nextPlanningRow('monthly',create(mp.id,m),mp,uid),'PLAN_ALREADY_EXISTS');deny(()=>nextPlanningRow('monthly',update(mp.id,m,1),mp,uid),'PLANNING_REVISION_CONFLICT')})
check('update retains creator and increments revision',()=>{const r=nextPlanningRow('monthly',update(mp.id,{...m,targetArea100:2000}),mp,'uat-other');assert.equal(r.createdBy,uid);assert.equal(r.updatedBy,'uat-other');assert.equal(r.revision,1)})
check('identity and source relink immutable',()=>{deny(()=>nextPlanningRow('monthly',update(mp.id,{...m,pid:'uat-p2'}),mp,uid),'PLANNING_IDENTITY_IMMUTABLE');deny(()=>nextPlanningRow('daily',update(dp.id,{...d,monthlyPlanLineId:'uat-m2'}),dp,uid),'PLANNING_IDENTITY_IMMUTABLE')})
check('cancel is soft and terminal',()=>{const r=nextPlanningRow('monthly',cancel(mp.id),mp,uid);assert.equal(r.status,'cancelled');assert.equal(r.targetArea100,mp.targetArea100);deny(()=>nextPlanningRow('monthly',update(mp.id,m,1),r,uid),'PLAN_CLOSED');deny(()=>verifyMonthlyParent(dp,r),'MONTHLY_PARENT_CLOSED')})
check('malformed existing row fails closed',()=>deny(()=>nextPlanningRow('monthly',update(mp.id,m),{...mp,testOnly:false},uid),'INVALID_EXISTING_PLAN'))
console.log('SUCCESS: '+n+' synthetic Planning write contract checks (offline)')
