from pathlib import Path
root=Path(__file__).resolve().parents[1]
offline=(root/'src'/'offline.ts').read_text()
fert=(root/'src'/'FertilizerForm.tsx').read_text()
app=(root/'src'/'App.tsx').read_text()
api=(root/'src'/'api.ts').read_text()
status=(root/'src'/'UploadStatus.tsx').read_text()
rules=(root/'firestore.rules').read_text()
required={
 'durable before network':"const item=await enqueueInternal('syncRecord',record)",
 'nonblocking background':"void (async()=>{",
 'confirmed firestore':"firestoreSynced:true",
 'revision idempotency':"current.record.clientRevision===record.clientRevision",
 'firestore auth restored':"await firebaseAuth.authStateReady()",
 'firestore timeout':"FIRESTORE_CONFIRM_TIMEOUT_MS",
 'local pending status':"firestoreSaveState:'queued'",
 'firebase reconnection':"Sambungkan Firebase",
 'non-destructive session renewal':"Perbarui sesi tanpa keluar",
 'relogin without signout':"renewScriptSession(",
 'mandor query permission':"where('inputtedBy','==',owner)",
 'stable fertilizer ID':"recordId=card.recordId||(operational?newOperationalQcId(sessionId,card.id):`fert_${sessionId}_${card.id}`)",
 'user feedback':"QC menunggu Firestore",
 'manual retry':"Sinkronisasi QC",
}
for key,token in required.items():
    source=offline+fert+app+api+status
    assert token in source, f'{key} missing: {token}'
assert offline.index("const item=await enqueueInternal('syncRecord',record)") < offline.index('const mirrored=await confirmedFirestoreWrite(record)',offline.index("export async function saveRecordFirestoreFirst"))
assert "return sendServerFirst(token,'syncRecord',record)" not in offline
assert "await qcApi.syncRecord(token,record)" not in offline[offline.index('export async function saveRecordFirestoreFirst'):offline.index('export async function saveDraftFirestoreFirst')]
assert "validQcActualWrite()" in rules
assert "isFertMandor()" in rules and "ownsIncoming()" in rules

# Keep the legacy queue guards above. The feature-gated operational path has a
# separate stable record ID and an independently durable, UID-scoped queue.
source_0=(root/'src'/"FertilizerForm.tsx").read_text()
for token in ["operationalItems.push({record,previous,","const queuedRecords=await queueFormSession(operationalItems)","if(card.recordId&&!previous)throw Error"]:
    assert token in source_0, f"FertilizerForm.tsx: missing {token}"

source_1=(root/'src'/"qcOperationalFormBridge.ts").read_text()
for token in ["const id='qc-v2-'+sessionId+'-'+cardId","previous.id!==record.id","ownerUid:previous.ownerUid,inputtedBy:previous.inputtedBy","await queueOperationalSession(prepared)","firestoreSaveState:'queued'"]:
    assert token in source_1, f"qcOperationalFormBridge.ts: missing {token}"

source_2=(root/'src'/"qcOperationalQueue.mjs").read_text()
for token in ["factory.open('qc_operational_queue_v1',1)","tx.oncomplete=()=>resolve(result)","id:operationalQueueId(uid,job.record.id,job.record.clientRevision)","if(req.result.some(j=>j.uploaderUid===uid&&ids.has(j.record.id)))","store.transaction.abort()","req.result.filter(j=>j.uploaderUid===uid)","if(await deps.currentUid()!==uid)break","if(result.status!=='confirmed')throw Error('Unconfirmed commit')","await transaction(factory,'readwrite',(store)=>store.delete(job.id))"]:
    assert token in source_2, f"qcOperationalQueue.mjs: missing {token}"

source_3=(root/'src'/"qcOperationalSaveTransport.mjs").read_text()
for token in ["return JSON.stringify([uid,recordId,revision])","current?.clientRevision === record.clientRevision","current?.operationalSaveId === job.id","(current?.clientRevision ?? null) !== (baseRevision ?? null)","await deps.currentUid() !== uploaderUid","await deps.commitRecord(","committed.operationalSaveId!==job.id || committed.clientRevision!==record.clientRevision","QC_COMMIT_UNCONFIRMED"]:
    assert token in source_3, f"qcOperationalSaveTransport.mjs: missing {token}"

source_4=(root/'src'/"qcOperationalAdapters.ts").read_text()
for token in ["import.meta.env.VITE_QC_OPERATIONAL_SAVE==='true'","intent.baseRevision!==null&&record.ownerUid!==uid","enqueueOperationalBatch(items.map(({record,intent})=>makeJob(record,intent,'syncRecord')))","uploaderUid:uid","assertUid(uid)"]:
    assert token in source_4, f"qcOperationalAdapters.ts: missing {token}"

assert fert.index("const queuedRecords=await queueFormSession(operationalItems)") < fert.index("await clearDraft(draftKey)",fert.index("const queuedRecords=await queueFormSession(operationalItems)"))
print("Durable QC queue: legacy and operational stable IDs, persistence, ownership, revision and confirmation guards passed")
