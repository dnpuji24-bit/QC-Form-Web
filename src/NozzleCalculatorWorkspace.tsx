import { useEffect,useState } from 'react'
import { collection,getDocs } from 'firebase/firestore'
import { firestoreDb } from './firebase'
import { loadOperationalResources } from './masterOperationalResources'
import { NOZZLE_SPEC_COLLECTION,nozzleSpecFromData,type NozzleSpec } from './nozzlePerformance'
import NozzleCalculatorPanel from './NozzleCalculatorPanel'

type ResourceNozzle={id:string;name:string;active:boolean}
export default function NozzleCalculatorWorkspace(){
 const[resources,setResources]=useState<ResourceNozzle[]>([])
 const[specs,setSpecs]=useState<NozzleSpec[]>([])
 const[busy,setBusy]=useState(false)
 const[error,setError]=useState('')
 async function load(){
  setBusy(true);setError('')
  try{
   if(!firestoreDb)throw new Error('Firestore belum siap.')
   const[resourceList,snap]=await Promise.all([
    loadOperationalResources('nozzle'),
    getDocs(collection(firestoreDb,NOZZLE_SPEC_COLLECTION)),
   ])
   const available=snap.docs.flatMap(doc=>{const spec=nozzleSpecFromData(doc.data() as Record<string,unknown>);return spec?[spec]:[]})
   setResources(resourceList);setSpecs(available.sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})))
  }catch(error){setError(error instanceof Error?error.message:'Spesifikasi nozzle tidak dapat dimuat.')}
  finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[])
 return <section className="nozzle-workspace">
  <div className="section-head"><div><div className="eyebrow">PERHITUNGAN OPERASIONAL</div><h3>Kalkulator Nozzle</h3><p className="muted">Menggunakan tabel pressure–flow–droplet dari Master Resource → Nozzle. Tidak menyimpan tabel nozzle tersendiri di kode kalkulator.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memuat…':'Refresh Data Nozzle'}</button></div>
  {error&&<div className="alert danger">{error}</div>}
  {!busy&&!specs.length&&<div className="alert">Belum ada spesifikasi yang diunggah. Buka Master Activity → Master Resource → Nozzle dan unggah Excel ketentuan nozzle terlebih dahulu.</div>}
  <NozzleCalculatorPanel resources={resources} specs={specs}/>
 </section>
}
