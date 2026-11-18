import assert from 'node:assert/strict'
import {dailyGroupCreate} from '../src/qcUatDailyGroupContract.mjs'
import {currentPlanningRow} from '../src/qcUatPlanningWriteContract.mjs'
const uid='uat-planner',input={workGroupId:'uat-g1',planningOrder:1,date:'2026-11-03',shift:'1',foreman:'uat-f1',activityId:'uat-a1',formType:'spray',sourceType:'MONTHLY',manpower:7,unitName:'Unit 01',unitReady:1,unitStandby:0,unitBreakdown:0,notes:'',rows:[{dailyPlanId:'uat-d1',pid:'uat-p1',monthlyPlanLineId:'uat-m1',area100:500},{dailyPlanId:'uat-d2',pid:'uat-p2',monthlyPlanLineId:'uat-m2',area100:700}]}
let n=0
const check=(name,fn)=>{fn();n++;console.log('PASS: '+name)}
const build=(patch={})=>dailyGroupCreate({...input,...patch},uid)
const deny=(patch,message)=>assert.throws(()=>build(patch),{message})
check('two PID rows have independent canonical IDs and group total',()=>{const {header,rows}=build();assert.deepEqual(header.dailyPlanIds,['uat-d1','uat-d2']);assert.equal(header.workGroupPidCount,2);assert.equal(header.totalArea100,1200);for(const r of rows)currentPlanningRow('daily',r.id,r)})
check('HK and equipment held once on header not copied to rows',()=>{const {header,rows}=build();assert.equal(header.manpower,7);assert.equal(header.unitReady,1);assert.ok(rows.every(r=>!Object.hasOwn(r,'manpower')&&!Object.hasOwn(r,'unitReady')))})
check('duplicate PID and duplicate DP ID rejected',()=>{deny({rows:[input.rows[0],{...input.rows[1],pid:'uat-p1'}]},'DUPLICATE_GROUP_PID');deny({rows:[input.rows[0],{...input.rows[1],dailyPlanId:'uat-d1'}]},'DUPLICATE_DAILY_ID')})
check('empty oversize and sparse rows rejected',()=>{for(const rows of [[],Array(21).fill(input.rows[0]),Array(2)])deny({rows},'INVALID_GROUP_SIZE')})
check('shared execution cannot be overridden by member',()=>deny({rows:[{...input.rows[0],shift:'2'}]},'INVALID_GROUP_FIELDS'))
check('unsafe IDs and injected total rejected',()=>{deny({workGroupId:'../users'},'INVALID_SYNTHETIC_ID');deny({totalArea100:100},'INVALID_GROUP_FIELDS')})
check('nonpositive member area rejected',()=>deny({rows:[{...input.rows[0],area100:0}]},'INVALID_PLANNING_AREA'))
check('ADHOC and SUPPORT require empty parent',()=>{for(const sourceType of ['ADHOC','SUPPORT']){deny({sourceType},'INVALID_PLANNING_LINK');assert.equal(build({sourceType,rows:input.rows.map(r=>({...r,monthlyPlanLineId:''}))}).rows[1].monthlyPlanLineId,'')}})
check('counts and resource label validated',()=>{deny({manpower:-1},'INVALID_GROUP_COUNT');deny({unitReady:1.5},'INVALID_GROUP_COUNT');deny({unitName:''},'GROUP_UNIT_REQUIRED')})
check('order and notes bounded',()=>{deny({planningOrder:0},'INVALID_GROUP_COUNT');deny({notes:'x'.repeat(1001)},'INVALID_GROUP_TEXT')})
check('one PID card supported and actor server stamped',()=>{const {header,rows}=build({rows:[input.rows[0]]});assert.equal(header.workGroupPidCount,1);assert.equal(header.createdBy,uid);assert.equal(rows[0].updatedBy,uid)})
console.log('SUCCESS: '+n+' atomic Daily work group contract checks (offline)')
