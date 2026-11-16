import {dailySourceProgress} from '../src/qcUatDailySourceProgress.mjs'
function check(ok,code){if(!ok)throw Error(code)}
function testAll(){
 let n=0
 const eq=(a,b)=>check(JSON.stringify(a)===JSON.stringify(b),'EXPECTED '+JSON.stringify(b)+' GOT '+JSON.stringify(a))
 const fixture=(kind='spray')=>({testOnly:true,dailyPlans:[{id:'uat-dp1',kind,shift:'1',targetArea100:2000},{id:'uat-dp2',kind,shift:'2',targetArea100:1500}],actualReports:[{id:'uat-ap1',dailyPlanId:'uat-dp1',shift:'1',foreman:'A',actualArea100:1200,plannedDailyArea100:2000},{id:'uat-ap2',dailyPlanId:'uat-dp1',shift:'2',foreman:'B',actualArea100:800,plannedDailyArea100:2000},{id:'uat-ap3',dailyPlanId:'uat-dp2',shift:'2',foreman:'B',actualArea100:1500,plannedDailyArea100:1500}]})
 const test=(name,fn)=>{try{fn();n++}catch(e){throw Error(name+': '+e.message)}}
 const reject=(name,mutate,expected)=>test(name,()=>{let code;const f=fixture();mutate(f);try{dailySourceProgress(f)}catch(e){code=e.message}eq(code,expected)})
 for(const kind of ['spray','fertilizer']){
  test(kind+' source plan counted once across shifts',()=>{const r=dailySourceProgress(fixture(kind));eq([r.totalTargetArea100,r.totalLinkedActualArea100,r.rows[0].actualByShift100,r.rows[0].progressPct],[3500,3500,{'1':1200,'2':800},100])})
  test(kind+' over actual allowed without clipping',()=>{const f=fixture(kind);f.actualReports[1].actualArea100=1000;const r=dailySourceProgress(f).rows[0];eq([r.actualArea100,r.signedBalance100,r.remainingArea100,r.overArea100,r.progressPct],[2200,-200,0,200,110.00000000000001])})
 }
 test('partial work leaves positive balance',()=>{const f=fixture();f.actualReports.pop();f.actualReports.pop();const r=dailySourceProgress(f).rows[0];eq([r.signedBalance100,r.remainingArea100,r.overArea100,r.progressPct],[800,800,0,60])})
 test('multiple units across shifts sum distinct actual IDs',()=>{const f=fixture();f.actualReports.push({id:'uat-ap4',dailyPlanId:'uat-dp1',shift:'2',foreman:'B',actualArea100:200});const r=dailySourceProgress(f).rows[0];eq([r.actualArea100,r.overArea100,r.actualByShift100['2']],[2200,200,1000])})
 test('correction replaces existing actual in current snapshot',()=>{const f=fixture();f.actualReports[1]={...f.actualReports[1],actualArea100:600};const r=dailySourceProgress(f).rows[0];eq([r.actualArea100,r.remainingArea100,r.actualIds.length],[1800,200,2])})
 test('different source IDs stay separate',()=>{const f=fixture();f.dailyPlans.forEach(p=>p.pid='A-001');const r=dailySourceProgress(f);eq(r.rows.map(x=>x.actualArea100),[2000,1500])})
 test('unlinked and unknown source not silently allocated',()=>{const f=fixture();f.actualReports[0].dailyPlanId='';f.actualReports[1].dailyPlanId='uat-unknown';const r=dailySourceProgress(f);eq([r.unresolvedActualIds,r.totalLinkedActualArea100],[['uat-ap1','uat-ap2'],1500])})
 test('zero target has no percentage but preserves actual',()=>{const f=fixture();f.dailyPlans[0].targetArea100=0;const r=dailySourceProgress(f).rows[0];eq([r.progressPct,r.actualArea100,r.overArea100],[null,2000,2000])})
 reject('duplicate actual rejected',f=>f.actualReports.push({...f.actualReports[0]}),'DUPLICATE_ID')
 reject('duplicate source rejected',f=>f.dailyPlans.push({...f.dailyPlans[0]}),'DUPLICATE_ID')
 reject('negative actual rejected',f=>f.actualReports[0].actualArea100=-1,'INVALID_AREA100')
 reject('fractional hundredths rejected',f=>f.actualReports[0].actualArea100=1.5,'INVALID_AREA100')
 reject('non synthetic rejected',f=>f.testOnly=false,'SYNTHETIC_ONLY')
 return n
}
console.log('SUCCESS: '+testAll()+' daily source progress and over-actual checks (offline synthetic)')
