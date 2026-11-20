// Separate UAT role lifecycle; never imported by production entrypoint.
import {roleLifecyclePreview,roleLifecycleUpdate,roleLifecycleDelete,roleLifecycleNext,roleLifecycleMembers,roleLifecycleTombstone} from '../../src/qcUatRoleLifecycle.mjs'
import {permissionsForIdentity} from '../../src/qcUatCustomRoles.mjs'
import {verifyRegistrationRow} from '../../src/qcUatCustomRoleRegistration.mjs'
const sid=x=>typeof x==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(x)
export function createRoleLifecycleService({adb,tokenFor,ownerAllowed,row,definitionFor,fail,mark,profile,catalog,roleAudit,registration,prefix}){
 const retired=adb.collection(prefix+'/role_tombstones')
 async function authorized(tx,token,id){
  const [actor,prod,definition]=await Promise.all([tx.get(mark(token.uid)),tx.get(profile(token.uid)),definitionFor(tx,id)])
  if(!ownerAllowed(token,actor.data(),prod.exists))fail(403,'OWNER_REQUIRED')
  if(!definition)fail(409,'ROLE_NOT_FOUND')
  return definition
 }
 async function members(tx,id,definition){
  const list=await tx.get(adb.collection('qc_uat_identities').where('role','==',id).limit(76))
  if(list.size>75)fail(409,'ROLE_MEMBER_LIMIT')
  const profiles=await Promise.all(list.docs.map(d=>tx.get(profile(d.id))))
  return list.docs.map((d,i)=>{
   if(!sid(d.id)||profiles[i].exists)fail(409,'ROLE_MEMBER_INVALID')
   const m=d.data()
   row(d.id,m,false,definition)
   return {uid:d.id,policyRevision:m.policyRevision,marker:m}
  }).sort((a,b)=>a.uid<b.uid?-1:a.uid>b.uid?1:0)
 }
 async function ensureNoUnresolvedRegistration(tx,id){
  const list=await tx.get(registration.limit(101))
  if(list.size>100)fail(409,'REGISTRATION_LIST_LIMIT')
  for(const doc of list.docs){
   let r;try{r=verifyRegistrationRow(doc.data(),doc.id)}catch{fail(409,'INVALID_REGISTRATION_ROW')}
   if(['pending','approved'].includes(r.status)&&(r.requestedRoleId===id||r.approvedRoleId===id))fail(409,'ROLE_REGISTRATION_IN_USE')
  }
 }
 return {
  async previewRoleLifecycle(raw,input){
   const token=await tokenFor(raw)
   let q;try{q=roleLifecyclePreview(input)}catch(e){fail(400,e.message)}
   return adb.runTransaction(async tx=>{
    const definition=await authorized(tx,token,q.roleId)
    const current=await members(tx,q.roleId,definition)
    return {definition,members:current.map(x=>({uid:x.uid,policyRevision:x.policyRevision})),readOnly:true}
   })
  },
  async updateRoleLifecycle(raw,input){
   const token=await tokenFor(raw)
   let q;try{q=roleLifecycleUpdate(input)}catch(e){fail(400,e.message)}
   return adb.runTransaction(async tx=>{
    const before=await authorized(tx,token,q.roleId)
    if(before.revision!==q.expectedRevision)fail(409,'ROLE_REVISION_CONFLICT')
    await ensureNoUnresolvedRegistration(tx,q.roleId)
    const assigned=await members(tx,q.roleId,before)
    try{roleLifecycleMembers(assigned,q.expectedMembers)}catch(e){fail(409,e.message)}
    let after;try{after=roleLifecycleNext(before,q)}catch(e){fail(409,e.message)}
    for(const {uid,marker:m} of assigned){
     if(m.policyRevision>=999998)fail(409,'POLICY_REVISION_LIMIT')
     const revision=m.policyRevision+1
     let permissions;try{permissions=permissionsForIdentity({...m,policyRevision:revision},after)}catch{fail(409,'ROLE_MEMBER_INVALID')}
     const next={...m,permissions,policyRevision:revision}
     row(uid,next,false,after)
     tx.update(mark(uid),{permissions,policyRevision:revision})
     tx.create(adb.doc(prefix+'/permission_audit/'+uid+':'+revision),{testOnly:true,workspace:'cutover',actorUid:token.uid,targetUid:uid,action:'edit_role',previousRevision:m.policyRevision,revision,roleId:q.roleId,roleRevision:after.revision,beforePermissions:m.permissions,afterPermissions:permissions})
    }
    tx.update(catalog.doc(q.roleId),{definition:after})
    tx.create(roleAudit.doc(q.roleId+':'+after.revision),{testOnly:true,workspace:'cutover',actorUid:token.uid,action:'edit_role',previousRevision:before.revision,revision:after.revision,before,after,affectedUids:assigned.map(x=>x.uid)})
    return {definition:after,affectedCount:assigned.length}
   })
  },
  async deleteRoleLifecycle(raw,input){
   const token=await tokenFor(raw)
   let q;try{q=roleLifecycleDelete(input)}catch(e){fail(400,e.message)}
   return adb.runTransaction(async tx=>{
    const before=await authorized(tx,token,q.roleId)
    if(before.revision!==q.expectedRevision)fail(409,'ROLE_REVISION_CONFLICT')
    const tombstone=await tx.get(retired.doc(q.roleId))
    if(tombstone.exists)fail(409,'ROLE_ALREADY_RETIRED')
    await ensureNoUnresolvedRegistration(tx,q.roleId)
    const assigned=await members(tx,q.roleId,before)
    if(assigned.length)fail(409,'ROLE_STILL_ASSIGNED')
    const archive=roleLifecycleTombstone(before,token.uid)
    tx.create(retired.doc(q.roleId),archive)
    tx.delete(catalog.doc(q.roleId))
    tx.create(roleAudit.doc(q.roleId+':delete'),{testOnly:true,workspace:'cutover',actorUid:token.uid,action:'delete_role',before,after:null})
    return {roleId:q.roleId,retired:true}
   })
  }
 }
}
