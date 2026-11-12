// Transport-independent atomic commit. All reads precede writes.
// The caller supplies a Firestore transaction runner and authoritative rules.
export async function commitQcAndActual(input,deps){
  const {record,baseRevision,jobId,uploaderUid}=input;
  if(!record?.id||!record.clientRevision||!jobId||!uploaderUid)throw Error('QC_INVALID_COMMIT');
  if(await deps.currentUid()!==uploaderUid)throw Error('QC_QUEUE_ACCOUNT_MISMATCH');
  return deps.transaction(async tx=>{
    if(await deps.currentUid()!==uploaderUid)throw Error('QC_QUEUE_ACCOUNT_MISMATCH');
    const current=await tx.readQc(record.id);
    if(current?.operationalSaveId===jobId&&current?.clientRevision===record.clientRevision)return current;
    if(current ? (!baseRevision||current.clientRevision!==baseRevision) : baseRevision!==null)throw Error('QC_REVISION_CONFLICT');
    if(current&&(current.formType!==record.formType||current.ownerUid!==record.ownerUid||current.inputtedBy!==record.inputtedBy))throw Error('QC_IDENTITY_IMMUTABLE');
    if(!current&&record.ownerUid!==uploaderUid)throw Error('QC_INVALID_OWNER');
    if(!['draft','ready','uploaded'].includes(record.saveType))throw Error('QC_INVALID_STATUS');
    if(current?.saveType==='uploaded'&&record.saveType!=='uploaded')throw Error('QC_STATUS_REGRESSION');
    const next={...current,...record,operationalSaveId:jobId,firestoreSaveState:'confirmed'};
    delete next.photoBase64;delete next.scanReportPhotoBase64;
    const actual=deps.buildActual(next);
    const oldActual=await tx.readActual('qcactual_'+record.id);
    if(oldActual&&(oldActual.sourceOrigin!=='QC'||oldActual.qcRecordId!==record.id))throw Error('QC_ACTUAL_ID_CONFLICT');
    if(!actual&&oldActual)throw Error('QC_ACTUAL_REMOVAL_REQUIRES_REVIEW');
    if(await deps.currentUid()!==uploaderUid)throw Error('QC_QUEUE_ACCOUNT_MISMATCH');
    tx.writeQc(record.id,next);
    if(actual)tx.writeActual('qcactual_'+record.id,actual);
    return next;
  });
}
