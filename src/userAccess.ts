import { doc, getDoc } from 'firebase/firestore'
import { firebaseAuth, firebaseAuthPersistenceReady, firestoreDb } from './firebase'
import type { User } from './types'

function permissionMap(value:unknown):User['permissions']|undefined{
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined
  const out:Record<string,'none'|'view'|'edit'>={}
  for(const [key,raw] of Object.entries(value as Record<string,unknown>)){
    const mode=String(raw||'').toLowerCase()
    if(mode==='none'||mode==='view'||mode==='edit')out[key]=mode
  }
  return Object.keys(out).length?out:undefined
}

export async function hydrateUserAccess(user:User):Promise<User>{
  const db=firestoreDb,auth=firebaseAuth
  if(!db||!auth)return user
  try{
    await firebaseAuthPersistenceReady
    if(typeof auth.authStateReady==='function')await auth.authStateReady()
    const current=auth.currentUser
    if(!current)return user
    const [roleSnap,profileSnap]=await Promise.all([
      getDoc(doc(db,'role_access',user.role)),
      getDoc(doc(db,'users',current.uid)),
    ])
    const roleTemplate=roleSnap.exists()?roleSnap.data():null
    const profile=profileSnap.exists()?profileSnap.data():null
    const permissions=permissionMap(roleTemplate?.permissions)||permissionMap(profile?.permissions)||user.permissions
    return{...user,firebaseUid:current.uid,permissions}
  }catch(error){
    console.info('Hak akses role Firestore belum dapat di-hydrate; memakai default role/session.',error)
    return user
  }
}
