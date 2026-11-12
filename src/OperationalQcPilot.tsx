import {useEffect,useState} from 'react'
import {onAuthStateChanged,type User} from 'firebase/auth'
import {firebaseAuth} from './firebase'
import {enqueuePilotQc,flushPilotQc} from './qcOperationalPilotAdapters'
import {listOperationalJobs} from './qcOperationalQueue.mjs'

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='
export default function OperationalQcPilot(){
  const [user,setUser]=useState<User|null>(firebaseAuth?.currentUser??null)
  const [count,setCount]=useState(0),[status,setStatus]=useState(''),[busy,setBusy]=useState(false)
  const [formType,setFormType]=useState<'spray'|'fertilizer'>('spray')
  useEffect(()=>firebaseAuth?onAuthStateChanged(firebaseAuth,setUser):undefined,[])
  async function refresh(uid:string){
    const jobs=await listOperationalJobs(uid)
    if(firebaseAuth?.currentUser?.uid===uid)setCount(jobs.length)
  }
  useEffect(()=>{setCount(0);setStatus('');if(user)void refresh(user.uid).catch(()=>setStatus('Antrean tidak dapat dibaca.'))},[user?.uid])
  async function run(action:'queue'|'flush'){
    if(!user||busy)return
    setBusy(true);setStatus('')
    try{
      if(action==='queue'){
        const id='qc-operational-pilot-'+crypto.randomUUID()
        await enqueuePilotQc({uploaderUid:user.uid,baseRevision:null,action:'finalizeRecord',
          record:{id,ownerUid:user.uid,clientRevision:crypto.randomUUID(),formType,saveType:'ready',testOnly:true},
          changes:[{kind:'main',action:'replace',dataUrl:png},{kind:'hold',holdId:'hold-pilot',action:'replace',dataUrl:png},...(formType==='fertilizer'?[{kind:'scan' as const,action:'replace' as const,dataUrl:png}]:[])]
        })
        setStatus('Tersimpan di IndexedDB. Belum dikirim: '+id)
      }else{
        const result=await flushPilotQc()
        setStatus('Terkonfirmasi: '+result.sent+'; tersisa: '+result.left+(result.failures.length?' | '+result.failures.map(f=>f.error).join('; '):''))
      }
      await refresh(user.uid)
    }catch(e){setStatus(e instanceof Error?e.message:'Pilot gagal')}
    finally{setBusy(false)}
  }
  return <main style={{maxWidth:760,margin:'32px auto',padding:24,lineHeight:1.6}}>
    <h1>QC Operational Save Pilot</h1>
    <p>Owner saja. Data sintetis dan gambar contoh 1 piksel; tidak menyentuh QC operasional, Actual Plan, atau Spreadsheet. Objek pilot belum dibersihkan otomatis.</p>
    <p>{user?'Firebase: login tersedia':'Login terlebih dahulu melalui portal QC pada origin yang sama.'}</p>
    <p>Antrean akun: {count}</p>
    <label>Jenis QC <select value={formType} disabled={busy} onChange={e=>setFormType(e.target.value==='fertilizer'?'fertilizer':'spray')}><option value="spray">Spraying</option><option value="fertilizer">Fertilizer</option></select></label>
    <div><button disabled={!user||busy} onClick={()=>void run('queue')}>1. Simpan QC sintetis ke IndexedDB</button>{' '}
    <button disabled={!user||busy} onClick={()=>void run('flush')}>2. Kirim / Retry</button></div>
    <p role="status" style={{overflowWrap:'anywhere'}}>{status}</p>
  </main>
}
