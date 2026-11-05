import { useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import type { User } from './types'
import { canEditAccess } from './accessControl'

type Props={user:User;onImported?:()=>void|Promise<void>}
type MaterialRow={id:string;materialName:string;activeIngredient:string;unit:string;category:string;active:boolean}
type ImportStatus='CREATE'|'UPDATE'|'NO_CHANGE'
type PreviewRow=MaterialRow&{status:ImportStatus;changes:string[];sourceRow:number}
type SheetRow=Record<string,unknown>
type FirestoreProfile={active?:boolean;username?:string}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function normalized(value:string){return value.trim().toLowerCase().replace(/\s+/g,' ')}
function slug(value:string){const result=value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');return result.slice(0,80)||'item'}
function rowValue(row:SheetRow,...names:string[]){const lookup=new Map(Object.keys(row).map(key=>[normalized(key),row[key]]));for(const name of names){const value=lookup.get(normalized(name));if(value!==undefined)return value}return undefined}
function normalizeCategory(value:string){const key=normalized(value),map:Record<string,string>={herbisida:'HERBICIDE',herbicide:'HERBICIDE',insektisida:'INSECTICIDE',insecticide:'INSECTICIDE',fungisida:'FUNGICIDE',fungicide:'FUNGICIDE',pupuk:'FERTILIZER',fertilizer:'FERTILIZER',adjuvant:'ADJUVANT',other:'OTHER',others:'OTHER',lainnya:'OTHER'};return map[key]||value.trim().toUpperCase().replace(/\s+/g,'_')||'OTHER'}
function parseStatus(value:unknown){const key=text(value).toUpperCase();if(!key)return true;return!['INACTIVE','NONACTIVE','NON ACTIVE','FALSE','0','NO','TIDAK'].includes(key)}
function materialFromData(id:string,data:Record<string,unknown>):MaterialRow{return{id,materialName:text(data.materialName),activeIngredient:text(data.activeIngredient),unit:text(data.unit),category:text(data.category).toUpperCase(),active:data.active!==false}}
function materialChanges(previous:MaterialRow,row:MaterialRow){const changes:string[]=[];if(previous.materialName!==row.materialName)changes.push('Material');if(previous.activeIngredient!==row.activeIngredient)changes.push('Bahan Aktif');if(previous.unit!==row.unit)changes.push('Satuan');if(previous.category!==row.category)changes.push('Kategori');if(previous.active!==row.active)changes.push('Status');return changes}
function componentsFromData(value:unknown){if(!Array.isArray(value))return[];return value.map(item=>{const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return{activeIngredient:text(row.activeIngredient),unit:text(row.unit)}}).filter(item=>item.activeIngredient&&item.unit)}

async function writerContext(appUser:User){
  const db=firestoreDb,auth=firebaseAuth
  if(!db||!auth)throw new Error('Firebase belum tersedia.')
  const current=auth.currentUser
  if(!current)throw new Error('Sesi Firebase belum aktif. Login ulang lalu coba lagi.')
  const snap=await getDoc(doc(db,'users',current.uid))
  if(!snap.exists())throw new Error('Profil user tidak ditemukan.')
  const profile=snap.data() as FirestoreProfile
  if(profile.active!==true||!canEditAccess(appUser,'data_master_activity_manage'))throw new Error('Hak akses Edit Master Bahan belum diberikan.')
  return{db,username:profile.username||appUser.username}
}

export default function MasterMaterialImportExportPanel({user,onImported}:Props){
  const[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[fileName,setFileName]=useState(''),[preview,setPreview]=useState<PreviewRow[]>([]),[errors,setErrors]=useState<string[]>([])
  const counts=useMemo(()=>({create:preview.filter(row=>row.status==='CREATE').length,update:preview.filter(row=>row.status==='UPDATE').length,same:preview.filter(row=>row.status==='NO_CHANGE').length}),[preview])

  async function exportMaterials(){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    setBusy(true);setMessage('Menyiapkan export Master Bahan…')
    try{
      const snap=await getDocs(collection(firestoreDb,'master_materials'))
      const rows=snap.docs.map(item=>materialFromData(item.id,item.data() as Record<string,unknown>)).sort((a,b)=>a.materialName.localeCompare(b.materialName,undefined,{numeric:true}))
      const XLSX=await import('xlsx')
      const headers=['ID','Material','Bahan Aktif / Komposisi Utama','Satuan','Kategori','Status']
      const data=rows.map(row=>[row.id,row.materialName,row.activeIngredient,row.unit,row.category,row.active?'ACTIVE':'INACTIVE'])
      const sheet=XLSX.utils.aoa_to_sheet([headers,...data])
      sheet['!cols']=[{wch:26},{wch:32},{wch:38},{wch:14},{wch:18},{wch:14}]
      sheet['!autofilter']={ref:'A1:F'+Math.max(rows.length+1,1)}
      const workbook=XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook,sheet,'Bahan')
      const stamp=new Date().toISOString().slice(0,10)
      XLSX.writeFile(workbook,'Master_Bahan_'+stamp+'.xlsx')
      setMessage('Export Master Bahan selesai: '+rows.length+' material.')
    }catch(error){setMessage(error instanceof Error?error.message:'Export Master Bahan gagal.')}finally{setBusy(false)}
  }

  async function chooseImportFile(file:File|null){
    if(!file)return
    setBusy(true);setMessage('Membaca file Master Bahan…');setFileName(file.name);setPreview([]);setErrors([])
    try{
      if(!firestoreDb)throw new Error('Firestore belum tersedia.')
      const XLSX=await import('xlsx'),workbook=XLSX.read(await file.arrayBuffer(),{type:'array'})
      const sheetName=workbook.SheetNames.find(name=>normalized(name)==='bahan'||normalized(name)==='master bahan')||(workbook.SheetNames.length===1?workbook.SheetNames[0]:'')
      if(!sheetName)throw new Error('Sheet "Bahan" tidak ditemukan. Gunakan file hasil Export Bahan atau file dengan satu sheet khusus bahan.')
      const sheet=workbook.Sheets[sheetName],sourceRows=XLSX.utils.sheet_to_json<SheetRow>(sheet,{defval:null,raw:true})
      const parsed:PreviewRow[]=[],issues:string[]=[],seenIds=new Set<string>()
      sourceRows.forEach((row,index)=>{
        const sourceRow=index+2,materialName=text(rowValue(row,'Material','Nama Material','Nama produk/material')),activeIngredient=text(rowValue(row,'Bahan Aktif / Komposisi Utama','Bahan Aktif')),unit=text(rowValue(row,'Satuan','Unit')),category=normalizeCategory(text(rowValue(row,'Kategori','Category'))),active=parseStatus(rowValue(row,'Status','Active')),id=text(rowValue(row,'ID','Document ID','Doc ID'))||slug(materialName)
        if(!materialName&&!activeIngredient&&!unit)return
        if(!materialName||!activeIngredient||!unit){issues.push('Baris '+sourceRow+': Material, Bahan Aktif, dan Satuan wajib diisi.');return}
        if(seenIds.has(id)){issues.push('Baris '+sourceRow+': ID '+id+' duplikat di file.');return}
        seenIds.add(id);parsed.push({id,materialName,activeIngredient,unit,category,active,status:'CREATE',changes:[],sourceRow})
      })
      if(!parsed.length)issues.push('Tidak ada data Master Bahan yang dapat dibaca.')
      const existingSnap=await getDocs(collection(firestoreDb,'master_materials')),existing=new Map(existingSnap.docs.map(item=>[item.id,materialFromData(item.id,item.data() as Record<string,unknown>)]))
      const compared=parsed.map(row=>{const previous=existing.get(row.id);if(!previous)return{...row,status:'CREATE' as const,changes:['Material baru']};const changes=materialChanges(previous,row);return{...row,status:(changes.length?'UPDATE':'NO_CHANGE') as ImportStatus,changes}})
      setPreview(compared);setErrors(issues)
      setMessage('Preview Master Bahan: '+compared.length+' baris · '+compared.filter(row=>row.status==='CREATE').length+' CREATE · '+compared.filter(row=>row.status==='UPDATE').length+' UPDATE · '+compared.filter(row=>row.status==='NO_CHANGE').length+' NO CHANGE'+(issues.length?' · '+issues.length+' error.':'.'))
    }catch(error){setPreview([]);setErrors([error instanceof Error?error.message:'File Master Bahan gagal dibaca.']);setMessage(error instanceof Error?error.message:'File Master Bahan gagal dibaca.')}finally{setBusy(false)}
  }

  async function importMaterials(){
    if(!preview.length||errors.length)return
    const changed=preview.filter(row=>row.status!=='NO_CHANGE')
    if(!changed.length){setMessage('Tidak ada perubahan Master Bahan yang perlu diimport.');return}
    if(window.prompt('Update / Import Master Bahan akan menulis '+changed.length+' record ke Firestore. Data yang tidak ada di file tidak akan dihapus.\n\nKetik IMPORT BAHAN untuk melanjutkan.','')!=='IMPORT BAHAN')return
    setBusy(true);setMessage('Memvalidasi hubungan Master Bahan dengan Activity…')
    try{
      const context=await writerContext(user)
      const existingSnap=await getDocs(collection(context.db,'master_materials')),projected=new Map(existingSnap.docs.map(item=>[item.id,materialFromData(item.id,item.data() as Record<string,unknown>)]))
      preview.forEach(row=>projected.set(row.id,{id:row.id,materialName:row.materialName,activeIngredient:row.activeIngredient,unit:row.unit,category:row.category,active:row.active}))
      const projectedRows=[...projected.values()],activitySnap=await getDocs(collection(context.db,'master_activities')),broken:string[]=[]
      activitySnap.docs.forEach(item=>{const data=item.data() as Record<string,unknown>;if(data.active!==true)return;const missing=componentsFromData(data.components).filter(component=>!projectedRows.some(material=>material.active&&normalized(material.activeIngredient)===normalized(component.activeIngredient)&&normalized(material.unit)===normalized(component.unit)));if(missing.length)broken.push(text(data.description)||item.id)})
      if(broken.length)throw new Error('IMPORT DITOLAK: perubahan Master Bahan membuat Activity ACTIVE kehilangan pasangan Bahan Aktif + Satuan: '+broken.slice(0,8).join(', ')+(broken.length>8?' +'+(broken.length-8)+' lainnya':'')+'.')
      let written=0
      for(let start=0;start<changed.length;start+=400){const batch=writeBatch(context.db),chunk=changed.slice(start,start+400);chunk.forEach(row=>batch.set(doc(context.db,'master_materials',row.id),{materialName:row.materialName,activeIngredient:row.activeIngredient,unit:row.unit,category:row.category,active:row.active,source:'MATERIAL_IMPORT',sourceFileName:fileName,updatedAt:serverTimestamp(),updatedBy:context.username},{merge:true}));await batch.commit();written+=chunk.length;setMessage('Import Master Bahan '+written+'/'+changed.length+' record…')}
      const batchId='MATERIAL-'+new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14),log=writeBatch(context.db)
      log.set(doc(context.db,'master_material_import_logs',batchId),{batchId,sourceFileName:fileName,created:counts.create,updated:counts.update,unchanged:counts.same,total:preview.length,importedBy:context.username,importedAt:serverTimestamp()});await log.commit()
      setMessage('Update / Import Master Bahan selesai: '+counts.create+' CREATE · '+counts.update+' UPDATE · '+counts.same+' NO CHANGE.')
      setPreview([]);setErrors([]);setFileName('');await onImported?.()
    }catch(error){setMessage(error instanceof Error?error.message:'Import Master Bahan gagal.')}finally{setBusy(false)}
  }

  return <div className="panel material-io-panel">
    <div className="section-head"><div><div className="eyebrow">MASTER BAHAN · FILE TERPISAH</div><h3>Update / Import & Export Bahan</h3><p className="muted">Khusus collection <strong>master_materials</strong>. Tidak mengubah List Validasi, Komposisi Activity, atau Master Activity.</p></div><button type="button" className="material-export-button" disabled={busy} onClick={()=>void exportMaterials()}>Export Bahan</button></div>
    <div className="material-io-grid">
      <label><span>Update / Import Bahan (.xlsx / .xls)</span><input type="file" accept=".xlsx,.xls" disabled={busy} onChange={event=>void chooseImportFile(event.target.files?.[0]||null)}/><small>Gunakan sheet <b>Bahan</b>. File hasil Export Bahan dapat langsung diedit lalu diimport kembali.</small></label>
      <div className="material-io-rules"><strong>Kolom</strong><span>ID · Material · Bahan Aktif / Komposisi Utama · Satuan · Kategori · Status</span><small>ID menjaga record tetap sama ketika nama material diperbarui. Record yang tidak tercantum di file tidak akan dihapus.</small></div>
    </div>
    {message&&<div className="alert" style={{whiteSpace:'pre-line'}}>{message}</div>}
    {errors.length>0&&<div className="alert danger"><strong>Import belum dapat dijalankan.</strong>{errors.slice(0,12).map((error,index)=><div key={index}>• {error}</div>)}</div>}
    {preview.length>0&&<>
      <div className="stats-grid material-import-stats"><div className="stat"><span>CREATE</span><strong>{counts.create}</strong></div><div className="stat"><span>UPDATE</span><strong>{counts.update}</strong></div><div className="stat"><span>NO CHANGE</span><strong>{counts.same}</strong></div><div className="stat"><span>TOTAL</span><strong>{preview.length}</strong></div></div>
      <div className="section-head material-preview-head"><div><h4>Preview Perubahan Bahan</h4><p className="muted">{fileName}</p></div><button type="button" className="primary" disabled={busy||errors.length>0||!preview.some(row=>row.status!=='NO_CHANGE')} onClick={()=>void importMaterials()}>{busy?'Memproses…':'Confirm Update / Import Bahan'}</button></div>
      <div className="table-wrap"><table><thead><tr><th>Status</th><th>Material</th><th>Bahan Aktif</th><th>Satuan</th><th>Kategori</th><th>Active</th><th>Perubahan</th></tr></thead><tbody>{preview.slice(0,250).map(row=><tr key={row.id}><td><span className="badge">{row.status}</span></td><td><strong>{row.materialName}</strong><div className="muted">{row.id}</div></td><td>{row.activeIngredient}</td><td>{row.unit}</td><td>{row.category}</td><td>{row.active?'ACTIVE':'INACTIVE'}</td><td>{row.changes.join(', ')||'-'}</td></tr>)}</tbody></table></div>
      {preview.length>250&&<div className="alert">Preview dibatasi 250 dari {preview.length} record. Seluruh record tetap diproses saat import.</div>}
    </>}
  </div>
}
