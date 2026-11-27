import {useEffect,useRef,useState} from 'react'
import {Alert,Button,Input,Select,Typography} from 'antd'
import * as XLSX from 'xlsx'
import {firebaseAuth} from './firebase'
import {canEditAccess} from './accessControl'
import {bkmAvailableCandidates,type BkmCandidate} from './bkmAggregation.mjs'
import {loadBkmCandidates,listBkm,saveBkm,type BkmDocument,type BkmInputRow} from './bkmFirestore'
import type {User} from './types'
import './bkm.css'

const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
const blank=():BkmInputRow=>({filterWo:'',candidate:null,bkm:'',note:''})
const initial=():BkmDocument=>({id:'',revision:0,date:today(),company:'',division:'UnM',number:'',rows:Array.from({length:10},blank)})
const format=(n:number|null|undefined)=>n===null||n===undefined?'':n.toLocaleString('id-ID',{maximumFractionDigits:4})
const actualRows=(doc:BkmDocument)=>doc.rows.filter(r=>r.candidate)
const materialRows=(doc:BkmDocument)=>actualRows(doc).flatMap(r=>r.candidate!.material.map(m=>({pid:r.candidate!.pid,...m,wo:r.candidate!.wo,bkm:r.bkm,note:'Alokasi terukur'+(r.candidate!.warnings.some(w=>w.includes('material'))?' (parsial)':'')})))
const notes=(r:BkmInputRow)=>[r.note,...(r.candidate?.warnings||[])].filter(Boolean).join(' · ')
const total=(rows:BkmInputRow[],field:'hk'|'target'|'hi'|'shi')=>rows.length&&rows.every(r=>r.candidate?.[field]!==null&&r.candidate?.[field]!==undefined)?rows.reduce((a,r)=>a+(r.candidate![field]??0),0):null
const values=(r:BkmInputRow,i:number)=>{const c=r.candidate;return [i+1,c?.operationCode||'',c?.description||'',c?.pid||'',c?.area??'',c?.hk??'',c?.uom||'',c?.target??'',c?.hi??'',c?.shi??'',c?.progress!=null?c.progress/100:'',c?.wo||'',r.bkm,notes(r)]}
const opHeaders=['No','Opr Code','Desc','Paddock / Block','Luas Area','Jml HK','UoM','Luas WO','HI','SHI','%','No WO','No BKM','Keterangan']
const matHeaders=['No','Block/Paddock','No Material','Nama Material','UoM','Qty HI','Qty SHI','No WO','No BKM','Keterangan']
function downloadExcel(report:BkmDocument){
 const rows=actualRows(report),materials=materialRows(report),opCount=Math.max(10,rows.length),matCount=Math.max(8,materials.length)
 const table:(string|number|null)[][]=[
  ['REKAP BUKU KERJA MANDOR'],['No',report.number],['PT',report.company],['Divisi',report.division],['Tanggal',report.date],['Operation'],
  ['No','Pekerjaan','','Field','','Target Kerja','','','','','','No WO','No BKM','Keterangan'],
  ['',...opHeaders.slice(1,8),'Actual','','','','',''],
  ['','','','','','','','','HI','SHI','%','','',''],
  ...Array.from({length:opCount},(_,i)=>i<rows.length?values(rows[i],i):[i+1]),
  ['Total','','','','',total(rows,'hk'),'Ha',total(rows,'target'),total(rows,'hi'),total(rows,'shi')],
  ['Material'],matHeaders,
  ...Array.from({length:matCount},(_,i)=>{const m=materials[i];return m?[i+1,m.pid,m.code,m.name,m.unit,m.hi,m.shi,m.wo,m.bkm,m.note]:[i+1]}),
  [],['','','','','','','','Disetujui oleh','','Diverifikasi oleh','','Dibuat oleh'],[],[],['','','','','','','','GM','','Manager','','Asisten']
 ]
 const ws=XLSX.utils.aoa_to_sheet(table)
 const merges:XLSX.Range[]=[]
 const merge=(r:number,c:number,er:number,ec:number)=>merges.push({s:{r,c},e:{r:er,c:ec}})
 merge(0,0,0,13);merge(5,0,5,13);merge(6,0,8,0);merge(6,1,6,2);merge(6,3,6,4);merge(6,5,6,10)
 for(const c of [1,2,3,4,5,6,7])merge(7,c,8,c)
 merge(7,8,7,10);for(const c of [11,12,13])merge(6,c,8,c)
 merge(9+opCount,0,9+opCount,4);merge(10+opCount,0,10+opCount,13)
 const sign=13+opCount+matCount
 for(const [a,b] of [[7,8],[9,10],[11,13]]){merge(sign,a,sign,b);merge(sign+1,a,sign+2,b);merge(sign+3,a,sign+3,b)}
 ws['!merges']=merges
 ws['!cols']=[{wch:5},{wch:16},{wch:34},{wch:20},{wch:13},{wch:10},{wch:10},{wch:14},{wch:12},{wch:12},{wch:11},{wch:20},{wch:17},{wch:60}]
 for(let i=0;i<rows.length;i++){const cell=ws[XLSX.utils.encode_cell({r:9+i,c:10})];if(cell?.t==='n')cell.z='0.00%'}
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Rekap BKM')
 XLSX.writeFile(wb,'Rekap-BKM-'+report.date+'.xlsx')
}
function Paper({report}:{report:BkmDocument}){
 const ops=actualRows(report),mats=materialRows(report)
 return <div className="bkm-paper">
  <h2>REKAP BUKU KERJA MANDOR</h2>
  <div className="bkm-print-meta">{[['No',report.number],['PT',report.company],['Divisi',report.division],['Tanggal',report.date]].map(([k,v])=><div key={k}><b>{k}</b><span>: {v}</span></div>)}</div>
  <table className="bkm-print-table"><thead><tr><th colSpan={14}>Operation</th></tr><tr><th rowSpan={3}>No</th><th colSpan={2}>Pekerjaan</th><th colSpan={2}>Field</th><th colSpan={6}>Target Kerja</th><th rowSpan={3}>No WO</th><th rowSpan={3}>No BKM</th><th rowSpan={3}>Keterangan</th></tr><tr>{opHeaders.slice(1,8).map(h=><th rowSpan={2} key={h}>{h}</th>)}<th colSpan={3}>Actual</th></tr><tr><th>HI</th><th>SHI</th><th>%</th></tr></thead>
   <tbody>{Array.from({length:Math.max(10,ops.length)},(_,i)=><tr key={i}>{(ops[i]?values(ops[i],i):[i+1,...Array(13).fill('')]).map((v,j)=><td key={j}>{j===10&&typeof v==='number'?format(v*100)+'%':typeof v==='number'?format(v):v}</td>)}</tr>)}</tbody>
   <tfoot><tr><td colSpan={5}>Total</td><td>{format(total(ops,'hk'))}</td><td>Ha</td><td>{format(total(ops,'target'))}</td><td>{format(total(ops,'hi'))}</td><td>{format(total(ops,'shi'))}</td><td colSpan={4}/></tr></tfoot>
  </table>
  <table className="bkm-print-table bkm-material-print"><thead><tr><th colSpan={10}>Material</th></tr><tr>{matHeaders.map(h=><th key={h}>{h}</th>)}</tr></thead>
   <tbody>{Array.from({length:Math.max(8,mats.length)},(_,i)=>{const m=mats[i];return <tr key={i}>{(m?[i+1,m.pid,m.code,m.name,m.unit,m.hi,m.shi,m.wo,m.bkm,m.note]:[i+1,...Array(9).fill('')]).map((v,j)=><td key={j}>{typeof v==='number'?format(v):v}</td>)}</tr>})}</tbody>
  </table>
  <table className="bkm-sign"><thead><tr><th>Disetujui Oleh</th><th>Diverifikasi oleh,</th><th>Dibuat oleh,</th></tr></thead><tbody><tr><td/><td/><td/></tr></tbody><tfoot><tr><th>GM</th><th>Manager</th><th>Asisten</th></tr></tfoot></table>
 </div>
}
export default function BkmWorkspace({user}:{user:User}){
 const uid=user.firebaseUid||''
 const draftKey='qc_bkm_draft_v1:'+firebaseAuth?.app.options.projectId+':'+uid
 const [report,setReport]=useState<BkmDocument>(()=>{try{const v=JSON.parse(localStorage.getItem(draftKey)||'null');return v?.date&&Array.isArray(v.rows)?v:initial()}catch{return initial()}})
 const [candidates,setCandidates]=useState<BkmCandidate[]>([])
 const [loadedDate,setLoadedDate]=useState('')
 const [loadedAt,setLoadedAt]=useState('')
 const [saved,setSaved]=useState<BkmDocument[]>([])
 const [view,setView]=useState<'input'|'data'|'preview'>('input')
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')
 const requestId=useRef(0)
 const editable=canEditAccess(user,'data_plan_actual')
 const selected=actualRows(report)
 const valid=!!report.company.trim()&&!!report.division.trim()&&selected.length>0&&!selected.some(r=>r.candidate?.conflict||r.candidate?.company!==report.company.toUpperCase())
 const companies=[...new Set(candidates.map(c=>c.company))].sort()
 const scoped=candidates.filter(c=>c.company===report.company.toUpperCase())
 const woOptions=[...new Set(scoped.map(c=>c.wo).filter(Boolean))].sort().map(value=>({value,label:value}))
 const ids=selected.map(r=>r.candidate!.id)
 useEffect(()=>()=>{requestId.current++},[])
 function patchHeader<K extends 'date'|'company'|'division'|'number'>(key:K,value:string){
  if((key==='date'||key==='company')&&selected.length&&!window.confirm('Mengubah tanggal/PT akan mengosongkan pilihan pekerjaan. Lanjut?'))return
  setReport(old=>({...old,[key]:value,...(key==='date'||key==='company'?{id:'',revision:0,rows:Array.from({length:10},blank)}:{})}))
  if(key==='date'){requestId.current++;setCandidates([]);setLoadedDate('');setSaved([])}
 }
 function patch(i:number,patch:Partial<BkmInputRow>){setReport(old=>({...old,rows:old.rows.map((r,j)=>i===j?{...r,...patch}:r)}))}
 async function load(){
  if(selected.length&&!window.confirm('Muat ulang sumber? Pilihan lama yang tidak lagi ditemukan akan dikosongkan.'))return
  const token=++requestId.current,date=report.date
  setBusy(true);setError('');setMessage('')
  try{
   const result=await loadBkmCandidates(date)
   if(token!==requestId.current||firebaseAuth?.currentUser?.uid!==uid)return
   setCandidates(result.candidates);setLoadedDate(date);setLoadedAt(result.loadedAt)
   setReport(old=>({...old,company:old.company||([...new Set(result.candidates.map(c=>c.company))].length===1?result.candidates[0].company:''),rows:old.rows.map(r=>r.candidate?{...r,candidate:result.candidates.find(c=>c.id===r.candidate?.id)||null}:r)}))
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
  if(!editable||!valid)return
  setBusy(true);setError('');setMessage('')
  try{const result=await saveBkm(report);setReport(old=>({...old,...result}));setMessage('Rekap BKM disimpan dan dikonfirmasi oleh Firestore.')}
  catch(e){setError(e instanceof Error?e.message:'Simpan belum berhasil. Draft tidak dihapus.')}
  finally{setBusy(false)}
 }
 async function showSaved(){
  setView('data');setBusy(true);setError('')
  try{setSaved(await listBkm(report.date))}
  catch(e){setError(e instanceof Error?e.message:'Data Rekap belum dapat dibaca.')}
  finally{setBusy(false)}
 }
 function openSaved(doc:BkmDocument){
  setReport({...doc,rows:[...doc.rows,...Array.from({length:Math.max(0,10-doc.rows.length)},blank)]});setView('input')
  setCandidates([]);setLoadedDate('');setMessage('Snapshot tersimpan dibuka. Muat sumber bila ingin memperbarui angka.')
 }
 function print(){
  setView('preview')
  window.setTimeout(()=>{
   document.body.classList.add('qc-bkm-print')
   try{window.print()}finally{document.body.classList.remove('qc-bkm-print')}
  },100)
 }
 return <section className="bkm-workspace">
  <div className="bkm-toolbar">
   <Button type={view==='input'?'primary':'default'} onClick={()=>setView('input')}>Input Rekap BKM</Button>
   <Button type={view==='data'?'primary':'default'} loading={busy&&view==='data'} onClick={()=>void showSaved()}>Data Rekap BKM</Button>
   <Button type={view==='preview'?'primary':'default'} onClick={()=>setView('preview')}>Preview</Button>
   <Button disabled={!valid} onClick={print}>Print / PDF</Button><Button disabled={!valid} onClick={()=>downloadExcel(report)}>Export Excel</Button>
  </div>
  {error&&<Alert type="error" title={error} showIcon/>}{message&&<Alert type="info" title={message} showIcon/>}
  {view==='data'?<><div className="bkm-toolbar"><label>Tanggal <input type="date" value={report.date} onChange={e=>patchHeader('date',e.target.value)}/></label><Button onClick={()=>void showSaved()} loading={busy}>Cari rekap</Button></div><div className="bkm-grid-scroll"><table className="bkm-grid"><thead><tr><th>No</th><th>PT</th><th>Divisi</th><th>Tanggal</th><th>Pekerjaan</th><th>Aksi</th></tr></thead><tbody>{saved.map(d=><tr key={d.id}><td>{d.number||'—'}</td><td>{d.company}</td><td>{d.division}</td><td>{d.date}</td><td>{d.rows.length}</td><td><Button onClick={()=>openSaved(d)}>Buka</Button></td></tr>)}</tbody></table></div>{!saved.length&&!busy&&<p>Belum ada rekap yang ditampilkan pada tanggal ini.</p>}</>:view==='preview'?<Paper report={report}/>:<>
   <Typography.Title level={4} style={{textAlign:'center'}}>REKAP BUKU KERJA MANDOR</Typography.Title>
   <div className="bkm-header-fields">
    <label>No <Input value={report.number} maxLength={120} onChange={e=>patchHeader('number',e.target.value)} placeholder="Opsional"/></label>
    <label>PT <Select showSearch value={report.company||undefined} placeholder="Pilih PT" options={[...new Set([...companies,report.company].filter(Boolean))].map(value=>({value,label:value}))} onChange={v=>patchHeader('company',v)}/></label>
    <label>Divisi <Input value={report.division} maxLength={120} onChange={e=>patchHeader('division',e.target.value)}/></label>
    <label>Tanggal <input type="date" value={report.date} onChange={e=>patchHeader('date',e.target.value)}/></label>
   </div>
   <div className="bkm-toolbar"><Button loading={busy} onClick={()=>void load()}>Muat sumber tanggal</Button><Button disabled={!editable} onClick={localSave}>Simpan draft lokal</Button><Button type="primary" disabled={!editable||!valid} loading={busy} onClick={()=>void save()}>Simpan Rekap</Button>{loadedAt&&<small>Sumber: {new Date(loadedAt).toLocaleString('id-ID')}</small>}</div>
   <Alert type="warning" showIcon title="No WO dan No BKM boleh kosong" description="Pilih WO untuk memfilter paddock, atau pilih paddock + activity langsung. Angka berasal dari Actual Plan dan Monthly Plan terkait. Divisi adalah label laporan (belum filter sumber); HK yang belum lengkap dan material berbasis dosis tidak dianggap aktual. SHI hanya untuk identitas Monthly Plan yang jelas."/>
   <div className="bkm-grid-scroll"><table className="bkm-grid bkm-operation"><thead><tr><th colSpan={15}>Operation</th></tr><tr><th rowSpan={3}>No</th><th colSpan={2}>Pekerjaan</th><th colSpan={2}>Field</th><th colSpan={6}>Target Kerja</th><th rowSpan={3}>No WO</th><th rowSpan={3}>No BKM</th><th rowSpan={3}>Keterangan</th><th rowSpan={3}>Aksi</th></tr><tr>{opHeaders.slice(1,8).map(h=><th rowSpan={2} key={h}>{h}</th>)}<th colSpan={3}>Actual</th></tr><tr><th>HI</th><th>SHI</th><th>%</th></tr></thead><tbody>
    {report.rows.map((r,i)=>{const c=r.candidate;const available=bkmAvailableCandidates(candidates,report.company,r.filterWo,ids,c?.id||'');const options=[...new Map([...available,...(c?[c]:[])].map(x=>[x.id,x])).values()].map(x=>({value:x.id,label:x.pid+' — '+x.description+(x.wo?' · '+x.wo:'')}));return <tr key={i}>
     <td>{i+1}</td><td className="bkm-auto">{c?.operationCode}</td><td className="bkm-auto">{c?.description}</td>
     <td><Select aria-label={'Paddock baris '+(i+1)} className="bkm-pid" showSearch allowClear optionFilterProp="label" value={c?.id} options={options} disabled={!editable||loadedDate!==report.date} placeholder="Pilih paddock / activity" onChange={v=>{const next=available.find(x=>x.id===v)||null;patch(i,{candidate:next,note:next?.notes||''})}}/></td>
     {[c?.area,c?.hk,c?.uom,c?.target,c?.hi,c?.shi,c?.progress==null?null:format(c.progress)+'%'].map((v,j)=><td key={j} className="bkm-auto">{typeof v==='number'?format(v):v}</td>)}
     <td><Select aria-label={'WO baris '+(i+1)} className="bkm-wo" showSearch allowClear optionFilterProp="label" value={r.filterWo||undefined} placeholder="Tanpa filter" options={[...new Map([...woOptions,...(r.filterWo?[{value:r.filterWo,label:r.filterWo}]:[])].map(x=>[x.value,x])).values()]} disabled={!editable||loadedDate!==report.date} onChange={v=>patch(i,{filterWo:v||'',candidate:c&&(!v||c.wo===v)?c:null})}/>{c?.wo&&<small className="bkm-source-wo">Sumber: {c.wo}</small>}</td>
     <td><Input aria-label={'BKM baris '+(i+1)} value={r.bkm} disabled={!editable} maxLength={120} placeholder="Opsional" onChange={e=>patch(i,{bkm:e.target.value})}/></td>
     <td><Input.TextArea aria-label={'Keterangan baris '+(i+1)} value={r.note} disabled={!editable} maxLength={800} autoSize={{minRows:1,maxRows:3}} onChange={e=>patch(i,{note:e.target.value})}/>{c?.warnings.map(w=><small key={w} className="bkm-warning">{w}</small>)}</td>
     <td><Button size="small" disabled={!editable} onClick={()=>patch(i,blank())}>Bersihkan</Button></td>
    </tr>})}
   </tbody><tfoot><tr><td colSpan={5}>Total</td><td>{format(total(selected,'hk'))}</td><td>Ha</td><td>{format(total(selected,'target'))}</td><td>{format(total(selected,'hi'))}</td><td>{format(total(selected,'shi'))}</td><td colSpan={5}/></tr></tfoot></table></div>
   <div className="bkm-toolbar"><Button disabled={!editable||report.rows.length>=100} onClick={()=>setReport(old=>({...old,rows:[...old.rows,blank()]}))}>+ Tambah baris</Button><Button disabled={!editable||report.rows.length<=1} onClick={()=>{if(!report.rows.at(-1)?.candidate||window.confirm('Hapus pilihan pada baris terakhir?'))setReport(old=>({...old,rows:old.rows.slice(0,-1)}))}}>Hapus baris terakhir</Button><Button disabled={!editable} onClick={()=>{if(window.confirm('Buat rekap baru? Draft lokal yang sudah disimpan tetap ada sampai ditimpa.')){setReport(initial());setCandidates([]);setLoadedDate('')}}}>Rekap baru</Button></div>
   <div className="bkm-grid-scroll"><table className="bkm-grid"><thead><tr><th colSpan={10}>Material</th></tr><tr>{matHeaders.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{Array.from({length:Math.max(8,materialRows(report).length)},(_,i)=>{const m=materialRows(report)[i];return <tr key={i}>{(m?[i+1,m.pid,m.code,m.name,m.unit,m.hi,m.shi,m.wo,m.bkm,m.note]:[i+1,...Array(9).fill('')]).map((v,j)=><td key={j}>{typeof v==='number'?format(v):v}</td>)}</tr>})}</tbody></table></div>
   <small>Material: hanya alokasi aktual yang memiliki identitas sumber pengisian; nilai lain ditandai pada Keterangan. Tidak membuat Actual Plan atau transaksi stok baru.</small>
  </>}
 </section>
}
