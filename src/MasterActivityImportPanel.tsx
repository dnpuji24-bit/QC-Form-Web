import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { FALLBACK_COMPANIES, type CompanyRecord } from './companyMaster'
import type { User } from './types'

type Props={user:User}
type SheetRow=Record<string,unknown>
type ImportStatus='CREATE'|'UPDATE'|'NO_CHANGE'
type IssueLevel='ERROR'|'WARNING'|'INFO'
type Issue={level:IssueLevel;item?:string;message:string}
type FirestoreProfile={active?:boolean;role?:string;username?:string}
type ActivityComponent={sequence:number;label:string;activeIngredient:string;dosePerHa:number;unit:string}
type ParsedActivity={docId:string;activityCode:string;description:string;activity:string;type:string;activityCategory:string;companyScope:string;active:boolean;components:ActivityComponent[];componentCount:number}
type ParsedMaterial={docId:string;materialName:string;activeIngredient:string;unit:string;category:string;active:boolean}
type PreviewActivity=ParsedActivity&{status:ImportStatus;changes:string[]}
type PreviewMaterial=ParsedMaterial&{status:ImportStatus;changes:string[]}
type ParsedFile={fileName:string;activities:ParsedActivity[];materials:ParsedMaterial[];issues:Issue[]}
type ActivityBase={description:string;activity:string;type:string;activityCategory:string;sourceRow:number}
type ExistingCodeMap={byDoc:Map<string,string>;nextNumber:number}

const VALIDATION_SHEET='List Validasi'
const COMPOSITION_SHEET='Master Activity'
const MATERIAL_SHEET='Bahan'

function normalized(value:string){return value.trim().toLowerCase().replace(/\s+/g,' ')}
function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function rowValue(row:SheetRow,...names:string[]){const lookup=new Map(Object.keys(row).map(key=>[normalized(key),row[key]]));for(const name of names){const value=lookup.get(normalized(name));if(value!==undefined)return value}return undefined}
function numberValue(value:unknown){if(typeof value==='number'&&Number.isFinite(value))return value;const raw=text(value);if(!raw)return NaN;const cleaned=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;const parsed=Number(cleaned);return Number.isFinite(parsed)?parsed:NaN}
function normalizeType(value:string){const key=normalized(value);if(key==='spray')return'SPRAY';if(key==='fertilizer'||key==='fertiliser')return'FERTILIZER';return value.trim().toUpperCase()}
function normalizeCategory(value:string){return value.trim().toUpperCase().replace(/\s+/g,'_')}
function normalizeMaterialCategory(value:string){const key=normalized(value);const map:Record<string,string>={herbisida:'HERBICIDE',insektisida:'INSECTICIDE',fungisida:'FUNGICIDE',fertilizer:'FERTILIZER',adjuvant:'ADJUVANT',others:'OTHER',other:'OTHER'};return map[key]||value.trim().toUpperCase().replace(/\s+/g,'_')}
function slug(value:string){const result=value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');return result.slice(0,80)||'item'}
function activityDocId(scope:string,description:string){return`${slug(scope)}__${slug(description)}`}
function materialDocId(name:string){return slug(name)}
function getRows(workbook:XLSX.WorkBook,name:string){const sheet=workbook.Sheets[name];if(!sheet)throw new Error(`Sheet "${name}" tidak ditemukan. File wajib memiliki sheet ${VALIDATION_SHEET}, ${COMPOSITION_SHEET}, dan ${MATERIAL_SHEET}.`);return XLSX.utils.sheet_to_json<SheetRow>(sheet,{defval:null,raw:true})}
function componentSequence(label:string,fallback:number){const match=label.match(/(\d+)/);return match?Number(match[1]):fallback}
function sameArray(a:unknown,b:unknown){return JSON.stringify(a??[])===JSON.stringify(b??[])}
function sameText(a:unknown,b:unknown){return String(a??'')===String(b??'')}
function companyFromData(id:string,data:Record<string,unknown>):CompanyRecord{return{id,code:text(data.code||id).toUpperCase(),name:text(data.name),prefixes:Array.isArray(data.prefixes)?data.prefixes.map(item=>text(item).toUpperCase()).filter(Boolean):[],active:data.active!==false}}

async function firebaseWriterContext(appUser:User){
  const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum terkonfigurasi.')
  const current=auth.currentUser;if(!current)throw new Error('Firebase Auth belum terhubung. Login ulang agar bridge Firebase aktif.')
  const snapshot=await getDoc(doc(db,'users',current.uid));if(!snapshot.exists())throw new Error('Profil Firebase user tidak ditemukan.')
  const profile=snapshot.data() as FirestoreProfile;if(profile.active!==true)throw new Error('Profil Firebase tidak aktif.')
  if(!['owner','asisten'].includes(profile.role||''))throw new Error(`Role Firebase ${profile.role||'-'} tidak memiliki izin update Master Activity.`)
  if(!['owner','asisten'].includes(appUser.role))throw new Error('Role QC Web tidak memiliki izin update Master Activity.')
  return{db,username:profile.username||appUser.username}
}

async function existingCodes():Promise<ExistingCodeMap>{
  if(!firestoreDb)return{byDoc:new Map(),nextNumber:1}
  const snap=await getDocs(collection(firestoreDb,'master_activities')),byDoc=new Map<string,string>(),numbers:number[]=[]
  snap.docs.forEach(item=>{const code=text((item.data() as Record<string,unknown>).activityCode);if(code)byDoc.set(item.id,code);const match=code.match(/^ACT-(\d+)$/i);if(match)numbers.push(Number(match[1]))})
  return{byDoc,nextNumber:(numbers.length?Math.max(...numbers):0)+1}
}

function parseWorkbook(buffer:ArrayBuffer,fileName:string,scope:string,codes:ExistingCodeMap):ParsedFile{
  const workbook=XLSX.read(buffer,{type:'array',cellDates:true}),validationRows=getRows(workbook,VALIDATION_SHEET),compositionRows=getRows(workbook,COMPOSITION_SHEET),materialRows=getRows(workbook,MATERIAL_SHEET)
  const issues:Issue[]=[],activityBases:ActivityBase[]=[],seenDescriptions=new Set<string>()

  validationRows.forEach((row,index)=>{
    const description=text(rowValue(row,'Deskripsi')),activity=text(rowValue(row,'Activity')),type=normalizeType(text(rowValue(row,'Type'))),activityCategory=normalizeCategory(text(rowValue(row,'Activity Category'))),sourceRow=index+2
    if(!description&&!activity&&!type&&!activityCategory)return
    if(!description||!activity||!type||!activityCategory){issues.push({level:'ERROR',item:description||`Baris ${sourceRow}`,message:`${VALIDATION_SHEET} baris ${sourceRow}: Deskripsi, Activity, Type, dan Activity Category wajib terisi.`});return}
    if(!['SPRAY','FERTILIZER'].includes(type))issues.push({level:'WARNING',item:description,message:`Type ${type} belum termasuk SPRAY/FERTILIZER. Nilai tetap disimpan sesuai file.`})
    const key=normalized(description);if(seenDescriptions.has(key)){issues.push({level:'ERROR',item:description,message:`Duplikat Deskripsi pada ${VALIDATION_SHEET}: ${description}.`});return}seenDescriptions.add(key)
    activityBases.push({description,activity,type,activityCategory,sourceRow})
  })

  const componentsByDescription=new Map<string,ActivityComponent[]>(),compositionNames=new Set<string>()
  compositionRows.forEach((row,index)=>{
    const description=text(rowValue(row,'Deskripsi')),label=text(rowValue(row,'Pesticide','Urutan Bahan')),activeIngredient=text(rowValue(row,'Bahan Aktif','Bahan Aktif / Komposisi Utama')),dose=numberValue(rowValue(row,'Dosage/Ha','Dose/Ha','Dosis/Ha')),unit=text(rowValue(row,'Satuan')),activity=text(rowValue(row,'Activity')),sourceRow=index+2
    if(!description&&!activeIngredient&&!Number.isFinite(dose)&&!unit)return
    if(!description){issues.push({level:'ERROR',item:`Baris ${sourceRow}`,message:`${COMPOSITION_SHEET} baris ${sourceRow}: Deskripsi kosong.`});return}
    const key=normalized(description);compositionNames.add(key)
    if(!activeIngredient||!Number.isFinite(dose)||dose<=0||!unit){issues.push({level:'ERROR',item:description,message:`${COMPOSITION_SHEET} baris ${sourceRow}: Bahan Aktif, Dosage/Ha > 0, dan Satuan wajib valid.`});return}
    const base=activityBases.find(item=>normalized(item.description)===key)
    if(!base)issues.push({level:'WARNING',item:description,message:`${COMPOSITION_SHEET} baris ${sourceRow}: Deskripsi tidak ada di ${VALIDATION_SHEET}; komposisi ini tidak akan dibuat sebagai Activity.`})
    if(base&&activity&&normalized(activity)!==normalized(base.activity))issues.push({level:'WARNING',item:description,message:`Activity pada komposisi (${activity}) berbeda dengan ${VALIDATION_SHEET} (${base.activity}). Master memakai ${VALIDATION_SHEET}.`})
    const list=componentsByDescription.get(key)||[],sequence=componentSequence(label,list.length+1);list.push({sequence,label:label||`Bahan ${sequence}`,activeIngredient,dosePerHa:dose,unit});componentsByDescription.set(key,list)
  })

  const materials:ParsedMaterial[]=[],seenMaterialNames=new Set<string>(),materialByIngredient=new Map<string,ParsedMaterial[]>()
  materialRows.forEach((row,index)=>{
    const materialName=text(rowValue(row,'Material')),activeIngredient=text(rowValue(row,'Bahan Aktif / Komposisi Utama','Bahan Aktif')),unit=text(rowValue(row,'Satuan')),category=normalizeMaterialCategory(text(rowValue(row,'Kategori'))),sourceRow=index+2
    if(!materialName&&!activeIngredient&&!unit&&!category)return
    if(!materialName||!activeIngredient||!unit){issues.push({level:'ERROR',item:materialName||`Baris ${sourceRow}`,message:`${MATERIAL_SHEET} baris ${sourceRow}: Material, Bahan Aktif, dan Satuan wajib terisi.`});return}
    const key=normalized(materialName);if(seenMaterialNames.has(key)){issues.push({level:'ERROR',item:materialName,message:`Duplikat Material pada ${MATERIAL_SHEET}: ${materialName}.`});return}seenMaterialNames.add(key)
    const parsed={docId:materialDocId(materialName),materialName,activeIngredient,unit,category,active:true};materials.push(parsed)
    const ingredientKey=normalized(activeIngredient),rows=materialByIngredient.get(ingredientKey)||[];rows.push(parsed);materialByIngredient.set(ingredientKey,rows)
  })

  const activityCodeByDoc=new Map(codes.byDoc),usedCodes=new Set(activityCodeByDoc.values()),nextRef={value:codes.nextNumber}
  function codeFor(docId:string){const existing=activityCodeByDoc.get(docId);if(existing)return existing;let candidate='';do{candidate=`ACT-${String(nextRef.value++).padStart(3,'0')}`}while(usedCodes.has(candidate));usedCodes.add(candidate);activityCodeByDoc.set(docId,candidate);return candidate}

  const activities:ParsedActivity[]=activityBases.map(base=>{
    const key=normalized(base.description),components=(componentsByDescription.get(key)||[]).sort((a,b)=>a.sequence-b.sequence||a.activeIngredient.localeCompare(b.activeIngredient)),active=components.length>0
    if(!active)issues.push({level:'INFO',item:base.description,message:'Tidak memiliki komposisi bahan/dosis; otomatis disimpan sebagai INACTIVE dan tidak muncul di pilihan Plan.'})
    components.forEach(component=>{
      const products=materialByIngredient.get(normalized(component.activeIngredient))||[]
      if(!products.length)issues.push({level:'ERROR',item:base.description,message:`Bahan Aktif "${component.activeIngredient}" belum ada di sheet ${MATERIAL_SHEET}.`})
      else if(!products.some(product=>normalized(product.unit)===normalized(component.unit)))issues.push({level:'WARNING',item:base.description,message:`Satuan komposisi ${component.activeIngredient} = ${component.unit}, tetapi produk pada Master Bahan memakai ${[...new Set(products.map(product=>product.unit))].join(', ')}.`})
    })
    const docId=activityDocId(scope,base.description)
    return{docId,activityCode:codeFor(docId),description:base.description,activity:base.activity,type:base.type,activityCategory:base.activityCategory,companyScope:scope,active,components,componentCount:components.length}
  })

  for(const key of compositionNames)if(!seenDescriptions.has(key))issues.push({level:'WARNING',item:key,message:`Komposisi "${key}" tidak memiliki Activity di ${VALIDATION_SHEET} dan tidak akan diimport.`})
  return{fileName,activities,materials,issues}
}

function activityChanges(previous:Record<string,unknown>,row:ParsedActivity){const changes:string[]=[];if(!sameText(previous.activityCode,row.activityCode))changes.push('code');if(!sameText(previous.description,row.description))changes.push('deskripsi');if(!sameText(previous.activity,row.activity))changes.push('activity');if(!sameText(previous.type,row.type))changes.push('type');if(!sameText(previous.activityCategory,row.activityCategory))changes.push('category');if(!sameText(previous.companyScope,row.companyScope))changes.push('scope');if(Boolean(previous.active)!==row.active)changes.push('status');if(!sameArray(previous.components,row.components))changes.push('komposisi bahan');return changes}
function materialChanges(previous:Record<string,unknown>,row:ParsedMaterial){const changes:string[]=[];if(!sameText(previous.materialName,row.materialName))changes.push('material');if(!sameText(previous.activeIngredient,row.activeIngredient))changes.push('bahan aktif');if(!sameText(previous.unit,row.unit))changes.push('satuan');if(!sameText(previous.category,row.category))changes.push('kategori');if(Boolean(previous.active)!==row.active)changes.push('status');return changes}

async function compareFirestore(parsed:ParsedFile){
  if(!firestoreDb)throw new Error('Firestore belum tersedia.')
  const[activitySnap,materialSnap]=await Promise.all([getDocs(collection(firestoreDb,'master_activities')),getDocs(collection(firestoreDb,'master_materials'))]),activityExisting=new Map(activitySnap.docs.map(item=>[item.id,item.data() as Record<string,unknown>])),materialExisting=new Map(materialSnap.docs.map(item=>[item.id,item.data() as Record<string,unknown>]))
  const activities=parsed.activities.map<PreviewActivity>(row=>{const previous=activityExisting.get(row.docId);if(!previous)return{...row,status:'CREATE',changes:['activity baru']};const changes=activityChanges(previous,row);return{...row,status:changes.length?'UPDATE':'NO_CHANGE',changes}})
  const materials=parsed.materials.map<PreviewMaterial>(row=>{const previous=materialExisting.get(row.docId);if(!previous)return{...row,status:'CREATE',changes:['material baru']};const changes=materialChanges(previous,row);return{...row,status:changes.length?'UPDATE':'NO_CHANGE',changes}})
  return{activities,materials}
}

export default function MasterActivityImportPanel({user}:Props){
  const[companies,setCompanies]=useState<CompanyRecord[]>(FALLBACK_COMPANIES),[scope,setScope]=useState('GLOBAL')
  const[parsed,setParsed]=useState<ParsedFile|null>(null),[activityPreview,setActivityPreview]=useState<PreviewActivity[]>([]),[materialPreview,setMaterialPreview]=useState<PreviewMaterial[]>([])
  const[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[previewKind,setPreviewKind]=useState<'ACTIVITY'|'MATERIAL'>('ACTIVITY'),[filter,setFilter]=useState<'ALL'|ImportStatus>('ALL'),[qualityFilter,setQualityFilter]=useState<'ALL'|'WARNING'|'ERROR'|'INFO'>('ALL')
  const previewRef=useRef<HTMLDivElement|null>(null),qualityRef=useRef<HTMLDivElement|null>(null)

  useEffect(()=>{(async()=>{if(!firestoreDb)return;try{const snap=await getDocs(collection(firestoreDb,'master_companies')),rows=snap.docs.map(item=>companyFromData(item.id,item.data() as Record<string,unknown>)).filter(item=>item.active);if(rows.length)setCompanies(rows)}catch{/* fallback tetap dipakai */}})()},[])

  const errors=parsed?.issues.filter(issue=>issue.level==='ERROR').length||0,warnings=parsed?.issues.filter(issue=>issue.level==='WARNING').length||0,infos=parsed?.issues.filter(issue=>issue.level==='INFO').length||0
  const activityCounts=useMemo(()=>({create:activityPreview.filter(item=>item.status==='CREATE').length,update:activityPreview.filter(item=>item.status==='UPDATE').length,same:activityPreview.filter(item=>item.status==='NO_CHANGE').length,active:parsed?.activities.filter(item=>item.active).length||0,inactive:parsed?.activities.filter(item=>!item.active).length||0}),[activityPreview,parsed])
  const materialCounts=useMemo(()=>({create:materialPreview.filter(item=>item.status==='CREATE').length,update:materialPreview.filter(item=>item.status==='UPDATE').length,same:materialPreview.filter(item=>item.status==='NO_CHANGE').length}),[materialPreview])
  const visibleActivities=useMemo(()=>activityPreview.filter(item=>filter==='ALL'||item.status===filter).slice(0,200),[activityPreview,filter]),visibleMaterials=useMemo(()=>materialPreview.filter(item=>filter==='ALL'||item.status===filter).slice(0,200),[materialPreview,filter]),visibleIssues=useMemo(()=>parsed?.issues.filter(issue=>qualityFilter==='ALL'||issue.level===qualityFilter).slice(0,200)||[],[parsed,qualityFilter])

  function resetFile(){setParsed(null);setActivityPreview([]);setMaterialPreview([]);setMessage('');setFilter('ALL');setPreviewKind('ACTIVITY');setQualityFilter('ALL')}
  function jumpPreview(kind:'ACTIVITY'|'MATERIAL',next:'ALL'|ImportStatus='ALL'){setPreviewKind(kind);setFilter(next);requestAnimationFrame(()=>previewRef.current?.scrollIntoView({behavior:'smooth',block:'start'}))}
  function jumpQuality(next:'ALL'|'WARNING'|'ERROR'|'INFO'){setQualityFilter(next);requestAnimationFrame(()=>qualityRef.current?.scrollIntoView({behavior:'smooth',block:'start'}))}

  async function chooseFile(file:File|null){
    if(!file)return
    setBusy(true);setMessage('Membaca Master Activity…');setParsed(null);setActivityPreview([]);setMaterialPreview([])
    try{
      let codes:ExistingCodeMap={byDoc:new Map(),nextNumber:1};try{codes=await existingCodes()}catch{/* file tetap dapat divalidasi tanpa Firestore */}
      const result=parseWorkbook(await file.arrayBuffer(),file.name,scope,codes);setParsed(result)
      setActivityPreview(result.activities.map(item=>({...item,status:'CREATE' as const,changes:['Firestore belum dibandingkan']})));setMaterialPreview(result.materials.map(item=>({...item,status:'CREATE' as const,changes:['Firestore belum dibandingkan']})))
      setMessage(`File terbaca: ${result.activities.length} Activity (${result.activities.filter(item=>item.active).length} ACTIVE, ${result.activities.filter(item=>!item.active).length} INACTIVE) dan ${result.materials.length} Material.`)
      if(result.issues.some(issue=>issue.level==='ERROR'))return
      try{await firebaseWriterContext(user);const compared=await compareFirestore(result);setActivityPreview(compared.activities);setMaterialPreview(compared.materials);setMessage(`Preview siap: Activity ${compared.activities.filter(item=>item.status==='CREATE').length} CREATE / ${compared.activities.filter(item=>item.status==='UPDATE').length} UPDATE / ${compared.activities.filter(item=>item.status==='NO_CHANGE').length} NO CHANGE; Material ${compared.materials.filter(item=>item.status==='CREATE').length} CREATE / ${compared.materials.filter(item=>item.status==='UPDATE').length} UPDATE / ${compared.materials.filter(item=>item.status==='NO_CHANGE').length} NO CHANGE.`)}catch(error){setMessage(`${error instanceof Error?error.message:'Firestore belum dapat dibandingkan.'} File tetap berhasil divalidasi; import belum dijalankan.`)}
    }catch(error){setMessage(error instanceof Error?error.message:'File Master Activity gagal dibaca.')}finally{setBusy(false)}
  }

  async function refreshComparison(){if(!parsed||errors>0)return;setBusy(true);setMessage('Membandingkan Master Activity dengan Firestore…');try{await firebaseWriterContext(user);const compared=await compareFirestore(parsed);setActivityPreview(compared.activities);setMaterialPreview(compared.materials);setMessage('Perbandingan Firestore selesai.')}catch(error){setMessage(error instanceof Error?error.message:'Perbandingan Firestore gagal.')}finally{setBusy(false)}}

  async function importToFirestore(){
    if(!parsed||errors>0)return
    setBusy(true);setMessage('Verifikasi sebelum import…')
    try{
      const context=await firebaseWriterContext(user),compared=await compareFirestore(parsed);setActivityPreview(compared.activities);setMaterialPreview(compared.materials)
      const changedActivities=compared.activities.filter(item=>item.status!=='NO_CHANGE'),changedMaterials=compared.materials.filter(item=>item.status!=='NO_CHANGE')
      if(!changedActivities.length&&!changedMaterials.length){setMessage('Tidak ada perubahan yang perlu ditulis ke Firestore.');return}
      const confirmation=window.prompt(`Scope Activity: ${scope}\n\nActivity: ${changedActivities.length} ditulis (${changedActivities.filter(item=>item.status==='CREATE').length} baru, ${changedActivities.filter(item=>item.status==='UPDATE').length} update).\nMaterial: ${changedMaterials.length} ditulis (${changedMaterials.filter(item=>item.status==='CREATE').length} baru, ${changedMaterials.filter(item=>item.status==='UPDATE').length} update).\n${activityCounts.inactive} Activity tanpa komposisi akan disimpan INACTIVE.\nData yang hilang dari file TIDAK akan dihapus.\n\nKetik IMPORT untuk melanjutkan.`)
      if(confirmation!=='IMPORT'){setMessage('Import dibatalkan. Tidak ada data Firestore yang diubah.');return}
      const batchId=`ACTIVITY-${scope}-${new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)}`,writes=[...changedActivities.map(item=>({kind:'activity' as const,item})),...changedMaterials.map(item=>({kind:'material' as const,item}))];let written=0
      for(let start=0;start<writes.length;start+=250){const batch=writeBatch(context.db),chunk=writes.slice(start,start+250);chunk.forEach(entry=>{if(entry.kind==='activity'){const row=entry.item;batch.set(doc(context.db,'master_activities',row.docId),{activityCode:row.activityCode,description:row.description,activity:row.activity,type:row.type,activityCategory:row.activityCategory,companyScope:row.companyScope,active:row.active,components:row.components,componentCount:row.componentCount,sourceFileName:parsed.fileName,lastImportBatchId:batchId,updatedAt:serverTimestamp(),updatedBy:context.username},{merge:true})}else{const row=entry.item;batch.set(doc(context.db,'master_materials',row.docId),{materialName:row.materialName,activeIngredient:row.activeIngredient,unit:row.unit,category:row.category,active:row.active,sourceFileName:parsed.fileName,lastImportBatchId:batchId,updatedAt:serverTimestamp(),updatedBy:context.username},{merge:true})}});await batch.commit();written+=chunk.length;setMessage(`Import berjalan ${written}/${writes.length} record…`)}
      const logBatch=writeBatch(context.db);logBatch.set(doc(context.db,'master_activity_import_logs',batchId),{batchId,companyScope:scope,sourceFileName:parsed.fileName,activityCreated:compared.activities.filter(item=>item.status==='CREATE').length,activityUpdated:compared.activities.filter(item=>item.status==='UPDATE').length,activityUnchanged:compared.activities.filter(item=>item.status==='NO_CHANGE').length,materialCreated:compared.materials.filter(item=>item.status==='CREATE').length,materialUpdated:compared.materials.filter(item=>item.status==='UPDATE').length,materialUnchanged:compared.materials.filter(item=>item.status==='NO_CHANGE').length,warnings,infos,importedBy:context.username,importedAt:serverTimestamp()});await logBatch.commit()
      const after=await compareFirestore(parsed);setActivityPreview(after.activities);setMaterialPreview(after.materials);setMessage(`Import selesai. ${changedActivities.length} Activity dan ${changedMaterials.length} Material ditulis ke Firestore. Upload file yang sama kembali seharusnya menjadi NO CHANGE.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Import Master Activity gagal.')}finally{setBusy(false)}
  }

  return <section>
    <div className="section-head"><div><div className="eyebrow">MASTER DATA</div><h2>Import Master Activity</h2></div><span className="badge">Activity → bahan otomatis</span></div>
    <div className="panel form-stack">
      <h3>File Master Activity</h3>
      <p className="muted">File wajib berisi sheet <strong>List Validasi</strong>, <strong>Master Activity</strong>, dan <strong>Bahan</strong>. Activity tanpa komposisi bahan/dosis otomatis menjadi INACTIVE; user Plan tidak perlu memilih Package.</p>
      <div className="form-grid">
        <label>Scope Activity<select value={scope} disabled={busy||Boolean(parsed)} onChange={e=>{setScope(e.target.value);resetFile()}}><option value="GLOBAL">GLOBAL — seluruh company</option>{companies.map(company=><option key={company.id} value={company.code}>{company.code} — {company.name}</option>)}</select></label>
        <div><strong>Aturan Status</strong><p className="muted" style={{margin:'7px 0 0'}}>Ada komposisi + dosis valid → ACTIVE. Belum ada komposisi → INACTIVE.</p></div>
      </div>
      <label>File Master Activity (.xlsx / .xls)<input type="file" accept=".xlsx,.xls" disabled={busy} onChange={e=>void chooseFile(e.target.files?.[0]||null)}/></label>
      <div className="row-actions"><button type="button" disabled={busy||!parsed||errors>0} onClick={()=>void refreshComparison()}>Bandingkan Firestore</button><button type="button" className="primary" disabled={busy||!parsed||errors>0||(!activityPreview.length&&!materialPreview.length)} onClick={()=>void importToFirestore()}>{busy?'Memproses…':'Confirm Import Firestore'}</button></div>
      {message&&<div className="alert">{message}</div>}
    </div>
    {parsed&&<>
      <div className="stats-grid">
        <Stat label="Activity" value={parsed.activities.length} onClick={()=>jumpPreview('ACTIVITY')}/><Stat label="ACTIVE" value={activityCounts.active} onClick={()=>jumpPreview('ACTIVITY')}/><Stat label="INACTIVE" value={activityCounts.inactive} onClick={()=>jumpPreview('ACTIVITY')}/><Stat label="Material" value={parsed.materials.length} onClick={()=>jumpPreview('MATERIAL')}/><Stat label="Warning" value={warnings} onClick={()=>jumpQuality('WARNING')}/><Stat label="Error" value={errors} onClick={()=>jumpQuality('ERROR')}/>
      </div>
      <div className="panel" ref={previewRef}>
        <div className="section-head"><div><h3>Preview Perubahan</h3><p className="muted">Bandingkan Activity dan Material sebelum import.</p></div><div className="row-actions"><select value={previewKind} onChange={e=>setPreviewKind(e.target.value as 'ACTIVITY'|'MATERIAL')}><option value="ACTIVITY">Activity</option><option value="MATERIAL">Material</option></select><select value={filter} onChange={e=>setFilter(e.target.value as 'ALL'|ImportStatus)}><option value="ALL">Semua</option><option value="CREATE">CREATE</option><option value="UPDATE">UPDATE</option><option value="NO_CHANGE">NO CHANGE</option></select></div></div>
        {previewKind==='ACTIVITY'?<div className="table-wrap"><table><thead><tr><th>Status</th><th>Code</th><th>Deskripsi</th><th>Activity</th><th>Type</th><th>Category</th><th>Scope</th><th>Active</th><th>Komposisi</th><th>Perubahan</th></tr></thead><tbody>{visibleActivities.map(row=><tr key={row.docId}><td><span className="badge">{row.status}</span></td><td>{row.activityCode}</td><td><strong>{row.description}</strong></td><td>{row.activity}</td><td>{row.type}</td><td>{row.activityCategory}</td><td>{row.companyScope}</td><td>{row.active?'ACTIVE':'INACTIVE'}</td><td>{row.components.length?row.components.map(component=><div key={`${row.docId}-${component.sequence}`}>{component.sequence}. {component.activeIngredient} — {new Intl.NumberFormat('id-ID',{maximumFractionDigits:4}).format(component.dosePerHa)} {component.unit}/Ha</div>):'-'}</td><td>{row.changes.join(', ')||'-'}</td></tr>)}{!visibleActivities.length&&<tr><td colSpan={10} className="empty">Tidak ada Activity pada filter ini.</td></tr>}</tbody></table></div>:<div className="table-wrap"><table><thead><tr><th>Status</th><th>Material</th><th>Bahan Aktif</th><th>Satuan</th><th>Kategori</th><th>Perubahan</th></tr></thead><tbody>{visibleMaterials.map(row=><tr key={row.docId}><td><span className="badge">{row.status}</span></td><td><strong>{row.materialName}</strong></td><td>{row.activeIngredient}</td><td>{row.unit}</td><td>{row.category}</td><td>{row.changes.join(', ')||'-'}</td></tr>)}{!visibleMaterials.length&&<tr><td colSpan={6} className="empty">Tidak ada Material pada filter ini.</td></tr>}</tbody></table></div>}
      </div>
      <div className="panel" ref={qualityRef}><div className="section-head"><div><h3>Data Quality</h3><p className="muted">ERROR memblokir import. WARNING perlu ditinjau. INFO mencakup Activity yang otomatis INACTIVE.</p></div><select value={qualityFilter} onChange={e=>setQualityFilter(e.target.value as 'ALL'|'WARNING'|'ERROR'|'INFO')}><option value="ALL">Semua</option><option value="WARNING">WARNING</option><option value="ERROR">ERROR</option><option value="INFO">INFO</option></select></div><div className="table-wrap"><table><thead><tr><th>Level</th><th>Item</th><th>Catatan</th></tr></thead><tbody>{visibleIssues.map((issue,index)=><tr key={`${issue.item||'file'}-${index}`}><td>{issue.level}</td><td>{issue.item||'-'}</td><td>{issue.message}</td></tr>)}{!visibleIssues.length&&<tr><td colSpan={3} className="empty">Tidak ada catatan pada filter ini.</td></tr>}</tbody></table></div></div>
    </>}
  </section>
}

function Stat({label,value,onClick}:{label:string;value:number;onClick:()=>void}){return <button type="button" className="stat stat-button" onClick={onClick}><span>{label}</span><strong>{value}</strong><small>Klik untuk lihat</small></button>}
