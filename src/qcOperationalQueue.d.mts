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
  currentUid:()=>Promise<string|null>
  readRecord:(id:string)=>Promise<unknown>
  putVerifiedPhoto:(ref:any,bytes:Uint8Array,job:any)=>Promise<void>
  commitRecord:(input:any)=>Promise<unknown>
},factory?:IDBFactory):Promise<{sent:number;left:number;failures:Array<{id:string;error:string}>}>
