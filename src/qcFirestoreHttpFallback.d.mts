export declare function isRetryableFirestoreTransportError(error:unknown):boolean
export declare function decodeFirestoreValue(raw:unknown):unknown
export declare function decodeFirestoreDocument(raw:unknown):Record<string,unknown>|null
export declare function fetchFirestoreDocumentViaREST(args:{
  projectId:string
  databaseId?:string
  collection:string
  documentId:string
  idToken:string
  appCheckToken?:string
  fetchImpl?:typeof fetch
  timeoutMs?:number
}):Promise<Record<string,unknown>|undefined>
