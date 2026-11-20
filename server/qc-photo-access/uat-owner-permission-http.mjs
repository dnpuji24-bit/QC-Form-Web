// Dedicated demo only. Never mount in production HTTP service.
import {createServer} from 'node:http'
import {createRoleLifecycleService} from './uat-role-lifecycle-service.mjs'
import {ownerPermissionChange} from '../../src/qcUatOwnerPermissionContract.mjs'
import {registrationSubmit,registrationReview,registrationActivate,registrationPending,registrationDecide,registrationComplete,verifyRegistrationRow} from '../../src/qcUatCustomRoleRegistration.mjs'
import {roleDefinition,builtinRoles,validateCustomRole,isRoleId,isCustomRoleId,permissionsForIdentity,assignIdentityRole} from '../../src/qcUatCustomRoles.mjs'
export const projectId='demo-qc-uat-owner-http',host='127.0.0.1',firestorePort=9485,authPort=10299,httpPort=4497
export const origin='http://'+host+':'+httpPort
export const paths=Object.freeze({list:'/uat/owner/permissions/list',patch:'/uat/owner/permissions/patch',session:'/uat/session/permissions',rolesList:'/uat/owner/permissions/roles-list',rolesCreate:'/uat/owner/permissions/roles-create',rolesAssign:'/uat/owner/permissions/roles-assign',registrationRoles:'/uat/registration/custom-roles',registrationSubmit:'/uat/registration/submit',registrationStatus:'/uat/registration/status',registrationReview:'/uat/owner/registration/review',registrationActivate:'/uat/registration/activate',registrationInbox:'/uat/owner/registration/inbox',rolesPreview:'/uat/owner/permissions/roles-preview',rolesUpdate:'/uat/owner/permissions/roles-update',rolesDelete:'/uat/owner/permissions/roles-delete'})
const prefix='qc_uat_workspaces/cutover'
const sid=v=>typeof v==='string'&&/^uat-[a-z0-9-]{1,60}$/.test(v)
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
function fail(status,code){throw Object.assign(Error(code),{status})}
export function guard(e=process.env){
 if(e.GCLOUD_PROJECT!==projectId||e.FIRESTORE_EMULATOR_HOST!==host+':'+firestorePort||e.FIREBASE_AUTH_EMULATOR_HOST!==host+':'+authPort)throw Error('DEMO_EMULATORS_REQUIRED')
 for(const key of ['GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(e[key]&&e[key]!==projectId)throw Error('WRONG_PROJECT')
}
function ownerAllowed(token,m,profile){
 return sid(token.uid)&&token.qcUat===true&&m?.testOnly===true&&m.workspace==='cutover'&&m.enabled===true&&m.role==='owner'&&!profile
}
function row(uid,m,allowOwner=false,definition){
 if(!sid(uid)||m?.testOnly!==true||m.workspace!=='cutover'||!isRoleId(m.role)||(!allowOwner&&m.role==='owner')||typeof m.enabled!=='boolean'||!Number.isSafeInteger(m.policyRevision)||m.policyRevision<0||m.policyRevision>=1000000)fail(409,'INVALID_MARKER')
 let permissions;try{permissions=permissionsForIdentity(m,definition)}catch{fail(409,'INVALID_MARKER')}
 if(!m.permissions||Object.keys(permissions).length!==Object.keys(m.permissions).length||Object.entries(permissions).some(([k,v])=>m.permissions[k]!==v))fail(409,'INVALID_MARKER')
 return {uid,role:m.role,enabled:m.enabled,policyRevision:m.policyRevision,manualOverrides:m.manualOverrides,permissions}
}
export function createOwnerService({adb,authAdmin}){
 guard()
 const mark=uid=>adb.doc('qc_uat_identities/'+uid),profile=uid=>adb.doc('users/'+uid)
 async function tokenFor(raw){
  guard()
  let token;try{token=await authAdmin.verifyIdToken(raw,true)}catch{fail(401,'INVALID_TOKEN')}
  if(!sid(token.uid)||token.qcUat!==true)fail(403,'OWNER_REQUIRED')
  return token
 }
 const catalog=adb.collection(prefix+'/role_catalog'),roleAudit=adb.collection(prefix+'/role_catalog_audit'),retired=adb.collection(prefix+'/role_tombstones')
 const registration=adb.collection(prefix+'/registration_requests'),registrationAudit=adb.collection(prefix+'/registration_audit')
 async function definitionFor(tx,id){
  if(!isCustomRoleId(id))return undefined
  const snapshot=await tx.get(catalog.doc(id)),r=snapshot.data()
  if(!r||r.testOnly!==true||r.workspace!=='cutover'||r.definition?.id!==id)fail(409,'ROLE_NOT_FOUND')
  try{return validateCustomRole(r.definition)}catch{fail(409,'INVALID_ROLE_RECORD')}
 }
 return {
  ...createRoleLifecycleService({adb,tokenFor,ownerAllowed,row,definitionFor,fail,mark,profile,catalog,roleAudit,registration,prefix}),
  async registrationInbox(raw){
   const token=await tokenFor(raw)
   return adb.runTransaction(async tx=>{
    const [actor,prod]=await Promise.all([tx.get(mark(token.uid)),tx.get(profile(token.uid))])
    if(!ownerAllowed(token,actor.data(),prod.exists))fail(403,'OWNER_REQUIRED')
    const list=await tx.get(registration.limit(101))
    if(list.size>100)fail(409,'REGISTRATION_LIST_LIMIT')
    return list.docs.map(d=>verifyRegistrationRow(d.data(),d.id))
   })
  },
  async availableCustomRoles(raw){
   const token=await tokenFor(raw)
   return adb.runTransaction(async tx=>{
    const [m,prod]=await Promise.all([tx.get(mark(token.uid)),tx.get(profile(token.uid))])
    if(prod.exists||m.exists)fail(403,'REGISTRATION_NOT_ELIGIBLE')
    const s=await tx.get(catalog.limit(101))
    if(s.size>100)fail(409,'ROLE_LIST_LIMIT')
    return s.docs.map(d=>{
     const r=d.data()
     if(r.testOnly!==true||r.workspace!=='cutover'||d.id!==r.definition?.id)fail(409,'INVALID_ROLE_RECORD')
     let def;try{def=validateCustomRole(r.definition)}catch{fail(409,'INVALID_ROLE_RECORD')}
     return {id:def.id,name:def.name}
    })
   })
  },
  async submitRegistration(raw,input){
   const token=await tokenFor(raw)
   if(token.email_verified!==true)fail(403,'EMAIL_VERIFICATION_REQUIRED')
   let q;try{q=registrationSubmit(input)}catch(e){fail(400,e.message)}
   return adb.runTransaction(async tx=>{
    const [identity,prod,request]=await Promise.all([tx.get(mark(token.uid)),tx.get(profile(token.uid)),tx.get(registration.doc(token.uid))])
    if(identity.exists||prod.exists)fail(403,'REGISTRATION_NOT_ELIGIBLE')
    if(request.exists)fail(409,'REGISTRATION_ALREADY_SUBMITTED')
    await definitionFor(tx,q.requestedRoleId)
    const row=registrationPending(token.uid,q)
    tx.create(registration.doc(token.uid),row)
    tx.create(registrationAudit.doc(token.uid+':0'),{testOnly:true,workspace:'cutover',uid:token.uid,action:'submit',revision:0,before:null,after:row})
    return row
   })
  },
  async registrationStatus(raw){
   const token=await tokenFor(raw)
   return adb.runTransaction(async tx=>{
    const [request,prod]=await Promise.all([tx.get(registration.doc(token.uid)),tx.get(profile(token.uid))])
    if(prod.exists)fail(403,'REGISTRATION_NOT_ELIGIBLE')
    return request.exists?verifyRegistrationRow(request.data(),token.uid):null
   })
  },
  async reviewRegistration(raw,input){
   const token=await tokenFor(raw)
   let q;try{q=registrationReview(input)}catch(e){fail(400,e.message)}
   return adb.runTransaction(async tx=>{
    const [actor,actorProd,target,targetProd,request]=await Promise.all([
     tx.get(mark(token.uid)),tx.get(profile(token.uid)),tx.get(mark(q.targetUid)),
     tx.get(profile(q.targetUid)),tx.get(registration.doc(q.targetUid))
    ])
    if(!ownerAllowed(token,actor.data(),actorProd.exists))fail(403,'OWNER_REQUIRED')
    if(token.uid===q.targetUid||target.exists||targetProd.exists)fail(403,'REGISTRATION_NOT_ELIGIBLE')
    if(!request.exists)fail(409,'REGISTRATION_NOT_FOUND')
    const before=verifyRegistrationRow(request.data(),q.targetUid)
    if(before.revision!==q.expectedRevision)fail(409,'REGISTRATION_REVISION_CONFLICT')
    if(q.decision==='approve')await definitionFor(tx,q.approvedRoleId)
    let after;try{after=registrationDecide(before,q,token.uid)}catch(e){fail(409,e.message)}
    tx.update(registration.doc(q.targetUid),after)
    tx.create(registrationAudit.doc(q.targetUid+':1'),{testOnly:true,workspace:'cutover',uid:q.targetUid,actorUid:token.uid,action:q.decision,revision:1,before,after})
    return after
   })
  },
  async activateRegistration(raw,input){
   const token=await tokenFor(raw)
   if(token.email_verified!==true)fail(403,'EMAIL_VERIFICATION_REQUIRED')
   let q;try{q=registrationActivate(input)}catch(e){fail(400,e.message)}
   return adb.runTransaction(async tx=>{
    const [identity,prod,request]=await Promise.all([tx.get(mark(token.uid)),tx.get(profile(token.uid)),tx.get(registration.doc(token.uid))])
    if(identity.exists||prod.exists)fail(403,'REGISTRATION_NOT_ELIGIBLE')
    if(!request.exists)fail(409,'REGISTRATION_NOT_FOUND')
    const before=verifyRegistrationRow(request.data(),token.uid)
    if(before.revision!==q.expectedRevision)fail(409,'REGISTRATION_REVISION_CONFLICT')
    let after;try{after=registrationComplete(before,q,token.uid)}catch(e){fail(409,e.message)}
    const definition=await definitionFor(tx,before.approvedRoleId)
    const next={testOnly:true,workspace:'cutover',enabled:true,role:definition.id,roleOverrides:{},manualOverrides:{},permissions:permissionsForIdentity({role:definition.id,roleOverrides:{},manualOverrides:{}},definition),policyRevision:0}
    row(token.uid,next,false,definition)
    tx.create(mark(token.uid),next)
    tx.update(registration.doc(token.uid),after)
    tx.create(registrationAudit.doc(token.uid+':2'),{testOnly:true,workspace:'cutover',uid:token.uid,actorUid:token.uid,action:'activate',revision:2,before,after,roleId:definition.id})
    return {uid:token.uid,role:definition.id,policyRevision:0,permissions:next.permissions}
   })
  },
  async assignRole(raw,input){
   const token=await tokenFor(raw)
   if(!exact(input,['targetUid','expectedRevision','roleId'])||!sid(input.targetUid)||!isRoleId(input.roleId)||input.roleId==='owner'||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)fail(400,'INVALID_REQUEST')
   return adb.runTransaction(async tx=>{
    const [actor,target,actorProd,targetProd]=await Promise.all([tx.get(mark(token.uid)),tx.get(mark(input.targetUid)),tx.get(profile(token.uid)),tx.get(profile(input.targetUid))])
    if(!ownerAllowed(token,actor.data(),actorProd.exists))fail(403,'OWNER_REQUIRED')
    const m=target.data()
    if(input.targetUid===token.uid||targetProd.exists||!m||m.role==='owner'||m.enabled!==true||m.testOnly!==true||m.workspace!=='cutover')fail(403,'TARGET_NOT_ELIGIBLE')
    const oldDefinition=await definitionFor(tx,m.role)
    row(input.targetUid,m,false,oldDefinition)
    if(m.policyRevision!==input.expectedRevision)fail(409,'PERMISSION_REVISION_CONFLICT')
    const definition=await definitionFor(tx,input.roleId)
    let next
    try{next=assignIdentityRole(m,input.roleId,definition)}catch(e){fail(e.message==='ROLE_ALREADY_ASSIGNED'?409:400,e.message)}
    const result=row(input.targetUid,next,false,definition)
    tx.update(mark(input.targetUid),{role:next.role,roleOverrides:next.roleOverrides,permissions:next.permissions,policyRevision:next.policyRevision})
    tx.create(adb.doc(prefix+'/permission_audit/'+input.targetUid+':'+next.policyRevision),{testOnly:true,workspace:'cutover',actorUid:token.uid,targetUid:input.targetUid,previousRevision:m.policyRevision,revision:next.policyRevision,action:'assign_role',previousRole:m.role,role:next.role})
    return result
   })
  },
  async listRoles(raw){
   const token=await tokenFor(raw)
   return adb.runTransaction(async tx=>{
    const [actor,prod]=await Promise.all([tx.get(mark(token.uid)),tx.get(profile(token.uid))])
    if(!ownerAllowed(token,actor.data(),prod.exists))fail(403,'OWNER_REQUIRED')
    const snapshot=await tx.get(catalog.limit(101))
    if(snapshot.size>100)fail(409,'ROLE_LIST_LIMIT')
    const custom=snapshot.docs.map(d=>{
     const r=d.data()
     if(r.testOnly!==true||r.workspace!=='cutover'||d.id!==r.definition?.id)fail(409,'INVALID_ROLE_RECORD')
     try{return validateCustomRole(r.definition)}catch{fail(409,'INVALID_ROLE_RECORD')}
    })
    return [...builtinRoles(),...custom]
   })
  },
  async createRole(raw,input){
   const token=await tokenFor(raw)
   let definition
   try{definition=roleDefinition(input)}catch(e){fail(400,e.message)}
   return adb.runTransaction(async tx=>{
    const [actor,prod,existing,tombstone,count]=await Promise.all([tx.get(mark(token.uid)),tx.get(profile(token.uid)),tx.get(catalog.doc(definition.id)),tx.get(retired.doc(definition.id)),tx.get(catalog.limit(100))])
    if(!ownerAllowed(token,actor.data(),prod.exists))fail(403,'OWNER_REQUIRED')
    if(existing.exists)fail(409,'ROLE_EXISTS')
    if(tombstone.exists)fail(409,'ROLE_RETIRED')
    if(count.size>=100)fail(409,'ROLE_LIST_LIMIT')
    tx.create(catalog.doc(definition.id),{testOnly:true,workspace:'cutover',definition})
    tx.create(roleAudit.doc(definition.id),{testOnly:true,workspace:'cutover',actorUid:token.uid,action:'create_role',definition})
    return definition
   })
  },
  async session(raw){
   const token=await tokenFor(raw)
   return adb.runTransaction(async tx=>{
    const [identity,prod]=await Promise.all([tx.get(mark(token.uid)),tx.get(profile(token.uid))])
    const m=identity.data()
    if(!m||m.enabled!==true||m.testOnly!==true||m.workspace!=='cutover'||prod.exists)fail(403,'SESSION_DENIED')
    const {uid,role,policyRevision,permissions}=row(token.uid,m,true,await definitionFor(tx,m.role))
    return {uid,role,policyRevision,permissions}
   })
  },
  async list(raw){
   const token=await tokenFor(raw)
   return adb.runTransaction(async tx=>{
    const [actor,prod]=await Promise.all([tx.get(mark(token.uid)),tx.get(profile(token.uid))])
    if(!ownerAllowed(token,actor.data(),prod.exists))fail(403,'OWNER_REQUIRED')
    const snapshot=await tx.get(adb.collection('qc_uat_identities').limit(101))
    if(snapshot.size>100)fail(409,'LIST_LIMIT')
    const candidates=snapshot.docs.filter(d=>sid(d.id)&&d.id!==token.uid&&d.data().testOnly===true&&d.data().workspace==='cutover'&&d.data().role!=='owner')
    const profiles=await Promise.all(candidates.map(d=>tx.get(profile(d.id))))
    return Promise.all(candidates.filter((d,i)=>!profiles[i].exists).map(async d=>row(d.id,d.data(),false,await definitionFor(tx,d.data().role))))
   })
  },
  async patch(raw,input){
   const token=await tokenFor(raw)
   if(!exact(input,['targetUid','expectedRevision','patch'])||!sid(input.targetUid))fail(400,'INVALID_REQUEST')
   return adb.runTransaction(async tx=>{
    const [actor,target,actorProd,targetProd]=await Promise.all([tx.get(mark(token.uid)),tx.get(mark(input.targetUid)),tx.get(profile(token.uid)),tx.get(profile(input.targetUid))])
    if(!ownerAllowed(token,actor.data(),actorProd.exists))fail(403,'OWNER_REQUIRED')
    const definition=await definitionFor(tx,target.data()?.role)
    let result
    try{result=ownerPermissionChange(input,{actorUid:token.uid,claim:token.qcUat===true,actor:actor.data(),target:target.data(),actorProductionProfile:actorProd.exists,targetProductionProfile:targetProd.exists,roleDefinition:definition})}
    catch(e){const code=e.message;fail(code==='PERMISSION_REVISION_CONFLICT'?409:['OWNER_REQUIRED','SELF_PERMISSION_CHANGE_DENIED','TARGET_NOT_ELIGIBLE'].includes(code)?403:400,code)}
    row(input.targetUid,target.data(),false,definition)
    const next=row(input.targetUid,result.next,false,definition)
    tx.update(mark(input.targetUid),{manualOverrides:next.manualOverrides,permissions:next.permissions,policyRevision:next.policyRevision})
    tx.create(adb.doc(prefix+'/permission_audit/'+input.targetUid+':'+next.policyRevision),result.audit)
    return next
   })
  }
 }
}
async function json(req){
 if(req.headers['content-type']!=='application/json')fail(415,'JSON_REQUIRED')
 let n=0;const chunks=[]
 for await(const chunk of req){n+=chunk.length;if(n>8192)fail(413,'BODY_TOO_LARGE');chunks.push(chunk)}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail(400,'INVALID_JSON')}
}
export function createOwnerHttp(service,labAssets=null){
 guard()
 return createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff')
  const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data))}
  try{
   guard()
   if(req.headers.host!==host+':'+httpPort||(req.headers.origin!==undefined&&req.headers.origin!==origin))fail(403,'ORIGIN_DENIED')
   // Optional in-memory browser bundle for the dedicated emulator runner only.
   if(labAssets&&req.method==='GET'&&labAssets.has(req.url)){
    const asset=labAssets.get(req.url)
    res.setHeader('Content-Type',asset.type)
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; connect-src 'self' http://127.0.0.1:10299; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
    res.end(asset.body);return
   }
   if(!Object.values(paths).includes(req.url))fail(404,'ROUTE_DENIED')
   if(req.method!=='POST')fail(405,'METHOD_DENIED')
   const auth=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'')
   if(!auth)fail(401,'AUTH_REQUIRED')
   const input=await json(req)
   if(req.url===paths.rolesList){if(!exact(input,[]))fail(400,'INVALID_REQUEST');return send(200,{roles:await service.listRoles(auth[1])})}
   if(req.url===paths.registrationRoles){if(!exact(input,[]))fail(400,'INVALID_REQUEST');return send(200,{roles:await service.availableCustomRoles(auth[1])})}
   if(req.url===paths.registrationSubmit)return send(200,{registration:await service.submitRegistration(auth[1],input)})
   if(req.url===paths.registrationStatus){if(!exact(input,[]))fail(400,'INVALID_REQUEST');return send(200,{registration:await service.registrationStatus(auth[1])})}
   if(req.url===paths.registrationInbox){if(!exact(input,[]))fail(400,'INVALID_REQUEST');return send(200,{rows:await service.registrationInbox(auth[1])})}
   if(req.url===paths.registrationReview)return send(200,{registration:await service.reviewRegistration(auth[1],input)})
   if(req.url===paths.registrationActivate)return send(200,{session:await service.activateRegistration(auth[1],input)})
   if(req.url===paths.rolesPreview)return send(200,{preview:await service.previewRoleLifecycle(auth[1],input)})
   if(req.url===paths.rolesUpdate)return send(200,{update:await service.updateRoleLifecycle(auth[1],input)})
   if(req.url===paths.rolesDelete)return send(200,{deleted:await service.deleteRoleLifecycle(auth[1],input)})
   if(req.url===paths.rolesAssign)return send(200,{row:await service.assignRole(auth[1],input)})
   if(req.url===paths.rolesCreate)return send(200,{role:await service.createRole(auth[1],input)})
   if(req.url===paths.session){if(!exact(input,[]))fail(400,'INVALID_REQUEST');return send(200,{session:await service.session(auth[1])})}
   if(req.url===paths.list){if(!exact(input,[]))fail(400,'INVALID_REQUEST');return send(200,{rows:await service.list(auth[1])})}
   return send(200,{row:await service.patch(auth[1],input)})
  }catch(e){const status=[400,401,403,404,405,409,413,415].includes(e.status)?e.status:500;send(status,{error:status!==500&&/^[A-Z_]+$/.test(e.message)?e.message:'UAT_INTERNAL_ERROR'})}
 })
}
