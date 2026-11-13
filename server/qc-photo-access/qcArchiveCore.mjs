// Candidate archive operation. Invoke only after legacy writers are retired.
// All reads precede writes; original documents are retained verbatim in archive.
const norm=v=>String(v??'').trim().toLowerCase()
export async function archiveQc({db,actor,command,stamp}){
 const {recordId,baseRevision,reason,operationId}=command
 if(typeof recordId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(recordId)||typeof operationId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(operationId)||typeof baseRevision!=='string'||!baseRevision||typeof reason!=='string'||reason.trim().length<5||reason.length>300)throw Error('INVALID_COMMAND')
 return db.runTransaction(async tx=>{
  const profile=(await tx.get(db.collection('users').doc(actor.uid))).data()
  if(!profile||profile.role!=='owner'||profile.active!==true||!['approved','APPROVED'].includes(profile.status)||!actor.email||norm(profile.email)!==norm(actor.email))throw Error('OWNER_REQUIRED')
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

 // Restore preserves the original archive as separate immutable history documents.
 // A fresh revision invalidates any queued edit captured before archival.
export async function restoreQc({db,actor,command,stamp}){
 const {recordId,archiveOperationId,operationId,reason}=command
 const valid=(v,max)=>typeof v==='string'&&v.length<=max&&/^[A-Za-z0-9_-]+$/.test(v)
 if(!valid(recordId,160)||!valid(archiveOperationId,100)||!valid(operationId,100)||typeof reason!=='string'||reason.trim().length<5||reason.length>300)throw Error('INVALID_COMMAND')
 return db.runTransaction(async tx=>{
  const profile=(await tx.get(db.collection('users').doc(actor.uid))).data()
  if(!profile||profile.role!=='owner'||profile.active!==true||!['approved','APPROVED'].includes(profile.status)||!actor.email||norm(profile.email)!==norm(actor.email))throw Error('OWNER_REQUIRED')
  const q=db.collection('qc_records').doc(recordId),a=db.collection('daily_reports').doc('qcactual_'+recordId)
  const marker=db.collection('qc_archive_markers').doc(recordId),archive=db.collection('qc_archived_records').doc(recordId),archiveActual=db.collection('qc_archived_actuals').doc(recordId)
  const log=db.collection('qc_admin_audit').doc('restore_'+operationId)
  const archiveLog=db.collection('qc_admin_audit').doc('archive_'+archiveOperationId)
  const hist=db.collection('qc_archive_history').doc(archiveOperationId),histQc=db.collection('qc_archive_history_records').doc(archiveOperationId),histActual=db.collection('qc_archive_history_actuals').doc(archiveOperationId)
  const revision='restore_'+operationId
  const revisionLog=db.collection('qc_operational_audit').doc(recordId+':'+revision)
  const [qs,as,ms,rs,ars,ls,als,hs,hqs,has,rl,linked]=await Promise.all([q,a,marker,archive,archiveActual,log,archiveLog,hist,histQc,histActual,revisionLog,db.collection('daily_reports').where('qcRecordId','==',recordId)].map(ref=>tx.get(ref)))
  if(ls.exists){
   const prior=ls.data()
   if(prior.action==='restoreQc'&&prior.target===recordId&&prior.archiveOperationId===archiveOperationId&&prior.actorUid===actor.uid&&prior.reason===reason.trim())return {ok:true,replayed:true}
   throw Error('QC_RESTORE_CONFLICT')
  }
  if(!ms.exists||!rs.exists||!als.exists||ms.data().operationId!==archiveOperationId||als.data().target!==recordId||als.data().action!=='archiveQc'||qs.exists||as.exists||linked.size||hs.exists||hqs.exists||has.exists||rl.exists)throw Error('QC_RESTORE_CONFLICT')
  const row=rs.data(),oldActual=ars.exists?ars.data():null
  if(row.id!==recordId||!row.operationalSaveId||row.firestoreSaveState!=='confirmed'||row.clientRevision!==ms.data().baseRevision||!['draft','ready','uploaded'].includes(row.saveType))throw Error('QC_RESTORE_CONFLICT')
  if(oldActual&&(oldActual.sourceOrigin!=='QC'||oldActual.qcRecordId!==recordId||oldActual.dailyPlanId!==row.dailyPlanId||Number(oldActual.actualAreaHa)!==Number(row.actualAreaHa)))throw Error('QC_ACTUAL_LINK_CONFLICT')
  if(['ready','uploaded'].includes(row.saveType)&&row.dailyPlanId&&Number(row.actualAreaHa)>0&&!oldActual)throw Error('QC_ACTUAL_LINK_CONFLICT')
  tx.create(hist,{...ms.data(),restoredAt:stamp(),restoredBy:actor.uid,restoreOperationId:operationId})
  tx.create(histQc,row)
  if(oldActual)tx.create(histActual,oldActual)
  tx.create(q,{...row,clientRevision:revision,operationalSaveId:'restore_'+operationId,updatedAt:stamp()})
  if(oldActual)tx.create(a,oldActual)
  tx.create(log,{action:'restoreQc',actorUid:actor.uid,target:recordId,archiveOperationId,revision,reason:reason.trim(),createdAt:stamp()})
  tx.create(revisionLog,{recordId,revision,actorUid:actor.uid,username:profile.username||actor.uid,formType:row.formType,saveType:row.saveType,createdAt:stamp()})
  tx.delete(marker);tx.delete(archive);if(oldActual)tx.delete(archiveActual)
  return {ok:true,replayed:false}
 })
}
