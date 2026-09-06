import { useEffect, useState } from 'react'
import { flushQueue, queueCount } from './offline'

const TOKEN_KEY='qc_token'

export default function NetworkStatus(){
  const[online,setOnline]=useState(()=>navigator.onLine)
  const[queued,setQueued]=useState(0)
  const[syncing,setSyncing]=useState(false)

  useEffect(()=>{
    let mounted=true
    const refreshQueue=async()=>{const count=await queueCount();if(mounted)setQueued(count);return count}
    const goOffline=()=>{setOnline(false);void refreshQueue()}
    const goOnline=async()=>{
      setOnline(true)
      const token=sessionStorage.getItem(TOKEN_KEY)||''
      if(!token||syncing){await refreshQueue();return}
      setSyncing(true)
      try{const result=await flushQueue(token);if(!mounted)return;setQueued(result.left);if(result.sent>0)window.dispatchEvent(new CustomEvent('qc:queue-flushed',{detail:result}))}
      catch{await refreshQueue()}
      finally{if(mounted)setSyncing(false)}
    }
    window.addEventListener('online',goOnline)
    window.addEventListener('offline',goOffline)
    const timer=window.setInterval(()=>{void(async()=>{const count=await refreshQueue();if(navigator.onLine&&count>0&&!syncing)await goOnline()})()},4000)
    void(async()=>{const count=await refreshQueue();if(navigator.onLine&&count>0)await goOnline()})()
    return()=>{mounted=false;window.removeEventListener('online',goOnline);window.removeEventListener('offline',goOffline);window.clearInterval(timer)}
  },[])

  return <div className={`network-status-floating ${online?'is-online':'is-offline'}`} title={online?'Koneksi tersedia':'Mode offline aktif'}><span className="network-dot"/><span>{syncing?'Sinkronisasi…':online?'Online':'Offline'}</span>{queued>0&&<strong>{queued} antrean</strong>}</div>
}
