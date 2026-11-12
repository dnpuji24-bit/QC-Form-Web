// Read-only cutover inventory: never infer historical ownership or discard jobs.
export function summarizeLegacyQueue(items,username){
 const normalize=v=>String(v??'').trim().toLowerCase()
 const current=normalize(username)
 const result={total:0,own:0,other:0,unattributed:0,conflicting:0}
 for(const item of items){
  result.total++
  const explicit=normalize(item?.ownerUsername),historical=normalize(item?.record?.inputtedBy)
  if(explicit&&historical&&explicit!==historical){result.conflicting++;continue}
  const owner=explicit||historical
  if(!owner){result.unattributed++;continue}
  if(current&&owner===current)result.own++;else result.other++
 }
 return result
}
export function strictLegacyOwner(item,username){
 const s=summarizeLegacyQueue([item],username)
 return s.own===1
}
