// Trusted administration core. Caller must verify the Firebase ID token with revocation checking.
export const roles=['manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung']
export const permissionKeys=['qc_dashboard','qc_spraying','qc_fertilizer','qc_records','qc_logs','qc_settings','data_plan_summary','data_plan_monthly','data_plan_monthly_import','data_plan_daily','data_plan_daily_import','data_plan_actual','data_plan_actual_import','data_plan_reconciliation','data_master_paddock_list','data_master_paddock_import','data_master_activity_list','data_master_activity_manage','data_master_activity_resources','data_master_activity_import','data_company']
const norm=v=>String(v??'').trim().toLowerCase()
const validUid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)
function requireOwner(p,actor){if(!p||p.role!=='owner'||p.active!==true||p.status!=='approved'||norm(p.email)!==norm(actor.email)||!actor.email)throw Error('OWNER_REQUIRED')}
export function validatePermissions(p){if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==permissionKeys.length||!permissionKeys.every(k=>Object.hasOwn(p,k)&&['none','view','edit'].includes(p[k])))throw Error('INVALID_PERMISSIONS');return Object.fromEntries(permissionKeys.map(k=>[k,p[k]]))}
export async function administer({db,auth,actor,command,stamp}){
 if(!validUid(actor?.uid)||!command||!['activate','setRole','setActive','setPermissions'].includes(command.action))throw Error('INVALID_COMMAND')
 const action=command.action
 const target=command.uid
 if(action!=='setPermissions'&&(!validUid(target)||target===actor.uid))throw Error('INVALID_TARGET')
 if(action==='setRole'&&!roles.includes(command.role))throw Error('INVALID_ROLE')
 if(action==='setActive'&&typeof command.active!=='boolean')throw Error('INVALID_ACTIVE')
 if(action==='setPermissions'&&!roles.includes(command.role))throw Error('INVALID_ROLE')
 const permissions=action==='setPermissions'?validatePermissions(command.permissions):null
 const identity=action==='activate'?await auth.getUser(target):null
 if(identity&&(identity.disabled||!identity.emailVerified||!identity.email||identity.uid!==target))throw Error('AUTH_IDENTITY_NOT_VERIFIED')
 const users=db.collection('users'),requests=db.collection('firebase_registration_requests'),templates=db.collection('role_access')
 const audit=db.collection('qc_admin_audit').doc()
 return db.runTransaction(async tx=>{
  const owner=(await tx.get(users.doc(actor.uid))).data();requireOwner(owner,actor)
  const ref=action==='setPermissions'?templates.doc(command.role):users.doc(target)
  const existing=await tx.get(ref),before=existing.data()
  let after
  if(action==='activate'){
   const requestRef=requests.doc(target),request=(await tx.get(requestRef)).data()
   if(existing.exists||!request||request.status!=='approved_for_provisioning'||!roles.includes(request.approvedRole)||!request.reviewedBy||norm(request.email)!==norm(identity.email))throw Error('INVALID_APPROVAL')
   const reviewer=(await tx.get(users.doc(request.reviewedBy))).data()
   if(!reviewer||reviewer.role!=='owner'||reviewer.active!==true||reviewer.status!=='approved')throw Error('INVALID_REVIEWER')
   const username=norm(request.username)
   if(!/^[a-z0-9_]{3,40}$/.test(username)||typeof request.fullName!=='string'||request.fullName.trim().length<2||request.fullName.length>120)throw Error('INVALID_PROFILE')
   const all=await tx.get(users)
   if(all.docs.some(d=>norm(d.data().username)===username))throw Error('DUPLICATE_USERNAME')
   const template=(await tx.get(templates.doc(request.approvedRole))).data()
   if(!template||template.role!==request.approvedRole)throw Error('ROLE_TEMPLATE_REQUIRED')
   validatePermissions(template.permissions)
   after={username,fullName:request.fullName.trim(),email:identity.email,role:request.approvedRole,status:'approved',active:true,firebaseUid:target,source:'firebase_native',createdAt:stamp(),updatedAt:stamp()}
   tx.create(ref,after)
   tx.update(requestRef,{status:'activated',activatedBy:actor.uid,activatedAt:stamp()})
  }else if(action==='setPermissions'){
   after={role:command.role,permissions,updatedAt:stamp(),updatedBy:actor.uid}
   tx.set(ref,after)
  }else{
   if(!before||before.role==='owner'||before.status!=='approved')throw Error('TARGET_PROTECTED')
   if(action==='setRole'){
    const template=(await tx.get(templates.doc(command.role))).data()
    if(!template||template.role!==command.role)throw Error('ROLE_TEMPLATE_REQUIRED')
    validatePermissions(template.permissions)
   }
   after=action==='setRole'?{role:command.role}:{active:command.active}
   tx.update(ref,{...after,updatedAt:stamp(),updatedBy:actor.uid})
  }
  const safe=p=>p?Object.fromEntries(['role','active','status','permissions'].filter(k=>Object.hasOwn(p,k)).map(k=>[k,p[k]])):null
  tx.create(audit,{action,actorUid:actor.uid,target:action==='setPermissions'?command.role:target,before:safe(before),after:safe(after),createdAt:stamp()})
  return {ok:true,auditId:audit.id}
 })
}
