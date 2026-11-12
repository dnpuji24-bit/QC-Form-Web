import {prepareOperationalPhotoManifest,stripOperationalPhotoPayload} from './qcOperationalPhotoManifest.mjs'

// Transport core: no Apps Script calls. Dependencies must enforce authorization,
// immutable upload verification, and an atomic compare-and-set QC commit.
// The caller MUST persist the complete job in IndexedDB before invoking this.
export async function processOperationalQcJob(job, deps) {
  const {record, uploaderUid, baseRevision, changes} = job;
  if (!record?.id || !record.clientRevision || !uploaderUid || !Array.isArray(changes))
    throw Error('Incomplete durable QC job');
  if (await deps.currentUid() !== uploaderUid) throw Error('QC_QUEUE_ACCOUNT_MISMATCH');
  const current = await deps.readRecord(record.id,job);
  if (current?.clientRevision === record.clientRevision &&
      current?.operationalSaveId === job.id) {
    return {status:'confirmed',record:current};
  }
  if ((current?.clientRevision ?? null) !== (baseRevision ?? null))
    throw Error('QC_REVISION_CONFLICT');
  const {manifest,uploads} = await prepareOperationalPhotoManifest({
    recordId:record.id,uploaderUid,previous:current?.operationalPhotoManifest ?? {},changes
  });
  for (const upload of uploads) {
    if (await deps.currentUid() !== uploaderUid) throw Error('QC_QUEUE_ACCOUNT_MISMATCH');
    // Backend must check actual bytes/hash even when object already exists.
    await deps.putVerifiedPhoto(upload.reference,upload.bytes,job);
  }
  if (await deps.currentUid() !== uploaderUid) throw Error('QC_QUEUE_ACCOUNT_MISMATCH');
  const clean=stripOperationalPhotoPayload(record);
  const next={...clean,operationalPhotoManifest:manifest,operationalSaveId:job.id,
    firestoreSaveState:'confirmed',saveType:job.action==='finalizeRecord'?'uploaded':record.saveType};
  // A single authorized transaction checks baseRevision and commits data + manifest.
  // Never remove the local job until this call has confirmed a server commit.
  const committed=await deps.commitRecord({record:next,baseRevision:baseRevision??null,jobId:job.id,uploaderUid});
  if (!committed || committed.operationalSaveId!==job.id || committed.clientRevision!==record.clientRevision)
    throw Error('QC_COMMIT_UNCONFIRMED');
  return {status:'confirmed',record:committed};
}

// Stable queue identity is scoped to the authenticated Firebase UID and revision.
// Existing queued revisions are never silently overwritten.
export function operationalQueueId(uid,recordId,revision) {
  for (const value of [uid,recordId,revision])
    if(typeof value!=='string'||! /^[A-Za-z0-9_-]{1,160}$/.test(value))throw Error('Invalid queue identity');
  return JSON.stringify([uid,recordId,revision]);
}
