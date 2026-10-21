import { getDocs, getDocsFromCache, type DocumentData, type Query, type QuerySnapshot } from 'firebase/firestore'

/** Read the server when reachable; use Firestore's existing persistent local cache
 * when offline or if a transient network read fails.
 * Missing cache is NOT interpreted as an authoritative empty dataset.
 */
export async function getPlanDocsWithCache<T extends DocumentData=DocumentData>(query:Query<T>):Promise<QuerySnapshot<T>>{
 if(typeof navigator!=='undefined'&&!navigator.onLine){
  return getDocsFromCache(query)
 }
 try{return await getDocs(query)}
 catch(error){
  const code=String((error as {code?:string})?.code||'')
  const message=String((error as Error)?.message||error||'')
  if(!/unavailable|deadline-exceeded|network|offline|failed to fetch/i.test(code+' '+message))throw error
  return getDocsFromCache(query)
 }
}
export function planOfflineMessage(date:string,count:number,kind:'Daily'|'Actual'){
 return 'Mode offline · '+kind+' '+date+': '+count+' record dari cache perangkat. Data yang belum pernah dibuka memerlukan koneksi. Draft disimpan lokal dan perubahan final harus dikonfirmasi saat online.'
}
