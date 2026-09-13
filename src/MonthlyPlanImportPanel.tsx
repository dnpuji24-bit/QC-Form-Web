import { ChangeEvent, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { FALLBACK_COMPANIES, type CompanyRecord } from './companyMaster'
import type { User } from './types'

type Props={user:User}
type SheetRow=Record<string,unknown>
type ImportStatus='CREATE'|'UPDATE'|'NO_CHANGE'|'PROTECTED'
type IssueLevel='ERROR'|'WARNING'|'INFO'
type Issue={level:IssueLevel;item?:string;message:string}
type ActivityComponent={sequence:number;label:string;activeIngredient:string;dosePerHa:number;unit:string}
type MasterPaddock={pid:string;companyCode:string;farm:string;variety:string;stage:string;areaPaddockHa:number;active:boolean}
type MasterActivity={id:string;activityCode:string;description:string;activity:string;type:string;activityCategory:string;companyScope:string;active:boolean;components:ActivityComponent[]}
type MasterRefs={paddocks:Map<string,MasterPaddock>;activities:Map<string,MasterActivity[]>;companies:CompanyRecord[]}
type ParsedPlan={
  docId:string;planLineId:string;year:number;monthLabel:string;monthNumber:number;monthKey:string;inputDate:string;startDate:string;endDate:string;week:string
  description:string;pid:string;targetAreaHa:number;variety:string;sourceStatus:string;status:string;actualAreaHa:number;balanceHa:number;calculatedBalanceHa:number
  activity:string;notes:string;companyCode:string;farm:string;stage:string;areaPaddockHa:number;masterVariety:string
  masterActivityId:string;activityCode:string;type:string;activityCategory:string;componentsSnapshot:ActivityComponent[]
}
type PreviewPlan=ParsedPlan&{importStatus:ImportStatus;changes:string[];previous?:Record<string,unknown>}
type ParsedFile={fileName:string;plans:ParsedPlan[];issues:Issue[]}
type FirestoreProfile={active?:boolean;role?:string;username?:string}

const MONTHS:Record<string,number>={jan:1,januari:1,feb:2,februari:2,mar:3,maret:3,apr:4,april:4,mei:5,may:5,jun:6,juni:6,jul:7,juli:7,agt:8,ags:8,agu:8,agustus:8,aug:8,sep:9,sept:9,september:9,okt:10,oktober:10,oct:10,nov:11,november:11,des:12,desember:12,dec:12}
const REQUIRED_HEADERS=['Tahun','Bulan','Input Date','Start Date','End Date','Weekly','Plan ID Baru','Deskripsi','Paddock','Luas Target(Ha)','Variety','Status','Luas Dikerjakan','Balance','Activity','Keterangan']

function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function normalized(value:unknown){return text(value).toLowerCase().replace(/\s+/g,' ')}
function num(value:unknown){if(typeof value==='number'&&Number.isFinite(value))return value;const raw=text(value);if(!raw)return 0;const cleaned=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;const parsed=Number(cleaned);return Number.isFinite(parsed)?parsed:0}
function rowValue(row:SheetRow,...names:string[]){const lookup=new Map(Object.keys(row).map(key=>[normalized(key),row[key]]));for(const name of names){const value=lookup.get(normalized(name));if(value!==undefined)return value}return undefined}
function pad(value:number){return String(value).padStart(2,'0')}
function isoDate(year:number,month:number,day:number){if(!year||!month||day<1||day>31)return'';return`${year}-${pad(month)}-${pad(day)}`}
function dateFromValue(value:unknown,year:number,month:number){
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return`${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`
  if(typeof value==='number'&&Number.isFinite(value)){
    if(value>30000){const parsed=XLSX.SSF.parse_date_code(value);if(parsed)return isoDate(parsed.y,parsed.m,parsed.d)}
    if(value>=1&&value<=31)return isoDate(year,month,Math.round(value))
  }
  const raw=text(value);if(!raw)return''
  if(/^\d{1,2}$/.test(raw))return isoDate(year,month,Number(raw))
  const parsed=new Date(raw);if(!Number.isNaN(parsed.getTime()))return`${parsed.getFullYear()}-${pad(parsed.getMonth()+1)}-${pad(parsed.getDate())}`
  return''
}
function statusFromSource(value:string){const key=normalized(value);if(key==='belum dikerjakan'||key==='belum dikerjakan.')return'PLANNED';if(key==='on progress'||key==='on_progress')return'ON_PROGRESS';if(key==='done'||key==='selesai')return'DONE';if(key==='cancelled'||key==='canceled'||key==='batal')return'CANCELLED';return value.trim().toUpperCase().replace(/\s+/g,'_')||'PLANNED'}
function componentFromData(value:unknown):ActivityComponent[]{if(!Array.isArray(value))return[];return value.map((item,index)=>{const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return{sequence:num(row.sequence)||index+1,label:text(row.label)||`Bahan ${index+1}`,activeIngredient:text(row.activeIngredient),dosePerHa:num(row.dosePerHa),unit:text(row.unit)}}).filter(x=>x.activeIngredient&&x.dosePerHa>0)}
function companyFromData(id:string,data:Record<string,unknown>):CompanyRecord{return{id,code:text(data.code||id).toUpperCase(),name:text(data.name),prefixes:Array.isArray(data.prefixes)?data.prefixes.map(x=>text(x).toUpperCase()).filter(Boolean):[],active:data.active!==false}}
function planDocId(planLineId:string){return encodeURIComponent(planLineId.replaceAll('/','-')).slice(0,1400)}
function pidPrefix(pid:string){return text(pid).split('-')[0].toUpperCase()}
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return value}
function same(a:unknown,b:unknown){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b))}
function formatHa(value:number,digits=2){return`${new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)} Ha`}

async function writerContext(appUser:User){
  const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum terkonfigurasi.')
  const current=auth.currentUser;if(!current)throw new Error('Firebase Auth belum terhubung. Login ulang terlebih dahulu.')
  const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil Firebase user tidak ditemukan.')
  const profile=snap.data() as FirestoreProfile;if(profile.active!==true)throw new Error('Profil Firebase tidak aktif.')
  if(!['owner','asisten'].includes(profile.role||'')||!['owner','asisten'].includes(appUser.role))throw new Error('Role tidak memiliki izin import Monthly Plan.')
  return{db,username:profile.username||appUser.username}
}

async function loadMasterRefs():Promise<MasterRefs>{
  if(!firestoreDb)throw new Error('Firestore belum tersedia.')
  const[paddockSnap,activitySnap,companySnap]=await Promise.all([getDocs(collection(firestoreDb,'master_paddocks')),getDocs(collection(firestoreDb,'master_activities')),getDocs(collection(firestoreDb,'master_companies'))])
  const paddocks=new Map<string,MasterPaddock>()
  paddockSnap.docs.forEach(item=>{const data=item.data() as Record<string,unknown>,pid=text(data.pid||item.id).toUpperCase();paddocks.set(pid,{pid,companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),variety:text(data.variety),stage:text(data.currentStage||'PC'),areaPaddockHa:num(data.areaPlantedHa),active:data.active!==false})})
  const activities=new Map<string,MasterActivity[]>()
  activitySnap.docs.forEach(item=>{const data=item.data() as Record<string,unknown>,description=text(data.description),row:MasterActivity={id:item.id,activityCode:text(data.activityCode),description,activity:text(data.activity),type:text(data.type).toUpperCase(),activityCategory:text(data.activityCategory).toUpperCase(),companyScope:text(data.companyScope||'GLOBAL').toUpperCase(),active:data.active===true,components:componentFromData(data.components)},key=normalized(description),list=activities.get(key)||[];list.push(row);activities.set(key,list)})
  const companies=companySnap.empty?FALLBACK_COMPANIES:companySnap.docs.map(item=>companyFromData(item.id,item.data() as Record<string,unknown>)).filter(x=>x.active)
  return{paddocks,activities,companies}
}

function parseWorkbook(buffer:ArrayBuffer,fileName:string,refs:MasterRefs):ParsedFile{
  const workbook=XLSX.read(buffer,{type:'array',cellDates:true}),sheetName=workbook.SheetNames[0],sheet=workbook.Sheets[sheetName]
  if(!sheet)throw new Error('Workbook tidak memiliki sheet yang bisa dibaca.')
  const rows=XLSX.utils.sheet_to_json<SheetRow>(sheet,{defval:null,raw:true})
  if(!rows.length)throw new Error('Sheet Monthly Plan kosong.')
  const keys=new Set(Object.keys(rows[0]).map(normalized)),missing=REQUIRED_HEADERS.filter(header=>!keys.has(normalized(header)))
  if(missing.length)throw new Error(`Header wajib belum lengkap: ${missing.join(', ')}.`)
  const issues:Issue[]=[],plans:ParsedPlan[]=[],seenIds=new Map<string,number>()
  rows.forEach((row,index)=>{
    const sourceRow=index+2,year=Math.round(num(rowValue(row,'Tahun'))),monthLabel=text(rowValue(row,'Bulan')),monthNumber=MONTHS[normalized(monthLabel)]||0,week=text(rowValue(row,'Weekly')).toUpperCase(),planLineId=text(rowValue(row,'Plan ID Baru')),description=text(rowValue(row,'Deskripsi')),pid=text(rowValue(row,'Paddock')).toUpperCase(),targetAreaHa=num(rowValue(row,'Luas Target(Ha)','Luas Target (Ha)')),variety=text(rowValue(row,'Variety')),sourceStatus=text(rowValue(row,'Status')),actualAreaHa=num(rowValue(row,'Luas Dikerjakan')),balanceHa=num(rowValue(row,'Balance')),activity=text(rowValue(row,'Activity')),notes=text(rowValue(row,'Keterangan'))
    const completelyBlank=!year&&!monthLabel&&!week&&!planLineId&&!description&&!pid&&!targetAreaHa&&!activity;if(completelyBlank)return
    if(!year||!monthNumber||!week||!planLineId||!description||!pid||!activity){issues.push({level:'ERROR',item:planLineId||`Baris ${sourceRow}`,message:`Baris ${sourceRow}: Tahun, Bulan, Weekly, Plan ID Baru, Deskripsi, Paddock, dan Activity wajib terisi.`});return}
    if(!/^W[1-4]$/.test(week))issues.push({level:'WARNING',item:planLineId,message:`Weekly ${week} di luar pola W1-W4. Nilai tetap disimpan sesuai file.`})
    const occurrence=(seenIds.get(planLineId)||0)+1;seenIds.set(planLineId,occurrence);if(occurrence>1){issues.push({level:'ERROR',item:planLineId,message:`Plan ID Baru duplikat: ${planLineId}. Satu Plan ID hanya boleh mewakili satu record.`});return}
    if(targetAreaHa<=0)issues.push({level:'WARNING',item:planLineId,message:`Luas Target ${formatHa(targetAreaHa)} tidak lebih dari 0. Data historis tetap boleh diimport untuk review.`})
    if(actualAreaHa<0)issues.push({level:'ERROR',item:planLineId,message:'Luas Dikerjakan tidak boleh negatif.'})
    const monthKey=`${year}-${pad(monthNumber)}`,inputDate=dateFromValue(rowValue(row,'Input Date'),year,monthNumber),startDate=dateFromValue(rowValue(row,'Start Date'),year,monthNumber),endDate=dateFromValue(rowValue(row,'End Date'),year,monthNumber),calculatedBalanceHa=targetAreaHa-actualAreaHa
    if(Math.abs(balanceHa-calculatedBalanceHa)>0.02)issues.push({level:'WARNING',item:planLineId,message:`Balance file ${formatHa(balanceHa,4)} berbeda dari Target - Dikerjakan ${formatHa(calculatedBalanceHa,4)}. Keduanya tetap disimpan untuk review.`})
    const paddock=refs.paddocks.get(pid),prefix=pidPrefix(pid),prefixCompany=refs.companies.find(company=>company.prefixes.map(x=>x.toUpperCase()).includes(prefix)),companyCode=paddock?.companyCode||prefixCompany?.code||''
    if(!paddock)issues.push({level:'WARNING',item:planLineId,message:`PID ${pid} tidak ditemukan di Master Paddock. Data tetap diimport, tetapi Farm/Stage/Area Paddock tidak tersedia.`})
    if(!companyCode)issues.push({level:'WARNING',item:planLineId,message:`Company untuk PID ${pid} tidak dapat ditentukan dari Master Paddock/prefix.`})
    const candidates=refs.activities.get(normalized(description))||[],masterActivity=(candidates.find(x=>x.active&&(x.companyScope==='GLOBAL'||x.companyScope===companyCode))||candidates.find(x=>x.companyScope==='GLOBAL'||x.companyScope===companyCode)||candidates[0]||null)
    if(candidates.length>1)issues.push({level:'WARNING',item:planLineId,message:`Deskripsi ${description} memiliki ${candidates.length} record Master Activity. Import memilih ${masterActivity?.activityCode||masterActivity?.id||'record pertama'} untuk snapshot.`})
    if(!masterActivity)issues.push({level:'WARNING',item:planLineId,message:`Deskripsi ${description} belum ditemukan di Master Activity. Plan tetap diimport tanpa snapshot bahan/dosis.`})
    else{
      if(!masterActivity.active)issues.push({level:'INFO',item:planLineId,message:`Master Activity ${description} saat ini INACTIVE; data historis tetap diimport.`})
      if(activity&&normalized(activity)!==normalized(masterActivity.activity))issues.push({level:'WARNING',item:planLineId,message:`Activity file (${activity}) berbeda dengan Master Activity (${masterActivity.activity}). Nilai file tetap dipertahankan; metadata master disimpan terpisah.`})
    }
    plans.push({docId:planDocId(planLineId),planLineId,year,monthLabel,monthNumber,monthKey,inputDate,startDate,endDate,week,description,pid,targetAreaHa,variety,sourceStatus,status:statusFromSource(sourceStatus),actualAreaHa,balanceHa,calculatedBalanceHa,activity,notes,companyCode,farm:paddock?.farm||'',stage:paddock?.stage||'',areaPaddockHa:paddock?.areaPaddockHa||0,masterVariety:paddock?.variety||'',masterActivityId:masterActivity?.id||'',activityCode:masterActivity?.activityCode||'',type:masterActivity?.type||'',activityCategory:masterActivity?.activityCategory||'',componentsSnapshot:masterActivity?.components||[]})
  })
  return{fileName,plans,issues}
}

function importedShape(row:ParsedPlan){return{planLineId:row.planLineId,year:row.year,monthLabel:row.monthLabel,monthNumber:row.monthNumber,monthKey:row.monthKey,inputDate:row.inputDate,startDate:row.startDate,endDate:row.endDate,week:row.week,description:row.description,pid:row.pid,targetAreaHa:row.targetAreaHa,variety:row.variety,sourceStatus:row.sourceStatus,status:row.status,actualAreaHa:row.actualAreaHa,balanceHa:row.balanceHa,calculatedBalanceHa:row.calculatedBalanceHa,activity:row.activity,notes:row.notes,companyCode:row.companyCode,farm:row.farm,stage:row.stage,areaPaddockHa:row.areaPaddockHa,masterVariety:row.masterVariety}}
function existingShape(data:Record<string,unknown>){return{planLineId:text(data.planLineId||data.planCode),year:num(data.year),monthLabel:text(data.monthLabel),monthNumber:num(data.monthNumber),monthKey:text(data.monthKey||data.month),inputDate:text(data.inputDate),startDate:text(data.startDate),endDate:text(data.endDate),week:text(data.week),description:text(data.description),pid:text(data.pid),targetAreaHa:num(data.targetAreaHa),variety:text(data.variety),sourceStatus:text(data.sourceStatus),status:text(data.status),actualAreaHa:num(data.actualAreaHa),balanceHa:num(data.balanceHa),calculatedBalanceHa:num(data.calculatedBalanceHa),activity:text(data.activity),notes:text(data.notes),companyCode:text(data.companyCode),farm:text(data.farm),stage:text(data.stage),areaPaddockHa:num(data.areaPaddockHa),masterVariety:text(data.masterVariety)}}
function diffKeys(previous:Record<string,unknown>,row:ParsedPlan){const before=existingShape(previous),after=importedShape(row),changes:string[]=[];Object.keys(after).forEach(key=>{if(!same(before[key as keyof typeof before],after[key as keyof typeof after]))changes.push(key)});return changes}

async function compareFirestore(parsed:ParsedFile):Promise<PreviewPlan[]>{
  if(!firestoreDb)throw new Error('Firestore belum tersedia.')
  const snap=await getDocs(collection(firestoreDb,'monthly_plans')),existing=new Map(snap.docs.map(item=>[item.id,item.data() as Record<string,unknown>]))
  return parsed.plans.map(row=>{const previous=existing.get(row.docId);if(!previous)return{...row,importStatus:'CREATE' as ImportStatus,changes:[]};const changes=diffKeys(previous,row);if(!changes.length)return{...row,importStatus:'NO_CHANGE' as ImportStatus,changes:[],previous};if(text(previous.lastModifiedSource).toUpperCase()==='WEB')return{...row,importStatus:'PROTECTED' as ImportStatus,changes,previous};return{...row,importStatus:'UPDATE' as ImportStatus,changes,previous}})
}

export default function MonthlyPlanImportPanel({user}:Props){
  const[parsed,setParsed]=useState<ParsedFile|null>(null),[preview,setPreview]=useState<PreviewPlan[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const counts=useMemo(()=>({total:preview.length,create:preview.filter(x=>x.importStatus==='CREATE').length,update:preview.filter(x=>x.importStatus==='UPDATE').length,unchanged:preview.filter(x=>x.importStatus==='NO_CHANGE').length,protected:preview.filter(x=>x.importStatus==='PROTECTED').length,warnings:parsed?.issues.filter(x=>x.level==='WARNING').length||0,errors:parsed?.issues.filter(x=>x.level==='ERROR').length||0}),[preview,parsed])

  async function onFile(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];if(!file)return;setBusy(true);setMessage('Membaca Monthly Plan dan Master Data…');try{const refs=await loadMasterRefs(),next=parseWorkbook(await file.arrayBuffer(),file.name,refs),nextPreview=await compareFirestore(next);setParsed(next);setPreview(nextPreview);setMessage(`Preview siap: ${next.plans.length} Plan Line; ${nextPreview.filter(x=>x.importStatus==='CREATE').length} CREATE / ${nextPreview.filter(x=>x.importStatus==='UPDATE').length} UPDATE / ${nextPreview.filter(x=>x.importStatus==='NO_CHANGE').length} NO CHANGE / ${nextPreview.filter(x=>x.importStatus==='PROTECTED').length} PROTECTED.`)}catch(error){setParsed(null);setPreview([]);setMessage(error instanceof Error?error.message:'File Monthly Plan gagal dibaca.')}finally{setBusy(false)}}
  async function refreshComparison(){if(!parsed)return;setBusy(true);setMessage('Membandingkan ulang dengan Firestore…');try{const next=await compareFirestore(parsed);setPreview(next);setMessage(`Perbandingan selesai: ${next.filter(x=>x.importStatus==='CREATE').length} CREATE / ${next.filter(x=>x.importStatus==='UPDATE').length} UPDATE / ${next.filter(x=>x.importStatus==='NO_CHANGE').length} NO CHANGE / ${next.filter(x=>x.importStatus==='PROTECTED').length} PROTECTED.`)}catch(error){setMessage(error instanceof Error?error.message:'Perbandingan gagal.')}finally{setBusy(false)}}

  async function confirmImport(){
    if(!parsed||!preview.length)return;if(counts.errors){setMessage(`Import diblokir karena masih ada ${counts.errors} ERROR.`);return}
    const writable=preview.filter(x=>x.importStatus==='CREATE'||x.importStatus==='UPDATE');if(!writable.length){setMessage(counts.protected?`Tidak ada data yang dapat ditulis. ${counts.protected} record dilindungi karena pernah diubah melalui Web.`:'Semua data sudah NO CHANGE. Firestore tidak diubah.');return}
    const confirmText=window.prompt(`Akan menulis ${writable.length} Monthly Plan ke Firestore. Record PROTECTED tidak akan ditimpa. Ketik IMPORT untuk lanjut.`,'');if(confirmText!=='IMPORT')return
    setBusy(true);setMessage('Mengimport Monthly Plan…')
    try{
      const{db,username}=await writerContext(user),batchId=`MP-${Date.now()}`,batch=writeBatch(db)
      writable.forEach(row=>{
        const existing=row.previous||{},refreshMaster=!existing.planLineId||row.changes.includes('description')
        const payload:Record<string,unknown>={...importedShape(row),sourceOrigin:text(existing.sourceOrigin)||'EXCEL',lastModifiedSource:'EXCEL',sourceFileName:parsed.fileName,lastImportBatchId:batchId,importedAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:username}
        if(row.importStatus==='CREATE'){payload.createdAt=serverTimestamp();payload.createdBy=username}
        if(refreshMaster||row.importStatus==='CREATE'){payload.masterActivityId=row.masterActivityId;payload.activityCode=row.activityCode;payload.type=row.type;payload.activityCategory=row.activityCategory;payload.componentsSnapshot=row.componentsSnapshot}else{payload.masterActivityId=existing.masterActivityId||row.masterActivityId;payload.activityCode=existing.activityCode||row.activityCode;payload.type=existing.type||row.type;payload.activityCategory=existing.activityCategory||row.activityCategory;payload.componentsSnapshot=existing.componentsSnapshot||row.componentsSnapshot}
        batch.set(doc(db,'monthly_plans',row.docId),payload,{merge:true})
      })
      batch.set(doc(db,'monthly_plan_import_logs',batchId),{batchId,sourceFileName:parsed.fileName,total:preview.length,created:counts.create,updated:counts.update,unchanged:counts.unchanged,protected:counts.protected,warnings:counts.warnings,errors:counts.errors,monthKeys:[...new Set(parsed.plans.map(x=>x.monthKey))].sort(),importedBy:username,importedAt:serverTimestamp()})
      await batch.commit()
      const next=await compareFirestore(parsed);setPreview(next)
      const remaining=next.filter(x=>x.importStatus==='CREATE'||x.importStatus==='UPDATE').length
      setMessage(`Import selesai. Ditulis ${writable.length} record (${counts.create} CREATE / ${counts.update} UPDATE). Verifikasi: ${next.filter(x=>x.importStatus==='NO_CHANGE').length} NO CHANGE, ${next.filter(x=>x.importStatus==='PROTECTED').length} PROTECTED${remaining?`, ${remaining} masih berbeda`:'. Firestore sinkron dengan file untuk record yang tidak dilindungi.'}`)
    }catch(error){setMessage(error instanceof Error?error.message:'Import Monthly Plan gagal.')}finally{setBusy(false)}
  }

  return <section>
    <div className="section-head"><div><div className="eyebrow">MONTHLY PLAN</div><h2>Update / Import Excel</h2><p className="muted">Gunakan format Monthly Plan final. Plan ID Baru menjadi identitas record. Data yang pernah diedit melalui Web akan ditandai PROTECTED dan tidak ditimpa otomatis.</p></div></div>
    <div className="panel">
      <label><span>File Monthly Plan (.xlsx / .xls)</span><input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy}/></label>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:14}}><button type="button" onClick={()=>void refreshComparison()} disabled={busy||!parsed}>Bandingkan Firestore</button><button type="button" className="primary" onClick={()=>void confirmImport()} disabled={busy||!parsed||!preview.length}>Confirm Import Firestore</button></div>
      {message&&<div className="alert" style={{marginTop:14,whiteSpace:'pre-line'}}>{message}</div>}
    </div>
    {parsed&&<>
      <div className="cards" style={{marginTop:18}}>
        <button type="button" className="card"><span>PLAN LINE</span><strong>{counts.total}</strong></button><button type="button" className="card"><span>CREATE</span><strong>{counts.create}</strong></button><button type="button" className="card"><span>UPDATE</span><strong>{counts.update}</strong></button><button type="button" className="card"><span>NO CHANGE</span><strong>{counts.unchanged}</strong></button><button type="button" className="card"><span>PROTECTED</span><strong>{counts.protected}</strong></button><button type="button" className="card"><span>WARNING</span><strong>{counts.warnings}</strong></button><button type="button" className="card"><span>ERROR</span><strong>{counts.errors}</strong></button>
      </div>
      {parsed.issues.length>0&&<div className="panel" style={{marginTop:18}}><h3>Data Quality</h3><div className="table-wrap"><table><thead><tr><th>Level</th><th>Item</th><th>Keterangan</th></tr></thead><tbody>{parsed.issues.slice(0,200).map((issue,index)=><tr key={`${issue.level}-${index}`}><td><strong>{issue.level}</strong></td><td>{issue.item||'-'}</td><td>{issue.message}</td></tr>)}</tbody></table></div>{parsed.issues.length>200&&<p className="muted">Menampilkan 200 dari {parsed.issues.length} issue.</p>}</div>}
      <div className="panel" style={{marginTop:18}}><div className="section-head"><div><h3>Preview Import</h3><p className="muted">PROTECTED = record pernah diubah dari Web dan tidak akan ditimpa otomatis.</p></div></div><div className="table-wrap"><table><thead><tr><th>Status</th><th>Plan ID Baru</th><th>Bulan/Week</th><th>Company</th><th>PID</th><th>Deskripsi</th><th>Target</th><th>Dikerjakan</th><th>Balance</th><th>Perubahan</th></tr></thead><tbody>{preview.slice(0,250).map(row=><tr key={row.docId}><td><strong>{row.importStatus}</strong></td><td>{row.planLineId}</td><td>{row.monthKey} / {row.week}</td><td>{row.companyCode||'-'}</td><td>{row.pid}</td><td>{row.description}</td><td>{formatHa(row.targetAreaHa)}</td><td>{formatHa(row.actualAreaHa)}</td><td>{formatHa(row.balanceHa)}</td><td>{row.changes.join(', ')||'-'}</td></tr>)}</tbody></table></div>{preview.length>250&&<p className="muted">Menampilkan 250 dari {preview.length} record.</p>}</div>
    </>}
  </section>
}
