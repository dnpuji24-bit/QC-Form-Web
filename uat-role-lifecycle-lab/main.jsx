// Real Firebase Auth emulator only; isolated from the live portal.
import React,{useEffect,useMemo,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {initializeApp} from 'firebase/app'
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'firebase/auth'
import RoleLifecycle from '../src/UatRoleLifecyclePanel'
import {validateCustomRole} from '../src/qcUatCustomRoles.mjs'
import {validateSession} from '../src/qcUatSessionPermissions.mjs'
if(location.origin!=='http://127.0.0.1:4497')throw Error('ROLE_LIFECYCLE_LAB_ORIGIN')
const app=initializeApp({projectId:'demo-qc-uat-owner-http',apiKey:'demo-only-not-a-real-key'})
const auth=initializeAuth(app,{persistence:inMemoryPersistence})
connectAuthEmulator(auth,'http://127.0.0.1:10299',{disableWarnings:true})
const fixtureUsers=['uat-owner','uat-member-a','uat-member-b','uat-viewer']
function adapterFor(user){
 async function call(path,body={}){
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  const token=await user.getIdToken()
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),cache:'no-store',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(7000)})
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  if(!response.ok)throw Error('REQUEST_DENIED')
  const data=await response.json()
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  return data
 }
 return {
  session:async()=>validateSession((await call('/uat/session/permissions',{})).session,user.uid),
  lifecycle:{
   list:async()=>{
    const {roles}=await call('/uat/owner/permissions/roles-list',{})
    if(!Array.isArray(roles)||roles.length>107)throw Error('INVALID_ROLE_LIST')
    return roles.filter(r=>r.kind==='custom').map(validateCustomRole)
   },
   preview:async roleId=>(await call('/uat/owner/permissions/roles-preview',{roleId})).preview,
   update:async input=>(await call('/uat/owner/permissions/roles-update',input)).update,
   retire:async input=>(await call('/uat/owner/permissions/roles-delete',input)).deleted
  }
 }
}
function App(){
 const [user,setUser]=useState(null),[session,setSession]=useState(null),[state,setState]=useState('signed-out'),[busy,setBusy]=useState(false)
 const serial=useRef(0),current=useRef(null),refreshRef=useRef(()=>{})
 useEffect(()=>{
  let live=true
  async function refresh(u){
   const ticket=++serial.current
   setSession(null);setState(u?'loading':'signed-out')
   if(!u)return
   try{
    const valid=await adapterFor(u).session()
    if(live&&ticket===serial.current&&auth.currentUser===u){setSession(valid);setState('confirmed')}
   }catch{
    if(live&&ticket===serial.current&&auth.currentUser===u){setSession(null);setState('denied')}
   }
  }
  refreshRef.current=()=>void refresh(current.current)
  const unsub=onAuthStateChanged(auth,u=>{current.current=u;setUser(u);void refresh(u)})
  return()=>{live=false;serial.current++;unsub()}
 },[])
 const adapter=useMemo(()=>user?adapterFor(user):null,[user])
 async function login(uid){
  if(!fixtureUsers.includes(uid))return
  setBusy(true)
  try{
   await signOut(auth)
   await signInWithEmailAndPassword(auth,uid+'@role-ui.example.test','Synthetic-2026-'+uid)
  }catch{setSession(null);setState('login-failed')}finally{setBusy(false)}
 }
 const owner=session?.role==='owner'&&session.uid===user?.uid
 return <main>
  <h1>Owner Custom Role Lifecycle — UAT</h1>
  <p>Synthetic Firestore and Firebase Auth Emulator only. No production connection.</p>
  <p data-testid="actor">{user?.uid??'signed-out'}</p>
  <p data-testid="session-state">{state}</p>
  <p data-testid="session-role">{session?.role??'-'}</p>
  <p data-testid="summary-mode">{session?.permissions.data_plan_summary??'none'}</p>
  <p data-testid="qc-record-mode">{session?.permissions.qc_records??'none'}</p>
  {fixtureUsers.map(uid=><button key={uid} disabled={busy} onClick={()=>void login(uid)}>Login {uid}</button>)}
  <button disabled={!user||busy} onClick={()=>void signOut(auth)}>Logout</button>
  <button disabled={!user||busy} onClick={()=>void refreshRef.current()}>Refresh session</button>
  {owner&&adapter&&<RoleLifecycle key={'owner-'+user.uid} adapter={adapter.lifecycle}/>}
 </main>
}
createRoot(document.getElementById('root')).render(<App/>)
