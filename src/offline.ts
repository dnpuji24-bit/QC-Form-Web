import { qcApi } from './api'
import type { QcRecord } from './types'

const QUEUE_KEY = 'qc_react_queue_v1'
export type QueueAction = 'syncRecord' | 'finalizeRecord'
type QueueItem = { id: string; action: QueueAction; record: QcRecord; createdAt: number }

function readQueue(): QueueItem[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as QueueItem[] } catch { return [] }
}
function writeQueue(items: QueueItem[]) { localStorage.setItem(QUEUE_KEY, JSON.stringify(items)) }
export function queueCount() { return readQueue().length }
export function discardQueuedRecord(recordId: string) { writeQueue(readQueue().filter((item) => item.record.id !== recordId)) }

export function enqueue(action: QueueAction, record: QcRecord) {
  let items = readQueue()
  if (action === 'finalizeRecord') items = items.filter((item) => item.record.id !== record.id)
  else items = items.filter((item) => !(item.action === action && item.record.id === record.id))
  items.push({ id: crypto.randomUUID(), action, record, createdAt: Date.now() })
  writeQueue(items)
}

export async function sendOrQueue(token: string, action: QueueAction, record: QcRecord) {
  if (!navigator.onLine) { enqueue(action, record); return { queued: true } }
  try {
    if (action === 'finalizeRecord') await qcApi.finalizeRecord(token, record)
    else await qcApi.syncRecord(token, record)
    if (action === 'finalizeRecord') discardQueuedRecord(record.id)
    else writeQueue(readQueue().filter((item) => !(item.action === action && item.record.id === record.id)))
    return { queued: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/sesi|login|izin|password|kata sandi|auth/i.test(message)) throw error
    enqueue(action, record)
    return { queued: true }
  }
}

export async function flushQueue(token: string) {
  if (!navigator.onLine) return { sent: 0, left: queueCount() }
  const items = readQueue(), left: QueueItem[] = []
  let sent = 0
  for (const item of items) {
    try {
      if (item.action === 'finalizeRecord') await qcApi.finalizeRecord(token, item.record)
      else await qcApi.syncRecord(token, item.record)
      sent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/sesi|login|izin|password|kata sandi|auth/i.test(message)) throw error
      left.push(item)
    }
  }
  writeQueue(left)
  return { sent, left: left.length }
}
