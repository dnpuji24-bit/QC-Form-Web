// Dedicated synthetic Planning authorization lab. Never mount in production.
import {keys,roles} from '../../src/qcUatRolePermissions.mjs'
import {permissionsForIdentity} from '../../src/qcUatCustomRoles.mjs'
import {operationalPermissions} from './uat-operational-permissions.mjs'
import {planningRequest,nextPlanningRow,verifyMonthlyParent} from '../../src/qcUatPlanningWriteContract.mjs'
import {planningQcInput,planningQcSnapshot,planningCarryoverSnapshot} from '../../src/qcUatPlanningQcBridge.mjs'
import {commitSyntheticQc} from '../../src/qcUatQcLifecycleContract.mjs'
import {dailyGroupCreate} from '../../src/qcUatDailyGroupContract.mjs'
import {activityComponents,monthlySnapshotRequest,monthlySnapshot,dailySnapshot,validateGroupResources,aggregateGroupMaterials,materialTotals,readMonthlySnapshot,readGroupSnapshot,reviseDailySnapshot} from '../../src/qcUatPlanningMasterSnapshot.mjs'
import {qcSourceRequest,projectQcSource} from '../../src/qcUatPlanningQcSource.mjs'
import {groupHeaderIds,validateGroupState,groupMutationRequest,nextDailyGroup,groupReorderRequest,nextGroupOrder} from '../../src/qcUatDailyGroupLifecycle.mjs'

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
export function createPlanningQcSourceService(deps){
 const {adb}=deps,authorize=createAuthorizer(deps),{state,frozenState}=createGroupStateReader(adb)
 const read=async(tx,c,id)=>(await tx.get(adb.doc(prefix+'/'+c+'/'+id))).data()
 return Object.freeze({
  async readSource(raw,input){
   const q=qcSourceRequest(input)
   return authorize(raw,q.formType,'edit',async tx=>{
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
   },true)
  }
 })
}
