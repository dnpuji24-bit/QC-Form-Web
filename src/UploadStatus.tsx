import type { QcRecord } from './types'

export type UploadVisualState='draft'|'ready'|'queued'|'uploading'|'failed'|'uploaded'
export type UploadStatusInfo={state:UploadVisualState;label:string;className:string;detail:string}

export function uploadStatusInfo(record:QcRecord):UploadStatusInfo{
  const uploadState=String(record.uploadState||'').toLowerCase()
  const saveType=String(record.saveType||'').toLowerCase()
  const error=String(record.uploadLastError||'').trim()
  const firestoreSaveState=String(record.firestoreSaveState||'').toLowerCase()
  if(uploadState==='uploaded'||saveType==='uploaded')return{state:'uploaded',label:'Uploaded',className:'success',detail:firestoreSaveState==='confirmed'?'QC Uploaded dan tersimpan di Firestore.':'Status Uploaded historis; tidak berarti ada sinkronisasi ulang yang sedang berjalan.'}
  if(firestoreSaveState==='confirmed')return{state:'ready',label:'Tersimpan di Firestore',className:'success',detail:'Revisi QC sudah dikonfirmasi oleh server Firestore. Ini bukan berarti status pekerjaan telah difinalkan atau Uploaded.'}
  if(uploadState==='uploading'){const stamp=Date.parse(String(record.uploadStateUpdatedAt||record.uploadStartedAt||'')),stale=!Number.isFinite(stamp)||Date.now()-stamp>90_000;if(stale)return{state:'failed',label:'Upload terhenti',className:'danger',detail:'Upload lama terputus atau halaman sempat berubah. Klik Coba Lagi untuk membangun ulang antrean.'};return{state:'uploading',label:'Mengunggah…',className:'active',detail:'Sedang dikirim ke Spreadsheet. Jangan tekan Upload lagi.'}}
  if(uploadState==='failed')return{state:'failed',label:'Gagal — retry otomatis',className:'danger',detail:error||'Data tetap aman di antrean dan akan dicoba ulang otomatis.'}
  if(uploadState==='queued'||saveType==='upload_queued')return{state:'queued',label:'Dalam antrean',className:'warning',detail:'Data aman di perangkat dan akan dikirim saat koneksi tersedia.'}
  if(firestoreSaveState==='queued')return{state:'queued',label:'QC menunggu Firestore',className:'warning',detail:String(record.firestoreSaveError||'')||(record.id.startsWith('qc-v2-')?'QC belum mendapat konfirmasi server. Tekan Sinkronisasi QC untuk memeriksa antrean dan menampilkan error bila gagal.':'Record QC historis: gunakan Periksa Firestore. Jika belum ada di server, diperlukan rekonsiliasi/migrasi aman; jangan input ulang.')}
  if(saveType==='ready')return{state:'ready',label:'Siap Upload',className:'info',detail:'Data QC siap difinalkan sesuai alur penyimpanan yang aktif.'}
  return{state:'draft',label:saveType==='draft'||!saveType?'Draft':String(record.saveType),className:'neutral',detail:'Data belum difinalkan untuk upload.'}
}

export function UploadStatusPill({record}:{record:QcRecord}){
  const info=uploadStatusInfo(record)
  return <span className={`status-pill ${info.className}`} title={info.detail} aria-label={`${info.label}. ${info.detail}`}><span className="status-dot"/>{info.label}</span>
}
