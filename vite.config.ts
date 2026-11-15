import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    if (env.VITE_QC_LOCAL_UAT === 'true') {
      throw new Error('VITE_QC_LOCAL_UAT is only supported by the local development server.')
    }
    if (env.VITE_QC_NATIVE_PORTAL === 'true') {
      const required = [
        'VITE_FIRESTORE_ENABLED',
        'VITE_QC_FIRESTORE_ONLY',
        'VITE_QC_MASTER_FIRESTORE',
        'VITE_QC_OPERATIONAL_SAVE',
        'VITE_QC_NATIVE_REGISTRATION',
      ]
      const missing = required.filter((name) => env[name] !== 'true')
      if (missing.length) {
        throw new Error(`Native QC portal requires these variables set to true: ${missing.join(', ')}`)
      }
    }
  }

  return {
    plugins: [react()],
    publicDir: false,
    base: '/react/',
    build: {
      outDir: 'public/react',
      emptyOutDir: false,
    },
  }
})
