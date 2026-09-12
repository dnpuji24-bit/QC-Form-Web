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

  const safetyIssues=useMemo(()=>{
    const issues:string[]=[]
    const descriptionMap=new Map<string,string[]>();activities.forEach(row=>{const key=normalize(row.description),list=descriptionMap.get(key)||[];list.push(row.description);descriptionMap.set(key,list)});descriptionMap.forEach(list=>{if(list.length>1)issues.push(`Deskripsi Activity identik: ${list.join(' / ')}`)})
    const materialMap=new Map<string,string[]>();materials.forEach(row=>{const key=normalize(row.materialName),list=materialMap.get(key)||[];list.push(row.materialName);materialMap.set(key,list)});materialMap.forEach(list=>{if(list.length>1)issues.push(`Nama Material identik: ${list.join(' / ')}`)})
    const recipeMap=new Map<string,string[]>();activities.filter(row=>row.components.length>0).forEach(row=>{const signature=recipeSignature(row.components),list=recipeMap.get(signature)||[];list.push(row.description);recipeMap.set(signature,list);const own=new Set<string>();row.components.forEach(component=>{const key=componentKey(component);if(own.has(key))issues.push(`${row.description}: bahan aktif + dosis + satuan terduplikasi.`);own.add(key)})});recipeMap.forEach(list=>{if(list.length>1)issues.push(`Komposisi bahan+dosis identik walau urutan berbeda: ${list.join(' / ')}`)})
    return issues
  },[activities,materials])

  function editValidation(row:ActivityRow){setValidationForm({id:row.id,activityCode:row.activityCode,description:row.description,activity:row.activity,type:row.type,activityCategory:row.activityCategory,companyScope:row.companyScope});setView('VALIDATION')}
  function resetValidation(){setValidationForm(emptyValidation)}
  function editMaterial(row:MaterialRow){setMaterialForm({id:row.id,materialName:row.materialName,activeIngredient:row.activeIngredient,unit:row.unit,category:row.category,active:row.active});setView('MATERIAL')}
  function resetMaterial(){setMaterialForm(emptyMaterial)}
  function editComposition(row:ActivityRow){setSelectedActivityId(row.id);setComponents(row.components.map((component,index)=>({...component,sequence:index+1})));setView('COMPOSITION')}
  function selectActivity(id:string){setSelectedActivityId(id);const row=activities.find(item=>item.id===id);setComponents(row?row.components.map((component,index)=>({...component,sequence:index+1})):[])}

  function recipeConflict(candidate:ActivityComponent[],ignoreActivityId:string){if(!candidate.length)return'';const signature=recipeSignature(candidate);const conflict=activities.find(row=>row.id!==ignoreActivityId&&row.components.length>0&&recipeSignature(row.components)===signature);return conflict?.description||''}
  function brokenActivityMappings(projectedMaterials:MaterialRow[]){return activities.filter(activity=>activity.components.some(component=>!projectedMaterials.some(material=>material.active&&normalize(material.activeIngredient)===normalize(component.activeIngredient)&&normalize(material.unit)===normalize(component.unit)))).map(activity=>activity.description)}

  async function saveValidation(){
    const description=validationForm.description.trim(),activity=validationForm.activity.trim(),type=validationForm.type.trim().toUpperCase(),activityCategory=validationForm.activityCategory.trim().toUpperCase(),companyScope=validationForm.companyScope.trim().toUpperCase()||'GLOBAL'
    if(!description||!activity||!type||!activityCategory){setMessage('Deskripsi, Activity, Type, dan Activity Category wajib diisi.');return}
    const duplicate=activities.find(row=>row.id!==validationForm.id&&normalize(row.description)===normalize(description));if(duplicate){setMessage(`DITOLAK: Deskripsi "${description}" identik dengan Activity ${duplicate.activityCode} — ${duplicate.description}.`);return}
    const existing=activities.find(row=>row.id===validationForm.id),existingComponents=existing?.components||[]
    const conflict=recipeConflict(existingComponents,validationForm.id);if(conflict){setMessage(`DITOLAK: komposisi ${existing?.description||description} identik dengan ${conflict}. Perbaiki komposisi sebelum menyimpan metadata.`);return}
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

  async function saveComposition(){
    const row=activities.find(item=>item.id===selectedActivityId);if(!row){setMessage('Pilih Activity terlebih dahulu.');return}
    const cleaned=components.map((component,index)=>({sequence:index+1,label:`Bahan ${index+1}`,activeIngredient:component.activeIngredient.trim(),dosePerHa:Number(component.dosePerHa),unit:component.unit.trim()}))
    for(const component of cleaned)if(!component.activeIngredient||!Number.isFinite(component.dosePerHa)||component.dosePerHa<=0||!component.unit){setMessage('DITOLAK: setiap bahan wajib memiliki Bahan Aktif, Dosis/Ha > 0, dan Satuan.');return}
    const keys=new Set<string>();for(const component of cleaned){const key=componentKey(component);if(keys.has(key)){setMessage(`DITOLAK: ${component.activeIngredient} dosis ${formatDose(component.dosePerHa)} ${component.unit}/Ha sudah ada di Activity ini. Urutan Bahan/Pesticide tidak membuatnya berbeda.`);return}keys.add(key);const validMaterial=materials.some(material=>material.active&&normalize(material.activeIngredient)===normalize(component.activeIngredient)&&normalize(material.unit)===normalize(component.unit));if(!validMaterial){setMessage(`DITOLAK: ${component.activeIngredient} (${component.unit}) belum memiliki Master Bahan ACTIVE dengan satuan yang sama.`);return}}
    const conflict=recipeConflict(cleaned,row.id);if(conflict){setMessage(`DITOLAK: seluruh kombinasi Bahan Aktif + Dosis + Satuan identik dengan "${conflict}". Menukar Bahan 1/Bahan 2 tidak dianggap komposisi baru.`);return}
    setBusy(true);setMessage('Menyimpan komposisi Activity…')
    try{const context=await writerContext(user),batch=writeBatch(context.db);batch.set(doc(context.db,'master_activities',row.id),{components:cleaned,componentCount:cleaned.length,active:cleaned.length>0,updatedAt:serverTimestamp(),updatedBy:context.username,source:'WEB_MANUAL'},{merge:true});await batch.commit();await load(cleaned.length?`Komposisi ${row.description} tersimpan (${cleaned.length} bahan).`:`Komposisi ${row.description} dikosongkan; Activity otomatis INACTIVE.`);const refreshed=activities.find(item=>item.id===row.id);if(!cleaned.length)setComponents([]);else setComponents(cleaned);void refreshed}catch(error){setMessage(error instanceof Error?error.message:'Komposisi gagal disimpan.')}finally{setBusy(false)}
  }

  function addComponent(){setComponents(current=>[...current,{sequence:current.length+1,label:`Bahan ${current.length+1}`,activeIngredient:'',dosePerHa:0,unit:''}])}
  function updateComponent(index:number,patch:Partial<ActivityComponent>){setComponents(current=>current.map((component,i)=>i===index?{...component,...patch}:component))}
  function removeComponent(index:number){setComponents(current=>current.filter((_,i)=>i!==index).map((component,i)=>({...component,sequence:i+1,label:`Bahan ${i+1}`})))}

  async function saveMaterial(){
    const materialName=materialForm.materialName.trim(),activeIngredient=materialForm.activeIngredient.trim(),unit=materialForm.unit.trim(),category=materialForm.category.trim().toUpperCase();if(!materialName||!activeIngredient||!unit){setMessage('Material, Bahan Aktif, dan Satuan wajib diisi.');return}
    const duplicate=materials.find(row=>row.id!==materialForm.id&&normalize(row.materialName)===normalize(materialName));if(duplicate){setMessage(`DITOLAK: nama Material "${materialName}" identik dengan "${duplicate.materialName}".`);return}
    const existing=materials.find(row=>row.id===materialForm.id),targetId=materialDocId(materialName);if(materials.some(row=>row.id!==materialForm.id&&row.id===targetId)){setMessage('DITOLAK: ID Material hasil normalisasi sudah digunakan oleh bahan lain.');return}
    const candidate:MaterialRow={id:targetId,materialName,activeIngredient,unit,category,active:materialForm.active};const projected=materials.filter(row=>row.id!==materialForm.id).concat(candidate),broken=brokenActivityMappings(projected);if(broken.length){setMessage(`DITOLAK: perubahan ini membuat Activity kehilangan Master Bahan yang cocok: ${broken.slice(0,5).join(', ')}${broken.length>5?` +${broken.length-5} lainnya`:''}.`);return}
    setBusy(true);setMessage('Menyimpan Master Bahan…')
    try{const context=await writerContext(user),batch=writeBatch(context.db);batch.set(doc(context.db,'master_materials',targetId),{materialName,activeIngredient,unit,category,active:materialForm.active,updatedAt:serverTimestamp(),updatedBy:context.username,source:'WEB_MANUAL'},{merge:true});if(materialForm.id&&materialForm.id!==targetId)batch.delete(doc(context.db,'master_materials',materialForm.id));await batch.commit();resetMaterial();await load(`Master Bahan tersimpan: ${materialName}.`)}catch(error){setMessage(error instanceof Error?error.message:'Master Bahan gagal disimpan.')}finally{setBusy(false)}
  }

  async function deleteMaterial(row:MaterialRow){
    if(user.role!=='owner'){setMessage('Hanya Owner yang dapat menghapus Master Bahan.');return}
    const projected=materials.filter(item=>item.id!==row.id),broken=brokenActivityMappings(projected);if(broken.length){setMessage(`Safety: ${row.materialName} tidak dapat dihapus karena merupakan Master Bahan terakhir yang cocok untuk: ${broken.slice(0,5).join(', ')}${broken.length>5?` +${broken.length-5} lainnya`:''}.`);return}
    if(window.prompt(`Hapus Material "${row.materialName}"?\nKetik HAPUS untuk konfirmasi.`)!=='HAPUS')return
    setBusy(true)
    try{const context=await writerContext(user),batch=writeBatch(context.db);batch.delete(doc(context.db,'master_materials',row.id));await batch.commit();if(materialForm.id===row.id)resetMaterial();await load(`Material ${row.materialName} telah dihapus.`)}catch(error){setMessage(error instanceof Error?error.message:'Material gagal dihapus.')}finally{setBusy(false)}
  }

  const selectedActivity=activities.find(row=>row.id===selectedActivityId)

  return <section>
    <div className="section-head"><div><div className="eyebrow">MANUAL MASTER</div><h2>Kelola Master Activity</h2><p className="muted">List Validasi, komposisi Activity, dan Master Bahan memakai Firestore yang sama. Safety mencegah nama/deskripsi identik dan resep bahan+dosis identik walaupun urutannya ditukar.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memproses…':'Refresh'}</button></div>
    {message&&<div className="alert" style={{whiteSpace:'pre-line'}}>{message}</div>}
    <div className="segmented" aria-label="Kelola Master Activity"><button type="button" className={view==='VALIDATION'?'active':''} onClick={()=>setView('VALIDATION')}>List Validasi</button><button type="button" className={view==='COMPOSITION'?'active':''} onClick={()=>setView('COMPOSITION')}>Komposisi Activity</button><button type="button" className={view==='MATERIAL'?'active':''} onClick={()=>setView('MATERIAL')}>Master Bahan</button></div>
    <div className="panel"><div className="section-head"><div><h3>Safety Master</h3><p className="muted">Dicek tanpa melihat huruf besar/kecil dan spasi berlebih. Untuk komposisi, urutan Bahan 1/2/3 diabaikan.</p></div><span className="badge">{safetyIssues.length?safetyIssues.length+' issue':'AMAN'}</span></div>{safetyIssues.length?<div>{safetyIssues.slice(0,10).map((issue,index)=><div key={index} className="alert" style={{marginBottom:8}}>{issue}</div>)}</div>:<p className="muted">Tidak ditemukan nama Material identik, Deskripsi identik, komponen duplikat, atau komposisi Activity identik.</p>}</div>

    {view==='VALIDATION'&&<>
      <div className="panel form-stack"><div className="section-head"><div><h3>{validationForm.id?'Edit List Validasi':'Tambah List Validasi'}</h3><p className="muted">Activity baru tanpa komposisi otomatis INACTIVE.</p></div>{validationForm.id&&<button type="button" onClick={resetValidation}>Batal Edit</button>}</div><div className="form-grid"><label>Activity Code<input value={validationForm.activityCode||'(otomatis)'} readOnly/></label><label>Deskripsi<input value={validationForm.description} onChange={e=>setValidationForm({...validationForm,description:e.target.value})} placeholder="contoh: Post Emergence A"/></label><label>Activity<input value={validationForm.activity} onChange={e=>setValidationForm({...validationForm,activity:e.target.value})} placeholder="contoh: Post Emergence"/></label><label>Type<select value={validationForm.type} onChange={e=>setValidationForm({...validationForm,type:e.target.value})}><option value="SPRAY">SPRAY</option><option value="FERTILIZER">FERTILIZER</option></select></label><label>Activity Category<select value={validationForm.activityCategory} onChange={e=>setValidationForm({...validationForm,activityCategory:e.target.value})}>{categoryOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label><label>Scope<select value={validationForm.companyScope} onChange={e=>setValidationForm({...validationForm,companyScope:e.target.value})}>{scopeOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label></div><div className="row-actions"><button type="button" className="primary" disabled={busy} onClick={()=>void saveValidation()}>{validationForm.id?'Simpan Perubahan':'Tambah Activity'}</button></div></div>
      <div className="panel"><div className="table-wrap"><table><thead><tr><th>Code</th><th>Deskripsi</th><th>Activity</th><th>Type</th><th>Category</th><th>Scope</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{activities.map(row=><tr key={row.id}><td>{row.activityCode}</td><td><strong>{row.description}</strong></td><td>{row.activity}</td><td>{row.type}</td><td>{row.activityCategory}</td><td>{row.companyScope}</td><td>{row.active?'ACTIVE':'INACTIVE'}</td><td><div className="row-actions"><button type="button" onClick={()=>editValidation(row)}>Edit</button><button type="button" onClick={()=>editComposition(row)}>Komposisi</button><button type="button" disabled={user.role!=='owner'} onClick={()=>void deleteValidation(row)}>Hapus</button></div></td></tr>)}</tbody></table></div></div>
    </>}

    {view==='COMPOSITION'&&<>
      <div className="panel form-stack"><label>Pilih Activity<select value={selectedActivityId} onChange={e=>selectActivity(e.target.value)}><option value="">Pilih Activity…</option>{activities.map(row=><option key={row.id} value={row.id}>{row.activityCode} — {row.description} ({row.active?'ACTIVE':'INACTIVE'})</option>)}</select></label>{selectedActivity&&<><div className="section-head"><div><h3>{selectedActivity.description}</h3><p className="muted">Urutan hanya untuk tampilan. Safety komposisi membandingkan Bahan Aktif + Dosis + Satuan tanpa memperhatikan urutan.</p></div><button type="button" onClick={addComponent}>+ Tambah Bahan</button></div>{components.map((component,index)=><div key={index} className="panel" style={{marginBottom:10}}><div className="form-grid"><label>Bahan {index+1}<select value={component.activeIngredient} onChange={e=>{const ingredient=e.target.value;updateComponent(index,{activeIngredient:ingredient,unit:ingredientUnit.get(normalize(ingredient))||''})}}><option value="">Pilih Bahan Aktif…</option>{ingredientOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label><label>Dosis / Ha<input type="number" min="0" step="any" value={component.dosePerHa||''} onChange={e=>updateComponent(index,{dosePerHa:Number(e.target.value)})}/></label><label>Satuan<input value={component.unit} readOnly placeholder="otomatis dari Master Bahan"/></label></div><div className="row-actions"><button type="button" onClick={()=>removeComponent(index)}>Hapus Bahan Ini</button></div></div>)}{!components.length&&<div className="alert">Belum ada komposisi. Jika disimpan kosong, Activity menjadi INACTIVE.</div>}<div className="row-actions"><button type="button" className="primary" disabled={busy} onClick={()=>void saveComposition()}>Simpan Komposisi</button></div></>}</div>
      <div className="panel"><div className="table-wrap"><table><thead><tr><th>Activity</th><th>Status</th><th>Komposisi</th><th>Aksi</th></tr></thead><tbody>{activities.map(row=><tr key={row.id}><td><strong>{row.description}</strong><div className="muted">{row.activityCode}</div></td><td>{row.active?'ACTIVE':'INACTIVE'}</td><td>{row.components.length?row.components.map((component,index)=><div key={index}>{index+1}. {component.activeIngredient} — {formatDose(component.dosePerHa)} {component.unit}/Ha</div>):'-'}</td><td><button type="button" onClick={()=>editComposition(row)}>Edit Komposisi</button></td></tr>)}</tbody></table></div></div>
    </>}

    {view==='MATERIAL'&&<>
      <div className="panel form-stack"><div className="section-head"><div><h3>{materialForm.id?'Edit Master Bahan':'Tambah Master Bahan'}</h3><p className="muted">Nama Material harus unik. Bahan Aktif boleh sama untuk beberapa produk komersial.</p></div>{materialForm.id&&<button type="button" onClick={resetMaterial}>Batal Edit</button>}</div><div className="form-grid"><label>Material<input value={materialForm.materialName} onChange={e=>setMaterialForm({...materialForm,materialName:e.target.value})} placeholder="Nama produk/material"/></label><label>Bahan Aktif / Komposisi Utama<input value={materialForm.activeIngredient} onChange={e=>setMaterialForm({...materialForm,activeIngredient:e.target.value})}/></label><label>Satuan<input value={materialForm.unit} onChange={e=>setMaterialForm({...materialForm,unit:e.target.value})} placeholder="Liter / Kg"/></label><label>Kategori<select value={materialForm.category} onChange={e=>setMaterialForm({...materialForm,category:e.target.value})}>{categoryOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label><label>Status<select value={materialForm.active?'ACTIVE':'INACTIVE'} onChange={e=>setMaterialForm({...materialForm,active:e.target.value==='ACTIVE'})}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label></div><div className="row-actions"><button type="button" className="primary" disabled={busy} onClick={()=>void saveMaterial()}>{materialForm.id?'Simpan Perubahan':'Tambah Bahan'}</button></div></div>
      <div className="panel"><div className="table-wrap"><table><thead><tr><th>Material</th><th>Bahan Aktif</th><th>Satuan</th><th>Kategori</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{materials.map(row=><tr key={row.id}><td><strong>{row.materialName}</strong></td><td>{row.activeIngredient}</td><td>{row.unit}</td><td>{row.category}</td><td>{row.active?'ACTIVE':'INACTIVE'}</td><td><div className="row-actions"><button type="button" onClick={()=>editMaterial(row)}>Edit</button><button type="button" disabled={user.role!=='owner'} onClick={()=>void deleteMaterial(row)}>Hapus</button></div></td></tr>)}</tbody></table></div></div>
    </>}
  </section>
}
