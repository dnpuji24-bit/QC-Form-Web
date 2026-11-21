// 11D.5c.1 — isolated React portal shell, not imported by the production portal.
// Role preview/edit and Planning reads run over same-origin loopback-only HTTP.
import React,{useEffect,useMemo,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {initializeApp} from 'firebase/app'
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'firebase/auth'
import RoleLifecycle from '../src/UatRoleLifecyclePanel'
import UatUnifiedOperationalForm from '../src/UatUnifiedOperationalForm.jsx'
import UatUnifiedFullOperationalForm from '../src/UatUnifiedFullOperationalForm.jsx'
import {validateCustomRole} from '../src/qcUatCustomRoles.mjs'
import {validateSession} from '../src/qcUatSessionPermissions.mjs'
import {fullQcExecutionRequest,validateFullQcExecutionSource} from '../src/qcUatUnifiedCarryoverSelection.mjs'
if(location.origin!=='http://127.0.0.1:4797')throw Error('UNIFIED_BROWSER_ORIGIN')
const app=initializeApp({projectId:'demo-qc-uat-unified-role-planning',apiKey:'demo-only-not-a-real-key'})
const auth=initializeAuth(app,{persistence:inMemoryPersistence})
connectAuthEmulator(auth,'http://127.0.0.1:10099',{disableWarnings:true})
const fixtures=['uat-owner','uat-field','uat-viewer']
function adapterFor(user){
 async function call(group,path,body={}){
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  const token=await user.getIdToken()
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  const response=await fetch('/api/'+group+path,{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
   body:JSON.stringify(body),cache:'no-store',redirect:'error',credentials:'omit',
   signal:AbortSignal.timeout(path==='/uat/unified/qc/full/photo/commit'?45000:7000)
  })
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  if(!response.ok)throw Error('REQUEST_DENIED')
  const data=await response.json()
  if(auth.currentUser!==user)throw Error('IDENTITY_CHANGED')
  return data
 }
 const owner=(path,body)=>call('owner',path,body)
 const planning=(path,body)=>call('planning',path,body)
 return {
  isCurrent:u=>auth.currentUser===u,
  // Default OFF. A separate emulator-backed browser gate must explicitly enable this.
  // The browser pilot flag is injected ONLY by the dedicated emulator test bundle.
  // Ordinary builds have no flag, and their trusted HTTP route is disabled.
  photoCommitEnabled:typeof __QC_UAT_BROWSER_PHOTO_PILOT__!=='undefined'&&__QC_UAT_BROWSER_PHOTO_PILOT__===true,
  qcSource:async(formType,dailyPlanId)=>(await planning('/uat/unified/qc/source',{request:{formType,dailyPlanId}})).source,
  qcCommit:async(request)=>(await planning('/uat/unified/qc/commit',{request})).qc,
  fullQcSource:async(formType,dailyPlanId,selection={carryover:false,actualForemanId:''})=>{
   const scalar=(await planning('/uat/unified/qc/source',{request:{formType,dailyPlanId}})).source
   if(scalar?.readOnly!==true||scalar?.dailyPlanId!==dailyPlanId||scalar?.formType!==formType)throw Error('INVALID_SCALAR_SOURCE')
   const {request}=fullQcExecutionRequest(scalar,formType,selection)
   const source=(await planning('/uat/unified/qc/full/source',{request})).source
   return validateFullQcExecutionSource(source,scalar,formType,selection)
  },
  fullQcCommit:async(formType,request)=>{
   if(formType!==request.record?.formType||!['spray','fertilizer'].includes(formType))throw Error('FORM_KIND_DENIED')
   const route=formType==='spray'?'/uat/unified/qc/full/spray/commit':'/uat/unified/qc/full/fertilizer/commit'
   return (await planning(route,{request})).qc
  },
  fullQcPhotoCommit:async(formType,envelope)=>{
   if(formType!==envelope?.request?.record?.formType||!['spray','fertilizer'].includes(formType))throw Error('FORM_KIND_DENIED')
   return planning('/uat/unified/qc/full/photo/commit',envelope)
  },
  session:async()=>validateSession((await owner('/uat/session/permissions',{})).session,user.uid),
  read:async(scope,id)=>(await planning('/uat/unified/planning/read',{scope,id})).plan,
  lifecycle:{
   list:async()=>{
    const {roles}=await owner('/uat/owner/permissions/roles-list',{})
    if(!Array.isArray(roles)||roles.length>107)throw Error('INVALID_ROLE_LIST')
    return roles.filter(r=>r.kind==='custom').map(validateCustomRole)
   },
   preview:async roleId=>(await owner('/uat/owner/permissions/roles-preview',{roleId})).preview,
   update:async input=>(await owner('/uat/owner/permissions/roles-update',input)).update,
   retire:async input=>(await owner('/uat/owner/permissions/roles-delete',input)).deleted
  }
 }
}
function App(){
 const [user,setUser]=useState(null),[session,setSession]=useState(null)
 const [state,setState]=useState('signed-out'),[busy,setBusy]=useState(false)
 const [result,setResult]=useState('')
 const seq=useRef(0),identity=useRef(null),refreshRef=useRef(()=>{})
 useEffect(()=>{
  let active=true
  async function refresh(u){
   const ticket=++seq.current
   setSession(null);setResult('');setState(u?'loading':'signed-out')
   if(!u)return
   try{
    const valid=await adapterFor(u).session()
    if(active&&ticket===seq.current&&auth.currentUser===u){
     setSession(valid);setState('confirmed')
    }
   }catch{
    if(active&&ticket===seq.current&&auth.currentUser===u){
     setSession(null);setState('denied')
    }
   }
  }
  refreshRef.current=()=>void refresh(identity.current)
  const unsub=onAuthStateChanged(auth,u=>{
   identity.current=u;setUser(u);void refresh(u)
  })
  return()=>{active=false;seq.current++;unsub()}
 },[])
 const api=useMemo(()=>user?adapterFor(user):null,[user])
 async function login(uid){
  if(!fixtures.includes(uid))return
  setBusy(true)
  try{
   await signOut(auth)
   await signInWithEmailAndPassword(auth,uid+'@unified-ui.example.test','Synthetic-2026-'+uid)
  }catch{setSession(null);setState('login-failed')}
  finally{setBusy(false)}
 }
 async function read(scope,id){
  if(!user||!api||!session)return
  const current=user
  const ticket=seq.current
  setResult('loading')
  try{
   const item=await api.read(scope,id)
   if(ticket===seq.current&&auth.currentUser===current)setResult(scope+': '+item.id+' / '+(scope==='monthly'?item.area100:item.area100))
  }catch{
   if(ticket===seq.current&&auth.currentUser===current){setSession(null);setState('denied');setResult('request-denied')}
  }
 }
 const mode=key=>session?.permissions[key]??'none'
 const visible=key=>['view','edit'].includes(mode(key))
 const owner=!!session&&session.role==='owner'&&session.uid===user?.uid
 return <main>
  <h1>Unified QC & Planning Portal Shell — Demo UAT</h1>
  <p>Emulator only. QC source and receipt tests use synthetic records, without external photos or production hosting.</p>
  <p data-testid="actor">{user?.uid??'signed-out'}</p>
  <p data-testid="session-state">{state}</p>
  <p data-testid="role">{session?.role??'-'}</p>
  <p data-testid="revision">{session?.policyRevision??'-'}</p>
  {fixtures.map(uid=><button key={uid} disabled={busy} onClick={()=>void login(uid)}>Login {uid}</button>)}
  <button disabled={!user||busy} onClick={()=>void signOut(auth)}>Logout</button>
  <button disabled={!user||busy} onClick={()=>void refreshRef.current()}>Refresh permission</button>
  <nav aria-label="Menu berdasarkan permission server">
   {visible('data_plan_monthly')&&<section data-testid="menu-monthly">
    <strong>Monthly Plan · {mode('data_plan_monthly')}</strong>
    <button onClick={()=>void read('monthly','uat-m1')}>Baca Monthly UAT</button>
   </section>}
   {visible('data_plan_daily')&&<section data-testid="menu-daily">
    <strong>Daily Plan · {mode('data_plan_daily')}</strong>
    <button onClick={()=>void read('daily','uat-d1')}>Baca Daily UAT</button>
   </section>}
   {visible('data_plan_summary')&&<span data-testid="menu-summary">Summary · {mode('data_plan_summary')}</span>}
   {visible('data_plan_actual')&&<span data-testid="menu-actual">Actual · {mode('data_plan_actual')}</span>}
   {visible('qc_spraying')&&<span data-testid="menu-spray">QC Spray · {mode('qc_spraying')}</span>}
   {visible('qc_fertilizer')&&<span data-testid="menu-fertilizer">QC Fertilizer · {mode('qc_fertilizer')}</span>}
  </nav>
  <p data-testid="read-result">{result}</p>
  {user&&api&&mode('qc_spraying')==='edit'&&<UatUnifiedOperationalForm key={'spray-'+user.uid+'-'+session.policyRevision} user={user} kind="spray" api={api}/>}
  {user&&api&&mode('qc_spraying')==='edit'&&<UatUnifiedFullOperationalForm key={'full-spray-'+user.uid+'-'+session.policyRevision} user={user} kind="spray" api={api}/>}
  {user&&api&&mode('qc_fertilizer')==='edit'&&<UatUnifiedOperationalForm key={'fertilizer-'+user.uid+'-'+session.policyRevision} user={user} kind="fertilizer" api={api}/>}
  {user&&api&&mode('qc_fertilizer')==='edit'&&<UatUnifiedFullOperationalForm key={'full-fertilizer-'+user.uid+'-'+session.policyRevision} user={user} kind="fertilizer" api={api}/>} 
  {owner&&api&&<RoleLifecycle key={'owner-'+user.uid} adapter={api.lifecycle}/>}
 </main>
}
createRoot(document.getElementById('root')).render(<App/>)
