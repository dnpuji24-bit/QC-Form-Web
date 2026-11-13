const norm=v=>String(v??'').trim().toLowerCase()
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)
const name=v=>typeof v==='string'&&v.trim().length>=3&&v.trim().length<=100&&!/[\x00-\x1f\x7f]/.test(v)?v.trim():null
const only=(o,keys)=>Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k))
export async function nativeNameRequest({db,actor,command,stamp,now=Date.now()}){
 if(!validId(actor?.uid)||!actor.email||!command||!validId(command.requestId))throw Error('INVALID_COMMAND')
 const submit=command.action==='requestNameChange',review=command.action==='reviewNameChange'
 if(!submit&&!review)throw Error('INVALID_COMMAND')
 if(submit&&(!only(command,['action','requestId','newFullName'])||!name(command.newFullName)))throw Error('INVALID_COMMAND')
 if(review&&(!only(command,['action','requestId','decision'])||!['approve','reject'].includes(command.decision)))throw Error('INVALID_COMMAND')
 if(submit&&(!Number.isFinite(actor.auth_time)||now/1000-actor.auth_time>300||actor.auth_time>now/1000+30))throw Error('RECENT_AUTH_REQUIRED')
 const users=db.collection('users'),requests=db.collection('qc_native_name_requests'),locks=db.collection('qc_native_name_pending')
 const ref=requests.doc(command.requestId)
 return db.runTransaction(async tx=>{
  const [profileSnap,requestSnap]=await Promise.all([tx.get(users.doc(actor.uid)),tx.get(ref)])
  const profile=profileSnap.data(),old=requestSnap.data()
  if(!profile||profile.active!==true||!['approved','APPROVED'].includes(profile.status)||norm(profile.email)!==norm(actor.email)||(profile.firebaseUid&&profile.firebaseUid!==actor.uid))throw Error('ACCOUNT_PROFILE_REQUIRED')
  if(submit){
   if(profile.role!=='owner'){
    const template=(await tx.get(db.collection('role_access').doc(profile.role))).data()
    if(template?.role!==profile.role||template.permissions?.qc_settings!=='edit')throw Error('ACCOUNT_REQUEST_FORBIDDEN')
   }
   if(old){
    if(old.uid===actor.uid&&old.newFullName===name(command.newFullName))return {ok:true,replayed:true,status:old.status}
    throw Error('ACCOUNT_REQUEST_CONFLICT')
   }
   if(typeof profile.fullName!=='string'||!profile.fullName.trim()||typeof profile.username!=='string'||!profile.username.trim()||name(command.newFullName)===profile.fullName.trim())throw Error('INVALID_COMMAND')
   const lock=locks.doc(actor.uid),pending=await tx.get(lock)
   if(pending.exists)throw Error('ACCOUNT_REQUEST_PENDING')
   tx.create(ref,{uid:actor.uid,username:profile.username,oldFullName:profile.fullName,newFullName:name(command.newFullName),status:'pending',createdAt:stamp()})
   tx.create(lock,{requestId:command.requestId})
   return {ok:true,replayed:false,status:'pending'}
  }
  if(profile.role!=='owner')throw Error('OWNER_REQUIRED')
  if(!old||!validId(old.uid))throw Error('ACCOUNT_REQUEST_CONFLICT')
  const status=command.decision==='approve'?'approved':'rejected'
  if(old.status===status&&old.reviewedBy===actor.uid)return {ok:true,replayed:true,status}
  if(old.status!=='pending')throw Error('ACCOUNT_REQUEST_CONFLICT')
  const target=users.doc(old.uid),lock=locks.doc(old.uid)
  const [targetSnap,lockSnap]=await Promise.all([tx.get(target),tx.get(lock)])
  const current=targetSnap.data()
  if(lockSnap.data()?.requestId!==command.requestId)throw Error('ACCOUNT_REQUEST_CONFLICT')
  if(status==='approved'&&(!current||current.active!==true||!['approved','APPROVED'].includes(current.status)||current.username!==old.username||current.fullName!==old.oldFullName||!name(old.newFullName)))throw Error('ACCOUNT_REQUEST_CONFLICT')
  if(status==='approved')tx.update(target,{fullName:old.newFullName,updatedAt:stamp(),updatedBy:actor.uid})
  tx.update(ref,{status,reviewedBy:actor.uid,reviewedAt:stamp()})
  tx.delete(lock)
  tx.create(db.collection('qc_admin_audit').doc('name_'+command.requestId),{action:'reviewNameChange',actorUid:actor.uid,target:old.uid,before:{fullName:old.oldFullName},after:{status,fullName:status==='approved'?old.newFullName:old.oldFullName},createdAt:stamp()})
  return {ok:true,replayed:false,status}
 })
}
