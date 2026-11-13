import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath} from 'node:url'
export default defineConfig({
 plugins:[react(),{
  name:'verify-isolated-auth-pilot',
  generateBundle(_options,bundle){
   for(const item of Object.values(bundle)){
    if(item.type!=='chunk')continue
    for(const id of Object.keys(item.modules)){
     const path=id.replaceAll('\\','/')
     if(/\/src\/(api\.ts|App\.tsx|PortalRouter\.tsx|main\.tsx|offline\.ts|NativePortalSession\.tsx)$/.test(path))throw Error('Operational module in auth-only pilot: '+path)
    }
   }
  }
 }],
 publicDir:false,
 base:'/',
 build:{outDir:'dist/qc-auth-pilot',emptyOutDir:true,sourcemap:false,
  rolldownOptions:{input:fileURLToPath(new URL('./auth-pilot.html',import.meta.url))}}
})
