import { FormEvent, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query as fsQuery, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { firebaseAuth, firestoreDb } from './firebase'
import { FALLBACK_COMPANIES, type CompanyRecord } from './companyMaster'
import { aggregateMaterials, clearPlanDraft, materialLinesFromComponents, planHa, planNum, planRowId, planText, readPlanDraft, writePlanDraft } from './planInputUtils'
import type { User } from './types'

type Props={user:User;selectedMonth?:string;selectedWeek?:string;onPeriodChange?:(month:string,week:string)=>void;onSaved?:()=>void}
type Paddock={pid:string;companyCode:string;farm:string;variety:string;stage:string;areaPaddockHa:number}
type Component={sequence:number;label:string;activeIngredient:string;dosePerHa:number;unit:string}
type Activity={id:string;activityCode:string;description:string;activity:string;type:string;activityCategory:string;companyScope:string;active:boolean;components:Component[]}
type Existing={planLineId:string;monthKey:string;week:string;pid:string;activity:string}
type LineDraft={id:string;pid:string;activityId:string;target:string;notes:string}
type Draft={month:string;week:string;company:string;farm:string;lines:LineDraft[]}

function pad(v:number){return String(v).padStart(2,'0')}
function companyFromData(id:string,d:Record<string,unknown>):CompanyRecord{return{id,code:planText(d.code||id).toUpperCase(),name:planText(d.name),prefixes:Array.isArray(d.prefixes)?d.prefixes.map(x=>planText(x).toUpperCase()).filter(Boolean):[],active:d.active!==false}}
function components(v:unknown):Component[]{if(!Array.isArray(v))return[];return v.map((x,i)=>{const d=(x&&typeof x==='object'?x:{}) as Record<string,unknown>;return{sequence:planNum(d.sequence)||i+1,label:planText(d.label)||'Bahan '+(i+1),activeIngredient:planText(d.activeIngredient),dosePerHa:planNum(d.dosePerHa),unit:planText(d.unit)}}).filter(x=>x.activeIngredient&&x.dosePerHa>0)}
function planDocId(v:string){return encodeURIComponent(v.replaceAll('/','-')).slice(0,1400)}
function weekDates(monthKey:string,week:string){if(!/^\d{4}-\d{2}$/.test(monthKey))return{start:'',end:''};const[y,m]=monthKey.split('-').map(Number),last=new Date(y,m,0).getDate(),map:Record<string,[number,number]>={W1:[1,7],W2:[8,15],W3:[16,22],W4:[23,last]},range=map[week]||[1,last];return{start:monthKey+'-'+pad(range[0]),end:monthKey+'-'+pad(range[1])}}
function blankLine():LineDraft{return{id:planRowId('monthly'),pid:'',activityId:'',target:'',notes:''}}
async function writer(appUser:User){const db=firestoreDb,auth=firebaseAuth;if(!db||!auth)throw new Error('Firebase belum tersedia.');const current=auth.currentUser;if(!current)throw new Error('Login Firebase tidak tersedia.');const snap=await getDoc(doc(db,'users',current.uid));if(!snap.exists())throw new Error('Profil user tidak ditemukan.');const p=snap.data() as Record<string,unknown>;if(p.active!==true||!['owner','asisten'].includes(planText(p.role))||!['owner','asisten'].includes(appUser.role))throw new Error('Role tidak memiliki izin membuat Monthly Plan.');return{db,username:planText(p.username)||appUser.username}}

export default function MonthlyPlanWebEntryPanel({user,selectedMonth,selectedWeek,onPeriodChange,onSaved}:Props){
  const draftKey='plan_monthly_web_draft_'+user.username
  const storedInitial=readPlanDraft<Draft>(draftKey,{month:new Date().toISOString().slice(0,7),week:'W1',company:'GPA',farm:'',lines:[blankLine()]})
  const initial={...storedInitial,month:selectedMonth||storedInitial.month,week:selectedWeek||storedInitial.week}
  const[companies,setCompanies]=useState<CompanyRecord[]>([]),[paddocks,setPaddocks]=useState<Paddock[]>([]),[activities,setActivities]=useState<Activity[]>([]),[existing,setExisting]=useState<Existing[]>([])
  const[draft,setDraft]=useState<Draft>(()=>({...initial,lines:initial.lines?.length?initial.lines:[blankLine()]})),[busy,setBusy]=useState(false),[message,setMessage]=useState('')

  async function loadMasters(){if(!firestoreDb)return;setBusy(true);try{const[c,p,a]=await Promise.all([getDocs(collection(firestoreDb,'master_companies')),getDocs(collection(firestoreDb,'master_paddocks')),getDocs(collection(firestoreDb,'master_activities'))]);setCompanies(c.empty?FALLBACK_COMPANIES:c.docs.map(x=>companyFromData(x.id,x.data() as Record<string,unknown>)).filter(x=>x.active));setPaddocks(p.docs.map(x=>{const d=x.data() as Record<string,unknown>;return{pid:planText(d.pid||x.id).toUpperCase(),companyCode:planText(d.companyCode).toUpperCase(),farm:planText(d.farm),variety:planText(d.variety),stage:planText(d.currentStage||d.stage),areaPaddockHa:planNum(d.areaPlantedHa||d.areaPaddockHa)}}));setActivities(a.docs.map(x=>{const d=x.data() as Record<string,unknown>;return{id:x.id,activityCode:planText(d.activityCode),description:planText(d.description),activity:planText(d.activity),type:planText(d.type),activityCategory:planText(d.activityCategory),companyScope:planText(d.companyScope||'GLOBAL').toUpperCase(),active:d.active===true,components:components(d.components)}}))}catch(e){setMessage(e instanceof Error?e.message:'Master data gagal dimuat.')}finally{setBusy(false)}}
  async function loadPeriod(month=draft.month){if(!firestoreDb||!month)return;try{const m=await getDocs(fsQuery(collection(firestoreDb,'monthly_plans'),where('monthKey','==',month)));setExisting(m.docs.map(x=>{const d=x.data() as Record<string,unknown>;return{planLineId:planText(d.planLineId||x.id),monthKey:planText(d.monthKey),week:planText(d.week),pid:planText(d.pid).toUpperCase(),activity:planText(d.activity)}}))}catch(e){setMessage(e instanceof Error?e.message:'Monthly periode gagal dimuat.')}}
  useEffect(()=>{void loadMasters()},[])
  useEffect(()=>{void loadPeriod(draft.month);onPeriodChange?.(draft.month,draft.week)},[draft.month,draft.week])
  useEffect(()=>{if((selectedMonth&&selectedMonth!==draft.month)||(selectedWeek&&selectedWeek!==draft.week))setDraft(current=>({...current,month:selectedMonth||current.month,week:selectedWeek||current.week}))},[selectedMonth,selectedWeek])
  useEffect(()=>{writePlanDraft(draftKey,draft)},[draft,draftKey])

  const farms=useMemo(()=>[...new Set(paddocks.filter(x=>!draft.company||x.companyCode===draft.company).map(x=>x.farm).filter(Boolean))].sort(),[paddocks,draft.company])
  const pidOptions=useMemo(()=>paddocks.filter(x=>(!draft.company||x.companyCode===draft.company)&&(!draft.farm||x.farm===draft.farm)).sort((a,b)=>a.pid.localeCompare(b.pid,undefined,{numeric:true})),[paddocks,draft.company,draft.farm])
  const activityOptions=useMemo(()=>activities.filter(x=>x.active&&(x.companyScope==='GLOBAL'||x.companyScope===draft.company)).sort((a,b)=>a.description.localeCompare(b.description)),[activities,draft.company])
  const lineInfo=useMemo(()=>draft.lines.map(line=>{const paddock=paddocks.find(x=>x.pid===line.pid.toUpperCase())||null,activity=activityOptions.find(x=>x.id===line.activityId)||null,target=planNum(line.target),materials=materialLinesFromComponents(activity?.components||[],target);return{line,paddock,activity,target,materials}}),[draft.lines,paddocks,activityOptions])
  const totalArea=lineInfo.reduce((s,x)=>s+x.target,0)
  const totalMaterials=aggregateMaterials(lineInfo.map(x=>x.materials))

  function patchDraft(patch:Partial<Draft>){setDraft(current=>({...current,...patch}))}
  function patchLine(id:string,patch:Partial<LineDraft>){setDraft(current=>({...current,lines:current.lines.map(line=>line.id===id?{...line,...patch}:line)}))}
  function addLine(copy?:LineDraft){setDraft(current=>({...current,lines:[...current.lines,{...(copy||blankLine()),id:planRowId('monthly'),target:'',notes:''}]}))}
  function removeLine(id:string){setDraft(current=>({...current,lines:current.lines.length>1?current.lines.filter(line=>line.id!==id):[blankLine()]}))}
  function reset(){if(!window.confirm('Kosongkan draft input Monthly Plan ini?'))return;clearPlanDraft(draftKey);setDraft({month:new Date().toISOString().slice(0,7),week:'W1',company:draft.company||'GPA',farm:'',lines:[blankLine()]});setMessage('Draft Monthly Plan dikosongkan.')}

  function duplicateKeys(){const keys=new Set<string>(),dupes:string[]=[];for(const info of lineInfo){const k=[info.line.pid.toUpperCase(),info.activity?.activity||''].join('|').toLowerCase();if(!info.line.pid||!info.activity)continue;if(keys.has(k))dupes.push(info.line.pid+' · '+info.activity.description);keys.add(k)}return dupes}
  async function save(e:FormEvent){e.preventDefault();if(!draft.month||!draft.week||!draft.company){setMessage('Bulan, Week, dan Company wajib diisi.');return}
    const invalid=lineInfo.find(x=>!x.paddock||!x.activity||x.target<=0||x.target>x.paddock.areaPaddockHa+0.0001)
    if(invalid){setMessage(!invalid.paddock?'Pilih PID yang valid dari Master Paddock.':!invalid.activity?'Pilih Activity yang valid.':invalid.target<=0?'Target luas harus lebih dari 0.':'Target '+invalid.line.pid+' melebihi Area Paddock '+invalid.paddock.areaPaddockHa+' Ha.');return}
    const dupes=duplicateKeys();if(dupes.length){setMessage('Ada baris duplikat dalam form: '+dupes.join(', '));return}
    const existingDup=lineInfo.filter(x=>existing.some(r=>r.monthKey===draft.month&&r.week===draft.week&&r.pid===x.line.pid.toUpperCase()&&r.activity===x.activity?.activity))
    if(existingDup.length&&!window.confirm(existingDup.length+' pekerjaan sudah ada pada Month/Week/PID/Activity yang sama. Tetap buat plan line baru?'))return
    setBusy(true);setMessage('Menyimpan '+lineInfo.length+' Monthly Plan…')
    try{
      const{db,username}=await writer(user),batch=writeBatch(db),dates=weekDates(draft.month,draft.week),[year,monthNumber]=draft.month.split('-').map(Number)
      const prefix='MP-'+draft.company+'-'+draft.month.replace('-','')+'-'
      let seq=existing.map(x=>x.planLineId.startsWith(prefix)?Number(x.planLineId.slice(prefix.length)):0).filter(Number.isFinite).reduce((m,x)=>Math.max(m,x),0)
      const created:Existing[]=[]
      for(const info of lineInfo){seq++;const planLineId=prefix+String(seq).padStart(4,'0'),p=info.paddock!,a=info.activity!;batch.set(doc(db,'monthly_plans',planDocId(planLineId)),{planLineId,year,monthNumber,monthKey:draft.month,monthLabel:new Date(year,monthNumber-1,1).toLocaleString('id-ID',{month:'short'}),inputDate:new Date().toISOString().slice(0,10),startDate:dates.start,endDate:dates.end,week:draft.week,description:a.description,pid:p.pid,targetAreaHa:info.target,variety:p.variety,sourceStatus:'Belum dikerjakan',status:'PLANNED',actualAreaHa:0,balanceHa:info.target,calculatedBalanceHa:info.target,activity:a.activity,notes:info.line.notes,companyCode:draft.company,farm:p.farm||draft.farm,stage:p.stage,areaPaddockHa:p.areaPaddockHa,masterVariety:p.variety,masterActivityId:a.id,activityCode:a.activityCode,type:a.type,activityCategory:a.activityCategory,componentsSnapshot:a.components,materialsPreview:info.materials,sourceOrigin:'WEB',lastModifiedSource:'WEB',createdAt:serverTimestamp(),createdBy:username,updatedAt:serverTimestamp(),updatedBy:username});created.push({planLineId,monthKey:draft.month,week:draft.week,pid:p.pid,activity:a.activity})}
      await batch.commit();setExisting(rows=>[...rows,...created]);clearPlanDraft(draftKey);setDraft(current=>({...current,lines:[blankLine()]}));setMessage(created.length+' Monthly Plan berhasil dibuat. Total target '+planHa(totalArea)+'.');onSaved?.()
    }catch(err){setMessage(err instanceof Error?err.message:'Gagal membuat Monthly Plan.')}finally{setBusy(false)}
  }

  return <section className="plan-entry-screen">
    <div className="section-head"><div><div className="eyebrow">MONTHLY PLAN · BATCH INPUT</div><h2>Input Monthly Plan</h2><p className="muted">Satu sesi dapat berisi beberapa PID/Activity. Draft tersimpan otomatis di perangkat sampai berhasil disimpan.</p></div><div className="row-actions"><button type="button" onClick={()=>void Promise.all([loadMasters(),loadPeriod()])} disabled={busy}>Refresh Master</button><button type="button" className="danger" onClick={reset} disabled={busy}>Reset Draft</button></div></div>
    {message&&<div className="alert">{message}</div>}
    <form onSubmit={save} className="plan-entry-form">
      <section className="panel plan-section"><div className="plan-section-title"><div><span className="eyebrow">PERIODE PLANNING</span><h3>Periode & Company</h3></div><span className="status-pill">Draft otomatis</span></div><div className="plan-grid">
        {!selectedMonth&&<label><span>Bulan</span><input type="month" value={draft.month} onChange={e=>patchDraft({month:e.target.value})}/></label>}
        {!selectedWeek&&<label><span>Week</span><select value={draft.week} onChange={e=>patchDraft({week:e.target.value})}>{['W1','W2','W3','W4'].map(x=><option key={x}>{x}</option>)}</select></label>}
        {selectedMonth&&selectedWeek&&<div className="monthly-period-chip"><span>Periode Aktif</span><strong>{draft.month} · {draft.week}</strong></div>}
        <label><span>Company</span><select value={draft.company} onChange={e=>patchDraft({company:e.target.value,farm:'',lines:draft.lines.map(line=>({...line,pid:'',activityId:''}))})}>{companies.map(x=><option key={x.id} value={x.code}>{x.code} — {x.name}</option>)}</select></label>
        <label><span>Farm</span><select value={draft.farm} onChange={e=>patchDraft({farm:e.target.value,lines:draft.lines.map(line=>({...line,pid:''}))})}><option value="">Semua Farm</option>{farms.map(x=><option key={x}>{x}</option>)}</select></label>
      </div></section>

      <section className="panel plan-section"><div className="plan-section-title"><div><span className="eyebrow">PEKERJAAN</span><h3>PID & Activity</h3></div><button type="button" onClick={()=>addLine()}>+ Tambah Pekerjaan</button></div>
        <div className="plan-work-list">{lineInfo.map((info,index)=><div className="plan-work-card" key={info.line.id}><div className="plan-work-head"><strong>Pekerjaan {index+1}</strong><div className="row-actions">{index>0&&<button type="button" onClick={()=>addLine(info.line)}>Duplikat</button>}<button type="button" className="danger" onClick={()=>removeLine(info.line.id)}>Hapus</button></div></div><div className="plan-grid">
          <label><span>PID / Paddock</span><input list={'monthly-pids-'+info.line.id} value={info.line.pid} onChange={e=>patchLine(info.line.id,{pid:e.target.value.toUpperCase()})} placeholder="Pilih PID"/><datalist id={'monthly-pids-'+info.line.id}>{pidOptions.map(x=><option key={x.pid} value={x.pid}>{x.farm} · {x.variety}</option>)}</datalist></label>
          <label><span>Activity</span><select value={info.line.activityId} onChange={e=>patchLine(info.line.id,{activityId:e.target.value})}><option value="">Pilih Activity</option>{activityOptions.map(x=><option key={x.id} value={x.id}>{x.description} — {x.activity}</option>)}</select></label>
          <label><span>Target Luas (Ha)</span><input type="number" min="0" step="0.0001" value={info.line.target} onChange={e=>patchLine(info.line.id,{target:e.target.value})}/></label>
          <label className="plan-span-2"><span>Keterangan</span><input value={info.line.notes} onChange={e=>patchLine(info.line.id,{notes:e.target.value})} placeholder="Opsional"/></label>
        </div>{info.paddock&&<div className="plan-inline-info"><span>Farm <strong>{info.paddock.farm||'-'}</strong></span><span>Variety <strong>{info.paddock.variety||'-'}</strong></span><span>Area Paddock <strong>{planHa(info.paddock.areaPaddockHa)}</strong></span><span>Stage <strong>{info.paddock.stage||'-'}</strong></span></div>}{info.activity&&<div className="plan-material-mini"><strong>{info.activity.description}</strong><span>{info.materials.length} material · target {planHa(info.target)}</span>{info.materials.map(m=><small key={m.material}>{m.material}: {m.dosePerHa} {m.unit}/Ha → <b>{m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</b></small>)}</div>}</div>)}</div>
      </section>

      <section className="panel plan-section"><div className="plan-section-title"><div><span className="eyebrow">RINGKASAN</span><h3>Total Planning</h3></div></div><div className="plan-summary-grid"><div><span>Pekerjaan</span><strong>{draft.lines.length}</strong></div><div><span>Total Target</span><strong>{planHa(totalArea)}</strong></div><div><span>Material</span><strong>{totalMaterials.length}</strong></div></div>{totalMaterials.length>0&&<div className="plan-material-summary">{totalMaterials.map(m=><span key={m.material+'|'+m.unit}>{m.material}<strong>{m.totalMaterial.toLocaleString('id-ID',{maximumFractionDigits:4})} {m.unit}</strong></span>)}</div>}<button type="submit" className="primary plan-save-button" disabled={busy}>{busy?'Menyimpan…':'Simpan Semua Monthly Plan'}</button></section>
    </form>
  </section>
}
