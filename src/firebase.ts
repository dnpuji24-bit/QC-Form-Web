import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth'
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

// Firebase web config is intentionally client-visible. Access control is enforced
// by Firebase Authentication + Firestore Security Rules, never by hiding this config.
const firebaseConfig = {
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

export const firebaseApp = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null
export const firebaseAuthPersistenceReady:Promise<void> = firebaseAuth ? setPersistence(firebaseAuth,browserLocalPersistence).catch(error=>{console.info('Firebase Auth local persistence tidak dapat diaktifkan; memakai persistence bawaan.',error)}) : Promise.resolve()
function createFirestore(){if(!firebaseApp)return null;try{return initializeFirestore(firebaseApp,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}catch(error){console.info('Firestore persistent cache memakai instance yang sudah tersedia.',error);return getFirestore(firebaseApp)}}
export const firestoreDb = createFirestore()
