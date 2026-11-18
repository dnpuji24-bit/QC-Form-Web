import assert from 'node:assert/strict'
import {dailyGroupCreate} from '../src/qcUatDailyGroupContract.mjs'
import {validateGroupState,nextDailyGroup,nextGroupOrder} from '../src/qcUatDailyGroupLifecycle.mjs'
const uid='uat-planner',input={workGroupId:'uat-g1',planningOrder:1,date:'2026-11-03',shift:'1',foreman:'uat-f1',activityId:'uat-a1',formType:'spray',sourceType:'MONTHLY',manpower:7,unitName:'Unit 01',unitReady:1,unitStandby:0,unitBreakdown:0,notes:'',rows:[{dailyPlanId:'uat-d1',pid:'uat-p1',monthlyPlanLineId:'uat-m1',area100:500},{dailyPlanId:'uat-d2',pid:'uat-p2',monthlyPlanLineId:'uat-m2',area100:700}]}
const {header:h,rows}=dailyGroupCreate(input,uid),members=rows.map(r=>({testOnly:true,dailyPlanId:r.id,workGroupId:h.workGroupId}))
const edit={action:'edit',workGroupId:h.workGroupId,expectedRevision:0,fields:{shift:'2',foreman:'uat-f2',manpower:8,unitName:'Unit 02',unitReady:2,unitStandby:0,unitBreakdown:0,notes:'changed',rows:[{dailyPlanId:'uat-d2',area100:800},{dailyPlanId:'uat-d1',area100:600}]}},cancel={action:'cancel',workGroupId:h.workGroupId,expectedRevision:0}
const run=(q=edit,hh=h,rr=rows,mm=members)=>nextDailyGroup(q,hh,rr,mm,'uat-editor')
const deny=(fn,message)=>assert.throws(fn,{message})
let n=0
const check=(name,fn)=>{fn();n++;console.log('PASS: '+name)}
check('validate canonical existing group',()=>assert.deepEqual(validateGroupState(h.workGroupId,h,rows,members),{header:h,rows}))
check('edit updates all rows and header with stable IDs and creators',()=>{const x=run();assert.equal(x.header.revision,1);assert.equal(x.header.totalArea100,1400);assert.equal(x.header.manpower,8);assert.deepEqual(x.rows.map(r=>[r.id,r.area100,r.shift,r.revision,r.createdBy]),[['uat-d1',600,'2',1,uid],['uat-d2',800,'2',1,uid]]);assert.equal(x.header.updatedBy,'uat-editor')})
check('membership immutable and fields exact',()=>{deny(()=>run({...edit,fields:{...edit.fields,rows:[edit.fields.rows[0]]}}),'GROUP_MEMBERSHIP_IMMUTABLE');deny(()=>run({...edit,fields:{...edit.fields,date:'2026-11-04'}}),'INVALID_GROUP_FIELDS')})
check('invalid areas and resource counts rejected',()=>{deny(()=>run({...edit,fields:{...edit.fields,rows:[{...edit.fields.rows[0],area100:0},edit.fields.rows[1]]}}),'INVALID_PLANNING_AREA');deny(()=>run({...edit,fields:{...edit.fields,manpower:-1}}),'INVALID_GROUP_COUNT')})
check('stale revision rejected',()=>deny(()=>run({...edit,expectedRevision:1}),'GROUP_REVISION_CONFLICT'))
check('mismatched membership header or row fails closed',()=>{deny(()=>run(edit,h,rows,[members[0],{...members[1],workGroupId:'uat-other'}]),'INVALID_GROUP_MEMBERS');deny(()=>run(edit,{...h,totalArea100:1}),'GROUP_STATE_MISMATCH');deny(()=>run(edit,h,[{...rows[0],shift:'2'},rows[1]]),'GROUP_STATE_MISMATCH')})
check('cancel keeps IDs and areas and closes all rows',()=>{const x=run(cancel);assert.equal(x.header.status,'cancelled');assert.equal(x.header.totalArea100,1200);assert.ok(x.rows.every(r=>r.status==='cancelled'&&r.revision===1));deny(()=>run({...cancel,expectedRevision:1},x.header,x.rows),'GROUP_CLOSED')})
const h2=dailyGroupCreate({...input,workGroupId:'uat-g2',rows:input.rows.map((r,i)=>({...r,dailyPlanId:'uat-x'+i}))},uid).header
const order={date:h.date,groups:[{workGroupId:h2.workGroupId,expectedRevision:0},{workGroupId:h.workGroupId,expectedRevision:0}]}
check('reorder assigns contiguous ranks and only header revisions',()=>{const x=nextGroupOrder(order,[h,h2],uid);assert.deepEqual(x.map(r=>[r.workGroupId,r.planningOrder,r.revision]),[['uat-g2',1,1],['uat-g1',2,1]]);assert.deepEqual(x[1].dailyPlanIds,h.dailyPlanIds)})
check('incomplete duplicate or cross-date reorder rejected',()=>{deny(()=>nextGroupOrder({...order,groups:[order.groups[0]]},[h,h2],uid),'REORDER_SCOPE_MISMATCH');deny(()=>nextGroupOrder({...order,groups:[order.groups[0],order.groups[0]]},[h,h2],uid),'DUPLICATE_GROUP_ID');deny(()=>nextGroupOrder(order,[h,{...h2,date:'2026-11-04'}],uid),'REORDER_SCOPE_MISMATCH')})
check('stale reorder denied; edit after reorder uses independent row revisions',()=>{const x=nextGroupOrder(order,[h,h2],uid)[1];deny(()=>nextGroupOrder(order,[x,h2],uid),'GROUP_REVISION_CONFLICT');const y=run({...edit,expectedRevision:1},x);assert.equal(y.header.revision,2);assert.equal(y.header.planningOrder,2);assert.ok(y.rows.every(r=>r.revision===1))})
console.log('SUCCESS: '+n+' Daily work group lifecycle contract checks (offline)')
