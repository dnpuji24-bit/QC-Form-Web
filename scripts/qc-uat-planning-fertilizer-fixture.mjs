import {multi,row} from './qc-uat-fertilizer-material-fixture.mjs'
import {fertilizerFormSource} from '../src/qcUatPlanningFertilizerCommit.mjs'
export function planningFertilizerFixture(source,{id='qc-v2-uat-fq',uid='uat-planner',revision='uat-r1',saveType='ready',fills=[row(1,3500,8),row(2,750,5,'Synthetic DAP',150)]}={}){
 const dp=fertilizerFormSource(source),{r}=multi(fills)
 Object.assign(r,{id,ownerUid:uid,inputtedBy:uid,clientRevision:revision,saveType,date:dp.date,shift:source.executionShift,name:source.executionForemanName,dailyPlanId:dp.dailyPlanId,monthlyPlanLineId:dp.monthlyPlanLineId,dailyPlanSourceType:dp.sourceType,companyCode:dp.companyCode,farm:dp.farm,activity:dp.activity,paddock:dp.pid,type:dp.type,plannedDailyAreaHa:dp.areaHa,dailyPlanningOrder:dp.planningOrder,createdAt:dp.date+'T15:00:00Z',actualPlanMaterials:dp.materials.map(m=>({...m,totalMaterial:Number((m.dosePerHa*r.actualAreaHa).toFixed(4))}))})
 return r
}
export {row}
