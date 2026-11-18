import assert from 'node:assert/strict'
import {nextPlanningRow} from '../src/qcUatPlanningWriteContract.mjs'
import {dose10000,monthlySnapshot,dailySnapshot,materialTotals,validateGroupResources,aggregateGroupMaterials} from '../src/qcUatPlanningMasterSnapshot.mjs'
const uid='uat-planner',m={pid:'uat-p1',activityId:'uat-a1',monthKey:'2026-11',week:'W1',targetArea100:1000},d={pid:m.pid,activityId:m.activityId,sourceType:'MONTHLY',monthlyPlanLineId:'uat-m1',date:'2026-11-03',shift:'1',foreman:'uat-f1',formType:'spray',area100:525}
const make=(scope,id,fields)=>nextPlanningRow(scope,{action:'create',id,expectedRevision:null,fields},null,uid)
const mp=make('monthly','uat-m1',m),dp=make('daily','uat-d1',d)
const p={testOnly:true,pid:m.pid,active:true,companyCode:'uat-company',farm:'Farm A',stage:'Ratoon',variety:'V1/V2',areaPaddock100:1000,plantArea100:900,varietyBreakdown:[{variety:'V1',area100:400},{variety:'V2',area100:500}]},company={testOnly:true,code:p.companyCode,active:true},a={testOnly:true,id:m.activityId,active:true,formType:'spray',companyScope:'GLOBAL',activity:'Spray',description:'Post Emergence',components:[{materialId:'uat-mat',dosePerHa:'1.2345',unit:'L'}]}
const material={testOnly:true,id:'uat-mat',active:true,materialName:'Synthetic Herbicide',unit:'L'},materials=new Map([[material.id,material]])
const snap=(selected=['V1'],pad=p,act=a,mat=materials)=>monthlySnapshot(mp,pad,company,act,mat,selected)
const source=snap(),daily=(r=dp,s=source,pad=p,act=a)=>dailySnapshot(r,s,pad,company,act)
let n=0
const check=(name,fn)=>{fn();n++;console.log('PASS: '+name)}
const deny=(fn,message)=>assert.throws(fn,{message})
check('dose precision to four decimals exact',()=>{assert.equal(dose10000('1.2345'),12345);assert.equal(dose10000(0.0001),1);for(const x of [0,-1,'1.23456',NaN,Infinity])deny(()=>dose10000(x),'INVALID_MATERIAL_DOSE')})
check('monthly snapshot preserves selected variety and master area',()=>{assert.equal(source.selectedPlantArea100,400);assert.equal(source.plantArea100,900);assert.equal(source.componentsSnapshot[0].dose10000,12345);assert.equal(source.masterVariety,'V1/V2')})
check('multiple varieties and target above plant permitted',()=>{assert.equal(snap(['V1','V2']).selectedPlantArea100,900);assert.equal(mp.targetArea100,1000)})
check('missing duplicate or unknown variety denied',()=>{deny(()=>snap([]),'INVALID_MASTER_LIST');deny(()=>snap(['V1','V1']),'DUPLICATE_MASTER_KEY');deny(()=>snap(['V3']),'UNKNOWN_VARIETY')})
check('invalid variety breakdown or inactive master denied',()=>{deny(()=>snap(['V1'],{...p,plantArea100:899}),'VARIETY_TOTAL_MISMATCH');deny(()=>snap(['V1'],{...p,active:false}),'INVALID_PLANNING_MASTER')})
check('activity company scope and material unit checked',()=>{deny(()=>snap(['V1'],p,{...a,companyScope:'uat-other'}),'ACTIVITY_COMPANY_MISMATCH');deny(()=>snap(['V1'],p,a,new Map([[material.id,{...material,unit:'kg'}]])),'MATERIAL_UNIT_MISMATCH')})
check('duplicate component or inactive material denied',()=>{deny(()=>snap(['V1'],p,{...a,components:[a.components[0],a.components[0]]}),'DUPLICATE_MASTER_KEY');deny(()=>snap(['V1'],p,a,new Map([[material.id,{...material,active:false}]])),'INVALID_PLANNING_MASTER')})
check('daily uses frozen monthly rate and variety not live recipe',()=>{const x=daily(dp,source,{...p,variety:'New variety'},{...a,components:[{...a.components[0],dosePerHa:3}]});assert.equal(x.masterVariety,'V1/V2');assert.equal(x.materials[0].dose10000,12345);assert.equal(x.materials[0].totalMaterial1000000,6481125)})
check('missing source snapshot fails closed',()=>deny(()=>daily(dp,null),'MISSING_MONTHLY_SNAPSHOT'))
check('ADHOC SUPPORT have no inferred materials',()=>{for(const sourceType of ['ADHOC','SUPPORT']){const r=make('daily','uat-adhoc',{...d,sourceType,monthlyPlanLineId:''});const x=daily(r,null);assert.deepEqual(x.materials,[]);assert.equal(x.selectedPlantArea100,900)}})
check('group aggregate quantities by material and unit',()=>{const x=daily(),y=daily(make('daily','uat-d2',{...d,area100:700}));assert.equal(aggregateGroupMaterials([x,y])[0].totalMaterial1000000,15122625);deny(()=>aggregateGroupMaterials([x,{materials:[{...y.materials[0],unit:'kg'}]}]),'GROUP_MATERIAL_CONFLICT')})
check('active foreman shift and unit required',()=>{const h={foreman:'uat-f1',shift:'1',unitName:'Unit 01',manpower:7,unitReady:1,unitStandby:0,unitBreakdown:0},f={testOnly:true,id:'uat-f1',active:true,name:'Mandor A'},s={testOnly:true,code:'1',active:true},u={testOnly:true,id:'uat-unit',active:true,name:'Unit 01'};assert.equal(validateGroupResources(h,f,s,u).unitId,'uat-unit');deny(()=>validateGroupResources(h,{...f,active:false},s,u),'INVALID_PLANNING_MASTER');deny(()=>validateGroupResources(h,f,s,null),'INVALID_MASTER_UNIT')})
check('Firestore field ordering does not affect frozen variety validation',()=>{const reorder=xs=>xs.map(v=>({area100:v.area100,variety:v.variety}));const s={...source,masterVarietyBreakdown:reorder(source.masterVarietyBreakdown),selectedVarietyDetails:reorder(source.selectedVarietyDetails)};assert.equal(daily(dp,s).selectedPlantArea100,400);deny(()=>daily(dp,{...s,selectedVarietyDetails:[{area100:401,variety:'V1'}]}),'INVALID_MONTHLY_SNAPSHOT')})
console.log('SUCCESS: '+n+' Planning master snapshot contract checks (offline)')
