// Isolated real Firebase Auth Emulator browser; not a production entrypoint.
import React,{useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {initializeApp} from 'firebase/app'
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'firebase/auth'
import Panel from '../src/UatOwnerPermissionPanel'
import AddRole from '../src/UatAddRolePanel'
import {validateCustomRole,builtinRoles} from '../src/qcUatCustomRoles.mjs'
import {createUatSession,validateSession} from '../src/qcUatSessionPermissions.mjs'
import {keys} from '../src/qcUatRolePermissions.mjs'
if(location.origin!=='http://127.0.0.1:4497')throw Error('SESSION_LAB_ORIGIN')
const auth=initializeAuth(initializeApp({projectId:'demo-qc-uat-owner-http',apiKey:'demo-only-not-a-real-key'}),{persistence:inMemoryPersistence})
connectAuthEmulator(auth,'http://127.0.0.1:10299',{disableWarnings:true})
const request=(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(5000)})
const session=createUatSession({currentUser:()=>auth.currentUser,request})
const fixtureUsers=['uat-owner','uat-spray','uat-spray-b','uat-fert']
function ownerAdapter(user){
 async function call(path,body){
  if(!user||auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  const token=await user.getIdToken()
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  const response=await request('/uat/owner/permissions/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),cache:'no-store',redirect:'error'})
  if(!response.ok||auth.currentUser!==user)throw Error('OWNER_REQUEST_DENIED')
  const result=await response.json()
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  return result
 }
 function row(value){
  validateSession({uid:value.uid,role:value.role,policyRevision:value.policyRevision,permissions:value.permissions},value.uid)
  if(value.role==='owner'||value.uid===user.uid||typeof value.enabled!=='boolean'||!value.manualOverrides||Object.getPrototypeOf(value.manualOverrides)!==Object.prototype||Object.entries(value.manualOverrides).some(([k,v])=>!keys.includes(k)||!['none','view','edit'].includes(v)))throw Error('INVALID_OWNER_ROW')
  return value
 }
 return {list:async()=>{const {rows}=await call('list',{});if(!Array.isArray(rows)||rows.length>100||new Set(rows.map(r=>r.uid)).size!==rows.length)throw Error('INVALID_ROWS');return rows.map(row)},patch:async input=>row((await call('patch',input)).row),roles:{
  list:async()=>{const {roles}=await call('roles-list',{});if(!Array.isArray(roles)||roles.length>107||new Set(roles.map(r=>r.id)).size!==roles.length)throw Error('INVALID_ROLES');const built=builtinRoles();return roles.map(r=>r.kind==='custom'?validateCustomRole(r):built.find(x=>x.id===r.id)??(()=>{throw Error('UNKNOWN_BUILTIN')})())},
  create:async input=>validateCustomRole((await call('roles-create',input)).role)
 }}
}
function App(){
 const [user,setUser]=useState(null),[confirmed,setConfirmed]=useState(null),[pending,setPending]=useState(false),[status,setStatus]=useState('signed-out'),[loginBusy,setLoginBusy]=useState(false)
 const active=useRef(null),serial=useRef(0),adapterRef=useRef(null)
 const refreshRef=useRef(()=>{})
 useEffect(()=>{
  let live=true,timer=null,inflight=false
  function schedule(u){
   clearTimeout(timer)
   if(live&&u&&active.current===u)timer=setTimeout(()=>void refresh(),u.uid==='uat-owner'?10000:1500)
  }
  async function refresh(){
   const u=active.current
   if(!live||!u||inflight)return
   const epoch=serial.current
   inflight=true;clearTimeout(timer);setPending(true)
   try{
    const value=await session.refresh()
    if(!live||epoch!==serial.current||active.current!==u||auth.currentUser!==u)return
    setConfirmed(value);setStatus(value?'confirmed':'denied')
   }finally{
    if(live&&epoch===serial.current){inflight=false;setPending(false);schedule(u)}
   }
  }
  refreshRef.current=refresh
  const unsub=onAuthStateChanged(auth,u=>{
   serial.current++;clearTimeout(timer);inflight=false;active.current=u;session.reset();adapterRef.current=u?ownerAdapter(u):null
   setUser(u);setConfirmed(null);setPending(false);setStatus(u?'loading':'signed-out')
   if(u)void refresh()
  })
  const focus=()=>void refresh()
  const visibility=()=>{if(document.visibilityState==='visible')void refresh()}
  const offline=()=>{serial.current++;clearTimeout(timer);inflight=false;session.reset();setConfirmed(null);setPending(false);setStatus(active.current?'denied':'signed-out');schedule(active.current)}
  window.addEventListener('focus',focus);window.addEventListener('online',focus);window.addEventListener('offline',offline);document.addEventListener('visibilitychange',visibility)
  return()=>{live=false;serial.current++;clearTimeout(timer);unsub();session.reset();window.removeEventListener('focus',focus);window.removeEventListener('online',focus);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',visibility)}
 },[])
 async function login(uid){
  setLoginBusy(true)
  try{await signOut(auth);await signInWithEmailAndPassword(auth,uid+'@owner-browser.example.test','Synthetic-only-2026-'+uid)}
  catch{setStatus('login-failed')}finally{setLoginBusy(false)}
 }
 const current=confirmed&&user&&confirmed.uid===user.uid?confirmed:null
 const owner=current?.role==='owner'
 const visible=pending?null:current
 return <main>
  <h1>UAT Session Lifecycle</h1>
  <p data-testid="identity">{user?.uid??'signed-out'}</p>
  <p data-testid="session-state">{pending?'loading':status}</p>
  <output data-testid="session-revision">{visible?.policyRevision??'-'}</output>
  {fixtureUsers.map(uid=><button key={uid} disabled={loginBusy} onClick={()=>void login(uid)}>Login {uid}</button>)}
  <button disabled={!user||loginBusy} onClick={()=>void signOut(auth)}>Logout</button>
  <button disabled={!user||pending} onClick={()=>void refreshRef.current()}>Refresh session</button>
  {['qc_spraying','qc_fertilizer','qc_records'].map(k=><p key={k} data-testid={'mode-'+k}>{visible?.permissions[k]??'none'}</p>)}
  {visible&&visible.permissions.qc_spraying!=='none'&&<section aria-label="Spray menu"><button disabled={visible.permissions.qc_spraying!=='edit'}>Simulasi simpan Spray</button></section>}
  {visible&&visible.permissions.qc_fertilizer!=='none'&&<section aria-label="Fertilizer menu"><button disabled={visible.permissions.qc_fertilizer!=='edit'}>Simulasi simpan Fertilizer</button></section>}
  {owner&&<div hidden={pending}><Panel key={user.uid} actorUid={user.uid} isOwner={true} adapter={adapterRef.current}/><AddRole key={'roles-'+user.uid} adapter={adapterRef.current.roles}/></div>}
 </main>
}
createRoot(document.getElementById('root')).render(<App/>)
