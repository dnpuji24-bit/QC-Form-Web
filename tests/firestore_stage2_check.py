from pathlib import Path

root = Path(__file__).resolve().parents[1]
offline = (root / 'src' / 'offline.ts').read_text(encoding='utf-8')
dashboard = (root / 'src' / 'OperationalDashboard.tsx').read_text(encoding='utf-8')

assert "export async function saveRecordFirestoreFirst" in offline, 'missing generic Firestore-first save path'
assert "if(action==='syncRecord')return saveRecordFirestoreFirst(token,record)" in offline, 'syncRecord is not Firestore-first'
assert "return sendServerFirst(token,action,record)" in offline, 'final upload must remain server-first'
assert "await enqueue('syncRecord',record)" in offline, 'Spreadsheet handoff is not persisted before success'
assert "Firestore realtime aktif" in dashboard, 'dashboard realtime status is missing'
assert "Tidak perlu menekan Refresh" in dashboard, 'dashboard still presents manual refresh as the normal path'
assert "onAuthStateChanged" in dashboard, 'dashboard does not react to Firebase auth state'

print('Firestore stage 2 check: realtime dashboard and Firestore-first non-upload edits verified.')
