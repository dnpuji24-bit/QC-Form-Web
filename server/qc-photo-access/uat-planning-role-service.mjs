// Dedicated synthetic Planning authorization lab. Never mount in production.
import {keys,roles} from '../../src/qcUatRolePermissions.mjs'
import {permissionsForIdentity} from '../../src/qcUatCustomRoles.mjs'
import {operationalPermissions} from './uat-operational-permissions.mjs'
import {planningRequest,nextPlanningRow,verifyMonthlyParent} from '../../src/qcUatPlanningWriteContract.mjs'
import {planningQcInput,planningQcSnapshot,planningCarryoverSnapshot} from '../../src/qcUatPlanningQcBridge.mjs'
import {commitSyntheticQc} from '../../src/qcUatQcLifecycleContract.mjs'
import {dailyGroupCreate} from '../../src/qcUatDailyGroupContract.mjs'

export const projectId='demo-qc-uat-planning-role',host='127.0.0.1',firestorePort=9085,authPort=9899
const prefix='qc_uat_workspaces/cutover'
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const scopes=Object.freeze({monthly:'data_plan_monthly',daily:'data_plan_daily',actual:'data_plan_actual',summary:'data_plan_summary'})
const collections=Object.freeze({monthly:'monthly_plans',daily:'daily_plans'})
const fail=code=>{throw Error(code)}
export function guard(e=process.env){
 if(e.GCLOUD_PROJECT!==projectId||e.FIRESTORE_EMULATOR_HOST!==host+':'+firestorePort||e.FIREBASE_AUTH_EMULATOR_HOST!==host+':'+authPort)fail('DEMO_EMULATORS_REQUIRED')
 for(const k of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[k]&&e[k]!==projectId)fail('WRONG_PROJECT')
}
export function planningMode(permissions,scope,operation){
 if(!Object.hasOwn(scopes,scope)||!['view','edit'].includes(operation))fail('INVALID_PLANNING_OPERATION')
 const mode=permissions?.[scopes[scope]]
 if(mode!=='edit'&&(operation!=='view'||mode!=='view'))fail('PLANNING_PERMISSION_DENIED')
 return mode
}
function createAuthorizer({adb,authAdmin}){
 guard()
 if(authAdmin.app.options.projectId!==projectId||adb.projectId!==projectId)fail('WRONG_PROJECT')
 async function authorize(raw,scope,operation,read,internalQc=false){
  guard()
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
   return read?read(tx,token.uid):{scope,operation,mode}
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
    const {expectedDailyRevision,...job}=q
    return commitSyntheticQc(job,{
     currentUid:async()=>uid,
     transaction:fn=>fn({
      readQc:async id=>{
       const row=await read('qc_records',id)
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
export function createDailyGroupService(deps){
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
    for(const r of rows){
     const [daily,member,pad]=await Promise.all([tx.get(ref('daily_plans',r.id)),tx.get(ref('daily_group_members',r.id)),tx.get(ref('master_paddocks',r.pid))])
     if(daily.exists||member.exists)fail('PLAN_ALREADY_EXISTS')
     const p=pad.data()
     if(p?.testOnly!==true||p.pid!==r.pid||p.active!==true)fail('INVALID_PLANNING_MASTER')
     if(r.sourceType==='MONTHLY')verifyMonthlyParent(r,(await tx.get(ref('monthly_plans',r.monthlyPlanLineId))).data())
    }
    tx.create(gref,header)
    tx.create(gaudit,{testOnly:true,scope:'group',id:header.workGroupId,action:'create',actorUid:uid,previousRevision:null,revision:0,before:null,after:header})
    for(const r of rows){
     tx.create(ref('daily_plans',r.id),r)
     tx.create(ref('daily_group_members',r.id),{testOnly:true,dailyPlanId:r.id,workGroupId:header.workGroupId})
     tx.create(ref('planning_audit','daily:'+r.id+':0'),{testOnly:true,scope:'daily',id:r.id,action:'create',actorUid:uid,previousRevision:null,revision:0,before:null,after:r})
    }
    return {header,rows}
   })
  }
 })
}
