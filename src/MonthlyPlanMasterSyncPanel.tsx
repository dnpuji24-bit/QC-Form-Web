import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import type { User } from './types'

type Props={user:User}
type FirestoreProfile={active?:boolean;role?:string;username?:string}
type MasterPaddock={pid:string;companyCode:string;farm:string;stage:string;areaPaddockHa:number;variety:string}
type PlanRow={id:string;planLineId:string;pid:string;companyCode:string;farm:string;stage:string;areaPaddockHa:number;masterVariety:string;masterPaddockStatus:string}
type SyncRow=PlanRow&{master?:MasterPaddock;needsSync:boolean}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function num(value:unknown){const parsed=Number(value||0);return Number.isFinite(parsed)?parsed:0}
function sameNumber(a:number,b:number){return Math.abs(a-b)<0.000001}
function formatHa(value:number,digits=2){return`${new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)} Ha`}

function paddockFromData(id:string,data:Record<string,unknown>):MasterPaddock{
  return{pid:text(data.pid||id).toUpperCase(),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),stage:text(data.currentStage||'PC'),areaPaddockHa:num(data.areaPlantedHa),variety:text(data.variety)}
}
function planFromData(id:string,data:Record<string,unknown>):PlanRow{
  return{id,planLineId:text(data.planLineId||data.planCode||id),pid:text(data.pid).toUpperCase(),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),stage:text(data.stage),areaPaddockHa:num(data.areaPaddockHa),masterVariety:text(data.masterVariety),masterPaddockStatus:text(data.masterPaddockStatus).toUpperCase()}
}

async function writerContext(appUser:User){
  const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum terkonfigurasi.')
  const current=auth.currentUser;if(!current)throw new Error('Firebase Auth belum terhubung. Login ulang terlebih dahulu.')
  const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil Firebase user tidak ditemukan.')
  const profile=snap.data() as FirestoreProfile;if(profile.active!==true)throw new Error('Profil Firebase tidak aktif.')
  if(!['owner','asisten'].includes(profile.role||'')||!['owner','asisten'].includes(appUser.role))throw new Error('Role tidak memiliki izin sinkronisasi Monthly Plan.')
  return{db,username:profile.username||appUser.username}
}

export default function MonthlyPlanMasterSyncPanel({user}:Props){
  const[rows,setRows]=useState<SyncRow[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')

  async function load(){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    setBusy(true);setMessage('Memeriksa Monthly Plan terhadap Master Paddock…')
    try{
      const[paddockSnap,planSnap]=await Promise.all([getDocs(collection(firestoreDb,'master_paddocks')),getDocs(collection(firestoreDb,'monthly_plans'))])
      const masterMap=new Map<string,MasterPaddock>()
      paddockSnap.docs.forEach(item=>{const row=paddockFromData(item.id,item.data() as Record<string,unknown>);masterMap.set(row.pid,row)})
      const next=planSnap.docs.map(item=>{
        const plan=planFromData(item.id,item.data() as Record<string,unknown>),master=masterMap.get(plan.pid)
        const needsSync=master?plan.companyCode!==master.companyCode||plan.farm!==master.farm||plan.stage!==master.stage||!sameNumber(plan.areaPaddockHa,master.areaPaddockHa)||plan.masterVariety!==master.variety||plan.masterPaddockStatus!=='MATCHED':plan.masterPaddockStatus!=='PENDING'
        return{...plan,master,needsSync}
      }).sort((a,b)=>Number(Boolean(a.master))-Number(Boolean(b.master))||a.pid.localeCompare(b.pid,undefined,{numeric:true})||a.planLineId.localeCompare(b.planLineId,undefined,{numeric:true}))
      setRows(next)
      const matched=next.filter(x=>x.master).length,pending=next.length-matched,need=next.filter(x=>x.needsSync).length
      setMessage(`Pemeriksaan selesai: ${matched} Plan Line sudah memiliki Master Paddock; ${pending} MASTER PENDING; ${need} metadata perlu disinkronkan.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Pemeriksaan Master Paddock gagal.')}finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[])

  const stats=useMemo(()=>({total:rows.length,matched:rows.filter(x=>x.master).length,pending:rows.filter(x=>!x.master).length,need:rows.filter(x=>x.needsSync).length}),[rows])
  const pendingRows=useMemo(()=>rows.filter(x=>!x.master),[rows])
  const changedRows=useMemo(()=>rows.filter(x=>x.needsSync),[rows])

  async function sync(){
    if(!changedRows.length){setMessage('Semua metadata Master Paddock sudah sinkron.');return}
    const confirmation=window.prompt(`Akan menyinkronkan metadata Master Paddock pada ${changedRows.length} Monthly Plan. Target, Activity, Week, Plan ID, actual, balance, dan keterangan TIDAK diubah. Ketik SYNC untuk lanjut.`,'')
    if(confirmation!=='SYNC')return
    setBusy(true);setMessage('Menyinkronkan metadata Master Paddock…')
    try{
      const{db,username}=await writerContext(user)
      for(let start=0;start<changedRows.length;start+=400){
        const batch=writeBatch(db)
        changedRows.slice(start,start+400).forEach(row=>{
          const payload=row.master?{companyCode:row.master.companyCode,farm:row.master.farm,stage:row.master.stage,areaPaddockHa:row.master.areaPaddockHa,masterVariety:row.master.variety,masterPaddockStatus:'MATCHED',masterPaddockSyncedAt:serverTimestamp(),masterPaddockSyncedBy:username}:{masterPaddockStatus:'PENDING',masterPaddockSyncedAt:serverTimestamp(),masterPaddockSyncedBy:username}
          batch.set(doc(db,'monthly_plans',row.id),payload,{merge:true})
        })
        await batch.commit()
      }
      setMessage(`Sinkronisasi selesai. ${changedRows.filter(x=>x.master).length} record diperkaya dari Master Paddock; ${changedRows.filter(x=>!x.master).length} record ditandai MASTER PENDING. Data Planning tidak diubah.`)
      await load()
    }catch(error){setMessage(error instanceof Error?error.message:'Sinkronisasi Master Paddock gagal.')}finally{setBusy(false)}
  }

  return <section>
    <div className="section-head"><div><div className="eyebrow">MONTHLY PLAN</div><h2>Sinkron Master Paddock</h2><p className="muted">Untuk Planning, PID boleh muncul sebelum tercatat di Master Paddock. Fitur ini hanya memperkaya metadata Company, Farm, Stage, Area Paddock, dan Master Variety setelah master tersedia. Target Plan, Activity, Week, Plan ID, realisasi, balance, dan keterangan tidak disentuh.</p></div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memuat…':'Periksa Ulang'}</button><button type="button" className="primary" disabled={busy||!changedRows.length} onClick={()=>void sync()}>Sinkronkan Master Paddock</button></div></div>
    {message&&<div className="alert" style={{whiteSpace:'pre-line'}}>{message}</div>}
    <div className="cards" style={{marginTop:18}}><div className="card"><span>PLAN LINE</span><strong>{stats.total}</strong></div><div className="card"><span>MASTER MATCHED</span><strong>{stats.matched}</strong></div><div className="card"><span>MASTER PENDING</span><strong>{stats.pending}</strong></div><div className="card"><span>PERLU SYNC</span><strong>{stats.need}</strong></div></div>
    <div className="panel" style={{marginTop:18}}><h3>MASTER PENDING</h3><p className="muted">Kondisi normal untuk paddock yang belum tertanam atau update Master Paddock belum masuk. Record Monthly Plan tetap valid.</p><div className="table-wrap"><table><thead><tr><th>Plan ID</th><th>PID</th><th>Status</th></tr></thead><tbody>{pendingRows.slice(0,200).map(row=><tr key={row.id}><td>{row.planLineId}</td><td><strong>{row.pid}</strong></td><td>MASTER PENDING</td></tr>)}</tbody></table></div>{!pendingRows.length&&<p className="muted">Tidak ada PID yang menunggu Master Paddock.</p>}{pendingRows.length>200&&<p className="muted">Menampilkan 200 dari {pendingRows.length} record.</p>}</div>
    <div className="panel" style={{marginTop:18}}><h3>Perubahan Metadata yang Terdeteksi</h3><div className="table-wrap"><table><thead><tr><th>Plan ID</th><th>PID</th><th>Company</th><th>Farm</th><th>Stage</th><th>Area Paddock</th><th>Master Variety</th></tr></thead><tbody>{changedRows.filter(x=>x.master).slice(0,200).map(row=><tr key={row.id}><td>{row.planLineId}</td><td>{row.pid}</td><td>{row.companyCode||'-'} → {row.master?.companyCode||'-'}</td><td>{row.farm||'-'} → {row.master?.farm||'-'}</td><td>{row.stage||'-'} → {row.master?.stage||'-'}</td><td>{formatHa(row.areaPaddockHa)} → {formatHa(row.master?.areaPaddockHa||0)}</td><td>{row.masterVariety||'-'} → {row.master?.variety||'-'}</td></tr>)}</tbody></table></div>{!changedRows.some(x=>x.master)&&<p className="muted">Tidak ada metadata Master Paddock yang perlu diperbarui.</p>}</div>
  </section>
}
