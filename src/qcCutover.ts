import {selectQcFlushMode} from './qcCutoverPolicy.mjs'
export const qcFirestoreOnly=import.meta.env.VITE_QC_FIRESTORE_ONLY==='true'
export const qcFlushMode=()=>selectQcFlushMode(qcFirestoreOnly,import.meta.env.VITE_QC_OPERATIONAL_SAVE==='true')
