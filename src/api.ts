import { collection, getDocs } from 'firebase/firestore'
import type { AccountChangeRequest, ApiResponse, MasterData, QcRecord, User } from './types'
import { firebaseAuth, firestoreDb } from './firebase'
import { mirrorRecordToFirestore, removeRecordFromFirestore } from './firestoreStore'

const CONFIG_KEY = 'qc_v48_config'
const DEFAULT_API = 'https://script.google.com/macros/s/AKfycbwjqnVwOBDQg3ptclpw_bCQO9kAcYUcHkxz4tdlNppcPYmMpCocPTbG8fgGVlp1muY/exec'

export function getApiUrl(): string {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') as { apiUrl?: string }
    return saved.apiUrl || DEFAULT_API
  } catch {
    return DEFAULT_API
  }
}

export function setApiUrl(apiUrl: string): void {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(apiUrl)) throw new Error('URL Apps Script harus berakhiran /exec')
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ apiUrl }))
}

export async function api<T = unknown>(action: string, token = '', data: Record<string, unknown> = {}, method: 'GET' | 'POST' = 'POST', timeoutMs = 0): Promise<ApiResponse<T>> {
  const url = getApiUrl()
  const controller = timeoutMs > 0 ? new AbortController() : null
  const timeout = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : 0
  let response: Response
  try {
    if (method === 'GET') {
      const query = new URLSearchParams({ action, token, _: String(Date.now()) })
      Object.entries(data).forEach(([key, value]) => { if (value !== undefined && value !== null) query.set(key, String(value)) })
      response = await fetch(`${url}?${query.toString()}`, { redirect: 'follow', signal: controller?.signal })
    } else {
      response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token, ...data }), redirect: 'follow', signal: controller?.signal })
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error(`Upload melewati batas waktu ${Math.round(timeoutMs/1000)} detik. Data tetap aman dan akan dicoba ulang otomatis.`)
    throw error
  } finally {
    if (timeout) window.clearTimeout(timeout)
  }
  if (!response.ok) throw new Error(`Jaringan gagal (${response.status})`)
  const result = (await response.json()) as ApiResponse<T>
  if (!result.ok) throw new Error(result.message || result.error || 'Permintaan gagal')
  return result
}

async function recordsFirestoreFirst(token:string):Promise<ApiResponse<QcRecord[]>>{
  if(firestoreDb&&firebaseAuth?.currentUser){
    try{
      const snapshot=await getDocs(collection(firestoreDb,'qc_records'))
      const records=snapshot.docs.map(item=>({id:item.id,...item.data()}) as QcRecord)
      records.sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')))
      return{ok:true,data:records,records}
    }catch(error){
      console.info('Firestore read gagal; fallback ke Apps Script.',error)
    }
  }
  return api<QcRecord[]>('records',token,{},'GET')
}

async function mirrorAfter<T>(result:ApiResponse<T>,record:QcRecord){
  try{await mirrorRecordToFirestore(record)}catch(error){console.info('Mirror Firestore dilewati; Apps Script tetap berhasil.',error)}
  return result
}

export const qcApi = {
  login: (username: string, password: string) => api('login', '', { username, password }),
  register: (payload: Record<string, unknown>) => api('register', '', payload),
  me: (token: string) => api<User>('me', token, {}, 'GET'),
  logout: (token: string) => api('logout', token),
  masterData: (token: string) => api<MasterData>('masterData', token, {}, 'GET'),
  records: (token: string) => recordsFirestoreFirst(token),
  syncRecord: async (token: string, record: QcRecord) => mirrorAfter(await api('syncRecord', token, { record }),record),
  finalizeRecord: async (token: string, record: QcRecord) => mirrorAfter(await api('finalizeRecord', token, { record }, 'POST', 120_000),{...record,saveType:'uploaded'}),
  deleteRecord: async (token: string, recordId: string) => {
    const result=await api('deleteRecord', token, { recordId })
    try{await removeRecordFromFirestore(recordId)}catch(error){console.info('Hapus mirror Firestore dilewati; Apps Script tetap berhasil.',error)}
    return result
  },
  users: (token: string) => api<User[]>('users', token, {},'GET'),
  approveUser: (token: string, username: string, role: string) => api('approveUser', token, { username, role }),
  rejectUser: (token: string, username: string, role: string) => api('rejectUser', token, { username, role }),
  updateUserRole: (token: string, username: string, role: string) => api('updateUserRole', token, { username, role }),
  deleteUser: (token: string, username: string) => api('deleteUser', token, { username }),
  requestAccountChange: (token: string, payload: { currentPassword: string; newFullName?: string; newUsername?: string; newPassword?: string }) => api('accountChangeRequest', token, payload),
  accountChangeRequests: (token: string) => api<AccountChangeRequest[]>('accountChangeRequests', token, {}, 'GET'),
  decideAccountChange: (token: string, requestId: string, decision: 'approve' | 'reject') => api('decideAccountChange', token, { requestId, decision }),
  logs: (token: string) => api<Record<string, unknown>[]>('logs', token, {}, 'GET'),
}
