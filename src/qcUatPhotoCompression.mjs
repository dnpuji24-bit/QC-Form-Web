// 11D.5c.3a.2 — Isolated browser-only compression before the existing UAT photo preflight.
// No upload, Firestore, Supabase, localStorage or IndexedDB side effects.
import {matchesUatPhotoSignature} from './qcUatUnifiedPhotoPreflight.mjs'
const requirePhoto=(condition,code)=>{if(!condition)throw Error(code)}
export const UAT_PHOTO_COMPRESSION=Object.freeze({
 maxOriginalBytes:6000000,
 maxOutputBytes:2097152,
 targetBytes:800*1024,
 maxSide:1280,
 maxPixels:32000000,
 jpegQuality:Object.freeze([.70,.64,.58,.52,.46]),
 outputSides:Object.freeze([1280,1120,960])
})
export function uatCompressedDimensions(width,height,maxSide=UAT_PHOTO_COMPRESSION.maxSide){
 requirePhoto(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&
   width*height<=UAT_PHOTO_COMPRESSION.maxPixels,'PHOTO_DIMENSIONS_UNSAFE')
 requirePhoto(Number.isSafeInteger(maxSide)&&maxSide>=1&&maxSide<=1280,'PHOTO_DIMENSIONS_UNSAFE')
 const ratio=Math.min(1,maxSide/Math.max(width,height))
 return {width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))}
}
export async function validateUatOriginalPhoto(file){
 requirePhoto(file&&typeof file.arrayBuffer==='function'&&typeof file.name==='string'&&
  file.name.length>=1&&file.name.length<=160&&!/[\\/\u0000-\u001f]/.test(file.name),'PHOTO_FILENAME_INVALID')
 requirePhoto(['image/jpeg','image/png','image/webp'].includes(file.type),'PHOTO_MIME_DENIED')
 requirePhoto(Number.isSafeInteger(file.size)&&file.size>0&&file.size<=UAT_PHOTO_COMPRESSION.maxOriginalBytes,'PHOTO_ORIGINAL_SIZE_LIMIT')
 const bytes=new Uint8Array(await file.arrayBuffer())
 requirePhoto(bytes.length===file.size&&matchesUatPhotoSignature(bytes,file.type),'PHOTO_SIGNATURE_INVALID')
 return {bytes,originalBytes:bytes.length,originalType:file.type}
}
function blobAsJpeg(canvas,quality){
 return new Promise((resolve,reject)=>{
  if(typeof canvas.toBlob!=='function'){reject(Error('PHOTO_ENCODING_UNAVAILABLE'));return}
  try{canvas.toBlob(blob=>{
   if(!blob||blob.type!=='image/jpeg'||blob.size<=0){reject(Error('PHOTO_ENCODING_UNAVAILABLE'));return}
   resolve(blob)
  },'image/jpeg',quality)}catch{reject(Error('PHOTO_ENCODING_UNAVAILABLE'))}
 })
}
function asFile(blob,originalName){
 const stem=originalName.replace(/\.[^.]*$/,'').slice(0,155)||'foto'
 return new File([blob],stem+'.jpg',{type:'image/jpeg'})
}
export async function compressUatPhoto(file){
 const original=await validateUatOriginalPhoto(file)
 let bitmap=null,image=null,objectUrl=''
 try{
  if(typeof createImageBitmap==='function'){
   try{bitmap=await createImageBitmap(file)}catch{bitmap=null}
  }
  if(!bitmap){
   requirePhoto(typeof Image==='function'&&typeof URL!=='undefined'&&
    typeof URL.createObjectURL==='function','PHOTO_DECODER_UNAVAILABLE')
   objectUrl=URL.createObjectURL(file)
   image=await new Promise((resolve,reject)=>{
    const img=new Image()
    img.onload=()=>resolve(img)
    img.onerror=()=>reject(Error('PHOTO_DECODE_FAILED'))
    img.src=objectUrl
   })
  }
  const width=bitmap?.width??image?.naturalWidth,height=bitmap?.height??image?.naturalHeight
  uatCompressedDimensions(width,height)
  const base={originalBytes:original.originalBytes,originalType:original.originalType,originalWidth:width,originalHeight:height}
  // Preserve already compact pictures and legible PNG scans; no lossy re-encode is required.
  if(Math.max(width,height)<=UAT_PHOTO_COMPRESSION.maxSide&&
   file.size<=UAT_PHOTO_COMPRESSION.targetBytes)
   return {file,details:{...base,outputBytes:file.size,outputType:file.type,
    outputWidth:width,outputHeight:height,quality:null,compressed:false}}
  requirePhoto(typeof document!=='undefined'&&typeof document.createElement==='function',
    'PHOTO_CANVAS_UNAVAILABLE')
  const canvas=document.createElement('canvas')
  const ctx=canvas.getContext('2d',{alpha:false})
  requirePhoto(ctx,'PHOTO_CANVAS_UNAVAILABLE')
  let best=null
  target:for(const side of UAT_PHOTO_COMPRESSION.outputSides){
   const dims=uatCompressedDimensions(width,height,side)
   canvas.width=dims.width;canvas.height=dims.height
   ctx.fillStyle='#ffffff'
   ctx.fillRect(0,0,canvas.width,canvas.height)
   ctx.drawImage(bitmap??image,0,0,canvas.width,canvas.height)
   for(const quality of UAT_PHOTO_COMPRESSION.jpegQuality){
    const blob=await blobAsJpeg(canvas,quality)
    if(!best||blob.size<best.blob.size)best={blob,quality,...dims}
    if(blob.size<=UAT_PHOTO_COMPRESSION.targetBytes){best={blob,quality,...dims};break target}
   }
  }
  requirePhoto(best&&best.blob.size<=UAT_PHOTO_COMPRESSION.maxOutputBytes,'PHOTO_COMPRESSED_TOO_LARGE')
  // In the rare case a small original expands after encoding, preserve its exact bytes.
  if(Math.max(width,height)<=UAT_PHOTO_COMPRESSION.maxSide&&
   original.originalBytes<=UAT_PHOTO_COMPRESSION.maxOutputBytes&&
   original.originalBytes<best.blob.size)
   return {file,details:{...base,outputBytes:file.size,outputType:file.type,
    outputWidth:width,outputHeight:height,quality:null,compressed:false}}
  const outputFile=asFile(best.blob,file.name)
  const checked=await validateUatOriginalPhoto(outputFile)
  requirePhoto(checked.originalBytes<=UAT_PHOTO_COMPRESSION.maxOutputBytes,'PHOTO_COMPRESSED_TOO_LARGE')
  return {file:outputFile,details:{...base,outputBytes:outputFile.size,outputType:outputFile.type,
   outputWidth:best.width,outputHeight:best.height,quality:best.quality,compressed:true}}
 }catch(e){
  if(e instanceof Error&&e.message.startsWith('PHOTO_'))throw e
  throw Error('PHOTO_COMPRESSION_FAILED')
 }finally{
  bitmap?.close?.()
  if(objectUrl)URL.revokeObjectURL(objectUrl)
 }
}
