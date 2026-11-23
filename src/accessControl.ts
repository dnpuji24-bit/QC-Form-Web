import type { Role, User } from './types'

export type AccessMode='none'|'view'|'edit'
export type PermissionKey=
  |'qc_dashboard'
  |'qc_spraying'
  |'qc_fertilizer'
  |'qc_records'
  |'qc_logs'
  |'qc_settings'
  |'data_plan_summary'
  |'data_plan_monthly'
  |'data_plan_monthly_import'
  |'data_plan_daily'
  |'data_plan_daily_import'
  |'data_plan_actual'
  |'data_plan_actual_import'
  |'data_plan_reconciliation'
  |'data_master_paddock_list'
  |'data_master_paddock_import'
  |'data_master_activity_list'
  |'data_master_activity_manage'
  |'data_master_activity_resources'
  |'data_master_activity_import'
  |'data_company'

export type UserPermissions=Partial<Record<PermissionKey,AccessMode>>

export type PermissionItem={key:PermissionKey;group:'Form QC'|'Data UnM';menu:string;subMenu:string;editable:boolean}

export const PERMISSION_CATALOG:PermissionItem[]=[
  {key:'qc_dashboard',group:'Form QC',menu:'Dashboard',subMenu:'Dashboard',editable:false},
  {key:'qc_spraying',group:'Form QC',menu:'Input Spraying',subMenu:'Input Spraying',editable:true},
  {key:'qc_fertilizer',group:'Form QC',menu:'Input Fertilizer',subMenu:'Input Fertilizer',editable:true},
  {key:'qc_records',group:'Form QC',menu:'Data QC',subMenu:'Data QC / laporan',editable:true},
  {key:'qc_logs',group:'Form QC',menu:'Activity Logs',subMenu:'Activity Logs',editable:false},
  {key:'qc_settings',group:'Form QC',menu:'Pengaturan',subMenu:'Pengaturan akun / aplikasi',editable:true},

  {key:'data_plan_summary',group:'Data UnM',menu:'Plan',subMenu:'Summary',editable:false},
  {key:'data_plan_monthly',group:'Data UnM',menu:'Plan',subMenu:'Monthly Plan · Plan per Periode',editable:true},
  {key:'data_plan_monthly_import',group:'Data UnM',menu:'Plan',subMenu:'Monthly Plan · Update / Import / Sinkron',editable:true},
  {key:'data_plan_daily',group:'Data UnM',menu:'Plan',subMenu:'Daily Plan · Daily per Tanggal',editable:true},
  {key:'data_plan_daily_import',group:'Data UnM',menu:'Plan',subMenu:'Daily Plan · Update / Import',editable:true},
  {key:'data_plan_actual',group:'Data UnM',menu:'Plan',subMenu:'Actual Plan · Actual per Tanggal',editable:true},
  {key:'data_plan_actual_import',group:'Data UnM',menu:'Plan',subMenu:'Actual Plan · Update / Import',editable:true},
  {key:'data_plan_reconciliation',group:'Data UnM',menu:'Plan',subMenu:'Rekonsiliasi',editable:false},
  {key:'data_master_paddock_list',group:'Data UnM',menu:'Master Paddock',subMenu:'Daftar Paddock',editable:false},
  {key:'data_master_paddock_import',group:'Data UnM',menu:'Master Paddock',subMenu:'Update / Import',editable:true},
  {key:'data_master_activity_list',group:'Data UnM',menu:'Master Activity',subMenu:'Daftar Activity',editable:true},
  {key:'data_master_activity_manage',group:'Data UnM',menu:'Master Activity',subMenu:'Kelola Master',editable:true},
  {key:'data_master_activity_resources',group:'Data UnM',menu:'Master Activity',subMenu:'Master Resource',editable:true},
  {key:'data_master_activity_import',group:'Data UnM',menu:'Master Activity',subMenu:'Update / Import',editable:true},
  {key:'data_company',group:'Data UnM',menu:'Company & Prefix',subMenu:'Company & Prefix',editable:true},
]

const NONE:UserPermissions={}
function setAll(mode:AccessMode):UserPermissions{return Object.fromEntries(PERMISSION_CATALOG.map(item=>[item.key,mode])) as UserPermissions}
function merge(...parts:UserPermissions[]):UserPermissions{return Object.assign({},...parts)}

export function defaultPermissionsForRole(role:Role):UserPermissions{
  if(role==='owner')return setAll('edit')
  if(role==='asisten')return merge(setAll('none'),{
    qc_dashboard:'view',qc_spraying:'edit',qc_fertilizer:'edit',qc_records:'edit',qc_logs:'view',qc_settings:'edit',
    data_plan_summary:'view',data_plan_monthly:'edit',data_plan_monthly_import:'edit',data_plan_daily:'edit',data_plan_daily_import:'edit',
    data_plan_actual:'edit',data_plan_actual_import:'edit',data_plan_reconciliation:'view',
    data_master_paddock_list:'view',data_master_paddock_import:'edit',
    data_master_activity_list:'edit',data_master_activity_manage:'edit',data_master_activity_resources:'edit',data_master_activity_import:'edit',
    data_company:'view',
  } as UserPermissions)
  if(role==='manager')return merge(setAll('none'),{qc_dashboard:'view',qc_records:'edit',qc_logs:'view',qc_settings:'view'} as UserPermissions)
  if(role==='admin')return merge(setAll('none'),{qc_dashboard:'view',qc_records:'edit',qc_logs:'view',qc_settings:'edit'} as UserPermissions)
  if(role==='mandor_spraying')return merge(setAll('none'),{qc_dashboard:'view',qc_spraying:'edit',qc_records:'view',qc_settings:'view'} as UserPermissions)
  if(role==='mandor_fertilizer')return merge(setAll('none'),{qc_dashboard:'view',qc_fertilizer:'edit',qc_records:'view',qc_settings:'view'} as UserPermissions)
  if(role==='pengunjung')return merge(setAll('none'),{qc_dashboard:'view',qc_records:'view'} as UserPermissions)
  return NONE
}

export function normalizedPermissions(user:Pick<User,'role'|'permissions'>):UserPermissions{
  const defaults=defaultPermissionsForRole(user.role)
  const custom=user.permissions&&typeof user.permissions==='object'?user.permissions:{}
  return {...defaults,...custom}
}
export function accessMode(user:Pick<User,'role'|'permissions'>,key:PermissionKey):AccessMode{
  return normalizedPermissions(user)[key]||'none'
}
export function canViewAccess(user:Pick<User,'role'|'permissions'>,key:PermissionKey){return accessMode(user,key)!=='none'}
export function canEditAccess(user:Pick<User,'role'|'permissions'>,key:PermissionKey){return accessMode(user,key)==='edit'}
export function canOpenDataUnm(user:Pick<User,'role'|'permissions'>){
  return PERMISSION_CATALOG.some(item=>item.group==='Data UnM'&&canViewAccess(user,item.key))
}
export function canOpenQc(user:Pick<User,'role'|'permissions'>){
  return PERMISSION_CATALOG.some(item=>item.group==='Form QC'&&canViewAccess(user,item.key))
}
