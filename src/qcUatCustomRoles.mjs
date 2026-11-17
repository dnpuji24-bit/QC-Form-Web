// Isolated custom-role catalog. Creation is not assignment or an authority grant.
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
