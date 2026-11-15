import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath} from 'node:url'
const path=p=>fileURLToPath(new URL(p,import.meta.url))
export default defineConfig(({command})=>{
 if(command!=='serve')throw Error('QC_UAT_LAB_BUILD_FORBIDDEN')
 return {root:path('./uat-domain-lab/'),publicDir:false,envDir:false,envPrefix:'QC_UAT_UNUSED_',plugins:[react()],
  server:{host:'127.0.0.1',port:4185,strictPort:true,hmr:false,headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:8185 http://127.0.0.1:9199; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'"},
   fs:{strict:true,allow:[path('./uat-domain-lab/'),path('./src/qcUatDomainContract.mjs'),path('./node_modules/')]}}}
})
