import type {User} from './types'
export const OFFLINE_LEASE_MS:number
export const OFFLINE_PROFILE_KEY:string
export type OfflineIdentity={uid:string;email:string|null}
export type OfflineLease={version:1;projectId:string;verifiedAt:number;expiresAt:number;user:User}
export function createOfflineLease(user:User,identity:OfflineIdentity,projectId:string,now?:number):OfflineLease|null
export function readOfflineLease(raw:unknown,identity:OfflineIdentity,projectId:string,now?:number):OfflineLease|null
export function isOfflineTransportFailure(error:unknown):boolean
