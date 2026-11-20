// Custom role lifecycle contract for isolated UAT; immutable role ID and display name.
import {keys} from './qcUatRolePermissions.mjs'
import {isCustomRoleId,roleDefinition,validateCustomRole} from './qcUatCustomRoles.mjs'
const plain=v=>v!==null&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype
const exact=(v,fields)=>plain(v)&&Reflect.ownKeys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'))
const need=(ok,code)=>{if(!ok)throw Error(code)}
const uid=x=>typeof x==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(x)
const rev=n=>Number.isSafeInteger(n)&&n>=0&&n<999999
const members=v=>Array.isArray(v)&&v.length<=75&&v.every((x,i)=>exact(x,['uid','policyRevision'])&&uid(x.uid)&&rev(x.policyRevision)&&(i===0||v[i-1].uid<x.uid))
export function roleLifecyclePreview(input){
 need(exact(input,['roleId'])&&isCustomRoleId(input.roleId),'INVALID_ROLE_PREVIEW')
 return input
}
export function roleLifecycleUpdate(input){
 need(exact(input,['roleId','expectedRevision','permissions','expectedMembers'])&&isCustomRoleId(input.roleId)&&rev(input.expectedRevision)&&members(input.expectedMembers),'INVALID_ROLE_UPDATE')
 need(plain(input.permissions)&&Reflect.ownKeys(input.permissions).length===keys.length&&keys.every(k=>Object.hasOwn(input.permissions,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(input.permissions,k),'value')&&['none','view','edit'].includes(input.permissions[k])),'INVALID_ROLE_PERMISSIONS')
 return input
}
export function roleLifecycleDelete(input){
 need(exact(input,['roleId','expectedRevision','expectedMembers'])&&isCustomRoleId(input.roleId)&&rev(input.expectedRevision)&&Array.isArray(input.expectedMembers)&&input.expectedMembers.length===0,'INVALID_ROLE_DELETE')
 return input
}
export function roleLifecycleNext(old,input){
 const before=validateCustomRole(old),q=roleLifecycleUpdate(input)
 need(before.id===q.roleId&&before.revision===q.expectedRevision,'ROLE_REVISION_CONFLICT')
 const next={...roleDefinition({name:before.name,permissions:q.permissions}),revision:before.revision+1}
 need(keys.some(k=>before.permissions[k]!==next.permissions[k]),'ROLE_NO_CHANGE')
 return next
}
export function roleLifecycleMembers(actual,expected){
 need(members(expected)&&Array.isArray(actual)&&actual.length<=75,'ROLE_MEMBERS_LIMIT')
 const observed=actual.map(x=>({uid:x.uid,policyRevision:x.policyRevision})).sort((a,b)=>a.uid<b.uid?-1:a.uid>b.uid?1:0)
 need(members(observed),'INVALID_ROLE_MEMBERS')
 need(JSON.stringify(observed)===JSON.stringify(expected),'ROLE_MEMBERS_CONFLICT')
 return observed
}
export function roleLifecycleTombstone(definition,uidValue){
 const current=validateCustomRole(definition)
 need(uid(uidValue),'INVALID_ROLE_ACTOR')
 return {testOnly:true,workspace:'cutover',roleId:current.id,lastRevision:current.revision,definition:current,deletedBy:uidValue}
}
