import assert from 'node:assert/strict'
import {prepareUnifiedOperationalQc,parseUnifiedAreaHa} from '../src/qcUatUnifiedOperationalForm.mjs'
import {planningQcInput,planningQcSnapshot} from '../src/qcUatPlanningQcBridge.mjs'
import {nextPlanningRow} from '../src/qcUatPlanningWriteContract.mjs'
const source={testOnly:true,dailyPlanId:'uat-ds',monthlyPlanLineId:'',pid:'uat-p1',date:'2026-11-03',shift:'1',foreman:'uat-f1',formType:'spray',area100:1000,revision:0,readOnly:true}
const mk=(changes={})=>({source,uid:'uat-operator',recordId:'uat-qs',sessionId:'uat-session-1',clientRevision:'uat-rev-1',jobId:'uat-job-1',saveType:'ready',actualArea100:1200,...changes})
const copy=x=>JSON.parse(JSON.stringify(x))
const reject=(f,message)=>assert.throws(f,{message})
let n=0;const check=(label,fn)=>{fn();n++;console.log('PASS: '+label)}
check('Spray ready maps real Daily source identity without trusting a user-selected PID',()=>{
 const q=prepareUnifiedOperationalQc(mk())
 assert.equal(q.record.formType,'spray')
 assert.equal(q.record.pid,'uat-p1')
 assert.equal(q.record.dailyPlanId,'uat-ds')
 assert.equal(q.expectedDailyRevision,0)
 assert.deepEqual(planningQcInput(q),q)
})
check('Fertilizer ADHOC has no Monthly Plan link and independent form type',()=>{
 const q=prepareUnifiedOperationalQc(mk({source:{...source,formType:'fertilizer'},recordId:'uat-qf'}))
 assert.equal(q.record.formType,'fertilizer')
 assert.equal(q.record.monthlyPlanLineId,'')
})
check('over-actual is allowed and DP target is not modified by client DTO',()=>{
 const q=prepareUnifiedOperationalQc(mk({actualArea100:1900}))
 assert.equal(q.record.actualArea100,1900)
 assert.equal(source.area100,1000)
 assert.equal(q.record.plannedDailyArea100,undefined)
})
check('draft 0 Ha allowed without creating any client-chosen Actual fields',()=>{
 const q=prepareUnifiedOperationalQc(mk({saveType:'draft',actualArea100:0}))
 assert.equal(q.record.saveType,'draft')
 assert.equal(q.record.actualArea100,0)
 assert.equal(q.record.sourceOrigin,undefined)
})
check('ready 0 Ha is denied, wrong form statuses and floating area denied',()=>{
 reject(()=>prepareUnifiedOperationalQc(mk({actualArea100:0})),'INVALID_FORM_AREA')
 reject(()=>prepareUnifiedOperationalQc(mk({saveType:'uploaded'})),'INVALID_FORM_STATUS')
 reject(()=>prepareUnifiedOperationalQc(mk({actualArea100:12.5})),'INVALID_FORM_AREA')
})
check('area conversion uses exact hundredths Ha, no exponential or localized ambiguity',()=>{
 assert.equal(parseUnifiedAreaHa('12.50'),1250)
 assert.equal(parseUnifiedAreaHa('0.01'),1)
 assert.equal(parseUnifiedAreaHa('100'),10000)
 for(const bad of ['0','-1','1.234','1,23','1e3','',' ','0.001'])reject(()=>parseUnifiedAreaHa(bad),'INVALID_AREA_HA')
})
check('forged source or material fields and non-synthetic actor rejected before transport',()=>{
 reject(()=>prepareUnifiedOperationalQc(mk({source:{...source,companyCode:'secret'}})),'INVALID_FORM_SOURCE')
 reject(()=>prepareUnifiedOperationalQc(mk({source:{...source,readOnly:false}})),'SYNTHETIC_ONLY')
 reject(()=>prepareUnifiedOperationalQc(mk({uid:'real-production-user'})),'INVALID_SYNTHETIC_ID')
 reject(()=>prepareUnifiedOperationalQc({...mk(),photoBase64:'xyz'}),'INVALID_FORM_INPUT')
})
check('incorrect date, form, source UID, and revision rejected',()=>{
 reject(()=>prepareUnifiedOperationalQc(mk({source:{...source,date:'2026-02-30'}})),'INVALID_FORM_DATE')
 reject(()=>prepareUnifiedOperationalQc(mk({source:{...source,formType:'pesticide'}})),'INVALID_FORM_SOURCE')
 reject(()=>prepareUnifiedOperationalQc(mk({source:{...source,revision:1.2}})),'INVALID_FORM_SOURCE')
 reject(()=>prepareUnifiedOperationalQc(mk({source:{...source,foreman:'test'}})),'INVALID_FORM_SOURCE')
})
check('canonical receipt is compatible with real planning QC snapshot bridge',()=>{
 const q=prepareUnifiedOperationalQc(mk())
 const dp=nextPlanningRow('daily',{action:'create',id:'uat-ds',expectedRevision:null,fields:{pid:'uat-p1',activityId:'uat-a1',sourceType:'ADHOC',monthlyPlanLineId:'',date:'2026-11-03',shift:'1',foreman:'uat-f1',formType:'spray',area100:1000}},null,'uat-operator')
 const snap=planningQcSnapshot(q,dp,null,'uat-operator')
 assert.equal(snap.area100,1000)
})
check('stable submission identity makes transport retries byte-for-byte identical',()=>{
 const a=prepareUnifiedOperationalQc(mk()),b=prepareUnifiedOperationalQc(copy(mk()))
 assert.deepEqual(a,b)
 assert.equal(a.record.clientRevision,b.record.clientRevision)
 assert.equal(a.jobId,b.jobId)
})
console.log('SUCCESS: '+n+' isolated QC Spray/Fertilizer UAT form contract checks passed (offline)')
