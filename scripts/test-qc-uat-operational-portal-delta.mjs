// 11D.5c.4.1 — minimal operational portal integration delta.
// No network, Firebase SDK, browser, Supabase secret or production writes.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {effectivePermissions,keys} from '../src/qcUatRolePermissions.mjs'
import {allowedUatOperationalAreas,resolveUatOperationalArea,operationalPortalAreas} from '../src/qcUatOperationalPortalNavigation.mjs'
const path=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const mk=(role,permissions)=>({uid:'uat-user',role,policyRevision:1,permissions})
const none=()=>Object.fromEntries(keys.map(k=>[k,'none']))
const ids=ses=>allowedUatOperationalAreas(ses).map(x=>x.id)
let n=0
const check=(label,fn)=>{fn();n++;console.log('PASS: '+label)}
check('portal chooser matches Owner, manager and mandor permissions without inferred grants',()=>{
 assert.deepEqual(ids(mk('owner',effectivePermissions('owner'))),['qc','data-unm','summary','calendar','users'])
 assert.deepEqual(ids(mk('manager',effectivePermissions('manager'))),['qc'])
 assert.deepEqual(ids(mk('mandor_spraying',effectivePermissions('mandor_spraying'))),['qc'])
 assert.equal(new Set(operationalPortalAreas.map(x=>x.id)).size,5)
})
check('custom Monthly-only, Daily-only, QC viewer and no-access users fail closed',()=>{
 const monthly=mk('custom-field-operations',{...none(),data_plan_monthly:'view'})
 const daily=mk('custom-field-operations',{...none(),data_plan_daily:'view'})
 const viewer=mk('pengunjung',effectivePermissions('pengunjung'))
 assert.deepEqual(ids(monthly),['data-unm'])
 assert.deepEqual(ids(daily),['data-unm','calendar'])
 assert.deepEqual(ids(viewer),['qc'])
 assert.deepEqual(ids(mk('custom-no-access',none())),[])
 assert.equal(resolveUatOperationalArea(monthly,'qc'),'home')
 assert.equal(resolveUatOperationalArea(monthly,'data-unm'),'data-unm')
 assert.equal(resolveUatOperationalArea(daily,'calendar'),'calendar')
 assert.equal(resolveUatOperationalArea(viewer,'users'),'home')
})
check('invalid/missing server session and production-bootstrap paths cannot enable test portal',()=>{
 const valid=mk('owner',effectivePermissions('owner'))
 assert.deepEqual(ids(null),[])
 assert.deepEqual(ids({...valid,permissions:{qc_spraying:'edit'}}),[])
 assert.deepEqual(ids({...valid,policyRevision:-1}),[])
 assert.deepEqual(ids({...valid,permissions:{...valid.permissions,qc_spraying:'administrator'}}),[])
 assert.equal(resolveUatOperationalArea(null,'users'),'home')
 for(const f of ['src/main.tsx','src/App.tsx','src/PortalRouter.tsx','server/qc-photo-access/index.mjs'])
  assert.doesNotMatch(path(f),/qcUatOperationalPortalNavigation|__QC_UAT_OPERATIONAL_PORTAL__|uat-unified-portal-lab/)
 assert.match(path('uat-unified-portal-lab/main.jsx'),/typeof __QC_UAT_OPERATIONAL_PORTAL__!=='undefined'/)
 assert.doesNotMatch(path('src/qcUatOperationalPortalNavigation.mjs'),/firebase\/|localStorage|sessionStorage|@supabase/)
})
console.log('SUCCESS: '+n+' isolated operational portal permission and route contracts passed (OFFLINE)')
