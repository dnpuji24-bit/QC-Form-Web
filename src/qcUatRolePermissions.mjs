// Source-derived defaults, synthetic server-provisioned marker only. No SDK or production import.
export const roles=Object.freeze(["owner","asisten","manager","admin","mandor_spraying","mandor_fertilizer","pengunjung"])
export const keys=Object.freeze(["qc_dashboard","qc_spraying","qc_fertilizer","qc_records","qc_logs","qc_settings","data_plan_summary","data_plan_monthly","data_plan_monthly_import","data_plan_daily","data_plan_daily_import","data_plan_actual","data_plan_actual_import","data_plan_reconciliation","data_master_paddock_list","data_master_paddock_import","data_master_activity_list","data_master_activity_manage","data_master_activity_resources","data_master_activity_import","data_company"])
const defaults={
  "owner": {
    "qc_dashboard": "edit",
    "qc_spraying": "edit",
    "qc_fertilizer": "edit",
    "qc_records": "edit",
    "qc_logs": "edit",
    "qc_settings": "edit",
    "data_plan_summary": "edit",
    "data_plan_monthly": "edit",
    "data_plan_monthly_import": "edit",
    "data_plan_daily": "edit",
    "data_plan_daily_import": "edit",
    "data_plan_actual": "edit",
    "data_plan_actual_import": "edit",
    "data_plan_reconciliation": "edit",
    "data_master_paddock_list": "edit",
    "data_master_paddock_import": "edit",
    "data_master_activity_list": "edit",
    "data_master_activity_manage": "edit",
    "data_master_activity_resources": "edit",
    "data_master_activity_import": "edit",
    "data_company": "edit"
  },
  "asisten": {
    "qc_dashboard": "view",
    "qc_spraying": "edit",
    "qc_fertilizer": "edit",
    "qc_records": "edit",
    "qc_logs": "view",
    "qc_settings": "edit",
    "data_plan_summary": "view",
    "data_plan_monthly": "edit",
    "data_plan_monthly_import": "edit",
    "data_plan_daily": "edit",
    "data_plan_daily_import": "edit",
    "data_plan_actual": "edit",
    "data_plan_actual_import": "edit",
    "data_plan_reconciliation": "view",
    "data_master_paddock_list": "view",
    "data_master_paddock_import": "edit",
    "data_master_activity_list": "edit",
    "data_master_activity_manage": "edit",
    "data_master_activity_resources": "edit",
    "data_master_activity_import": "edit",
    "data_company": "view"
  },
  "manager": {
    "qc_dashboard": "view",
    "qc_records": "edit",
    "qc_logs": "view",
    "qc_settings": "view"
  },
  "admin": {
    "qc_dashboard": "view",
    "qc_records": "edit",
    "qc_logs": "view",
    "qc_settings": "edit"
  },
  "mandor_spraying": {
    "qc_dashboard": "view",
    "qc_spraying": "edit",
    "qc_records": "view",
    "qc_settings": "view"
  },
  "mandor_fertilizer": {
    "qc_dashboard": "view",
    "qc_fertilizer": "edit",
    "qc_records": "view",
    "qc_settings": "view"
  },
  "pengunjung": {
    "qc_dashboard": "view",
    "qc_records": "view"
  }
}

export function requireThat(ok,code){if(!ok)throw Error(code)}

function map(v){requireThat(v&&Object.getPrototypeOf(v)===Object.prototype,'INVALID_PERMISSION_MAP');const result={};for(const k of Reflect.ownKeys(v)){requireThat(typeof k==='string'&&keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'),'UNKNOWN_PERMISSION');requireThat(['none','view','edit'].includes(v[k]),'INVALID_MODE');result[k]=v[k]}return result}

export function effectivePermissions(role,roleOverrides={},userOverrides={}){requireThat(roles.includes(role),'UNKNOWN_ROLE');return {...Object.fromEntries(keys.map(k=>[k,'none'])),...defaults[role],...map(roleOverrides),...map(userOverrides)}}

export function marker(role,roleOverrides={},userOverrides={},enabled=true){requireThat(typeof enabled==='boolean','INVALID_ENABLED');return {testOnly:true,workspace:'cutover',enabled,role,permissions:effectivePermissions(role,roleOverrides,userOverrides)}}
