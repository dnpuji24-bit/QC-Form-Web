// Default dry-run is local only. No production write mode exists in this command.
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {prepareLegacyAudit,importLegacyAudit} from '../server/qc-photo-access/qcLegacyAudit.mjs'
const [mode,file,...extra]=process.argv.slice(2)
if(!['--dry-run','--emulator-only'].includes(mode)||!file||extra.length)throw Error('Usage: node scripts/import-qc-legacy-audit.mjs --dry-run /private/snapshot.json')
const snapshot=JSON.parse(readFileSync(file,'utf8'))
const prepared=prepareLegacyAudit(snapshot)
console.log(JSON.stringify(prepared.summary,null,2))
if(mode==='--dry-run'){console.log('SUCCESS: legacy audit snapshot validated (no network, no writes)')}
else{
 const projectId='demo-qc-photo-test'
 if(process.env.GCLOUD_PROJECT!==projectId||! /^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local demo emulator only')
 const requireAdmin=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {initializeApp,deleteApp}=requireAdmin('firebase-admin/app')
 const {getFirestore}=requireAdmin('firebase-admin/firestore')
 const app=initializeApp({projectId})
 try{console.log(JSON.stringify(await importLegacyAudit(getFirestore(app),prepared)));console.log('SUCCESS: emulator import completed')}finally{await deleteApp(app)}
}
