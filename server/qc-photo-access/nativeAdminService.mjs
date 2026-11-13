import {historicalQc} from './qcHistoricalCorrection.mjs'
import {archiveQc,restoreQc} from './qcArchiveCore.mjs'
import {administer} from './nativeAdminCore.mjs'
// Server-only adapter; do not expose Admin SDK credentials to browsers.
export async function executeNativeAdmin({db,auth,authorization,command,stamp,archiveEnabled=false,historicalEnabled=false}){
 if(typeof authorization!=='string'||!/^Bearer [^\s]+$/.test(authorization))throw Error('AUTH_REQUIRED')
 const actor=await auth.verifyIdToken(authorization.slice(7),true)
 if(['archiveQc','restoreQc'].includes(command?.action)){
  if(!archiveEnabled)throw Error('QC_ARCHIVE_DISABLED')
  return (command.action==='archiveQc'?archiveQc:restoreQc)({db,actor,command,stamp})
 }
 if(['previewHistoricalQc','correctHistoricalQc'].includes(command?.action)){
  if(!historicalEnabled)throw Error('QC_HISTORICAL_DISABLED')
  return historicalQc({db,actor,command,stamp})
 }
 return administer({db,auth,actor,command,stamp})
}
