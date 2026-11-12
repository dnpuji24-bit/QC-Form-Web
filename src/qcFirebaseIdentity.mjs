const roles=['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung']
export function resolveFirebaseProfile(identity,profile,template,keys){
  if(!identity?.uid||!identity.email||!profile||profile.active!==true||profile.status!=='approved')throw Error('AUTH_PROFILE_NOT_APPROVED')
  if(typeof profile.email!=='string'||profile.email.trim().toLowerCase()!==identity.email.trim().toLowerCase())throw Error('AUTH_PROFILE_IDENTITY_MISMATCH')
  if(!roles.includes(profile.role)||typeof profile.username!=='string'||!profile.username.trim()||typeof profile.fullName!=='string'||!profile.fullName.trim())throw Error('AUTH_PROFILE_INVALID')
  if(profile.firebaseUid&&profile.firebaseUid!==identity.uid)throw Error('AUTH_PROFILE_IDENTITY_MISMATCH')
  const permissions={}
  for(const key of keys){
    const mode=template?.role===profile.role?template?.permissions?.[key]:undefined
    permissions[key]=profile.role==='owner'?'edit':['none','view','edit'].includes(mode)?mode:'none'
  }
  return {username:profile.username,fullName:profile.fullName,email:identity.email,role:profile.role,status:'approved',firebaseUid:identity.uid,permissions}
}
