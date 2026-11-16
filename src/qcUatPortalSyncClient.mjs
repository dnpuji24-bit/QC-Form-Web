// Synthetic lab only. Never use for a hosted or production session.
import {prepareStrictJob,assertConfirmation,need} from './qcUatStrictQueueContract.mjs'
export const syncOrigin='http://127.0.0.1:4585'
export const syncPath='/api/qc-uat/v1/sync'
export async function syncStrictPortalJob(job,session,fetcher=globalThis.fetch,origin=globalThis.location?.origin){
 need(origin===syncOrigin,'SYNC_ORIGIN_DENIED')
 const next=await prepareStrictJob(job)
 const current=await session()
 need(current?.uid===next.uploaderUid&&typeof current.token==='string'&&current.token.length>0&&!/\s/.test(current.token),'QC_QUEUE_ACCOUNT_MISMATCH')
 const response=await fetcher(syncOrigin+syncPath,{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+current.token},body:JSON.stringify({job:next})})
 need(!response.redirected&&response.url===syncOrigin+syncPath,'SYNC_RESPONSE_ROUTE_DENIED')
 const result=await response.json()
 if(!response.ok)throw Object.assign(Error(typeof result?.error==='string'?result.error:'SYNC_FAILED'),{status:response.status})
 const after=await session()
 need(after?.uid===current.uid&&after.token===current.token,'QC_QUEUE_ACCOUNT_MISMATCH')
 need(result?.status==='confirmed','QC_COMMIT_UNCONFIRMED')
 assertConfirmation(result.record,next,next.payloadFingerprint)
 return result
}
