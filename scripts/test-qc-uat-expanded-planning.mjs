import { expandedPlanningFixture, hectares100, requireThat } from '../src/qcUatExpandedPlanningContract.mjs'

function fixture(){const companyCode='uat-company',farm='Synthetic Farm',activityId='uat-activity',activity='Spray',description='Synthetic spray',common={companyCode,farm,activityId,activity,description},pids=['uat-pid-a','uat-pid-b'];return {testOnly:true,companies:[{id:'uat-company-id',code:companyCode,name:'Synthetic Company',prefixes:['uat-prefix'],active:true}],paddocks:pids.map(pid=>({pid,companyCode,farm,variety:'Synthetic V',varietyBreakdown:[{variety:'Synthetic V',areaHa:'4.25'},{variety:'Synthetic W',areaHa:'1.75'}],currentStage:'R1',areaPaddockHa:'8.50',varietyAreaTotalHa:6})),materials:[{id:'uat-mat',materialName:'Synthetic Material',unit:'L',active:true}],activities:[{id:activityId,activityCode:'SYN-01',description,activity,type:'spray',activityCategory:'Synthetic category',companyScope:companyCode,active:true,components:[{sequence:1,label:'Synthetic component',activeIngredient:'Synthetic Material',dosePerHa:2,unit:'L'}]}],monthlyPlans:pids.map((pid,i)=>({...common,planLineId:'uat-mp-'+i,pid,monthKey:'2026-11',year:2026,week:'W2',startDate:'2026-11-08',endDate:'2026-11-15',targetAreaHa:5,actualAreaHa:0,balanceHa:5,manualActualAreaHa:0,cancelled:false,finished:false})),dailyPlans:pids.map((pid,i)=>({...common,dailyPlanId:'uat-dp-'+i,workGroupId:'uat-group',workGroupPidCount:2,planningOrder:1,sourceType:'MONTHLY',monthlyLinkStatus:'LINKED',monthlyPlanLineId:'uat-mp-'+i,date:'2026-11-12',monthKey:'2026-11',shift:'1',pid,areaHa:i===0?'1.25':'2.50',foreman:'Synthetic Foreman',manpower:3,unitName:'Synthetic Unit',unitReady:1,unitStandby:0,unitBreakdown:0,materials:[{material:'Synthetic Material',dosePerHa:2,doseUnit:'L',totalMaterial:i===0?2.5:5,unit:'L'}]}))}}

function runTests(){let count=0;function check(name,fn){try{fn();count++}catch(e){throw Error(name+': '+e.message)}}function rejects(name,edit,code){check(name,()=>{const f=fixture();edit(f);let result;try{expandedPlanningFixture(f)}catch(e){result=e.message}requireThat(result===code,'EXPECTED_'+code+'_GOT_'+result)})}
check('valid group',()=>{const out=expandedPlanningFixture(fixture());requireThat(out.dailyGroups.length===1&&out.dailyGroups[0].rows.length===2&&out.dailyGroups[0].totalArea100===375,'GROUP_TOTAL');requireThat(out.paddocks[0].areaPaddock100===850&&out.paddocks[0].plantArea100===600&&out.paddocks[0].varietyBreakdown[0].area100===425,'AREA')});
check('area exact',()=>{requireThat(hectares100('0.01')===1&&hectares100(0.29)===29&&hectares100(0)===0,'CONVERSION')});
check('canonical aliases agree',()=>{const f=fixture();Object.assign(f.paddocks[0],{stage:'R1',plantAreaHa:6,areaPlantedHa:8.5});requireThat(expandedPlanningFixture(f).paddocks[0].stage==='R1','ALIAS')});
rejects('synthetic marker',f=>f.testOnly=false,'SYNTHETIC_ONLY');
rejects('real id',f=>f.paddocks[0].pid='A-007','INVALID_SYNTHETIC_ID');
rejects('precision',f=>f.dailyPlans[0].areaHa=1.234,'UNREPRESENTABLE_HECTARES');
rejects('negative',f=>f.dailyPlans[0].areaHa=-1,'UNREPRESENTABLE_HECTARES');
rejects('alias conflict',f=>f.paddocks[0].plantAreaHa=5,'CONFLICTING_ALIAS');
rejects('variety total',f=>f.paddocks[0].varietyBreakdown[0].areaHa=4,'VARIETY_TOTAL_MISMATCH');
rejects('planted limit',f=>f.paddocks[0].areaPaddockHa=5,'PLANTED_EXCEEDS_PADDOCK');
rejects('inactive company',f=>f.companies[0].active=false,'INACTIVE_COMPANY');
rejects('inactive material',f=>f.materials[0].active=false,'MATERIAL_UNIT_OR_STATUS');
rejects('component units',f=>f.activities[0].components[0].unit='kg','MATERIAL_UNIT_OR_STATUS');
rejects('duplicate material name',f=>f.materials.push({...f.materials[0],id:'uat-mat2'}),'DUPLICATE_KEY');
rejects('inactive activity',f=>f.activities[0].active=false,'MONTHLY_REFERENCE_MISMATCH');
rejects('monthly date',f=>f.monthlyPlans[0].startDate='2026-11-31','INVALID_DATE');
rejects('year',f=>f.monthlyPlans[0].year=2025,'INVALID_PERIOD');
rejects('daily date outside plan',f=>f.dailyPlans[0].date='2026-11-16','DAILY_REFERENCE_MISMATCH');
rejects('missing parent',f=>f.dailyPlans[0].monthlyPlanLineId='uat-missing','MISSING_REFERENCE');
rejects('parent PID',f=>f.dailyPlans[0].monthlyPlanLineId='uat-mp-1','DAILY_REFERENCE_MISMATCH');
rejects('cancelled parent',f=>f.monthlyPlans[0].cancelled=true,'DAILY_REFERENCE_MISMATCH');
rejects('incomplete group',f=>f.dailyPlans.pop(),'GROUP_MISMATCH');
rejects('mixed shift group',f=>f.dailyPlans[1].shift='2','GROUP_MISMATCH');
rejects('duplicate PID in group',f=>{f.dailyPlans[1].pid=f.dailyPlans[0].pid;f.dailyPlans[1].monthlyPlanLineId=f.dailyPlans[0].monthlyPlanLineId},'DUPLICATE_KEY');
rejects('unknown field',f=>f.paddocks[0].realPath='master_paddocks','INVALID_FIELDS');
rejects('daily unit',f=>f.dailyPlans[0].materials[0].doseUnit='kg','MATERIAL_UNIT_OR_STATUS');
return count}

console.log('SUCCESS: '+runTests()+' expanded synthetic planning checks (offline)')
