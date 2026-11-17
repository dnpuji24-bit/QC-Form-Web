import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import Panel from '../src/UatOwnerPermissionPanel'
import {ownerPermissionChange} from '../src/qcUatOwnerPermissionContract.mjs'
import {effectivePermissions,marker} from '../src/qcUatRolePermissions.mjs'
if(location.origin!=='http://127.0.0.1:4797')throw Error('OWNER_LAB_ORIGIN')
const rows=new Map()
for(const [uid,role,manual] of [['uat-owner','owner',{}],['uat-spray','mandor_spraying',{qc_records:'none'}],['uat-spray-b','mandor_spraying',{}],['uat-fert','mandor_fertilizer',{}]])rows.set(uid,{uid,...marker(role,{},manual),manualOverrides:manual,roleOverrides:{},policyRevision:0})
let actor='uat-owner',mode='normal',calls=[],audit=[]
const context=targetUid=>({actorUid:actor,claim:true,actor:rows.get(actor),target:rows.get(targetUid),actorProductionProfile:false,targetProductionProfile:false})
const adapter={
 async list(){if(actor!=='uat-owner'||!rows.get(actor).enabled)throw Error('OWNER_REQUIRED');return structuredClone([...rows.values()])},
 async patch(input){
  calls.push(structuredClone(input))
  const result=ownerPermissionChange(input,context(input.targetUid))
  if(mode==='fail')throw Error('FIXTURE_FAILURE')
  rows.set(input.targetUid,result.next);audit.push(result.audit)
  if(mode==='lost')throw Error('LOST_ACK')
  return structuredClone(result.next)
 }
}
function App(){
 const [current,setCurrent]=useState(actor)
 globalThis.ownerLab={snapshot:()=>structuredClone({rows:[...rows.values()],calls,audit}),setActor:uid=>{actor=uid;setCurrent(uid)},setMode:v=>{mode=v},externalChange:()=>{const r=rows.get('uat-spray');const result=ownerPermissionChange({targetUid:r.uid,expectedRevision:r.policyRevision,patch:{qc_spraying:'edit'}},context(r.uid));rows.set(r.uid,result.next);audit.push(result.audit)},disableOwner:()=>{rows.get('uat-owner').enabled=false}}
 return <Panel actorUid={current} isOwner={current==='uat-owner'} adapter={adapter}/>
}
createRoot(document.getElementById('root')).render(<App/>)
