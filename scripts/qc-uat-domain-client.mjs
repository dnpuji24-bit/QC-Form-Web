// Node emulator-only SDK adapter. Never imported by the normal portal.
import {randomUUID} from 'node:crypto'
import {assertDemoEnvironment,demoProject} from './qc-uat-isolation-foundation.mjs'
import {syntheticUid,syntheticPath,syntheticCollection,syntheticLimit,planCreate,qcPair} from '../src/qcUatDomainContract.mjs'
export async function createSyntheticDemoClient(uid,withClaim=true){
 assertDemoEnvironment()
 syntheticUid(uid)
 if(typeof withClaim!=='boolean')throw Error('INVALID_UAT_CLAIM')
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeFirestore,connectFirestoreEmulator,doc,collection,query,where,limit,getDocFromServer,getDocsFromServer,setDoc,writeBatch,serverTimestamp,terminate}=await import('firebase/firestore')
 const app=initializeApp({projectId:demoProject,apiKey:'demo-only-not-a-real-key'},'uat-domain-'+randomUUID())
 let db
 try{
  db=initializeFirestore(app,{})
  connectFirestoreEmulator(db,'127.0.0.1',8185,{mockUserToken:{sub:uid,...(withClaim?{qcUat:true}:{})}})
 }catch(e){await deleteApp(app);throw e}
 let closed=false
 const guard=()=>{assertDemoEnvironment();if(closed)throw Error('UAT_CLIENT_CLOSED')}
 const ref=(c,id)=>doc(db,...syntheticPath(c,id))
 return Object.freeze({
  async createPlan(c,id,input){guard();const row=planCreate(c,id,input,uid,serverTimestamp());await setDoc(ref(c,id),row);return id},
  async createQcPair(id,input){guard();const {qc,actual}=qcPair(id,input,uid,serverTimestamp());const batch=writeBatch(db);batch.set(ref('qc_records',id),qc);batch.set(ref('daily_reports',id),actual);await batch.commit();return id},
  async read(c,id){guard();const s=await getDocFromServer(ref(c,id));return s.exists()?{id:s.id,data:s.data()}:null},
  async list(c,n=20){guard();const s=await getDocsFromServer(query(collection(db,...syntheticCollection(c)),where('testOnly','==',true),limit(syntheticLimit(n))));return s.docs.map(d=>({id:d.id,data:d.data()}))},
  async close(){if(closed)return;closed=true;try{await terminate(db)}finally{await deleteApp(app)}}
 })
}
