import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {isOperationalPhotoIdentityAllowed as allowed} from '../supabase/functions/_shared/qcOperationalPhotoIdentity.mjs'
const profile={role:'owner',active:true,status:'APPROVED',email:'owner@example.test'}
const account={localId:'uid1',email:profile.email,disabled:false}
const input={uid:'uid1',tokenEmail:profile.email,account,profile}
let n=0
function check(label,fn){fn();n++;console.log('PASS: '+label)}
check('legacy approved accepted',()=>assert.equal(allowed(input),true))
check('native approved accepted',()=>assert.equal(allowed({...input,profile:{...profile,status:'approved'}}),true))
check('approved non-Owner identity accepted for later permission check',()=>assert.equal(allowed({...input,profile:{...profile,role:'mandor_spraying'}}),true))
check('pending statuses denied',()=>{for(const status of ['PENDING','pending','Approved',undefined])assert.equal(allowed({...input,profile:{...profile,status}}),false)})
check('inactive denied',()=>assert.equal(allowed({...input,profile:{...profile,active:false}}),false))
check('nonboolean active denied',()=>assert.equal(allowed({...input,profile:{...profile,active:'true'}}),false))
check('unknown role denied',()=>assert.equal(allowed({...input,profile:{...profile,role:'unknown'}}),false))
check('disabled identity denied',()=>assert.equal(allowed({...input,account:{...account,disabled:true}}),false))
check('mismatched account UID denied',()=>assert.equal(allowed({...input,account:{...account,localId:'other'}}),false))
check('mismatched account email denied',()=>assert.equal(allowed({...input,account:{...account,email:'other@example.test'}}),false))
check('mismatched profile email denied',()=>assert.equal(allowed({...input,profile:{...profile,email:'other@example.test'}}),false))
check('missing token email denied',()=>assert.equal(allowed({...input,tokenEmail:undefined}),false))
check('missing profile denied',()=>assert.equal(allowed({...input,profile:null}),false))
check('normalized email accepted',()=>assert.equal(allowed({...input,tokenEmail:'OWNER@example.test'}),true))
for(const name of ['qc-photo-upload','qc-photo-sign-operational']){
 const source=readFileSync(new URL('../supabase/functions/'+name+'/index.ts',import.meta.url),'utf8')
 check(name+' invokes identity guard after signature verification',()=>{const verify=source.indexOf('await jwtVerify('),guard=source.indexOf('if(!isOperationalPhotoIdentityAllowed(');assert.ok(verify>=0&&guard>verify);assert.ok(source.includes('../_shared/qcOperationalPhotoIdentity.mjs'));assert.ok(source.includes('validSince'));const nullGuard=source.indexOf('if(!profile)throw new RequestError(403)');assert.ok(nullGuard>verify&&nullGuard<guard)})
}
console.log('SUCCESS: '+n+' operational photo identity checks passed (offline helper/source only)')
