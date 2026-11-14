import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { qcLocalUat } from './qcLocalUat'

// Firebase web config is intentionally client-visible. Access control is enforced
// by Firebase Authentication + Firestore Security Rules, never by hiding this config.
const demoProject = 'demo-qc-photo-test'
const firebaseConfig = qcLocalUat ? {
  apiKey: 'demo-key',
  projectId: demoProject,
  appId: '1:123456789:web:1234567890abcdef',
} : {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyD09IvCxfcjOyf3iAShTRr1XRlLMaQ3HKM',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'form-qc-unm.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'form-qc-unm',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'form-qc-unm.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '297386304710',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:297386304710:web:70cefb49b02c80e4dea3c7',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-WPRMDDY9WD',
}

export const firestoreFeatureEnabled = import.meta.env.VITE_FIRESTORE_ENABLED === 'true'
export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)

export const firebaseApp = firebaseConfigured
  ? qcLocalUat
    ? getApps().find(app => app.name === demoProject) ?? initializeApp(firebaseConfig, demoProject)
    : getApps().some(app => app.name === '[DEFAULT]') ? getApp() : initializeApp(firebaseConfig)
  : null
export const appCheckSiteKey = qcLocalUat ? '' : String(import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY || '').trim()
export const appCheckConfigured = Boolean(firebaseApp && appCheckSiteKey)
export const firebaseAppCheck = (()=>{
  if(!firebaseApp||!appCheckSiteKey||typeof window==='undefined')return null
  try{return initializeAppCheck(firebaseApp,{provider:new ReCaptchaEnterpriseProvider(appCheckSiteKey),isTokenAutoRefreshEnabled:true})}
  catch(error){console.info('Firebase App Check belum aktif pada runtime ini.',error);return null}
})()
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null
if (qcLocalUat && firebaseAuth && !firebaseAuth.emulatorConfig) {
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099')
}
export const firebaseAuthPersistenceReady:Promise<void> = firebaseAuth ? setPersistence(firebaseAuth,browserLocalPersistence).catch(error=>{console.info('Firebase Auth local persistence tidak dapat diaktifkan; memakai persistence bawaan.',error)}) : Promise.resolve()
function createFirestore(){if(!firebaseApp)return null;try{return initializeFirestore(firebaseApp,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}catch(error){console.info('Firestore persistent cache memakai instance yang sudah tersedia.',error);return getFirestore(firebaseApp)}}
export const firestoreDb = createFirestore()
if (qcLocalUat && firestoreDb) {
  connectFirestoreEmulator(firestoreDb, '127.0.0.1', 8085)
}
