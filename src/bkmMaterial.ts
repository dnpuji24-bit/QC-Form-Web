import type {BkmMaterialEntry} from './bkmFirestore'

export const blankMaterial=(cols:number):BkmMaterialEntry=>({
 pid:'',code:'',name:'',unit:'',hi:null,shi:null,wo:'',bkm:'',note:'',extra:Array(cols).fill(''),
})

export const hasMaterial=(row:BkmMaterialEntry)=>!!(
 row.pid||row.code||row.name||row.unit||row.hi!=null||row.shi!=null||row.wo||row.bkm||row.note||row.extra.some(Boolean)
)
