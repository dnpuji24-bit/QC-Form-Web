export type OperationalPhotoReference = {
 photoId:string
 provider:'supabase'
 bucket:string
 objectPath:string
 uploaderUid:string
 kind:'main'|'hold'|'scan'
 contentType:string
 sha256:string
 size:number
 holdId?:string
}
export type TrustedPhotoUploadInput = {
 endpoint:string
 bucket:string
 token:string
 recordId:string
 formType:'spray'|'fertilizer'
 baseRevision:string|null
 clientRevision:string
 uploaderUid:string
 reference:OperationalPhotoReference
 bytes:Uint8Array
 fetchImpl?:typeof fetch
}
export const operationalPhotoUploadDestinations:Readonly<{
 production:Readonly<{endpoint:string;bucket:string}>
 uat:Readonly<{endpoint:string;bucket:string}>
}>
export function postVerifiedOperationalPhoto(options:TrustedPhotoUploadInput):Promise<true>
