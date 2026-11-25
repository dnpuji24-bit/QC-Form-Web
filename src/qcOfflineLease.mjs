// Local UX lease, NOT a Firebase credential or authorization source.
// A saved profile is usable only alongside the SDK-restored matching Firebase user,
// while disconnected. No password, ID token, or refresh token is stored here.
export const OFFLINE_LEASE_MS=12*60*60*1000
export const OFFLINE_PROFILE_KEY='qc_verified_offline_profile_v1'
const roles=['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung']
const clean=x=>typeof x==='string'?x.trim():''
const email=x=>clean(x).toLowerCase()
export function createOfflineLease(user,identity,projectId,now=Date.now()){
 if(!identity?.uid||user?.firebaseUid!==identity.uid||!email(identity.email)||
    email(user.email)!==email(identity.email)||!roles.includes(user.role)||
    user.status!=='approved'||!clean(user.username)||!clean(user.fullName)||
    !clean(projectId)||!Number.isFinite(now)||now<=0)return null
 const permissions=Object.fromEntries(Object.entries(user.permissions||{})
   .filter(([key,value])=>/^[a-z_]+$/.test(key)&&['none','view','edit'].includes(value)))
 return {version:1,projectId,verifiedAt:now,expiresAt:now+OFFLINE_LEASE_MS,
   user:{firebaseUid:identity.uid,email:identity.email,username:user.username,
     fullName:user.fullName,role:user.role,status:'approved',permissions}}
}
export function readOfflineLease(raw,identity,projectId,now=Date.now()){
 if(!raw||!identity?.uid||!email(identity.email))return null
 try{
  const value=typeof raw==='string'?JSON.parse(raw):raw
  if(value?.version!==1||value.projectId!==projectId||
     !Number.isFinite(now)||!Number.isFinite(value.verifiedAt)||
     value.verifiedAt>now||value.expiresAt!==value.verifiedAt+OFFLINE_LEASE_MS||
     now>=value.expiresAt)return null
  const checked=createOfflineLease(value.user,identity,projectId,value.verifiedAt)
  return checked
 }catch{return null}
}
export function isOfflineTransportFailure(error){
 const code=clean(error?.code).replace(/^firestore\//,'')
 return ['unavailable','deadline-exceeded','auth/network-request-failed'].includes(code)
}
