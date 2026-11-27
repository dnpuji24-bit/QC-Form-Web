import {useEffect,useRef,useState,type ClipboardEvent,type KeyboardEvent} from 'react'
import {Alert,Button,Input,InputNumber,Select,Typography} from 'antd'
import {firebaseAuth} from './firebase'
import {canEditAccess} from './accessControl'
import {bkmAvailableCandidates,type BkmCandidate} from './bkmAggregation.mjs'
import {bkmRealization,bkmManualCandidate,type BkmActivity,type BkmPaddock} from './bkmRealization.mjs'
import {loadBkmCandidates,listBkm,saveBkm,type BkmDocument,type BkmInputRow,type BkmMaterialEntry} from './bkmFirestore'
import type {User} from './types'
import './bkm.css'

const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
const blank=():BkmInputRow=>({filterWo:'',candidate:null,bkm:'',note:''})
const initial=():BkmDocument=>({id:'',revision:0,date:today(),company:'',division:'UnM',number:'',rows:Array.from({length:10},blank)})
const format=(n:number|null|undefined)=>n===null||n===undefined?'':n.toLocaleString('id-ID',{maximumFractionDigits:4})
const actualRows=(doc:BkmDocument)=>doc.rows.filter(r=>r.candidate)
const idsFor=(rows:BkmInputRow[])=>rows.map(r=>r.candidate!.id)
const blankMaterial=(cols:number):BkmMaterialEntry=>({pid:'',code:'',name:'',unit:'',hi:null,shi:null,wo:'',bkm:'',note:'',extra:Array(cols).fill('')})
const hasMaterial=(m:BkmMaterialEntry)=>!!(m.pid||m.code||m.name||m.unit||m.hi!==null||m.shi!==null||m.wo||m.bkm||m.note||m.extra.some(Boolean))
const autoMaterial=(doc:BkmDocument):BkmMaterialEntry[]=>actualRows(doc).flatMap(r=>r.candidate!.material.map(m=>({pid:r.candidate!.pid,...m,wo:r.candidate!.wo,bkm:r.bkm,note:'Alokasi terukur'+(r.candidate!.warnings.some(w=>w.includes('material'))?' (parsial)':''),extra:Array(doc.materialColumns?.length||0).fill('')})))
const materialRows=(doc:BkmDocument)=>(doc.materialEntries??autoMaterial(doc)).filter(hasMaterial)
const materialValues=(m:BkmMaterialEntry,i:number)=>[i+1,m.pid,m.code,m.name,m.unit,m.hi??'',m.shi??'',m.wo,m.bkm,m.note,...m.extra]
const effective=(r:BkmInputRow,field:'hk'|'target'|'hi'|'shi')=>field==='hk'?(r.hkOverride??r.candidate?.hk??null):field==='target'?(r.candidate?.wo?r.candidate.target:null):field==='hi'?bkmRealization(r.candidate,r.hiOverride).hi:bkmRealization(r.candidate,r.hiOverride).balance
const notes=(r:BkmInputRow)=>[r.note,...(r.candidate?.warnings||[])].filter(Boolean).join(' · ')
const total=(rows:BkmInputRow[],field:'hk'|'target'|'hi'|'shi')=>rows.length&&rows.every(r=>effective(r,field)!==null)?rows.reduce((a,r)=>a+(effective(r,field)??0),0):null
const values=(r:BkmInputRow,i:number)=>{const c=r.candidate,a=bkmRealization(c,r.hiOverride);return [i+1,c?.operationCode||'',c?.description||'',c?.pid||'',c?.area??'',effective(r,'hk')??'',c?.uom||'',effective(r,'target')??'',a.hi??'',a.balance??'',a.progress!=null?a.progress/100:'',c?.wo||'',r.bkm,notes(r)]}
const opHeaders=['No','Opr Code','Desc','Paddock / Block','Luas Area','Jml HK','UoM','Luas WO','HI','SHI','%','No WO','No BKM','Keterangan']
const matHeaders=['No','Block/Paddock','No Material','Nama Material','UoM','Qty HI','Qty SHI','No WO','No BKM','Keterangan']
async function downloadExcel(report:BkmDocument){
 const {buildBkmWorkbook}=await import('./bkmTemplateWorkbook.mjs')
 const rows=actualRows(report)
 const wb=buildBkmWorkbook({number:report.number,company:report.company,division:report.division,date:report.date,
  operations:rows.map(values),materials:materialRows(report).map(materialValues),materialColumns:report.materialColumns||[],
  totals:['Total','','','','',total(rows,'hk'),'Ha',total(rows,'target'),total(rows,'hi'),total(rows,'shi')]})
 const buffer=await wb.xlsx.writeBuffer()
 const url=URL.createObjectURL(new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
 const a=document.createElement('a');a.href=url;a.download='Rekap-BKM-'+report.date+'.xlsx';document.body.appendChild(a)
 try{a.click()}finally{a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}
}
// Widths in cm from B:Q of the original sheet; merged columns use summed widths.
const opPaperWidths=[1.710972,2.769305,5.856111,2.081389,2.257778,1.569861,1.075972,2.240139,2.099028,1.781528,1.340556,2.751667,2.345972,2.451806]
const matPaperWidths=[1.710972,2.769305,5.856111,5.909028,1.075972,2.240139,2.099028,1.781528,4.092223,4.797778]
function PaperCols({widths}:{widths:number[]}){
 const sum=widths.reduce((a,b)=>a+b,0)
 return <colgroup>{widths.map((v,i)=><col key={i} style={{width:(v/sum*100)+'%'}}/>)}</colgroup>
}
function Paper({report}:{report:BkmDocument}){
 const ops=actualRows(report),mats=materialRows(report)
 return <div className="bkm-paper">
  <h2>REKAP BUKU KERJA MANDOR</h2>
  <div className="bkm-print-meta">{[['No',report.number],['PT',report.company],['Divisi',report.division],['Tanggal',report.date]].map(([k,v])=><div key={k}><b>{k}</b><span>: {v}</span></div>)}</div>
  <table className="bkm-print-table"><PaperCols widths={opPaperWidths}/><thead><tr><th colSpan={14}>Operation</th></tr><tr><th rowSpan={3}>No</th><th colSpan={2}>Pekerjaan</th><th colSpan={2}>Field</th><th colSpan={6}>Target Kerja</th><th rowSpan={3}>No WO</th><th rowSpan={3}>No BKM</th><th rowSpan={3}>Keterangan</th></tr><tr>{opHeaders.slice(1,8).map(h=><th rowSpan={2} key={h}>{h}</th>)}<th colSpan={3}>Actual</th></tr><tr><th>HI</th><th>SHI</th><th>%</th></tr></thead>
   <tbody>{Array.from({length:Math.max(10,ops.length)},(_,i)=><tr key={i}>{(ops[i]?values(ops[i],i):[i+1,...Array(13).fill('')]).map((v,j)=><td key={j}>{j===10&&typeof v==='number'?format(v*100)+'%':typeof v==='number'?format(v):v}</td>)}</tr>)}</tbody>
   <tfoot><tr><td colSpan={5}>Total</td><td>{format(total(ops,'hk'))}</td><td>Ha</td><td>{format(total(ops,'target'))}</td><td>{format(total(ops,'hi'))}</td><td>{format(total(ops,'shi'))}</td><td colSpan={4}/></tr></tfoot>
  </table>
  <table className="bkm-print-table bkm-material-print"><PaperCols widths={[...matPaperWidths,...(report.materialColumns||[]).map(()=>2.5)]}/><thead><tr><th colSpan={10+(report.materialColumns?.length||0)}>Material</th></tr><tr>{[...matHeaders,...(report.materialColumns||[])].map(h=><th key={h}>{h}</th>)}</tr></thead>
   <tbody>{Array.from({length:Math.max(10,mats.length)},(_,i)=>{const m=mats[i];return <tr key={i}>{(m?materialValues(m,i):[i+1,...Array(9+(report.materialColumns?.length||0)).fill('')]).map((v,j)=><td key={j}>{typeof v==='number'?format(v):v}</td>)}</tr>})}</tbody>
  </table>
  <table className="bkm-sign"><thead><tr><th>Disetujui Oleh</th><th>Diverifikasi oleh,</th><th>Dibuat oleh,</th></tr></thead><tbody><tr><td/><td/><td/></tr></tbody><tfoot><tr><th>General Manager</th><th>Manager</th><th>Asisten</th></tr></tfoot></table>
 </div>
}
export default function BkmWorkspace({user,offlineOnly=false}:{user:User;offlineOnly?:boolean}){
 const uid=user.firebaseUid||''
 const draftKey='qc_bkm_draft_v1:'+firebaseAuth?.app.options.projectId+':'+uid
 const [report,setReport]=useState<BkmDocument>(()=>{try{const v=JSON.parse(localStorage.getItem(draftKey)||'null');return v?.date&&Array.isArray(v.rows)?v:initial()}catch{return initial()}})
 const [candidates,setCandidates]=useState<BkmCandidate[]>([])
 const [masterActivities,setMasterActivities]=useState<BkmActivity[]>([])
 const [masterPaddocks,setMasterPaddocks]=useState<BkmPaddock[]>([])
 const [masterMaterials,setMasterMaterials]=useState<{code:string;name:string;unit:string}[]>([])
 const [loadedDate,setLoadedDate]=useState('')
 const [loadedAt,setLoadedAt]=useState('')
 const [saved,setSaved]=useState<BkmDocument[]>([])
 const [view,setView]=useState<'input'|'data'|'preview'>('input')
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')
 const requestId=useRef(0)
 const editable=canEditAccess(user,'data_plan_actual')
 const [online,setOnline]=useState(()=>navigator.onLine)
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update)}},[])
 const serverAvailable=online&&!offlineOnly
 const selected=actualRows(report)
 const actualIds=selected.flatMap(r=>r.candidate!.actualIds)
 const validMaterials=materialRows(report).every(m=>m.pid.trim()&&m.name.trim()&&m.unit.trim())
 const valid=validMaterials&&!!report.company.trim()&&!!report.division.trim()&&selected.length>0&&new Set(idsFor(selected)).size===selected.length&&new Set(actualIds).size===actualIds.length&&!selected.some(r=>r.candidate?.conflict||r.candidate?.company!==report.company.toUpperCase())
 const companies=[...new Set([...candidates.map(c=>c.company),...masterPaddocks.map(p=>p.company)])].sort()
 const materialColumns=report.materialColumns||[]
 const editingMaterials=report.materialEntries??autoMaterial(report)
 const gridMaterials=[...editingMaterials,...Array.from({length:Math.max(0,10-editingMaterials.length)},()=>blankMaterial(materialColumns.length))]
 const [newColumn,setNewColumn]=useState('')
 const scoped=candidates.filter(c=>c.company===report.company.toUpperCase())
 const woOptions=[...new Set(scoped.map(c=>c.wo).filter(Boolean))].sort().map(value=>({value,label:value}))
 const ids=selected.map(r=>r.candidate!.id)
 useEffect(()=>()=>{requestId.current++},[])
 function patchHeader<K extends 'date'|'company'|'division'|'number'>(key:K,value:string){
  if((key==='date'||key==='company')&&selected.length&&!window.confirm('Mengubah tanggal/PT akan mengosongkan pilihan pekerjaan. Lanjut?'))return
  setReport(old=>({...old,[key]:value,...(key==='date'||key==='company'?{id:'',revision:0,rows:Array.from({length:10},blank),materialEntries:undefined,materialColumns:undefined}:{})}))
  if(key==='date'){requestId.current++;setBusy(false);setCandidates([]);setLoadedDate('');setLoadedAt('');setSaved([])}
 }
 function patch(i:number,patch:Partial<BkmInputRow>){setReport(old=>({...old,rows:old.rows.map((r,j)=>i===j?{...r,...patch}:r)}))}
 function moveCell(e:KeyboardEvent<HTMLElement>,i:number,col:'bkm'|'note'){
  if(!['ArrowUp','ArrowDown','Enter'].includes(e.key)||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey)return
  const next=i+(e.key==='ArrowUp'?-1:1)
  const el=document.getElementById('bkm-cell-'+next+'-'+col)
  if(el){e.preventDefault();el.focus()}
 }
 function pasteCells(e:ClipboardEvent<HTMLElement>,i:number,col:'bkm'|'note'){
  const raw=e.clipboardData.getData('text/plain')
  if(!raw.includes('\t')&&!raw.includes('\n'))return
  e.preventDefault()
  const rows=raw.replace(/\r/g,'').replace(/\n$/,'').split('\n').slice(0,100-i)
  setReport(old=>{
   const next=old.rows.map(r=>({...r}))
   for(let offset=0;offset<rows.length;offset++){
    const at=i+offset
    while(next.length<=at)next.push(blank())
    const fields=rows[offset].split('\t')
    if(col==='bkm'){next[at].bkm=fields[0].slice(0,120);if(fields.length>1)next[at].note=fields[1].slice(0,800)}
    else next[at].note=fields[0].slice(0,800)
   }
   return {...old,rows:next}
  })
 }
 async function load(){
  if(!serverAvailable){setError('Muat sumber memerlukan internet.');return}
  if(selected.length&&!window.confirm('Muat ulang sumber? Pilihan lama yang tidak lagi ditemukan akan dikosongkan.'))return
  const token=++requestId.current,date=report.date
  setBusy(true);setError('');setMessage('')
  try{
   const result=await loadBkmCandidates(date)
   if(token!==requestId.current||firebaseAuth?.currentUser?.uid!==uid)return
   setCandidates(result.candidates);setMasterActivities(result.masterActivities);setMasterPaddocks(result.masterPaddocks);setMasterMaterials(result.masterMaterials);setLoadedDate(date);setLoadedAt(result.loadedAt)
   setReport(old=>({...old,company:old.company||([...new Set(result.candidates.map(c=>c.company))].length===1?result.candidates[0].company:''),rows:old.rows.map(r=>r.candidate?{...r,candidate:result.candidates.find(c=>c.id===r.candidate?.id)||(r.candidate.id.startsWith('["manual",')?r.candidate:null)}:r)}))
   setMessage(result.candidates.length+' pekerjaan dari '+result.sourceCount+' record harian. Pilih PT dan pekerjaan.')
  }catch(e){if(token===requestId.current)setError(e instanceof Error?e.message:'Data gagal dimuat.')}
  finally{if(token===requestId.current)setBusy(false)}
 }
 function localSave(){
  try{
   if(!uid||firebaseAuth?.currentUser?.uid!==uid)throw Error('Akun tidak sesuai.')
   localStorage.setItem(draftKey,JSON.stringify(report));setMessage('Draft lokal tersimpan pada perangkat ini. Belum dikirim ke Firestore.');setError('')
  }catch(e){setError(e instanceof Error?e.message:'Draft lokal tidak dapat disimpan.')}
 }
 async function save(){
  if(!serverAvailable||!editable||!valid)return
  setBusy(true);setError('');setMessage('')
  try{const result=await saveBkm({...report,...(report.materialEntries?{materialEntries:materialRows(report)}:{})});setReport(old=>({...old,...result}));setMessage('Rekap BKM disimpan dan dikonfirmasi oleh Firestore.')}
  catch(e){setError(e instanceof Error?e.message:'Simpan belum berhasil. Draft tidak dihapus.')}
  finally{setBusy(false)}
 }
 async function showSaved(){
  if(!serverAvailable){setError('Data Rekap server membutuhkan koneksi.');return}
  setView('data');setBusy(true);setError('')
  try{setSaved(await listBkm(report.date))}
  catch(e){setError(e instanceof Error?e.message:'Data Rekap belum dapat dibaca.')}
  finally{setBusy(false)}
 }
 function openSaved(doc:BkmDocument){
  setReport({...doc,rows:[...doc.rows,...Array.from({length:Math.max(0,10-doc.rows.length)},blank)]});setView('input')
  setCandidates([]);setLoadedDate('');setMessage('Snapshot tersimpan dibuka. Muat sumber bila ingin memperbarui angka.')
 }
 function editMaterial(i:number,patch:Partial<BkmMaterialEntry>){
  setReport(old=>{const rows=[...(old.materialEntries??autoMaterial(old))];while(rows.length<=i)rows.push(blankMaterial(old.materialColumns?.length||0));rows[i]={...rows[i],...patch};return {...old,materialEntries:rows}})
 }
 function addMaterialColumn(){
  const title=newColumn.trim()
  if(!title||title.length>60||[...matHeaders,...materialColumns,'Aksi'].some(v=>v.toLowerCase()===title.toLowerCase())||materialColumns.length>=8)return
  setReport(old=>({...old,materialColumns:[...(old.materialColumns||[]),title],materialEntries:(old.materialEntries??autoMaterial(old)).map(m=>({...m,extra:[...m.extra,'']}))}));setNewColumn('')
 }
 function print(){
  setView('preview')
  window.setTimeout(()=>{
   document.body.classList.add('qc-bkm-print')
   try{window.print()}finally{document.body.classList.remove('qc-bkm-print')}
  },100)
 }
 return <section className="bkm-workspace">
  {!serverAvailable&&<Alert type="warning" showIcon title="Mode offline · hanya draft BKM akun ini" description="Data sumber baru dan penyimpanan Firestore memerlukan koneksi. Draft lokal yang tersimpan tetap dapat diedit dan dicetak."/>}
  <div className="bkm-toolbar">
   <Button type={view==='input'?'primary':'default'} onClick={()=>setView('input')}>Input Rekap BKM</Button>
   <Button disabled={!serverAvailable} type={view==='data'?'primary':'default'} loading={busy&&view==='data'} onClick={()=>void showSaved()}>Data Rekap BKM</Button>
   <Button type={view==='preview'?'primary':'default'} onClick={()=>setView('preview')}>Preview</Button>
   <Button disabled={busy||!valid} onClick={print}>Print / PDF</Button><Button disabled={busy||!valid} onClick={()=>{void downloadExcel(report).catch(e=>setError(e instanceof Error?e.message:"Export Excel gagal."))}}>Export Excel</Button>
  </div>
  {error&&<Alert type="error" title={error} showIcon/>}{message&&<Alert type="info" title={message} showIcon/>}
  {view==='data'?<><div className="bkm-toolbar"><label>Tanggal <input type="date" disabled={busy} value={report.date} onChange={e=>patchHeader('date',e.target.value)}/></label><Button onClick={()=>void showSaved()} loading={busy}>Cari rekap</Button></div><div className="bkm-grid-scroll"><table className="bkm-grid"><thead><tr><th>No</th><th>PT</th><th>Divisi</th><th>Tanggal</th><th>Pekerjaan</th><th>Aksi</th></tr></thead><tbody>{saved.map(d=><tr key={d.id}><td>{d.number||'—'}</td><td>{d.company}</td><td>{d.division}</td><td>{d.date}</td><td>{d.rows.length}</td><td><Button onClick={()=>openSaved(d)}>Buka</Button></td></tr>)}</tbody></table></div>{!saved.length&&!busy&&<p>Belum ada rekap yang ditampilkan pada tanggal ini.</p>}</>:view==='preview'?<Paper report={report}/>:<>
   <Typography.Title level={4} style={{textAlign:'center'}}>REKAP BUKU KERJA MANDOR</Typography.Title>
   <div className="bkm-header-fields">
    <label>No <Input disabled={busy} value={report.number} maxLength={120} onChange={e=>patchHeader('number',e.target.value)} placeholder="Opsional"/></label>
    <label>PT <Select disabled={busy} showSearch value={report.company||undefined} placeholder="Pilih PT" options={[...new Set([...companies,report.company].filter(Boolean))].map(value=>({value,label:value}))} onChange={v=>patchHeader('company',v)}/></label>
    <label>Divisi <Input disabled={busy} value={report.division} maxLength={120} onChange={e=>patchHeader('division',e.target.value)}/></label>
    <label>Tanggal <input type="date" disabled={busy} value={report.date} onChange={e=>patchHeader('date',e.target.value)}/></label>
   </div>
   <div className="bkm-toolbar"><Button disabled={!serverAvailable} loading={busy} onClick={()=>void load()}>Muat sumber tanggal</Button><Button disabled={busy||!editable} onClick={localSave}>Simpan draft lokal</Button><Button type="primary" disabled={busy||!serverAvailable||!editable||!valid} loading={busy} onClick={()=>void save()}>Simpan Rekap</Button>{loadedAt&&<small>Sumber: {new Date(loadedAt).toLocaleString('id-ID')}</small>}</div>
   <Alert type="warning" showIcon title="No WO dan No BKM boleh kosong" description="Pilih WO dan/atau Description dari Master Activity, lalu paddock. HI dan HK dapat diisi manual untuk rekap saja. SHI = sisa target setelah actual sebelum tanggal laporan + HI. Persentase dapat melebihi 100%. Riwayat berasal dari Actual Plan sebelum tanggal laporan, bukan rekap BKM sebelumnya. Input HI/HK tidak mengubah Actual Plan. Tanpa WO, target, SHI dan persen kosong. Divisi adalah label laporan."/>
   <div className="bkm-grid-scroll"><table className="bkm-grid bkm-operation"><thead><tr><th colSpan={15}>Operation</th></tr><tr><th rowSpan={3}>No</th><th colSpan={2}>Pekerjaan</th><th colSpan={2}>Field</th><th colSpan={6}>Target Kerja</th><th rowSpan={3}>No WO</th><th rowSpan={3}>No BKM</th><th rowSpan={3}>Keterangan</th><th rowSpan={3}>Aksi</th></tr><tr>{opHeaders.slice(1,8).map(h=><th rowSpan={2} key={h}>{h}</th>)}<th colSpan={3}>Actual</th></tr><tr><th>HI</th><th>SHI</th><th>%</th></tr></thead><tbody>
    {report.rows.map((r,i)=>{const c=r.candidate;const activityFilter=r.activityFilter||''
     const eligible=bkmAvailableCandidates(candidates,report.company,r.filterWo,ids,c?.id||'').filter(x=>!activityFilter||x.operationCode===activityFilter)
     const chosenActivity=masterActivities.find(a=>a.operationCode===activityFilter)
     const manual=(!r.filterWo&&chosenActivity?masterPaddocks.filter(p=>p.company===report.company.toUpperCase()&&!candidates.some(x=>x.company===p.company&&x.pid===p.pid&&x.operationCode===activityFilter)).map(p=>bkmManualCandidate(p.company,p,chosenActivity)):[]).filter(x=>!ids.includes(x.id)||x.id===c?.id)
     const available=[...eligible,...manual]
     const actOptions=[...new Map([...masterActivities.filter(a=>!r.filterWo||scoped.some(x=>x.wo===r.filterWo&&x.operationCode===a.operationCode)),...scoped.filter(x=>!r.filterWo||x.wo===r.filterWo).filter(x=>x.operationCode).map(x=>({operationCode:x.operationCode,description:x.description}))].reverse().map(a=>[a.operationCode,{value:a.operationCode,label:a.description+' · '+a.operationCode}] as const)).values()]
     const options=[...new Map([...available,...(c?[c]:[])].map(x=>[x.id,x])).values()].map(x=>({value:x.id,label:x.pid+' — '+x.description+(x.wo?' · '+x.wo:'')}));return <tr key={i}>
     <td>{i+1}</td><td className="bkm-auto">{c?.operationCode||activityFilter}</td><td><Select aria-label={'Description baris '+(i+1)} showSearch allowClear optionFilterProp="label" style={{minWidth:200}} placeholder="Pilih Master Activity" value={activityFilter||c?.operationCode||undefined} options={actOptions} disabled={busy||!editable||loadedDate!==report.date} onChange={v=>{const master=masterActivities.find(a=>a.operationCode===v);if(c&&c.operationCode===v)patch(i,{activityFilter:v||'',candidate:master?{...c,description:master.description}:c});else patch(i,{activityFilter:v||'',candidate:null,hiOverride:null,hkOverride:null})}}/>{c&&!actOptions.some(a=>a.value===c.operationCode)&&<small>{c.description}</small>}</td>
     <td><Select aria-label={'Paddock baris '+(i+1)} className="bkm-pid" showSearch allowClear optionFilterProp="label" value={c?.id} options={options} disabled={busy||!editable||loadedDate!==report.date} placeholder="Pilih paddock / activity" onChange={v=>{const found=available.find(x=>x.id===v)||null;const master=masterActivities.find(a=>a.operationCode===found?.operationCode);const next=found&&master?{...found,description:master.description}:found;patch(i,{candidate:next,activityFilter:next?.operationCode||activityFilter,hiOverride:null,hkOverride:null,note:next?.notes||''})}}/></td>
     <td className="bkm-auto">{format(c?.area)}</td><td><InputNumber aria-label={'HK baris '+(i+1)} min={0} step={0.5} value={effective(r,'hk')} disabled={busy||!editable||!c} onChange={v=>patch(i,{hkOverride:v})} style={{width:80}}/></td><td className="bkm-auto">{c?.uom}</td><td className="bkm-auto">{format(effective(r,'target'))}</td><td><InputNumber aria-label={'HI baris '+(i+1)} min={0} precision={4} value={effective(r,'hi')} disabled={busy||!editable||!c} onChange={v=>patch(i,{hiOverride:v})} style={{width:100}}/></td><td className="bkm-auto">{format(bkmRealization(c,r.hiOverride).balance)}</td><td className="bkm-auto">{bkmRealization(c,r.hiOverride).progress==null?'':format(bkmRealization(c,r.hiOverride).progress)+'%'}</td>
     <td><Select aria-label={'WO baris '+(i+1)} className="bkm-wo" showSearch allowClear optionFilterProp="label" value={r.filterWo||undefined} placeholder="Tanpa filter" options={[...new Map([...woOptions,...(r.filterWo?[{value:r.filterWo,label:r.filterWo}]:[])].map(x=>[x.value,x])).values()]} disabled={busy||!editable||loadedDate!==report.date} onChange={v=>{const keep=!!c&&(!v||c.wo===v);patch(i,keep?{filterWo:v||''}:{filterWo:v||'',candidate:null,activityFilter:'',hiOverride:null,hkOverride:null})}}/>{c?.wo&&<small className="bkm-source-wo">Sumber: {c.wo}</small>}</td>
     <td><Input id={'bkm-cell-'+i+'-bkm'} onKeyDown={e=>moveCell(e,i,'bkm')} onPaste={e=>pasteCells(e,i,'bkm')} aria-label={'BKM baris '+(i+1)} value={r.bkm} disabled={busy||!editable} maxLength={120} placeholder="Opsional" onChange={e=>patch(i,{bkm:e.target.value})}/></td>
     <td><Input.TextArea id={'bkm-cell-'+i+'-note'} onKeyDown={e=>moveCell(e,i,'note')} onPaste={e=>pasteCells(e,i,'note')} aria-label={'Keterangan baris '+(i+1)} value={r.note} disabled={busy||!editable} maxLength={800} autoSize={{minRows:1,maxRows:3}} onChange={e=>patch(i,{note:e.target.value})}/>{c?.warnings.map(w=><small key={w} className="bkm-warning">{w}</small>)}</td>
     <td><Button size="small" disabled={busy||!editable} onClick={()=>patch(i,blank())}>Bersihkan</Button><Button size="small" disabled={busy||!editable||report.rows.length>=100} onClick={()=>setReport(old=>({...old,rows:[...old.rows.slice(0,i+1),{...r,candidate:null,hiOverride:null,hkOverride:null},...old.rows.slice(i+1)]}))}>Duplikat isian</Button></td>
    </tr>})}
   </tbody><tfoot><tr><td colSpan={5}>Total</td><td>{format(total(selected,'hk'))}</td><td>Ha</td><td>{format(total(selected,'target'))}</td><td>{format(total(selected,'hi'))}</td><td>{format(total(selected,'shi'))}</td><td colSpan={5}/></tr></tfoot></table></div>
   <div className="bkm-toolbar"><Button disabled={!editable||report.rows.length>=100} onClick={()=>setReport(old=>({...old,rows:[...old.rows,blank()]}))}>+ Tambah baris</Button><Button disabled={!editable||report.rows.length<=1} onClick={()=>{if(!report.rows.at(-1)?.candidate||window.confirm('Hapus pilihan pada baris terakhir?'))setReport(old=>({...old,rows:old.rows.slice(0,-1)}))}}>Hapus baris terakhir</Button><Button disabled={busy||!editable} onClick={()=>{if(window.confirm('Buat rekap baru? Draft lokal yang sudah disimpan tetap ada sampai ditimpa.')){setReport(initial());setCandidates([]);setLoadedDate('')}}}>Rekap baru</Button></div>
   <div className="bkm-toolbar"><Button disabled={busy||!editable||gridMaterials.length>=100} onClick={()=>setReport(old=>({...old,materialEntries:[...gridMaterials,blankMaterial(materialColumns.length)]}))}>+ Tambah baris Material</Button><Button disabled={busy||!editable} onClick={()=>{if(window.confirm('Ganti isian Material dengan alokasi QC yang terverifikasi?'))setReport(old=>({...old,materialEntries:autoMaterial(old)}))}}>Ambil Material dari QC</Button><Input style={{width:180}} value={newColumn} onChange={e=>setNewColumn(e.target.value)} maxLength={60} placeholder="Nama kolom tambahan"/><Button disabled={busy||!editable||!newColumn.trim()||materialColumns.length>=8||[...matHeaders,...materialColumns,'Aksi'].some(v=>v.toLowerCase()===newColumn.trim().toLowerCase())} onClick={addMaterialColumn}>+ Tambah kolom</Button></div>
   <datalist id="bkm-master-materials">{masterMaterials.map((m,i)=><option key={i} value={m.name}/>)}</datalist>
   <div className="bkm-grid-scroll"><table className="bkm-grid"><thead><tr><th colSpan={11+materialColumns.length}>Material</th></tr><tr>{[...matHeaders,...materialColumns,'Aksi'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{gridMaterials.map((m,i)=><tr key={i}>
    <td>{i+1}</td><td><Input aria-label={'Material Paddock '+(i+1)} value={m.pid} disabled={busy||!editable} onChange={e=>editMaterial(i,{pid:e.target.value})}/></td>
    <td><Input aria-label={'No Material '+(i+1)} value={m.code} disabled={busy||!editable} onChange={e=>editMaterial(i,{code:e.target.value})}/></td>
    <td><Input aria-label={'Nama Material '+(i+1)} list="bkm-master-materials" value={m.name} disabled={busy||!editable} onChange={e=>{const name=e.target.value,match=masterMaterials.filter(x=>x.name===name);editMaterial(i,{name,...(match.length===1?{code:match[0].code,unit:match[0].unit}:{})})}}/></td>
    <td><Input aria-label={'UoM Material '+(i+1)} value={m.unit} disabled={busy||!editable} onChange={e=>editMaterial(i,{unit:e.target.value})}/></td>
    <td><InputNumber aria-label={'Qty HI '+(i+1)} min={0} value={m.hi} disabled={busy||!editable} onChange={v=>editMaterial(i,{hi:v})}/></td>
    <td><InputNumber aria-label={'Qty SHI '+(i+1)} min={0} value={m.shi} disabled={busy||!editable} onChange={v=>editMaterial(i,{shi:v})}/></td>
    {(['wo','bkm','note'] as const).map(k=><td key={k}><Input aria-label={k+' Material '+(i+1)} value={m[k]} disabled={busy||!editable} onChange={e=>editMaterial(i,{[k]:e.target.value})}/></td>)}
    {materialColumns.map((h,j)=><td key={h}><Input aria-label={h+' Material '+(i+1)} maxLength={800} value={m.extra[j]||''} disabled={busy||!editable} onChange={e=>editMaterial(i,{extra:m.extra.map((v,k)=>k===j?e.target.value:v)})}/></td>)}
    <td><Button size="small" disabled={busy||!editable} onClick={()=>setReport(old=>({...old,materialEntries:gridMaterials.filter((_,j)=>j!==i)}))}>Hapus</Button></td>
   </tr>)}</tbody></table></div>
   {!validMaterials&&<Alert type="warning" title="Lengkapi Paddock, Nama Material dan UoM pada setiap baris Material yang diisi."/>}
   <small>Material bisa diisi manual, termasuk Qty HI dan Qty SHI (akumulasi material). Kolom tambahan disimpan dan ikut dalam Excel serta PDF. Tidak mengubah transaksi stok atau Actual Plan.</small>
  </>}
 </section>
}
