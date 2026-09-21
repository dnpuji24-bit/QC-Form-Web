import { getToken } from 'firebase/app-check'
import { firebaseAppCheck } from './firebase'

export type PaddleOcrResponse={
  ok:boolean
  engine:string
  version?:string
  ocrVersion?:string
  confidence:number
  text:string
  lines?:Array<{text:string;score:number;box?:number[]|null}>
}

export class PaddleOcrUnavailableError extends Error{
  status?:number
  code:string
  constructor(message:string,code='PADDLEOCR_UNAVAILABLE',status?:number){
    super(message);this.name='PaddleOcrUnavailableError';this.code=code;this.status=status
  }
}

export const paddleOcrUrl=String(import.meta.env.VITE_PADDLEOCR_URL||'').trim().replace(/\/$/,'')
export const paddleOcrConfigured=Boolean(paddleOcrUrl)
const DEFAULT_TIMEOUT_MS=Number(import.meta.env.VITE_PADDLEOCR_TIMEOUT_MS||18000)

function fallbackStatus(status:number){
  return status===402||status===408||status===409||status===425||status===429||status>=500
}

export async function scanWithPaddleOcr(file:File,timeoutMs=DEFAULT_TIMEOUT_MS):Promise<PaddleOcrResponse>{
  if(!paddleOcrUrl)throw new PaddleOcrUnavailableError('Endpoint PaddleOCR belum dikonfigurasi.','PADDLEOCR_NOT_CONFIGURED')
  if(!firebaseAppCheck)throw new PaddleOcrUnavailableError('App Check belum siap.','APP_CHECK_NOT_READY')

  const token=(await getToken(firebaseAppCheck,false)).token
  const controller=new AbortController()
  const timer=window.setTimeout(()=>controller.abort(),Math.max(3000,timeoutMs))
  try{
    const body=new FormData();body.append('file',file,file.name||'fertilizer-report.jpg')
    const response=await fetch(paddleOcrUrl+'/ocr',{
      method:'POST',
      headers:{'X-Firebase-AppCheck':token},
      body,
      signal:controller.signal,
    })
    let payload:unknown
    try{payload=await response.json()}catch{payload={}}
    if(!response.ok){
      const detail=typeof payload==='object'&&payload!==null&&'detail'in payload?String((payload as {detail?:unknown}).detail||''):''
      if(fallbackStatus(response.status))throw new PaddleOcrUnavailableError(detail||('PaddleOCR HTTP '+response.status),'PADDLEOCR_SERVICE_UNAVAILABLE',response.status)
      throw new Error(detail||('PaddleOCR HTTP '+response.status))
    }
    const data=payload as Partial<PaddleOcrResponse>
    if(!data.ok||!String(data.text||'').trim())throw new PaddleOcrUnavailableError('PaddleOCR tidak menghasilkan teks.','PADDLEOCR_EMPTY')
    return{
      ok:true,
      engine:String(data.engine||'paddleocr'),
      version:data.version?String(data.version):undefined,
      ocrVersion:data.ocrVersion?String(data.ocrVersion):undefined,
      confidence:Number(data.confidence||0),
      text:String(data.text||''),
      lines:Array.isArray(data.lines)?data.lines:[],
    }
  }catch(error){
    if(error instanceof PaddleOcrUnavailableError)throw error
    if(error instanceof DOMException&&error.name==='AbortError')throw new PaddleOcrUnavailableError('PaddleOCR melewati batas waktu.','PADDLEOCR_TIMEOUT',408)
    if(error instanceof TypeError)throw new PaddleOcrUnavailableError('PaddleOCR tidak dapat dihubungi.','PADDLEOCR_NETWORK')
    throw error
  }finally{window.clearTimeout(timer)}
}
