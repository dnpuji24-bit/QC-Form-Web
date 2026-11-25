import { useEffect, useState } from 'react'
import { flushQueue, queueCount } from './offline'

const TOKEN_KEY='qc_token'
function storedToken(){return localStorage.getItem(TOKEN_KEY)||sessionStorage.getItem(TOKEN_KEY)||''}

export default function NetworkStatus(){
  const[online,setOnline]=useState(()=>navigator.onLine)
  const[queued,setQueued]=useState(0)
  const[syncing,setSyncing]=useState(false)

  useEffect(()=>{
    let mounted=true
    let syncInFlight=false
    const refreshQueue=async()=>{const count=await queueCount();if(mounted)setQueued(count);return count}
    const goOffline=()=>{setOnline(false);void refreshQueue()}
    const goOnline=async()=>{
      setOnline(true)
      const token=storedToken()
      if(!token||syncInFlight){await refreshQueue();return}
      syncInFlight=true
      if(mounted)setSyncing(true)
      try{const result=await flushQueue(token);if(!mounted)return;setQueued(result.left);if(result.sent>0)window.dispatchEvent(new CustomEvent('qc:queue-flushed',{detail:result}))}
      catch{await refreshQueue()}
      finally{syncInFlight=false;if(mounted)setSyncing(false)}
    }
    window.addEventListener('online',goOnline)
    window.addEventListener('offline',goOffline)
    // The central queue worker already performs automatic retry. This view only
    // refreshes its count and triggers a reconnect retry, not a second polling loop.
    const timer=window.setInterval(()=>{void refreshQueue()},15000)
    const changed=()=>{void refreshQueue()}
    window.addEventListener('qc:upload-state',changed);window.addEventListener('qc:queue-flushed',changed)
    void(async()=>{const count=await refreshQueue();if(navigator.onLine&&count>0)await goOnline()})()
    return()=>{mounted=false;window.removeEventListener('online',goOnline);window.removeEventListener('offline',goOffline);window.clearInterval(timer);window.removeEventListener('qc:upload-state',changed);window.removeEventListener('qc:queue-flushed',changed)}
  },[])

  if(online&&!syncing&&!queued)return null

  return <div role="status" className={`network-status-floating ${online?'is-online':'is-offline'}`} title={online?'Koneksi tersedia':'Mode offline aktif'}><span className="network-dot"/><span>{syncing?'Sinkronisasi…':online?'':'Offline'}</span>{queued>0&&<strong>{queued} antrean</strong>}</div>
}
