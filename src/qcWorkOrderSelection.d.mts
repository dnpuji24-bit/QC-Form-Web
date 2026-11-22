import type {QcDailyPlan} from './qcDailyPlanSource'
export function qcWorkOrderPlansByKind(rows:QcDailyPlan[],date:string,
 matchesKind:(row:QcDailyPlan)=>boolean):QcDailyPlan[]
export function qcSelectedWorkOrder(rows:QcDailyPlan[],selectedId:string):QcDailyPlan|null
export function qcSearchWorkOrders(rows:QcDailyPlan[],query:string,limit?:number):QcDailyPlan[]
export function qcMergeEligiblePlans(current:QcDailyPlan[],carryover:QcDailyPlan[],explicit:QcDailyPlan[]):QcDailyPlan[]
