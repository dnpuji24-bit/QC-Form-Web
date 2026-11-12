type Row=Record<string,unknown>
type Tx={readQc:(id:string)=>Promise<Row|null>;readActual:(id:string)=>Promise<Row|null>;writeQc:(id:string,row:Row)=>void;writeActual:(id:string,row:Row)=>void}
export function commitQcAndActual<R extends {id:string;clientRevision:string}>(input:{record:R;baseRevision:string|null;jobId:string;uploaderUid:string},deps:{currentUid:()=>Promise<string|null>;buildActual:(record:R)=>Row|null;transaction:(fn:(tx:Tx)=>Promise<R>)=>Promise<R>}):Promise<R>
