const API = process.env.SMOKE_API_URL || 'https://script.google.com/macros/s/AKfycbwjqnVwOBDQg3ptclpw_bCQO9kAcYUcHkxz4tdlNppcPYmMpCocPTbG8fgGVlp1muY/exec'
const password = process.env.ROLE_TEST_PASSWORD || ''
const ownerUser = process.env.SMOKE_OWNER_USERNAME || ''
const ownerPass = process.env.SMOKE_OWNER_PASSWORD || ''
const assert = (c,m)=>{if(!c)throw new Error(m)}
async function post(action,token='',data={}){const r=await fetch(API,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,token,...data})});assert(r.ok,`${action} HTTP ${r.status}`);return r.json()}
async function get(action,token=''){const u=new URL(API);u.searchParams.set('action',action);if(token)u.searchParams.set('token',token);u.searchParams.set('_',Date.now());const r=await fetch(u,{redirect:'follow'});assert(r.ok,`${action} HTTP ${r.status}`);return r.json()}
const deny=(r,label)=>assert(r.ok===false&&r.error==='AUTH_FORBIDDEN',`${label} expected AUTH_FORBIDDEN: ${JSON.stringify(r)}`)
assert(password&&ownerUser&&ownerPass,'role smoke credentials missing')
const owner=await post('login','',{username:ownerUser,password:ownerPass,deviceInfo:'role-matrix-smoke'});assert(owner.ok&&owner.token,'owner login failed');const ownerToken=owner.token
const date=new Date().toISOString().slice(0,10),nonce=Date.now(),created=[]
const foreignId=`SMOKE_ROLE_FOREIGN_${nonce}`
assert((await post('syncRecord',ownerToken,{record:{id:foreignId,formType:'spray',date,shift:'SMOKE',status:'Working',name:'Role Owner',paddock:'SMOKE-FOREIGN',area:.01,activity:'Smoke Test',saveType:'draft'}})).ok,'foreign setup failed');created.push(foreignId)
const roles=[
 ['manager','smoke_manager_0906x',1,0,0,1,0],['admin','smoke_admin_0906x',1,0,0,1,0],['asisten','smoke_asisten_0906x',1,1,1,1,0],
 ['mandor_spraying','smoke_ms_0906x',0,1,0,0,1],['mandor_fertilizer','smoke_mf_0906x',0,0,1,0,1],['pengunjung','smoke_guest_0906x',0,0,0,0,0]
]
try{
 for(const [role,username,logsOk,sprayOk,fertOk,deleteOk,ownOnly] of roles){
  const li=await post('login','',{username,password,deviceInfo:'role-matrix-smoke'});assert(li.ok&&li.token&&li.user.role===role,`${role} login/role failed`);const t=li.token
  deny(await get('users',t),`${role} users`);const lg=await get('logs',t);logsOk?assert(lg.ok,`${role} logs should pass`):deny(lg,`${role} logs`)
  const sid=`SMOKE_ROLE_S_${role}_${nonce}`,sres=await post('syncRecord',t,{record:{id:sid,formType:'spray',date,shift:'SMOKE',status:'Working',name:`Smoke ${role}`,paddock:`SMOKE-${role}-S`,area:.01,activity:'Smoke Test',saveType:'draft'}});if(sprayOk){assert(sres.ok,`${role} spray should pass`);created.push(sid)}else deny(sres,`${role} spray`)
  const fid=`SMOKE_ROLE_F_${role}_${nonce}`,fres=await post('syncRecord',t,{record:{id:fid,formType:'fertilizer',date,shift:'SMOKE',status:'Working',name:`Smoke ${role}`,paddock:`SMOKE-${role}-F`,unit:'TEST',noUnit:'ROLE',activity:'Smoke Test',saveType:'draft',pengisianList:[{pengisianKe:1,jenisPupuk:'TEST',dosis:100,statusHose:'OK',jumlah:1,hasilKerja:.01,pemerataanPupuk:1}]}});if(fertOk){assert(fres.ok,`${role} fertilizer should pass`);created.push(fid)}else deny(fres,`${role} fertilizer`)
  const dr=await post('deleteRecord',t,{recordId:`SMOKE_NONE_${nonce}`});deleteOk?assert(dr.ok,`${role} delete should pass`):deny(dr,`${role} delete`)
  const vr=await get('records',t);assert(vr.ok&&Array.isArray(vr.records),`${role} records failed`);if(ownOnly){assert(!vr.records.some(r=>r.id===foreignId),`${role} saw foreign record`);const own=sprayOk?sid:fid;assert(vr.records.some(r=>r.id===own),`${role} own record missing`)}else assert(vr.records.some(r=>r.id===foreignId),`${role} monitoring record missing`)
  assert((await post('logout',t)).ok,`${role} logout failed`);console.log(`  ✓ ${role} permission matrix OK`)
 }
}finally{for(const id of created){try{await post('deleteRecord',ownerToken,{recordId:id})}catch{}}try{await post('logout',ownerToken)}catch{}}
console.log('Role permission matrix smoke completed successfully.')
