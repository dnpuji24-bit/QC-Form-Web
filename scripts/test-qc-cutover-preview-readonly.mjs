// Stage 26: read-only preflight for the deployed React preview and *disabled*
// operational photo functions. This script never authenticates or uploads files.
import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const preview='https://form-qc-unm--react-test-ayyxz4hj.web.app/react/'
const origin=new URL(preview).origin
const backend='https://mcfwnstdfhhtcbksgrlj.supabase.co/functions/v1/'
const expectedFns=['qc-photo-upload','qc-photo-sign-operational']
const htmlEntry=html=>{
 const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["']/gi)]
 const entry=scripts.map(m=>m[1]).find(p=>p.startsWith('/react/assets/'))
 assert.ok(entry,'PREVIEW_REACT_ENTRY_NOT_FOUND')
 return entry.split('?')[0]
}
const verifiedFetch=async(url,init={})=>{
 const r=await fetch(url,{redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(15000),...init})
 if(new URL(r.url).origin!==new URL(url).origin)throw Error('UNEXPECTED_REDIRECT_HOST '+new URL(r.url).host)
 return r
}
async function main(){
 assert.equal(process.argv.length,2,'NO_ARGUMENTS_ALLOWED')
 const local='public/react/index.html'
 if(!existsSync(new URL('../'+local,import.meta.url)))
  throw Error('LOCAL_CANDIDATE_BUILD_MISSING: build React Firebase-only before comparing preview')
 const localEntry=htmlEntry(source(local))
 console.log('PASS: local React candidate artifact exists ('+localEntry.split('/').pop()+')')
 const page=await verifiedFetch(preview)
 const html=await page.text()
 if(page.status!==200||!/\<html\b/i.test(html))
  throw Error('PREVIEW_NOT_AVAILABLE: HTTP '+page.status)
 const liveEntry=htmlEntry(html)
 console.log('PASS: preview returns React HTML and entry ('+liveEntry.split('/').pop()+')')
 const asset=await verifiedFetch(origin+liveEntry)
 const js=await asset.text()
 if(asset.status!==200||!js.length||/^\s*</.test(js))
  throw Error('PREVIEW_ASSET_NOT_JAVASCRIPT: HTTP '+asset.status)
 console.log('PASS: React Preview JavaScript asset reachable')
 if(localEntry!==liveEntry)
  throw Error('PREVIEW_BUILD_MISMATCH: local candidate and hosted preview entry differ; do not activate photo upload')
 console.log('PASS: hosted preview and local candidate use same Vite entry fingerprint')
 for(const fn of expectedFns){
  // Empty body, no Firebase token: cannot authorize an upload even if flag
  // changes unexpectedly. A non-503 response aborts the preparation gate.
  const response=await verifiedFetch(backend+fn,{method:'POST',
   headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})
  let payload;try{payload=await response.json()}catch{payload={}}
  if(response.status!==503||payload.error!=='OPERATIONAL_PHOTOS_DISABLED')
   throw Error('OPERATIONAL_PHOTO_NOT_DISABLED: '+fn+' HTTP '+response.status)
  console.log('PASS: '+fn+' refuses disabled photo operations (HTTP 503)')
 }
 const signTarget=backend+'qc-photo-sign-operational'
 const variables=[...['.env.production','.env.local','.env.production.local']
  .filter(p=>existsSync(new URL('../'+p,import.meta.url)))
  .map(p=>source(p))]
 const declared=variables.join('\n')+'\n'
 const signValue=process.env.VITE_QC_PHOTO_SIGN_ENDPOINT||
  [...declared.matchAll(/^\s*VITE_QC_PHOTO_SIGN_ENDPOINT\s*=\s*(.*?)\s*$/gm)].at(-1)?.[1]?.replace(/^["']|["']$/g,'')
 const signFlag=process.env.VITE_QC_PHOTO_SIGN_PREVIEW||
  [...declared.matchAll(/^\s*VITE_QC_PHOTO_SIGN_PREVIEW\s*=\s*(.*?)\s*$/gm)].at(-1)?.[1]?.replace(/^["']|["']$/g,'')
 if(signFlag!=='true'||signValue!==signTarget)
  throw Error('SIGNED_PHOTO_PREVIEW_CONFIG_MISSING: set VITE_QC_PHOTO_SIGN_PREVIEW=true and VITE_QC_PHOTO_SIGN_ENDPOINT to the operational signer, then rebuild/redeploy preview before activation')
 console.log('PASS: local preview signer configuration points to operational function (source config only)')
 console.log('SUCCESS: read-only preview fingerprint and disabled operational endpoint preflight passed')
 console.log('RELEASE_STATUS: BLOCKED — no live QC photo upload or signed-read has been performed')
}
main().catch(e=>{console.error('BLOCKED:',e.message);process.exitCode=1})
