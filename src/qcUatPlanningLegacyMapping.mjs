// Synthetic legacy Actual mapping dry run. No writes, no inferred provenance or component coverage.
import {nextManualActual} from './qcUatPlanningManualActual.mjs'
const need=(ok,code)=>{if(!ok)throw Error(code)}
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const exact=(v,ks)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_LEGACY_MAPPING_FIELDS')
export function legacyMappingRequest(q){
 exact(q,['dailyPlanId','expectedDailyRevision'])
 need(sid(q.dailyPlanId)&&Number.isSafeInteger(q.expectedDailyRevision)&&q.expectedDailyRevision>=0&&q.expectedDailyRevision<1000000,'INVALID_LEGACY_MAPPING_REQUEST')
 return q
}
export function validateLegacyLink(link,source){
 exact(link,['testOnly','targetDailyPlanId','targetMonthlyPlanLineId','legacyDailyPlanId','legacyMonthlyPlanLineId'])
 need(link.testOnly===true&&sid(link.legacyDailyPlanId)&&link.targetDailyPlanId===source.dailyPlanId&&link.targetMonthlyPlanLineId===source.monthlyPlanLineId,'INVALID_LEGACY_LINK')
 need(source.sourceType==='MONTHLY'?sid(link.legacyMonthlyPlanLineId):link.legacyMonthlyPlanLineId===''&&source.monthlyPlanLineId==='','INVALID_LEGACY_LINK')
 return link
}
function area100(v){
 if(typeof v!=='number'||!Number.isFinite(v)||v<=0)return null
 const n=Math.round(v*100)
 return Number.isSafeInteger(n)&&n>0&&n<=10000000&&Math.abs(v*100-n)<1e-6?n:null
}
export function assessLegacyActual(source,link,items,occupied,uid){
 validateLegacyLink(link,source)
 need(Array.isArray(items)&&items.length<=100&&typeof occupied==='boolean','INVALID_LEGACY_SCOPE')
 const common={testOnly:true,dailyPlanId:source.dailyPlanId,monthlyPlanLineId:source.monthlyPlanLineId,dailyRevision:source.dailyRevision,kind:source.kind,legacyCount:items.length,writeAuthorized:false}
 const result=(status,code,extra={})=>({...common,status,code,...extra})
 if(!items.length)return result('NO_LEGACY_ROWS','NO_LEGACY_ROWS')
 if(occupied)return result('REVIEW_REQUIRED','TARGET_ALREADY_OCCUPIED')
 if(items.length!==1)return result('REVIEW_REQUIRED','MULTIPLE_LEGACY_ACTUALS')
 const {id,row:r}=items[0]
 if(!sid(id)||r?.testOnly!==true||r.actualReportId!==id)return result('REVIEW_REQUIRED','LEGACY_ID_UNVERIFIED')
 if(!['WEB','EXCEL'].includes(r.sourceOrigin)||Object.hasOwn(r,'qcRecordId')||Object.hasOwn(r,'qcFormType'))return result('REVIEW_REQUIRED','LEGACY_ORIGIN_UNVERIFIED')
 if(r.masterPending!==false||r.dailyLinkStatus!=='LINKED'||r.dailyPlanId!==link.legacyDailyPlanId||r.monthlyPlanLineId!==link.legacyMonthlyPlanLineId||r.monthlyLinkStatus!==(link.legacyMonthlyPlanLineId?'LINKED':'NOT_APPLICABLE')||r.sourceType!==source.sourceType)return result('REVIEW_REQUIRED','LEGACY_LINK_UNVERIFIED')
 if(r.pid!==source.pid||r.companyCode!==source.companyCode||r.farm!==source.farm||r.activity!==source.activity||r.description!==source.description||r.date!==source.date||r.shift!==source.sourceShift||r.foreman!==source.sourceForemanName)return result('REVIEW_REQUIRED','LEGACY_SOURCE_MISMATCH')
 if(source.kind==='fertilizer')return result('REVIEW_REQUIRED','LEGACY_COMPONENT_AREA_REQUIRED')
 if(source.kind!=='spray'||r.areaUnit!=='Ha'||Object.hasOwn(r,'applicationArea100')||Object.hasOwn(r,'fertilizerComponents'))return result('REVIEW_REQUIRED','LEGACY_AREA_SEMANTICS_UNVERIFIED')
 const area=area100(r.actualAreaHa)
 if(area===null)return result('REVIEW_REQUIRED','LEGACY_AREA_PRECISION')
 // Old material lines do not establish measured quantity; even explicit zero in an estimate is not a measurement.
 const execution={actualArea100:area,measured:source.materials.map(m=>({materialId:m.materialId,actualMaterial1000000:null}))}
 const draft=nextManualActual({action:'create',dailyPlanId:source.dailyPlanId,expectedDailyRevision:source.dailyRevision,expectedRevision:null,reason:'Legacy dry run only',execution},source,null,uid)
 return result('CANDIDATE_REVIEW','PROVENANCE_AND_APPROVAL_REQUIRED',{legacyActualId:id,proposedActualId:draft.actualReportId,actualArea100:area,materials:draft.materials,overArea100:Math.max(0,area-source.area100)})
}
