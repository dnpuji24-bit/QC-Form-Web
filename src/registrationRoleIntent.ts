import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { signInFirebaseBridge, signOutFirebaseBridge } from './firebaseAuthBridge'
import type { Role } from './types'

const REQUESTABLE_ROLES:Role[]=['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung']

export async function saveRegistrationRoleIntent(email:string,password:string,username:string,role:string):Promise<boolean>{
  if(!REQUESTABLE_ROLES.includes(role as Role)||!firestoreDb||!firebaseAuth)return false
  const signed=await signInFirebaseBridge(email,password)
  if(!signed||!firebaseAuth.currentUser)return false
  try{
    await setDoc(doc(firestoreDb,'registration_requests',firebaseAuth.currentUser.uid),{
      username:username.trim().toLowerCase(),
      email:email.trim().toLowerCase(),
      requestedRole:role,
      createdAt:serverTimestamp(),
      source:'react_registration',
    },{merge:true})
    return true
  }catch(error){
    console.info('Role pendaftaran belum dapat dicatat ke Firestore.',error)
    return false
  }finally{
    await signOutFirebaseBridge()
  }
}
