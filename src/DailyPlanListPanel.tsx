import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query as fsQuery, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import DailyActionIcon from './DailyPlanActionIcon'
import { dailyPlansToWhatsApp, type DailyPlanTransfer } from './dailyPlanActions'
import { groupSavedDailyRows, type DailyComposerRequest, type SavedDailyGroup, type SavedDailyRow } from './dailyPlanWorkspaceTypes'
import type { User } from './types'

type Props={
  user:User
  onCopyToActual?:(dailyPlanIds:string[])=>void
  selectedDate?:string
  compact?:boolean
  refreshKey?:number
  onEditGroup?:(group:SavedDailyGroup)=>void
  onDuplicateGroup?:(group:SavedDailyGroup)=>void
  onChanged?:()=>void
}
type DailyRow=SavedDailyRow

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function num(value:unknown){const n=Number(value||0);return Number.isFinite(n)?n:0}
function materialsFromData(value:unknown):DailyRow['materials']{if(!Array.isArray(value))return[];return value.map(item=>{const x=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return{material:text(x.material),dosePerHa:num(x.dosePerHa),doseUnit:text(x.doseUnit),totalMaterial:num(x.totalMaterial),unit:text(x.unit)}}).filter(x=>x.material||x.dosePerHa||x.totalMaterial)}
function rowFromData(id:string,data:Record<string,unknown>):DailyRow{return{id,dailyPlanId:text(data.dailyPlanId||id),workGroupId:text(data.workGroupId),workGroupPidCount:num(data.workGroupPidCount),planningOrder:num(data.planningOrder),sourcePlanIdRaw:text(data.sourcePlanIdRaw),sourceType:text(data.sourceType),monthlyLinkStatus:text(data.monthlyLinkStatus),monthlyPlanLineId:text(data.monthlyPlanLineId),date:text(data.date),monthKey:text(data.monthKey),shift:text(data.shift),activity:text(data.activity),description:text(data.description),paddockRaw:text(data.paddockRaw),pid:text(data.pid),areaHa:num(data.areaHa),areaUnit:text(data.areaUnit)||'Ha',manpower:num(data.manpower),unitName:text(data.unitName),unitReady:num(data.unitReady),unitStandby:num(data.unitStandby),unitBreakdown:num(data.unitBreakdown),foreman:text(data.foreman),notes:text(data.notes),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),stage:text(data.stage),masterVariety:text(data.masterVariety),masterPending:data.masterPending===true,materials:materialsFromData(data.materials),lastModifiedSource:text(data.lastModifiedSource)}}
function formatHa(value:number,digits=2){return new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)+' Ha'}
function groupArea(group:SavedDailyGroup){return group.rows.reduce((sum,row)=>sum+row.areaHa,0)}
function groupKeySet(groups:SavedDailyGroup[]){return new Set(groups.map(group=>group.groupKey))}
async function writerContext(appUser:User){const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum tersedia.');const current=auth.currentUser;if(!current)throw new Error('Login Firebase tidak tersedia.');const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil user tidak ditemukan.');const p=snap.data() as Record<string,unknown>;if(p.active!==true||!['owner','asisten'].includes(text(p.role))||!['owner','asisten'].includes(appUser.role))throw new Error('Role tidak memiliki izin mengubah Daily Plan.');return{db,username:text(p.username)||appUser.username}}
function asTransfer(row:DailyRow):DailyPlanTransfer{return{dailyPlanId:row.dailyPlanId,workGroupId:row.workGroupId,planningOrder:row.planningOrder,date:row.date,shift:row.shift,sourceType:row.sourceType,monthlyPlanLineId:row.monthlyPlanLineId,companyCode:row.companyCode,farm:row.farm,pid:row.pid,activity:row.activity,description:row.description,areaHa:row.areaHa,manpower:row.manpower,unitName:row.unitName,unitReady:row.unitReady,unitStandby:row.unitStandby,unitBreakdown:row.unitBreakdown,foreman:row.foreman,notes:row.notes,materials:row.materials}}

export default function DailyPlanListPanel({user,onCopyToActual,selectedDate,compact=true,refreshKey=0,onEditGroup,onDuplicateGroup,onChanged}:Props){
  const[rows,setRows]=useState<DailyRow[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const[selectedGroupKeys,setSelectedGroupKeys]=useState<string[]>([])
  const[copyDate,setCopyDate]=useState(new Date().toISOString().slice(0,10))
  const[copyGroupKey,setCopyGroupKey]=useState(''),[groupCopyDate,setGroupCopyDate]=useState(new Date().toISOString().slice(0,10))

  async function load(){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    const dateFilter=selectedDate||new Date().toISOString().slice(0,10)
    setBusy(true);setMessage('Memuat Daily Plan '+dateFilter+'…')
    try{
      const planSnap=await getDocs(fsQuery(collection(firestoreDb,'daily_plans'),where('date','==',dateFilter)))
      const next=planSnap.docs.map(x=>rowFromData(x.id,x.data() as Record<string,unknown>)).sort((a,b)=>a.shift.localeCompare(b.shift,undefined,{numeric:true})||(a.planningOrder||999999)-(b.planningOrder||999999)||a.pid.localeCompare(b.pid,undefined,{numeric:true}))
      setRows(next);setSelectedGroupKeys([]);setMessage('Daily Plan '+dateFilter+': '+next.length+' PID · '+groupSavedDailyRows(next).length+' kegiatan.')
    }catch(error){setMessage(error instanceof Error?error.message:'Daily Plan gagal dimuat.')}finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[selectedDate,refreshKey])

  const groups=useMemo(()=>groupSavedDailyRows(rows),[rows])
  const selectedGroups=useMemo(()=>{const keys=new Set(selectedGroupKeys);return groups.filter(group=>keys.has(group.groupKey))},[groups,selectedGroupKeys])
  const shifts=useMemo(()=>[...new Set(groups.map(group=>group.shift||'-'))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[groups])

  function toggleGroup(groupKey:string){setSelectedGroupKeys(current=>current.includes(groupKey)?current.filter(x=>x!==groupKey):[...current,groupKey])}
  function toggleAll(){const keys=groups.map(group=>group.groupKey),all=keys.length>0&&keys.every(key=>selectedGroupKeys.includes(key));setSelectedGroupKeys(all?[]:keys)}

  async function copyWaGroups(targets:SavedDailyGroup[]){
    if(!targets.length){setMessage('Pilih minimal satu kegiatan untuk Copy WA.');return}
    const wa=dailyPlansToWhatsApp(targets.flatMap(group=>group.rows).map(asTransfer))
    try{await navigator.clipboard.writeText(wa);setMessage('Daily Planning disalin ke clipboard tanpa Plan ID. Tinggal paste ke WhatsApp.')}catch{window.prompt('Salin Daily Planning berikut:',wa)}
  }

  function copyToActual(){
    if(!selectedGroups.length){setMessage('Pilih minimal satu kegiatan untuk Copy to Actual.');return}
    onCopyToActual?.(selectedGroups.flatMap(group=>group.rows.map(row=>row.dailyPlanId)))
  }

  async function moveGroup(group:SavedDailyGroup,direction:-1|1){
    const sameShift=groups.filter(x=>x.shift===group.shift),index=sameShift.findIndex(x=>x.groupKey===group.groupKey),target=sameShift[index+direction]
    if(!target)return
    setBusy(true)
    try{
      const{db,username}=await writerContext(user),batch=writeBatch(db)
      const sourceOrder=group.planningOrder<999999?group.planningOrder:index+1,targetIndex=index+direction,targetOrder=target.planningOrder<999999?target.planningOrder:targetIndex+1
      group.rows.forEach(row=>batch.set(doc(db,'daily_plans',row.id),{planningOrder:targetOrder,lastModifiedSource:'WEB',updatedAt:serverTimestamp(),updatedBy:username},{merge:true}))
      target.rows.forEach(row=>batch.set(doc(db,'daily_plans',row.id),{planningOrder:sourceOrder,lastModifiedSource:'WEB',updatedAt:serverTimestamp(),updatedBy:username},{merge:true}))
      await batch.commit();setMessage('Urutan kegiatan diperbarui.');await load();onChanged?.()
    }catch(error){setMessage(error instanceof Error?error.message:'Urutan Daily Plan gagal diperbarui.')}finally{setBusy(false)}
  }

  async function hasLinkedActual(group:SavedDailyGroup){
    if(!firestoreDb)return false
    const ids=group.rows.map(row=>row.dailyPlanId).filter(Boolean)
    for(let i=0;i<ids.length;i+=30){
      const snap=await getDocs(fsQuery(collection(firestoreDb,'daily_reports'),where('dailyPlanId','in',ids.slice(i,i+30))))
      if(!snap.empty)return true
    }
    return false
  }

  async function deleteGroup(group:SavedDailyGroup){
    if(await hasLinkedActual(group)){setMessage('Tidak dapat menghapus '+(group.description||group.activity)+'. Salah satu PID sudah memiliki Actual Plan terkait. Edit/hapus Actual terlebih dahulu.');return}
    if(!window.confirm('Hapus kegiatan '+(group.description||group.activity)+' beserta '+group.rows.length+' PID dari Daily Plan?'))return
    setBusy(true)
    try{
      const{db}=await writerContext(user),batch=writeBatch(db);group.rows.forEach(row=>batch.delete(doc(db,'daily_plans',row.id)));await batch.commit()
      setMessage('Kegiatan berhasil dihapus.');await load();onChanged?.()
    }catch(error){setMessage(error instanceof Error?error.message:'Hapus Daily Plan gagal.')}finally{setBusy(false)}
  }

  async function copyGroupsToDate(targets:SavedDailyGroup[],targetDate:string){
    if(!targets.length){setMessage('Pilih minimal satu kegiatan yang akan disalin.');return}
    if(!targetDate){setMessage('Pilih tanggal tujuan.');return}
    if(!window.confirm('Salin '+targets.length+' kegiatan ke tanggal '+targetDate+'?'))return
    setBusy(true)
    try{
      const{db,username}=await writerContext(user),existingSnap=await getDocs(fsQuery(collection(db,'daily_plans'),where('date','==',targetDate))),existing=existingSnap.docs.map(x=>rowFromData(x.id,x.data() as Record<string,unknown>))
      const prefix='DP-'+targetDate.replaceAll('-','')+'-'
      let seq=existing.map(x=>x.dailyPlanId.startsWith(prefix)?Number(x.dailyPlanId.slice(prefix.length)):0).filter(Number.isFinite).reduce((m,x)=>Math.max(m,x),0)
      const orderByShift=new Map<string,number>()
      for(const row of existing)orderByShift.set(row.shift,Math.max(orderByShift.get(row.shift)||0,row.planningOrder||0))
      const batch=writeBatch(db)
      for(const group of targets){
        const workGroupId='WG-'+targetDate.replaceAll('-','')+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)
        const planningOrder=(orderByShift.get(group.shift)||0)+1;orderByShift.set(group.shift,planningOrder)
        for(const sourceRow of group.rows){
          seq++;const dailyPlanId=prefix+String(seq).padStart(4,'0'),payload:Record<string,unknown>={...sourceRow,dailyPlanId,workGroupId,workGroupPidCount:group.rows.length,planningOrder,date:targetDate,monthKey:targetDate.slice(0,7),copiedFromDailyPlanId:sourceRow.dailyPlanId,copiedFromWorkGroupId:group.workGroupId,sourceOrigin:'WEB',lastModifiedSource:'WEB',createdAt:serverTimestamp(),createdBy:username,updatedAt:serverTimestamp(),updatedBy:username}
          delete payload.id
          batch.set(doc(db,'daily_plans',dailyPlanId),payload)
        }
      }
      await batch.commit();setMessage(targets.length+' kegiatan berhasil disalin ke '+targetDate+'.');setCopyGroupKey('');onChanged?.()
    }catch(error){setMessage(error instanceof Error?error.message:'Copy to Date gagal.')}finally{setBusy(false)}
  }

  const totals=useMemo(()=>groups.reduce((acc,group)=>({groups:acc.groups+1,pids:acc.pids+group.rows.length,area:acc.area+groupArea(group),hk:acc.hk+group.manpower}),{groups:0,pids:0,area:0,hk:0}),[groups])

  return <section className="daily-period-saved">
    <div className="section-head compact-saved-head"><div><div className="eyebrow">PLAN TERSIMPAN</div><h3>Daily Plan · {selectedDate||'-'}</h3><p className="muted">{groups.length} kegiatan · {rows.length} PID. Edit dan duplikat menggunakan form utama di atas.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'…':'Refresh'}</button></div>
    {message&&<div className="alert">{message}</div>}
    <div className="plan-summary-grid daily-draft-summary"><div><span>Kegiatan</span><strong>{totals.groups}</strong></div><div><span>PID</span><strong>{totals.pids}</strong></div><div><span>Total Luas</span><strong>{formatHa(totals.area)}</strong></div><div><span>Total HK</span><strong>{totals.hk}</strong></div></div>
    <div className="panel daily-bulk-actions compact-bulk-actions"><div><strong>{selectedGroups.length} kegiatan dipilih</strong><span className="muted">Aksi massal berdasarkan group kegiatan</span></div><div className="row-actions"><button type="button" onClick={toggleAll}>{groups.length&&groups.every(group=>selectedGroupKeys.includes(group.groupKey))?'Batal Semua':'Pilih Semua'}</button><button type="button" onClick={copyToActual} disabled={!selectedGroups.length}>Copy Actual</button><button type="button" onClick={()=>void copyWaGroups(selectedGroups)} disabled={!selectedGroups.length}>Copy WA</button><label className="daily-copy-date"><span>Copy tanggal</span><input type="date" value={copyDate} onChange={e=>setCopyDate(e.target.value)}/></label><button type="button" onClick={()=>void copyGroupsToDate(selectedGroups,copyDate)} disabled={!selectedGroups.length||busy}>Salin</button></div></div>

    <div className="daily-saved-shifts">{shifts.map(shift=>{const shiftGroups=groups.filter(group=>(group.shift||'-')===shift);return <section key={shift} className="daily-draft-shift"><div className="daily-draft-shift-title"><strong>SHIFT {shift}</strong><span>{shiftGroups.length} kegiatan</span></div><div className="daily-draft-card-list">{shiftGroups.map((group,index)=><article className={'daily-draft-card '+(selectedGroupKeys.includes(group.groupKey)?'daily-saved-selected':'')} key={group.groupKey}>
      <div className="daily-draft-card-head">
        <div className="daily-draft-title-row"><label className="daily-saved-select" title="Pilih kegiatan"><input type="checkbox" checked={selectedGroupKeys.includes(group.groupKey)} onChange={()=>toggleGroup(group.groupKey)}/></label><div><span className="eyebrow"># {index+1} · {group.sourceType}</span><h4>{group.description||group.activity||'-'} <small>({formatHa(groupArea(group))})</small></h4></div></div>
        <div className="daily-saved-group-actions" aria-label="Aksi Daily Plan tersimpan">
          <button type="button" className="daily-icon-action" title="Naik" aria-label="Naik" disabled={index===0||busy} onClick={()=>void moveGroup(group,-1)}><DailyActionIcon name="up"/></button>
          <button type="button" className="daily-icon-action" title="Turun" aria-label="Turun" disabled={index===shiftGroups.length-1||busy} onClick={()=>void moveGroup(group,1)}><DailyActionIcon name="down"/></button>
          <button type="button" className="daily-icon-action wa" title="Copy WA" aria-label="Copy WA" onClick={()=>void copyWaGroups([group])}><DailyActionIcon name="wa"/></button>
          <button type="button" className="daily-icon-action" title="Salin ke tanggal" aria-label="Salin ke tanggal" onClick={()=>{setCopyGroupKey(current=>current===group.groupKey?'':group.groupKey);setGroupCopyDate(selectedDate||new Date().toISOString().slice(0,10))}}><DailyActionIcon name="calendar"/></button>
          <button type="button" className="daily-icon-action" title="Duplikat ke form" aria-label="Duplikat" onClick={()=>onDuplicateGroup?.(group)}><DailyActionIcon name="copy"/></button>
          <button type="button" className="daily-icon-action" title="Edit di form utama" aria-label="Edit" onClick={()=>onEditGroup?.(group)}><DailyActionIcon name="edit"/></button>
          <button type="button" className="daily-icon-action danger" title="Hapus kegiatan" aria-label="Hapus" disabled={busy} onClick={()=>void deleteGroup(group)}><DailyActionIcon name="trash"/></button>
        </div>
      </div>
      {copyGroupKey===group.groupKey&&<div className="daily-card-copy-date"><label><span>Salin ke tanggal</span><input type="date" value={groupCopyDate} onChange={e=>setGroupCopyDate(e.target.value)}/></label><button type="button" onClick={()=>setCopyGroupKey('')}>Batal</button><button type="button" className="primary" onClick={()=>void copyGroupsToDate([group],groupCopyDate)}>Salin</button></div>}
      <div className="daily-draft-pids">{group.rows.map(row=><span key={row.id}>📍 {row.pid||'-'} <b>{formatHa(row.areaHa)}</b></span>)}</div>
      <div className="daily-draft-details"><span>👷 Mandor <b>{group.foreman||'-'}</b></span><span>HK <b>{group.manpower}</b></span><span>🚜 Alat <b>{group.unitName||'-'}</b></span><span>⚙️ 🟢{group.unitReady} · 🔴{group.unitBreakdown} · 🟡{group.unitStandby}</span></div>
      {group.rows.some(row=>row.materials.length>0)&&<div className="daily-draft-materials">{Array.from(new Map(group.rows.flatMap(row=>row.materials).map(m=>[m.material+'|'+m.unit,m])).values()).map(m=>{const total=group.rows.flatMap(row=>row.materials).filter(x=>x.material===m.material&&x.unit===m.unit).reduce((sum,x)=>sum+x.totalMaterial,0);return <span key={m.material+'|'+m.unit}><b>{m.material}</b> · {m.dosePerHa} {m.doseUnit||m.unit}/Ha · Tot {total.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</span>})}</div>}
      {group.notes&&<div className="daily-draft-note">ℹ️ {group.notes}</div>}
    </article>)}</div></section>})}</div>
    {!groups.length&&<div className="daily-draft-empty">Belum ada Daily Plan pada tanggal ini.</div>}
  </section>
}
