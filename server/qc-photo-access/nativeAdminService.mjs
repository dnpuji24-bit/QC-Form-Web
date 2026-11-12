import {administer} from './nativeAdminCore.mjs'
// Server-only adapter; do not expose Admin SDK credentials to browsers.
export async function executeNativeAdmin({db,auth,authorization,command,stamp}){
 if(typeof authorization!=='string'||!/^Bearer [^\s]+$/.test(authorization))throw Error('AUTH_REQUIRED')
 const actor=await auth.verifyIdToken(authorization.slice(7),true)
 return administer({db,auth,actor,command,stamp})
}
