// Offline synthetic QC lifecycle candidate. No Firebase SDK, production transport, or I/O.
// Owner-only fixture policy; not a role grant or a deployed Firestore rule.
import {commitQcAndActual} from './qcAtomicCommit.mjs'

export function requireThat(ok,code){if(!ok)throw Error(code)}

function exact(v,keys){requireThat(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')),'INVALID_FIELDS');return v}

function syntheticId(v){requireThat(typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v),'INVALID_SYNTHETIC_ID');return v}

function optionalId(v){return v===''?'':syntheticId(v)}

function area(v){requireThat(Number.isSafeInteger(v)&&v>=0&&v<=10000000,'INVALID_AREA100');return v}

function isoDate(v){requireThat(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v),'INVALID_DATE');const d=new Date(v+'T00:00:00Z');requireThat(Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v,'INVALID_DATE');return v}

function form(v){requireThat(['spray','fertilizer'].includes(v),'INVALID_FORM');return v}

function shift(v){requireThat(['1','2'].includes(v),'INVALID_SHIFT');return v}

function canonicalRecord(r){exact(r,['testOnly','id','ownerUid','inputtedBy','formType','clientRevision','saveType','dailyPlanId','monthlyPlanLineId','pid','date','shift','foreman','actualArea100','sessionId']);requireThat(r.testOnly===true,'SYNTHETIC_ONLY');requireThat(['draft','ready','uploaded'].includes(r.saveType),'QC_INVALID_STATUS');requireThat(r.dailyPlanId!==''||r.monthlyPlanLineId==='','INVALID_MONTHLY_LINK');return {testOnly:true,id:syntheticId(r.id),ownerUid:syntheticId(r.ownerUid),inputtedBy:syntheticId(r.inputtedBy),formType:form(r.formType),clientRevision:syntheticId(r.clientRevision),saveType:r.saveType,dailyPlanId:optionalId(r.dailyPlanId),monthlyPlanLineId:optionalId(r.monthlyPlanLineId),pid:syntheticId(r.pid),date:isoDate(r.date),shift:shift(r.shift),foreman:syntheticId(r.foreman),actualArea100:area(r.actualArea100),sessionId:syntheticId(r.sessionId)}}

function dailySnapshot(d,r){requireThat(d,'MISSING_DAILY_PLAN');exact(d,['testOnly','dailyPlanId','monthlyPlanLineId','pid','date','shift','foreman','formType','area100']);requireThat(d.testOnly===true,'SYNTHETIC_ONLY');requireThat(['dailyPlanId','monthlyPlanLineId','pid','date','shift','foreman','formType'].every(k=>d[k]===r[k]),'DAILY_LINK_MISMATCH');requireThat(area(d.area100)>0,'INVALID_DAILY_AREA');return d.area100}

export function legacyEligibility(input){exact(input,['testOnly','dailyPlanId','actualArea100','saveType','uploadState']);requireThat(input.testOnly===true,'SYNTHETIC_ONLY');optionalId(input.dailyPlanId);area(input.actualArea100);requireThat(typeof input.saveType==='string'&&typeof input.uploadState==='string','INVALID_STATUS');const s=input.saveType.toLowerCase(),u=input.uploadState.toLowerCase();return Boolean(input.dailyPlanId)&&input.actualArea100>0&&(['ready','uploaded','upload_queued'].includes(s)||['queued','uploading','uploaded','failed'].includes(u))}

function actualFor(r){if(!r.dailyPlanId||r.actualArea100===0||r.saveType==='draft')return null;return {testOnly:true,actualReportId:'qcactual_'+r.id,qcRecordId:r.id,sourceOrigin:'QC',qcFormType:r.formType,qcSessionId:r.sessionId,clientRevision:r.clientRevision,dailyPlanId:r.dailyPlanId,monthlyPlanLineId:r.monthlyPlanLineId,pid:r.pid,date:r.date,shift:r.shift,foreman:r.foreman,actualArea100:r.actualArea100,plannedDailyArea100:r.plannedDailyArea100,dailyVariance100:r.plannedDailyArea100-r.actualArea100,ownerUid:r.ownerUid}}

function auditFor(r,actor){return {testOnly:true,recordId:r.id,revision:r.clientRevision,actorUid:actor,username:r.inputtedBy,formType:r.formType,saveType:r.saveType}}

// Used by the isolated trusted receipt issuer BEFORE any immutable receipt is created.
export function validateSyntheticReceiptRecord(record,daily,uploaderUid){
  const r=canonicalRecord(record);
  requireThat(r.ownerUid===uploaderUid&&r.inputtedBy===uploaderUid,'QC_OWNER_ONLY');
  return r.dailyPlanId?dailySnapshot(daily,r):0;
}
export function syntheticReceiptPairs(expectedQc,uploaderUid){
  requireThat(expectedQc.ownerUid===uploaderUid&&expectedQc.inputtedBy===uploaderUid,'QC_OWNER_ONLY');
  const fp=expectedQc.operationalPayloadFingerprint;
  requireThat(typeof fp==='string'&&/^sha256-v1:[0-9a-f]{64}$/.test(fp),'INVALID_FINGERPRINT');
  const a=actualFor(expectedQc);
  return {expectedActual:a?{...a,operationalPayloadFingerprint:fp}:null,expectedAudit:{...auditFor(expectedQc,uploaderUid),operationalPayloadFingerprint:fp}};
}

function equalRecord(a,b){return a===null||b===null?a===b:!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&a[k]===b[k])}

export async function commitSyntheticQc(input,deps){
  exact(input,['record','baseRevision','jobId','uploaderUid']);
  const r=canonicalRecord(input.record),jobId=syntheticId(input.jobId),uploaderUid=syntheticId(input.uploaderUid),baseRevision=input.baseRevision===null?null:syntheticId(input.baseRevision);
  requireThat(await deps.currentUid()===uploaderUid,'QC_QUEUE_ACCOUNT_MISMATCH');
  requireThat(r.ownerUid===uploaderUid,'QC_OWNER_ONLY');
  const actualId='qcactual_'+r.id,auditId=r.id+':'+r.clientRevision;
  return deps.transaction(async tx=>{
    requireThat(await deps.currentUid()===uploaderUid,'QC_QUEUE_ACCOUNT_MISMATCH');
    const current=await tx.readQc(r.id),oldActual=await tx.readActual(actualId),audit=await tx.readAudit(auditId);
    if(current)requireThat(current.testOnly===true&&current.id===r.id&&current.ownerUid===uploaderUid,'QC_OWNER_ONLY');
    if(oldActual)requireThat(oldActual.testOnly===true&&oldActual.actualReportId===actualId&&oldActual.sourceOrigin==='QC'&&oldActual.qcRecordId===r.id,'QC_ACTUAL_ID_CONFLICT');
    if(current?.operationalSaveId===jobId&&current?.clientRevision===r.clientRevision){
      requireThat(Object.keys(r).every(k=>r[k]===current[k]),'QC_REPLAY_PAYLOAD_MISMATCH');
      requireThat(equalRecord(audit,auditFor(current,uploaderUid))&&equalRecord(oldActual,actualFor(current)),'QC_REPLAY_REQUIRES_REVIEW');
      requireThat(await deps.currentUid()===uploaderUid,'QC_QUEUE_ACCOUNT_MISMATCH');
      return current;
    }
    requireThat(!audit&&(!current||current.clientRevision!==r.clientRevision),'QC_REVISION_REUSED');
    requireThat(!current||current.operationalSaveId!==jobId,'QC_JOB_REUSED');
    requireThat(current||!oldActual,'QC_ORPHAN_ACTUAL_REQUIRES_REVIEW');
    const plannedDailyArea100=r.dailyPlanId?dailySnapshot(await tx.readDaily(r.dailyPlanId),r):0;
    return commitQcAndActual({record:{...r,plannedDailyArea100},baseRevision,jobId,uploaderUid},{
      currentUid:deps.currentUid,
      transaction:fn=>fn({
        readQc:async id=>{requireThat(id===r.id,'UNEXPECTED_QC_PATH');return current},
        readActual:async id=>{requireThat(id===actualId,'UNEXPECTED_ACTUAL_PATH');return oldActual},
        writeQc:(id,row)=>{requireThat(id===r.id,'UNEXPECTED_QC_PATH');tx.writeQc(id,row);tx.writeAudit(auditId,auditFor(row,uploaderUid))},
        writeActual:(id,row)=>{requireThat(id===actualId,'UNEXPECTED_ACTUAL_PATH');tx.writeActual(id,row)}
      }),buildActual:actualFor
    });
  });
}
