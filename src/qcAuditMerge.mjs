// All inputs are explicit audit projections, never raw admin audit payloads.
export function mergeQcAuditLogs(legacy,operational,administration=[]){
 const rows=[
  ...legacy.map(x=>({Timestamp:x.Timestamp,Username:x.Username,FullName:x.FullName,Role:x.Role,ActionType:x.ActionType,Description:x.Description,IP_Device:x.IP_Device,Source:'Apps Script (historis)',AuditId:'legacy:'+x.id})),
  ...operational.map(x=>({Timestamp:x.Timestamp,Username:x.username,ActionType:'QC '+x.saveType,Description:[x.formType,x.recordId,x.revision].filter(Boolean).join(' · '),Source:'Firestore QC',AuditId:'qc:'+x.id})),
  ...administration.map(x=>({Timestamp:x.Timestamp,Username:x.actorUid,ActionType:x.action,Description:String(x.target??''),Source:'Firestore Admin',AuditId:'admin:'+x.id}))
 ]
 const seen=new Set()
 return rows.filter(x=>{if(seen.has(x.AuditId))return false;seen.add(x.AuditId);return true}).sort((a,b)=>(Date.parse(b.Timestamp)||0)-(Date.parse(a.Timestamp)||0)||a.AuditId.localeCompare(b.AuditId))
}
