// Valid PNG with CRC-verified IHDR/IDAT/IEND chunks; the previous tiny fixture
// had a corrupt IDAT CRC. Chromium correctly refuses to decode the old fixture.
import assert from 'node:assert/strict'
import {stageUatPhoto,uatPhotoSlot} from '../src/qcUatUnifiedPhotoPreflight.mjs'
let n=0
const check=async(label,fn)=>{await fn();n++;console.log('PASS: '+label)}
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGM0atryn4GBgYGJAQoAJCYCa4s7a6wAAAAASUVORK5CYII=','base64'))
const file=(bytes=png,type='image/png',name='uji.png')=>({name,type,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)})
const args={uploaderUid:'uat-field',formType:'spray',kind:'main'}
await check('main photo manifest uses existing stable SHA256 slot ID and no remote requests',async()=>{
 const p=await stageUatPhoto({...args,file:file()})
 const q=await stageUatPhoto({...args,file:file()})
 assert.equal(p.sha256,q.sha256);assert.equal(p.photoId,q.photoId);assert.equal(p.slot,'main')
 assert.equal(p.contentType,'image/png');assert.equal(p.size,png.length)
 assert.match(p.dataUrl,/^data:image\/png;base64,/)
})
await check('Spray hold uses only actual numbered UAT hold ID',async()=>{
 const x=await stageUatPhoto({...args,kind:'hold',holdId:'uat-h1',file:file()})
 assert.equal(x.slot,'hold_uat-h1')
})
await check('Fertilizer accepts separate scan and hold slots',async()=>{
 const s=await stageUatPhoto({...args,formType:'fertilizer',kind:'scan',file:file()})
 assert.equal(s.slot,'scan')
 assert.equal(uatPhotoSlot('fertilizer','hold','uat-h20'),'hold_uat-h20')
})
await check('Spray cannot silently register scanner slot',async()=>assert.throws(()=>uatPhotoSlot('spray','scan'),{message:'PHOTO_SCAN_ONLY_FERTILIZER'}))
await check('foreign or unknown hold reference rejected',async()=>{
 for(const id of ['h1','uat-h0','uat-h21','uat-h1/abc',''])assert.throws(()=>uatPhotoSlot('spray','hold',id),{message:'PHOTO_HOLD_SOURCE_REQUIRED'})
})
await check('wrong declared MIME, signature and empty data fail before manifest',async()=>{
 await assert.rejects(()=>stageUatPhoto({...args,file:file(png,'image/svg+xml','x.svg')}),{message:'PHOTO_MIME_DENIED'})
 await assert.rejects(()=>stageUatPhoto({...args,file:file(png,'image/jpeg','x.jpg')}),{message:'PHOTO_SIGNATURE_INVALID'})
 const invalidIdatCrc=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+PcCaAAAAAElFTkSuQmCC','base64'))
 await assert.rejects(()=>stageUatPhoto({...args,file:file(invalidIdatCrc,'image/png','bad-crc.png')}),{message:'PHOTO_SIGNATURE_INVALID'})
 const damaged=Uint8Array.from(png)
 damaged[28]^=1 // flip IHDR without updating CRC
 await assert.rejects(()=>stageUatPhoto({...args,file:file(damaged,'image/png','tampered.png')}),{message:'PHOTO_SIGNATURE_INVALID'})
 await assert.rejects(()=>stageUatPhoto({...args,file:file(new Uint8Array(0))}),{message:'PHOTO_SIZE_LIMIT'})
})
await check('over 2 MiB aborts before reading file bytes',async()=>{
 let called=false
 const big={name:'big.png',type:'image/png',size:2097153,arrayBuffer:async()=>{called=true;return new ArrayBuffer(0)}}
 await assert.rejects(()=>stageUatPhoto({...args,file:big}),{message:'PHOTO_SIZE_LIMIT'})
 assert.equal(called,false)
})
await check('byte length mismatch from untrusted file object denied',async()=>{
 const bad={name:'bad.png',type:'image/png',size:100,arrayBuffer:async()=>png.buffer}
 await assert.rejects(()=>stageUatPhoto({...args,file:bad}),{message:'PHOTO_SIGNATURE_INVALID'})
})
await check('foreign uploader, unsafe record ID and slash filename denied',async()=>{
 await assert.rejects(()=>stageUatPhoto({...args,uploaderUid:'prod-account',file:file()}),{message:'PHOTO_SYNTHETIC_ONLY'})
 await assert.rejects(()=>stageUatPhoto({...args,recordId:'users/root',file:file()}),{message:'PHOTO_SYNTHETIC_ONLY'})
 await assert.rejects(()=>stageUatPhoto({...args,file:file(png,'image/png','../a.png')}),{message:'PHOTO_FILENAME_INVALID'})
})
await check('only explicit slot can carry holdId',async()=>assert.throws(()=>uatPhotoSlot('fertilizer','main','uat-h1'),{message:'PHOTO_HOLD_UNEXPECTED'}))
console.log('SUCCESS: '+n+' isolated UAT photo preflight/manifest contract checks passed (no network)')
