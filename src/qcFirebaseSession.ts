import {signInWithEmailAndPassword,signOut} from 'firebase/auth'
import {doc,getDocFromServer} from 'firebase/firestore'
import {firebaseAuth,firebaseAuthPersistenceReady,firestoreDb,appCheckSiteKey} from './firebase'
import {PERMISSION_CATALOG} from './accessControl'
import {resolveFirebaseProfile,isApprovedFirebaseProfile} from './qcFirebaseIdentity.mjs'
export async function readApprovedFirebaseSession(){
  const auth=firebaseAuth,db=firestoreDb
  if(!auth||!db)throw Error('Firebase belum tersedia.')
  await firebaseAuthPersistenceReady
  await auth.authStateReady()
  const current=auth.currentUser
  if(!current)throw Error('AUTH_REQUIRED')
  const profile=(await getDocFromServer(doc(db,'users',current.uid))).data()
  if(!profile||!isApprovedFirebaseProfile(profile))throw Error('AUTH_PROFILE_NOT_APPROVED')
  const role=String(profile.role||'')
  if(!['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung'].includes(role))throw Error('AUTH_PROFILE_INVALID')
  const template=(await getDocFromServer(doc(db,'role_access',role))).data()
  if(auth.currentUser?.uid!==current.uid)throw Error('AUTH_SESSION_CHANGED')
  return resolveFirebaseProfile({uid:current.uid,email:current.email},profile,template,PERMISSION_CATALOG.map(p=>p.key))
}
// Separate Firebase app: pilot login never replaces the operational app session.
export async function loginIsolatedFirebase(email:string,password:string){
  const {initializeApp,deleteApp}=await import('firebase/app')
  const {initializeAuth,inMemoryPersistence}=await import('firebase/auth')
  const {getFirestore,terminate}=await import('firebase/firestore')
  if(!firebaseAuth||firebaseAuth.app.options.projectId!=='form-qc-unm')throw Error('AUTH_PILOT_WRONG_PROJECT')
  const app=initializeApp(firebaseAuth.app.options,'qc-auth-pilot-'+crypto.randomUUID())
  const auth=initializeAuth(app,{persistence:inMemoryPersistence})
  const db=getFirestore(app)
  try{
    if(appCheckSiteKey){
      const {initializeAppCheck,ReCaptchaEnterpriseProvider}=await import('firebase/app-check')
      initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(appCheckSiteKey),isTokenAutoRefreshEnabled:false})
    }
    const {user}=await signInWithEmailAndPassword(auth,email.trim(),password)
    const profile=(await getDocFromServer(doc(db,'users',user.uid))).data()
    if(!profile||!isApprovedFirebaseProfile(profile))throw Error('AUTH_PROFILE_NOT_APPROVED')
    const role=String(profile.role||'')
    if(!['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung'].includes(role))throw Error('AUTH_PROFILE_INVALID')
    const template=(await getDocFromServer(doc(db,'role_access',role))).data()
    return resolveFirebaseProfile({uid:user.uid,email:user.email},profile,template,PERMISSION_CATALOG.map(p=>p.key))
  }finally{
    try{await signOut(auth)}finally{try{await terminate(db)}finally{await deleteApp(app)}}
  }
}
