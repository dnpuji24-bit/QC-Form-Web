// 11D.5c.4.4 — latest 100 and exact cross-period identifiers (delta-only).
// No Firebase Emulator, Storage access, tokens or production writes.
import assert from 'node:assert/strict'
import {operationalRecordsBrowseRequest,operationalRecordsProjection} from '../src/qcUatOperationalRecords.mjs'
let n=0
const check=(label,fn)=>{fn();console.log('PASS: '+label);n++}
function pair(id,kind,date,pid='uat-p1'){
 const qc={testOnly:true,id,ownerUid:'uat-owner',clientRevision:'uat-r1',dailyPlanId:'uat-d1',
  pid,foreman:'uat-f1',shift:'1',date,formType:kind,saveType:'ready',
  ...(kind==='spray'?{actualArea100:900}:{applicationArea100:1300})}
 const detail={testOnly:true,canonicalQcId:id,fullRecordId:'qc-v2-'+id,
  clientRevision:'uat-r1',ownerUid:'uat-owner',form:{id:'qc-v2-'+id,
   formType:kind,clientRevision:'uat-r1',saveType:'ready'}}
 const audit={testOnly:true,recordId:id,revision:'uat-r1',actorUid:'uat-owner',formType:kind,saveType:'ready'}
 const actual={testOnly:true,actualReportId:'qcactual_'+id,qcRecordId:id,sourceOrigin:'QC',
  qcFormType:kind,clientRevision:'uat-r1',ownerUid:'uat-owner',dailyPlanId:'uat-d1',
  pid,foreman:'uat-f1',shift:'1',date,
  ...(kind==='spray'?{actualArea100:900}:{applicationArea100:1300,
   fertilizerComponents:[{componentId:'uat-nk',actualArea100:800},{componentId:'uat-dap',actualArea100:500}]})}
 return {id,qc,detail,fullAudit:structuredClone(detail),audit,actual}
}
const p1=pair('uat-old','spray','2025-03-04'),p2=pair('uat-mid','fertilizer','2026-11-03'),p3=pair('uat-new','spray','2027-01-04')
check('fixed browse shapes deny free text, extra properties and invalid IDs',()=>{
 assert.deepEqual(operationalRecordsBrowseRequest({mode:'recent',kind:'all'}),{mode:'recent',kind:'all'})
 assert.deepEqual(operationalRecordsBrowseRequest({mode:'exact',kind:'spray',term:'uat-p1'}),{
  mode:'exact',kind:'spray',term:'uat-p1'})
 for(const x of [
  {mode:'recent',kind:'all',term:'uat-p1'},
  {mode:'exact',kind:'all',term:'p1'},
  {mode:'exact',kind:'all',term:'uat-a/',path:'/users'},
  {mode:'fuzzy',kind:'all'},
  {mode:'exact',kind:'all',term:'uat-p1',where:'any'},
 ] )assert.throws(()=>operationalRecordsBrowseRequest(x),{message:'INVALID_RECORDS_BROWSE_REQUEST'})
})
check('recent 100 projects audited QC across dates newest first, without raw DTO/photos',()=>{
 const data=operationalRecordsProjection({mode:'recent',kind:'all'},[p1,p2,p3])
 assert.deepEqual(data.records.map(x=>x.id),['uat-new','uat-mid','uat-old'])
 assert.equal(data.recordCount,3)
 assert.deepEqual(data.records[1].actual.components.map(x=>x.area100),[800,500])
 assert.doesNotMatch(JSON.stringify(data),/signedUrl|objectPath|photoBase64|actUsagePesticide|jobId/)
 assert.throws(()=>operationalRecordsProjection({mode:'recent',kind:'all'},Array.from({length:101},()=>p1)),
  {message:'RECORDS_SCOPE_LIMIT'})
})
check('exact ID lookup never matches unrelated QC and still requires immutable audits',()=>{
 const exact={mode:'exact',kind:'all',term:'uat-p1'}
 const data=operationalRecordsProjection(exact,[p1,p2,p3])
 assert.equal(data.recordCount,3)
 assert.equal(operationalRecordsProjection({mode:'exact',kind:'all',term:'uat-old'},[p1]).recordCount,1)
 const foreign=pair('uat-foreign','spray','2027-02-02','uat-other')
 assert.throws(()=>operationalRecordsProjection(exact,[foreign]),{message:'RECORDS_SEARCH_MISMATCH'})
 assert.throws(()=>operationalRecordsProjection(exact,[{...p1,
  fullAudit:{...p1.fullAudit,clientRevision:'uat-r2'}}]),{message:'RECORDS_FULL_AUDIT_CONFLICT'})
 assert.throws(()=>operationalRecordsProjection(exact,[{...p1,
  actual:{...p1.actual,actualArea100:800}}]),{message:'RECORDS_ACTUAL_CONFLICT'})
})
console.log('SUCCESS: '+n+' newest-100 and exact-ID Data QC delta contracts passed (OFFLINE)')
