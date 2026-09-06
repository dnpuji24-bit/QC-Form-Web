import type { ApiResponse, MasterData, QcRecord, User } from './types'

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

export async function api<T = unknown>(action: string, token = '', data: Record<string, unknown> = {}, method: 'GET' | 'POST' = 'POST'): Promise<ApiResponse<T>> {
  const url = getApiUrl()
  let response: Response
  if (method === 'GET') {
    const query = new URLSearchParams({ action, token, _: String(Date.now()) })
    Object.entries(data).forEach(([key, value]) => { if (value !== undefined && value !== null) query.set(key, String(value)) })
    response = await fetch(`${url}?${query.toString()}`, { redirect: 'follow' })
  } else {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token, ...data }), redirect: 'follow' })
  }
  if (!response.ok) throw new Error(`Jaringan gagal (${response.status})`)
  const result = (await response.json()) as ApiResponse<T>
  if (!result.ok) throw new Error(result.message || result.error || 'Permintaan gagal')
  return result
}

export const qcApi = {
  login: (username: string, password: string) => api('login', '', { username, password }),
  register: (payload: Record<string, unknown>) => api('register', '', payload),
  me: (token: string) => api<User>('me', token, {}, 'GET'),
  logout: (token: string) => api('logout', token),
  masterData: (token: string) => api<MasterData>('masterData', token, {}, 'GET'),
  records: (token: string) => api<QcRecord[]>('records', token, {}, 'GET'),
  syncRecord: (token: string, record: QcRecord) => api('syncRecord', token, { record }),
  finalizeRecord: (token: string, record: QcRecord) => api('finalizeRecord', token, { record }),
  deleteRecord: (token: string, recordId: string) => api('deleteRecord', token, { recordId }),
  users: (token: string) => api<User[]>('users', token, {}, 'GET'),
  approveUser: (token: string, username: string, role: string) => api('approveUser', token, { username, role }),
  rejectUser: (token: string, username: string, role: string) => api('rejectUser', token, { username, role }),
  logs: (token: string) => api<Record<string, unknown>[]>('logs', token, {}, 'GET'),
}
