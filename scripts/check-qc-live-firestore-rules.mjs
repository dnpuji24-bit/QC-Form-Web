// Read-only: compare the active default Firestore rules release with the tested source.
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
const PROJECT='form-qc-unm'
const normalize=v=>v.replace(/\r\n/g,'\n').trimEnd()
const sha=v=>createHash('sha256').update(normalize(v)).digest('hex')
export async function checkLiveRules(credential,localRules){
 const token=await credential.getAccessToken()
 const api='https://firebaserules.googleapis.com/v1/'
 async function get(path){
  const r=await fetch(api+path,{headers:{Authorization:'Bearer '+token.access_token},redirect:'error',signal:AbortSignal.timeout(20000)})
  if(!r.ok)throw Error('RULES_API_HTTP_'+r.status)
  return r.json()
 }
 const release=await get('projects/'+PROJECT+'/releases/cloud.firestore')
 if(!/^projects\/form-qc-unm\/rulesets\/[A-Za-z0-9_-]+$/.test(release.rulesetName||''))throw Error('RULES_RELEASE_INVALID')
 const ruleset=await get(release.rulesetName)
 const files=ruleset.source?.files
 if(!Array.isArray(files)||files.length!==1||typeof files[0].content!=='string')throw Error('RULES_SOURCE_INVALID')
 const deployedHash=sha(files[0].content),localHash=sha(localRules)
 return {project:PROJECT,release:release.name,ruleset:release.rulesetName,updatedAt:release.updateTime??null,deployedHash,localHash,exactMatch:deployedHash===localHash}
}
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--read-only-confirmed')throw Error('USAGE')
 if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('EMULATOR_ENVIRONMENT')
 for(const k of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID'])if(process.env[k]&&process.env[k]!==PROJECT)throw Error('WRONG_PROJECT')
 const requireAdmin=createRequire(new URL('../server/qc-photo-access/package.json',import.meta.url))
 const {applicationDefault}=requireAdmin('firebase-admin/app')
 const result=await checkLiveRules(applicationDefault(),readFileSync(new URL('../firestore.rules',import.meta.url),'utf8'))
 console.log(JSON.stringify({...result,writes:0,releaseApproved:false},null,2))
 if(!result.exactMatch){console.log('BLOCKED: deployed rules differ from tested branch; do not import or deploy blindly');process.exitCode=2}
 else console.log('SUCCESS: active default Firestore rules match branch source')
}
if(process.argv[1]&&new URL('file:'+process.argv[1]).href===import.meta.url)main().catch(e=>{
 const m=String(e?.message||'')
 console.error(/^(RULES_API_HTTP_\d+|RULES_RELEASE_INVALID|RULES_SOURCE_INVALID|USAGE|EMULATOR_ENVIRONMENT|WRONG_PROJECT)$/.test(m)?m:'RULES_CHECK_FAILED')
 process.exitCode=1
})
