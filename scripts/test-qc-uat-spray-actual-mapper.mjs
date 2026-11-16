// Source-derived mapper regression: actual function bodies compiled with TS,
 // no Firebase SDK or network module loaded. Transaction adapter is in-memory.
import assert from 'node:assert/strict'
import ts from 'typescript'
import {readFileSync} from 'node:fs'
import {fixture} from './qc-uat-spray-full-dto-fixture.mjs'
import {validateSprayDto} from '../src/qcUatSprayFullDto.mjs'
import {commitQcAndActual} from '../src/qcAtomicCommit.mjs'
import {stripOperationalPhotoPayload} from '../src/qcOperationalPhotoManifest.mjs'
import {operationalQueueId} from '../src/qcOperationalSaveTransport.mjs'
const source=readFileSync(new URL('../src/firestoreStore.ts',import.meta.url),'utf8')
const parsed=ts.createSourceFile('firestoreStore.ts',source,ts.ScriptTarget.Latest,true)
const names=['qcActualArea','qcActualEligible','qcActualReportId','qcActualMaterials','buildQcActualPayload']
const picked=names.map(name=>{
 const matches=parsed.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name)
 assert.equal(matches.length,1,'ACTUAL_MAPPER_SOURCE_CHANGED: '+name)
 return matches[0].getText(parsed)
})
const code="const firebaseAuth={currentUser:{email:'synthetic@example.test'}};const serverTimestamp=()=>({fixtureTimestamp:true});\n"+picked.join('\n')
const compiled=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true})
assert.deepEqual(compiled.diagnostics,[])
const {buildQcActualPayload}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputText).toString('base64'))
let n=0
const check=async(name,fn)=>{await fn();n++;console.log('PASS: '+name)}
function sample(){const {r,dp}=fixture();return {r:validateSprayDto(r,dp),dp}}
function harness(){
 let qc=new Map(),ap=new Map(),audit=new Map(),fail=false
 const currentUid=async()=> 'uat-spray'
 return {
  qc:()=>qc,ap:()=>ap,audit:()=>audit,fail:()=>{fail=true},
  deps:{currentUid,buildActual:buildQcActualPayload,transaction:async fn=>{
   const q=new Map(qc),a=new Map(ap),u=new Map(audit)
   const result=await fn({
    readQc:async id=>q.get(id)??null,readActual:async id=>a.get(id)??null,
    writeQc:(id,row)=>{q.set(id,structuredClone(row));u.set(id+':'+row.clientRevision,{recordId:id,revision:row.clientRevision})},
    writeActual:(id,row)=>a.set(id,structuredClone(row))
   })
   if(fail){fail=false;throw Error('MOCK_TRANSACTION_ABORT')}
   qc=q;ap=a;audit=u;return result
  }}
 }
}
const commit=(h,r,baseRevision=null)=>commitQcAndActual({record:stripOperationalPhotoPayload(r),baseRevision,jobId:operationalQueueId(r.ownerUid,r.id,r.clientRevision),uploaderUid:r.ownerUid},h.deps)
await check('actual mapper preserves source DP MP and actual shift foreman',()=>{
 const {r}=sample(),a=buildQcActualPayload(r)
 assert.equal(a.dailyPlanId,r.dailyPlanId);assert.equal(a.monthlyPlanLineId,r.monthlyPlanLineId);assert.equal(a.shift,'2');assert.equal(a.foreman,'Mandor B');assert.equal(a.pid,r.paddock);assert.equal(a.actualReportId,'qcactual_'+r.id)
})
await check('actual mapper retains over-actual area and negative variance',()=>{
 const {r}=sample(),a=buildQcActualPayload(r)
 assert.equal(a.actualAreaHa,9);assert.equal(a.plannedDailyAreaHa,8);assert.equal(a.dailyVarianceHa,-1)
})
await check('actual mapper carries source metadata and calculated material array',()=>{
 const {r}=sample(),a=buildQcActualPayload(r)
 assert.equal(a.companyCode,r.companyCode);assert.equal(a.farm,r.farm);assert.equal(a.planningOrder,r.dailyPlanningOrder);assert.equal(a.qcSessionId,r.sessionId);assert.deepEqual(a.materials,r.actualPlanMaterials)
})
await check('draft never generates Actual in fresh DTO',()=>{
 const {r}=sample();assert.equal(buildQcActualPayload({...r,saveType:'draft'}),null)
})
await check('two shifts on same source create distinct Actual IDs in atomic core',async()=>{
 const {r,dp}=sample(),h=harness(),r1={...r,id:'qc-v2-uat-shift1',shift:'1',name:dp.foreman,clientRevision:'uat-r1'}
 validateSprayDto(r1,dp)
 await commit(h,r1);await commit(h,r)
 assert.equal(h.qc().size,2);assert.equal(h.ap().size,2);assert.equal(h.audit().size,2)
 const rows=[...h.ap().values()];assert.deepEqual(rows.map(a=>a.dailyPlanId),[dp.dailyPlanId,dp.dailyPlanId]);assert.deepEqual(rows.map(a=>a.shift),['1','2']);assert.equal(rows.reduce((s,a)=>s+a.actualAreaHa,0),18)
})
await check('correction updates same Actual and retains source link',async()=>{
 const {r,dp}=sample(),h=harness();await commit(h,r)
 const corrected={...r,clientRevision:'uat-r2',area:'10',actualAreaHa:10,productivityHaPerHour:1.11,estUsageAdjuvant:(0.5*350*10/1000).toFixed(2),estUsagePesticide1:'20.00',actualPlanMaterials:[{...r.actualPlanMaterials[0],totalMaterial:20}]}
 validateSprayDto(corrected,dp);await commit(h,corrected,'uat-r1')
 assert.equal(h.ap().size,1);assert.equal(h.ap().get('qcactual_'+r.id).actualAreaHa,10);assert.equal(h.ap().get('qcactual_'+r.id).dailyPlanId,dp.dailyPlanId);assert.equal(h.audit().size,2)
})
await check('aborted mock transaction leaves QC Actual and audit unchanged',async()=>{
 const {r}=sample(),h=harness();h.fail();await assert.rejects(commit(h,r),/MOCK_TRANSACTION_ABORT/);assert.equal(h.qc().size,0);assert.equal(h.ap().size,0);assert.equal(h.audit().size,0);await commit(h,r);assert.equal(h.ap().size,1)
})
await check('photo binaries stripped while HOLD timing persists',async()=>{
 const {r}=sample(),h=harness();r.photoBase64='data:image/png;base64,AA==';r.holdIntervals[0].photoBase64='data:image/png;base64,AA==';await commit(h,r)
 const q=h.qc().get(r.id);assert.equal(q.photoBase64,undefined);assert.equal(q.holdIntervals[0].photoBase64,undefined);assert.equal(q.holdIntervals[0].start,'23:30');assert.equal(q.effectiveWorkingMinutes,540)
})
console.log('SUCCESS: '+n+' actual Spray-to-Actual mapper and atomic core checks (mock transaction only)')
