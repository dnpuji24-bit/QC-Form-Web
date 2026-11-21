// Stage 23: two production-bound Edge Function preflight contracts.
// Offline only: no Supabase invocation, no Firebase Auth, no production writes.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {maySignOperationalQcPhoto} from '../supabase/functions/_shared/qcOperationalPhotoAccess.mjs'
import {prepareOperationalPhotoManifest} from '../src/qcOperationalPhotoManifest.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
let passed=0
async function check(name,fn){await fn();passed++;console.log('PASS: '+name)}
const source=read('supabase/functions/qc-photo-sign-operational/manifest.ts')
// TypeScript "latest" in Cloud Shell can expose the transpiler without the
// ScriptTarget enum. ES2022 = ScriptTarget 9; ModuleKind.ES2022 = 7.
// Do not modify the app's installed TypeScript or skip the manifest test.
assert.equal(typeof ts.transpileModule,'function','TYPESCRIPT_TRANSPILER_UNAVAILABLE')
const es2022Target=ts.ScriptTarget?.ES2022 ?? 9
const es2022Module=ts.ModuleKind?.ES2022 ?? 7
const transpiled=ts.transpileModule(source,{fileName:'manifest.ts',reportDiagnostics:true,
 compilerOptions:{module:es2022Module,target:es2022Target,strict:true}})
console.log('INFO: TypeScript transpiler '+(ts.version||'unknown')+
 (ts.ScriptTarget?.ES2022===undefined?' (numeric ES2022 fallback)':''))
assert.deepEqual(transpiled.diagnostics||[],[],'SIGNER_MANIFEST_TYPE_SYNTAX')
const {resolveOperationalPhotoPath}=await import('data:text/javascript;base64,'+Buffer.from(transpiled.outputText).toString('base64'))
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
const uid='uat-owner-id',recordId='qc-v2-uat-sign-final-1'
const built=await prepareOperationalPhotoManifest({recordId,uploaderUid:uid,
 changes:[{kind:'main',action:'replace',dataUrl:png}]})
const photoId=built.manifest.main.photoId
const qc={ownerUid:uid,inputtedBy:'mandor-a',formType:'spray',
 firestoreSaveState:'confirmed',operationalPhotoManifest:built.manifest}
await check('confirmed QC photo may be signed without retained upload intent; any altered manifest is denied',async()=>{
 const result=await resolveOperationalPhotoPath(qc,null,recordId,photoId,false,'qc-photos')
 assert.equal(result,built.manifest.main.objectPath)
 assert.equal(await resolveOperationalPhotoPath({...qc,firestoreSaveState:'queued'},null,recordId,photoId,false,'qc-photos'),null)
 assert.equal(await resolveOperationalPhotoPath({...qc,operationalPhotoManifest:{main:{
   ...built.manifest.main,objectPath:'someone-else/qc/forged.png'
 } }},null,recordId,photoId,false,'qc-photos'),null)
 assert.equal(await resolveOperationalPhotoPath(qc,null,recordId,photoId,false,'qc-photos-test'),null)
 assert.equal(await resolveOperationalPhotoPath(qc,null,recordId,'arbitrary-photo-id',false,'qc-photos'),null)
 const pilotId='qc-live-photo-pilot-uat-p1'
 const pilot=(await prepareOperationalPhotoManifest({recordId:pilotId,uploaderUid:uid,bucket:'qc-photos-test',
  changes:[{kind:'main',action:'replace',dataUrl:png}]})).manifest
 const pilotQc={...qc,operationalPhotoManifest:pilot}
 assert.equal(await resolveOperationalPhotoPath(pilotQc,null,pilotId,pilot.main.photoId,true,'qc-photos-test'),null)
 assert.equal(await resolveOperationalPhotoPath(pilotQc,{ownerUid:uid,formType:'spray'},pilotId,pilot.main.photoId,true,'qc-photos-test'),pilot.main.objectPath)
})
await check('mandor only signs owned QC, matching Firestore read rule; revoked or unrelated grants deny',()=>{
 const p={role:'mandor_spraying',username:'mandor-a'},r={role:p.role,permissions:{qc_records:'view'}}
 assert.equal(maySignOperationalQcPhoto(p,r,qc),true)
 assert.equal(maySignOperationalQcPhoto(p,r,{...qc,inputtedBy:'mandor-b'}),false)
 assert.equal(maySignOperationalQcPhoto({...p,role:'mandor_fertilizer'},{
  role:'mandor_fertilizer',permissions:{qc_records:'edit'}},{...qc,inputtedBy:'mandor-b'}),false)
 assert.equal(maySignOperationalQcPhoto(p,{role:p.role,permissions:{qc_records:'none'}},qc),false)
 assert.equal(maySignOperationalQcPhoto(p,{role:'manager',permissions:{qc_records:'view'}},qc),false)
 assert.equal(maySignOperationalQcPhoto({role:'pengunjung'},{
  role:'pengunjung',permissions:{qc_records:'view'}},qc),true)
 assert.equal(maySignOperationalQcPhoto({role:'owner'},null,qc),true)
 assert.equal(maySignOperationalQcPhoto({role:'owner'},null,{...qc,firestoreSaveState:'queued'}),false)
 assert.equal(maySignOperationalQcPhoto({role:'unknown'},null,qc),false)
 const rules=read('firestore.rules')
 assert.match(rules,/isSprayMandor\(\) \|\| isFertMandor\(\)/)
 assert.match(rules,/ownsExisting\(\)/)
})
await check('production handler enforces Firebase revocation, exact origin, roles, private scope and signed URL TTL',()=>{
 const signer=read('supabase/functions/qc-photo-sign-operational/handler.ts')
 const upload=read('supabase/functions/qc-photo-upload/handler.ts')
 const config=read('supabase/config.toml')
 assert.match(signer,/maySignOperationalQcPhoto\(profile,role,qc\)/)
 assert.match(signer,/pilot \? googleJson\(documentPath\(intents\+data\.recordId\),oauth\) : Promise\.resolve\(null\)/)
 assert.match(signer,/jwtVerify\(jwt,jwks/)
 assert.match(upload,/jwtVerify\(header\.slice\(7\),jwks/)
 for(const source of [signer,upload]){
  assert.match(source,/validSince/)
  assert.match(source,/disabled===true/)
  assert.match(source,/request\.headers\.get\('Origin'\)/)
  assert.match(source,/isOperationalPhotoIdentityAllowed/)
  assert.match(source,/qc-photos/)
 }
 assert.match(signer,/createSignedUrl\(path,60\)/)
 assert.match(upload,/2097152/)
 assert.match(upload,/upsert:false/)
 assert.match(upload,/await digest\(actual\)!==sha256/)
 assert.match(upload,/'image\/jpeg': 'jpg'/)
 assert.match(upload,/'image\/png': 'png'/)
 assert.match(upload,/'image\/webp': 'webp'/)
 assert.match(config,/\[functions\.qc-photo-upload\]\s*verify_jwt = false/)
 assert.match(config,/\[functions\.qc-photo-sign-operational\]\s*verify_jwt = false/)
})
console.log('SUCCESS: '+passed+' focused private QC photo Edge Function readiness checks passed (OFFLINE)')
console.log('RELEASE_STATUS: BLOCKED — deployment, secret readiness, real upload and signed-read not verified')
