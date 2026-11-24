import {signInWithEmailAndPassword,signOut} from 'firebase/auth'
import {doc,getDocFromServer} from 'firebase/firestore'
import {getToken as getAppCheckToken} from 'firebase/app-check'
import {firebaseAuth,firebaseAuthPersistenceReady,firestoreDb,appCheckSiteKey,firebaseAppCheck,firestoreDatabaseId} from './firebase'
import {fetchFirestoreDocumentViaREST,isRetryableFirestoreTransportError} from './qcFirestoreHttpFallback.mjs'
import {PERMISSION_CATALOG} from './accessControl'
import {resolveFirebaseProfile,isApprovedFirebaseProfile} from './qcFirebaseIdentity.mjs'
/** Server-only read: SDK first, authenticated HTTPS transport if WebChannel is unavailable.
 * No cached profile, no client-side role bypass, no writes.
 */
async function readVerifiedProfileDocument(collectionName:'users'|'role_access',documentId:string){
 const db=firestoreDb,auth=firebaseAuth
 if(!db||!auth||!auth.currentUser)throw Error('AUTH_REQUIRED')
 const uid=auth.currentUser.uid
 try{
   return (await getDocFromServer(doc(db,collectionName,documentId))).data()
 }catch(error){
   if(!isRetryableFirestoreTransportError(error))throw error
   // Firestore WebChannel can be blocked by network proxies even while
   // Firebase Authentication and normal HTTPS continue to work.
   const idToken=await auth.currentUser.getIdToken()
   if(auth.currentUser?.uid!==uid)throw Error('AUTH_SESSION_CHANGED')
   let appCheckToken=''
   if(firebaseAppCheck){
     try{appCheckToken=(await getAppCheckToken(firebaseAppCheck,false)).token}
     catch{throw error} // Do not bypass App Check enforcement.
   }
   const result=await fetchFirestoreDocumentViaREST({
     projectId:auth.app.options.projectId||'',databaseId:firestoreDatabaseId,
     collection:collectionName,documentId,idToken,appCheckToken
   })
   if(auth.currentUser?.uid!==uid)throw Error('AUTH_SESSION_CHANGED')
   return result
 }
}
export async function readApprovedFirebaseSession(){
  const auth=firebaseAuth,db=firestoreDb
  if(!auth||!db)throw Error('Firebase belum tersedia.')
  await firebaseAuthPersistenceReady
  await auth.authStateReady()
  const current=auth.currentUser
  if(!current)throw Error('AUTH_REQUIRED')
  const profile=await readVerifiedProfileDocument('users',current.uid)
  if(!profile)throw Error('AUTH_PROFILE_MISSING')
  if(!isApprovedFirebaseProfile(profile))throw Error('AUTH_PROFILE_NOT_APPROVED')
  const role=String(profile.role||'')
  if(!['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung'].includes(role))throw Error('AUTH_PROFILE_INVALID')
  const template=role==='owner'?undefined:await readVerifiedProfileDocument('role_access',role)
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
