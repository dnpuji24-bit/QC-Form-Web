import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {transformSync} from 'esbuild'
import {test} from 'node:test'

const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const source=read('src/qcDailyPlanSource.ts')
const compiled=transformSync(source,{loader:'ts',format:'cjs',target:'es2022'}).code
const make=(id,data)=>({id,data:()=>data})
const base={date:'2026-11-22',companyCode:'GPA',farm:'F1',areaHa:20,
  masterVariety:'R570',unitName:'Boom Sprayer',planningOrder:1,
  materials:[{material:'Glyphosate',dosePerHa:2,doseUnit:'L',unit:'L',totalMaterial:40}]}
const docs=[
 make('daily-a',{...base,dailyPlanId:'DP-A',monthlyPlanLineId:'MP-A',
  woNumber:'WO-SP-001',plannedShift:'1',operationCode:'10723001',
  coaCode:'60100209',department:'Ratoon Weed Control',shift:'1',foreman:'Mandor A',
  pid:'A-007',activity:'Post Emergence',description:'Post Emergence A',
  type:'SPRAY',activityCategory:'HERBICIDE'}),
 make('daily-b',{...base,dailyPlanId:'DP-B',monthlyPlanLineId:'MP-A',
  woNumber:'WO-SP-001',plannedShift:'1',operationCode:'10723001',
  coaCode:'60100209',department:'Ratoon Weed Control',shift:'2',foreman:'Mandor B',
  pid:'A-007',activity:'Post Emergence',description:'Post Emergence A',
  type:'SPRAY',activityCategory:'HERBICIDE'}),
 make('daily-c',{...base,dailyPlanId:'DP-C',monthlyPlanLineId:'MP-C',
  woNumber:'WO-FERT-002',plannedShift:'2',operationCode:'10724175',
  coaCode:'60100302',department:'Upkeep Manuring',shift:'2',foreman:'Mandor C',
  pid:'J-003',activity:'Top Dressing',description:'Top Dressing C',
  type:'FERTILIZER',activityCategory:'FERTILIZER',
  materials:[{material:'NK 20:30',dosePerHa:450,doseUnit:'kg',unit:'kg',totalMaterial:9000}]}),
 make('daily-legacy',{...base,dailyPlanId:'DP-LEGACY',
  monthlyPlanLineId:'',woNumber:'',shift:'1',foreman:'Mandor D',
  pid:'K-009',activity:'Top Dressing',description:'Top Dressing C',
  type:'FERTILIZER',activityCategory:'FERTILIZER'})
]
const exports={}
const ctx={exports,module:{exports},require:spec=>{
  if(spec==='firebase/firestore')return{
    collection:(_db,key)=>key,
    where:(field,op,value)=>({field,op,value}),
    query:(col,condition)=>({col,condition}),
    getDocs:async q=>{assert.equal(q.col,'daily_plans')
      assert.deepEqual(JSON.parse(JSON.stringify(q.condition)),{field:'date',op:'==',value:'2026-11-22'})
      return{docs}
    }
  }
  if(spec==='./firebase')return{firestoreDb:{connected:true}}
  throw Error('Unexpected import '+spec)
},console}
vm.runInNewContext(compiled,ctx,{filename:'qcDailyPlanSource.transpiled.js'})
const qc=ctx.exports
const rows=await qc.loadQcDailyPlans('2026-11-22')
test('Daily source retains WO, Operation, CoA, planned Shift and materials with real mapper',()=>{
 assert.equal(rows.length,4)
 assert.equal(rows[0].woNumber,'WO-SP-001')
 assert.equal(rows[0].plannedShift,'1')
 assert.equal(rows[0].operationCode,'10723001')
 assert.equal(rows[0].coaCode,'60100209')
 assert.equal(rows[0].department,'Ratoon Weed Control')
 assert.equal(rows[0].materials[0].dosePerHa,2)
 assert.equal(rows.find(r=>r.dailyPlanId==='DP-C').materials[0].dosePerHa,450)
})
test('Explicit WO can source Daily Shift 1 for QC Shift 2 and reverse 2 for 1',()=>{
 const spr=qc.qcWorkOrderPlans(rows,'spray','2026-11-22')
 assert.equal(spr.length,2)
 const shift1=qc.qcExplicitWorkOrderPlan(rows,'spray','2026-11-22','DP-A')
 const shift2=qc.qcExplicitWorkOrderPlan(rows,'spray','2026-11-22','DP-B')
 assert.equal(shift1.shift,'1')
 assert.equal(shift2.shift,'2')
 const actualShift2=qc.qcMergeEligiblePlans(qc.dailyPlansForQcSession(rows,'spray','2026-11-22','2','Mandor B'),[],[shift1])
 const actualShift1=qc.qcMergeEligiblePlans(qc.dailyPlansForQcSession(rows,'spray','2026-11-22','1','Mandor A'),[],[shift2])
 assert.equal(qc.resolveQcSessionPlan(actualShift2,'A-007','Post Emergence','Post Emergence A','DP-A').dailyPlanId,'DP-A')
 assert.equal(qc.resolveQcSessionPlan(actualShift1,'A-007','Post Emergence','Post Emergence A','DP-B').dailyPlanId,'DP-B')
 assert.equal(actualShift2.filter(x=>x.dailyPlanId==='DP-B').length,1)
 assert.equal(qc.qcExplicitWorkOrderPlan(rows,'spray','2026-11-23','DP-A'),null)
 assert.equal(qc.qcExplicitWorkOrderPlan(rows,'fertilizer','2026-11-22','DP-A'),null)
})
test('WO with multiple Daily rows requires exact Daily ID; no guessed sources',()=>{
 assert.deepEqual(Array.from(qc.qcSearchWorkOrders(rows,'WO-SP-001'),r=>r.dailyPlanId),['DP-A','DP-B'])
 assert.equal(qc.qcSearchWorkOrders(rows,'60100302')[0].dailyPlanId,'DP-C')
 assert.equal(qc.qcSearchWorkOrders(rows,'K-009').length,0)
 assert.equal(qc.qcExplicitWorkOrderPlan(rows,'spray','2026-11-22','WO-SP-001'),null)
 assert.equal(qc.resolveQcSessionPlan(rows,'A-007','Post Emergence','Post Emergence A',''),null)
 const dupes=[rows[0],{...rows[0],id:'same-again'}]
 assert.equal(qc.qcExplicitWorkOrderPlan(dupes,'spray','2026-11-22','DP-A'),null)
})
test('Legacy Daily continues in same-shift UI, absent from WO-only results',()=>{
 const normal=qc.dailyPlansForQcSession(rows,'fertilizer','2026-11-22','1','Mandor D')
 assert.equal(normal[0].dailyPlanId,'DP-LEGACY')
 assert.equal(qc.qcWorkOrderPlans(rows,'fertilizer','2026-11-22').length,1)
 assert.equal(qc.qcExplicitWorkOrderPlan(rows,'fertilizer','2026-11-22','DP-LEGACY'),null)
})
test('Both live forms explicitly link WO and preserve immutable Daily/Monthly reference',()=>{
 for(const file of ['src/SprayForm.tsx','src/FertilizerForm.tsx']){
  const s=read(file)
  assert.match(s,/QcWorkOrderSmartSearch rows=\{woOptions\}/)
  assert.match(s,/qcExplicitWorkOrderPlan\(dailyPlanRows/)
  assert.match(s,/qcMergeEligiblePlans/)
  assert.match(s,/dailyPlanId:card\.dailyPlanId,monthlyPlanLineId:card\.monthlyPlanLineId/)
  assert.match(s,/woNumber:cardDailyPlan\?\.woNumber\|\|''/)
  assert.match(s,/operationCode:cardDailyPlan\?\.operationCode\|\|''/)
  assert.match(s,/coaCode:cardDailyPlan\?\.coaCode\|\|''/)
  assert.match(s,/plannedShift:cardDailyPlan\?\.plannedShift\|\|''/)
  assert.match(s,/dailyShift:cardDailyPlan\?\.shift\|\|''/)
  assert.match(s,/dailyForeman:cardDailyPlan\?\.foreman\|\|''/)
  assert.match(s,/qcExplicitWorkOrderPlan\(dailyPlanRows,[^,]+,date,c\.dailyPlanId\)\?c:/)
 }
 const mapper=read('src/firestoreStore.ts')
 for(const attr of ['woNumber','plannedShift','dailyShift','coaCode','operationCode']){
  assert.match(mapper,new RegExp(attr+':String\\(record\\.'+attr+'\\|\\|\\x27\\x27\\)'))
 }
})
test('WO selection stays separate from approved photo and material validation logic',()=>{
 const spray=read('src/SprayForm.tsx'),fert=read('src/FertilizerForm.tsx')
 assert.match(spray,/const materials=\(cardDailyPlan\?\.materials\|\|\[\]\)\.slice\(0,4\)/)
 assert.match(spray,/estimatedAdjuvant/)
 assert.match(fert,/const first=matched\?\.materials\[0\],choices=fertilizerChoices/)
 assert.match(fert,/if\(!c\.fillings\.length\)/)
 assert.match(spray,/queueFormSession\(operationalItems\)/)
 assert.match(fert,/queueFormSession\(operationalItems\)/)
 const picker=read('src/QcWorkOrderSmartSearch.tsx')
 for(const value of ['role="combobox"','role="listbox"',"ArrowDown","ArrowUp","Escape","onSelect(row)"]){
  assert.ok(picker.includes(value))
 }
})
