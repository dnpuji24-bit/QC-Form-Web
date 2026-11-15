import {defineConfig} from 'vite'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const path=p=>fileURLToPath(new URL(p,import.meta.url))
export default defineConfig(({command})=>{
 if(command!=='serve')throw Error('QC_UAT_LAB_BUILD_FORBIDDEN')
 return {root:path('./uat-domain-lab/'),publicDir:false,envDir:false,envPrefix:'QC_UAT_UNUSED_',appType:'custom',
    plugins:[{
      name:'qc-uat-no-hmr-html',
      configureServer(server){
        server.middlewares.use((req,res,next)=>{
          if(req.method!=='GET' ||
             req.headers.host!=='127.0.0.1:4185' ||
             !['/','/index.html'].includes(req.url))
            return next()
          for(const [key,value] of Object.entries(
            server.config.server.headers || {}
          )) res.setHeader(key,value)
          res.setHeader('Content-Type','text/html; charset=utf-8')
          res.setHeader('Cache-Control','no-store')
          res.end(readFileSync(path('./uat-domain-lab/index.html')))
        })
      }
    }],
  server:{host:'127.0.0.1',port:4185,strictPort:true,hmr:false,ws:false,headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:8185 http://127.0.0.1:9199; img-src 'self' data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'"},
   fs:{strict:true,allow:[path('./uat-domain-lab/'),path('./src/qcUatDomainContract.mjs'),path('./node_modules/')]}}}
})
