// Fail closed for real Firebase identities and both supported approved profile formats.
const roles=new Set(['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung'])
const norm=v=>typeof v==='string'?v.trim().toLowerCase():''
export function isOperationalPhotoIdentityAllowed({uid,tokenEmail,account,profile}){
 const email=norm(tokenEmail)
 return typeof uid==='string'&&uid.length>0&&!!email&&account?.localId===uid&&account.disabled!==true&&norm(account.email)===email&&profile?.active===true&&['APPROVED','approved'].includes(profile.status)&&roles.has(profile.role)&&norm(profile.email)===email
}
