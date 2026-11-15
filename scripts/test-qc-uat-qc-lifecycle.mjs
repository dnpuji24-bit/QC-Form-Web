import {requireThat,legacyEligibility,commitSyntheticQc} from '../src/qcUatQcLifecycleContract.mjs'

function harness(kind='spray'){
  const row={testOnly:true,id:'uat-qc-a',ownerUid:'uat-owner',inputtedBy:'uat-user',formType:kind,clientRevision:'uat-r1',saveType:'draft',dailyPlanId:'uat-dp-a',monthlyPlanLineId:'uat-mp-a',pid:'uat-pid-a',date:'2026-11-12',shift:'2',foreman:'uat-foreman',actualArea100:250,sessionId:'uat-session'};
  const daily={testOnly:true,dailyPlanId:row.dailyPlanId,monthlyPlanLineId:row.monthlyPlanLineId,pid:row.pid,date:row.date,shift:row.shift,foreman:row.foreman,formType:kind,area100:300};
  const state={qc:new Map(),actual:new Map(),audit:new Map(),daily:new Map([[daily.dailyPlanId,daily]]),uid:row.ownerUid,fail:false,writes:0};
  const deps={currentUid:async()=>state.uid,transaction:async fn=>{
    const q=new Map(state.qc),a=new Map(state.actual),u=new Map(state.audit);let writes=0,writing=false;
    const read=(map,id)=>{requireThat(!writing,'READ_AFTER_WRITE');return map.get(id)??null};
    const write=(map,id,data)=>{writing=true;writes++;map.set(id,{...data})};
    const result=await fn({readQc:async id=>read(q,id),readActual:async id=>read(a,id),readAudit:async id=>read(u,id),readDaily:async id=>read(state.daily,id),writeQc:(id,v)=>write(q,id,v),writeActual:(id,v)=>write(a,id,v),writeAudit:(id,v)=>write(u,id,v)});
    if(state.fail)throw Error('SIMULATED_ROLLBACK');
    state.qc=q;state.actual=a;state.audit=u;state.writes+=writes;return result;
  }};
  const run=(changes={},baseRevision=null,jobId='uat-job1',uploaderUid=row.ownerUid)=>commitSyntheticQc({record:{...row,...changes},baseRevision,jobId,uploaderUid},deps);
  return {row,daily,state,run};
}

async function tests(){
 let n=0;const eq=(a,b)=>requireThat(JSON.stringify(a)===JSON.stringify(b),'EXPECTED '+JSON.stringify(b)+' GOT '+JSON.stringify(a));
 const reject=async(p,code)=>{let err;try{await p}catch(e){err=e.message}eq(err,code)};
 const test=async(name,fn)=>{try{await fn();n++}catch(e){throw Error(name+': '+e.message)}};
 const id='qcactual_uat-qc-a',audit='uat-qc-a:uat-r1';
 await test('draft writes QC and audit only',async()=>{const h=harness();await h.run();eq([h.state.qc.size,h.state.actual.size,h.state.audit.size,h.state.writes],[1,0,1,2])});
 for(const kind of ['spray','fertilizer'])await test(kind+' ready actual atomic pair',async()=>{const h=harness(kind);await h.run({saveType:'ready'});const a=h.state.actual.get(id);eq([a.actualReportId,a.qcFormType,a.actualArea100,a.plannedDailyArea100,a.dailyVariance100,h.state.writes,h.state.audit.get(audit).actorUid],[id,kind,250,300,50,3,'uat-owner'])});
 await test('draft to ready to uploaded same Actual',async()=>{const h=harness();await h.run();await h.run({saveType:'ready',clientRevision:'uat-r2'},'uat-r1','uat-job2');await h.run({saveType:'uploaded',clientRevision:'uat-r3',actualArea100:350},'uat-r2','uat-job3');eq([h.state.actual.size,h.state.actual.get(id).dailyVariance100,h.state.audit.size,h.state.qc.get(h.row.id).saveType],[1,-50,3,'uploaded'])});
 await test('ready unlinked no Actual',async()=>{const h=harness();await h.run({saveType:'ready',dailyPlanId:'',monthlyPlanLineId:''});eq(h.state.actual.size,0)});
 await test('ADHOC linked DP without monthly',async()=>{const h=harness();h.daily.monthlyPlanLineId='';await h.run({saveType:'ready',monthlyPlanLineId:''});eq(h.state.actual.get(id).monthlyPlanLineId,'')});
 await test('zero area no Actual',async()=>{const h=harness();await h.run({saveType:'ready',actualArea100:0});eq(h.state.actual.size,0)});
 await test('idempotent replay no extra writes',async()=>{const h=harness();await h.run({saveType:'ready'});await h.run({saveType:'ready'});eq([h.state.writes,h.state.audit.size,h.state.actual.size],[3,1,1])});
 await test('replay changed payload denied',async()=>{const h=harness();await h.run({saveType:'ready'});await reject(h.run({saveType:'ready',actualArea100:251}),'QC_REPLAY_PAYLOAD_MISMATCH')});
 await test('replay missing actual requires review',async()=>{const h=harness();await h.run({saveType:'ready'});h.state.actual.delete(id);await reject(h.run({saveType:'ready'}),'QC_REPLAY_REQUIRES_REVIEW')});
 await test('replay missing audit requires review',async()=>{const h=harness();await h.run();h.state.audit.delete(audit);await reject(h.run(),'QC_REPLAY_REQUIRES_REVIEW')});
 await test('stale revision',async()=>{const h=harness();await h.run();await reject(h.run({clientRevision:'uat-r2'},'uat-stale','uat-job2'),'QC_REVISION_CONFLICT')});
 await test('revision reuse',async()=>{const h=harness();await h.run();await reject(h.run({},'uat-r1','uat-job2'),'QC_REVISION_REUSED')});
 await test('job reuse on next revision',async()=>{const h=harness();await h.run();await reject(h.run({clientRevision:'uat-r2'},'uat-r1'),'QC_JOB_REUSED')});
 await test('audit collision',async()=>{const h=harness();h.state.audit.set(audit,{});await reject(h.run(),'QC_REVISION_REUSED')});
 await test('uploaded cannot regress',async()=>{const h=harness();await h.run({saveType:'uploaded'});await reject(h.run({saveType:'ready',clientRevision:'uat-r2'},'uat-r1','uat-job2'),'QC_STATUS_REGRESSION')});
 await test('existing Actual cannot vanish on draft',async()=>{const h=harness();await h.run({saveType:'ready'});await reject(h.run({clientRevision:'uat-r2'},'uat-r1','uat-job2'),'QC_ACTUAL_REMOVAL_REQUIRES_REVIEW')});
 await test('existing Actual cannot vanish on zero',async()=>{const h=harness();await h.run({saveType:'ready'});await reject(h.run({saveType:'ready',actualArea100:0,clientRevision:'uat-r2'},'uat-r1','uat-job2'),'QC_ACTUAL_REMOVAL_REQUIRES_REVIEW')});
 await test('foreign actual collision',async()=>{const h=harness();h.state.actual.set(id,{testOnly:true,actualReportId:id,sourceOrigin:'WEB'});await reject(h.run(),'QC_ACTUAL_ID_CONFLICT')});
 await test('orphan actual requires review',async()=>{const h=harness();h.state.actual.set(id,{testOnly:true,actualReportId:id,sourceOrigin:'QC',qcRecordId:h.row.id});await reject(h.run(),'QC_ORPHAN_ACTUAL_REQUIRES_REVIEW')});
 await test('rollback all three records',async()=>{const h=harness();await h.run({saveType:'ready'});h.state.fail=true;await reject(h.run({saveType:'ready',actualArea100:350,clientRevision:'uat-r2'},'uat-r1','uat-job2'),'SIMULATED_ROLLBACK');eq([h.state.qc.get(h.row.id).clientRevision,h.state.actual.get(id).actualArea100,h.state.audit.size,h.state.writes],['uat-r1',250,1,3])});
 await test('different logged in user',async()=>{const h=harness();h.state.uid='uat-other';await reject(h.run(),'QC_QUEUE_ACCOUNT_MISMATCH')});
 await test('wrong owner',async()=>{const h=harness();await reject(h.run({ownerUid:'uat-other'}),'QC_OWNER_ONLY')});
 await test('foreign owner cannot update',async()=>{const h=harness();await h.run();h.state.uid='uat-other';await reject(h.run({ownerUid:'uat-other',clientRevision:'uat-r2'},'uat-r1','uat-job2','uat-other'),'QC_OWNER_ONLY')});
 await test('immutable form',async()=>{const h=harness();await h.run();h.daily.formType='fertilizer';await reject(h.run({formType:'fertilizer',clientRevision:'uat-r2'},'uat-r1','uat-job2'),'QC_IDENTITY_IMMUTABLE')});
 await test('immutable inputter',async()=>{const h=harness();await h.run();await reject(h.run({inputtedBy:'uat-newuser',clientRevision:'uat-r2'},'uat-r1','uat-job2'),'QC_IDENTITY_IMMUTABLE')});
 for(const [key,value] of [['shift','1'],['date','2026-11-13'],['pid','uat-other-pid'],['foreman','uat-other-foreman'],['monthlyPlanLineId','uat-other-mp']])await test('DP mismatch '+key,async()=>{const h=harness();await reject(h.run({[key]:value}),'DAILY_LINK_MISMATCH')});
 await test('missing daily',async()=>{const h=harness();h.state.daily.clear();await reject(h.run(),'MISSING_DAILY_PLAN')});
 await test('non synthetic refused',async()=>{const h=harness();await reject(h.run({testOnly:false}),'SYNTHETIC_ONLY')});
 await test('legacy id refused',async()=>{const h=harness();await reject(h.run({id:'QC-1'}),'INVALID_SYNTHETIC_ID')});
 await test('legacy status not accepted as canonical',async()=>{const h=harness();await reject(h.run({saveType:'upload_queued'}),'QC_INVALID_STATUS')});
 await test('fractional hundredths refused',async()=>{const h=harness();await reject(h.run({actualArea100:2.5}),'INVALID_AREA100')});
 await test('unexpected field refused',async()=>{const h=harness();await reject(h.run({photoBase64:'abc'}),'INVALID_FIELDS')});
 await test('legacy eligibility matrix',async()=>{const base={testOnly:true,dailyPlanId:'uat-dp-a',actualArea100:100,saveType:'draft',uploadState:''};eq([legacyEligibility(base),...['ready','uploaded','upload_queued'].map(saveType=>legacyEligibility({...base,saveType})),...['queued','uploading','uploaded','failed'].map(uploadState=>legacyEligibility({...base,uploadState})),legacyEligibility({...base,saveType:'ready',dailyPlanId:''}),legacyEligibility({...base,saveType:'ready',actualArea100:0})],[false,true,true,true,true,true,true,true,false,false])});
 return n;
}

console.log('SUCCESS: '+await tests()+' synthetic QC lifecycle checks (mock transaction only)')
