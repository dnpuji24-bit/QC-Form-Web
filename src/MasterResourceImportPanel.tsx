import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocsFromServer, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseAuth, firebaseAuthPersistenceReady, firestoreDb } from './firebase'
import { canEditAccess } from './accessControl'
import type { User } from './types'
import { employeeDocId, identityKey, parseResourceRows, unitDocId, unitKindName, type EmployeeImportRow, type ImportKind, type ParsedImport, type UnitImportRow } from './resourceMasterImport'

type Row=EmployeeImportRow|UnitImportRow
type PreviewStatus='NEW'|'REVIEW'|'SKIP'|'INVALID'
type Props={user:User;kind:ImportKind;onImported?:()=>void}
const collectionFor=(kind:ImportKind)=>kind==='employee'?'master_employees':'master_unit_numbers'
const permissionFor=(kind:ImportKind)=>kind==='employee'?'data_master_employees':'data_unit_dispatch'
function canImport(user:User,kind:ImportKind){return canEditAccess(user,permissionFor(kind))&&(user.role==='owner'||user.role==='asisten')}
function label(row:Row,kind:ImportKind){return kind==='employee'?(row as EmployeeImportRow).fullName:(row as UnitImportRow).code}
function excelDateFileSize(file:File){return file.size<=6*1024*1024}
function previewStatus(row:Row,kind:ImportKind,existingById:Set<string>,existingByName:Set<string>):PreviewStatus{
  if(row.invalid)return'INVALID'
  if(kind==='employee'){
    const e=row as EmployeeImportRow
    if(existingById.has(identityKey(e.employeeId))&&e.employeeId||existingByName.has(identityKey(e.fullName)))return'SKIP'
    return e.warnings.length?'REVIEW':'NEW'
  }
  const u=row as UnitImportRow
  if(existingById.has(identityKey(u.code)))return'SKIP'
  return u.warnings.length?'REVIEW':'NEW'
}
export default function MasterResourceImportPanel({user,kind,onImported}:Props){
  const [parsed,setParsed]=useState<ParsedImport|null>(null),[fileName,setFileName]=useState('')
  const[existingById,setExistingById]=useState<Set<string>>(new Set()),[existingByName,setExistingByName]=useState<Set<string>>(new Set())
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const writable=canImport(user,kind),rows=(parsed?(kind==='employee'?parsed.employees:parsed.units):[]) as Row[]
  useEffect(()=>{setParsed(null);setFileName('');setMessage('')},[kind])
  const statuses=useMemo(()=>rows.map(row=>previewStatus(row,kind,existingById,existingByName)),[rows,kind,existingById,existingByName])
  const counts=useMemo(()=>({create:statuses.filter(s=>s==='NEW'||s==='REVIEW').length,review:statuses.filter(s=>s==='REVIEW').length,skip:statuses.filter(s=>s==='SKIP').length,invalid:statuses.filter(s=>s==='INVALID').length}),[statuses])
  async function existingState(){
    if(!firestoreDb)throw Error('Firestore tidak tersedia.')
    const snap=await getDocsFromServer(collection(firestoreDb,collectionFor(kind)))
    const ids=new Set<string>(),names=new Set<string>()
    snap.docs.forEach(d=>{
      const data=d.data()
      if(kind==='employee'){
        if(data.employeeId)ids.add(identityKey(data.employeeId))
        if(data.fullName)names.add(identityKey(data.fullName))
      }else if(data.name||data.code)ids.add(identityKey(data.name||data.code))
    })
    setExistingById(ids);setExistingByName(names)
    return{ids,names}
  }
  async function choose(file:File|undefined){
    setParsed(null);setMessage('');setFileName(file?.name||'')
    if(!file)return
    if(!/\.(ods|xlsx|xls|csv)$/i.test(file.name)){setMessage('Pilih berkas .ods, .xlsx, .xls, atau .csv.');return}
    if(!excelDateFileSize(file)){setMessage('Ukuran file melebihi batas 6 MB.');return}
    setBusy(true)
    try{
      const XLSX=await import('xlsx')
      const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false})
      const sheets=workbook.SheetNames.map(name=>({
        name,rows:XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name],{header:1,defval:'',raw:false,blankrows:false})
      }))
      const result=parseResourceRows(sheets,kind)
      if(!(kind==='employee'?result.employees:result.units).length)throw Error('Sheet tidak memiliki baris data.')
      await existingState()
      setParsed(result)
      setMessage('Pratinjau siap. Belum ada data yang ditulis ke Firestore.')
    }catch(e){setMessage(e instanceof Error?e.message:'File tidak dapat dibaca.')}
    finally{setBusy(false)}
  }
  async function actor(){
    if(!firestoreDb||!firebaseAuth)throw Error('Firebase belum tersedia.')
    await firebaseAuthPersistenceReady
    if(typeof firebaseAuth.authStateReady==='function')await firebaseAuth.authStateReady()
    const current=firebaseAuth.currentUser
    if(!current)throw Error('Sesi Firebase tidak aktif, silakan login ulang.')
    const profile=await getDoc(doc(firestoreDb,'users',current.uid))
    if(!profile.exists()||profile.data().active!==true)throw Error('Profil tidak aktif.')
    return{db:firestoreDb,uid:current.uid,name:String(profile.data().username||'')}
  }
  async function commit(){
    if(!writable||!parsed||busy||!counts.create)return
    if(!window.confirm('Import '+counts.create+' record '+(kind==='employee'?'karyawan':'unit')+' baru dari '+fileName+'? Data yang sudah ada akan dilewati; tidak ada assignment atau absensi yang dibuat.'))return
    setBusy(true);setMessage('Memeriksa data terbaru sebelum import…')
    let created=0
    try{
      const {db,uid,name}=await actor()
      const latest=await existingState()
      const pending=rows.filter(row=>{
        return previewStatus(row,kind,latest.ids,latest.names)==='NEW'||previewStatus(row,kind,latest.ids,latest.names)==='REVIEW'
      })
      if(kind==='employee'){
        const employees=pending as EmployeeImportRow[]
        for(let i=0;i<employees.length;i+=70){
          const chunk=employees.slice(i,i+70)
          const refs=chunk.map(row=>doc(db,'master_employees',employeeDocId(row)))
          const amount=await runTransaction(db,async tr=>{
            const snaps=await Promise.all(refs.map(ref=>tr.get(ref)))
            let newDocs=0
            chunk.forEach((row,index)=>{
              if(snaps[index].exists())return
              tr.set(refs[index],{
                employeeId:row.employeeId,fullName:row.fullName,joinDate:row.joinDate,
                jobTitle:row.jobTitle,unitCode:row.unitCode,sourceReserveStatus:row.reserveStatus,
                implement:row.implement,remarks:row.remarks,front:row.front,frontRaw:row.frontRaw,
                shift:row.shift,shiftRaw:row.shiftRaw,workGroup:row.workGroup,
                equipmentType:row.equipmentType,supervisorName:row.supervisorName,
                identityStatus:row.employeeId?'HAS_ID':'MISSING_ID',needsReview:row.warnings.length>0,
                reviewWarnings:row.warnings,active:true,sourceRow:row.rowNumber,
                importSource:'Upkeep & Manuring',createdByUid:uid,createdBy:name,
                createdAt:serverTimestamp(),updatedAt:serverTimestamp()
              })
              newDocs++
            })
            return newDocs
          })
          created+=amount
          setMessage('Import karyawan: '+created+'/'+pending.length+' record tersimpan.')
        }
      }else{
        const unitRows=pending as UnitImportRow[]
        const categorySnap=await getDocsFromServer(collection(db,'master_units'))
        const categories=new Map<string,{id:string;name:string}>()
        categorySnap.docs.forEach(x=>{const kindName=String(x.data().name||'').trim();if(kindName)categories.set(identityKey(kindName),{id:x.id,name:kindName})})
        const createdKinds=new Set<string>()
        const candidates=unitRows.map(row=>{
          const name=unitKindName(row),key=identityKey(name)
          let category=categories.get(key)
          if(!category){category={id:'import-unit-'+unitDocId('',name),name};categories.set(key,category);createdKinds.add(key)}
          return{row,category}
        })
        for(let i=0;i<candidates.length;i+=50){
          const chunk=candidates.slice(i,i+50)
          const unitRefs=chunk.map(x=>doc(db,'master_unit_numbers',unitDocId(x.category.name,x.row.code)))
          const missingKinds=[...new Map(chunk.filter(x=>createdKinds.has(identityKey(x.category.name))).map(x=>[x.category.id,x.category])).values()]
          const kindRefs=missingKinds.map(x=>doc(db,'master_units',x.id))
          const amount=await runTransaction(db,async tr=>{
            const [snapUnits,snapKinds]=await Promise.all([
              Promise.all(unitRefs.map(ref=>tr.get(ref))),Promise.all(kindRefs.map(ref=>tr.get(ref)))
            ])
            snapKinds.forEach((snapshot,index)=>{
              if(snapshot.exists())return
              const category=missingKinds[index]
              tr.set(kindRefs[index],{name:category.name,active:true,sourceOrigin:'RESOURCE_IMPORT',createdBy:name,createdByUid:uid,createdAt:serverTimestamp()})
            })
            let newDocs=0
            chunk.forEach(({row,category},index)=>{
              if(snapUnits[index].exists())return
              tr.set(unitRefs[index],{
                name:row.code.trim().toUpperCase(),active:true,
                parentUnitId:category.id,parentUnitName:category.name,
                equipmentType:row.equipmentType,implement:row.implement,
                brand:row.brand,model:row.model,year:row.year,serialNo:row.serialNo,
                planCompany:row.planCompany,planUser:row.planUser,
                capacitySpec:row.capacitySpec,operatorRequirement:row.operatorRequirement,
                category:row.category,importNeedsInspection:false,
                sourceRow:row.rowNumber,importSource:'Upkeep & Manuring',
                createdBy:name,createdByUid:uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
              })
              newDocs++
            })
            return newDocs
          })
          created+=amount
          setMessage('Import unit: '+created+'/'+pending.length+' record tersimpan.')
        }
      }
      await setDoc(doc(db,'master_resource_import_logs','imp-'+Date.now()+'-'+uid.slice(0,6)),{
        kind,fileName,sheetName:parsed.sheetName,sourceRows:rows.length,
        createdCount:created,existingSkipped:counts.skip,invalidCount:counts.invalid,
        reviewCount:counts.review,createdByUid:uid,createdBy:name,createdAt:serverTimestamp()
      })
      setMessage('Import selesai: '+created+' record baru disimpan; '+counts.skip+' sudah ada; '+counts.invalid+' baris bermasalah dilewati. Refresh halaman untuk melihat daftar terbaru.')
      await existingState();onImported?.()
    }catch(e){
      setMessage('Import tidak selesai sepenuhnya ('+created+' record sudah tersimpan). '+(e instanceof Error?e.message:'Terjadi kegagalan. Aplikasi dapat mengimpor ulang file dan akan melewati record yang sudah ada.'))
      await existingState().catch(()=>{})
      onImported?.()
    }finally{setBusy(false)}
  }
  return <section className="panel" style={{marginTop:12,display:'grid',gap:12}}>
    <div><h3>Import {kind==='employee'?'Master Karyawan':'Master Unit'}</h3>
      <p className="muted">Unggah file .ods asli atau Excel. {kind==='employee'?'Sheet1: DATA MASTER KARYAWAN UPKEEP & MANURING':'Sheet2: DATA MASTER UNIT & ALAT BERAT'}. File diproses di browser, hanya record yang Anda konfirmasi ditulis ke Firestore.</p></div>
    <label style={{display:'grid',gap:6}}>Pilih file (.ods / .xlsx / .xls / .csv)
      <input type="file" accept=".ods,.xlsx,.xls,.csv" disabled={busy||!writable} onChange={e=>void choose(e.target.files?.[0])}/>
    </label>
    {!writable&&<p className="muted">Impor hanya tersedia bagi Owner atau Asisten dengan izin Edit yang sesuai.</p>}
    {message&&<p role="status" className="alert">{message}</p>}
    {parsed&&<div style={{display:'grid',gap:10}}>
      <p className="muted">File: <b>{fileName}</b> · Sheet: <b>{parsed.sheetName}</b> · Header baris {parsed.headerRow}</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:8}}>
        {[{name:'Dibaca',value:rows.length},{name:'Baru',value:counts.create},{name:'Perlu review',value:counts.review},{name:'Sudah ada',value:counts.skip},{name:'Tidak valid',value:counts.invalid}].map(x=><div key={x.name} style={{padding:10,borderRadius:9,background:'#f2f6fa'}}><small style={{color:'#64748b'}}>{x.name}</small><strong style={{display:'block',fontSize:21}}>{x.value}</strong></div>)}
      </div>
      <p className="muted" style={{fontSize:12}}>Data duplikat tidak ditimpa; Employee ID kosong tidak dibuat-buat. {kind==='unit'?'Unit baru langsung Ready untuk Shift 1 dan 2, kecuali diubah menjadi Breakdown atau Maintenance.':''}</p>
      <div style={{maxHeight:330,overflow:'auto'}}>
        <table style={{width:'100%'}}><thead><tr><th>Baris</th><th>{kind==='employee'?'Karyawan':'Kode Unit'}</th><th>{kind==='employee'?'Jabatan / Unit':'Implement / Type'}</th><th>Status</th><th>Catatan</th></tr></thead><tbody>
          {rows.slice(0,100).map((row,i)=><tr key={row.rowNumber}>
            <td>{row.rowNumber}</td><td>{label(row,kind)}</td>
            <td>{kind==='employee'?((row as EmployeeImportRow).jobTitle+' · '+((row as EmployeeImportRow).unitCode||'–')):((row as UnitImportRow).implement+' · '+(row as UnitImportRow).equipmentType)}</td>
            <td>{statuses[i]==='NEW'?'Baru':statuses[i]==='REVIEW'?'Perlu review':statuses[i]==='SKIP'?'Sudah ada':'Tidak valid'}</td>
            <td><small>{row.warnings.join(' • ')||'–'}</small></td>
          </tr>)}
        </tbody></table>
        {rows.length>100&&<small className="muted">Menampilkan 100 baris pertama dari {rows.length}. Seluruh baris tetap diperiksa saat impor.</small>}
      </div>
      {writable&&<button type="button" className="primary" disabled={busy||counts.create===0} onClick={()=>void commit()}>{busy?'Memproses…':'Import '+counts.create+' Record Baru'}</button>}
    </div>}
  </section>
}
