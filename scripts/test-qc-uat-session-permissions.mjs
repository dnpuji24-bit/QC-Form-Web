import assert from 'node:assert/strict'
import {effectivePermissions} from '../src/qcUatRolePermissions.mjs'
import {createUatSession} from '../src/qcUatSessionPermissions.mjs'
const a={uid:'uat-spray',getIdToken:async()=> 'synthetic-a'},b={uid:'uat-fert',getIdToken:async()=> 'synthetic-b'}
let current=a,revision=0,mode='edit',failure=false
const payload=(user=a,r=revision,m=mode)=>({uid:user.uid,role:user===a?'mandor_spraying':'mandor_fertilizer',policyRevision:r,permissions:effectivePermissions(user===a?'mandor_spraying':'mandor_fertilizer',{},user===a?{qc_spraying:m,qc_records:'none'}:{})})
const response=session=>({ok:true,json:async()=>({session})})
let request=async(url,opts)=>{assert.equal(url,'http://127.0.0.1:4497/uat/session/permissions');assert.equal(opts.body,'{}');assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer '+await current.getIdToken());if(failure)throw Error('offline');return response(payload(current))}
const session=createUatSession({currentUser:()=>current,request:(...args)=>request(...args)})
let n=0
const check=async(name,fn)=>{await fn();n++;console.log('PASS: '+name)}
await check('before hydration no default grants',async()=>assert.equal(session.access('qc_spraying'),'none'))
await check('effective permissions exact; manual none preserved',async()=>{await session.refresh();assert.equal(session.canEdit('qc_spraying'),true);assert.equal(session.canView('qc_records'),false)})
await check('refresh applies view and none without cached edit',async()=>{revision++;mode='view';const pending=session.refresh();assert.equal(session.canEdit('qc_spraying'),false);await pending;assert.equal(session.canView('qc_spraying'),true);assert.equal(session.canEdit('qc_spraying'),false);revision++;mode='none';await session.refresh();assert.equal(session.canView('qc_spraying'),false)})
await check('network failure clears access without role fallback',async()=>{failure=true;await session.refresh();assert.equal(session.snapshot(),null);failure=false})
await check('missing permission and foreign UID rejected',async()=>{const old=request;try{request=async()=>response({...payload(),permissions:{qc_spraying:'edit'}});assert.equal(await session.refresh(),null);request=async()=>response(payload(b));assert.equal(await session.refresh(),null)}finally{request=old}})
await check('older revision cannot restore edit',async()=>{const old=request;try{request=async()=>response(payload(a,0,'edit'));assert.equal(await session.refresh(),null);assert.equal(session.canEdit('qc_spraying'),false)}finally{request=old}})
await check('delayed old response cannot override newer refresh',async()=>{const old=request;let release,entered;const started=new Promise(r=>entered=r);try{request=()=>new Promise(r=>{release=r;entered()});const pending=session.refresh();await started;request=old;revision++;mode='view';await session.refresh();release(response(payload(a,0,'edit')));await pending;assert.equal(session.access('qc_spraying'),'view')}finally{request=old}})
await check('account switch and signout discard pending response',async()=>{const old=request;let release,entered;const started=new Promise(r=>entered=r);try{request=()=>new Promise(r=>{release=r;entered()});const pending=session.refresh();await started;current=b;session.reset();request=old;await session.refresh();release(response(payload(a)));await pending;assert.equal(session.snapshot().uid,b.uid);assert.equal(session.canEdit('qc_fertilizer'),true);assert.equal(session.canEdit('qc_spraying'),false);current=null;session.reset();assert.equal(session.snapshot(),null)}finally{request=old}})
console.log('SUCCESS: '+n+' isolated session effective permission checks (offline)')
