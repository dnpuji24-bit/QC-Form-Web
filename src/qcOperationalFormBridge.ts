import {buildQcFormSaveIntent} from './qcFormSaveIntent.mjs'
import {operationalSaveEnabled,queueOperationalQc,queueOperationalSession,operationalQueuedRecords} from './qcOperationalAdapters'
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

export type OperationalFormItem={record:QcRecord;previous?:QcRecord;removeMain?:boolean;removedHoldIds:string[];replaceHoldIds:string[]}
export async function queueFormSession(items:OperationalFormItem[]){
  if(!operationalSaveEnabled||!items.length)throw Error('QC operational candidate not enabled')
  const prepared=items.map(({record,previous,removeMain,removedHoldIds,replaceHoldIds})=>{
    if(!isOperationalQcId(record.id)||!['draft','ready','uploaded'].includes(String(record.saveType)))throw Error('Invalid QC operational state')
    if(previous&&(previous.id!==record.id||previous.firestoreSaveState==='queued'||typeof previous.clientRevision!=='string'||typeof previous.ownerUid!=='string'))throw Error('Buka ulang QC yang telah terkonfirmasi sebelum koreksi.')
    if(previous&&['ready','uploaded'].includes(String(previous.saveType))&&record.saveType==='draft')throw Error('QC Ready/Uploaded tidak dapat dikembalikan menjadi Draft.')
    const previousHoldIds=(previous?.holdIntervals||[]).map(h=>h.holdId).filter((id):id is string=>typeof id==='string'&&Boolean(id))
    const next=previous?{...record,ownerUid:previous.ownerUid,inputtedBy:previous.inputtedBy,createdAt:previous.createdAt}:record
    const intent=buildQcFormSaveIntent(next,{isNew:!previous,baseRevision:previous?String(previous.clientRevision):undefined,removeMain,previousHoldIds,removedHoldIds,replaceHoldIds})
    return {record:next,intent}
  })
  await queueOperationalSession(prepared)
  return prepared.map(({record})=>({...record,firestoreSaveState:'queued',saveType:record.saveType==='draft'?'draft_queued':record.saveType==='uploaded'?'upload_queued':record.saveType} as QcRecord))
}
