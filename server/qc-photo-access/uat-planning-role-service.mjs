// Dedicated synthetic Planning authorization lab. Never mount in production.
import {keys,roles} from '../../src/qcUatRolePermissions.mjs'
import {unifiedGuard} from './uat-unified-identity-guard.mjs'
import {permissionsForIdentity} from '../../src/qcUatCustomRoles.mjs'
import {operationalPermissions} from './uat-operational-permissions.mjs'
import {planningRequest,nextPlanningRow,verifyMonthlyParent,currentPlanningRow} from '../../src/qcUatPlanningWriteContract.mjs'
import {planningQcInput,planningQcSnapshot,planningCarryoverSnapshot} from '../../src/qcUatPlanningQcBridge.mjs'
import {commitSyntheticQc} from '../../src/qcUatQcLifecycleContract.mjs'
import {verifiedPhotoLedger,verifyPhotoLedgerPair} from '../../src/qcUatVerifiedPhotoLedger.mjs'
import {createTrustedPhotoStage,mockBucket,privateUatBucket} from './uat-unified-photo-trusted-stage.mjs'
import {dailyGroupCreate} from '../../src/qcUatDailyGroupContract.mjs'
import {activityComponents,monthlySnapshotRequest,monthlySnapshot,dailySnapshot,validateGroupResources,aggregateGroupMaterials,materialTotals,readMonthlySnapshot,readGroupSnapshot,reviseDailySnapshot} from '../../src/qcUatPlanningMasterSnapshot.mjs'
import {fertilizerCommitRequest,preparePlanningFertilizer,historicalFertilizerSource,verifyFertilizerPair} from '../../src/qcUatPlanningFertilizerCommit.mjs'
import {sprayCommitRequest,preparePlanningSpray,historicalSpraySource,equalSprayValue} from '../../src/qcUatPlanningSprayCommit.mjs'
import {filteredDashboardRequest,filteredDashboardTotals} from '../../src/qcUatPlanningDashboardFilters.mjs'
import {dashboardRequest,dashboardTotals,executionTotals} from '../../src/qcUatPlanningDashboard.mjs'
import {legacyMappingRequest,validateLegacyLink,assessLegacyActual} from '../../src/qcUatPlanningLegacyMapping.mjs'
import {correctionRequest,duplicateCandidate,appliedReview,correctionReceipt,verifyCorrectionReceipt} from '../../src/qcUatPlanningControlledCorrection.mjs'
import {issueCodes,evidenceFingerprint,reviewRequest,verifyReview,nextReview} from '../../src/qcUatPlanningReconciliationReview.mjs'
import {manualActualId,manualRequest,nextManualActual,verifyManualActual,manualProjection} from '../../src/qcUatPlanningManualActual.mjs'
import {planningWeek} from '../../src/qcUatPlanningProgressContract.mjs'
import {summaryRequest,actualProjection,summarizeActualPlan} from '../../src/qcUatPlanningActualSummary.mjs'
import {qcSourceRequest,projectQcSource} from '../../src/qcUatPlanningQcSource.mjs'
import {groupHeaderIds,validateGroupState,groupMutationRequest,nextDailyGroup,groupReorderRequest,nextGroupOrder} from '../../src/qcUatDailyGroupLifecycle.mjs'

export const projectId='demo-qc-uat-planning-role',host='127.0.0.1',firestorePort=9085,authPort=9899
const prefix='qc_uat_workspaces/cutover'
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const scopes=Object.freeze({monthly:'data_plan_monthly',daily:'data_plan_daily',actual:'data_plan_actual',summary:'data_plan_summary',reconciliation:'data_plan_reconciliation'})
const collections=Object.freeze({monthly:'monthly_plans',daily:'daily_plans'})
const fail=code=>{throw Error(code)}
export function guard(e=process.env){
 if(e.QC_UAT_MODE!==undefined)return unifiedGuard(e)
 if(e.GCLOUD_PROJECT!==projectId||e.FIRESTORE_EMULATOR_HOST!==host+':'+firestorePort||e.FIREBASE_AUTH_EMULATOR_HOST!==host+':'+authPort)fail('DEMO_EMULATORS_REQUIRED')
 for(const k of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[k]&&e[k]!==projectId)fail('WRONG_PROJECT')
 return projectId
}
export function planningMode(permissions,scope,operation){
 if(!Object.hasOwn(scopes,scope)||!['view','edit'].includes(operation))fail('INVALID_PLANNING_OPERATION')
 const mode=permissions?.[scopes[scope]]
 if(mode!=='edit'&&(operation!=='view'||mode!=='view'))fail('PLANNING_PERMISSION_DENIED')
 return mode
}
function createAuthorizer({adb,authAdmin}){
 const boundProject=guard()
 if(authAdmin.app.options.projectId!==boundProject||adb.projectId!==boundProject)fail('WRONG_PROJECT')
 async function authorize(raw,scope,operation,read,internalQc=false){
  if(guard()!==boundProject)fail('WRONG_PROJECT')
  if(typeof raw!=='string'||!raw||raw.length>16384)fail('INVALID_TOKEN')
  let token
  try{token=await authAdmin.verifyIdToken(raw,true)}catch{fail('INVALID_TOKEN')}
  if(!sid(token.uid)||token.qcUat!==true)fail('UAT_IDENTITY_DENIED')
  return adb.runTransaction(async tx=>{
   const [identity,prod]=await Promise.all([tx.get(adb.doc('qc_uat_identities/'+token.uid)),tx.get(adb.doc('users/'+token.uid))])
   const m=identity.data()
   const p=await operationalPermissions({tx,db:adb,marker:m,productionProfile:prod.exists})
   // This new gate uses the full Owner-managed marker contract for built-ins too.
   if(!Number.isSafeInteger(m.policyRevision)||m.policyRevision<0||m.policyRevision>=1000000)fail('UAT_IDENTITY_DENIED')
   if(roles.includes(m.role)){
    let expected
    try{expected=permissionsForIdentity(m)}catch{fail('UAT_IDENTITY_DENIED')}
    if(Object.keys(p).length!==keys.length||keys.some(k=>!Object.hasOwn(p,k)||p[k]!==expected[k]))fail('UAT_IDENTITY_DENIED')
   }
   const mode=internalQc ? p[scope==='spray'?'qc_spraying':'qc_fertilizer'] : planningMode(p,scope,operation)
   if(internalQc&&(!['spray','fertilizer'].includes(scope)||operation!=='edit'||mode!=='edit'))fail('QC_PERMISSION_DENIED')
   return read?read(tx,token.uid,p):{scope,operation,mode}
  })
 }
 return authorize
}
export function createPlanningService(deps){
 const {adb}=deps,authorize=createAuthorizer(deps)
 return Object.freeze({
  // Capability check only: does not authorize a particular payload or perform a write.
  check:(raw,scope,operation)=>authorize(raw,scope,operation),
  async readPlan(raw,scope,id){
   if(!Object.hasOwn(collections,scope)||!sid(id))fail('INVALID_PLANNING_PATH')
   return authorize(raw,scope,'view',async tx=>{
    const row=(await tx.get(adb.doc(prefix+'/'+collections[scope]+'/'+id))).data()
    if(!row)return null
    const area=scope==='monthly'?row.targetArea100:row.area100
    if(row.testOnly!==true||row.id!==id||!sid(row.pid)||!Number.isSafeInteger(area)||area<0||area>10000000)fail('INVALID_SYNTHETIC_PLAN')
    // Minimal safe projection. No raw document, QC records, photos or cross-domain fields.
    return {id,pid:row.pid,area100:area}
   })
  }
 })
}

 // Separate factory: verified read-only API remains unchanged. Never mounted in HTTP or production.
export function createPlanningWriteService(deps){
 const {adb}=deps,authorize=createAuthorizer(deps)
 const ref=(collection,id)=>adb.doc(prefix+'/'+collection+'/'+id)
 const linked=async(tx,collection,key,id)=>!(await tx.get(adb.collection(prefix+'/'+collection).where(key,'==',id).limit(1))).empty
 return Object.freeze({
  async mutate(raw,scope,input){
   const q=planningRequest(scope,input)
   return authorize(raw,scope,'edit',async(tx,uid)=>{
    const target=ref(collections[scope],q.id),snap=await tx.get(target),current=snap.data()
    if(scope==='daily'&&(await tx.get(ref('daily_group_members',q.id))).exists)fail('GROUP_MUTATION_REQUIRED')
    const next=nextPlanningRow(scope,q,current,uid)
    // Never modify linked QC/Actual. Block all daily updates/cancellations once any dependent row exists, including drafts.
    // MP period/target edits preserve immutable identity and linked history; cancel conservatively blocks any child.
    if(q.action!=='create'){
     const key=scope==='daily'?'dailyPlanId':'monthlyPlanLineId'
     if(scope==='daily'||q.action==='cancel'){
      const [qc,actual]=await Promise.all([linked(tx,'qc_records',key,q.id),linked(tx,'daily_reports',key,q.id)])
      if(qc||actual)fail('PLAN_HAS_DEPENDENTS')
     }
     if(scope==='monthly'&&q.action==='cancel'&&await linked(tx,'daily_plans','monthlyPlanLineId',q.id))fail('PLAN_HAS_DEPENDENTS')
    }
    if(q.action!=='cancel'){
     const [p,a]=await Promise.all([tx.get(ref('master_paddocks',next.pid)),tx.get(ref('master_activities',next.activityId))])
     const paddock=p.data(),activity=a.data()
     if(paddock?.testOnly!==true||paddock.pid!==next.pid||paddock.active!==true||activity?.testOnly!==true||activity.id!==next.activityId||activity.active!==true)fail('INVALID_PLANNING_MASTER')
     if(scope==='daily'){
      if(activity.formType!==next.formType)fail('PLANNING_FORM_MISMATCH')
      if(next.sourceType==='MONTHLY')verifyMonthlyParent(next,(await tx.get(ref('monthly_plans',next.monthlyPlanLineId))).data())
     }
    }
    // Audit and plan are atomic; create fails if a revision audit already exists.
    const audit=ref('planning_audit',scope+':'+q.id+':'+next.revision)
    tx.create(audit,{testOnly:true,scope,id:q.id,action:q.action,actorUid:uid,previousRevision:current?.revision??null,revision:next.revision,before:current??null,after:next})
    if(q.action==='create')tx.create(target,next);else tx.set(target,next)
    return next
   })
  }
 })
}

// Trusted photo-free integration lab only. No HTTP/portal route, no live Rules, no Supabase.
// A fixed per-DP record serializes manual versus QC writes in the same transaction.
async function assertNoActiveManual(tx,adb,id){
 const doc=await tx.get(adb.doc(prefix+'/daily_reports/'+manualActualId(id)))
 if(!doc.exists)return
 const r=doc.data()
 if(r?.testOnly!==true||r.sourceOrigin!=='MANUAL'||r.dailyPlanId!==id||r.actualReportId!==doc.id||r.status!=='cancelled'||!Number.isSafeInteger(r.revision)||r.revision<1)fail('MANUAL_ACTUAL_CONFLICT')
 const audit=(await tx.get(adb.doc(prefix+'/manual_actual_audit/'+doc.id+':'+r.revision))).data()
 if(audit?.action!=='cancel'||!equalSprayValue(audit.after,r))fail('MANUAL_ACTUAL_CONFLICT')
}

function createPlanningQcCommitService(deps,carryover){
 const {adb}=deps,authorize=createAuthorizer(deps)
 const ref=(collection,id)=>adb.doc(prefix+'/'+collection+'/'+id)
 return Object.freeze({
  async commit(raw,input){
   const q=planningQcInput(input),r=q.record
   return authorize(raw,r.formType,'edit',async(tx,uid)=>{
    if(q.uploaderUid!==uid||r.ownerUid!==uid||r.inputtedBy!==uid)fail('QC_OWNER_ONLY')
    const read=async(c,id)=>(await tx.get(ref(c,id))).data()??null
    const daily=await read('daily_plans',r.dailyPlanId)
    // Do not build arbitrary paths from unvalidated stored data.
    const parentId=daily?.monthlyPlanLineId
    if(parentId!==undefined&&parentId!==''&&!sid(parentId))fail('INVALID_SYNTHETIC_PLAN')
    const parent=parentId?await read('monthly_plans',parentId):null
    const snapshot=(carryover?planningCarryoverSnapshot:planningQcSnapshot)(q,daily,parent,uid)
    await assertNoActiveManual(tx,adb,r.dailyPlanId)
    const {expectedDailyRevision,...job}=q
    return commitSyntheticQc(job,{
     currentUid:async()=>uid,
     transaction:fn=>fn({
      readQc:async id=>{
       const row=await read('qc_records',id)
       if(await read('qc_photo_manifests',id))fail('PHOTO_AWARE_COMMIT_REQUIRED')
       if(await read('qc_spray_full',id)||(row&&sid(row.clientRevision)&&await read('qc_spray_full_audit',id+':'+row.clientRevision)))fail('FULL_SPRAY_COMMIT_REQUIRED')
       if(row?.areaSemantics==='APPLICATION_HA_ONLY'||await read('qc_fertilizer_full',id)||(row&&sid(row.clientRevision)&&await read('qc_fertilizer_full_audit',id+':'+row.clientRevision)))fail('FULL_FERTILIZER_COMMIT_REQUIRED')
       if(row&&(row.ownerUid!==uid||row.inputtedBy!==uid))fail('QC_OWNER_ONLY')
       if(row&&['dailyPlanId','monthlyPlanLineId','pid','date','shift','foreman'].some(k=>row[k]!==r[k]))fail('QC_PLANNING_LINK_IMMUTABLE')
       return row
      },
      readActual:async id=>{
       const row=await read('daily_reports',id)
       if(row&&(row.ownerUid!==uid||row.dailyPlanId!==r.dailyPlanId||row.monthlyPlanLineId!==r.monthlyPlanLineId))fail('QC_ACTUAL_ID_CONFLICT')
       return row
      },
      readAudit:id=>read('qc_operational_audit',id),
      readDaily:async id=>{if(id!==snapshot.dailyPlanId)fail('UNEXPECTED_DAILY_PATH');return snapshot},
      writeQc:(id,row)=>tx.set(ref('qc_records',id),row),
      writeActual:(id,row)=>tx.set(ref('daily_reports',id),row),
      writeAudit:(id,row)=>tx.create(ref('qc_operational_audit',id),row)
     })
    })
   },true)
  }
 })
}

// Explicit separate entrypoints; strict own-session path remains unchanged.
export function createPlanningQcService(deps){return createPlanningQcCommitService(deps,false)}
export function createPlanningCarryoverService(deps){return createPlanningQcCommitService(deps,true)}

// Atomic create only. Keep canonical DP rows unchanged for existing QC bridge.
// Membership documents prevent old single-row mutation API from splitting a group.
function createDailyGroupInternal(deps,full){
 const {adb}=deps,authorize=createAuthorizer(deps)
 const ref=(c,id)=>adb.doc(prefix+'/'+c+'/'+id)
 return Object.freeze({
  async create(raw,input){
   return authorize(raw,'daily','edit',async(tx,uid)=>{
    const {header,rows}=dailyGroupCreate(input,uid)
    const gref=ref('daily_work_groups',header.workGroupId),gaudit=ref('planning_audit','group:'+header.workGroupId+':0')
    const [group,activity]=await Promise.all([tx.get(gref),tx.get(ref('master_activities',header.activityId))])
    if(group.exists)fail('GROUP_ALREADY_EXISTS')
    const a=activity.data()
    if(a?.testOnly!==true||a.id!==header.activityId||a.active!==true)fail('INVALID_PLANNING_MASTER')
    if(a.formType!==header.formType)fail('PLANNING_FORM_MISMATCH')
    // Every read and validation precedes any write.
    const snapshots=[]
    for(const r of rows){
     const [daily,member,pad]=await Promise.all([tx.get(ref('daily_plans',r.id)),tx.get(ref('daily_group_members',r.id)),tx.get(ref('master_paddocks',r.pid))])
     if(daily.exists||member.exists)fail('PLAN_ALREADY_EXISTS')
     const p=pad.data()
     if(p?.testOnly!==true||p.pid!==r.pid||p.active!==true)fail('INVALID_PLANNING_MASTER')
     if(r.sourceType==='MONTHLY')verifyMonthlyParent(r,(await tx.get(ref('monthly_plans',r.monthlyPlanLineId))).data())
     if(full){
      if(!sid(p.companyCode))fail('INVALID_PLANNING_MASTER')
      const company=(await tx.get(ref('master_companies',p.companyCode))).data()
      const source=r.sourceType==='MONTHLY'?(await tx.get(ref('monthly_plan_snapshots',r.monthlyPlanLineId))).data():null
      const snapshot=dailySnapshot(r,source,p,company,a)
      for(const m of snapshot.materials){const material=(await tx.get(ref('master_materials',m.materialId))).data();if(material?.testOnly!==true||material.id!==m.materialId||material.active!==true||material.unit!==m.unit)fail('MATERIAL_UNIT_OR_STATUS')}
      snapshots.push(snapshot)
     }
    }
    let groupSnapshot
    if(full){
     const [foreman,shift]=await Promise.all([tx.get(ref('master_foremen',header.foreman)),tx.get(ref('master_shifts',header.shift))])
     let unit=null
     if(header.unitName){const units=await tx.get(adb.collection(prefix+'/master_units').where('name','==',header.unitName).limit(2));if(units.size!==1)fail('INVALID_MASTER_UNIT');unit=units.docs[0].data();if(unit.id!==units.docs[0].id)fail('INVALID_MASTER_UNIT')}
     const resources=validateGroupResources(header,foreman.data(),shift.data(),unit)
     groupSnapshot={testOnly:true,workGroupId:header.workGroupId,createdBy:uid,sourceGroupRevision:0,resources,totalMaterials:aggregateGroupMaterials(snapshots)}
    }
    tx.create(gref,header)
    tx.create(gaudit,{testOnly:true,scope:'group',id:header.workGroupId,action:'create',actorUid:uid,previousRevision:null,revision:0,before:null,after:header})
    for(const r of rows){
     tx.create(ref('daily_plans',r.id),r)
     tx.create(ref('daily_group_members',r.id),{testOnly:true,dailyPlanId:r.id,workGroupId:header.workGroupId})
     tx.create(ref('planning_audit','daily:'+r.id+':0'),{testOnly:true,scope:'daily',id:r.id,action:'create',actorUid:uid,previousRevision:null,revision:0,before:null,after:r})
    }
    if(full){
     tx.create(ref('daily_group_snapshots',header.workGroupId),groupSnapshot)
     for(const snapshot of snapshots)tx.create(ref('daily_plan_snapshots',snapshot.dailyPlanId),snapshot)
     return {header,rows,groupSnapshot,snapshots}
    }
    return {header,rows}
   })
  }
 })
}
export function createDailyGroupService(deps){return createDailyGroupInternal(deps,false)}

function createGroupStateReader(adb){
 const ref=(c,id)=>adb.doc(prefix+'/'+c+'/'+id)
 const col=c=>adb.collection(prefix+'/'+c)
 const read=async(tx,c,id)=>(await tx.get(ref(c,id))).data()
 async function state(tx,id,header){
  const h=header??await read(tx,'daily_work_groups',id),ids=groupHeaderIds(id,h)
  const [rows,members,index]=await Promise.all([
   Promise.all(ids.map(i=>read(tx,'daily_plans',i))),
   Promise.all(ids.map(i=>read(tx,'daily_group_members',i))),
   tx.get(col('daily_group_members').where('workGroupId','==',id).limit(21))
  ])
  if(index.size!==ids.length||index.docs.some(x=>!ids.includes(x.id)))fail('INVALID_GROUP_MEMBERS')
  validateGroupState(id,h,rows,members)
  return {header:h,rows,members}
 }
 async function frozenState(tx,header,rows){
  const groupSnapshot=await read(tx,'daily_group_snapshots',header.workGroupId)
  const snapshots=await Promise.all(rows.map(r=>read(tx,'daily_plan_snapshots',r.id)))
  const sources=await Promise.all(rows.map(async r=>{
   if(r.sourceType!=='MONTHLY')return null
   const [mp,s]=await Promise.all([read(tx,'monthly_plans',r.monthlyPlanLineId),read(tx,'monthly_plan_snapshots',r.monthlyPlanLineId)])
   return readMonthlySnapshot(mp,s).snapshot
  }))
  readGroupSnapshot(header,rows,groupSnapshot,snapshots,sources)
  return {groupSnapshot,snapshots,sources}
 }
 return {state,frozenState}
}

// Separate lifecycle factory preserves the previously verified create-only public shape.
function createDailyGroupLifecycleInternal(deps,full){
 const {adb}=deps,authorize=createAuthorizer(deps)
 const ref=(c,id)=>adb.doc(prefix+'/'+c+'/'+id)
 const col=c=>adb.collection(prefix+'/'+c)
 const read=async(tx,c,id)=>(await tx.get(ref(c,id))).data()
 const {state,frozenState}=createGroupStateReader(adb)
 function audit(tx,scope,id,action,uid,before,after){
  tx.create(ref('planning_audit',scope+':'+id+':'+after.revision),{testOnly:true,scope,id,action,actorUid:uid,previousRevision:before.revision,revision:after.revision,before,after})
 }
 return Object.freeze({
  async read(raw,id){
   if(!sid(id))fail('INVALID_SYNTHETIC_ID')
   return authorize(raw,'daily','view',async tx=>{const {header,rows}=await state(tx,id);if(!full)return {header,rows};const {groupSnapshot,snapshots}=await frozenState(tx,header,rows);return {header,rows,groupSnapshot,snapshots}})
  },
  async mutate(raw,input){
   const q=groupMutationRequest(input)
   return authorize(raw,'daily','edit',async(tx,uid)=>{
    const {header,rows,members}=await state(tx,q.workGroupId)
    if(full&&q.action!=='edit')fail('FULL_GROUP_EDIT_ONLY')
    if(!full&&q.action==='edit'){
     const existing=await Promise.all([tx.get(ref('daily_group_snapshots',q.workGroupId)),...rows.map(r=>tx.get(ref('daily_plan_snapshots',r.id)))])
     if(existing.some(s=>s.exists))fail('FULL_GROUP_EDIT_PENDING')
    }
    const frozen=full?await frozenState(tx,header,rows):null
    const next=nextDailyGroup(q,header,rows,members,uid)
    // All member dependency and master checks precede writes.
    for(const r of rows){
     const [qc,actual]=await Promise.all([tx.get(col('qc_records').where('dailyPlanId','==',r.id).limit(1)),tx.get(col('daily_reports').where('dailyPlanId','==',r.id).limit(1))])
     if(!qc.empty||!actual.empty)fail('GROUP_HAS_DEPENDENTS')
    }
    let nextSnapshots,nextGroupSnapshot
    if(q.action==='edit'){
     const a=await read(tx,'master_activities',next.header.activityId)
     if(a?.testOnly!==true||a.id!==next.header.activityId||a.active!==true)fail('INVALID_PLANNING_MASTER')
     if(a.formType!==next.header.formType)fail('PLANNING_FORM_MISMATCH')
     for(const r of next.rows){
      const p=await read(tx,'master_paddocks',r.pid)
      if(p?.testOnly!==true||p.pid!==r.pid||p.active!==true)fail('INVALID_PLANNING_MASTER')
      if(r.sourceType==='MONTHLY')verifyMonthlyParent(r,await read(tx,'monthly_plans',r.monthlyPlanLineId))
      if(full){
       const s=frozen.snapshots.find(x=>x.dailyPlanId===r.id)
       if(!sid(p.companyCode)||p.companyCode!==s.companyCode)fail('PADDOCK_COMPANY_CHANGED')
       const company=await read(tx,'master_companies',p.companyCode)
       if(company?.testOnly!==true||company.code!==p.companyCode||company.active!==true)fail('INVALID_PLANNING_MASTER')
       if(a.companyScope!=='GLOBAL'&&a.companyScope!==p.companyCode)fail('ACTIVITY_COMPANY_MISMATCH')
       for(const m of s.materials){const material=await read(tx,'master_materials',m.materialId);if(material?.testOnly!==true||material.id!==m.materialId||material.active!==true||material.unit!==m.unit)fail('MATERIAL_UNIT_OR_STATUS')}
      }
     }
     if(full){
      const h=next.header,[foreman,shift]=await Promise.all([read(tx,'master_foremen',h.foreman),read(tx,'master_shifts',h.shift)])
      let unit=null
      if(h.unitName){const units=await tx.get(col('master_units').where('name','==',h.unitName).limit(2));if(units.size!==1)fail('INVALID_MASTER_UNIT');unit=units.docs[0].data();if(unit.id!==units.docs[0].id)fail('INVALID_MASTER_UNIT')}
      const resources=validateGroupResources(h,foreman,shift,unit)
      nextSnapshots=next.rows.map((r,i)=>reviseDailySnapshot(rows[i],r,frozen.snapshots[i],frozen.sources[i]))
      nextGroupSnapshot={...frozen.groupSnapshot,sourceGroupRevision:h.revision,resources,totalMaterials:aggregateGroupMaterials(nextSnapshots)}
      readGroupSnapshot(h,next.rows,nextGroupSnapshot,nextSnapshots,frozen.sources)
     }
    }
    const action=q.action==='edit'?'update':'cancel'
    audit(tx,'group',header.workGroupId,action,uid,header,next.header)
    tx.set(ref('daily_work_groups',header.workGroupId),next.header)
    for(let i=0;i<rows.length;i++){
     audit(tx,'daily',rows[i].id,action,uid,rows[i],next.rows[i])
     tx.set(ref('daily_plans',rows[i].id),next.rows[i])
    }
    if(full){
     tx.set(ref('daily_group_snapshots',header.workGroupId),nextGroupSnapshot)
     tx.create(ref('planning_audit','group_snapshot:'+header.workGroupId+':'+next.header.revision),{testOnly:true,scope:'group_snapshot',id:header.workGroupId,action:'update',actorUid:uid,previousRevision:frozen.groupSnapshot.sourceGroupRevision,revision:next.header.revision,before:frozen.groupSnapshot,after:nextGroupSnapshot})
     for(let i=0;i<rows.length;i++){
      tx.set(ref('daily_plan_snapshots',rows[i].id),nextSnapshots[i])
      tx.create(ref('planning_audit','daily_snapshot:'+rows[i].id+':'+next.rows[i].revision),{testOnly:true,scope:'daily_snapshot',id:rows[i].id,action:'update',actorUid:uid,previousRevision:frozen.snapshots[i].sourceDailyRevision,revision:next.rows[i].revision,before:frozen.snapshots[i],after:nextSnapshots[i]})
     }
     return {...next,groupSnapshot:nextGroupSnapshot,snapshots:nextSnapshots}
    }
    return next
   })
  },
  async reorder(raw,input){
   const q=groupReorderRequest(input)
   return authorize(raw,'daily','edit',async(tx,uid)=>{
    const snap=await tx.get(col('daily_work_groups').where('date','==',q.date).limit(101))
    if(snap.size>100)fail('REORDER_SCOPE_LIMIT')
    const headers=[]
    for(const x of snap.docs){
     const h=x.data();groupHeaderIds(x.id,h)
     if(h.status==='open'){await state(tx,x.id,h);headers.push(h)}
    }
    const next=nextGroupOrder(q,headers,uid)
    for(const h of next){
     const before=headers.find(x=>x.workGroupId===h.workGroupId)
     audit(tx,'group',h.workGroupId,'reorder',uid,before,h)
     tx.set(ref('daily_work_groups',h.workGroupId),h)
    }
    return next
   })
  }
 })
}

export function createDailyGroupLifecycleService(deps){return createDailyGroupLifecycleInternal(deps,false)}

// Full master-backed creation only; not mounted in production or HTTP.
export function createPlanningMasterSnapshotService(deps){
 const {adb}=deps,authorize=createAuthorizer(deps),groups=createDailyGroupInternal(deps,true)
 const ref=(c,id)=>adb.doc(prefix+'/'+c+'/'+id)
 const read=async(tx,c,id)=>(await tx.get(ref(c,id))).data()
 return Object.freeze({
  async createMonthly(raw,input){
   return authorize(raw,'monthly','edit',async(tx,uid)=>{
    const {row,selected}=monthlySnapshotRequest(input,uid)
    const target=ref('monthly_plans',row.id)
    const [existing,p,a]=await Promise.all([tx.get(target),read(tx,'master_paddocks',row.pid),read(tx,'master_activities',row.activityId)])
    if(existing.exists)fail('PLAN_ALREADY_EXISTS')
    if(!sid(p?.companyCode))fail('INVALID_PLANNING_MASTER')
    const company=await read(tx,'master_companies',p.companyCode)
    const components=activityComponents(a,row.activityId,a?.formType),materials=new Map()
    for(const c of components)materials.set(c.materialId,await read(tx,'master_materials',c.materialId))
    const snapshot=monthlySnapshot(row,p,company,a,materials,selected)
    tx.create(target,row)
    tx.create(ref('monthly_plan_snapshots',row.id),snapshot)
    tx.create(ref('planning_audit','monthly:'+row.id+':0'),{testOnly:true,scope:'monthly',id:row.id,action:'create',actorUid:uid,previousRevision:null,revision:0,before:null,after:row})
    return {row,snapshot,materials:materialTotals(snapshot.componentsSnapshot,row.targetArea100)}
   })
  },
  createGroup:groups.create
 })
}

// Full snapshot read/edit gate. Legacy cancel/reorder remain separate.
export function createPlanningMasterSnapshotLifecycleService(deps){
 const {adb}=deps,authorize=createAuthorizer(deps),groups=createDailyGroupLifecycleInternal(deps,true)
 const ref=(c,id)=>adb.doc(prefix+'/'+c+'/'+id)
 return Object.freeze({
  async readMonthly(raw,id){
   if(!sid(id))fail('INVALID_SYNTHETIC_ID')
   return authorize(raw,'monthly','view',async tx=>{
    const [mp,s]=await Promise.all([tx.get(ref('monthly_plans',id)),tx.get(ref('monthly_plan_snapshots',id))])
    const row=mp.data()
    if(row?.id!==id)fail('MISSING_MONTHLY_SNAPSHOT')
    return readMonthlySnapshot(row,s.data())
   })
  },
  readGroup:groups.read,
  editGroup:groups.mutate
 })
}

// A form editor can read the validated selected source, without Planning menu rights.
function createQcSourceReader(adb){
 const {state,frozenState}=createGroupStateReader(adb)
 const read=async(tx,c,id)=>(await tx.get(adb.doc(prefix+'/'+c+'/'+id))).data()
 return async(tx,q)=>{
  const d=await read(tx,'daily_plans',q.dailyPlanId)
  if(!d)fail('MISSING_DAILY_PLAN')
  const m=await read(tx,'daily_group_members',q.dailyPlanId)
  if(m?.testOnly!==true||m.dailyPlanId!==q.dailyPlanId||!sid(m.workGroupId))fail('INVALID_GROUP_MEMBERS')
  const {header,rows}=await state(tx,m.workGroupId)
  const i=rows.findIndex(r=>r.id===q.dailyPlanId)
  if(i<0)fail('INVALID_GROUP_MEMBERS')
  const {groupSnapshot,snapshots,sources}=await frozenState(tx,header,rows)
  const parent=rows[i].monthlyPlanLineId?await read(tx,'monthly_plans',rows[i].monthlyPlanLineId):null
  const foreman=await read(tx,'master_foremen',q.foreman)
  return projectQcSource(q,rows[i],snapshots[i],parent,sources[i],header,groupSnapshot,foreman)
 }
}
export function createPlanningQcSourceService(deps){
 const {adb}=deps,authorize=createAuthorizer(deps),source=createQcSourceReader(adb)
 return Object.freeze({
  async readSource(raw,input){
   const q=qcSourceRequest(input)
   return authorize(raw,q.formType,'edit',tx=>source(tx,q),true)
  }
 })
}
// Full DTO details are committed atomically with the verified canonical scalar pair.
// No photos, production transport, or component Fertilizer writes.
function createPlanningSprayCommitInternal(deps){
 const {adb}=deps,authorize=createAuthorizer(deps),source=createQcSourceReader(adb)
 const ref=(c,id)=>adb.doc(prefix+'/'+c+'/'+id)
 return Object.freeze({
  async commit(raw,input,proof=null){
   const {id,sourceRequest:q}=sprayCommitRequest(input)
   const ledger=proof?verifiedPhotoLedger(input,proof,deps.photoStore?.bucket,deps.photoStore?.bucket===mockBucket?'in-memory-mock':'supabase-private-uat'):null
   return authorize(raw,'spray','edit',async(tx,uid)=>{
    if(input.uploaderUid!==uid||input.record.ownerUid!==uid||input.record.inputtedBy!==uid)fail('QC_OWNER_ONLY')
    const read=async(c,i)=>(await tx.get(ref(c,i))).data()??null
    const projected=await source(tx,q)
    await assertNoActiveManual(tx,adb,q.dailyPlanId)
    const [current,old,oldActual,photoRow,photoAudit]=await Promise.all([
     read('qc_records',id),read('qc_spray_full',id),read('daily_reports','qcactual_'+id),
     read('qc_photo_manifests',id),read('qc_photo_manifest_audit',id+':'+input.record.clientRevision)
    ])
    if(!ledger&&(photoRow||photoAudit))fail('PHOTO_AWARE_COMMIT_REQUIRED')
    if(ledger){
     if(old){
      if(current?.clientRevision!==input.record.clientRevision)fail('PHOTO_CORRECTION_NOT_ENABLED')
      verifyPhotoLedgerPair(photoRow,photoAudit,ledger)
     }else if(photoRow||photoAudit)fail('PHOTO_LEDGER_ORPHAN')
    }
    if(current&&(current.ownerUid!==uid||current.inputtedBy!==uid))fail('QC_OWNER_ONLY')
    if(Boolean(current)!==Boolean(old))fail('FULL_SPRAY_PAIR_REQUIRES_REVIEW')
    if(current&&!sid(current.clientRevision))fail('FULL_SPRAY_PAIR_REQUIRES_REVIEW')
    const trusted=old?historicalSpraySource(projected,old.source):projected
    const prepared=preparePlanningSpray(input,trusted,uid)
    const r=prepared.record,detail=prepared.detail
    const snapshot={testOnly:true,dailyPlanId:r.dailyPlanId,monthlyPlanLineId:r.monthlyPlanLineId,pid:r.pid,date:r.date,shift:r.shift,foreman:r.foreman,formType:'spray',area100:trusted.area100}
    const audit=await read('qc_operational_audit',id+':'+r.clientRevision)
    const oldAudit=current?(current.clientRevision===r.clientRevision?audit:await read('qc_operational_audit',id+':'+current.clientRevision)):null
    const priorFullAudit=current?await read('qc_spray_full_audit',id+':'+current.clientRevision):null
    const newFullAudit=current?.clientRevision===r.clientRevision?priorFullAudit:await read('qc_spray_full_audit',id+':'+r.clientRevision)
    const run=(job,auditRow)=>commitSyntheticQc(job,{
     currentUid:async()=>uid,
     transaction:fn=>fn({
      readQc:async()=>current,readActual:async()=>oldActual,readAudit:async()=>auditRow,readDaily:async()=>snapshot,
      writeQc:(i,row)=>tx.set(ref('qc_records',i),row),
      writeActual:(i,row)=>tx.set(ref('daily_reports',i),row),
      writeAudit:(i,row)=>tx.create(ref('qc_operational_audit',i),row)
     })
    })
    if(old){
     if(!equalSprayValue(old,priorFullAudit)||old.jobId!==current.operationalSaveId||old.clientRevision!==current.clientRevision)fail('FULL_SPRAY_PAIR_REQUIRES_REVIEW')
     const prior=preparePlanningSpray({record:old.form,baseRevision:null,jobId:old.jobId,uploaderUid:uid,expectedDailyRevision:trusted.dailyRevision,foremanId:trusted.executionForemanId},trusted,uid)
     if(!equalSprayValue(prior.detail,old))fail('FULL_SPRAY_PAIR_REQUIRES_REVIEW')
     // The old canonical exact replay validates its existing Actual and audit without writes.
     await run(prior.job,oldAudit)
     if(current.clientRevision===r.clientRevision){
      if(!equalSprayValue(old,detail))fail('QC_REPLAY_PAYLOAD_MISMATCH')
      return {record:current,detail:old}
     }
     if(current.sessionId!==r.sessionId||old.form.createdAt!==detail.form.createdAt)fail('QC_SPRAY_IDENTITY_IMMUTABLE')
    }
    if(newFullAudit)fail('QC_REVISION_REUSED')
    const result=await run(prepared.job,audit)
    tx.set(ref('qc_spray_full',id),detail)
    tx.create(ref('qc_spray_full_audit',id+':'+r.clientRevision),detail)
    if(ledger){
     tx.set(ref('qc_photo_manifests',id),ledger)
     tx.create(ref('qc_photo_manifest_audit',id+':'+r.clientRevision),ledger)
    }
    return {record:result,detail}
   },true)
  }
 })
}

// Public HTTP photo-free service cannot accept arbitrary photo receipts.
export function createPlanningSprayCommitService(deps){
 const svc=createPlanningSprayCommitInternal(deps)
 return Object.freeze({commit:(raw,input)=>svc.commit(raw,input)})
}

// Current form permission + authoritative source + trusted product mapping in one transaction.
function createPlanningFertilizerCommitInternal(deps){
 const {adb}=deps,authorize=createAuthorizer(deps),source=createQcSourceReader(adb)
 const ref=(c,id)=>adb.doc(prefix+'/'+c+'/'+id)
 return Object.freeze({
  async commit(raw,input,proof=null){
   const {id,sourceRequest:q}=fertilizerCommitRequest(input)
   const ledger=proof?verifiedPhotoLedger(input,proof,deps.photoStore?.bucket,deps.photoStore?.bucket===mockBucket?'in-memory-mock':'supabase-private-uat'):null
   return authorize(raw,'fertilizer','edit',async(tx,uid)=>{
    if(input.uploaderUid!==uid||input.record.ownerUid!==uid||input.record.inputtedBy!==uid)fail('QC_OWNER_ONLY')
    const read=async(c,i)=>(await tx.get(ref(c,i))).data()??null
    const projected=await source(tx,q)
    await assertNoActiveManual(tx,adb,q.dailyPlanId)
    const [current,old,actual,spray,photoRow,photoAudit]=await Promise.all([
     read('qc_records',id),read('qc_fertilizer_full',id),read('daily_reports','qcactual_'+id),
     read('qc_spray_full',id),read('qc_photo_manifests',id),
     read('qc_photo_manifest_audit',id+':'+input.record.clientRevision)
    ])
    if(!ledger&&(photoRow||photoAudit))fail('PHOTO_AWARE_COMMIT_REQUIRED')
    if(ledger){
     if(old){
      if(current?.clientRevision!==input.record.clientRevision)fail('PHOTO_CORRECTION_NOT_ENABLED')
      verifyPhotoLedgerPair(photoRow,photoAudit,ledger)
     }else if(photoRow||photoAudit)fail('PHOTO_LEDGER_ORPHAN')
    }
    if(current&&(current.ownerUid!==uid||current.inputtedBy!==uid))fail('QC_OWNER_ONLY')
    if(spray||Boolean(current)!==Boolean(old)||(!current&&actual)||current&&!sid(current.clientRevision))fail('FULL_FERTILIZER_PAIR_REQUIRES_REVIEW')
    const trusted=old?historicalFertilizerSource(projected,old.source):projected
    const rev=input.record.clientRevision
    const [audit,fullAudit]=await Promise.all([read('qc_operational_audit',id+':'+rev),read('qc_fertilizer_full_audit',id+':'+rev)])
    if(old){
     const [priorAudit,priorFull]=current.clientRevision===rev?[audit,fullAudit]:await Promise.all([read('qc_operational_audit',id+':'+current.clientRevision),read('qc_fertilizer_full_audit',id+':'+current.clientRevision)])
     verifyFertilizerPair(current,actual,old,priorAudit,priorFull,trusted,uid)
     if(current.clientRevision===rev){
      const next=preparePlanningFertilizer(input,trusted,old.products,uid)
      if(!equalSprayValue(old,next.detail))fail('QC_REPLAY_PAYLOAD_MISMATCH')
      return {record:current,actual,detail:old}
     }
     if(current.sessionId!==input.record.sessionId||old.form.createdAt!==input.record.createdAt)fail('QC_FERTILIZER_IDENTITY_IMMUTABLE')
     if(current.operationalSaveId===input.jobId)fail('QC_JOB_REUSED')
    }
    if(current?input.baseRevision!==current.clientRevision:input.baseRevision!==null)fail('QC_REVISION_CONFLICT')
    if(audit||fullAudit)fail('QC_REVISION_REUSED')
    const products=[]
    for(const material of trusted.materials){
     const snap=await tx.get(adb.collection(prefix+'/master_fertilizer_products').where('componentId','==',material.materialId).limit(101))
     for(const p of snap.docs){const value=p.data();if(value.productId!==p.id)fail('INVALID_FERTILIZER_PRODUCT');products.push(value)}
     if(products.length>100)fail('INVALID_FERTILIZER_PRODUCTS')
    }
    const next=preparePlanningFertilizer(input,trusted,products,uid)
    if(actual&&!next.actual)fail('QC_ACTUAL_REMOVAL_REQUIRES_REVIEW')
    tx.set(ref('qc_records',id),next.record)
    if(next.actual)tx.set(ref('daily_reports','qcactual_'+id),next.actual)
    tx.set(ref('qc_fertilizer_full',id),next.detail)
    tx.create(ref('qc_operational_audit',id+':'+rev),next.audit)
    tx.create(ref('qc_fertilizer_full_audit',id+':'+rev),next.detail)
    if(ledger){
     tx.set(ref('qc_photo_manifests',id),ledger)
     tx.create(ref('qc_photo_manifest_audit',id+':'+rev),ledger)
    }
    return {record:next.record,actual:next.actual,detail:next.detail}
   },true)
  }
 })
}

export function createPlanningFertilizerCommitService(deps){
 const svc=createPlanningFertilizerCommitInternal(deps)
 return Object.freeze({commit:(raw,input)=>svc.commit(raw,input)})
}

// Internal photo-aware service, not mounted on HTTP or available to browser.
// Stage may leave a run-scoped orphan; only the later Firestore tx confirms QC.
export function createPlanningPhotoCommitService(deps){
 guard()
 const {authAdmin,photoStore}=deps
 if(!photoStore||![mockBucket,privateUatBucket].includes(photoStore.bucket)||
    typeof photoStore.putImmutable!=='function'||typeof photoStore.read!=='function')fail('PHOTO_STAGE_DEPENDENCY_REQUIRED')
 const source=createPlanningQcSourceService(deps)
 const stage=createTrustedPhotoStage({
  store:photoStore,
  async authenticatedUid(raw){
   if(typeof raw!=='string'||!raw||raw.length>16384)fail('INVALID_TOKEN')
   let actor;try{actor=await authAdmin.verifyIdToken(raw,true)}catch{fail('INVALID_TOKEN')}
   if(!sid(actor?.uid)||actor.qcUat!==true)fail('UAT_IDENTITY_DENIED')
   return actor.uid
  },
  readSource:(raw,input)=>source.readSource(raw,input)
 })
 const spray=createPlanningSprayCommitInternal(deps)
 const fertilizer=createPlanningFertilizerCommitInternal(deps)
 return Object.freeze({
  async commit(raw,input){
   if(!input||Object.getPrototypeOf(input)!==Object.prototype||
      Reflect.ownKeys(input).length!==3||
      !['sourceRequest','request','photos'].every(k=>Object.hasOwn(input,k)))fail('PHOTO_STAGE_FIELDS')
   const receipt=await stage.stage(raw,input)
   const {record}=input.request
   const service=record.formType==='spray'?spray:fertilizer
   const result=await service.commit(raw,input.request,receipt)
   return {qc:result,photo:{status:'committed',recordId:record.id,
    revision:record.clientRevision,manifestSha256:receipt.manifestSha256,
    count:Object.keys(receipt.manifest).length}}
  }
 })
}

// Independent Actual and Summary read-only gates, enriched source only. No raw QC form exposure.
function createPlanningActualSummaryInternal(deps,reconciliation){
 const {adb}=deps,authorize=createAuthorizer(deps),{state,frozenState}=createGroupStateReader(adb)
 const ref=(c,id)=>adb.doc(prefix+'/'+c+'/'+id),col=c=>adb.collection(prefix+'/'+c)
 const read=async(tx,c,id)=>(await tx.get(ref(c,id))).data()??null
 async function query(tx,c,k,id,max=100){
  const s=await tx.get(col(c).where(k,'==',id).limit(max+1))
  if(s.size>max)fail('SUMMARY_SCOPE_LIMIT')
  return s.docs.map(x=>({id:x.id,row:x.data()}))
 }
 async function loadDaily(tx,id,excludeDuplicate=null){
  const d=await read(tx,'daily_plans',id)
  if(!d)fail('MISSING_DAILY_PLAN')
  currentPlanningRow('daily',id,d)
  const member=await read(tx,'daily_group_members',id)
  if(member?.testOnly!==true||member.dailyPlanId!==id||!sid(member.workGroupId))fail('ENRICHED_SOURCE_REQUIRED')
  const {header,rows}=await state(tx,member.workGroupId)
  const i=rows.findIndex(r=>r.id===id)
  if(i<0)fail('INVALID_GROUP_MEMBERS')
  const {groupSnapshot,snapshots,sources}=await frozenState(tx,header,rows)
  const [qcs,allActuals]=await Promise.all([query(tx,'qc_records','dailyPlanId',id),query(tx,'daily_reports','dailyPlanId',id)])
  const actuals=excludeDuplicate===null?allActuals:allActuals.filter(a=>a.id!==excludeDuplicate)
  const parent=d.monthlyPlanLineId?await read(tx,'monthly_plans',d.monthlyPlanLineId):null
  if(d.status==='cancelled'&&(qcs.length||actuals.length))fail('CANCELLED_PLAN_HAS_ACTUAL')
  const seenActual=new Set(),projected=[]
  const manual=actuals.find(a=>a.id===manualActualId(id))
  if(manual){
   const r=manual.row
   if(!r.source||!Number.isSafeInteger(r.revision)||r.revision<0||r.revision>=1000000)fail('MANUAL_RECONCILIATION_REQUIRED')
   const current=projectQcSource({dailyPlanId:id,expectedDailyRevision:d.revision,formType:d.formType,date:d.date,shift:d.shift,foreman:d.foreman},d,snapshots[i],parent,sources[i],header,groupSnapshot,{testOnly:true,id:d.foreman,active:true,name:r.source.executionForemanName})
   const audit=await read(tx,'manual_actual_audit',manual.id+':'+r.revision)
   verifyManualActual(r,current,audit)
   seenActual.add(manual.id)
   if(r.status==='active'){if(qcs.length||actuals.length!==1)fail('MANUAL_ACTUAL_CONFLICT');projected.push(manualProjection(r))}
  }
  for(const {id:qid,row:q} of qcs){
   if(!sid(qid)||q.id!==qid||q.testOnly!==true||q.formType!==d.formType||!sid(q.ownerUid)||!sid(q.clientRevision)||!sid(q.foreman))fail('INVALID_ACTUAL_PAIR')
   const isSpray=d.formType==='spray',fullCol=isSpray?'qc_spray_full':'qc_fertilizer_full',fullAuditCol=fullCol+'_audit'
   const [detail,fullAudit,audit]=await Promise.all([read(tx,fullCol,qid),read(tx,fullAuditCol,qid+':'+q.clientRevision),read(tx,'qc_operational_audit',qid+':'+q.clientRevision)])
   if(!detail||!fullAudit||!audit)fail('ACTUAL_RECONCILIATION_REQUIRED')
   const s=detail.source
   if(!s||s.executionForemanId!==q.foreman||s.executionShift!==q.shift)fail('INVALID_ACTUAL_PAIR')
   // Historical names/products are validated from immutable snapshot, not today's active masters.
   const current=projectQcSource({dailyPlanId:id,expectedDailyRevision:d.revision,formType:d.formType,date:q.date,shift:q.shift,foreman:q.foreman},d,snapshots[i],parent,sources[i],header,groupSnapshot,{testOnly:true,id:q.foreman,active:true,name:s.executionForemanName})
   const trusted=isSpray?historicalSpraySource(current,s):historicalFertilizerSource(current,s)
   const aid='qcactual_'+qid
   const stored=await read(tx,'daily_reports',aid)
   if(stored){
    const hit=actuals.find(a=>a.id===aid)
    if(!hit||!equalSprayValue(hit.row,stored))fail('INVALID_ACTUAL_PAIR')
    seenActual.add(aid)
   }
   if(isSpray){
    if(!equalSprayValue(detail,fullAudit)||q.operationalSaveId!==detail.jobId||q.clientRevision!==detail.clientRevision||q.plannedDailyArea100!==d.area100)fail('INVALID_ACTUAL_PAIR')
    const prior=preparePlanningSpray({record:detail.form,baseRevision:null,jobId:detail.jobId,uploaderUid:q.ownerUid,expectedDailyRevision:trusted.dailyRevision,foremanId:q.foreman},trusted,q.ownerUid)
    if(!equalSprayValue(detail,prior.detail))fail('INVALID_ACTUAL_PAIR')
    const r=prior.record,snapshot={testOnly:true,dailyPlanId:r.dailyPlanId,monthlyPlanLineId:r.monthlyPlanLineId,pid:r.pid,date:r.date,shift:r.shift,foreman:r.foreman,formType:'spray',area100:d.area100}
    const noWrite=()=>fail('SUMMARY_WRITE_FORBIDDEN')
    await commitSyntheticQc(prior.job,{currentUid:async()=>q.ownerUid,transaction:fn=>fn({readQc:async()=>q,readActual:async()=>stored,readAudit:async()=>audit,readDaily:async()=>snapshot,writeQc:noWrite,writeActual:noWrite,writeAudit:noWrite})})
   }else verifyFertilizerPair(q,stored,detail,audit,fullAudit,trusted,q.ownerUid)
   if(stored)projected.push(actualProjection(stored,detail))
  }
  if(seenActual.size!==actuals.length)fail('ACTUAL_RECONCILIATION_REQUIRED')
  return {d,snapshot:snapshots[i],actuals:projected,actualIds:[...seenActual],qcIds:qcs.map(x=>x.id),draftCount:qcs.filter(x=>x.row.saveType==='draft').length}
 }
 function dailySummary(x){
  const {d,snapshot:s,actuals,draftCount}=x
  return {id:d.id,pid:d.pid,monthlyPlanLineId:d.monthlyPlanLineId,date:d.date,shift:d.shift,foreman:d.foreman,sourceType:d.sourceType,activity:s.activity,description:s.description,selectedVarieties:s.selectedVarieties,draftCount,...summarizeActualPlan({kind:d.formType,targetArea100:d.area100,cancelled:d.status==='cancelled',materials:s.materials,actuals})}
 }

 async function monthlySummary(tx,id,includeOrg=false){
    const [mp,s]=await Promise.all([read(tx,'monthly_plans',id),read(tx,'monthly_plan_snapshots',id)])
    if(mp?.id!==id)fail('MISSING_MONTHLY_SNAPSHOT')
    const parent=readMonthlySnapshot(mp,s)
    const linked=await query(tx,'daily_plans','monthlyPlanLineId',id,20)
    const xs=[]
    for(const {id,row} of linked){
     currentPlanningRow('daily',id,row)
     if(row.pid!==mp.pid||row.activityId!==mp.activityId||row.formType!==s.formType||row.sourceType!=='MONTHLY')fail('MONTHLY_PARENT_MISMATCH')
     xs.push(await loadDaily(tx,id))
    }
    const all=xs.flatMap(x=>x.actuals),actualIds=xs.flatMap(x=>x.actualIds),qcIds=xs.flatMap(x=>x.qcIds)
    if(qcIds.length>100||actualIds.length>100)fail('SUMMARY_SCOPE_LIMIT')
    const [ap,qcs]=await Promise.all([query(tx,'daily_reports','monthlyPlanLineId',id),query(tx,'qc_records','monthlyPlanLineId',id)])
    if(ap.length!==actualIds.length||ap.some(a=>!actualIds.includes(a.id))||qcs.length!==qcIds.length||qcs.some(x=>!qcIds.includes(x.id)))fail('ACTUAL_RECONCILIATION_REQUIRED')
    const {startDate,endDate}=planningWeek(mp.monthKey,mp.week)
    const daily=xs.map(dailySummary)
    return {...(includeOrg?{companyCode:s.companyCode,farm:s.farm}:{}),id:mp.id,pid:mp.pid,activity:s.activity,description:s.description,selectedVarieties:s.selectedVarieties,monthKey:mp.monthKey,week:mp.week,startDate,endDate,scheduledArea100:xs.filter(x=>x.d.status==='open').reduce((n,x)=>n+x.d.area100,0),outOfPeriodDailyIds:xs.filter(x=>x.d.date<startDate||x.d.date>endDate).map(x=>x.d.id),draftCount:xs.reduce((n,x)=>n+x.draftCount,0),daily,...summarizeActualPlan({kind:s.formType,targetArea100:mp.targetArea100,cancelled:mp.status==='cancelled',materials:parent.materials,actuals:all})}
 }
 async function periodRows(tx,c,field,start,end,max){
  const s=await tx.get(col(c).where(field,'>=',start).where(field,'<=',end).limit(max+1))
  if(s.size>max)fail('DASHBOARD_SCOPE_LIMIT')
  return s.docs.map(d=>({id:d.id,row:d.data()}))
 }
 async function loadDashboardPeriod(tx,q){
    const ms=q.annual?await periodRows(tx,'monthly_plans','monthKey',q.firstMonth,q.lastMonth,20):await query(tx,'monthly_plans','monthKey',q.monthKey??q.period,20)
    const selected=ms.filter(({row})=>q.week==='ALL'||row.week===q.week)
    // Validate every discovered Monthly row before filtering by its assigned week.
    for(const {id,row} of ms)currentPlanningRow('monthly',id,row)
    const [ds,aps,qcs]=await Promise.all([
     periodRows(tx,'daily_plans','date',q.startDate,q.endDate,30),
     periodRows(tx,'daily_reports','date',q.startDate,q.endDate,100),
     periodRows(tx,'qc_records','date',q.startDate,q.endDate,100)
    ])
    const xs=[]
    for(const {id,row} of ds){currentPlanningRow('daily',id,row);xs.push(await loadDaily(tx,id))}
    const actualIds=xs.flatMap(x=>x.actualIds),qcIds=xs.flatMap(x=>x.qcIds),actuals=xs.flatMap(x=>x.actuals)
    // No orphaned Actual or QC within selected execution dates; also catch linked rows with inconsistent dates.
    if(actualIds.length!==aps.length||aps.some(a=>!actualIds.includes(a.id))||qcIds.length!==qcs.length||qcs.some(a=>!qcIds.includes(a.id)))fail('ACTUAL_RECONCILIATION_REQUIRED')
    const monthly=[]
    for(const {id} of selected)monthly.push(await monthlySummary(tx,id,true))
    const daily=xs.map(dailySummary)
    return {monthly,daily,xs,actuals}
 }
 if(reconciliation==='dashboard')return Object.freeze({
  async readPeriod(raw,input){
   const q=dashboardRequest(input)
   return authorize(raw,'summary','view',async tx=>{
    const {monthly,daily,actuals}=await loadDashboardPeriod(tx,q)
    return {testOnly:true,...q,monthlyBasis:'ASSIGNED_MP_PERIOD_ALL_LINKED_ACTUAL',dailyBasis:'EXECUTION_DATE_SOURCE_DP',monthly:dashboardTotals(monthly),daily:dashboardTotals(daily),executionByForemanShift:executionTotals(actuals),outOfPeriodDailyCount:sumOutOfPeriod(monthly),readOnly:true}
   })
  }
 })
 if(reconciliation==='dashboardFilters')return Object.freeze({
  async readPeriod(raw,input){
   const q=filteredDashboardRequest(input)
   return authorize(raw,'summary','view',async tx=>{
    const {monthly,daily,xs}=await loadDashboardPeriod(tx,q)
    const entries=daily.map((s,i)=>({summary:{...s,companyCode:xs[i].snapshot.companyCode,farm:xs[i].snapshot.farm},actuals:xs[i].actuals}))
    return {testOnly:true,...q,monthlyBasis:'ASSIGNED_MP_PERIOD_ALL_LINKED_ACTUAL',dailyBasis:'EXECUTION_DATE_SOURCE_DP',...filteredDashboardTotals(q,monthly,entries),readOnly:true}
   })
  }
 })
 function sumOutOfPeriod(rows){return rows.reduce((n,r)=>n+r.outOfPeriodDailyIds.length,0)}
 async function diagnostic(tx,id){
  try{const x=await loadDaily(tx,id);return {dailyPlanId:id,status:'CLEAR',actualCount:x.actuals.length,draftCount:x.draftCount}}
  catch(e){
   if(!issueCodes.includes(e.message))throw e
   return {dailyPlanId:id,status:'REVIEW_REQUIRED',code:e.message}
  }
 }
 // Observe document versions, including missing pair/audit documents, not raw DTOs.
 // Include all linked QC/Actual rows even if the diagnostic exits on its first issue.
 async function reviewEvidence(tx,id){
  const observed=new Map()
  const track=s=>{
   const path=s.ref.path
   const t=s.exists?s.updateTime:null
   if(s.exists&&(!Number.isSafeInteger(t?.seconds)||!Number.isSafeInteger(t?.nanoseconds)))fail('INVALID_REVIEW_EVIDENCE')
   const version=t?t.seconds+':'+t.nanoseconds:null
   if(observed.has(path)&&observed.get(path)!==version)fail('REVIEW_EVIDENCE_CHANGED')
   observed.set(path,version)
  }
  const tracked={get:async refOrQuery=>{const s=await tx.get(refOrQuery);if(Array.isArray(s.docs))s.docs.forEach(track);else track(s);return s}}
  await tracked.get(ref('daily_plans',id))
  const [qcs,actuals]=await Promise.all([query(tracked,'qc_records','dailyPlanId',id),query(tracked,'daily_reports','dailyPlanId',id)])
  for(const {id:qid,row:q} of qcs){
   if(!sid(qid))continue
   await tracked.get(ref('daily_reports','qcactual_'+qid))
   for(const c of ['qc_spray_full','qc_fertilizer_full'])await tracked.get(ref(c,qid))
   if(sid(q.clientRevision))for(const c of ['qc_operational_audit','qc_spray_full_audit','qc_fertilizer_full_audit'])await tracked.get(ref(c,qid+':'+q.clientRevision))
  }
  for(const a of actuals)if(a.id===manualActualId(id)&&Number.isSafeInteger(a.row.revision)&&a.row.revision>=0&&a.row.revision<1000000)await tracked.get(ref('manual_actual_audit',a.id+':'+a.row.revision))
  const result=await diagnostic(tracked,id)
  return result.status==='CLEAR'?{...result,fingerprint:null}:{...result,fingerprint:evidenceFingerprint(id,result.code,[...observed])}
 }
 async function readReview(tx,id){
  const row=await read(tx,'reconciliation_cases',id)
  if(!row)return null
  if(!Number.isSafeInteger(row.revision)||row.revision<0||row.revision>=1000000)fail('INVALID_REVIEW_ROW')
  const checked=verifyReview(row,await read(tx,'reconciliation_case_audit',id+':'+row.revision),id)
  if(checked.status==='APPLIED')verifyCorrectionReceipt(await read(tx,'reconciliation_correction_archive',id+':'+checked.revision),checked)
  return checked
 }
 // Only this private branch may simulate exclusion; public reports never exclude records.
 async function validatedDuplicate(tx,id){
  const candidate=duplicateCandidate(id,await query(tx,'daily_reports','dailyPlanId',id))
  if(!candidate)fail('EXACT_DUPLICATE_REQUIRED')
  const x=await loadDaily(tx,id,candidate.duplicateId)
  if(!x.actuals.some(a=>a.id===candidate.canonicalId)||!x.actualIds.includes(candidate.canonicalId))fail('EXACT_DUPLICATE_REQUIRED')
  dailySummary(x) // confirm report aggregation succeeds after removal
  return candidate
 }
 if(reconciliation==='correction')return Object.freeze({
  async preview(raw,id){
   if(!sid(id))fail('INVALID_SUMMARY_REQUEST')
   return authorize(raw,'reconciliation','view',async tx=>{
    const evidence=await reviewEvidence(tx,id)
    if(evidence.status==='CLEAR')return {dailyPlanId:id,status:'CLEAR',fingerprint:null}
    if(evidence.code!=='ACTUAL_RECONCILIATION_REQUIRED')return {...evidence,correction:'MANUAL_REVIEW_REQUIRED'}
    try{
     const c=await validatedDuplicate(tx,id)
     return {...evidence,correction:'ARCHIVE_EXACT_QC_DUPLICATE',duplicateId:c.duplicateId,canonicalId:c.canonicalId}
    }catch(e){
     if(e.message!=='EXACT_DUPLICATE_REQUIRED'&&!issueCodes.includes(e.message))throw e
     return {...evidence,correction:'MANUAL_REVIEW_REQUIRED'}
    }
   })
  },
  async apply(raw,input){
   const q=correctionRequest(input)
   return authorize(raw,'reconciliation','edit',async(tx,uid,p)=>{
    planningMode(p,'actual','edit')
    const before=await readReview(tx,q.dailyPlanId)
    const evidence=await reviewEvidence(tx,q.dailyPlanId)
    const after=appliedReview(q,before,evidence,uid)
    const candidate=await validatedDuplicate(tx,q.dailyPlanId)
    const receipt=correctionReceipt(q,before,after,candidate,uid)
    const audit={testOnly:true,dailyPlanId:q.dailyPlanId,revision:after.revision,actorUid:uid,action:'apply',before,after}
    verifyReview(after,audit,q.dailyPlanId)
    verifyCorrectionReceipt(receipt,after)
    // Archive is immutable; no overwrite, no arbitrary path, no write to canonical QC/Actual.
    tx.create(ref('reconciliation_correction_archive',q.dailyPlanId+':'+after.revision),receipt)
    tx.create(ref('reconciliation_case_audit',q.dailyPlanId+':'+after.revision),audit)
    tx.set(ref('reconciliation_cases',q.dailyPlanId),after)
    tx.delete(ref('daily_reports',candidate.duplicateId))
    return {case:after,duplicateId:candidate.duplicateId,canonicalId:candidate.canonicalId}
   })
  }
 })
 if(reconciliation==='review')return Object.freeze({
  async inspect(raw,id){
   if(!sid(id))fail('INVALID_SUMMARY_REQUEST')
   return authorize(raw,'reconciliation','view',tx=>reviewEvidence(tx,id))
  },
  async readCase(raw,id){
   if(!sid(id))fail('INVALID_SUMMARY_REQUEST')
   return authorize(raw,'reconciliation','view',tx=>readReview(tx,id))
  },
  async mutate(raw,input){
   const q=reviewRequest(input)
   return authorize(raw,'reconciliation','edit',async(tx,uid)=>{
    const before=await readReview(tx,q.dailyPlanId)
    const evidence=['submit','approve'].includes(q.action)?await reviewEvidence(tx,q.dailyPlanId):null
    const after=nextReview(q,before,evidence,uid)
    const audit={testOnly:true,dailyPlanId:q.dailyPlanId,revision:after.revision,actorUid:uid,action:q.action,before,after}
    verifyReview(after,audit,q.dailyPlanId)
    tx.set(ref('reconciliation_cases',q.dailyPlanId),after)
    tx.create(ref('reconciliation_case_audit',q.dailyPlanId+':'+after.revision),audit)
    return after
   })
  }
 })
 if(reconciliation)return Object.freeze({
  async inspectDaily(raw,id){
   if(!sid(id))fail('INVALID_SUMMARY_REQUEST')
   return authorize(raw,'reconciliation','view',tx=>diagnostic(tx,id))
  }
 })
 return Object.freeze({
  async readActuals(raw,id){
   if(!sid(id))fail('INVALID_SUMMARY_REQUEST')
   return authorize(raw,'actual','view',async tx=>{
    const x=await loadDaily(tx,id)
    return {dailyPlanId:id,pid:x.d.pid,kind:x.d.formType,actuals:x.actuals}
   })
  },
  async readSummary(raw,input){
   const q=summaryRequest(input)
   return authorize(raw,'summary','view',async tx=>{
    if(q.scope==='daily')return dailySummary(await loadDaily(tx,q.id))
    return monthlySummary(tx,q.id)
   })
  }
 })
}

export function createPlanningActualSummaryService(deps){return createPlanningActualSummaryInternal(deps,false)}
export function createPlanningDashboardService(deps){return createPlanningActualSummaryInternal(deps,'dashboard')}
export function createPlanningFilteredDashboardService(deps){return createPlanningActualSummaryInternal(deps,'dashboardFilters')}
export function createPlanningReconciliationService(deps){return createPlanningActualSummaryInternal(deps,true)}
export function createPlanningReconciliationReviewService(deps){return createPlanningActualSummaryInternal(deps,'review')}
export function createPlanningControlledCorrectionService(deps){return createPlanningActualSummaryInternal(deps,'correction')}
export function createPlanningManualActualService(deps){
 const {adb}=deps,authorize=createAuthorizer(deps),source=createQcSourceReader(adb)
 const ref=(c,id)=>adb.doc(prefix+'/'+c+'/'+id),col=c=>adb.collection(prefix+'/'+c)
 return Object.freeze({
  async mutate(raw,input){
   const q=manualRequest(input),id=manualActualId(q.dailyPlanId)
   return authorize(raw,'actual','edit',async(tx,uid)=>{
    const [dp,prior,qcs,actuals]=await Promise.all([tx.get(ref('daily_plans',q.dailyPlanId)),tx.get(ref('daily_reports',id)),tx.get(col('qc_records').where('dailyPlanId','==',q.dailyPlanId).limit(1)),tx.get(col('daily_reports').where('dailyPlanId','==',q.dailyPlanId).limit(2))])
    if(!dp.exists)fail('MISSING_DAILY_PLAN')
    const d=dp.data()
    currentPlanningRow('daily',q.dailyPlanId,d)
    if(!qcs.empty||actuals.docs.some(x=>x.id!==id))fail('MANUAL_ACTUAL_CONFLICT')
    const trusted=await source(tx,{dailyPlanId:d.id,expectedDailyRevision:q.expectedDailyRevision,formType:d.formType,date:d.date,shift:d.shift,foreman:d.foreman})
    const before=prior.data()??null
    if(before){
     if(!Number.isSafeInteger(before.revision)||before.revision<0||before.revision>=1000000)fail('MANUAL_RECONCILIATION_REQUIRED')
     const audit=(await tx.get(ref('manual_actual_audit',id+':'+before.revision))).data()
     verifyManualActual(before,trusted,audit)
    }
    const next=nextManualActual(q,trusted,before,uid)
    tx.set(ref('daily_reports',id),next)
    tx.create(ref('manual_actual_audit',id+':'+next.revision),{testOnly:true,id,revision:next.revision,actorUid:uid,action:q.action,before,after:next})
    return next
   })
  }
 })
}

// Reads only pre-staged synthetic legacy rows and explicit crosswalks in the isolated demo.
// No export, import, repair or live database access.
export function createPlanningLegacyMappingService(deps){
 const {adb}=deps,authorize=createAuthorizer(deps),source=createQcSourceReader(adb)
 const ref=(c,id)=>adb.doc(prefix+'/'+c+'/'+id),col=c=>adb.collection(prefix+'/'+c)
 return Object.freeze({
  async dryRun(raw,input){
   const q=legacyMappingRequest(input)
   return authorize(raw,'reconciliation','view',async(tx,uid)=>{
    const dp=(await tx.get(ref('daily_plans',q.dailyPlanId))).data()
    if(!dp)fail('MISSING_DAILY_PLAN')
    currentPlanningRow('daily',q.dailyPlanId,dp)
    const trusted=await source(tx,{dailyPlanId:dp.id,expectedDailyRevision:q.expectedDailyRevision,formType:dp.formType,date:dp.date,shift:dp.shift,foreman:dp.foreman})
    const link=(await tx.get(ref('legacy_daily_links',q.dailyPlanId))).data()
    if(!link)return {testOnly:true,dailyPlanId:q.dailyPlanId,status:'REVIEW_REQUIRED',code:'LEGACY_MAPPING_REQUIRED',writeAuthorized:false}
    validateLegacyLink(link,trusted)
    const reverse=await tx.get(col('legacy_daily_links').where('legacyDailyPlanId','==',link.legacyDailyPlanId).limit(2))
    if(reverse.size!==1||reverse.docs[0].id!==q.dailyPlanId)fail('LEGACY_MAPPING_AMBIGUOUS')
    const [legacy,qcs,actuals]=await Promise.all([
     tx.get(col('legacy_actual_staging').where('dailyPlanId','==',link.legacyDailyPlanId).limit(101)),
     tx.get(col('qc_records').where('dailyPlanId','==',q.dailyPlanId).limit(1)),
     tx.get(col('daily_reports').where('dailyPlanId','==',q.dailyPlanId).limit(1))
    ])
    if(legacy.size>100)fail('LEGACY_SCOPE_LIMIT')
    return assessLegacyActual(trusted,link,legacy.docs.map(d=>({id:d.id,row:d.data()})),!qcs.empty||!actuals.empty,uid)
   })
  }
 })
}


// 11D.5c.2 synthetic form selection: fresh trusted Daily source, independent QC Edit permission.
// This read does not require the user's Planning menu grant, nor return full Planning documents.
// Production form data and material snapshots remain on their existing isolated paths.
export function createPlanningQcSelectionService(deps){
 const {adb}=deps,authorize=createAuthorizer(deps)
 return Object.freeze({
  async readSource(raw,input){
   if(!input||Object.getPrototypeOf(input)!==Object.prototype||
      Reflect.ownKeys(input).length!==2||
      !Object.hasOwn(input,'dailyPlanId')||!Object.hasOwn(input,'formType')||
      !sid(input.dailyPlanId)||!['spray','fertilizer'].includes(input.formType))fail('INVALID_QC_SOURCE_REQUEST')
   return authorize(raw,input.formType,'edit',async tx=>{
    const row=(await tx.get(adb.doc(prefix+'/daily_plans/'+input.dailyPlanId))).data()
    if(!row)fail('MISSING_DAILY_PLAN')
    currentPlanningRow('daily',input.dailyPlanId,row)
    if(row.status!=='open')fail('PLAN_CLOSED')
    if(row.formType!==input.formType)fail('QC_FORM_MISMATCH')
    if(row.sourceType==='MONTHLY'){
     const parent=(await tx.get(adb.doc(prefix+'/monthly_plans/'+row.monthlyPlanLineId))).data()
     if(!parent)fail('MONTHLY_PARENT_NOT_FOUND')
     currentPlanningRow('monthly',row.monthlyPlanLineId,parent)
     if(parent.status!=='open'||parent.pid!==row.pid||parent.activityId!==row.activityId)fail('MONTHLY_PARENT_CLOSED')
    }
    const {dailyPlanId,monthlyPlanLineId,pid,date,shift,foreman,formType,area100,revision}=row
    return {testOnly:true,dailyPlanId,monthlyPlanLineId,pid,date,shift,foreman,formType,area100,revision,readOnly:true}
   },true)
  }
 })
}
