// Isolated session candidate, not imported by the production portal.
// Current identity must be a Firebase User object; change/reset on every auth event.
import {keys} from './qcUatRolePermissions.mjs'
import {isRoleId} from './qcUatCustomRoles.mjs'
const origin='http://127.0.0.1:4497'
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const plain=v=>!!v&&Object.getPrototypeOf(v)===Object.prototype
export function validateSession(value,uid){
 if(!plain(value)||Object.keys(value).length!==4||value.uid!==uid||!sid(uid)||!isRoleId(value.role)||!Number.isSafeInteger(value.policyRevision)||value.policyRevision<0||value.policyRevision>=1000000||!plain(value.permissions)||Object.keys(value.permissions).length!==keys.length||!keys.every(k=>Object.hasOwn(value.permissions,k)&&['none','view','edit'].includes(value.permissions[k])))throw Error('INVALID_SESSION')
 return Object.freeze({uid,role:value.role,policyRevision:value.policyRevision,permissions:Object.freeze({...value.permissions})})
}
export function createUatSession({currentUser,request=globalThis.fetch,notify=()=>{}}){
 let generation=0,identity=null,state=null,highest=-1
 const publish=v=>{state=v;notify(v)}
 function reset(){generation++;identity=currentUser();highest=-1;publish(null)}
 function snapshot(){return identity&&identity===currentUser()?state:null}
 async function refresh(){
  const user=currentUser()
  if(user!==identity)reset()
  const ticket=++generation
  publish(null)
  if(!user||!sid(user.uid))return null
  const valid=()=>ticket===generation&&identity===user&&currentUser()===user
  try{
   const token=await user.getIdToken()
   if(!valid())return null
   const response=await request(origin+'/uat/session/permissions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}',cache:'no-store',redirect:'error'})
   if(!valid())return null
   if(!response.ok)throw Error('SESSION_DENIED')
   const data=await response.json()
   if(!valid())return null
   const next=validateSession(data.session,user.uid)
   if(next.policyRevision<highest)throw Error('STALE_SESSION')
   highest=next.policyRevision;publish(next);return next
  }catch{if(valid())publish(null);return null}
 }
 const access=key=>snapshot()?.permissions[key]??'none'
 return {reset,refresh,snapshot,access,canView:key=>['view','edit'].includes(access(key)),canEdit:key=>access(key)==='edit'}
}
