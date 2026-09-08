import type { QcRecord } from './types'

export type UploadVisualState='draft'|'ready'|'queued'|'uploading'|'failed'|'uploaded'
export type UploadStatusInfo={state:UploadVisualState;label:string;className:string;detail:string}

export function uploadStatusInfo(record:QcRecord):UploadStatusInfo{
  const uploadState=String(record.uploadState||'').toLowerCase()
  const saveType=String(record.saveType||'').toLowerCase()
  const error=String(record.uploadLastError||'').trim()
  if(uploadState==='uploaded'||saveType==='uploaded')return{state:'uploaded',label:'Uploaded',className:'success',detail:'Sudah tersimpan di Spreadsheet.'}
  if(uploadState==='uploading')return{state:'uploading',label:'Mengunggah…',className:'active',detail:'Sedang dikirim ke Spreadsheet. Jangan tekan Upload lagi.'}
  if(uploadState==='failed')return{state:'failed',label:'Gagal — retry otomatis',className:'danger',detail:error||'Data tetap aman di antrean dan akan dicoba ulang otomatis.'}
  if(uploadState==='queued'||saveType==='upload_queued')return{state:'queued',label:'Dalam antrean',className:'warning',detail:'Data aman di perangkat dan akan dikirim saat koneksi tersedia.'}
  if(saveType==='ready')return{state:'ready',label:'Siap Upload',className:'info',detail:'Data siap dikirim ke Spreadsheet.'}
  return{state:'draft',label:saveType==='draft'||!saveType?'Draft':String(record.saveType),className:'neutral',detail:'Data belum difinalkan untuk upload.'}
}

export function UploadStatusPill({record}:{record:QcRecord}){
  const info=uploadStatusInfo(record)
  return <span className={`status-pill ${info.className}`} title={info.detail} aria-label={`${info.label}. ${info.detail}`}><span className="status-dot"/>{info.label}</span>
}
