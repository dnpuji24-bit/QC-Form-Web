export type OperationalJob = {
  id?:string
  record:{id:string;clientRevision:string}
  uploaderUid:string
  baseRevision:string|null
  action:'syncRecord'|'finalizeRecord'
  changes:unknown[]
}
export function enqueueOperationalJob<J extends OperationalJob>(job:J,factory?:IDBFactory):Promise<J&{id:string;createdAt:number}>
export function listOperationalJobs(uid:string,factory?:IDBFactory):Promise<Array<OperationalJob&{id:string;createdAt:number}>>
export function flushOperationalJobs(uid:string,deps:{
 photoBucket?:string,
  currentUid:()=>Promise<string|null>
  scope?:string
  forceRecordId?:string
  acceptJob?:(job:OperationalJob)=>boolean
  readRecord:(id:string,job:any)=>Promise<unknown>
  putVerifiedPhoto:(ref:any,bytes:Uint8Array,job:any)=>Promise<void>
  commitRecord:(input:any)=>Promise<unknown>
},factory?:IDBFactory):Promise<{sent:number;left:number;failures:Array<{id:string;error:string}>}>

export function enqueueOperationalBatch<J extends OperationalJob>(jobs:J[],factory?:IDBFactory):Promise<Array<J&{id:string;createdAt:number}>>

// Diagnostic lookup is read-only and scoped to the requested record ID.
export function operationalFailureForRecord(failures: Array<{id:string;error:string}>|undefined,recordId:string):string

export function operationalRetryDelay(attempt:number,error:unknown):number
export function operationalRetryDue(job:{record?:{id:string};nextAttemptAt?:number},now?:number,forceRecordId?:string):boolean|string
