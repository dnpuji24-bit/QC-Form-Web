from pathlib import Path
root=Path(__file__).resolve().parents[1]
app=(root/'src/App.tsx').read_text(encoding='utf-8')
bridge=(root/'src/firebaseAuthBridge.ts').read_text(encoding='utf-8')
helper=(root/'src/planOfflineReads.ts').read_text(encoding='utf-8')
portal=(root/'src/PortalRouter.tsx').read_text(encoding='utf-8')
user_access=(root/'src/userAccess.ts').read_text(encoding='utf-8')
daily_list=(root/'src/DailyPlanListPanel.tsx').read_text(encoding='utf-8')
actual_list=(root/'src/ActualPlanListPanel.tsx').read_text(encoding='utf-8')
daily_entry=(root/'src/DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
actual_entry=(root/'src/ActualPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
plan=(root/'src/PlanWorkspace.tsx').read_text(encoding='utf-8')
banner=(root/'src/PlanOfflineBanner.tsx').read_text(encoding='utf-8')

assert 'setSessionNeedsVerification(true)' in app
assert 'if(authSessionFailure(error)){clearSession()' not in app
assert "window.addEventListener('online',onReconnect)" in app
assert 'if(!navigator.onLine)' in app
assert 'if(!bridgeOk&&currentEmail&&currentEmail!==' in app
assert 'await signInWithEmailAndPassword(firebaseAuth,targetEmail,password)' in bridge
assert 'try{if(firebaseAuth.currentUser)await signOut(firebaseAuth)}' not in bridge
assert "existingEmail!==targetEmail)await signOut" not in bridge
assert 'return user' in user_access
assert 'return{...user,permissions:undefined}' not in user_access
assert 'getDocsFromCache(query)' in helper
assert "if(typeof navigator!=='undefined'&&!navigator.onLine)" in helper
assert "if(!/unavailable|deadline-exceeded|network|offline|failed to fetch/i" in helper
assert 'getPlanDocsWithCache(' in daily_list
assert 'getPlanDocsWithCache(' in actual_list
assert "metadata.fromCache?planOfflineMessage" in daily_list
assert "metadata.fromCache?planOfflineMessage" in actual_list
for panel in (daily_entry,actual_entry):
    assert "writePlanDraft(draftKey,state)" in panel
    assert "draftKey+'_saved_edit'" in panel
    assert "if(!navigator.onLine)" in panel
    assert "belum terkirim ke Firestore" in panel or "Simpan Semua saat online" in panel
    assert "getPlanDocsWithCache(" in panel
assert '<PlanOfflineBanner/>' in plan
assert 'Data tanggal yang belum pernah dibuka memerlukan internet.' in banner
assert "function hasSession(){return Boolean(readStored(TOKEN_KEY)&&readUser())}" in portal
print('Offline session, cached reads, draft protection and reconnect regressions: OK')
