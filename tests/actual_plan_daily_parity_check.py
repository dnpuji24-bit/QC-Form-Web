from pathlib import Path

root=Path(__file__).resolve().parents[1]
web=(root/'src'/'ActualPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
listing=(root/'src'/'ActualPlanListPanel.tsx').read_text(encoding='utf-8')
workspace=(root/'src'/'ActualPlanWorkspace.tsx').read_text(encoding='utf-8')
actions=(root/'src'/'actualPlanActions.ts').read_text(encoding='utf-8')
types=(root/'src'/'actualPlanWorkspaceTypes.ts').read_text(encoding='utf-8')

for token in [
    'Simpan ke Draft',
    'DRAFT ACTUAL',
    'Periksa Hasil Actual',
    'Copy WA Semua',
    'Simpan Semua Actual',
    'editDraft(',
    'deleteDraft(',
    'duplicateDraft(',
    'moveDraft(',
    'dropDraft(',
    'DailyActionIcon',
    'planningOrder:state.works.findIndex',
    'firebaseAuthPersistenceReady',
    'auth.authStateReady',
    'savePersistedEdit',
    'Actual ID tetap',
]:
    assert token in web, f'Missing Actual Daily-parity input token: {token}'

for token in [
    'Pilih Semua',
    'Copy WA',
    'Salin ke tanggal',
    'moveRow(',
    'deleteActual(',
    'copyRowsToDate(',
    'DailyActionIcon',
    'aria-label="Naik"',
    'aria-label="Turun"',
    'aria-label="Duplikat"',
    'aria-label="Edit"',
    'aria-label="Hapus"',
]:
    assert token in listing, f'Missing Actual saved-card parity token: {token}'

for token in ['ActualComposerRequest','editActual(','duplicateActual(','composerRequest']:
    assert token in workspace, f'Missing Actual main-form editor routing token: {token}'

assert 'actualPlansToWhatsApp' in actions
assert '*ACTUAL PEKERJAAN*' in actions
assert 'SavedActualRow' in types
assert "setDoc(doc(db,'daily_reports',persistedEdit.id)" in web, 'Editing saved Actual must update the same document, not create a new Actual.'
assert "actualReportId:persistedEdit.actualReportId" in web, 'Saved Actual edit must preserve Actual ID.'

print('Actual Daily-parity check passed: draft workflow, card actions, main-form edit, mobile auth hydration, and same-ID persisted edits are wired.')
