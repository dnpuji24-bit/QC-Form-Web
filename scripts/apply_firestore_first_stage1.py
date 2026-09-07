from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch target: {label}")
    return text.replace(old, new, 1)

# 1) Durable Firestore-first draft transport.
p = Path('src/offline.ts')
s = p.read_text(encoding='utf-8')
if 'saveDraftFirestoreFirst' not in s:
    s = replace_once(
        s,
        "export type QueueAction='syncRecord'|'finalizeRecord'\ntype QueueItem={id:string;action:QueueAction;record:QcRecord;createdAt:number}",
        "export type QueueAction='syncRecord'|'finalizeRecord'\nexport type SaveTransportResult={queued:boolean;firestoreFirst:boolean;spreadsheetPending:boolean}\ntype QueueItem={id:string;action:QueueAction;record:QcRecord;createdAt:number}",
        'offline result type',
    )
    s = replace_once(
        s,
        "if(!navigator.onLine){await enqueue(action,record);return{queued:true}}",
        "if(!navigator.onLine){await enqueue(action,record);return{queued:true,firestoreFirst:false,spreadsheetPending:true}}",
        'offline queued result',
    )
    s = replace_once(
        s,
        "return{queued:false}",
        "return{queued:false,firestoreFirst:false,spreadsheetPending:false}",
        'online server result',
    )
    s = replace_once(
        s,
        "await enqueue(action,record)\n    return{queued:true}",
        "await enqueue(action,record)\n    return{queued:true,firestoreFirst:false,spreadsheetPending:true}",
        'server failure queued result',
    )
    marker = "export async function flushQueue(token:string){"
    helper = """export async function saveDraftFirestoreFirst(token:string,record:QcRecord):Promise<SaveTransportResult>{\n  if(!navigator.onLine)return sendOrQueue(token,'syncRecord',record)\n  try{\n    const mirrored=await mirrorRecordToFirestore(record)\n    if(!mirrored)return sendOrQueue(token,'syncRecord',record)\n    // Queue the Spreadsheet sync before reporting success so a tab close cannot lose the server handoff.\n    await enqueue('syncRecord',record)\n    void flushQueue(token).catch(error=>console.info('Sinkronisasi Spreadsheet akan dicoba ulang dari antrean.',error))\n    return{queued:false,firestoreFirst:true,spreadsheetPending:true}\n  }catch(error){\n    console.info('Firestore-first tidak tersedia; memakai jalur Apps Script yang aman.',error)\n    return sendOrQueue(token,'syncRecord',record)\n  }\n}\n\n"""
    s = replace_once(s, marker, helper + marker, 'Firestore-first helper')
    p.write_text(s, encoding='utf-8')

# 2) Spraying drafts use Firestore first; final/ready stays on the existing safe server path.
p = Path('src/SprayForm.tsx')
s = p.read_text(encoding='utf-8')
if 'saveDraftFirestoreFirst' not in s:
    s = replace_once(
        s,
        "import { flushQueue, sendOrQueue } from './offline'",
        "import { flushQueue, saveDraftFirestoreFirst, sendOrQueue } from './offline'",
        'Spray import',
    )
    old = "const result=await sendOrQueue(token,editingUploaded?'finalizeRecord':'syncRecord',record),saved={...record,saveType:result.queued?(editingUploaded?'upload_queued':saveType):saveType}as QcRecord;onSaved(saved);if(requested==='draft'&&!editingUploaded){if(!editing)await saveDraft(draftKey,localDraft);setMessage(result.queued?'Draft aman di perangkat dan menunggu jaringan.':'Draft Spraying tersimpan; form tetap dipertahankan.');return}"
    new = "const result=requested==='draft'&&!editingUploaded?await saveDraftFirestoreFirst(token,record):await sendOrQueue(token,editingUploaded?'finalizeRecord':'syncRecord',record),saved={...record,saveType:result.queued?(editingUploaded?'upload_queued':requested==='draft'?'draft_queued':saveType):saveType}as QcRecord;onSaved(saved);if(requested==='draft'&&!editingUploaded){if(!editing)await saveDraft(draftKey,localDraft);setMessage(result.queued?'Draft aman di perangkat dan menunggu jaringan.':result.firestoreFirst?'Draft Spraying tersimpan di Firestore; Data QC diperbarui realtime. Sinkronisasi Spreadsheet berjalan di belakang.':'Draft Spraying tersimpan; form tetap dipertahankan.');return}"
    s = replace_once(s, old, new, 'Spray draft save')
    p.write_text(s, encoding='utf-8')

# 3) Fertilizer unit-card drafts use Firestore first.
p = Path('src/FertilizerForm.tsx')
s = p.read_text(encoding='utf-8')
if 'saveDraftFirestoreFirst' not in s:
    s = replace_once(
        s,
        "import { sendOrQueue } from './offline'",
        "import { saveDraftFirestoreFirst, sendOrQueue } from './offline'",
        'Fertilizer import',
    )
    s = replace_once(
        s,
        "const records:QcRecord[]=[],savedIds=new Map<string,{recordId:string;saveType:string}>();let queued=0",
        "const records:QcRecord[]=[],savedIds=new Map<string,{recordId:string;saveType:string}>();let queued=0,firestoreFirstCount=0",
        'Fertilizer counters',
    )
    s = replace_once(
        s,
        "const result=await sendOrQueue(token,uploaded?'finalizeRecord':'syncRecord',record);if(result.queued)queued++\n        const nextSaveType=result.queued?(uploaded?'upload_queued':record.saveType):record.saveType",
        "const result=saveType==='draft'&&!uploaded?await saveDraftFirestoreFirst(token,record):await sendOrQueue(token,uploaded?'finalizeRecord':'syncRecord',record);if(result.queued)queued++;if(result.firestoreFirst)firestoreFirstCount++\n        const nextSaveType=result.queued?(uploaded?'upload_queued':saveType==='draft'?'draft_queued':record.saveType):record.saveType",
        'Fertilizer draft transport',
    )
    s = replace_once(
        s,
        "setMessage(queued?`${records.length} unit tersimpan aman; ${queued} menunggu sinkronisasi.`:`Draft ${records.length} unit tersimpan; form tetap dipertahankan.`)",
        "setMessage(queued?`${records.length} unit tersimpan aman; ${queued} menunggu sinkronisasi.`:firestoreFirstCount===records.length?`Draft ${records.length} unit tersimpan di Firestore; Data QC diperbarui realtime. Sinkronisasi Spreadsheet berjalan di belakang.`:`Draft ${records.length} unit tersimpan; form tetap dipertahankan.`)",
        'Fertilizer draft message',
    )
    p.write_text(s, encoding='utf-8')

# 4) Data QC normal path is Firestore realtime. Apps Script records is fallback only.
p = Path('src/App.tsx')
s = p.read_text(encoding='utf-8')
if 'Data QC realtime aktif' not in s:
    s = replace_once(
        s,
        "if(!fbUser)return\n   stopRecords=subscribeQcRecords(next=>{setRecords(oldRecords=>mergeRecordLists(oldRecords,next));setBusy(false)},state=>{if(!state.connected)void refreshRecords()})",
        "if(!fbUser){void refreshRecords();return}\n   stopRecords=subscribeQcRecords(next=>{setRecords(oldRecords=>mergeRecordLists(oldRecords.filter(record=>String(record.saveType||'').includes('queued')),next));setBusy(false)},state=>{if(!state.connected)void refreshRecords()})",
        'App Firestore listener',
    )
    s = replace_once(
        s,
        "async function refreshSession(){try{const result=await qcApi.me(token);if(result.user){setUser(result.user);sessionStorage.setItem(USER_KEY,JSON.stringify(result.user))}await Promise.all([refreshRecords(),refreshMaster()])}catch{clearSession()}}",
        "async function refreshSession(){try{const result=await qcApi.me(token);if(result.user){setUser(result.user);sessionStorage.setItem(USER_KEY,JSON.stringify(result.user))}await refreshMaster();if(!firebaseAuth?.currentUser)await refreshRecords()}catch{clearSession()}}",
        'App session refresh',
    )
    s = replace_once(
        s,
        "async function refreshAfterLogin(nextToken:string){try{const[recordResult,masterResult]=await Promise.all([qcApi.records(nextToken),qcApi.masterData(nextToken)]);setRecords((recordResult.records||recordResult.data||[])as QcRecord[]);if(masterResult.data){setMaster(masterResult.data);localStorage.setItem(MASTER_KEY,JSON.stringify(masterResult.data))}}catch(error){setMessage(error instanceof Error?error.message:'Data awal gagal dimuat')}}",
        "async function refreshAfterLogin(nextToken:string){try{const masterResult=await qcApi.masterData(nextToken);if(masterResult.data){setMaster(masterResult.data);localStorage.setItem(MASTER_KEY,JSON.stringify(masterResult.data))}}catch(error){setMessage(error instanceof Error?error.message:'Master data awal gagal dimuat')}}",
        'App post-login load',
    )
    s = replace_once(
        s,
        "{view==='records'&&<Records records={records} user={user} loading={busy} preset={recordPreset} onRefresh={()=>void refreshRecords()} onEdit={startEdit}",
        "{view==='records'&&<Records records={records} user={user} loading={busy} preset={recordPreset} onRefresh={()=>{if(firebaseAuth?.currentUser)setMessage('Data QC realtime aktif; data diperbarui otomatis dari Firestore.');else void refreshRecords()}} onEdit={startEdit}",
        'Data QC refresh action',
    )
    p.write_text(s, encoding='utf-8')

print('Firestore-first stage 1 patch applied.')
