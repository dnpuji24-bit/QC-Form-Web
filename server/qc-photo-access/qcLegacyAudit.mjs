import {createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
const hash=v=>createHash('sha256').update(v).digest('hex')
const fail=()=>{throw Error('INVALID_LEGACY_AUDIT_SNAPSHOT')}
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(v)
const iso=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v
const keys=(o,allowed)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===allowed.length&&allowed.every(k=>Object.hasOwn(o,k))
const text=(v,n)=>typeof v==='string'&&v.length<=n
const logKeys=['Timestamp','Username','FullName','Role','ActionType','Description','IP_Device']
export function prepareLegacyAudit(snapshot){
 if(!keys(snapshot,['schemaVersion','sourceId','logSheetId','exportedAt','logs','accountRequests'])||snapshot.schemaVersion!==1||!id(snapshot.sourceId)||!id(snapshot.logSheetId)||!iso(snapshot.exportedAt)||!Array.isArray(snapshot.logs)||!Array.isArray(snapshot.accountRequests))fail()
 const seen=new Set(),requests=new Set(),requestRows=new Set(),byStatus={}
 const logs=snapshot.logs.map(r=>{
  if(!keys(r,['row',...logKeys])||!Number.isSafeInteger(r.row)||r.row<2||seen.has(r.row)||!iso(r.Timestamp)||Date.parse(r.Timestamp)>Date.parse(snapshot.exportedAt)||!logKeys.slice(1).every(k=>text(r[k],k==='Description'?20000:500))||!r.ActionType.trim())fail()
  seen.add(r.row)
  const fields=Object.fromEntries(logKeys.map(k=>[k,r[k]]))
  return {id:'legacy_'+hash(JSON.stringify([snapshot.sourceId,snapshot.logSheetId,r.row])),data:{...fields,source:'apps_script_legacy',sourceRow:r.row,sourceKey:hash(JSON.stringify([snapshot.sourceId,snapshot.logSheetId])),sourceHash:hash(JSON.stringify(fields))}}
 })
 const pending=[]
 for(const r of snapshot.accountRequests){
  if(!keys(r,['row','requestId','timestamp','username','requestType','status'])||!Number.isSafeInteger(r.row)||r.row<2||requestRows.has(r.row)||!id(r.requestId)||requests.has(r.requestId)||!iso(r.timestamp)||!text(r.username,500)||!r.username.trim()||!text(r.requestType,100)||!['PENDING','APPROVED','REJECTED','SUPERSEDED'].includes(r.status.toUpperCase()))fail()
  requests.add(r.requestId);requestRows.add(r.row)
  const status=r.status.toUpperCase();byStatus[status]=(byStatus[status]||0)+1
  if(status==='PENDING')pending.push({requestId:r.requestId,requestType:r.requestType})
 }
 return {logs,summary:{logCount:logs.length,requestCount:requests.size,pendingCount:pending.length,requestStatuses:byStatus,manifestHash:hash(JSON.stringify(logs.map(r=>[r.id,r.data.sourceHash]))),pendingTypes:pending.reduce((o,r)=>({...o,[r.requestType]:(o[r.requestType]||0)+1}),{})}}
}
// Server-side importer. Each chunk checks all existing rows before creating anything.
// The source sheet must be frozen against row reorder/deletion before final import.
export async function importLegacyAudit(db,prepared){
 const result={created:0,unchanged:0}
 for(let start=0;start<prepared.logs.length;start+=100){
  const rows=prepared.logs.slice(start,start+100)
  const counts=await db.runTransaction(async tx=>{
   const refs=rows.map(r=>db.collection('qc_legacy_activity_logs').doc(r.id))
   const existing=await Promise.all(refs.map(ref=>tx.get(ref)))
   let created=0,unchanged=0
   existing.forEach((s,i)=>{
    if(s.exists){if(!isDeepStrictEqual(s.data(),rows[i].data))throw Error('LEGACY_AUDIT_SOURCE_CONFLICT');unchanged++}
    else{tx.create(refs[i],rows[i].data);created++}
   })
   return {created,unchanged}
  })
  result.created+=counts.created;result.unchanged+=counts.unchanged
 }
 return result
}
