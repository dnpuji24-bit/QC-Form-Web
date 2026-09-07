import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { firebaseAuth } from './firebase'

export async function signInFirebaseBridge(email:string,password:string):Promise<boolean>{
  if(!firebaseAuth||!email||!password) return false
  try{
    await signInWithEmailAndPassword(firebaseAuth,email,password)
    return true
  }catch(error){
    console.info('Firebase Auth bridge belum aktif untuk akun ini.', error)
    return false
  }
}

export async function signOutFirebaseBridge():Promise<void>{
  if(!firebaseAuth) return
  try{await signOut(firebaseAuth)}catch(error){console.info('Firebase sign-out dilewati.',error)}
}
