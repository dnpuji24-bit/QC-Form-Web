// Password changes are enabled only after the legacy authentication path is retired.
export function assertNativePasswordAllowed({native,enabled,online,expectedUid,profile,identity}){
 if(!native||!enabled)throw Error('NATIVE_PASSWORD_DISABLED')
 if(!online)throw Error('NATIVE_PASSWORD_OFFLINE')
 if(!expectedUid||!profile||profile.firebaseUid!==expectedUid||profile.status!=='approved'||!identity||identity.uid!==expectedUid||!identity.email||!profile.email||identity.email.trim().toLowerCase()!==profile.email.trim().toLowerCase())throw Error('NATIVE_PASSWORD_SESSION_CHANGED')
 if(profile.role!=='owner'&&profile.permissions?.qc_settings!=='edit')throw Error('NATIVE_PASSWORD_FORBIDDEN')
}
export function validateNativePassword(current,next,confirm){
 if(typeof current!=='string'||!current||typeof next!=='string'||next.length<8||next.length>256||next===current||next!==confirm)throw Error('NATIVE_PASSWORD_INVALID')
}
// Re-check the approved profile and current identity after reauthentication.
// Credentials are kept in memory; no Firestore or legacy account writes.
export async function changeNativePassword({native,enabled,online,expectedUid,current,next,confirm,readProfile,getIdentity,reauthenticate,update}){
 validateNativePassword(current,next,confirm)
 const profile=await readProfile(),identity=getIdentity()
 assertNativePasswordAllowed({native,enabled,online:online(),expectedUid,profile,identity})
 await reauthenticate(identity,current)
 const refreshed=await readProfile()
 assertNativePasswordAllowed({native,enabled,online:online(),expectedUid,profile:refreshed,identity:getIdentity()})
 await update(identity,next)
 return {ok:true,sessionChanged:getIdentity()?.uid!==expectedUid}
}
