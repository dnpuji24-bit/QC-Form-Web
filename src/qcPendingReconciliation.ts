/** Read-only QC reconciliation guard.
 * A Firestore document with a matching ID alone is NOT sufficient evidence that
 * a pending browser revision was committed. Never fabricate revision or owner.
 */
export type QcReconciliationIdentity={
  id?:unknown;formType?:unknown;date?:unknown;paddock?:unknown;
  noUnit?:unknown;inputtedBy?:unknown;clientRevision?:unknown;
  ownerUid?:unknown;firestoreSaveState?:unknown;saveType?:unknown
}
const clean=(v:unknown)=>String(v??'').trim()
export function sameQcRevision(local:QcReconciliationIdentity,remote:QcReconciliationIdentity){
  if(!local||!remote)return false
  const revision=clean(local.clientRevision)
  if(!revision||revision!==clean(remote.clientRevision))return false
  for(const field of ['id','formType','date','paddock','noUnit','inputtedBy'] as const){
    if(clean(local[field])!==clean(remote[field]))return false
  }
  // New operational records have a signed owner UID. Historical records may
  // have none; never assign one based on a username or a date.
  if(clean(local.ownerUid)||clean(remote.ownerUid)){
    if(!clean(local.ownerUid)||clean(local.ownerUid)!==clean(remote.ownerUid))return false
  }
  return true
}
export function serverConfirmsPendingQc(local:QcReconciliationIdentity,remote:QcReconciliationIdentity){
  return sameQcRevision(local,remote)&&
    ['draft','ready','uploaded','draft_queued','upload_queued'].includes(clean(remote.saveType))
}
export function reconcileServerSnapshot<T extends QcReconciliationIdentity>(record:T,serverVerified:boolean):T{
  if(!serverVerified||!clean(record.clientRevision))return record
  return {...record,firestoreSaveState:'confirmed',firestoreSaveError:''}
}
export function preserveConfirmedRecord<T extends QcReconciliationIdentity>(
  existing:T|undefined,incoming:T
):T{
  if(existing&&clean(existing.firestoreSaveState)==='confirmed'&&
    clean(incoming.firestoreSaveState)==='queued'&&sameQcRevision(existing,incoming)){
    return existing
  }
  return incoming
}
