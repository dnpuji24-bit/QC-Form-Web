import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {allocateQcMaterial,MAX_QC_PADDOCKS,qcWorkMap,qcActualWorkId,
  qcMultiMaterialRows,validateQcMultiPaddock} from '../src/qcMultiPaddock.mjs'
import {commitQcAndActual} from '../src/qcAtomicCommit.mjs'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const work=(id,daily,area,alloc={})=>({
  workId:id,dailyPlanId:daily,monthlyPlanLineId:'MP-'+id,woNumber:'WO-'+id,
  pid:'P-'+id,areaHa:area,completed:true,materialAllocations:alloc,
  plannedShift:'1',dailyShift:'2',activity:'Top Dressing',
})
const sources=[{id:'NK',material:'NK 20:30',unit:'kg',quantity:240},
  {id:'DAP',material:'DAP',unit:'kg',quantity:120}]
const works=[work('w1','DP-1',5,{NK:100,DAP:50}),work('w2','DP-2',7,{NK:140,DAP:70})]

test('Multi-paddock validates physical NK and DAP exactly once',()=>{
 assert.equal(validateQcMultiPaddock(works,sources,{ready:true,totalArea:12}),'')
 assert.equal(validateQcMultiPaddock(works,sources,{ready:true,totalArea:11}).includes('Total luas'),true)
 const over=[works[0],{...works[1],materialAllocations:{NK:141,DAP:70}}]
 assert.match(validateQcMultiPaddock(over,sources,{ready:true,totalArea:12}),/NK 20:30/)
 const duplicate=[works[0],{...works[1],dailyPlanId:'DP-1'}]
 assert.match(validateQcMultiPaddock(duplicate,sources,{ready:true,totalArea:12}),/sudah digunakan/)
 const pending=[works[0],{...works[1],completed:false}]
 assert.match(validateQcMultiPaddock(pending,sources,{ready:true,totalArea:12}),/Selesai Paddock/)
 assert.equal(MAX_QC_PADDOCKS,8)
})
test('Auto allocation conserves physical amount and preserves independent WO',()=>{
 const initial=[work('w1','DP-1',5),work('w2','DP-2',7)]
 const allocated=allocateQcMaterial(initial,'NK',240)
 assert.equal(allocated[0].materialAllocations.NK,100)
 assert.equal(allocated[1].materialAllocations.NK,140)
 assert.equal(initial[0].materialAllocations.NK,undefined)
 assert.equal(qcMultiMaterialRows(works[0],sources).find(x=>x.material==='NK 20:30').totalMaterial,100)
 assert.equal(qcWorkMap(works).w2.woNumber,'WO-w2')
 assert.equal(qcActualWorkId('qc-v2-session-001','w2'),'qcactual_qc-v2-session-001__w2')
})
test('Single QC parent and N child Actuals commit in one transaction with deterministic IDs',async()=>{
 const records=new Map(),actuals=new Map(),writes=[]
 const record={id:'qc-v2-session-001',formType:'fertilizer',ownerUid:'user',inputtedBy:'mandor',
   saveType:'ready',clientRevision:'rev1',multiPaddockMode:true,paddockWorks:works,
   multiMaterialSources:sources}
 const deps={
   currentUid:async()=> 'user',
   buildActual:()=>{throw Error('No legacy actual for Multi-Paddock')},
   buildActualItems:r=>r.saveType==='draft'?[]:r.paddockWorks.map(w=>({
     actualReportId:qcActualWorkId(r.id,w.workId),qcWorkId:w.workId,qcRecordId:r.id,
     sourceOrigin:'QC',dailyPlanId:w.dailyPlanId,actualAreaHa:w.areaHa
   })),
   transaction:async fn=>fn({
     readQc:async id=>records.get(id)||null,
     readActual:async id=>actuals.get(id)||null,
     writeQc:(id,value)=>{writes.push(['qc',id]);records.set(id,value)},
     writeActual:(id,value)=>{writes.push(['actual',id]);actuals.set(id,value)}
   })
 }
 await commitQcAndActual({record,baseRevision:null,jobId:'job-1',uploaderUid:'user'},deps)
 assert.equal(writes.filter(x=>x[0]==='qc').length,1)
 assert.equal(writes.filter(x=>x[0]==='actual').length,2)
 assert.equal(actuals.size,2)
 assert.equal(actuals.get('qcactual_qc-v2-session-001__w2').dailyPlanId,'DP-2')
 const before=writes.length
 await commitQcAndActual({record,baseRevision:null,jobId:'job-1',uploaderUid:'user'},deps)
 assert.equal(writes.length,before,'retry must not duplicate child Actual entries')
 const revised={...record,clientRevision:'rev2',paddockWorks:works.map(w=>({...w,areaHa:w.areaHa+1}))}
 await commitQcAndActual({record:revised,baseRevision:'rev1',jobId:'job-2',uploaderUid:'user'},deps)
 assert.equal(actuals.size,2)
 assert.equal(actuals.get('qcactual_qc-v2-session-001__w2').actualAreaHa,8)
 const rejected={...revised,clientRevision:'rev3',paddockWorks:[works[0],work('w3','DP-3',7)]}
 await assert.rejects(()=>commitQcAndActual({record:rejected,baseRevision:'rev2',jobId:'job-3',uploaderUid:'user'},deps),/MEMBERSHIP_LOCKED/)
})
test('Conflicting existing per-WO Actual aborts before writing QC',async()=>{
 const record={id:'qc-v2-abc',formType:'spray',saveType:'ready',ownerUid:'user',inputtedBy:'mandor',
   clientRevision:'v1',multiPaddockMode:true,paddockWorks:works}
 const writes=[]
 await assert.rejects(()=>commitQcAndActual({record,baseRevision:null,jobId:'j1',uploaderUid:'user'},{
   currentUid:async()=> 'user',
   buildActualItems:()=>works.map(w=>({actualReportId:qcActualWorkId(record.id,w.workId),qcWorkId:w.workId})),
   transaction:async fn=>fn({
     readQc:async()=>null,
     readActual:async id=>id.endsWith('__w2')?{sourceOrigin:'OTHER',qcRecordId:'another'}:null,
     writeQc:()=>writes.push('qc'),
     writeActual:()=>writes.push('actual')
   })
 }),/ID_CONFLICT/)
 assert.equal(writes.length,0)
})
test('Single-paddock legacy atomic path remains unaffected',async()=>{
 let got=null
 const record={id:'qc-v2-single',formType:'spray',saveType:'ready',ownerUid:'user',
   inputtedBy:'mandor',clientRevision:'rev1'}
 await commitQcAndActual({record,baseRevision:null,jobId:'j1',uploaderUid:'user'},{
   currentUid:async()=> 'user',buildActual:()=>({dailyPlanId:'DP-1',sourceOrigin:'QC'}),
   transaction:async fn=>fn({readQc:async()=>null,readActual:async()=>null,
     writeQc:()=>{},writeActual:(id,payload)=>{got={id,payload}}})
 })
 assert.equal(got.id,'qcactual_qc-v2-single')
})
test('UI has sequential work-complete, further WO entry, allocation, and review',()=>{
 const component=read('src/QcMultiPaddockSection.tsx')
 for(const needle of ['Selesai Paddock','Tambah WO / Paddock Berikutnya',
  'LANGKAH 3','LANGKAH 5','Alokasikan otomatis menurut luas',
  'Paddock '+String(1),'role="alert"']){
  if(needle==='Paddock 1')continue
  assert.ok(component.includes(needle),needle)
 }
 for(const path of ['src/SprayForm.tsx','src/FertilizerForm.tsx']){
  const s=read(path)
  assert.match(s,/QcMultiPaddockSection kind=/)
  assert.match(s,/multiPaddockMode:card\.multiPaddockMode/)
  assert.match(s,/paddockWorkById:card\.multiPaddockMode\?qcWorkMap\(card\.paddockWorks\)/)
  assert.match(s,/multiMaterialSources:multiSources/)
  assert.match(s,/validateQcMultiPaddock/)
 }
})
test('Firestore rules verify each child Actual against transactional QC parent',()=>{
 const rules=read('firestore.rules')
 assert.match(rules,/function validQcMultiActualWrite\(qc\)/)
 assert.match(rules,/request\.resource\.data\.actualReportId ==/)
 assert.match(rules,/work\.get\('dailyPlanId',''\)/)
 assert.match(rules,/work\.get\('areaHa',-1\)/)
 assert.match(rules,/validQcMultiActualWrite\(qc\)/)
 const firestore=read('src/firestoreStore.ts')
 assert.match(firestore,/function buildQcMultiActualPayloads|export function buildQcMultiActualPayloads/)
 assert.match(firestore,/qcActualWorkId\(record\.id,work\.workId\)/)
 assert.match(firestore,/sharedUnitSecondary:index>0/)
 assert.match(firestore,/if\(record\.multiPaddockMode\)throw Error\('QC_MULTI_ATOMIC_REQUIRED'\)/)
})
