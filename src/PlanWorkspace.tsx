import { FormEvent, useEffect, useMemo, useState } from 'react'
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { firestoreDb } from './firebase'
import { FALLBACK_COMPANIES, type CompanyRecord } from './companyMaster'
import type { User } from './types'

type ActivityComponent={sequence:number;label:string;activeIngredient:string;dosePerHa:number;unit:string}
type ActivityRow={id:string;activityCode:string;description:string;activity:string;type:string;activityCategory:string;companyScope:string;active:boolean;components:ActivityComponent[]}
type PaddockRow={pid:string;companyCode:string;farm:string;block:string;paddock:string;areaPlantedHa:number;currentStage:string;active:boolean}
type WeeklyTargets={w1:number;w2:number;w3:number;w4:number;w5:number}
type MonthlyPlanRow={
  id:string;planCode:string;month:string;companyCode:string;farm:string;pid:string;areaPaddockHa:number;stage:string
  activityId:string;activityCode:string;description:string;activity:string;type:string;activityCategory:string
  targetAreaHa:number;weeklyTargets:WeeklyTargets;componentsSnapshot:ActivityComponent[];status:'DRAFT'|'ACTIVE';notes:string
  createdBy:string;updatedBy:string
}

type Props={user:User}
const ZERO_WEEKS:WeeklyTargets={w1:0,w2:0,w3:0,w4:0,w5:0}
function text(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function num(value:unknown){const parsed=Number(value||0);return Number.isFinite(parsed)?parsed:0}
function formatHa(value:number,digits=2){return `${new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)} Ha`}
function currentMonth(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function normalizeId(value:string){return value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function componentFromData(value:unknown):ActivityComponent[]{if(!Array.isArray(value))return[];return value.map((item,index)=>{const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return{sequence:num(row.sequence)||index+1,label:text(row.label),activeIngredient:text(row.activeIngredient),dosePerHa:num(row.dosePerHa),unit:text(row.unit)}}).filter(x=>x.activeIngredient&&x.dosePerHa>0).sort((a,b)=>a.sequence-b.sequence)}
function companyFromData(id:string,data:Record<string,unknown>):CompanyRecord{return{id,code:text(data.code||id).toUpperCase(),name:text(data.name),prefixes:Array.isArray(data.prefixes)?data.prefixes.map(x=>text(x).toUpperCase()).filter(Boolean):[],active:data.active!==false}}
function paddockFromData(id:string,data:Record<string,unknown>):PaddockRow{return{pid:text(data.pid||id),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),block:text(data.block),paddock:text(data.paddock),areaPlantedHa:num(data.areaPlantedHa),currentStage:text(data.currentStage||'PC'),active:data.active!==false}}
function activityFromData(id:string,data:Record<string,unknown>):ActivityRow{return{id,activityCode:text(data.activityCode),description:text(data.description),activity:text(data.activity),type:text(data.type).toUpperCase(),activityCategory:text(data.activityCategory).toUpperCase(),companyScope:text(data.companyScope||'GLOBAL').toUpperCase(),active:data.active===true,components:componentFromData(data.components)}}
function weeksFromData(value:unknown):WeeklyTargets{const row=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;return{w1:num(row.w1),w2:num(row.w2),w3:num(row.w3),w4:num(row.w4),w5:num(row.w5)}}
function planFromData(id:string,data:Record<string,unknown>):MonthlyPlanRow{return{id,planCode:text(data.planCode),month:text(data.month),companyCode:text(data.companyCode).toUpperCase(),farm:text(data.farm),pid:text(data.pid),areaPaddockHa:num(data.areaPaddockHa),stage:text(data.stage),activityId:text(data.activityId),activityCode:text(data.activityCode),description:text(data.description),activity:text(data.activity),type:text(data.type).toUpperCase(),activityCategory:text(data.activityCategory).toUpperCase(),targetAreaHa:num(data.targetAreaHa),weeklyTargets:weeksFromData(data.weeklyTargets),componentsSnapshot:componentFromData(data.componentsSnapshot),status:text(data.status).toUpperCase()==='DRAFT'?'DRAFT':'ACTIVE',notes:text(data.notes),createdBy:text(data.createdBy),updatedBy:text(data.updatedBy)}}
function weekSum(weeks:WeeklyTargets){return weeks.w1+weeks.w2+weeks.w3+weeks.w4+weeks.w5}

export default function PlanWorkspace({user}:Props){
  const[tab,setTab]=useState<'monthly'|'daily'>('monthly')
  return <section>
    <div className="tabs" style={{marginBottom:18}}>
      <button type="button" className={tab==='monthly'?'active':''} onClick={()=>setTab('monthly')}>Monthly Plan</button>
      <button type="button" className={tab==='daily'?'active':''} onClick={()=>setTab('daily')}>Daily Plan</button>
    </div>
    {tab==='monthly'?<MonthlyPlanPanel user={user}/>:<div className="portal-placeholder"><strong>Daily Plan — tahap berikutnya</strong><p>Daily Plan akan mengambil Activity dan target dari Monthly Plan, tetapi tetap mendukung pekerjaan ADHOC bila ada kebutuhan lapangan yang tidak berasal dari Monthly Plan.</p></div>}
  </section>
}

function MonthlyPlanPanel({user}:Props){
  const[companies,setCompanies]=useState<CompanyRecord[]>(FALLBACK_COMPANIES)
  const[paddocks,setPaddocks]=useState<PaddockRow[]>([])
  const[activities,setActivities]=useState<ActivityRow[]>([])
  const[plans,setPlans]=useState<MonthlyPlanRow[]>([])
  const[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const[editingId,setEditingId]=useState('')
  const[month,setMonth]=useState(currentMonth()),[company,setCompany]=useState(FALLBACK_COMPANIES[0]?.code||'GPA'),[farm,setFarm]=useState('ALL'),[pid,setPid]=useState(''),[activityId,setActivityId]=useState('')
  const[targetArea,setTargetArea]=useState(''),[status,setStatus]=useState<'DRAFT'|'ACTIVE'>('ACTIVE'),[notes,setNotes]=useState('')
  const[weeks,setWeeks]=useState<WeeklyTargets>(ZERO_WEEKS)
  const[listMonth,setListMonth]=useState(currentMonth()),[listCompany,setListCompany]=useState('ALL'),[query,setQuery]=useState('')

  async function load(){
    if(!firestoreDb){setMessage('Firestore belum tersedia.');return}
    setBusy(true);setMessage('Memuat Monthly Plan dan master…')
    try{
      const[companySnap,paddockSnap,activitySnap,planSnap]=await Promise.all([
        getDocs(collection(firestoreDb,'master_companies')),
        getDocs(collection(firestoreDb,'master_paddocks')),
        getDocs(collection(firestoreDb,'master_activities')),
        getDocs(collection(firestoreDb,'monthly_plans')),
      ])
      const nextCompanies=companySnap.empty?FALLBACK_COMPANIES:companySnap.docs.map(x=>companyFromData(x.id,x.data() as Record<string,unknown>)).filter(x=>x.active).sort((a,b)=>a.code.localeCompare(b.code))
      const nextPaddocks=paddockSnap.docs.map(x=>paddockFromData(x.id,x.data() as Record<string,unknown>)).filter(x=>x.active).sort((a,b)=>a.pid.localeCompare(b.pid,undefined,{numeric:true}))
      const nextActivities=activitySnap.docs.map(x=>activityFromData(x.id,x.data() as Record<string,unknown>)).filter(x=>x.active&&x.components.length>0).sort((a,b)=>a.activity.localeCompare(b.activity)||a.description.localeCompare(b.description,undefined,{numeric:true}))
      const nextPlans=planSnap.docs.map(x=>planFromData(x.id,x.data() as Record<string,unknown>)).sort((a,b)=>b.month.localeCompare(a.month)||a.companyCode.localeCompare(b.companyCode)||a.pid.localeCompare(b.pid,undefined,{numeric:true})||a.description.localeCompare(b.description))
      setCompanies(nextCompanies);setPaddocks(nextPaddocks);setActivities(nextActivities);setPlans(nextPlans)
      if(!nextCompanies.some(x=>x.code===company)&&nextCompanies[0])setCompany(nextCompanies[0].code)
      setMessage(`Monthly Plan siap: ${nextPlans.length} record; ${nextPaddocks.length} paddock ACTIVE; ${nextActivities.length} Activity ACTIVE.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Monthly Plan gagal dimuat.')}finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[])

  const farmOptions=useMemo(()=>[...new Set(paddocks.filter(x=>x.companyCode===company).map(x=>x.farm).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[paddocks,company])
  const eligiblePaddocks=useMemo(()=>paddocks.filter(x=>x.companyCode===company&&(farm==='ALL'||x.farm===farm)),[paddocks,company,farm])
  const eligibleActivities=useMemo(()=>activities.filter(x=>x.companyScope==='GLOBAL'||x.companyScope===company),[activities,company])
  const selectedPaddock=useMemo(()=>paddocks.find(x=>x.pid===pid)||null,[paddocks,pid])
  const selectedActivity=useMemo(()=>activities.find(x=>x.id===activityId)||null,[activities,activityId])
  const weeklyTotal=useMemo(()=>weekSum(weeks),[weeks])
  const targetValue=num(targetArea)
  const weeklyRemaining=Math.max(0,targetValue-weeklyTotal)

  const filteredPlans=useMemo(()=>{
    const needle=query.trim().toLowerCase()
    return plans.filter(row=>(!listMonth||row.month===listMonth)&&(listCompany==='ALL'||row.companyCode===listCompany)&&(!needle||`${row.planCode} ${row.pid} ${row.farm} ${row.description} ${row.activity} ${row.type}`.toLowerCase().includes(needle)))
  },[plans,listMonth,listCompany,query])
  const visibleTarget=useMemo(()=>filteredPlans.reduce((sum,row)=>sum+row.targetAreaHa,0),[filteredPlans])
  const visibleWeekly=useMemo(()=>filteredPlans.reduce((sum,row)=>sum+weekSum(row.weeklyTargets),0),[filteredPlans])

  function clearForm(){setEditingId('');setFarm('ALL');setPid('');setActivityId('');setTargetArea('');setWeeks(ZERO_WEEKS);setStatus('ACTIVE');setNotes('')}
  function edit(row:MonthlyPlanRow){setEditingId(row.id);setMonth(row.month);setCompany(row.companyCode);setFarm(row.farm||'ALL');setPid(row.pid);setActivityId(row.activityId);setTargetArea(String(row.targetAreaHa));setWeeks(row.weeklyTargets);setStatus(row.status);setNotes(row.notes);setMessage(`Edit ${row.planCode}.`);document.querySelector('.portal-layer')?.scrollTo({top:0,behavior:'smooth'})}
  function changeCompany(next:string){setCompany(next);setFarm('ALL');setPid('');setActivityId('')}
  function changeFarm(next:string){setFarm(next);setPid('')}
  function setWeek(key:keyof WeeklyTargets,value:string){setWeeks(old=>({...old,[key]:num(value)}))}

  async function save(event:FormEvent){
    event.preventDefault();if(!firestoreDb||!selectedPaddock||!selectedActivity)return
    if(!month){setMessage('Bulan Plan wajib dipilih.');return}
    if(targetValue<=0){setMessage('Target luas harus lebih dari 0 Ha.');return}
    if(targetValue>selectedPaddock.areaPlantedHa+0.0001){setMessage(`Target ${formatHa(targetValue)} melebihi Area Paddock ${formatHa(selectedPaddock.areaPlantedHa)}.`);return}
    if(weeklyTotal>targetValue+0.0001){setMessage(`Total pembagian mingguan ${formatHa(weeklyTotal)} melebihi target ${formatHa(targetValue)}.`);return}
    const docId=`${normalizeId(company)}__${month}__${normalizeId(pid)}__${normalizeId(selectedActivity.activityCode||selectedActivity.id)}`
    const duplicate=plans.find(row=>row.id===docId&&row.id!==editingId)
    if(duplicate){setMessage(`Plan untuk ${pid} + ${selectedActivity.description} pada ${month} sudah ada. Gunakan Edit pada record tersebut.`);return}
    if(editingId&&editingId!==docId&&plans.some(row=>row.id===docId)){setMessage('Perubahan ini akan bertabrakan dengan Monthly Plan yang sudah ada.');return}
    setBusy(true);setMessage('Menyimpan Monthly Plan…')
    try{
      if(editingId&&editingId!==docId)await deleteDoc(doc(firestoreDb,'monthly_plans',editingId))
      const planCode=`MP-${company}-${month.replace('-','')}-${pid}-${selectedActivity.activityCode||selectedActivity.id}`.toUpperCase()
      const existing=plans.find(row=>row.id===editingId)
      await setDoc(doc(firestoreDb,'monthly_plans',docId),{
        planCode,month,companyCode:company,farm:selectedPaddock.farm,pid:selectedPaddock.pid,areaPaddockHa:selectedPaddock.areaPlantedHa,stage:selectedPaddock.currentStage,
        activityId:selectedActivity.id,activityCode:selectedActivity.activityCode,description:selectedActivity.description,activity:selectedActivity.activity,type:selectedActivity.type,activityCategory:selectedActivity.activityCategory,
        targetAreaHa:targetValue,weeklyTargets:weeks,componentsSnapshot:selectedActivity.components,status,notes:notes.trim(),sourceType:'MONTHLY',
        createdBy:existing?.createdBy||user.username,createdAt:existing?undefined:serverTimestamp(),updatedBy:user.username,updatedAt:serverTimestamp(),
      },{merge:true})
      clearForm();await load();setMessage(`Monthly Plan ${planCode} berhasil disimpan.`)
    }catch(error){setMessage(error instanceof Error?error.message:'Monthly Plan gagal disimpan.')}finally{setBusy(false)}
  }

  async function remove(row:MonthlyPlanRow){
    if(user.role!=='owner'||!firestoreDb)return
    const confirmText=window.prompt(`Hapus ${row.planCode}? Ketik HAPUS untuk konfirmasi.`,'')
    if(confirmText!=='HAPUS')return
    setBusy(true);setMessage('Menghapus Monthly Plan…')
    try{await deleteDoc(doc(firestoreDb,'monthly_plans',row.id));if(editingId===row.id)clearForm();await load();setMessage(`${row.planCode} berhasil dihapus.`)}catch(error){setMessage(error instanceof Error?error.message:'Monthly Plan gagal dihapus.')}finally{setBusy(false)}
  }

  return <section>
    <div className="section-head"><div><div className="eyebrow">PLANNING</div><h2>Monthly Plan</h2><p className="muted">Pilih Company → Farm/PID → Activity. Bahan aktif dan dosis/Ha ikut otomatis dari Master Activity dan disimpan sebagai snapshot Plan.</p></div><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Memuat…':'Refresh'}</button></div>
    {message&&<div className="alert">{message}</div>}

    <form className="panel" onSubmit={save}>
      <div className="section-head"><div><h3>{editingId?'Edit Monthly Plan':'Tambah Monthly Plan'}</h3><p className="muted">Target mingguan boleh belum habis dibagi. Sistem hanya mencegah total mingguan melebihi target bulanan.</p></div>{editingId&&<button type="button" onClick={clearForm}>Batal Edit</button>}</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:14}}>
        <label><span>Bulan Plan</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)} required/></label>
        <label><span>Company</span><select value={company} onChange={e=>changeCompany(e.target.value)}>{companies.filter(x=>x.active).map(x=><option key={x.code} value={x.code}>{x.code} — {x.name}</option>)}</select></label>
        <label><span>Farm</span><select value={farm} onChange={e=>changeFarm(e.target.value)}><option value="ALL">Semua Farm</option>{farmOptions.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
        <label><span>PID / Paddock</span><select value={pid} onChange={e=>setPid(e.target.value)} required><option value="">Pilih PID</option>{eligiblePaddocks.map(x=><option key={x.pid} value={x.pid}>{x.pid} — {formatHa(x.areaPlantedHa)} — {x.currentStage}</option>)}</select></label>
        <label><span>Activity</span><select value={activityId} onChange={e=>setActivityId(e.target.value)} required><option value="">Pilih Activity</option>{eligibleActivities.map(x=><option key={x.id} value={x.id}>{x.description} — {x.type}</option>)}</select></label>
        <label><span>Target Luas (Ha)</span><input type="number" min="0" step="0.0001" value={targetArea} onChange={e=>setTargetArea(e.target.value)} required/></label>
        <label><span>Status</span><select value={status} onChange={e=>setStatus(e.target.value as 'DRAFT'|'ACTIVE')}><option value="ACTIVE">ACTIVE</option><option value="DRAFT">DRAFT</option></select></label>
      </div>

      {selectedPaddock&&<div className="alert" style={{marginTop:14}}>PID <strong>{selectedPaddock.pid}</strong> · Farm {selectedPaddock.farm||'-'} · Stage {selectedPaddock.currentStage} · Area Paddock <strong>{formatHa(selectedPaddock.areaPlantedHa,4)}</strong></div>}
      {selectedActivity&&<div className="panel" style={{marginTop:14,padding:16}}><strong>Komposisi otomatis — {selectedActivity.description}</strong><div style={{marginTop:8}}>{selectedActivity.components.map(c=><div key={`${selectedActivity.id}-${c.sequence}`} className="muted">{c.sequence}. {c.activeIngredient} — <strong>{new Intl.NumberFormat('id-ID',{maximumFractionDigits:4}).format(c.dosePerHa)} {c.unit}/Ha</strong></div>)}</div></div>}

      <div style={{marginTop:18}}><strong>Pembagian target mingguan</strong><p className="muted" style={{marginTop:4}}>Eksekusi tetap fleksibel; pembagian ini berfungsi sebagai target rencana. Sisa belum dibagi: {formatHa(weeklyRemaining)}.</p></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(120px,1fr))',gap:10,overflowX:'auto'}}>
        {(['w1','w2','w3','w4','w5'] as (keyof WeeklyTargets)[]).map((key,index)=><label key={key}><span>Week {index+1}</span><input type="number" min="0" step="0.0001" value={weeks[key]||''} onChange={e=>setWeek(key,e.target.value)}/></label>)}
      </div>
      <div className="muted" style={{marginTop:8}}>Terbagi: <strong>{formatHa(weeklyTotal)}</strong> / Target: <strong>{formatHa(targetValue)}</strong></div>
      <label style={{display:'block',marginTop:14}}><span>Catatan</span><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opsional: prioritas, kondisi lapangan, carryover, dll."/></label>
      <div style={{display:'flex',gap:10,marginTop:16,flexWrap:'wrap'}}><button type="submit" disabled={busy||!selectedPaddock||!selectedActivity}>{busy?'Menyimpan…':editingId?'Simpan Perubahan':'Tambah Monthly Plan'}</button>{editingId&&<button type="button" onClick={clearForm}>Batal</button>}</div>
    </form>

    <div className="stats-grid">
      <div className="stat"><span>Record tampil</span><strong>{filteredPlans.length}</strong></div>
      <div className="stat"><span>Target Plan</span><strong>{formatHa(visibleTarget)}</strong></div>
      <div className="stat"><span>Target Terbagi Mingguan</span><strong>{formatHa(visibleWeekly)}</strong></div>
      <div className="stat"><span>Belum Terbagi</span><strong>{formatHa(Math.max(0,visibleTarget-visibleWeekly))}</strong></div>
    </div>

    <div className="panel">
      <div className="section-head"><div><h3>Daftar Monthly Plan</h3><p className="muted">Satu kombinasi Bulan + Company + PID + Activity hanya boleh mempunyai satu record. Perubahan dilakukan melalui Edit.</p></div></div>
      <div className="record-filters">
        <input type="month" value={listMonth} onChange={e=>setListMonth(e.target.value)}/>
        <select value={listCompany} onChange={e=>setListCompany(e.target.value)}><option value="ALL">Semua Company</option>{companies.filter(x=>x.active).map(x=><option key={x.code} value={x.code}>{x.code}</option>)}</select>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari PID / Activity / Plan Code…"/>
        <button type="button" onClick={()=>{setListMonth(currentMonth());setListCompany('ALL');setQuery('')}}>Reset</button>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Plan Code</th><th>Company</th><th>Farm / PID</th><th>Activity</th><th>Target</th><th>W1–W5</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
        {filteredPlans.map(row=><tr key={row.id}><td><strong>{row.planCode}</strong><div className="muted">{row.month}</div></td><td>{row.companyCode}</td><td>{row.farm||'-'}<div><strong>{row.pid}</strong></div><div className="muted">Area {formatHa(row.areaPaddockHa)} · {row.stage}</div></td><td><strong>{row.description}</strong><div className="muted">{row.activity} · {row.type} · {row.componentsSnapshot.length} bahan</div></td><td><strong>{formatHa(row.targetAreaHa)}</strong></td><td>{(['w1','w2','w3','w4','w5'] as (keyof WeeklyTargets)[]).map((key,index)=><div key={key} className="muted">W{index+1}: {formatHa(row.weeklyTargets[key])}</div>)}</td><td><span className="badge">{row.status}</span></td><td><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" onClick={()=>edit(row)}>Edit</button>{user.role==='owner'&&<button type="button" onClick={()=>void remove(row)}>Hapus</button>}</div></td></tr>)}
        {!filteredPlans.length&&<tr><td colSpan={8} className="empty">Belum ada Monthly Plan sesuai filter.</td></tr>}
      </tbody></table></div>
    </div>
  </section>
}
