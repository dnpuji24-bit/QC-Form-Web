// Real Firebase Auth Emulator session in dedicated memory-only UAT browser lab.
import React,{useEffect,useMemo,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {initializeApp} from 'firebase/app'
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'firebase/auth'
import RegistrationPanel from '../src/UatCustomRoleRegistrationPanel'
import OwnerApprovalPanel from '../src/UatCustomRoleApprovalPanel'
import {validateSession} from '../src/qcUatSessionPermissions.mjs'
if(location.origin!=='http://127.0.0.1:4497')throw Error('CUSTOM_ROLE_LAB_ORIGIN')
const app=initializeApp({projectId:'demo-qc-uat-owner-http',apiKey:'demo-only-not-a-real-key'})
const auth=initializeAuth(app,{persistence:inMemoryPersistence})
connectAuthEmulator(auth,'http://127.0.0.1:10299',{disableWarnings:true})
const allowedUsers=['uat-owner','uat-applicant','uat-reject','uat-viewer']
function adapterFor(user){
 async function call(path,body={}){
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  const token=await user.getIdToken()
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),cache:'no-store',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(7000)})
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  if(!res.ok)throw Error('REQUEST_DENIED')
  const data=await res.json()
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  return data
 }
 return {
  session:async()=>validateSession((await call('/uat/session/permissions',{})).session,user.uid),
  applicant:{
   status:async()=>(await call('/uat/registration/status',{})).registration,
   roles:async()=>(await call('/uat/registration/custom-roles',{})).roles,
   submit:async requestedRoleId=>(await call('/uat/registration/submit',{requestedRoleId})).registration,
   activate:async()=>(await call('/uat/registration/activate',{expectedRevision:1})).session
  },
  owner:{
   inbox:async()=>(await call('/uat/owner/registration/inbox',{})).rows,
   roles:async()=>(await call('/uat/owner/permissions/roles-list',{})).roles.filter(r=>r.kind==='custom').map(r=>({id:r.id,name:r.name})),
   review:async input=>(await call('/uat/owner/registration/review',input)).registration
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
   setSession(null)
   setState(u?'loading':'signed-out')
   if(!u)return
   try{
    const value=await adapterFor(u).session()
    if(live&&ticket===serial.current&&auth.currentUser===u){setSession(value);setState('confirmed')}
   }catch{
    if(live&&ticket===serial.current&&auth.currentUser===u){setSession(null);setState('denied')}
   }
  }
  refreshRef.current=()=>void refresh(current.current)
  const unsub=onAuthStateChanged(auth,u=>{current.current=u;setUser(u);void refresh(u)})
  // Do not unmount a pending approval on unrelated tab focus; manual refresh is explicit.
  return()=>{live=false;serial.current++;unsub()}
 },[])
 const adapters=useMemo(()=>user?adapterFor(user):null,[user])
 async function login(uid){
  if(!allowedUsers.includes(uid))return
  setBusy(true)
  try{
   await signOut(auth)
   await signInWithEmailAndPassword(auth,uid+'@registration-ui.example.test','Synthetic-2026-'+uid)
  }catch{setSession(null);setState('login-failed')}finally{setBusy(false)}
 }
 const owner=session?.role==='owner'&&session.uid===user?.uid
 return <main>
  <h1>Custom Role Registration — UAT</h1><p>Synthetic Firebase Auth Emulator · No production access</p>
  <p data-testid="actor">{user?.uid??'signed-out'}</p>
  <p data-testid="session-state">{state}</p>
  <p data-testid="session-role">{session?.role??'-'}</p>
  {allowedUsers.map(uid=><button key={uid} disabled={busy} onClick={()=>void login(uid)}>Login {uid}</button>)}
  <button disabled={busy||!user} onClick={()=>void signOut(auth)}>Logout</button>
  <button disabled={busy||!user} onClick={()=>void refreshRef.current()}>Refresh session</button>
  {user&&state!=='loading'&&adapters&&(owner?
    <OwnerApprovalPanel key={'owner-'+user.uid} adapter={adapters.owner}/>:
    <RegistrationPanel key={'applicant-'+user.uid} actorUid={user.uid} adapter={adapters.applicant}/>)}
  {session&&<p data-testid="summary-mode">Summary permission: {session.permissions.data_plan_summary}</p>}
 </main>
}
createRoot(document.getElementById('root')).render(<App/>)
