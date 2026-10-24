from pathlib import Path

app=Path('src/App.tsx').read_text()
fb=Path('src/firebase.ts').read_text()
bridge=Path('src/firebaseAuthBridge.ts').read_text()

assert "localStorage.setItem(TOKEN_KEY,token)" in app
assert "localStorage.setItem(USER_KEY,JSON.stringify(user))" in app
assert "if(!navigator.onLine){" in app
assert "Sesi lokal dipertahankan" in app
assert "if(authSessionFailure(error)){" in app
assert "setSessionNeedsVerification(true)" in app
assert "if(authSessionFailure(error)){clearSession()" not in app
assert "onClick={()=>void logout()}>Login Ulang" in app
assert "catch{clearSession()}" not in app
assert "browserLocalPersistence" in fb
assert "persistentLocalCache" in fb
assert "persistentMultipleTabManager" in fb
assert "await firebaseAuthPersistenceReady" in bridge
print('Offline persistent session check: OK')
assert "if(firebaseAuth.currentUser&&existingEmail!==targetEmail)await signOut(firebaseAuth)" not in bridge
assert "try{if(firebaseAuth.currentUser)await signOut(firebaseAuth)}" not in bridge
assert "if(!bridgeOk&&currentEmail&&currentEmail!==" in app
