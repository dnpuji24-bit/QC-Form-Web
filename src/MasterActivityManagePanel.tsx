import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import type { User } from './types'

type Props={user:User}
type View='VALIDATION'|'COMPOSITION'|'MATERIAL'
type ActivityComponent={sequence:number;label:string;activeIngredient:string;dosePerHa:number;unit:string}
type ActivityRow={id:string;activityCode:string;description:string;activity:string;type:string;activityCategory:string;companyScope:string;active:boolean;components:ActivityComponent[]}
type MaterialRow={id:string;materialName:string;activeIngredient:string;unit:string;category:string;active:boolean}
type FirestoreProfile={active?:boolean;role?:string;username?:string}
type ValidationForm={id:string;activityCode:string;description:string;activity:string;type:string;activityCategory:string;companyScope:string}
type MaterialForm={id:string;materialName:string;activeIngredient:string;unit:string;category:string;active:boolean}
type ReviewRow={key:string;kind:'ACTIVITY'|'MATERIAL';rowId:string;issue:string}

const emptyValidation:ValidationForm={id:'',activityCode:'',description:'',activity:'',type:'SPRAY',activityCategory:'HERBICIDE',companyScope:'GLOBAL'}
const emptyMaterial:MaterialForm={id:'',materialName:'',activeIngredient:'',unit:'Liter',category:'HERBICIDE',active:true}

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function numberValue(value:unknown){const parsed=Number(value||0);return Number.isFinite(parsed)?parsed:0}
function normalize(value:string){return value.trim().toLowerCase().replace(/\s+/g,' ')}
function slug(value:string){const result=value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');return result.slice(0,80)||'item'}
function activityDocId(scope:string,description:string){return`${slug(scope)}__${slug(description)}`}
function materialDocId(name:string){return slug(name)}
function doseKey(value:number){return String(Number(Number(value).toFixed(8)))}
function componentKey(component:ActivityComponent){return`${normalize(component.activeIngredient)}|${doseKey(component.dosePerHa)}|${normalize(component.unit)}`}
function recipeSignature(components:ActivityComponent[]){return components.map(componentKey).sort().join('||')}
function componentFromData(value:unknown):ActivityComponent[]{if(!Array.isArray(value))return[];return value.map((item,index)=>{const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return{sequence:numberValue(row.sequence)||index+1,label:text(row.label)||`Bahan ${index+1}`,activeIngredient:text(row.activeIngredient),dosePerHa:numberValue(row.dosePerHa),unit:text(row.unit)}}).filter(item=>item.activeIngredient&&item.dosePerHa>0&&item.unit).sort((a,b)=>a.sequence-b.sequence)}
function activityFromData(id:string,data:Record<string,unknown>):ActivityRow{return{id,activityCode:text(data.activityCode),description:text(data.description),activity:text(data.activity),type:text(data.type).toUpperCase(),activityCategory:text(data.activityCategory).toUpperCase(),companyScope:text(data.companyScope)||'GLOBAL',active:data.active===true,components:componentFromData(data.components)}}
function materialFromData(id:string,data:Record<string,unknown>):MaterialRow{return{id,materialName:text(data.materialName),activeIngredient:text(data.activeIngredient),unit:text(data.unit),category:text(data.category).toUpperCase(),active:data.active!==false}}
function formatDose(value:number){return new Intl.NumberFormat('id-ID',{maximumFractionDigits:4}).format(value)}

async function writerContext(appUser:User){
  const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum terkonfigurasi.')
  const current=auth.currentUser;if(!current)throw new Error('Firebase Auth belum terhubung. Login ulang lalu coba lagi.')
  const snapshot=await getDoc(doc(db,'users',current.uid));if(!snapshot.exists())throw new Error('Profil Firebase user tidak ditemukan.')
  const profile=snapshot.data() as FirestoreProfile;if(profile.active!==true)throw new Error('Profil Firebase tidak aktif.')
  if(!['owner','asisten'].includes(profile.role||''))throw new Error('Hanya Owner/Asisten yang dapat mengubah Master Activity.')
  if(!['owner','asisten'].includes(appUser.role))throw new Error('Role web tidak memiliki izin mengubah Master Activity.')
  return{db,username:profile.username||appUser.username,role:profile.role||appUser.role}
}

function nextActivityCode(rows:ActivityRow[]){const numbers=rows.map(row=>row.activityCode.match(/^ACT-(\d+)$/i)).filter(Boolean).map(match=>Number(match?.[1]||0));return`ACT-${String((numbers.length?Math.max(...numbers):0)+1).padStart(3,'0')}`}

export default function MasterActivityManagePanel({user}:Props){
  const[view,setView]=useState<View>('VALIDATION'),[activities,setActivities]=useState<ActivityRow[]>([]),[materials,setMaterials]=useState<MaterialRow[]>([])
  const[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const[validationForm,setValidationForm]=useState<ValidationForm>(emptyValidation),[materialForm,setMaterialForm]=useState<MaterialForm>(emptyMaterial)
  const[selectedActivityId,setSelectedActivityId]=useState(''),[components,setComponents]=useState<ActivityComponent[]>([])

  async function load(nextMessage='Master Activity siap dikelola.'){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    setBusy(true)
    try{const[a,m]=await Promise.all([getDocs(collection(firestoreDb,'master_activities')),getDocs(collection(firestoreDb,'master_materials'))]);const nextActivities=a.docs.map(item=>activityFromData(item.id,item.data() as Record<string,unknown>)).sort((x,y)=>x.activity.localeCompare(y.activity)||x.description.localeCompare(y.description,undefined,{numeric:true}));const nextMaterials=m.docs.map(item=>materialFromData(item.id,item.data() as Record<string,unknown>)).sort((x,y)=>x.materialName.localeCompare(y.materialName));setActivities(nextActivities);setMaterials(nextMaterials);setMessage(nextMessage)}catch(error){setMessage(error instanceof Error?error.message:'Master Activity gagal dimuat.')}finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[])

  const ingredientOptions=useMemo(()=>[...new Set(materials.filter(row=>row.active).map(row=>row.activeIngredient).filter(Boolean))].sort(),[materials])
  const ingredientUnit=useMemo(()=>{const map=new Map<string,string>();materials.filter(row=>row.active).forEach(row=>{const key=normalize(row.activeIngredient);if(!map.has(key))map.set(key,row.unit)});return map},[materials])
  const categoryOptions=useMemo(()=>[...new Set([...activities.map(row=>row.activityCategory),...materials.map(row=>row.category),'HERBICIDE','INSECTICIDE','FUNGICIDE','FERTILIZER','ADJUVANT','OTHER'].filter(Boolean))].sort(),[activities,materials])
  const scopeOptions=useMemo(()=>[...new Set(['GLOBAL',...activities.map(row=>row.companyScope).filter(Boolean)])].sort(),[activities])

  const reviewRows=useMemo(()=>{
    const rows:ReviewRow[]=[],seen=new Set<string>(),push=(row:ReviewRow)=>{const key=`${row.kind}|${row.rowId}|${row.issue}`;if(!seen.has(key)){seen.add(key);rows.push(row)}}
    const activeActivities=activities.filter(row=>row.active),activeMaterials=materials.filter(row=>row.active)
    const descriptionMap=new Map<string,ActivityRow[]>();activeActivities.forEach(row=>{const key=normalize(row.description),list=descriptionMap.get(key)||[];list.push(row);descriptionMap.set(key,list)});descriptionMap.forEach(list=>{if(list.length>1)list.forEach(row=>push({key:`desc-${row.id}`,kind:'ACTIVITY',rowId:row.id,issue:`Deskripsi Activity identik: ${list.map(item=>item.activityCode).join(' / ')}`}))})
    const materialMap=new Map<string,MaterialRow[]>();activeMaterials.forEach(row=>{const key=normalize(row.materialName),list=materialMap.get(key)||[];list.push(row);materialMap.set(key,list)});materialMap.forEach(list=>{if(list.length>1)list.forEach(row=>push({key:`material-${row.id}`,kind:'MATERIAL',rowId:row.id,issue:`Nama Material identik: ${list.map(item=>item.materialName).join(' / ')}`}))})
    const recipeMap=new Map<string,ActivityRow[]>();activeActivities.filter(row=>row.components.length>0).forEach(row=>{const signature=recipeSignature(row.components),list=recipeMap.get(signature)||[];list.push(row);recipeMap.set(signature,list);const own=new Set<string>();let duplicateInside=false;row.components.forEach(component=>{const key=componentKey(component);if(own.has(key))duplicateInside=true;own.add(key)});if(duplicateInside)push({key:`inside-${row.id}`,kind:'ACTIVITY',rowId:row.id,issue:'Bahan aktif + dosis + satuan terduplikasi di Activity yang sama.'})});recipeMap.forEach(list=>{if(list.length>1)list.forEach(row=>push({key:`recipe-${row.id}`,kind:'ACTIVITY',rowId:row.id,issue:`Komposisi bahan+dosis identik walau urutan berbeda: ${list.map(item=>item.description).join(' / ')}`}))})
    return rows
  },[activities,materials])
  const safetyIssues=useMemo(()=>[...new Set(reviewRows.map(row=>row.issue))],[reviewRows])

  function editValidation(row:ActivityRow){setValidationForm({id:row.id,activityCode:row.activityCode,description:row.description,activity:row.activity,type:row.type,activityCategory:row.activityCategory,companyScope:row.companyScope});setView('VALIDATION')}
  function resetValidation(){setValidationForm(emptyValidation)}
  function editMaterial(row:MaterialRow){setMaterialForm({id:row.id,materialName:row.materialName,activeIngredient:row.activeIngredient,unit:row.unit,category:row.category,active:row.active});setView('MATERIAL')}
  function resetMaterial(){setMaterialForm(emptyMaterial)}
  function editComposition(row:ActivityRow){setSelectedActivityId(row.id);setComponents(row.components.map((component,index)=>({...component,sequence:index+1})));setView('COMPOSITION')}
  function selectActivity(id:string){setSelectedActivityId(id);const row=activities.find(item=>item.id===id);setComponents(row?row.components.map((component,index)=>({...component,sequence:index+1})):[])}

  function recipeConflict(candidate:ActivityComponent[],ignoreActivityId:string){if(!candidate.length)return'';const signature=recipeSignature(candidate);const conflict=activities.find(row=>row.id!==ignoreActivityId&&row.active&&row.components.length>0&&recipeSignature(row.components)===signature);return conflict?.description||''}
  function brokenActivityMappings(projectedMaterials:MaterialRow[]){return activities.filter(activity=>activity.active&&activity.components.some(component=>!projectedMaterials.some(material=>material.active&&normalize(material.activeIngredient)===normalize(component.activeIngredient)&&normalize(material.unit)===normalize(component.unit)))).map(activity=>activity.description)}

  async function saveValidation(){
    const description=validationForm.description.trim(),activity=validationForm.activity.trim(),type=validationForm.type.trim().toUpperCase(),activityCategory=validationForm.activityCategory.trim().toUpperCase(),companyScope=validationForm.companyScope.trim().toUpperCase()||'GLOBAL'
    if(!description||!activity||!type||!activityCategory){setMessage('Deskripsi, Activity, Type, dan Activity Category wajib diisi.');return}
    const duplicate=activities.find(row=>row.id!==validationForm.id&&row.active&&normalize(row.description)===normalize(description));if(duplicate){setMessage(`DITOLAK: Deskripsi "${description}" identik dengan Activity ACTIVE ${duplicate.activityCode} — ${duplicate.description}.`);return}
    const existing=activities.find(row=>row.id===validationForm.id),existingComponents=existing?.components||[]
    setBusy(true);setMessage('Menyimpan List Validasi…')
    try{const context=await writerContext(user),targetId=activityDocId(companyScope,description),code=existing?.activityCode||nextActivityCode(activities);if(activities.some(row=>row.id!==validationForm.id&&row.id===targetId))throw new Error('ID Activity tujuan sudah digunakan. Ubah Deskripsi atau Scope.');const batch=writeBatch(context.db);batch.set(doc(context.db,'master_activities',targetId),{activityCode:code,description,activity,type,activityCategory,companyScope,active:existingComponents.length>0?(existing?.active!==false):false,components:existingComponents,componentCount:existingComponents.length,updatedAt:serverTimestamp(),updatedBy:context.username,source:'WEB_MANUAL'},{merge:true});if(validationForm.id&&validationForm.id!==targetId)batch.delete(doc(context.db,'master_activities',validationForm.id));await batch.commit();resetValidation();await load(`List Validasi tersimpan: ${code} — ${description}.`)}catch(error){setMessage(error instanceof Error?error.message:'List Validasi gagal disimpan.')}finally{setBusy(false)}
  }

  async function deleteValidation(row:ActivityRow){
    if(user.role!=='owner'){setMessage('Hanya Owner yang dapat menghapus Activity.');return}
    if(row.components.length>0||row.active){setMessage(`Safety: ${row.description} masih memiliki komposisi/status ACTIVE. Hapus seluruh komposisi terlebih dahulu sampai Activity menjadi INACTIVE.`);return}
    if(window.prompt(`Hapus Activity ${row.activityCode} — ${row.description}?\nKetik HAPUS untuk konfirmasi.`)!=='HAPUS')return
    setBusy(true)
    try{const context=await writerContext(user);const batch=writeBatch(context.db);batch.delete(doc(context.db,'master_activities',row.id));await batch.commit();if(validationForm.id===row.id)resetValidation();await load(`Activity ${row.description} telah dihapus.`)}catch(error){setMessage(error instanceof Error?error.message:'Activity gagal dihapus.')}finally{setBusy(false)}
  }

  async function forceInactiveActivity(row:ActivityRow){
    if(!window.confirm(`Paksa ${row.activityCode} — ${row.description} menjadi INACTIVE? Komposisi tetap disimpan tetapi Activity tidak muncul di pilihan Plan.`))return
    setBusy(true)
    try{const context=await writerContext(user),batch=writeBatch(context.db);batch.set(doc(context.db,'master_activities',row.id),{active:false,updatedAt:serverTimestamp(),updatedBy:context.username,reviewAction:'FORCE_INACTIVE'},{merge:true});await batch.commit();await load(`${row.description} dipaksa INACTIVE. Data komposisi tetap disimpan.`)}catch(error){setMessage(error instanceof Error?error.message:'Activity gagal dinonaktifkan.')}finally{setBusy(false)}
  }

  async function deleteReviewActivity(row:ActivityRow){
    if(user.role!=='owner'){setMessage('Hanya Owner yang dapat menghapus Activity dari Review Pasca Import.');return}
    if(window.prompt(`HAPUS DATA REVIEW\n${row.activityCode} — ${row.description}\n\nGunakan hanya untuk data duplikat/keliru hasil import yang belum dipakai Plan.\nKetik HAPUS untuk konfirmasi.`)!=='HAPUS')return
    setBusy(true)
    try{const context=await writerContext(user),batch=writeBatch(context.db);batch.delete(doc(context.db,'master_activities',row.id));await batch.commit();if(validationForm.id===row.id)resetValidation();if(selectedActivityId===row.id){setSelectedActivityId('');setComponents([])}await load(`Activity review ${row.description} telah dihapus.`)}catch(error){setMessage(error instanceof Error?error.message:'Activity review gagal dihapus.')}finally{setBusy(false)}
  }

  async function saveComposition(){
    const row=activities.find(item=>item.id===selectedActivityId);if(!row){setMessage('Pilih Activity terlebih dahulu.');return}
    const cleaned=components.map((component,index)=>({sequence:index+1,label:`Bahan ${index+1}`,activeIngredient:component.activeIngredient.trim(),dosePerHa:Number(component.dosePerHa),unit:component.unit.trim()}))
    for(const component of cleaned)if(!component.activeIngredient||!Number.isFinite(component.dosePerHa)||component.dosePerHa<=0||!component.unit){setMessage('DITOLAK: setiap bahan wajib memiliki Bahan Aktif, Dosis/Ha > 0, dan Satuan.');return}
    const keys=new Set<string>();for(const component of cleaned){const key=componentKey(component);if(keys.has(key)){setMessage(`DITOLAK: ${component.activeIngredient} dosis ${formatDose(component.dosePerHa)} ${component.unit}/Ha sudah ada di Activity ini. Urutan Bahan/Pesticide tidak membuatnya berbeda.`);return}keys.add(key);const validMaterial=materials.some(material=>material.active&&normalize(material.activeIngredient)===normalize(component.activeIngredient)&&normalize(material.unit)===normalize(component.unit));if(!validMaterial){setMessage(`DITOLAK: ${component.activeIngredient} (${component.unit}) belum memiliki Master Bahan ACTIVE dengan satuan yang sama.`);return}}
    const conflict=recipeConflict(cleaned,row.id);if(conflict){setMessage(`DITOLAK: seluruh kombinasi Bahan Aktif + Dosis + Satuan identik dengan Activity ACTIVE "${conflict}". Menukar Bahan 1/Bahan 2 tidak dianggap komposisi baru.`);return}
    setBusy(true);setMessage('Menyimpan komposisi Activity…')
    try{const context=await writerContext(user),batch=writeBatch(context.db);batch.set(doc(context.db,'master_activities',row.id),{components:cleaned,componentCount:cleaned.length,active:cleaned.length>0,updatedAt:serverTimestamp(),updatedBy:context.username,source:'WEB_MANUAL'},{merge:true});await batch.commit();await load(cleaned.length?`Komposisi ${row.description} tersimpan (${cleaned.length} bahan).`:`Komposisi ${row.description} dikosongkan; Activity otomatis INACTIVE.`);if(!cleaned.length)setComponents([]);else setComponents(cleaned)}catch(error){setMessage(error instanceof Error?error.message:'Komposisi gagal disimpan.')}finally{setBusy(false)}
  }

  function addComponent(){setComponents(current=>[...current,{sequence:current.length+1,label:`Bahan ${current.length+1}`,activeIngredient:'',dosePerHa:0,unit:''}])}
  function updateComponent(index:number,patch:Partial<ActivityComponent>){setComponents(current=>current.map((component,i)=>i===index?{...component,...patch}:component))}
  function removeComponent(index:number){setComponents(current=>current.filter((_,i)=>i!==index).map((component,i)=>({...component,sequence:i+1,label:`Bahan ${i+1}`})))}

  async function saveMaterial(){
    const materialName=materialForm.materialName.trim(),activeIngredient=materialForm.activeIngredient.trim(),unit=materialForm.unit.trim(),category=materialForm.category.trim().toUpperCase();if(!materialName||!activeIngredient||!unit){setMessage('Material, Bahan Aktif, dan Satuan wajib diisi.');return}
    const duplicate=materials.find(row=>row.id!==materialForm.id&&row.active&&normalize(row.materialName)===normalize(materialName));if(duplicate){setMessage(`DITOLAK: nama Material "${materialName}" identik dengan Material ACTIVE "${duplicate.materialName}".`);return}
    const targetId=materialDocId(materialName);if(materials.some(row=>row.id!==materialForm.id&&row.id===targetId)){setMessage('DITOLAK: ID Material hasil normalisasi sudah digunakan oleh bahan lain.');return}
    const candidate:MaterialRow={id:targetId,materialName,activeIngredient,unit,category,active:materialForm.active};const projected=materials.filter(row=>row.id!==materialForm.id).concat(candidate),broken=brokenActivityMappings(projected);if(broken.length){setMessage(`DITOLAK: perubahan ini membuat Activity ACTIVE kehilangan Master Bahan yang cocok: ${broken.slice(0,5).join(', ')}${broken.length>5?` +${broken.length-5} lainnya`:''}.`);return}
    setBusy(true);setMessage('Menyimpan Master Bahan…')
    try{const context=await writerContext(user),batch=writeBatch(context.db);batch.set(doc(context.db,'master_materials',targetId),{materialName,activeIngredient,unit,category,active:materialForm.active,updatedAt:serverTimestamp(),updatedBy:context.username,source:'WEB_MANUAL'},{merge:true});if(materialForm.id&&materialForm.id!==targetId)batch.delete(doc(context.db,'master_materials',materialForm.id));await batch.commit();resetMaterial();await load(`Master Bahan tersimpan: ${materialName}.`)}catch(error){setMessage(error instanceof Error?error.message:'Master Bahan gagal disimpan.')}finally{setBusy(false)}
  }

  async function forceInactiveMaterial(row:MaterialRow){
    if(!window.confirm(`Paksa Material "${row.materialName}" menjadi INACTIVE? Material tetap tersimpan tetapi tidak dipakai sebagai pilihan aktif.`))return
    setBusy(true)
    try{const context=await writerContext(user),batch=writeBatch(context.db);batch.set(doc(context.db,'master_materials',row.id),{active:false,updatedAt:serverTimestamp(),updatedBy:context.username,reviewAction:'FORCE_INACTIVE'},{merge:true});await batch.commit();await load(`Material ${row.materialName} dipaksa INACTIVE.`)}catch(error){setMessage(error instanceof Error?error.message:'Material gagal dinonaktifkan.')}finally{setBusy(false)}
  }

  async function deleteMaterial(row:MaterialRow){
    if(user.role!=='owner'){setMessage('Hanya Owner yang dapat menghapus Master Bahan.');return}
    const projected=materials.filter(item=>item.id!==row.id),broken=brokenActivityMappings(projected);if(broken.length){setMessage(`Safety: ${row.materialName} tidak dapat dihapus karena merupakan Master Bahan terakhir yang cocok untuk Activity ACTIVE: ${broken.slice(0,5).join(', ')}${broken.length>5?` +${broken.length-5} lainnya`:''}.`);return}
    if(window.prompt(`Hapus Material "${row.materialName}"?\nKetik HAPUS untuk konfirmasi.`)!=='HAPUS')return
    setBusy(true)
    try{const context=await writerContext(user),batch=writeBatch(context.db);batch.delete(doc(context.db,'master_materials',row.id));await batch.commit();if(materialForm.id===row.id)resetMaterial();await load(`Material ${row.materialName} telah dihapus.`)}catch(error){setMessage(error instanceof Error?error.message:'Material gagal dihapus.')}finally{setBusy(false)}
  }

  const selectedActivity=activities.find(row=>row.id===selectedActivityId)

  return <section>
    <div className="section-head"><div><div className="eyebrow">MANUAL MASTER</div><h2>Kelola Master Activity</h2><p className="muted">Input manual tetap memakai safety ketat. Import Excel dibuat lebih longgar; data duplikat dapat masuk lalu ditinjau di Review Pasca Import untuk diedit, dipaksa INACTIVE, atau dihapus.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memproses…':'Refresh'}</button></div>
    {message&&<div className="alert" style={{whiteSpace:'pre-line'}}>{message}</div>}
    <div className="segmented" aria-label="Kelola Master Activity"><button type="button" className={view==='VALIDATION'?'active':''} onClick={()=>setView('VALIDATION')}>List Validasi</button><button type="button" className={view==='COMPOSITION'?'active':''} onClick={()=>setView('COMPOSITION')}>Komposisi Activity</button><button type="button" className={view==='MATERIAL'?'active':''} onClick={()=>setView('MATERIAL')}>Master Bahan</button></div>
    <div className="panel"><div className="section-head"><div><h3>Safety Master</h3><p className="muted">Hanya data ACTIVE yang dihitung sebagai konflik. Urutan Bahan 1/2/3 diabaikan saat membandingkan komposisi.</p></div><span className="badge">{safetyIssues.length?safetyIssues.length+' issue':'AMAN'}</span></div>{safetyIssues.length?<div>{safetyIssues.slice(0,10).map((issue,index)=><div key={index} className="alert" style={{marginBottom:8}}>{issue}</div>)}</div>:<p className="muted">Tidak ditemukan konflik ACTIVE pada nama Material, Deskripsi, komponen, atau komposisi Activity.</p>}</div>

    {reviewRows.length>0&&<div className="panel"><div className="section-head"><div><h3>Review Pasca Import</h3><p className="muted">Tidak memblokir import. Pilih tindakan per record: Edit, perbaiki Komposisi, Paksa INACTIVE, atau Hapus. Menjadikan salah satu record INACTIVE sudah cukup untuk mengeluarkannya dari konflik aktif.</p></div><span className="badge">{reviewRows.length} record perlu review</span></div><div className="table-wrap"><table><thead><tr><th>Jenis</th><th>Record</th><th>Issue</th><th>Aksi</th></tr></thead><tbody>{reviewRows.map(review=>{if(review.kind==='ACTIVITY'){const row=activities.find(item=>item.id===review.rowId);if(!row)return null;return <tr key={review.key}><td>ACTIVITY</td><td><strong>{row.activityCode} — {row.description}</strong><div className="muted">{row.active?'ACTIVE':'INACTIVE'}</div></td><td>{review.issue}</td><td><div className="row-actions"><button type="button" onClick={()=>editValidation(row)}>Edit</button><button type="button" onClick={()=>editComposition(row)}>Komposisi</button><button type="button" onClick={()=>void forceInactiveActivity(row)}>Paksa INACTIVE</button><button type="button" disabled={user.role!=='owner'} onClick={()=>void deleteReviewActivity(row)}>Hapus</button></div></td></tr>}const row=materials.find(item=>item.id===review.rowId);if(!row)return null;return <tr key={review.key}><td>MATERIAL</td><td><strong>{row.materialName}</strong><div className="muted">{row.active?'ACTIVE':'INACTIVE'}</div></td><td>{review.issue}</td><td><div className="row-actions"><button type="button" onClick={()=>editMaterial(row)}>Edit</button><button type="button" onClick={()=>void forceInactiveMaterial(row)}>Paksa INACTIVE</button><button type="button" disabled={user.role!=='owner'} onClick={()=>void deleteMaterial(row)}>Hapus</button></div></td></tr>})}</tbody></table></div></div>}

    {view==='VALIDATION'&&<>
      <div className="panel form-stack"><div className="section-head"><div><h3>{validationForm.id?'Edit List Validasi':'Tambah List Validasi'}</h3><p className="muted">Activity baru tanpa komposisi otomatis INACTIVE. Nama Deskripsi tidak boleh sama dengan Activity ACTIVE lain.</p></div>{validationForm.id&&<button type="button" onClick={resetValidation}>Batal Edit</button>}</div><div className="form-grid"><label>Activity Code<input value={validationForm.activityCode||'(otomatis)'} readOnly/></label><label>Deskripsi<input value={validationForm.description} onChange={e=>setValidationForm({...validationForm,description:e.target.value})} placeholder="contoh: Post Emergence A"/></label><label>Activity<input value={validationForm.activity} onChange={e=>setValidationForm({...validationForm,activity:e.target.value})} placeholder="contoh: Post Emergence"/></label><label>Type<select value={validationForm.type} onChange={e=>setValidationForm({...validationForm,type:e.target.value})}><option value="SPRAY">SPRAY</option><option value="FERTILIZER">FERTILIZER</option></select></label><label>Activity Category<select value={validationForm.activityCategory} onChange={e=>setValidationForm({...validationForm,activityCategory:e.target.value})}>{categoryOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label><label>Scope<select value={validationForm.companyScope} onChange={e=>setValidationForm({...validationForm,companyScope:e.target.value})}>{scopeOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label></div><div className="row-actions"><button type="button" className="primary" disabled={busy} onClick={()=>void saveValidation()}>{validationForm.id?'Simpan Perubahan':'Tambah Activity'}</button></div></div>
      <div className="panel"><div className="table-wrap"><table><thead><tr><th>Code</th><th>Deskripsi</th><th>Activity</th><th>Type</th><th>Category</th><th>Scope</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{activities.map(row=><tr key={row.id}><td>{row.activityCode}</td><td><strong>{row.description}</strong></td><td>{row.activity}</td><td>{row.type}</td><td>{row.activityCategory}</td><td>{row.companyScope}</td><td>{row.active?'ACTIVE':'INACTIVE'}</td><td><div className="row-actions"><button type="button" onClick={()=>editValidation(row)}>Edit</button><button type="button" onClick={()=>editComposition(row)}>Komposisi</button><button type="button" disabled={user.role!=='owner'} onClick={()=>void deleteValidation(row)}>Hapus</button></div></td></tr>)}</tbody></table></div></div>
    </>}

    {view==='COMPOSITION'&&<>
      <div className="panel form-stack"><label>Pilih Activity<select value={selectedActivityId} onChange={e=>selectActivity(e.target.value)}><option value="">Pilih Activity…</option>{activities.map(row=><option key={row.id} value={row.id}>{row.activityCode} — {row.description} ({row.active?'ACTIVE':'INACTIVE'})</option>)}</select></label>{selectedActivity&&<><div className="section-head"><div><h3>{selectedActivity.description}</h3><p className="muted">Urutan hanya untuk tampilan. Safety manual membandingkan Bahan Aktif + Dosis + Satuan tanpa memperhatikan urutan dan hanya terhadap Activity ACTIVE.</p></div><button type="button" onClick={addComponent}>+ Tambah Bahan</button></div>{components.map((component,index)=><div key={index} className="panel" style={{marginBottom:10}}><div className="form-grid"><label>Bahan {index+1}<select value={component.activeIngredient} onChange={e=>{const ingredient=e.target.value;updateComponent(index,{activeIngredient:ingredient,unit:ingredientUnit.get(normalize(ingredient))||''})}}><option value="">Pilih Bahan Aktif…</option>{ingredientOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label><label>Dosis / Ha<input type="number" min="0" step="any" value={component.dosePerHa||''} onChange={e=>updateComponent(index,{dosePerHa:Number(e.target.value)})}/></label><label>Satuan<input value={component.unit} readOnly placeholder="otomatis dari Master Bahan"/></label></div><div className="row-actions"><button type="button" onClick={()=>removeComponent(index)}>Hapus Bahan Ini</button></div></div>)}{!components.length&&<div className="alert">Belum ada komposisi. Jika disimpan kosong, Activity menjadi INACTIVE.</div>}<div className="row-actions"><button type="button" className="primary" disabled={busy} onClick={()=>void saveComposition()}>Simpan Komposisi</button></div></>}</div>
      <div className="panel"><div className="table-wrap"><table><thead><tr><th>Activity</th><th>Status</th><th>Komposisi</th><th>Aksi</th></tr></thead><tbody>{activities.map(row=><tr key={row.id}><td><strong>{row.description}</strong><div className="muted">{row.activityCode}</div></td><td>{row.active?'ACTIVE':'INACTIVE'}</td><td>{row.components.length?row.components.map((component,index)=><div key={index}>{index+1}. {component.activeIngredient} — {formatDose(component.dosePerHa)} {component.unit}/Ha</div>):'-'}</td><td><button type="button" onClick={()=>editComposition(row)}>Edit Komposisi</button></td></tr>)}</tbody></table></div></div>
    </>}

    {view==='MATERIAL'&&<>
      <div className="panel form-stack"><div className="section-head"><div><h3>{materialForm.id?'Edit Master Bahan':'Tambah Master Bahan'}</h3><p className="muted">Nama Material ACTIVE harus unik. Bahan Aktif boleh sama untuk beberapa produk komersial.</p></div>{materialForm.id&&<button type="button" onClick={resetMaterial}>Batal Edit</button>}</div><div className="form-grid"><label>Material<input value={materialForm.materialName} onChange={e=>setMaterialForm({...materialForm,materialName:e.target.value})} placeholder="Nama produk/material"/></label><label>Bahan Aktif / Komposisi Utama<input value={materialForm.activeIngredient} onChange={e=>setMaterialForm({...materialForm,activeIngredient:e.target.value})}/></label><label>Satuan<input value={materialForm.unit} onChange={e=>setMaterialForm({...materialForm,unit:e.target.value})} placeholder="Liter / Kg"/></label><label>Kategori<select value={materialForm.category} onChange={e=>setMaterialForm({...materialForm,category:e.target.value})}>{categoryOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label><label>Status<select value={materialForm.active?'ACTIVE':'INACTIVE'} onChange={e=>setMaterialForm({...materialForm,active:e.target.value==='ACTIVE'})}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label></div><div className="row-actions"><button type="button" className="primary" disabled={busy} onClick={()=>void saveMaterial()}>{materialForm.id?'Simpan Perubahan':'Tambah Bahan'}</button></div></div>
      <div className="panel"><div className="table-wrap"><table><thead><tr><th>Material</th><th>Bahan Aktif</th><th>Satuan</th><th>Kategori</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{materials.map(row=><tr key={row.id}><td><strong>{row.materialName}</strong></td><td>{row.activeIngredient}</td><td>{row.unit}</td><td>{row.category}</td><td>{row.active?'ACTIVE':'INACTIVE'}</td><td><div className="row-actions"><button type="button" onClick={()=>editMaterial(row)}>Edit</button><button type="button" disabled={user.role!=='owner'} onClick={()=>void deleteMaterial(row)}>Hapus</button></div></td></tr>)}</tbody></table></div></div>
    </>}
  </section>
}
