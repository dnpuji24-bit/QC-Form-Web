from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Patch target not found: {label}")
    return text.replace(old, new, 1)

app_path = Path('src/App.tsx')
app = app_path.read_text()
app = replace_once(
    app,
    "const TOKEN_KEY='qc_token',USER_KEY='qc_user',MASTER_KEY='qc_master_react'\nfunction readUser():User|null{try{return JSON.parse(sessionStorage.getItem(USER_KEY)||'null')as User|null}catch{return null}}function readMaster():MasterData{try{return JSON.parse(localStorage.getItem(MASTER_KEY)||'{}')as MasterData}catch{return{}}}",
    "const TOKEN_KEY='qc_token',USER_KEY='qc_user',MASTER_KEY='qc_master_react'\nfunction storedValue(key:string){return sessionStorage.getItem(key)||localStorage.getItem(key)||''}\nfunction readToken(){return storedValue(TOKEN_KEY)}\nfunction readUser():User|null{try{return JSON.parse(storedValue(USER_KEY)||'null')as User|null}catch{return null}}\nfunction persistSession(token:string,user:User){sessionStorage.setItem(TOKEN_KEY,token);sessionStorage.setItem(USER_KEY,JSON.stringify(user));localStorage.setItem(TOKEN_KEY,token);localStorage.setItem(USER_KEY,JSON.stringify(user))}\nfunction clearPersistedSession(){sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(USER_KEY);localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(USER_KEY)}\nfunction errorText(error:unknown){return error instanceof Error?error.message:String(error||'')}\nfunction networkFailure(error:unknown){return !navigator.onLine||/failed to fetch|networkerror|network request failed|load failed|jaringan gagal|fetch/i.test(errorText(error))}\nfunction authSessionFailure(error:unknown){return /AUTH_REQUIRED|AUTH_EXPIRED|sesi.*(berakhir|kedaluwarsa|tidak valid)|login kembali|autentikasi.*(gagal|berakhir)/i.test(errorText(error))}\nfunction readMaster():MasterData{try{return JSON.parse(localStorage.getItem(MASTER_KEY)||'{}')as MasterData}catch{return{}}}",
    'session helpers',
)
app = replace_once(
    app,
    "const[token,setToken]=useState(()=>sessionStorage.getItem(TOKEN_KEY)||''),[user,setUser]=useState<User|null>(()=>readUser())",
    "const[token,setToken]=useState(()=>readToken()),[user,setUser]=useState<User|null>(()=>readUser())",
    'token initializer',
)
app = replace_once(
    app,
    "async function refreshSession(){try{const result=await qcApi.me(token);if(result.user){setUser(result.user);sessionStorage.setItem(USER_KEY,JSON.stringify(result.user))}await refreshMaster();if(!firebaseAuth?.currentUser)await refreshRecords()}catch{clearSession()}}",
    "async function refreshSession(){if(!navigator.onLine){setMessage('Mode offline: sesi akun dipertahankan di perangkat. Data yang tersimpan tetap aman.');return}try{const result=await qcApi.me(token);if(result.user){setUser(result.user);persistSession(token,result.user)}await refreshMaster();if(!firebaseAuth?.currentUser)await refreshRecords()}catch(error){if(authSessionFailure(error)){clearSession();return}if(networkFailure(error)){setMessage('Koneksi ke server belum tersedia. Sesi lokal tetap aktif dan data dapat dilanjutkan secara offline.');return}setMessage(errorText(error)||'Verifikasi sesi belum berhasil. Sesi lokal tetap dipertahankan.')}}",
    'offline-safe refreshSession',
)
app = replace_once(
    app,
    "function saveSession(nextToken:string,nextUser:User){setToken(nextToken);setUser(nextUser);sessionStorage.setItem(TOKEN_KEY,nextToken);sessionStorage.setItem(USER_KEY,JSON.stringify(nextUser));queueMicrotask(()=>{void refreshAfterLogin(nextToken)})}",
    "function saveSession(nextToken:string,nextUser:User){setToken(nextToken);setUser(nextUser);persistSession(nextToken,nextUser);queueMicrotask(()=>{void refreshAfterLogin(nextToken)})}",
    'persistent saveSession',
)
app = replace_once(
    app,
    "function clearSession(){setToken('');setUser(null);setRecords([]);setEditingRecord(null);setEditingFertilizerRecords([]);sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(USER_KEY)}",
    "function clearSession(){setToken('');setUser(null);setRecords([]);setEditingRecord(null);setEditingFertilizerRecords([]);clearPersistedSession()}",
    'persistent clearSession',
)
app_path.write_text(app)

firebase_path = Path('src/firebase.ts')
firebase = firebase_path.read_text()
firebase = replace_once(
    firebase,
    "import { getAuth } from 'firebase/auth'\nimport { getFirestore } from 'firebase/firestore'",
    "import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth'\nimport { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'",
    'firebase persistence imports',
)
firebase = replace_once(
    firebase,
    "export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null\nexport const firestoreDb = firebaseApp ? getFirestore(firebaseApp) : null",
    "export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null\nexport const firebaseAuthPersistenceReady:Promise<void> = firebaseAuth ? setPersistence(firebaseAuth,browserLocalPersistence).catch(error=>{console.info('Firebase Auth local persistence tidak dapat diaktifkan; memakai persistence bawaan.',error)}) : Promise.resolve()\nfunction createFirestore(){if(!firebaseApp)return null;try{return initializeFirestore(firebaseApp,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}catch(error){console.info('Firestore persistent cache memakai instance yang sudah tersedia.',error);return getFirestore(firebaseApp)}}\nexport const firestoreDb = createFirestore()",
    'firebase persistent auth/firestore',
)
firebase_path.write_text(firebase)

bridge_path = Path('src/firebaseAuthBridge.ts')
bridge = bridge_path.read_text()
bridge = replace_once(
    bridge,
    "import { firebaseAuth } from './firebase'",
    "import { firebaseAuth, firebaseAuthPersistenceReady } from './firebase'",
    'bridge persistence import',
)
bridge = replace_once(
    bridge,
    "  const targetEmail=email.trim().toLowerCase()\n  try{",
    "  const targetEmail=email.trim().toLowerCase()\n  try{\n    await firebaseAuthPersistenceReady",
    'await auth persistence',
)
bridge_path.write_text(bridge)

test_path = Path('tests/offline_session_persistence_check.py')
test_path.write_text("""from pathlib import Path\n\napp=Path('src/App.tsx').read_text()\nfb=Path('src/firebase.ts').read_text()\nbridge=Path('src/firebaseAuthBridge.ts').read_text()\n\nassert \"localStorage.setItem(TOKEN_KEY,token)\" in app\nassert \"localStorage.setItem(USER_KEY,JSON.stringify(user))\" in app\nassert \"if(!navigator.onLine){setMessage('Mode offline: sesi akun dipertahankan\" in app\nassert \"if(authSessionFailure(error)){clearSession();return}\" in app\nassert \"catch{clearSession()}\" not in app\nassert \"browserLocalPersistence\" in fb\nassert \"persistentLocalCache\" in fb\nassert \"persistentMultipleTabManager\" in fb\nassert \"await firebaseAuthPersistenceReady\" in bridge\nprint('Offline persistent session check: OK')\n""")

print('Offline session persistence patch applied.')
