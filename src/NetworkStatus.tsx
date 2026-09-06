import { useEffect, useState } from 'react'
import { flushQueue, queueCount } from './offline'

type Props = { token: string; onSynced?: () => void }

export default function NetworkStatus({ token, onSynced }: Props) {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [queued, setQueued] = useState(() => queueCount())
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    let mounted = true
    const refreshQueue = () => mounted && setQueued(queueCount())
    const goOffline = () => { setOnline(false); refreshQueue() }
    const goOnline = async () => {
      setOnline(true)
      if (!token || syncing) return refreshQueue()
      setSyncing(true)
      try {
        const result = await flushQueue(token)
        if (!mounted) return
        setQueued(result.left)
        if (result.sent > 0) onSynced?.()
      } catch {
        refreshQueue()
      } finally {
        if (mounted) setSyncing(false)
      }
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    const timer = window.setInterval(refreshQueue, 3000)
    if (navigator.onLine && queueCount() > 0) void goOnline()
    return () => {
      mounted = false
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.clearInterval(timer)
    }
  }, [token])

  return <div className={`network-status ${online ? 'is-online' : 'is-offline'}`} title={online ? 'Koneksi tersedia' : 'Mode offline aktif'}>
    <span className="network-dot" />
    <span>{syncing ? 'Sinkronisasi…' : online ? 'Online' : 'Offline'}</span>
    {queued > 0 && <strong>{queued} antrean</strong>}
  </div>
}
