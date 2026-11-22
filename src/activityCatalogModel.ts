/** Activity catalog keys distinguish operation code from cost account.
 * A description may occur in different departments with distinct operations.
 * Do not collapse activities on name or CoA.
 */
export const ACTIVITY_COA_COLLECTION = 'master_activity_catalog'
export const ACTIVITY_CATALOG_HISTORY = 'master_activity_catalog_history'
export const ACTIVITY_COLUMNS = ['Departement','Operation Code','COA','Activity Category','Activity'] as const

export type CoaActivity = {
  id:string
  name:string
  coaCode:string
  active:boolean
  department:string
  operationCode:string
  activityCategory:string
}

export type ActivityCatalogInput = Pick<CoaActivity,'name'|'coaCode'|'department'|'operationCode'|'activityCategory'>

export function catText(value:unknown):string { return value===null||value===undefined?'':String(value).trim() }
export function normalizedActivityName(value:string):string { return catText(value).toLocaleLowerCase('id-ID').replace(/\s+/g,' ') }
export function opCatalogId(operationCode:string):string { return 'op-'+catText(operationCode) }
export function parseCoaActivity(id:string,value:Record<string,unknown>):CoaActivity {
  return {id,name:catText(value.name),coaCode:catText(value.coaCode),
    active:value.active!==false,department:catText(value.department),
    operationCode:catText(value.operationCode),activityCategory:catText(value.activityCategory)}
}
export function activityCatalogChoiceLabel(row:CoaActivity):string {
  return [row.department||'Legacy',row.operationCode||'tanpa Operation Code',row.name,
    'CoA '+(row.coaCode||'belum diatur')].join(' · ')
}
/** Historical validation may have only the activity name. Ambiguous names
 * must not be auto-resolved to an arbitrary department or operation.
 */
export function findCatalogForValidation(rows:CoaActivity[],validation:{
  catalogActivityId?:string;activity?:string;coaCode?:string
}):CoaActivity|undefined {
  const id=catText(validation.catalogActivityId)
  if(id) return rows.find(row=>row.active&&row.id===id)
  const options=rows.filter(row=>row.active&&normalizedActivityName(row.name)===normalizedActivityName(validation.activity||''))
  if(options.length===1)return options[0]
  const byCoa=options.filter(row=>row.coaCode&&row.coaCode===catText(validation.coaCode))
  return byCoa.length===1?byCoa[0]:undefined
}
/** Normalize only workbook's original five fields, preserving leading zeros. */
export function parseActivityCatalogImport(raw:Record<string,unknown>):ActivityCatalogInput {
  const values={
    department:catText(raw['Departement']??raw['Department']),
    operationCode:catText(raw['Operation Code']),
    coaCode:catText(raw['COA']??raw['CoA']),
    activityCategory:catText(raw['Activity Category']),
    name:catText(raw['Activity']),
  }
  if(!values.department||!values.activityCategory||!values.name)throw new Error('Departement, Activity Category, dan Activity wajib diisi.')
  if(!/^[0-9]{1,20}$/.test(values.operationCode))throw new Error('Operation Code wajib 1–20 angka.')
  if(!/^[0-9]{0,20}$/.test(values.coaCode))throw new Error('COA maksimal 20 angka; boleh kosong bila belum ditetapkan.')
  return values
}
export function catalogValuesEqual(a:ActivityCatalogInput,b:ActivityCatalogInput):boolean {
  return a.department===b.department&&a.operationCode===b.operationCode&&a.coaCode===b.coaCode
    &&a.activityCategory===b.activityCategory&&a.name===b.name
}
