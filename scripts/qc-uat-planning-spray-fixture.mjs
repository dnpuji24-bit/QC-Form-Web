import {fixture} from './qc-uat-spray-full-dto-fixture.mjs'
import {sprayFormSource} from '../src/qcUatPlanningSprayCommit.mjs'
export function planningSprayFixture(source,{id='qc-v2-uat-fullq',uid='uat-planner',revision='uat-r1',area=9,saveType='ready'}={}){
 const dp=sprayFormSource(source),{r}=fixture()
 Object.assign(r,{id,ownerUid:uid,inputtedBy:uid,clientRevision:revision,saveType,date:dp.date,shift:source.executionShift,name:source.executionForemanName,dailyPlanId:dp.dailyPlanId,monthlyPlanLineId:dp.monthlyPlanLineId,dailyPlanSourceType:dp.sourceType,companyCode:dp.companyCode,farm:dp.farm,activity:dp.activity,deskripsi:dp.description,paddock:dp.pid,variety:dp.masterVariety,type:dp.type,plannedDailyAreaHa:dp.areaHa,dailyPlanningOrder:dp.planningOrder,area:String(area),actualAreaHa:area,createdAt:dp.date+'T15:00:00Z',productivityHaPerHour:Math.round(area/9*100)/100,estUsageAdjuvant:(0.5*350*area/1000).toFixed(2),actualPlanMaterials:dp.materials.map(m=>({...m,totalMaterial:Number((m.dosePerHa*area).toFixed(4))}))})
 for(let i=1;i<=4;i++){const m=dp.materials[i-1];r['pesticide'+i]=m?.material||'';r['dosage'+i]=m?.dosePerHa||'';r['estUsagePesticide'+i]=m?(m.dosePerHa*area).toFixed(2):'';r['actUsagePesticide'+i]=m?'17.5':''}
 return r
}
