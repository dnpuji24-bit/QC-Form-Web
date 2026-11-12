import {collection,getDocsFromServer} from 'firebase/firestore'
import {firebaseAuth,firestoreDb} from './firebase'
import {readApprovedFirebaseSession} from './qcFirebaseSession'
import {loadAllOperationalResources} from './masterOperationalResources'
import {buildQcMasterData} from './qcMasterDataMapping.mjs'
export const qcMasterFirestoreEnabled=import.meta.env.VITE_QC_MASTER_FIRESTORE==='true'
export async function loadQcMasterDataFirestore(){
  const auth=firebaseAuth,db=firestoreDb
  if(!auth||!db)throw Error('Firebase belum tersedia.')
  await auth.authStateReady()
  const uid=auth.currentUser?.uid
  if(!uid)throw Error('Login Firebase diperlukan untuk Master Data.')
  await readApprovedFirebaseSession()
  const rows=async(name:string)=>(await getDocsFromServer(collection(db,name))).docs.map(item=>item.data())
  const [resources,materials,paddocks,activities]=await Promise.all([loadAllOperationalResources(true),rows('master_materials'),rows('master_paddocks'),rows('master_activities')])
  if(auth.currentUser?.uid!==uid)throw Error('Sesi Firebase berubah.')
  return buildQcMasterData(resources,materials,paddocks,activities)
}
