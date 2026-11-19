import assert from 'node:assert/strict'
import {filteredDashboardRequest,filteredDashboardTotals} from '../src/qcUatPlanningDashboardFilters.mjs'
import {summarizeActualPlan} from '../src/qcUatPlanningActualSummary.mjs'
const input={period:'2026-11',week:'ALL',companyCode:null,farm:null,shift:null,foreman:null},q=(patch={})=>filteredDashboardRequest({...input,...patch})
const a={id:'qcactual_uat-q1',kind:'spray',areaSemantics:'SCALAR_APPLICATION',actualArea100:800,shift:'2',foreman:'uat-f2',materials:[]}
const mk=(id,actuals=[],org='uat-company',farm='Farm A')=>({id,companyCode:org,farm,activity:'Spray',description:'Work',shift:'1',foreman:'uat-f1',draftCount:0,outOfPeriodDailyIds:[],...summarizeActualPlan({kind:'spray',targetArea100:1000,cancelled:false,materials:[],actuals})})
const d1=mk('uat-d1',[a]),d2=mk('uat-d2',[],'uat-company2','Farm B'),m1=mk('uat-m1',[a]),m2=mk('uat-m2',[],'uat-company2','Farm B')
const run=(patch={})=>filteredDashboardTotals(q(patch),[m1,m2],[{summary:d1,actuals:[a]},{summary:d2,actuals:[]}])
let n=0
const check=(name,fn)=>{fn();n++;console.log('PASS: '+name)},deny=(fn,message)=>assert.throws(fn,{message})
check('month week and annual windows explicit',()=>{assert.equal(q({week:'W2'}).startDate,'2026-11-08');const x=q({period:'2028'});assert.equal(x.startDate,'2028-01-01');assert.equal(x.endDate,'2028-12-31');assert.equal(x.firstMonth,'2028-01');assert.equal(x.lastMonth,'2028-12');deny(()=>q({period:'2028',week:'W1'}),'ANNUAL_WEEK_UNSUPPORTED')})
check('strict filters and invalid scope denied',()=>{deny(()=>q({extra:true}),'INVALID_DASHBOARD_FILTERS');deny(()=>q({period:'2026-13'}),'INVALID_DASHBOARD_PERIOD');deny(()=>q({farm:'Farm A'}),'INVALID_DASHBOARD_FARM');deny(()=>q({shift:'3'}),'INVALID_DASHBOARD_SHIFT');deny(()=>q({foreman:'../users'}),'INVALID_DASHBOARD_FOREMAN')})
check('company and farm apply to both plan bases and execution',()=>{const x=run({companyCode:'uat-company',farm:'Farm A'});assert.equal(x.monthly.spray.targetArea100,1000);assert.equal(x.daily.spray.actualArea100,800);assert.equal(x.executionByForemanShift.length,1);const y=run({companyCode:'uat-company2'});assert.equal(y.daily.spray.targetArea100,1000);assert.equal(y.daily.spray.actualArea100,0);assert.deepEqual(y.executionByForemanShift,[])})
check('source and actual executor scopes never share a false denominator',()=>{const x=run({shift:'2',foreman:'uat-f2'});assert.equal(x.monthly.spray.targetArea100,2000);assert.equal(x.daily.spray.actualArea100,800);assert.equal(x.sourceDaily.spray.targetArea100,0);assert.equal(x.executionByForemanShift[0].actualArea100,800);assert.ok(!Object.hasOwn(x.executionByForemanShift[0],'targetArea100'))})
check('source shift retains all linked carryover actuals',()=>{const x=run({shift:'1',foreman:'uat-f1'});assert.equal(x.sourceDaily.spray.targetArea100,2000);assert.equal(x.sourceDaily.spray.actualArea100,800);assert.deepEqual(x.executionByForemanShift,[])})
check('no match gives empty totals and no invented percent',()=>{const x=run({companyCode:'uat-company',farm:'Farm Z'});assert.equal(x.daily.spray.targetArea100,0);assert.equal(x.daily.spray.progressPct,null);assert.deepEqual(x.executionByForemanShift,[])})
check('missing org or duplicate actual fails closed',()=>{deny(()=>filteredDashboardTotals(q(),[{...m1,companyCode:null}],[]),'INVALID_DASHBOARD_ORGANIZATION');deny(()=>filteredDashboardTotals(q(),[],[{summary:d1,actuals:[a,a]}]),'INVALID_DASHBOARD_ACTUALS')})
console.log('SUCCESS: '+n+' Planning Dashboard filter contract checks (offline)')
