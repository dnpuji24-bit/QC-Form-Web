import {resolveOperationalPhotoPath} from '../supabase/functions/qc-photo-sign-operational/manifest.ts'
const recordId='qc-v2-test',uid='test-user'
const hash='a'.repeat(64)
async function photo(slot:string,kind:string,holdId?:string){
  const slotHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(slot))),b=>b.toString(16).padStart(2,'0')).join('')
  const photoId=slotHash.slice(0,24)+'_'+hash
  return {photoId,provider:'supabase',bucket:'qc-photos',uploaderUid:uid,kind,contentType:'image/png',sha256:hash,size:10,objectPath:uid+'/qc/'+recordId+'/'+photoId+'.png',...(holdId?{holdId}:{})}
}
const main=await photo('main','main'),hold=await photo('hold_h1','hold','h1'),scan=await photo('scan','scan')
const qc={ownerUid:uid,formType:'spray',firestoreSaveState:'confirmed',operationalPhotoManifest:{main,hold_h1:hold,scan}}
const reservation={ownerUid:uid,formType:'spray'}
function equal(actual:unknown,expected:unknown){if(actual!==expected)throw Error('Unexpected manifest authorization result')}
Deno.test('main, HOLD and scan resolve current references',async()=>{
  for(const p of [main,hold,scan])equal(await resolveOperationalPhotoPath(qc,reservation,recordId,p.photoId),p.objectPath)
})
Deno.test('removed photo is not signed',async()=>equal(await resolveOperationalPhotoPath({...qc,operationalPhotoManifest:{main}},reservation,recordId,hold.photoId),null))
Deno.test('wrong owner reservation is rejected',async()=>equal(await resolveOperationalPhotoPath(qc,{...reservation,ownerUid:'other'},recordId,main.photoId),null))
Deno.test('unconfirmed record is rejected',async()=>equal(await resolveOperationalPhotoPath({...qc,firestoreSaveState:'queued'},reservation,recordId,main.photoId),null))
Deno.test('cross-record path is rejected',async()=>equal(await resolveOperationalPhotoPath({...qc,operationalPhotoManifest:{main:{...main,objectPath:main.objectPath.replace(recordId,'qc-v2-other')}}},reservation,recordId,main.photoId),null))
Deno.test('wrong bucket is rejected',async()=>equal(await resolveOperationalPhotoPath({...qc,operationalPhotoManifest:{main:{...main,bucket:'qc-photos-test'}}},reservation,recordId,main.photoId),null))
Deno.test('wrong slot is rejected',async()=>equal(await resolveOperationalPhotoPath({...qc,operationalPhotoManifest:{scan:main}},reservation,recordId,main.photoId),null))
Deno.test('duplicate references rejected',async()=>equal(await resolveOperationalPhotoPath({...qc,operationalPhotoManifest:{main,scan:main}},reservation,recordId,main.photoId),null))
Deno.test('invalid file size rejected',async()=>equal(await resolveOperationalPhotoPath({...qc,operationalPhotoManifest:{main:{...main,size:2097153}}},reservation,recordId,main.photoId),null))
Deno.test('non-operational ID rejected',async()=>equal(await resolveOperationalPhotoPath(qc,reservation,'qc-photo-staging-test',main.photoId),null))
