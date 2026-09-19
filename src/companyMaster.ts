import { DEFAULT_COMPANY } from './groupConfig'

export type CompanyRecord={
  id:string
  code:string
  name:string
  prefixes:string[]
  active:boolean
  fallback?:boolean
}

export const FALLBACK_COMPANIES:CompanyRecord[]=[{
  id:DEFAULT_COMPANY.id,
  code:DEFAULT_COMPANY.code,
  name:DEFAULT_COMPANY.name,
  prefixes:['JAGF'],
  active:true,
  fallback:true,
}]

export function normalizeCompanyCode(value:string){return value.trim().toUpperCase().replace(/\s+/g,'-')}
export function normalizePrefix(value:string){return value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'')}
export function companyDocId(code:string){return normalizeCompanyCode(code).toLowerCase()}
export function pidPrefix(pid:string){return normalizePrefix(pid.split('-')[0]||'')}
export function findCompanyByPrefix(companies:CompanyRecord[],prefix:string){
  const normalized=normalizePrefix(prefix)
  return companies.find(company=>company.active&&company.prefixes.map(normalizePrefix).includes(normalized))||null
}
