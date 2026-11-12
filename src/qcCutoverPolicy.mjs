// QC record transport policy; unrelated Apps Script actions remain unchanged.
const qcActions=new Set(['records','syncRecord','finalizeRecord','deleteRecord'])
export function assertQcScriptAllowed(action,firestoreOnly){
  if(firestoreOnly&&qcActions.has(action))throw Error('QC_FIRESTORE_ONLY: jalur Spreadsheet dinonaktifkan')
}
export function assertLegacyQcWriteAllowed(recordId,firestoreOnly){
  if(firestoreOnly||String(recordId).startsWith('qc-v2-'))throw Error('QC_LEGACY_WRITE_BLOCKED: record harus diproses melalui jalur Firestore yang sesuai')
}
export function selectQcFlushMode(firestoreOnly,operationalEnabled){
  if(firestoreOnly&&!operationalEnabled)throw Error('QC_CUTOVER_CONFIGURATION_INVALID')
  return firestoreOnly?'operational-only':'dual'
}
