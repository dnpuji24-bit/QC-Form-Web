// Dedicated demo service helper; no production entrypoint. Catalog reads share the caller's transaction.
import {roles,keys} from '../../src/qcUatRolePermissions.mjs'
import {isCustomRoleId,permissionsForIdentity} from '../../src/qcUatCustomRoles.mjs'
const plain=v=>!!v&&Object.getPrototypeOf(v)===Object.prototype
const modes=['none','view','edit']
const need=(v,code='UAT_IDENTITY_DENIED')=>{if(!v)throw Error(code)}
export function resolveOperationalPermissions({marker,productionProfile,catalog}){
 need(!productionProfile&&marker?.testOnly===true&&marker.enabled===true&&marker.workspace==='cutover'&&plain(marker.permissions))
 // Preserve the already verified legacy built-in fixture contract; never fallback for custom identities.
 if(roles.includes(marker.role))return marker.permissions
 need(isCustomRoleId(marker.role))
 need(Number.isSafeInteger(marker.policyRevision)&&marker.policyRevision>=0&&marker.policyRevision<1000000)
 need(plain(marker.roleOverrides)&&plain(marker.manualOverrides))
 need(catalog?.testOnly===true&&catalog.workspace==='cutover'&&catalog.definition?.id===marker.role)
 let permissions
 try{permissions=permissionsForIdentity(marker,catalog.definition)}catch{throw Error('UAT_IDENTITY_DENIED')}
 need(Object.keys(marker.permissions).length===keys.length&&keys.every(k=>Object.hasOwn(marker.permissions,k)&&modes.includes(marker.permissions[k])&&marker.permissions[k]===permissions[k]))
 return permissions
}
export async function operationalPermissions({tx,db,marker,productionProfile}){
 // Read only a validated custom identity path, in the same trusted transaction.
 let catalog
 if(!productionProfile&&marker?.testOnly===true&&marker.enabled===true&&marker.workspace==='cutover'&&isCustomRoleId(marker.role)){
  catalog=(await tx.get(db.doc('qc_uat_workspaces/cutover/role_catalog/'+marker.role))).data()
 }
 return resolveOperationalPermissions({marker,productionProfile,catalog})
}
export function canReadOperationalPhoto(marker,permissions,uid,row,formKey){
 const own=row.ownerUid===uid
 return (own&&permissions[formKey]==='edit')||(['view','edit'].includes(permissions.qc_records)&&(own||['owner','asisten','manager','admin','pengunjung'].includes(marker.role)))
}
