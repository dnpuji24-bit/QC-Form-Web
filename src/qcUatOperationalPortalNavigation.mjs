// 11D.5c.4.1 — isolated UAT operational portal menu, aligned to PortalRouter.
// No Firebase SDK, localStorage, production import, navigation URL or trusted writes.
// This is a UI projection of fresh *server-confirmed* permissions; backend APIs
// must ALWAYS re-authorize operations, including after role revocation.
import {keys} from './qcUatRolePermissions.mjs'

const has=v=>v==='view'||v==='edit'
const exactSession=s=>s&&Object.getPrototypeOf(s)===Object.prototype&&
 typeof s.uid==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(s.uid)&&
 typeof s.role==='string'&&Number.isSafeInteger(s.policyRevision)&&
 s.policyRevision>=0&&s.permissions&&Object.getPrototypeOf(s.permissions)===Object.prototype&&
 Reflect.ownKeys(s.permissions).length===keys.length&&
 keys.every(k=>Object.hasOwn(s.permissions,k)&&['none','view','edit'].includes(s.permissions[k]))
export const operationalPortalAreas=Object.freeze([
 Object.freeze({id:'qc',label:'Form QC'}),
 Object.freeze({id:'data-unm',label:'Data UnM'}),
 Object.freeze({id:'summary',label:'Summary'}),
 Object.freeze({id:'calendar',label:'Calendar Rekap'}),
 Object.freeze({id:'users',label:'Users & Access'})
])
export function allowedUatOperationalAreas(session){
 if(!exactSession(session))return Object.freeze([])
 const p=session.permissions
 const qc=keys.some(k=>k.startsWith('qc_')&&has(p[k]))
 const data=keys.some(k=>k.startsWith('data_')&&has(p[k]))
 const summary=has(p.data_plan_summary)
 const calendar=summary||has(p.data_plan_daily)||has(p.data_plan_actual)
 const users=session.role==='owner'
 return Object.freeze(operationalPortalAreas.filter(a=>
  a.id==='qc'?qc:
  a.id==='data-unm'?data:
  a.id==='summary'?summary:
  a.id==='calendar'?calendar:users))
}
export function resolveUatOperationalArea(session,requested){
 if(requested==='home')return 'home'
 return allowedUatOperationalAreas(session).some(a=>a.id===requested)?requested:'home'
}
