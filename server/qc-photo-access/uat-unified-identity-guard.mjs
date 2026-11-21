// Exact opt-in for a SAME-project, isolated Firebase Auth + Firestore UAT emulator.
export const unifiedProjectId='demo-qc-uat-unified-role-planning'
export const unifiedHost='127.0.0.1',unifiedFirestorePort=9285,unifiedAuthPort=10099
export function unifiedGuard(e=process.env){
 if(e.QC_UAT_MODE!=='unified-lab'||e.GCLOUD_PROJECT!==unifiedProjectId||
    e.FIRESTORE_EMULATOR_HOST!==unifiedHost+':'+unifiedFirestorePort||
    e.FIREBASE_AUTH_EMULATOR_HOST!==unifiedHost+':'+unifiedAuthPort)throw Error('UNIFIED_DEMO_EMULATORS_REQUIRED')
 for(const k of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[k]&&e[k]!==unifiedProjectId)throw Error('WRONG_PROJECT')
 return unifiedProjectId
}
