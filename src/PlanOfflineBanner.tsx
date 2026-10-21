import { useEffect,useState } from 'react'

/** Explicitly distinguish an offline draft from a confirmed Firestore write. */
export default function PlanOfflineBanner(){
 const [offline,setOffline]=useState(()=>typeof navigator!=='undefined'&&!navigator.onLine)
 useEffect(()=>{
  const online=()=>setOffline(false)
  const disconnected=()=>setOffline(true)
  window.addEventListener('online',online)
  window.addEventListener('offline',disconnected)
  return()=>{window.removeEventListener('online',online);window.removeEventListener('offline',disconnected)}
 },[])
 if(!offline)return null
 return <div className="plan-offline-warning" role="status">
   <strong>Mode offline — sesi login dipertahankan.</strong>
   <span>Anda dapat melihat Plan yang tersimpan dalam cache dan menyusun/mengubah Draft lokal. Perubahan belum terkirim ke Firestore; buka kembali dan klik Simpan saat koneksi stabil. Data tanggal yang belum pernah dibuka memerlukan internet.</span>
 </div>
}
