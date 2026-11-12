// Candidate archive operation. Invoke only after legacy writers are retired.
// All reads precede writes; original documents are retained verbatim in archive.
const norm=v=>String(v??'').trim().toLowerCase()
export async function archiveQc({db,actor,command,stamp}){
 const {recordId,baseRevision,reason,operationId}=command
 if(typeof recordId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(recordId)||typeof operationId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(operationId)||typeof baseRevision!=='string'||!baseRevision||typeof reason!=='string'||reason.trim().length<5||reason.length>300)throw Error('INVALID_COMMAND')
 return db.runTransaction(async tx=>{
  const profile=(await tx.get(db.collection('users').doc(actor.uid))).data()
  if(!profile||profile.role!=='owner'||profile.active!==true||profile.status!=='approved'||!actor.email||norm(profile.email)!==norm(actor.email))throw Error('OWNER_REQUIRED')
  const q=db.collection('qc_records').doc(recordId),archive=db.collection('qc_archived_records').doc(recordId)
  const marker=db.collection('qc_archive_markers').doc(recordId),actual=db.collection('daily_reports').doc('qcactual_'+recordId)
  const log=db.collection('qc_admin_audit').doc('archive_'+operationId)
  const [qs,ms,as,ls,arch,linked]=await Promise.all([tx.get(q),tx.get(marker),tx.get(actual),tx.get(log),tx.get(archive),tx.get(db.collection('daily_reports').where('qcRecordId','==',recordId))])
  if(ms.exists){
   if(!qs.exists&&arch.exists&&ls.exists&&ms.data().operationId===operationId&&ms.data().actorUid===actor.uid)return {ok:true,replayed:true}
   throw Error('QC_ALREADY_ARCHIVED')
  }
  if(arch.exists||ls.exists||!qs.exists)throw Error('QC_ARCHIVE_CONFLICT')
  const row=qs.data()
  if(row.id!==recordId||!row.operationalSaveId||row.firestoreSaveState!=='confirmed'||!['draft','ready','uploaded'].includes(row.saveType))throw Error('QC_HISTORICAL_REVIEW_REQUIRED')
  if(row.clientRevision!==baseRevision)throw Error('QC_REVISION_CONFLICT')
  if(linked.docs.some(d=>d.id!==actual.id)||as.exists&&(as.data().sourceOrigin!=='QC'||as.data().qcRecordId!==recordId))throw Error('QC_ACTUAL_LINK_CONFLICT')
  if(['ready','uploaded'].includes(row.saveType)&&row.dailyPlanId&&Number(row.actualAreaHa)>0&&!as.exists)throw Error('QC_ACTUAL_LINK_CONFLICT')
  tx.create(archive,row)
  if(as.exists){tx.create(db.collection('qc_archived_actuals').doc(recordId),as.data());tx.delete(actual)}
  tx.create(marker,{recordId,operationId,actorUid:actor.uid,baseRevision,reason:reason.trim(),archivedAt:stamp()})
  tx.create(log,{action:'archiveQc',actorUid:actor.uid,target:recordId,reason:reason.trim(),revision:baseRevision,createdAt:stamp()})
  tx.delete(q)
  return {ok:true,replayed:false}
 })
}
