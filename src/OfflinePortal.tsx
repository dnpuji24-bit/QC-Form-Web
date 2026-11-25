import {useEffect,useState} from 'react'
import {Alert,Button,Card,Tag,Typography} from 'antd'
import {firebaseAuth} from './firebase'
import {operationalQueuedRecords} from './qcOperationalAdapters'
import type {OfflineLease} from './qcOfflineLease.mjs'

type QueueRow={id:string;date:string;paddock:string;unit:string;form:string}
const entries=[
 {key:'qc',title:'Form QC',permissions:['qc_spraying','qc_fertilizer','qc_records','qc_dashboard']},
 {key:'monthly',title:'Monthly Plan',permissions:['data_plan_monthly','data_plan_monthly_import']},
 {key:'daily',title:'Daily Plan',permissions:['data_plan_daily','data_plan_daily_import']},
 {key:'actual',title:'Actual Plan',permissions:['data_plan_actual','data_plan_actual_import']},
 {key:'summary',title:'Summary & Calendar',permissions:['data_plan_summary','data_plan_daily','data_plan_actual']},
 {key:'units',title:'Unit Management',permissions:['data_unit_dispatch']},
 {key:'paddock',title:'Master Paddock',permissions:['data_master_paddock_list']},
 {key:'activity',title:'Master Activity',permissions:['data_master_activity_list','data_master_activity_manage','data_master_activity_resources']},
 {key:'employees',title:'Master Karyawan',permissions:['data_master_employees']},
 {key:'company',title:'Company & Prefix',permissions:['data_company']}
]
export default function OfflinePortal({lease,onRetry,onLogout}:{lease:OfflineLease;onRetry:()=>Promise<void>;onLogout:()=>Promise<void>}){
 const [selected,setSelected]=useState(''),[rows,setRows]=useState<QueueRow[]>([])
 const [error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [checking,setChecking]=useState(false)
 const user=lease.user
 const permits=(keys:string[])=>keys.some(key=>['view','edit'].includes(user.permissions?.[key]||'none'))
 const menus=entries.filter(item=>permits(item.permissions))
 const canSeeQueue=permits(['qc_records','qc_spraying','qc_fertilizer'])
 async function loadQueue(){
  setBusy(true);setError('');setRows([])
  try{
   if(!canSeeQueue||firebaseAuth?.currentUser?.uid!==user.firebaseUid)return
   const jobs=await operationalQueuedRecords()
   if(firebaseAuth?.currentUser?.uid!==user.firebaseUid)return
   setRows(jobs.filter(job=>job.uploaderUid===user.firebaseUid&&job.record.ownerUid===user.firebaseUid&&
    permits(job.record.formType==='spray'?['qc_spraying','qc_records']:['qc_fertilizer','qc_records']))
    .map(job=>({id:job.id,date:String(job.record.date||''),paddock:String(job.record.paddock||''),
      unit:String(job.record.noUnit||''),form:String(job.record.formType||'')})))
  }catch{setError('Antrean lokal belum dapat dibaca. Jangan hapus data situs.')}
  finally{setBusy(false)}
 }
 useEffect(()=>{if(canSeeQueue)void loadQueue()},[user.firebaseUid])
 const chosen=menus.find(item=>item.key===selected)
 return <main style={{maxWidth:1120,margin:'0 auto',padding:'24px 16px',display:'grid',gap:16}}>
  <Card><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
   <div><Typography.Title level={2} style={{margin:0}}>Operational Portal</Typography.Title>
    <Typography.Text>{user.fullName} · {user.role.replaceAll('_',' ')}</Typography.Text> <Tag color="orange">Offline</Tag></div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button loading={checking} onClick={async()=>{setChecking(true);try{await onRetry()}finally{setChecking(false)}}}>Periksa koneksi</Button><Button onClick={()=>void onLogout()}>Keluar</Button></div>
  </div></Card>
  <Alert type="warning" showIcon message="Akses lokal — belum diverifikasi ulang"
   description={'Izin terakhir diverifikasi '+new Date(lease.verifiedAt).toLocaleString('id-ID')+'. Berlaku sampai '+new Date(lease.expiresAt).toLocaleString('id-ID')+'. Ini bukan login Firebase baru. Data server dan pengaturan pengguna membutuhkan koneksi; antrean lokal tidak dihapus.'}/>
  {chosen?<Card title={chosen.title} extra={<Button onClick={()=>setSelected('')}>Menu Utama</Button>}>
    {chosen.key==='qc'&&canSeeQueue?<><Alert type="info" message="Antrean QC milik akun ini" description="Belum merupakan konfirmasi Firestore. Input dan edit form penuh tersedia setelah verifikasi online atau pada workspace yang sudah dibuka sebelum koneksi putus."/>
     <Button loading={busy} onClick={()=>void loadQueue()} style={{margin:'12px 0'}}>Muat ulang antrean lokal</Button>
     {error&&<Alert type="error" message={error}/>}
     {!busy&&!rows.length&&<Typography.Paragraph>Belum ada antrean operasional yang dapat ditampilkan.</Typography.Paragraph>}
     <div style={{display:'grid',gap:8}}>{rows.map(row=><Card size="small" key={row.id}><strong>{row.date} · {row.form}</strong><div>{row.paddock||'—'} / {row.unit||'—'}</div><Tag color="orange">Menunggu sinkronisasi</Tag></Card>)}</div>
    </>:<Alert type="info" message="Data menu ini memerlukan koneksi" description="Navigasi tersedia, tetapi data bersama dan perubahan final belum dibuka dalam mode offline setelah reload. Sambungkan jaringan untuk melanjutkan."/>}
   </Card>:<Card title="Pilih area kerja"><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12}}>
    {menus.map(item=><Button key={item.key} block size="large" onClick={()=>setSelected(item.key)}>{item.title}</Button>)}
   </div>{!menus.length&&<Typography.Paragraph>Tidak ada menu dalam izin terakhir yang diverifikasi.</Typography.Paragraph>}
   {user.role==='owner'&&<Typography.Paragraph style={{marginTop:16}}>Users &amp; Access hanya tersedia setelah verifikasi online.</Typography.Paragraph>}</Card>}
 </main>
}
