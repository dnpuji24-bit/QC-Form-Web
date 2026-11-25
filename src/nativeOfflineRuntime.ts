import {createContext} from 'react'
// UX and queue scheduling gate only. Firestore Rules remain authoritative.
let verifiedOnlineUid=''
export const NativeOfflineContext=createContext(false)
export function setVerifiedOnlineUid(uid:string){verifiedOnlineUid=uid}
export function canSyncVerifiedNativeUid(uid:string|null|undefined){
 return typeof navigator!=='undefined'&&navigator.onLine&&!!uid&&verifiedOnlineUid===uid
}
