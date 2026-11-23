import {doc,getDocFromServer,runTransaction,serverTimestamp} from 'firebase/firestore'
import {firebaseAuth,firestoreDb} from './firebase'
import {readApprovedFirebaseSession} from './qcFirebaseSession'
import {PERMISSION_CATALOG,type AccessMode} from './accessControl'
import {nativeRegistrationRoles,type NativeRegistrationRole} from './qcNativeRegistration'

export type NativeRolePermissions=Record<string,AccessMode>
const validMode=(x:unknown):x is AccessMode=>x==='none'||x==='view'||x==='edit'
const allowedRoles=new Set<string>(nativeRegistrationRoles)
const permissionKeys=PERMISSION_CATALOG.map(x=>x.key)

async function owner(){
 const user=await readApprovedFirebaseSession()
 const actorUid=user.firebaseUid
 if(user.role!=='owner'||!firestoreDb||typeof actorUid!=='string'||!actorUid||
    firebaseAuth?.currentUser?.uid!==actorUid)
   throw Error('Hanya Owner dengan sesi Firebase aktif yang boleh mengubah akses.')
 return{db:firestoreDb,actorUid}
}
function auditId(){return 'ua_'+crypto.randomUUID().replaceAll('-','')}
function ensureTarget(targetUid:string,actorUid:string){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(targetUid)||targetUid===actorUid)throw Error('Target pengguna tidak valid atau akun Owner sendiri.')
}
function validatedRoles(role:string):asserts role is NativeRegistrationRole {
 if(!allowedRoles.has(role))throw Error('Role tidak didukung. Akun Owner tidak dapat ditetapkan melalui menu ini.')
}
function validatedPermissions(value:NativeRolePermissions){
 const keys=Object.keys(value)
 if(keys.length!==permissionKeys.length||!keys.every(key=>permissionKeys.includes(key as typeof permissionKeys[number])&&validMode(value[key])))
   throw Error('Daftar hak akses tidak lengkap atau berisi nilai yang tidak dikenal. Refresh dan coba kembali.')
 return Object.fromEntries(permissionKeys.map(key=>[key,value[key]])) as NativeRolePermissions
}
function ensureSession(uid:string){
 if(firebaseAuth?.currentUser?.uid!==uid)throw Error('Sesi Owner berubah. Refresh sebelum menyimpan lagi.')
}
export async function saveNativeUserRole(targetUid:string,newRole:string,expectedRole:string){
 const {db,actorUid}=await owner()
 ensureTarget(targetUid,actorUid)
 validatedRoles(newRole)
 validatedRoles(expectedRole)
 if(newRole===expectedRole)throw Error('Belum ada perubahan role.')
 const id=auditId(),ref=doc(db,'users',targetUid)
 await runTransaction(db,async tx=>{
   ensureSession(actorUid)
   const snap=await tx.get(ref)
   if(!snap.exists())throw Error('Pengguna tidak ditemukan.')
   const current=snap.data()
   if(current.role==='owner'||current.role!==expectedRole)throw Error('Role telah berubah atau akun terlindungi. Refresh dahulu.')
   if(!['approved','APPROVED'].includes(String(current.status||'')))throw Error('Akun belum approved. Selesaikan pendaftaran lebih dahulu.')
   tx.update(ref,{role:newRole,adminUpdatedAt:serverTimestamp(),adminUpdatedBy:actorUid,adminAuditId:id})
   tx.set(doc(db,'qc_admin_audit',id),{actorUid,action:'setRole',target:targetUid,before:expectedRole,after:newRole,createdAt:serverTimestamp()})
 })
 ensureSession(actorUid)
 const verified=await getDocFromServer(ref)
 if(!verified.exists()||verified.data().role!==newRole||verified.data().adminAuditId!==id)
   throw Error('Status simpan belum terkonfirmasi. Refresh sebelum mengulang.')
}
export async function saveNativeUserActive(targetUid:string,active:boolean,expectedActive:boolean){
 const {db,actorUid}=await owner()
 ensureTarget(targetUid,actorUid)
 if(active===expectedActive)throw Error('Tidak ada perubahan status.')
 const id=auditId(),ref=doc(db,'users',targetUid)
 await runTransaction(db,async tx=>{
   ensureSession(actorUid)
   const snap=await tx.get(ref)
   if(!snap.exists())throw Error('Pengguna tidak ditemukan.')
   const current=snap.data()
   if(current.role==='owner'||current.active!==expectedActive)throw Error('Status sudah berubah atau akun Owner dilindungi. Refresh.')
   if(!['approved','APPROVED'].includes(String(current.status||'')))throw Error('Akun belum approved.')
   tx.update(ref,{active,adminUpdatedAt:serverTimestamp(),adminUpdatedBy:actorUid,adminAuditId:id})
   tx.set(doc(db,'qc_admin_audit',id),{actorUid,action:'setActive',target:targetUid,
     before:expectedActive?'active':'inactive',after:active?'active':'inactive',createdAt:serverTimestamp()})
 })
 ensureSession(actorUid)
 const verified=await getDocFromServer(ref)
 if(!verified.exists()||verified.data().active!==active||verified.data().adminAuditId!==id)
   throw Error('Status akses belum terkonfirmasi. Refresh terlebih dahulu.')
}
export async function saveNativeRolePermissions(role:string,permissions:NativeRolePermissions){
 const {db,actorUid}=await owner()
 validatedRoles(role)
 const next=validatedPermissions(permissions),id=auditId(),ref=doc(db,'role_access',role)
 await runTransaction(db,async tx=>{
   ensureSession(actorUid)
   const current=await tx.get(ref)
   if(current.exists()&&current.data().role!==role)throw Error('Dokumen role tidak cocok dengan role terpilih.')
   tx.set(ref,{role,permissions:next,updatedAt:serverTimestamp(),updatedBy:actorUid,adminAuditId:id},{merge:true})
   tx.set(doc(db,'qc_admin_audit',id),{actorUid,action:'setPermissions',target:role,
     before:'template',after:'updated',createdAt:serverTimestamp()})
 })
 ensureSession(actorUid)
 const verified=await getDocFromServer(ref)
 const actual=verified.data()?.permissions
 if(!verified.exists()||verified.data()?.adminAuditId!==id||
   permissionKeys.some(key=>actual?.[key]!==next[key]))
   throw Error('Permission belum terkonfirmasi dari server. Refresh sebelum mencoba kembali.')
}
