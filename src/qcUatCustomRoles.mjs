// Isolated custom-role catalog. Catalog creation alone is not an authority grant.
import {keys,roles,effectivePermissions} from './qcUatRolePermissions.mjs'
const plain=v=>!!v&&Object.getPrototypeOf(v)===Object.prototype
const exact=(v,k)=>plain(v)&&Reflect.ownKeys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x))
const need=(ok,code)=>{if(!ok)throw Error(code)}
const slug=s=>s.toLowerCase().replace(/[-_ ]+/g,'-')
const reserved=new Set([...roles.map(slug),'system','super-admin','superadmin','administrator','root'])
export function roleDefinition(input){
 need(exact(input,['name','permissions']),'INVALID_ROLE_REQUEST')
 need(typeof input.name==='string','INVALID_ROLE_NAME')
 const name=input.name.trim().replace(/ +/g,' ')
 need(/^[A-Za-z][A-Za-z0-9 _-]{2,49}$/.test(name),'INVALID_ROLE_NAME')
 const canonical=slug(name)
 need(!reserved.has(canonical)&&!canonical.startsWith('custom-')&&!canonical.startsWith('owner-')&&!canonical.endsWith('-owner'),'RESERVED_ROLE')
 need(plain(input.permissions),'INVALID_ROLE_PERMISSIONS')
 const permissions=Object.fromEntries(keys.map(k=>[k,'none']))
 for(const key of Reflect.ownKeys(input.permissions)){
  need(typeof key==='string'&&keys.includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(input.permissions,key),'value'),'UNKNOWN_PERMISSION')
  const mode=input.permissions[key];need(['none','view','edit'].includes(mode),'INVALID_MODE');permissions[key]=mode
 }
 return {id:'custom-'+canonical,name,permissions,kind:'custom',revision:0}
}
export function builtinRoles(){return roles.map(id=>({id,name:id,kind:'builtin',revision:0,permissions:effectivePermissions(id)}))}
export function validateCustomRole(value){
 need(exact(value,['id','name','permissions','kind','revision']),'INVALID_ROLE_RECORD')
 const expected=roleDefinition({name:value.name,permissions:value.permissions})
 need(value.id===expected.id&&value.name===expected.name&&value.kind==='custom'&&value.revision===0&&Object.keys(value.permissions).length===keys.length,'INVALID_ROLE_RECORD')
 return expected
}

export const isCustomRoleId=id=>typeof id==='string'&&/^custom-[a-z][a-z0-9-]{0,49}$/.test(id)
export const isRoleId=id=>roles.includes(id)||isCustomRoleId(id)
// Custom defaults replace the entire old role baseline; explicit user overrides win.
export function permissionsForIdentity(m,definition){
 if(!isCustomRoleId(m.role)){
  need(definition===undefined,'UNEXPECTED_ROLE_DEFINITION')
  return effectivePermissions(m.role,m.roleOverrides,m.manualOverrides)
 }
 const r=validateCustomRole(definition)
 need(r.id===m.role,'ROLE_DEFINITION_MISMATCH')
 need(plain(m.roleOverrides)&&Reflect.ownKeys(m.roleOverrides).length===0,'CUSTOM_ROLE_OVERRIDES_DENIED')
 return effectivePermissions('pengunjung',r.permissions,m.manualOverrides)
}
export function assignIdentityRole(m,id,definition){
 need(plain(m)&&m.testOnly===true&&m.workspace==='cutover'&&m.enabled===true&&isRoleId(m.role)&&m.role!=='owner','TARGET_NOT_ELIGIBLE')
 need(isRoleId(id)&&id!=='owner','INVALID_ASSIGNMENT_ROLE')
 need(id!==m.role,'ROLE_ALREADY_ASSIGNED')
 need(Number.isSafeInteger(m.policyRevision)&&m.policyRevision>=0&&m.policyRevision<999999,'INVALID_POLICY_REVISION')
 const next={...m,role:id,roleOverrides:{},policyRevision:m.policyRevision+1}
 return {...next,permissions:permissionsForIdentity(next,definition)}
}
