// Pure, fail-closed read permission projection for a committed QC photo.
// Firebase Auth enabled/revoked and user approval are checked by the HTTP handler.
// Mandor ownership mirrors Firestore qc_records read rules (ownsExisting).
const readable=new Set(['view','edit'])
export function maySignOperationalQcPhoto(profile,roleTemplate,qc){
 if(!profile||!qc||!['spray','fertilizer'].includes(qc.formType)||
   qc.firestoreSaveState!=='confirmed')return false
 if(profile.role==='owner')return true
 if(!roleTemplate||roleTemplate.role!==profile.role||
   !readable.has(roleTemplate.permissions?.qc_records))return false
 if(profile.role==='mandor_spraying'||profile.role==='mandor_fertilizer'){
   return typeof profile.username==='string'&&profile.username.length>0&&
     qc.inputtedBy===profile.username
 }
 return ['manager','admin','asisten','pengunjung'].includes(profile.role)
}
