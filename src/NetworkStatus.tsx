import { useEffect, useState } from 'react'
import { flushQueue, queueCount } from './offline'

const TOKEN_KEY = 'qc_token'

export default function NetworkStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [queued, setQueued] = useState(() => queueCount())
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    let mounted = true
    const refreshQueue = () => mounted && setQueued(queueCount())
    const goOffline = () => { setOnline(false); refreshQueue() }
    const goOnline = async () => {
      setOnline(true)
      const token = sessionStorage.getItem(TOKEN_KEY) || ''
      if (!token || syncing) return refreshQueue()
      setSyncing(true)
      try {
        const result = await flushQueue(token)
        if (!mounted) return
        setQueued(result.left)
        if (result.sent > 0) window.dispatchEvent(new CustomEvent('qc:queue-flushed', { detail: result }))
      } catch {
        refreshQueue()
      } finally {
        if (mounted) setSyncing(false)
      }
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    const timer = window.setInterval(() => {
      refreshQueue()
      if (navigator.onLine && queueCount() > 0 && !syncing) void goOnline()
    }, 4000)
    if (navigator.onLine && queueCount() > 0) void goOnline()
    return () => {
      mounted = false
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.clearInterval(timer)
    }
  }, [])

  return <div className={`network-status-floating ${online ? 'is-online' : 'is-offline'}`} title={online ? 'Koneksi tersedia' : 'Mode offline aktif'}>
    <span className="network-dot" />
    <span>{syncing ? 'Sinkronisasi…' : online ? 'Online' : 'Offline'}</span>
    {queued > 0 && <strong>{queued} antrean</strong>}
  </div>
}
