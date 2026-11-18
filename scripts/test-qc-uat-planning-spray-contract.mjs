import assert from 'node:assert/strict'
import {preparePlanningSpray,sprayFormSource,historicalSpraySource} from '../src/qcUatPlanningSprayCommit.mjs'
import {planningSprayFixture} from './qc-uat-planning-spray-fixture.mjs'
const uid='uat-planner',source={testOnly:true,kind:'spray',dailyPlanId:'uat-full-d1',monthlyPlanLineId:'uat-full-m1',pid:'uat-p1',sourceType:'MONTHLY',date:'2026-11-03',sourceShift:'1',sourceForemanId:'uat-f1',sourceForemanName:'Mandor A',executionShift:'2',executionForemanId:'uat-f2',executionForemanName:'Mandor B',carryover:true,dailyRevision:0,planningOrder:1,companyCode:'uat-company',farm:'Farm A',activityId:'uat-a1',activity:'Spray',description:'Post Emergence',stage:'Ratoon',masterVariety:'V1/V2',selectedVarieties:['V1'],selectedVarietyDetails:[{variety:'V1',area100:800}],area100:500,materials:[{materialId:'uat-mat',material:'Synthetic Herbicide',dose10000:12345,doseUnit:'L',unit:'L',totalMaterial1000000:6172500}],areaSemantics:'SCALAR_APPLICATION'}
const r=planningSprayFixture(source),input={record:r,baseRevision:null,jobId:'uat-job1',uploaderUid:uid,expectedDailyRevision:0,foremanId:'uat-f2'}
const prep=(patch={},s=source,actor=uid)=>preparePlanningSpray({...input,record:{...r,...patch}},s,actor)
const deny=(fn,message)=>assert.throws(fn,{message})
let n=0
const check=(name,fn)=>{fn();n++;console.log('PASS: '+name)}
check('canonical ID and exact material quantities for carryover',()=>{const x=prep(),m=x.detail.materials[0];assert.equal(x.record.id,'uat-fullq');assert.equal(x.record.foreman,'uat-f2');assert.equal(x.record.actualArea100,900);assert.equal(m.plannedMaterial1000000,6172500);assert.equal(m.standardMaterial1000000,11110500);assert.equal(m.actualMaterial1000000,17500000);assert.equal(m.varianceMaterial1000000,6389500)})
check('blank measured amount unknown, explicit zero remains zero',()=>{assert.equal(prep({actUsagePesticide1:''}).detail.materials[0].actualMaterial1000000,null);assert.equal(prep({actUsagePesticide1:'0'}).detail.materials[0].actualMaterial1000000,0)})
check('forged owner, source name and material estimate rejected',()=>{deny(()=>prep({},source,'uat-other'),'QC_OWNER_ONLY');deny(()=>prep({name:'Mandor A'}),'QC_EXECUTOR_MISMATCH');deny(()=>prep({actualPlanMaterials:[{...r.actualPlanMaterials[0],totalMaterial:2}]}),'MATERIAL_MISMATCH')})
check('invalid or overprecision measured amounts and empty slot injection rejected',()=>{deny(()=>prep({actUsagePesticide1:'1.1234567'}),'INVALID_ACTUAL_MATERIAL');deny(()=>prep({actUsagePesticide1:'99999999999999'}),'INVALID_ACTUAL_MATERIAL');deny(()=>prep({actUsagePesticide2:'1'}),'UNMAPPED_ACTUAL_MATERIAL')})
check('comma decimal and six-place amount exact',()=>assert.equal(prep({actUsagePesticide1:'1,234567'}).detail.materials[0].actualMaterial1000000,1234567))
check('photos and uploaded status require separate gate',()=>{deny(()=>prep({photoBase64:'synthetic'}),'PHOTO_GATE_PENDING');deny(()=>prep({saveType:'uploaded'}),'PHOTO_FREE_STATUS_ONLY')})
check('hold duration and frozen plan link validated',()=>{deny(()=>prep({effectiveWorkingMinutes:600}),'TIMING_MISMATCH');deny(()=>prep({monthlyPlanLineId:'uat-other'}),'SOURCE_DP_MISMATCH')})
check('more than four materials blocked rather than silently truncated',()=>deny(()=>sprayFormSource({...source,materials:Array(5).fill(source.materials[0])}),'SPRAY_MATERIAL_SLOT_LIMIT'))
check('historical order and name preserved but changed source rejected',()=>{assert.deepEqual(historicalSpraySource({...source,planningOrder:2,executionForemanName:'Renamed'},source),source);deny(()=>historicalSpraySource({...source,area100:600},source),'QC_SPRAY_SOURCE_CHANGED')})
check('area precision enforced and draft allowed',()=>{const rr=planningSprayFixture(source,{area:9.001});deny(()=>preparePlanningSpray({...input,record:rr},source,uid),'SPRAY_AREA_PRECISION');assert.equal(prep({saveType:'draft'}).record.saveType,'draft')})
console.log('SUCCESS: '+n+' Planning full Spray commit contract checks (offline)')
