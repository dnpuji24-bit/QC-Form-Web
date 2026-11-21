// Valid PNG with CRC-verified IHDR/IDAT/IEND chunks; the previous tiny fixture
// had a corrupt IDAT CRC. Chromium correctly refuses to decode the old fixture.
import assert from 'node:assert/strict'
import {UAT_PHOTO_COMPRESSION,uatCompressedDimensions,validateUatOriginalPhoto,uatPhotoOutputFormat} from '../src/qcUatPhotoCompression.mjs'
import {hasValidUatPngCrc,matchesUatPhotoSignature} from '../src/qcUatUnifiedPhotoPreflight.mjs'
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGM0atryn4GBgYGJAQoAJCYCa4s7a6wAAAAASUVORK5CYII=','base64'))
const f=(bytes=png,type='image/png',name='paddock.png')=>({size:bytes.length,type,name,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)})
let n=0
const check=async(name,fn)=>{await fn();n++;console.log('PASS: '+name)}
await check('landscape downscale 4000x3000 to 1280x960',()=>assert.deepEqual(uatCompressedDimensions(4000,3000),{width:1280,height:960}))
await check('portrait 3000x4000 to 960x1280',()=>assert.deepEqual(uatCompressedDimensions(3000,4000),{width:960,height:1280}))
await check('already small photo not enlarged and uses pixel rounding',()=>{
 assert.deepEqual(uatCompressedDimensions(800,600),{width:800,height:600})
 assert.deepEqual(uatCompressedDimensions(999,1998),{width:640,height:1280})
})
await check('large and invalid dimensions rejected before any canvas call',()=>{
 for(const [w,h] of [[0,1],[1,0],[10000,10000],[1.5,100],[Infinity,5],[-5,20]]){
  assert.throws(()=>uatCompressedDimensions(w,h),{message:'PHOTO_DIMENSIONS_UNSAFE'})
 }
})
await check('policy exactly 6MB original, <=2 MiB staged and 800KiB target',()=>{
 assert.equal(UAT_PHOTO_COMPRESSION.maxOriginalBytes,6000000)
 assert.equal(UAT_PHOTO_COMPRESSION.maxOutputBytes,2097152)
 assert.equal(UAT_PHOTO_COMPRESSION.targetBytes,819200)
 assert.equal(UAT_PHOTO_COMPRESSION.maxSide,1280)
 assert.equal(UAT_PHOTO_COMPRESSION.jpegQuality[0],.7)
 assert.equal(uatPhotoOutputFormat('image/jpeg').extension,'jpg')
 assert.deepEqual(uatPhotoOutputFormat('image/png'),{mime:'image/png',extension:'png',lossless:true})
 assert.deepEqual(uatPhotoOutputFormat('image/webp'),{mime:'image/webp',extension:'webp',lossless:false})
 assert.ok(UAT_PHOTO_COMPRESSION.outputSides.includes(480))
 assert.throws(()=>uatPhotoOutputFormat('image/svg+xml'),{message:'PHOTO_MIME_DENIED'})
})
await check('valid PNG chunk CRC passes precompression validation unmodified',async()=>{
 const x=await validateUatOriginalPhoto(f());assert.equal(x.originalBytes,png.length)
 assert.equal(x.originalType,'image/png')
 assert.deepEqual(x.bytes,png)
 assert.equal(hasValidUatPngCrc(png),true)
 const corrupt=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+PcCaAAAAAElFTkSuQmCC','base64'))
 assert.equal(hasValidUatPngCrc(corrupt),false)
 assert.equal(matchesUatPhotoSignature(corrupt,'image/png'),false)
 await assert.rejects(()=>validateUatOriginalPhoto(f(corrupt,'image/png','corrupt.png')),{message:'PHOTO_SIGNATURE_INVALID'})
 const missingChunks=Uint8Array.from(png.subarray(0,8))
 assert.equal(hasValidUatPngCrc(missingChunks),false)
})
await check('original larger than 6 MB rejected without reading bytes',async()=>{
 let reads=0
 await assert.rejects(()=>validateUatOriginalPhoto({name:'big.jpg',type:'image/jpeg',size:6000001,arrayBuffer:async()=>{reads++;return new ArrayBuffer(0)}}),{message:'PHOTO_ORIGINAL_SIZE_LIMIT'})
 assert.equal(reads,0)
})
await check('unsupported type and unsafe filename reject before reading bytes',async()=>{
 await assert.rejects(()=>validateUatOriginalPhoto(f(png,'image/heic','image.heic')),{message:'PHOTO_MIME_DENIED'})
 await assert.rejects(()=>validateUatOriginalPhoto(f(png,'image/png','../bad.png')),{message:'PHOTO_FILENAME_INVALID'})
})
await check('fake JPEG with PNG bytes and changed byte count rejected',async()=>{
 await assert.rejects(()=>validateUatOriginalPhoto(f(png,'image/jpeg','fake.jpg')),{message:'PHOTO_SIGNATURE_INVALID'})
 await assert.rejects(()=>validateUatOriginalPhoto({...f(),size:200}),{message:'PHOTO_SIGNATURE_INVALID'})
})
await check('zero length image rejected',async()=>{
 await assert.rejects(()=>validateUatOriginalPhoto(f(new Uint8Array(0))),{message:'PHOTO_ORIGINAL_SIZE_LIMIT'})
})
console.log('SUCCESS: '+n+' UAT photo compression policy and original-byte contract checks passed (offline)')
