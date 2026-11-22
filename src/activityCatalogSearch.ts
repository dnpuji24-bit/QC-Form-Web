import type { CoaActivity } from './activityCatalogModel'

/** Normalize terms across department, activity, Operation Code and COA.
 * Every token must match; "top dressing ratoon" finds only the Ratoon row.
 */
function normalize(value:string):string {
  return String(value||'').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]+/g,' ').trim()
}
export function searchActivityCatalog(options:CoaActivity[],input:string,limit=10):CoaActivity[] {
  const terms=normalize(input).split(/\s+/).filter(Boolean)
  const ranked=options.map(row=>{
    const name=normalize(row.name),operation=normalize(row.operationCode),coa=normalize(row.coaCode)
    const dept=normalize(row.department),category=normalize(row.activityCategory)
    const haystack=[name,operation,coa,dept,category].join(' ')
    if(!terms.every(term=>haystack.includes(term)))return null
    const query=terms.join(' ')
    const rank=!terms.length?4:operation===query||coa===query?0:
      operation.startsWith(query)||name===query?1:
      name.startsWith(query)?2:dept.startsWith(query)?3:4
    return {row,rank}
  }).filter((item):item is {row:CoaActivity;rank:number}=>item!==null)
  ranked.sort((a,b)=>a.rank-b.rank
    ||a.row.name.localeCompare(b.row.name,'id')
    ||a.row.department.localeCompare(b.row.department,'id')
    ||a.row.operationCode.localeCompare(b.row.operationCode,'id'))
  return ranked.slice(0,Math.max(1,limit))
}
