import {createUserWithEmailAndPassword,sendEmailVerification,signInWithEmailAndPassword,signOut,initializeAuth,inMemoryPersistence} from 'firebase/auth'
import {initializeApp,deleteApp} from 'firebase/app'
import {doc,collection,getDocsFromServer,getDocFromServer,getFirestore,terminate,runTransaction,serverTimestamp,setDoc} from 'firebase/firestore'
import {firebaseAuth,firestoreDb} from './firebase'
import {readApprovedFirebaseSession} from './qcFirebaseSession'
export const nativeRegistrationRoles=['manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung'] as const
export type NativeRegistrationRole=typeof nativeRegistrationRoles[number]
export type NativeRegistrationRequest={uid:string;username:string;fullName:string;email:string;requestedRole:NativeRegistrationRole;status:string}
function enabled(){if(import.meta.env.VITE_QC_NATIVE_REGISTRATION!=='true')throw Error('Registrasi baru belum diaktifkan.')}
export async function submitNativeRegistration(input:{username:string;fullName:string;email:string;password:string;requestedRole:NativeRegistrationRole},resume=false){
  enabled()
  const username=input.username.trim().toLowerCase(),fullName=input.fullName.trim(),email=input.email.trim().toLowerCase()
  if(!/^[a-z0-9_]{3,40}$/.test(username)||fullName.length<2||fullName.length>120||!nativeRegistrationRoles.includes(input.requestedRole))throw Error('Data pendaftaran tidak valid.')
  if(!firebaseAuth)throw Error('Firebase belum tersedia.')
  const app=initializeApp(firebaseAuth.app.options,'qc-registration-'+crypto.randomUUID())
  const auth=initializeAuth(app,{persistence:inMemoryPersistence}),db=getFirestore(app)
  try{
    const {user}=await (resume?signInWithEmailAndPassword:createUserWithEmailAndPassword)(auth,email,input.password)
    const ref=doc(db,'firebase_registration_requests',user.uid)
    const existing=await getDocFromServer(ref)
    if(existing.exists()){
      if(!user.emailVerified&&existing.data().status==='pending')await sendEmailVerification(user)
      return String(existing.data().status)
    }
    await setDoc(ref,{username,fullName,email:user.email,requestedRole:input.requestedRole,status:'pending',createdAt:serverTimestamp(),source:'firebase_native'})
    if(!user.emailVerified)await sendEmailVerification(user)
    return 'pending'
  }finally{try{await signOut(auth)}finally{try{await terminate(db)}finally{await deleteApp(app)}}}
}
async function ownerSession(){
  enabled()
  const user=await readApprovedFirebaseSession()
  if(user.role!=='owner'||!firestoreDb||!firebaseAuth?.currentUser||firebaseAuth.currentUser.uid!==user.firebaseUid)throw Error('Hanya Owner aktif yang dapat meninjau.')
  return {db:firestoreDb,uid:firebaseAuth.currentUser.uid}
}
export async function listNativeRegistrations():Promise<NativeRegistrationRequest[]>{
  const {db,uid}=await ownerSession()
  const result=await getDocsFromServer(collection(db,'firebase_registration_requests'))
  if(firebaseAuth?.currentUser?.uid!==uid)throw Error('Sesi berubah.')
  return result.docs.map(d=>({...d.data(),uid:d.id} as NativeRegistrationRequest))
}
export async function reviewNativeRegistration(targetUid:string,decision:'approve'|'reject',role:NativeRegistrationRole){
  const {db,uid}=await ownerSession()
  if(targetUid===uid||!nativeRegistrationRoles.includes(role))throw Error('Keputusan tidak valid.')
  await runTransaction(db,async tx=>{
    const ref=doc(db,'firebase_registration_requests',targetUid),snap=await tx.get(ref)
    if(firebaseAuth?.currentUser?.uid!==uid||!snap.exists()||snap.data().status!=='pending')throw Error('Permintaan tidak lagi pending.')
    tx.update(ref,{status:decision==='approve'?'approved_for_provisioning':'rejected',approvedRole:decision==='approve'?role:'',reviewedBy:uid,reviewedAt:serverTimestamp()})
  })
}
