import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import type { User } from './types'

type Props={user:User}
type SheetRow=Record<string,unknown>
type ImportStatus='CREATE'|'UPDATE'|'NO_CHANGE'
type IssueLevel='ERROR'|'WARNING'|'INFO'
type Issue={level:IssueLevel;pid?:string;message:string}
type StageSummary={stage:string;areaHa:number;startDate:string|null;endDate:string|null;rows:number}
type ParsedMaster={
  pid:string
  cycleId:string
  cycleNumber:number
  region:string
  farm:string
  block:string
  paddock:string
  blockLc:string
  variety:string
  areaPlantedHa:number
  plantStartDate:string
  plantEndDate:string
  currentStage:string
  harvestedCurrentStageHa:number
  harvestStartCurrentStage:string|null
  lastHarvestDate:string|null
  remainingHarvestCurrentStageHa:number
  harvestProgressCurrentStagePct:number
  harvestStages:StageSummary[]
  sourcePlantRows:number
  sourceHarvestRows:number
  sourceAreaPaddockRef:number|null
  active:boolean
}
type PreviewRow=ParsedMaster&{status:ImportStatus;changes:string[]}
type ParsedFile={rows:ParsedMaster[];issues:Issue[];fileName:string;plantRowCount:number;harvestRowCount:number}
type TimedRow={date:Date;row:SheetRow;sourceRow:number}

type FirestoreProfile={active?:boolean;role?:string;username?:string}

const PLANT_SHEET='Area Plant'
const HARVEST_SHEET='Area Harvest'
const CHANGE_FIELDS:(keyof ParsedMaster)[]=['region','farm','block','paddock','blockLc','variety','areaPlantedHa','plantStartDate','plantEndDate','currentStage','harvestedCurrentStageHa','harvestStartCurrentStage','lastHarvestDate','remainingHarvestCurrentStageHa','cycleId','active']

function normalized(value:string){return value.trim().toLowerCase().replace(/\s+/g,' ')}
function rowValue(row:SheetRow,...names:string[]){
  const lookup=new Map(Object.keys(row).map(key=>[normalized(key),row[key]]))
  for(const name of names){const value=lookup.get(normalized(name));if(value!==undefined)return value}
  return undefined
}
function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function numberValue(value:unknown){
  if(typeof value==='number'&&Number.isFinite(value))return value
  const raw=text(value)
  if(!raw)return 0
  const cleaned=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw
  const parsed=Number(cleaned)
  return Number.isFinite(parsed)?parsed:NaN
}
function excelDate(value:unknown){
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return value
  if(typeof value==='number'&&value>0&&value<100000){
    const parts=XLSX.SSF.parse_date_code(value)
    if(parts)return new Date(Date.UTC(parts.y,parts.m-1,parts.d,parts.H||0,parts.M||0,Math.floor(parts.S||0)))
  }
  const raw=text(value)
  if(!raw)return null
  const dmy=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  if(dmy)return new Date(Date.UTC(Number(dmy[3]),Number(dmy[2])-1,Number(dmy[1])))
  const parsed=new Date(raw)
  return Number.isNaN(parsed.getTime())?null:parsed
}
function isoDay(date:Date|null){return date?date.toISOString().slice(0,10):null}
function compactDay(date:Date){return date.toISOString().slice(0,10).replaceAll('-','')}
function round(value:number,digits=4){const factor=10**digits;return Math.round((value+Number.EPSILON)*factor)/factor}
function latest<T extends TimedRow>(rows:T[]){return [...rows].sort((a,b)=>a.date.getTime()-b.date.getTime()).at(-1)}
function getSheetRows(workbook:XLSX.WorkBook,name:string){
  const sheet=workbook.Sheets[name]
  if(!sheet)throw new Error(`Sheet "${name}" tidak ditemukan. Gunakan file Administrasi dengan sheet ${PLANT_SHEET} dan ${HARVEST_SHEET}.`)
  return XLSX.utils.sheet_to_json<SheetRow>(sheet,{defval:null,raw:true})
}
function pidParts(pid:string){const parts=pid.split('-');return parts.length>=4?{region:parts[0],farm:parts[1],block:parts[2],paddock:parts.slice(3).join('-')}:{region:'',farm:'',block:'',paddock:''}}
function sameValue(a:unknown,b:unknown,key:keyof ParsedMaster){
  if(typeof a==='number'||typeof b==='number')return Math.abs(Number(a||0)-Number(b||0))<0.0001
  if(key==='active')return Boolean(a)===Boolean(b)
  return String(a??'')===String(b??'')
}
function displayChange(key:keyof ParsedMaster){
  const labels:Partial<Record<keyof ParsedMaster,string>>={areaPlantedHa:'luas tanam',currentStage:'stage',harvestedCurrentStageHa:'luas harvest stage',variety:'variety',blockLc:'Block LC',cycleId:'crop cycle',plantStartDate:'awal tanam',plantEndDate:'akhir tanam',lastHarvestDate:'harvest terakhir'}
  return labels[key]||String(key)
}

function parseWorkbook(buffer:ArrayBuffer,fileName:string):ParsedFile{
  const workbook=XLSX.read(buffer,{type:'array',cellDates:true})
  const plantRaw=getSheetRows(workbook,PLANT_SHEET)
  const harvestRaw=getSheetRows(workbook,HARVEST_SHEET)
  const issues:Issue[]=[]
  const plantByPid=new Map<string,TimedRow[]>()
  const harvestByPid=new Map<string,TimedRow[]>()

  plantRaw.forEach((row,index)=>{
    const pid=text(rowValue(row,'PID'))
    if(!pid){issues.push({level:'ERROR',message:`Area Plant baris ${index+2}: PID kosong.`});return}
    const progress=numberValue(rowValue(row,'Progres (Ha)','Progress (Ha)','Progres (Ha) '))
    if(!Number.isFinite(progress)||progress<0){issues.push({level:'ERROR',pid,message:`Area Plant baris ${index+2}: Progres (Ha) tidak valid.`});return}
    const date=excelDate(rowValue(row,'Progress Date'))
    if(!date){issues.push({level:'ERROR',pid,message:`Area Plant baris ${index+2}: Progress Date tidak valid.`});return}
    const rows=plantByPid.get(pid)||[];rows.push({date,row,sourceRow:index+2});plantByPid.set(pid,rows)
  })

  harvestRaw.forEach((row,index)=>{
    const pid=text(rowValue(row,'PID'))
    if(!pid){issues.push({level:'WARNING',message:`Area Harvest baris ${index+2}: PID kosong, dilewati.`});return}
    const progress=numberValue(rowValue(row,'Progres (Ha) Area Geometri','Progress (Ha) Area Geometri','Progres (Ha)','Progress (Ha)'))
    if(!Number.isFinite(progress)||progress<0){issues.push({level:'WARNING',pid,message:`Area Harvest baris ${index+2}: progres harvest tidak valid, dilewati.`});return}
    const date=excelDate(rowValue(row,'Harvest Date'))
    if(!date){issues.push({level:'WARNING',pid,message:`Area Harvest baris ${index+2}: Harvest Date tidak valid, dilewati.`});return}
    const rows=harvestByPid.get(pid)||[];rows.push({date,row,sourceRow:index+2});harvestByPid.set(pid,rows)
  })

  for(const pid of harvestByPid.keys())if(!plantByPid.has(pid))issues.push({level:'WARNING',pid,message:'PID ada di Area Harvest tetapi tidak ada di Area Plant; tidak dibuat sebagai Master Paddock.'})

  const masters:ParsedMaster[]=[]
  for(const [pid,plantRowsUnsorted] of [...plantByPid.entries()].sort(([a],[b])=>a.localeCompare(b))){
    const plantRows=[...plantRowsUnsorted].sort((a,b)=>a.date.getTime()-b.date.getTime())
    const harvestRows=[...(harvestByPid.get(pid)||[])].sort((a,b)=>a.date.getTime()-b.date.getTime())
    const events=[...plantRows.map(item=>({...item,event:'plant' as const})),...harvestRows.map(item=>({...item,event:'harvest' as const}))].sort((a,b)=>a.date.getTime()-b.date.getTime()||(a.event==='plant'?-1:1))
    let cycle=0,harvestSeenSincePlant=false
    const plantCycles=new Map<number,TimedRow[]>(),harvestCycles=new Map<number,TimedRow[]>()
    for(const event of events){
      if(event.event==='plant'){
        if(cycle===0)cycle=1
        else if(harvestSeenSincePlant){cycle+=1;harvestSeenSincePlant=false}
        const rows=plantCycles.get(cycle)||[];rows.push(event);plantCycles.set(cycle,rows)
      }else{
        if(cycle===0){issues.push({level:'WARNING',pid,message:`Harvest ${isoDay(event.date)} terjadi sebelum Area Plant pertama dan tidak dipakai pada cycle aktif.`});continue}
        const rows=harvestCycles.get(cycle)||[];rows.push(event);harvestCycles.set(cycle,rows);harvestSeenSincePlant=true
      }
    }
    const currentCycle=Math.max(...plantCycles.keys())
    const currentPlants=plantCycles.get(currentCycle)||[]
    const currentHarvests=harvestCycles.get(currentCycle)||[]
    if(!currentPlants.length){issues.push({level:'ERROR',pid,message:'Tidak ada Area Plant valid untuk cycle aktif.'});continue}
    const plantStart=new Date(Math.min(...currentPlants.map(r=>r.date.getTime())))
    const plantEnd=new Date(Math.max(...currentPlants.map(r=>r.date.getTime())))
    const currentMeta=latest(currentPlants)!
    const parts=pidParts(pid)
    const areaPlanted=round(currentPlants.reduce((sum,item)=>sum+numberValue(rowValue(item.row,'Progres (Ha)','Progress (Ha)','Progres (Ha) ')),0))
    if(areaPlanted<=0)issues.push({level:'ERROR',pid,message:'Total Area Plant Progres (Ha) untuk cycle aktif = 0.'})
    const blockLcs=[...new Set(currentPlants.map(item=>text(rowValue(item.row,'Block LC'))).filter(Boolean))]
    const varieties=[...new Set(currentPlants.map(item=>text(rowValue(item.row,'Variety'))).filter(Boolean))]
    if(blockLcs.length>1)issues.push({level:'WARNING',pid,message:`Cycle aktif memiliki beberapa Block LC: ${blockLcs.join(', ')}. Master memakai nilai dari baris tanam terbaru.`})
    if(varieties.length>1)issues.push({level:'WARNING',pid,message:`Cycle aktif memiliki beberapa Variety: ${varieties.join(', ')}. Master memakai nilai dari baris tanam terbaru.`})

    const latestHarvest=latest(currentHarvests)
    const currentStage=latestHarvest?text(rowValue(latestHarvest.row,'Planting Stage (pc,r1,r2..)'))||'PC':'PC'
    const stageGroups=new Map<string,TimedRow[]>()
    currentHarvests.forEach(item=>{const stage=text(rowValue(item.row,'Planting Stage (pc,r1,r2..)'))||'UNKNOWN';const rows=stageGroups.get(stage)||[];rows.push(item);stageGroups.set(stage,rows)})
    const harvestStages:StageSummary[]=[...stageGroups.entries()].map(([stage,rows])=>({
      stage,
      areaHa:round(rows.reduce((sum,item)=>sum+numberValue(rowValue(item.row,'Progres (Ha) Area Geometri','Progress (Ha) Area Geometri','Progres (Ha)','Progress (Ha)')),0)),
      startDate:isoDay(new Date(Math.min(...rows.map(item=>item.date.getTime())))),
      endDate:isoDay(new Date(Math.max(...rows.map(item=>item.date.getTime())))),
      rows:rows.length,
    })).sort((a,b)=>a.stage.localeCompare(b.stage,undefined,{numeric:true}))
    const currentStageSummary=harvestStages.find(item=>item.stage===currentStage)
    const harvestedCurrent=round(currentStageSummary?.areaHa||0)
    const remaining=round(Math.max(areaPlanted-harvestedCurrent,0))
    const progressPct=areaPlanted>0?round(harvestedCurrent/areaPlanted*100,2):0
    if(areaPlanted>0&&harvestedCurrent>areaPlanted*1.02)issues.push({level:'WARNING',pid,message:`Luas harvest ${currentStage} (${harvestedCurrent.toFixed(4)} Ha) lebih besar dari area planted (${areaPlanted.toFixed(4)} Ha).`})
    if(currentCycle>1)issues.push({level:'INFO',pid,message:`Terdeteksi crop cycle ke-${currentCycle}; Area Plant setelah harvest lama dipisahkan otomatis dari cycle sebelumnya.`})

    const sourceArea=numberValue(rowValue(currentMeta.row,'Area Paddock (Ha)'))
    masters.push({
      pid,
      cycleId:`${pid}-C${currentCycle}-${compactDay(plantStart)}`,
      cycleNumber:currentCycle,
      region:parts.region||text(rowValue(currentMeta.row,'Region')),
      farm:parts.farm||text(rowValue(currentMeta.row,'Farm')),
      block:parts.block||text(rowValue(currentMeta.row,'Block')),
      paddock:parts.paddock||text(rowValue(currentMeta.row,'Paddock')),
      blockLc:text(rowValue(currentMeta.row,'Block LC')),
      variety:text(rowValue(currentMeta.row,'Variety')),
      areaPlantedHa:areaPlanted,
      plantStartDate:isoDay(plantStart)!,
      plantEndDate:isoDay(plantEnd)!,
      currentStage,
      harvestedCurrentStageHa:harvestedCurrent,
      harvestStartCurrentStage:currentStageSummary?.startDate||null,
      lastHarvestDate:currentStageSummary?.endDate||null,
      remainingHarvestCurrentStageHa:remaining,
      harvestProgressCurrentStagePct:progressPct,
      harvestStages,
      sourcePlantRows:currentPlants.length,
      sourceHarvestRows:currentHarvests.length,
      sourceAreaPaddockRef:Number.isFinite(sourceArea)?round(sourceArea):null,
      active:true,
    })
  }
  return{rows:masters,issues,fileName,plantRowCount:plantRaw.length,harvestRowCount:harvestRaw.length}
}

async function firebaseWriterContext(appUser:User){
  const db=firestoreDb,auth=firebaseAuth
  if(!db||!auth)throw new Error('Firebase belum terkonfigurasi.')
  const current=auth.currentUser
  if(!current)throw new Error('Firebase Auth belum terhubung. Login ulang ke QC Web agar bridge Firebase aktif.')
  const snapshot=await getDoc(doc(db,'users',current.uid))
  if(!snapshot.exists())throw new Error('Profil Firebase user tidak ditemukan.')
  const profile=snapshot.data() as FirestoreProfile
  if(profile.active!==true)throw new Error('Profil Firebase tidak aktif.')
  if(!['owner','asisten'].includes(profile.role||''))throw new Error(`Role Firebase ${profile.role||'-'} tidak memiliki izin update Master Paddock.`)
  if(!['owner','asisten'].includes(appUser.role))throw new Error('Role QC Web tidak memiliki izin update Master Paddock.')
  return{db,username:profile.username||appUser.username,current}
}

async function compareWithFirestore(parsed:ParsedMaster[]){
  if(!firestoreDb)throw new Error('Firestore belum tersedia.')
  const snapshot=await getDocs(collection(firestoreDb,'master_paddocks'))
  const existing=new Map(snapshot.docs.map(item=>[item.id,item.data() as Record<string,unknown>]))
  return parsed.map<PreviewRow>(row=>{
    const previous=existing.get(row.pid)
    if(!previous)return{...row,status:'CREATE',changes:['paddock baru']}
    const changes:string[]=[]
    for(const key of CHANGE_FIELDS)if(!sameValue(previous[key],row[key],key))changes.push(displayChange(key))
    return{...row,status:changes.length?'UPDATE':'NO_CHANGE',changes}
  })
}

export default function MasterPaddockImportPanel({user}:Props){
  const[parsed,setParsed]=useState<ParsedFile|null>(null)
  const[preview,setPreview]=useState<PreviewRow[]>([])
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const[filter,setFilter]=useState<'ALL'|ImportStatus>('ALL')
  const counts=useMemo(()=>({
    create:preview.filter(r=>r.status==='CREATE').length,
    update:preview.filter(r=>r.status==='UPDATE').length,
    same:preview.filter(r=>r.status==='NO_CHANGE').length,
    errors:parsed?.issues.filter(i=>i.level==='ERROR').length||0,
    warnings:parsed?.issues.filter(i=>i.level==='WARNING').length||0,
  }),[preview,parsed])
  const visible=useMemo(()=>preview.filter(row=>filter==='ALL'||row.status===filter).slice(0,200),[preview,filter])

  async function chooseFile(file:File|null){
    if(!file)return
    setBusy(true);setMessage('Membaca file Administrasi…');setParsed(null);setPreview([])
    try{
      const result=parseWorkbook(await file.arrayBuffer(),file.name)
      setParsed(result)
      setMessage(`File terbaca: ${result.rows.length} PID dari ${result.plantRowCount} baris Area Plant dan ${result.harvestRowCount} baris Area Harvest.`)
      if(result.issues.some(issue=>issue.level==='ERROR'))return
      try{
        await firebaseWriterContext(user)
        const next=await compareWithFirestore(result.rows)
        setPreview(next)
        setMessage(`Preview siap: ${next.filter(r=>r.status==='CREATE').length} baru, ${next.filter(r=>r.status==='UPDATE').length} berubah, ${next.filter(r=>r.status==='NO_CHANGE').length} tidak berubah.`)
      }catch(error){
        setPreview(result.rows.map(row=>({...row,status:'CREATE' as const,changes:['Firestore belum dibandingkan']})))
        setMessage(`${error instanceof Error?error.message:'Firestore belum dapat dibandingkan'} File tetap berhasil divalidasi; import belum dijalankan.`)
      }
    }catch(error){setMessage(error instanceof Error?error.message:'File Excel gagal dibaca.')}
    finally{setBusy(false)}
  }

  async function refreshComparison(){
    if(!parsed||parsed.issues.some(issue=>issue.level==='ERROR'))return
    setBusy(true);setMessage('Membandingkan dengan Firestore…')
    try{await firebaseWriterContext(user);const next=await compareWithFirestore(parsed.rows);setPreview(next);setMessage(`Perbandingan selesai: ${next.filter(r=>r.status==='CREATE').length} CREATE, ${next.filter(r=>r.status==='UPDATE').length} UPDATE, ${next.filter(r=>r.status==='NO_CHANGE').length} tidak berubah.`)}
    catch(error){setMessage(error instanceof Error?error.message:'Perbandingan Firestore gagal.')}
    finally{setBusy(false)}
  }

  async function importToFirestore(){
    if(!parsed||parsed.issues.some(issue=>issue.level==='ERROR'))return
    setBusy(true);setMessage('Verifikasi sebelum import…')
    try{
      const context=await firebaseWriterContext(user)
      const checked=await compareWithFirestore(parsed.rows)
      setPreview(checked)
      const changed=checked.filter(row=>row.status!=='NO_CHANGE')
      if(!changed.length){setMessage('Tidak ada perubahan yang perlu ditulis ke Firestore.');return}
      const confirmation=window.prompt(`Akan menulis ${changed.length} Master Paddock (${changed.filter(r=>r.status==='CREATE').length} baru, ${changed.filter(r=>r.status==='UPDATE').length} update).\n\nData yang hilang dari file TIDAK akan dihapus.\nKetik IMPORT untuk melanjutkan.`)
      if(confirmation!=='IMPORT'){setMessage('Import dibatalkan. Tidak ada data Firestore yang diubah.');return}
      const batchId=`PADDOCK-${new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)}`
      let written=0
      for(let start=0;start<changed.length;start+=250){
        const batch=writeBatch(context.db)
        const chunk=changed.slice(start,start+250)
        for(const row of chunk){
          const masterRef=doc(context.db,'master_paddocks',row.pid)
          batch.set(masterRef,{
            pid:row.pid,region:row.region,farm:row.farm,block:row.block,paddock:row.paddock,blockLc:row.blockLc,variety:row.variety,
            areaPlantedHa:row.areaPlantedHa,plantStartDate:row.plantStartDate,plantEndDate:row.plantEndDate,currentStage:row.currentStage,
            harvestedCurrentStageHa:row.harvestedCurrentStageHa,harvestStartCurrentStage:row.harvestStartCurrentStage,lastHarvestDate:row.lastHarvestDate,
            remainingHarvestCurrentStageHa:row.remainingHarvestCurrentStageHa,harvestProgressCurrentStagePct:row.harvestProgressCurrentStagePct,currentCycleId:row.cycleId,
            active:row.active,sourceAreaPaddockRef:row.sourceAreaPaddockRef,sourceFileName:parsed.fileName,lastImportBatchId:batchId,
            updatedAt:serverTimestamp(),updatedBy:context.username,
          },{merge:true})
          const cycleRef=doc(context.db,'paddock_cycles',row.cycleId)
          batch.set(cycleRef,{
            cycleId:row.cycleId,pid:row.pid,cycleNumber:row.cycleNumber,areaPlantedHa:row.areaPlantedHa,plantStartDate:row.plantStartDate,plantEndDate:row.plantEndDate,
            blockLc:row.blockLc,variety:row.variety,currentStage:row.currentStage,harvestStages:row.harvestStages,active:true,sourceFileName:parsed.fileName,lastImportBatchId:batchId,
            updatedAt:serverTimestamp(),updatedBy:context.username,
          },{merge:true})
        }
        await batch.commit();written+=chunk.length;setMessage(`Import berjalan ${written}/${changed.length} paddock…`)
      }
      const logRef=doc(context.db,'master_import_logs',batchId)
      const logBatch=writeBatch(context.db)
      logBatch.set(logRef,{batchId,type:'master_paddock',fileName:parsed.fileName,created:changed.filter(r=>r.status==='CREATE').length,updated:changed.filter(r=>r.status==='UPDATE').length,unchanged:checked.filter(r=>r.status==='NO_CHANGE').length,warnings:counts.warnings,importedBy:context.username,importedAt:serverTimestamp()})
      await logBatch.commit()
      setMessage(`Import selesai. ${written} Master Paddock ditulis ke Firestore. Tidak ada paddock yang dihapus.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Import Master Paddock gagal.')}
    finally{setBusy(false)}
  }

  return <section>
    <div className="section-head"><div><div className="eyebrow">MASTER DATA</div><h2>Import Master Paddock</h2></div><span className="badge">Area Plant = sumber luas Plan</span></div>
    <div className="panel form-stack">
      <h3>Upload Data Administrasi</h3>
      <p className="muted">Gunakan file Excel mentah dengan sheet <strong>Area Plant</strong> dan <strong>Area Harvest</strong>. PID baru otomatis diambil dari Area Plant. Area Harvest hanya menentukan stage dan progres harvest; tidak mengurangi luas planning.</p>
      <label>File Data Update Paddock (.xlsx / .xls)<input type="file" accept=".xlsx,.xls" disabled={busy} onChange={e=>void chooseFile(e.target.files?.[0]||null)}/></label>
      <div className="row-actions"><button type="button" disabled={busy||!parsed||counts.errors>0} onClick={()=>void refreshComparison()}>Bandingkan Firestore</button><button type="button" className="primary" disabled={busy||!parsed||counts.errors>0||!preview.length} onClick={()=>void importToFirestore()}>{busy?'Memproses…':'Confirm Import Firestore'}</button></div>
      {message&&<div className="alert">{message}</div>}
    </div>
    {parsed&&<>
      <div className="stats-grid"><Stat label="PID" value={parsed.rows.length}/><Stat label="Paddock baru" value={counts.create}/><Stat label="Update" value={counts.update}/><Stat label="Warning" value={counts.warnings}/><Stat label="Error" value={counts.errors}/></div>
      <div className="panel">
        <div className="section-head"><div><h3>Preview Perubahan</h3><p className="muted">Maksimal 200 baris ditampilkan. Import menggunakan seluruh baris valid.</p></div><select value={filter} onChange={e=>setFilter(e.target.value as 'ALL'|ImportStatus)}><option value="ALL">Semua</option><option value="CREATE">CREATE</option><option value="UPDATE">UPDATE</option><option value="NO_CHANGE">NO CHANGE</option></select></div>
        <div className="table-wrap"><table><thead><tr><th>Status</th><th>PID</th><th>Cycle</th><th>Variety</th><th>Area Plan</th><th>Stage</th><th>Harvest Stage</th><th>Perubahan</th></tr></thead><tbody>{visible.map(row=><tr key={row.pid}><td><span className="badge">{row.status}</span></td><td>{row.pid}</td><td>{row.cycleId}</td><td>{row.variety||'-'}</td><td>{row.areaPlantedHa.toFixed(4)} Ha</td><td>{row.currentStage}</td><td>{row.harvestedCurrentStageHa.toFixed(4)} Ha</td><td>{row.changes.join(', ')||'-'}</td></tr>)}{!visible.length&&<tr><td colSpan={8} className="empty">Tidak ada baris pada filter ini.</td></tr>}</tbody></table></div>
      </div>
      <div className="panel"><h3>Data Quality</h3><div className="table-wrap"><table><thead><tr><th>Level</th><th>PID</th><th>Catatan</th></tr></thead><tbody>{parsed.issues.slice(0,200).map((issue,index)=><tr key={`${issue.pid||'file'}-${index}`}><td>{issue.level}</td><td>{issue.pid||'-'}</td><td>{issue.message}</td></tr>)}{!parsed.issues.length&&<tr><td colSpan={3} className="empty">Tidak ada warning/error pada file.</td></tr>}</tbody></table></div>{parsed.issues.length>200&&<p className="muted">Menampilkan 200 dari {parsed.issues.length} catatan validasi.</p>}</div>
    </>}
  </section>
}

function Stat({label,value}:{label:string;value:number}){return <div className="stat"><span>{label}</span><strong>{value}</strong></div>}
