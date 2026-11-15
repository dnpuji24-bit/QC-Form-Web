// Real Auth emulator only. No production imports, configurable endpoints or mock tokens.
import {randomUUID} from 'node:crypto'
import {assertDemoEnvironment,demoProject} from './qc-uat-isolation-foundation.mjs'
import {syntheticPath,syntheticCollection,syntheticLimit,planCreate,qcPair} from '../src/qcUatDomainContract.mjs'
export function guard(env=process.env){
 assertDemoEnvironment(env)
 if(!/^(127\.0\.0\.1|localhost):9199$/.test(env.FIREBASE_AUTH_EMULATOR_HOST||''))throw Error('AUTH_EMULATOR_REQUIRED')
}
export const identities=Object.freeze(Object.fromEntries([
 ['planner','asisten',true,true],['sprayer','mandor_spraying',true,true],['fert','mandor_fertilizer',true,true],['viewer','pengunjung',true,true],['stale','owner',true,false],['disabled','owner',false,true],['prod','owner',false,false]
].map(([key,role,enabled,claim])=>[key,Object.freeze({uid:'lab-'+key,email:key+'@qc-lab.example.test',password:'Synthetic-lab-only-'+key+'-2026',role,enabled,claim})])))
export async function createAuthLabClient(){
 guard()
 const {initializeApp,deleteApp}=await import('firebase/app')
 const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInWithEmailAndPassword,signOut}=await import('firebase/auth')
 const {initializeFirestore,connectFirestoreEmulator,doc,collection,query,where,limit,getDocsFromServer,getDocFromServer,setDoc,writeBatch,serverTimestamp,terminate}=await import('firebase/firestore')
 const app=initializeApp({projectId:demoProject,apiKey:'demo-only-not-a-real-key'},'auth-lab-'+randomUUID())
 let auth,db
 try{
  auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9199',{disableWarnings:true})
  db=initializeFirestore(app,{});connectFirestoreEmulator(db,'127.0.0.1',8185)
 }catch(e){await deleteApp(app);throw e}
 let closed=false,busy=false,selected=null
 async function run(fn){guard();if(closed)throw Error('LAB_CLOSED');if(busy)throw Error('LAB_BUSY');busy=true;try{return await fn()}finally{busy=false}}
 async function member(){
  const u=auth.currentUser
  if(!u||!selected||u.uid!==selected.uid)throw Error('LAB_LOGIN_REQUIRED')
  if((await u.getIdTokenResult()).claims.qcUat!==true)throw Error('LAB_CLAIM_REQUIRED')
  if(auth.currentUser!==u)throw Error('LAB_SESSION_CHANGED')
  return u.uid
 }
 const ref=(c,id)=>doc(db,...syntheticPath(c,id))
 return Object.freeze({
  signIn:key=>run(async()=>{selected=null;await signOut(auth);if(!Object.hasOwn(identities,key))throw Error('LAB_ACCOUNT_UNKNOWN');const a=identities[key];const {user}=await signInWithEmailAndPassword(auth,a.email,a.password);if(user.uid!==a.uid){await signOut(auth);throw Error('LAB_IDENTITY_MISMATCH')}selected=a;return {uid:user.uid,claim:(await user.getIdTokenResult()).claims.qcUat===true}}),
  signOut:()=>run(async()=>{selected=null;await signOut(auth)}),
  createPlan:(c,id,input)=>run(async()=>{const uid=await member();await setDoc(ref(c,id),planCreate(c,id,input,uid,serverTimestamp()));return id}),
  createQcPair:(id,input)=>run(async()=>{const uid=await member();const {qc,actual}=qcPair(id,input,uid,serverTimestamp());const batch=writeBatch(db);batch.set(ref('qc_records',id),qc);batch.set(ref('daily_reports',id),actual);await batch.commit();return id}),
  read:(c,id)=>run(async()=>{await member();const s=await getDocFromServer(ref(c,id));return s.exists()?{id:s.id,data:s.data()}:null}),
  list:(c,n=20)=>run(async()=>{await member();const s=await getDocsFromServer(query(collection(db,...syntheticCollection(c)),where('testOnly','==',true),limit(syntheticLimit(n))));return s.docs.map(d=>({id:d.id,data:d.data()}))}),
  close:async()=>{if(closed)return;await run(async()=>{closed=true;selected=null;try{await signOut(auth)}finally{try{await terminate(db)}finally{await deleteApp(app)}}})}
 })
}
