// Dedicated Cloud Run-compatible process. No service keys or Supabase secrets required.
import {createServer} from 'node:http'
import {initializeApp,applicationDefault} from 'firebase-admin/app'
import {getAuth} from 'firebase-admin/auth'
import {getFirestore,FieldValue} from 'firebase-admin/firestore'
import {createNativeAdminRuntime} from './nativeAdminRuntime.mjs'
const project='form-qc-unm'
if(process.env.FIREBASE_PROJECT_ID!==project||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('INVALID_RUNTIME_PROJECT')
for(const k of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT'])if(process.env[k]&&process.env[k]!==project)throw Error('INVALID_RUNTIME_PROJECT')
const enabled=k=>{const v=process.env[k];if(v!==undefined&&!['true','false'].includes(v))throw Error('INVALID_FEATURE_FLAG');return v==='true'}
const app=initializeApp({projectId:project,credential:applicationDefault()})
const handler=createNativeAdminRuntime({db:getFirestore(app),auth:getAuth(app),stamp:()=>FieldValue.serverTimestamp(),allowedOrigin:process.env.QC_ADMIN_ALLOWED_ORIGIN,writesEnabled:enabled('QC_NATIVE_ADMIN_WRITES_ENABLED'),archiveEnabled:enabled('QC_ARCHIVE_ENABLED'),historicalEnabled:enabled('QC_HISTORICAL_ENABLED'),nameRequestsEnabled:enabled('QC_NAME_REQUESTS_ENABLED')})
const server=createServer((req,res)=>{void handler(req,res).catch(()=>{if(!res.headersSent){res.writeHead(500,{'Cache-Control':'no-store'});res.end()}else res.destroy()})})
server.requestTimeout=15000
server.headersTimeout=10000
server.maxRequestsPerSocket=100
const port=Number(process.env.PORT||8080)
if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_PORT')
server.listen(port,'0.0.0.0',()=>console.info('QC native administration runtime listening.'))
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close())
