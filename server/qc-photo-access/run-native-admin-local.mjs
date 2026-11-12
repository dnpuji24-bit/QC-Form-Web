// Local integration server: never starts against production.
import {createServer} from 'node:http'
import {initializeApp,deleteApp} from 'firebase-admin/app'
import {getFirestore,FieldValue} from 'firebase-admin/firestore'
import {getAuth} from 'firebase-admin/auth'
import {createNativeAdminHandler} from './nativeAdminHttp.mjs'
const projectId='demo-qc-photo-test'
const local=v=>/^(127\.0\.0\.1|localhost):\d+$/.test(v||'')
if(process.env.GCLOUD_PROJECT!==projectId||!local(process.env.FIRESTORE_EMULATOR_HOST)||!local(process.env.FIREBASE_AUTH_EMULATOR_HOST))throw Error('Local Auth and Firestore demo emulators required')
const origin=process.env.QC_ADMIN_ORIGIN||'http://localhost:5173'
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))throw Error('Local origin required')
const app=initializeApp({projectId})
const handler=createNativeAdminHandler({db:getFirestore(app),auth:getAuth(app),stamp:()=>FieldValue.serverTimestamp(),allowedOrigin:origin})
const server=createServer((req,res)=>{if(req.url!=='/native-admin'){res.writeHead(404);res.end();return}void handler(req,res)})
server.requestTimeout=15000
server.listen(8787,'127.0.0.1',()=>console.log('Local native admin ready on 127.0.0.1:8787/native-admin'))
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>void deleteApp(app)))
