from pathlib import Path

root = Path(__file__).resolve().parents[1]
offline = (root / 'src' / 'offline.ts').read_text(encoding='utf-8')
dashboard = (root / 'src' / 'OperationalDashboard.tsx').read_text(encoding='utf-8')

assert "export async function saveRecordFirestoreFirst" in offline, 'missing generic Firestore-first save path'
assert "if(action==='syncRecord')return saveRecordFirestoreFirst(token,record)" in offline, 'syncRecord is not Firestore-first'
assert "return sendFinalizeStateMachine(token,record)" in offline, 'final upload is not routed through the Upload State Machine'
assert "await enqueueInternal('syncRecord',record)" in offline, 'Spreadsheet handoff is not persisted before success'
assert "Pembaruan otomatis" in dashboard, 'dashboard realtime status is missing'
assert "realtimeActive?<Tag" in dashboard and "onClick={onRefresh}" in dashboard
assert "onAuthStateChanged" in dashboard, 'dashboard does not react to Firebase auth state'

print('Firestore stage 2 check: realtime dashboard, Firestore-first edits, and Stage 3 upload routing verified.')
