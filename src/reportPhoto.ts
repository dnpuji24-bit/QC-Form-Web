import type { HoldInterval, QcRecord } from './types'

const PREVIEW_MAX_SIDE=520
const PREVIEW_TARGET_CHARS=70_000
const PREVIEW_HARD_LIMIT_CHARS=100_000

function loadDataImage(source:string):Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{
    const image=new Image()
    image.onload=()=>resolve(image)
    image.onerror=()=>reject(new Error('preview decode failed'))
    image.src=source
  })
}

function renderPreview(image:HTMLImageElement,maxSide:number,quality:number):string{
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height
  if(!width||!height)return''
  const scale=Math.min(1,maxSide/Math.max(width,height))
  const canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(width*scale))
  canvas.height=Math.max(1,Math.round(height*scale))
  const context=canvas.getContext('2d')
  if(!context)return''
  context.drawImage(image,0,0,canvas.width,canvas.height)
  return canvas.toDataURL('image/jpeg',quality)
}

export async function makeReportPhotoPreview(source:unknown):Promise<string>{
  const raw=String(source||'')
  if(!raw.startsWith('data:image/'))return''
  try{
    const image=await loadDataImage(raw)
    let quality=.58
    let result=renderPreview(image,PREVIEW_MAX_SIDE,quality)
    while(result.length>PREVIEW_TARGET_CHARS&&quality>.34){
      quality-=.06
      result=renderPreview(image,PREVIEW_MAX_SIDE,quality)
    }
    if(result.length>PREVIEW_HARD_LIMIT_CHARS)result=renderPreview(image,380,.38)
    return result.length<=PREVIEW_HARD_LIMIT_CHARS?result:''
  }catch{return''}
}

function hydrateHoldPreview(hold:HoldInterval):HoldInterval{
  if(hold.photoBase64)return hold
  if(hold.photoPreviewBase64)return{...hold,photoBase64:hold.photoPreviewBase64}
  return hold
}

export function hydrateReportPhotoPreviews(record:QcRecord):QcRecord{
  const next:QcRecord={...record}
  if(!next.photoBase64&&next.photoPreviewBase64)next.photoBase64=next.photoPreviewBase64
  if(Array.isArray(next.holdIntervals))next.holdIntervals=next.holdIntervals.map(hydrateHoldPreview)
  return next
}
