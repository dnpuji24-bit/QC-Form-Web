import type {QcMultiPaddockWork,QcMultiMaterialSource} from './types'
export const MAX_QC_PADDOCKS:number
export function qcWorkIdentity(work:QcMultiPaddockWork):string
export function qcWorkMap(works:QcMultiPaddockWork[]):Record<string,{dailyPlanId:string;monthlyPlanLineId:string;woNumber:string;pid:string;areaHa:number}>
export function qcMaterialSourceTotals(sources:QcMultiMaterialSource[]):Map<string,QcMultiMaterialSource>
export function validateQcMultiPaddock(works:QcMultiPaddockWork[],sources:QcMultiMaterialSource[],args?:{ready?:boolean;totalArea?:number}):string
export function allocateQcMaterial(works:QcMultiPaddockWork[],sourceId:string,quantity:number):QcMultiPaddockWork[]
export function qcActualWorkId(recordId:string,workId:string):string
export function qcMultiMaterialRows(work:QcMultiPaddockWork,sources:QcMultiMaterialSource[]):Array<{material:string;unit:string;doseUnit:string;dosePerHa:number;totalMaterial:number;sourceFillingId:string}>
