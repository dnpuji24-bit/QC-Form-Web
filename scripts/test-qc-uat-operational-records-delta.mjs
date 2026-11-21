// 11D.5c.4.3 — fast offline QC/Actual read-model delta only.
import assert from 'node:assert/strict'
import {operationalRecordsRequest,operationalRecordsProjection} from '../src/qcUatOperationalRecords.mjs'
let n=0
const check=(label,fn)=>{fn();console.log('PASS: '+label);n++}
function pair(id,kind){
 const qc={testOnly:true,id,ownerUid:'uat-owner',clientRevision:'uat-r1',dailyPlanId:'uat-ds',
  pid:'uat-p1',foreman:'uat-f1',shift:'1',date:'2026-11-03',formType:kind,saveType:'ready',
  ...(kind==='spray'?{actualArea100:900}:{applicationArea100:1300})}
 const detail={testOnly:true,canonicalQcId:id,fullRecordId:'qc-v2-'+id,
  clientRevision:'uat-r1',ownerUid:'uat-owner',form:{id:'qc-v2-'+id,
   formType:kind,clientRevision:'uat-r1',saveType:'ready'}}
 const audit={testOnly:true,recordId:id,revision:'uat-r1',actorUid:'uat-owner',formType:kind,saveType:'ready'}
 const actual={testOnly:true,actualReportId:'qcactual_'+id,qcRecordId:id,sourceOrigin:'QC',
  qcFormType:kind,clientRevision:'uat-r1',ownerUid:'uat-owner',dailyPlanId:'uat-ds',
  pid:'uat-p1',foreman:'uat-f1',shift:'1',date:'2026-11-03',
  ...(kind==='spray'?{actualArea100:900}:{applicationArea100:1300,
   fertilizerComponents:[{componentId:'uat-nk',actualArea100:800},{componentId:'uat-dap',actualArea100:500}]})}
 return {id,qc,detail,fullAudit:structuredClone(detail),audit,actual}
}
const spray=pair('uat-r-spray','spray'),fert=pair('uat-r-fertilizer','fertilizer')
const q={monthKey:'2026-11',kind:'all'}
check('month/kind contract and bounded safe read model distinguishes physical vs component hectares',()=>{
 assert.equal(operationalRecordsRequest(q).endDate,'2026-11-30')
 const v=operationalRecordsProjection(q,[spray,fert])
 assert.equal(v.readOnly,true)
 assert.equal(v.recordCount,2)
 assert.deepEqual(v.records.map(x=>x.actual.semantics),['COMPONENT_APPLICATION_SUM','PHYSICAL_APPLICATION'])
 assert.equal(v.records.find(x=>x.formType==='spray').actual.area100,900)
 const f=v.records.find(x=>x.formType==='fertilizer')
 assert.equal(f.actual.applicationArea100,1300)
 assert.deepEqual(f.actual.components.map(x=>x.area100),[800,500])
 assert.doesNotMatch(JSON.stringify(v),/photoBase64|objectPath|signedUrl|operationalPayloadFingerprint|actUsagePesticide/)
 assert.equal(operationalRecordsProjection({monthKey:'2026-11',kind:'spray'},[spray,fert]).recordCount,1)
 assert.throws(()=>operationalRecordsRequest({monthKey:'2026-11',kind:'all',path:'/users'}),{message:'INVALID_RECORDS_REQUEST'})
})
check('tampered QC revisions, full audits and actual component sums fail closed',()=>{
 assert.throws(()=>operationalRecordsProjection(q,[{...spray,qc:{...spray.qc,testOnly:false}}]),{message:'INVALID_RECORDS_QC'})
 assert.throws(()=>operationalRecordsProjection(q,[{...spray,fullAudit:{...spray.fullAudit,clientRevision:'uat-forged'}}]),{message:'RECORDS_FULL_AUDIT_CONFLICT'})
 assert.throws(()=>operationalRecordsProjection(q,[{...spray,audit:{...spray.audit,actorUid:'uat-other'}}]),{message:'RECORDS_AUDIT_CONFLICT'})
 assert.throws(()=>operationalRecordsProjection(q,[{...fert,actual:{...fert.actual,applicationArea100:1200}}]),{message:'RECORDS_ACTUAL_CONFLICT'})
 assert.throws(()=>operationalRecordsProjection(q,[spray,spray]),{message:'INVALID_RECORDS_QC'})
})
check('draft QC has no Actual, missing ready Actual cannot silently imply completion',()=>{
 const draft=pair('uat-r-draft','spray')
 draft.qc={...draft.qc,saveType:'draft',actualArea100:0}
 draft.detail={...draft.detail,form:{...draft.detail.form,saveType:'draft'}}
 draft.fullAudit=structuredClone(draft.detail)
 draft.audit={...draft.audit,saveType:'draft'}
 draft.actual=null
 const v=operationalRecordsProjection(q,[draft])
 assert.equal(v.records[0].actual,null)
 assert.throws(()=>operationalRecordsProjection(q,[{...spray,actual:null}]),{message:'RECORDS_MISSING_ACTUAL'})
 assert.throws(()=>operationalRecordsProjection(q,[{...draft,actual:spray.actual}]),{message:'RECORDS_ACTUAL_CONFLICT'})
})
console.log('SUCCESS: '+n+' focused Data QC/Actual read-only delta checks passed (OFFLINE)')
