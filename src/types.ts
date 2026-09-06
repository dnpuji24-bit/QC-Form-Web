export type Role =
  | 'owner'
  | 'manager'
  | 'admin'
  | 'asisten'
  | 'mandor_spraying'
  | 'mandor_fertilizer'
  | 'pengunjung'

export type FormType = 'spray' | 'fertilizer'

export interface User {
  username: string
  fullName: string
  email?: string
  role: Role
  status?: string
  allowedForm?: FormType | 'all' | string
}

export interface QcRecord {
  id: string
  formType: FormType
  date: string
  shift?: string
  name?: string
  nameOfAssistan?: string
  paddock: string
  status?: string
  saveType?: string
  area?: number | string
  resultArea?: number | string
  inputtedBy?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface MasterData {
  names?: string[]
  assistants?: string[]
  paddocks?: string[]
  activities?: string[]
  descriptions?: string[]
  [key: string]: unknown
}

export interface ApiResponse<T = unknown> {
  ok: boolean
  error?: string
  message?: string
  token?: string
  expiresIn?: number
  user?: User
  data?: T
  records?: QcRecord[]
  users?: User[]
  logs?: Record<string, unknown>[]
  recordId?: string
  updatedAt?: string
}
