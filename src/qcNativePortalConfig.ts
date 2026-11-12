import {assertNativePortalConfig} from './qcNativePortalPolicy.mjs'
export const nativePortalEnabled=import.meta.env.VITE_QC_NATIVE_PORTAL==='true'
export function checkNativePortalConfig(){assertNativePortalConfig(nativePortalEnabled,import.meta.env.VITE_QC_OPERATIONAL_SAVE==='true',import.meta.env.VITE_QC_FIRESTORE_ONLY==='true',import.meta.env.VITE_QC_MASTER_FIRESTORE==='true',import.meta.env.VITE_QC_NATIVE_REGISTRATION==='true')}
