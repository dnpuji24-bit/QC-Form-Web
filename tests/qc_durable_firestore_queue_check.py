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
 'stable fertilizer ID':"recordId=card.recordId||`fert_${sessionId}_${card.id}`",
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
print("Durable QC queue, Firestore confirmation, stable record IDs and non-destructive login checks passed")
