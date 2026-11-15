import {check,planningWeek,varietySelection,planningProgress} from '../src/qcUatPlanningProgressContract.mjs'

function fixture(){return {testOnly:true,monthlyPlans:[{id:'uat-doc-a',planLineId:'uat-mp-a',pid:'uat-pid-a',description:'Spray A',targetArea100:500,manualActualArea100:100,monthKey:'2026-11',week:'W2',cancelled:false,finished:false,sourceStatus:''}],dailyPlans:[{id:'uat-dp-a',monthlyPlanLineId:'uat-mp-a',pid:'uat-pid-a',description:'Spray A',area100:300,date:'2026-11-12',sourceType:'MONTHLY',monthlyLinkStatus:'LINKED'}],actualReports:[{id:'uat-ap-a',monthlyPlanLineId:'uat-mp-a',pid:'uat-pid-a',description:'Spray A',actualArea100:200}]}}

function testAll(){let n=0;function test(name,fn){try{fn();n++}catch(e){throw Error(name+': '+e.message)}}function eq(a,b){check(JSON.stringify(a)===JSON.stringify(b),'EXPECTED '+JSON.stringify(b)+' GOT '+JSON.stringify(a))}function change(edit){const f=fixture();edit(f);return planningProgress(f)}function reject(name,edit,code){test(name,()=>{let err;try{change(edit)}catch(e){err=e.message}eq(err,code)})}
test('W1 W2 W3 W4',()=>{eq(['W1','W2','W3','W4'].map(w=>planningWeek('2026-11',w)),[{startDate:'2026-11-01',endDate:'2026-11-07'},{startDate:'2026-11-08',endDate:'2026-11-15'},{startDate:'2026-11-16',endDate:'2026-11-22'},{startDate:'2026-11-23',endDate:'2026-11-30'}])});
test('leap year',()=>eq(planningWeek('2028-02','W4').endDate,'2028-02-29'));
test('manual progress added once',()=>{const r=planningProgress(fixture()).rows[0];eq([r.linkedActualArea100,r.systemActualArea100,r.systemBalance100,r.unallocatedArea100,r.progressPct,r.systemStatus],[200,300,200,200,60,'ON PROGRESS'])});
test('planned',()=>eq(change(f=>{f.monthlyPlans[0].manualActualArea100=0;f.actualReports=[]}).rows[0].systemStatus,'PLANNED'));
test('done',()=>eq(change(f=>f.actualReports[0].actualArea100=400).rows[0].systemStatus,'DONE'));
test('over actual negative balance',()=>{const r=change(f=>f.actualReports[0].actualArea100=550).rows[0];eq([r.systemActualArea100,r.systemBalance100,r.systemStatus,r.progressPct],[650,-150,'OVER ACTUAL',130])});
test('over scheduling negative unallocated',()=>eq(change(f=>f.dailyPlans[0].area100=600).rows[0].unallocatedArea100,-100));
test('finished preserves raw actual and zero display balance',()=>{const r=change(f=>f.monthlyPlans[0].finished=true).rows[0];eq([r.systemActualArea100,r.rawBalance100,r.systemBalance100,r.unallocatedArea100,r.systemStatus],[300,200,0,0,'DONE'])});
test('cancelled progress',()=>{const r=change(f=>f.monthlyPlans[0].sourceStatus='CANCELLED').rows[0];eq([r.progressPct,r.systemBalance100,r.systemStatus],[100,0,'DONE'])});
test('legacy finish',()=>eq(change(f=>f.monthlyPlans[0].sourceStatus='FINISHED').rows[0].finished,true));
test('cross-month existing link preserved',()=>{const r=change(f=>f.dailyPlans[0].date='2026-10-30').rows[0];eq([r.scheduledArea100,r.outOfPeriodDailyIds],[300,['uat-dp-a']])});
test('adhoc and support excluded',()=>{const r=change(f=>{for(const sourceType of ['ADHOC','SUPPORT'])f.dailyPlans.push({...f.dailyPlans[0],id:'uat-'+sourceType.toLowerCase(),sourceType,monthlyPlanLineId:'',monthlyLinkStatus:'NOT_APPLICABLE'});f.actualReports.push({...f.actualReports[0],id:'uat-unlinked',monthlyPlanLineId:''})});eq([r.rows[0].scheduledArea100,r.unlinkedDailyIds,r.unlinkedActualIds],[300,['uat-adhoc','uat-support'],['uat-unlinked']])});
test('duplicate MP ID distinct description',()=>{const r=change(f=>{f.monthlyPlans.push({...f.monthlyPlans[0],id:'uat-doc-b',description:'Spray B'});f.actualReports.push({...f.actualReports[0],id:'uat-ap-b',description:'Spray B',actualArea100:50})});eq(r.rows.map(x=>x.linkedActualArea100),[200,50])});
test('same line different PID',()=>{const r=change(f=>f.monthlyPlans.push({...f.monthlyPlans[0],id:'uat-doc-b',pid:'uat-pid-b'}));eq(r.rows.map(x=>x.linkedActualArea100),[200,0])});
reject('ambiguous identical labels',f=>f.monthlyPlans.push({...f.monthlyPlans[0],id:'uat-doc-b'}),'AMBIGUOUS_MONTHLY_LINK');
reject('unknown parent',f=>f.dailyPlans[0].monthlyPlanLineId='uat-unknown','MISSING_MONTHLY_LINK');
reject('duplicate actual ID',f=>f.actualReports.push({...f.actualReports[0]}),'DUPLICATE_ROW');
reject('invalid adhoc link',f=>f.dailyPlans[0].sourceType='ADHOC','INVALID_LINK');
reject('real ID',f=>f.dailyPlans[0].id='DP-123','INVALID_SYNTHETIC_ID');
reject('non synthetic',f=>f.testOnly=false,'SYNTHETIC_ONLY');
reject('fractional hundredths',f=>f.actualReports[0].actualArea100=1.5,'INVALID_AREA100');
reject('negative manual',f=>f.monthlyPlans[0].manualActualArea100=-1,'INVALID_AREA100');
reject('invalid date',f=>f.dailyPlans[0].date='2026-02-30','INVALID_DATE');
const p={testOnly:true,pid:'uat-pid-a',plantArea100:600,varieties:[{name:'V1',area100:400},{name:'V2',area100:200}]};
test('multiple varieties',()=>eq(varietySelection(p,['V2','V1']).selectedPlantArea100,600));
test('single variety area',()=>eq(varietySelection(p,['V2']).selectedPlantArea100,200));
test('single default variety',()=>eq(varietySelection({...p,varieties:[{name:'V1',area100:600}]},[]).selectedVarieties,['V1']));
test('no selection fails',()=>{let code;try{varietySelection(p,[])}catch(e){code=e.message}eq(code,'VARIETY_SELECTION_REQUIRED')});
test('unknown variety fails',()=>{let code;try{varietySelection(p,['V3'])}catch(e){code=e.message}eq(code,'UNKNOWN_VARIETY')});
return n}

console.log('SUCCESS: '+testAll()+' synthetic planning progress checks (offline)')
