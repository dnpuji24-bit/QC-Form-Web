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
  firebaseUid?: string
  firebaseStatus?: string
}

export interface AccountChangeRequest {
  requestId: string
  timestamp?: string
  username: string
  fullName?: string
  requestType?: string
  newFullName?: string
  newUsername?: string
  passwordRequested?: boolean
  status?: string
  approvedBy?: string
  approvedAt?: string
  notes?: string
}

export interface HoldInterval {
  start: string
  end: string
  reason: string
  windSpeed: string
  note: string
  photoBase64?: string
  photoDriveUrl?: string
}

export interface PlanMaster {
  paddock?: string
  variety?: string
  area?: string | number
  luas_target?: string | number
  activity?: string
  type?: string
  description?: string
  deskripsi?: string
  category?: string
  keterangan?: string
}

export interface MaterialMaster {
  description?: string
  slot?: string
  material?: string
  dosage?: string | number
  unit?: string
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
  createdAt?: string
  holdIntervals?: HoldInterval[]
  workingDurationMinutes?: number
  holdTotalMinutes?: number
  effectiveWorkingMinutes?: number
  [key: string]: unknown
}

export interface MasterData {
  names?: string[]
  assistants?: string[]
  statuses?: string[]
  shifts?: string[]
  unitMap?: Record<string, string[]>
  dropper?: string[]
  nozzles?: string[]
  waterQualities?: string[]
  weatherConditions?: string[]
  plans?: PlanMaster[]
  plan?: PlanMaster[]
  materials?: MaterialMaster[]
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
  requests?: AccountChangeRequest[]
  recordId?: string
  updatedAt?: string
}
