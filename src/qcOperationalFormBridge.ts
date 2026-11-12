import {buildQcFormSaveIntent} from './qcFormSaveIntent.mjs'
import {operationalSaveEnabled,queueOperationalQc,operationalQueuedRecords} from './qcOperationalAdapters'
import type {QcRecord} from './types'

export const isOperationalQcId=(id:string)=>id.startsWith('qc-v2-')
export function newOperationalQcId(sessionId:string,cardId:string){
  const id='qc-v2-'+sessionId+'-'+cardId
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(id))throw Error('Invalid QC identity')
  return id
}
export async function queueNewReadyQc(record:QcRecord){
  if(!operationalSaveEnabled||!isOperationalQcId(record.id)||record.saveType!=='ready')throw Error('QC operational candidate not enabled')
  const pending=(await operationalQueuedRecords()).find(job=>job.record.id===record.id)
  if(pending)throw Error('QC ini sudah berada dalam antrean baru. Jangan input ulang.')
  await queueOperationalQc(record,buildQcFormSaveIntent(record,{isNew:true}),'syncRecord')
  return {queued:true,firestoreFirst:false,spreadsheetPending:false}
}
export async function queueOperationalFinalize(record:QcRecord){
  if(!operationalSaveEnabled||!isOperationalQcId(record.id)||record.saveType!=='ready'||typeof record.clientRevision!=='string')throw Error('QC baru belum terkonfirmasi atau fitur belum aktif')
  const pending=(await operationalQueuedRecords()).find(job=>job.record.id===record.id)
  if(pending)throw Error('Tunggu konfirmasi penyimpanan QC sebelum Upload.')
  await queueOperationalQc({...record,clientRevision:crypto.randomUUID()},{baseRevision:record.clientRevision,changes:[]},'finalizeRecord')
  return {queued:true,firestoreFirst:false,spreadsheetPending:false,uploadState:'queued' as const}
}
