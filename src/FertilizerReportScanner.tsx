
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MasterData, MaterialMaster, PlanMaster, User } from './types'
import { scanFertilizerReportWithGemini } from './fertilizerAiScan'
import { cloneFertilizerScanResult, saveFertilizerScanFeedback } from './fertilizerScanFeedback'

export type ScanFilling={pengisianKe:number;dosis:string;statusHose:string;jenisPupuk:string;jumlah:string;hasilKerja:string;pemerataanPupuk:string;dosisAktualTertulis?:string}
export type ScanUnit={unit:string;noUnit:string;paddock:string;type:string;activity:string;catatan:string;fillings:ScanFilling[];rataRataDosisAktualTertulis?:string}
export type FertilizerScanResult={date:string;shift:string;mandor:string;assistant:string;units:ScanUnit[];rawText:string;confidence:number;warnings:string[];sourceModel?:string;sourceTemplateId?:string;routeAttempts?:Array<{model:string;ok:boolean;latencyMs:number;errorKind?:string;errorDetail?:string;via?:'template'|'direct';templateId?:string}>;routeTotalMs?:number;learningFeedbackSaved?:boolean;learningChangedFields?:number}
export type ScanApplyMode='replace'|'append'

type Props={
  user:User
  master:MasterData
  defaults:{date:string;shift:string;mandor:string;assistant:string}
  onApply:(result:FertilizerScanResult,mode:ScanApplyMode,sourceFile:File)=>void
  onClose:()=>void
}

const clean=(v:unknown)=>String(v??'').replace(/\s+/g,' ').trim()
const norm=(v:unknown)=>clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'')
const uniq=(items:unknown[])=>[...new Set(items.map(clean).filter(Boolean))]
const numberText=(v:string)=>{const m=v.match(/-?\d+(?:[.,]\d+)?/);return m?m[0].replace(',','.') : ''}
const scanNum=(v:unknown)=>Number(String(v??'').replace(',','.'))||0
const actualDose=(f:ScanFilling)=>scanNum(f.hasilKerja)>0?scanNum(f.jumlah)/scanNum(f.hasilKerja):0
function doseStats(unit:ScanUnit){const doses=unit.fillings.map(actualDose).filter(v=>v>0),kg=unit.fillings.reduce((s,f)=>s+scanNum(f.jumlah),0),ha=unit.fillings.reduce((s,f)=>s+scanNum(f.hasilKerja),0);return{avg:doses.length?doses.reduce((s,v)=>s+v,0)/doses.length:0,weighted:ha>0?kg/ha:0}}
const safeDate=(value:string)=>{const s=clean(value);let m=s.match(/(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);if(m)return m[1]+'-'+String(Number(m[2])).padStart(2,'0')+'-'+String(Number(m[3])).padStart(2,'0');m=s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})/);if(m)return m[3]+'-'+String(Number(m[2])).padStart(2,'0')+'-'+String(Number(m[1])).padStart(2,'0');return''}

function score(a:string,b:string){
  const x=norm(a),y=norm(b);if(!x||!y)return 0;if(x===y)return 1
  if(x.includes(y)||y.includes(x))return Math.min(x.length,y.length)/Math.max(x.length,y.length)+.15
  const grams=(s:string)=>{const out=new Set<string>();for(let i=0;i<s.length-1;i++)out.add(s.slice(i,i+2));return out}
  const ga=grams(x),gb=grams(y);let hit=0;ga.forEach(g=>{if(gb.has(g))hit++});return(2*hit)/(ga.size+gb.size||1)
}
function closest(value:string,options:string[],threshold=.58){let best='',bestScore=0;for(const option of options){const s=score(value,option);if(s>bestScore){bestScore=s;best=option}}return bestScore>=threshold?best:''}
function containsBest(text:string,options:string[],threshold=.72){
  const raw=clean(text),n=norm(raw);for(const option of options)if(n.includes(norm(option)))return option
  const words=raw.split(/\s+/)
  for(let size=Math.min(5,words.length);size>=1;size--)for(let i=0;i+size<=words.length;i++){const match=closest(words.slice(i,i+size).join(' '),options,threshold);if(match)return match}
  return''
}
function valueAfter(lines:string[],labels:string[]){
  for(let i=0;i<lines.length;i++){const line=lines[i],lower=line.toLowerCase();for(const label of labels){const idx=lower.indexOf(label.toLowerCase());if(idx<0)continue;const tail=line.slice(idx+label.length).replace(/^\s*[:=\-–|]+\s*/,'').trim();if(tail)return tail;if(lines[i+1]&&!/:$/.test(lines[i+1]))return lines[i+1].trim()}}
  return''
}
function blankFilling(index=1):ScanFilling{return{pengisianKe:index,dosis:'',statusHose:'Lancar',jenisPupuk:'',jumlah:'',hasilKerja:'',pemerataanPupuk:''}}
function parseFillingBlock(block:string,materials:string[],fallbackIndex:number):ScanFilling{
  const lines=block.split(/\n+/).map(clean).filter(Boolean),joined=lines.join(' ')
  const f=blankFilling(fallbackIndex)
  f.jenisPupuk=containsBest(joined,materials,.64)||clean(valueAfter(lines,['jenis pupuk','pupuk','material']))
  f.dosis=numberText(valueAfter(lines,['dosis target','dosis','kg/ha']))
  f.jumlah=numberText(valueAfter(lines,['jumlah pupuk','jumlah']))
  f.hasilKerja=numberText(valueAfter(lines,['hasil kerja','hasil','luas']))
  const hose=valueAfter(lines,['status hose','hose']);f.statusHose= /tidak\s*lancar|macet|tersumbat/i.test(hose||joined)?'Tidak Lancar':'Lancar'
  f.pemerataanPupuk=numberText(valueAfter(lines,['meratakan pupuk','perataan pupuk','perataan']))
  f.pengisianKe=Number(numberText(valueAfter(lines,['pengisian ke','pengisian','fill'])))||fallbackIndex
  return f
}
function splitFillingBlocks(block:string){
  const lines=block.split(/\n+/),starts:number[]=[];lines.forEach((line,i)=>{if(/\bpengisian\s*(?:ke)?\s*[-:#]?\s*\d+/i.test(line))starts.push(i)})
  if(!starts.length)return[block]
  return starts.map((start,i)=>lines.slice(start,starts[i+1]??lines.length).join('\n'))
}
function fallbackTableFillings(block:string,materials:string[]){
  const fills:ScanFilling[]=[]
  for(const line of block.split(/\n+/)){const material=containsBest(line,materials,.7);if(!material)continue;const nums=(line.match(/\d+(?:[.,]\d+)?/g)||[]).map(x=>x.replace(',','.'));if(nums.length<2)continue;const f=blankFilling(fills.length+1);if(Number(nums[0])<=20)f.pengisianKe=Number(nums.shift())||fills.length+1;f.jenisPupuk=material;f.dosis=nums[0]||'';f.jumlah=nums[1]||'';f.hasilKerja=nums[2]||'';f.pemerataanPupuk=nums[3]||'';f.statusHose=/tidak\s*lancar/i.test(line)?'Tidak Lancar':'Lancar';fills.push(f)}
  return fills
}
export function parseFertilizerReportText(rawText:string,master:MasterData,defaults:Props['defaults'],confidence=0):FertilizerScanResult{
  const raw=String(rawText||'').replace(/\r/g,''),lines=raw.split(/\n+/).map(clean).filter(Boolean)
  const plans=((master.plans||master.plan||[])as PlanMaster[]).filter(p=>{const c=String(p.category||p.keterangan||'').toLowerCase();return !c||/fertil|pupuk/.test(c)})
  const paddocks=uniq(plans.map(p=>p.paddock)),activities=uniq(plans.map(p=>p.activity)),types=uniq(plans.map(p=>p.type)),unitTypes=Object.keys(master.unitMap||{}),unitNumbers=uniq(Object.values(master.unitMap||{}).flat()),materials=uniq(((master.materials||[])as MaterialMaster[]).map(x=>x.material))
  const date=safeDate(valueAfter(lines,['tanggal','date']))||safeDate(raw)||defaults.date
  const shiftRaw=valueAfter(lines,['shift']),shift=numberText(shiftRaw)||containsBest(shiftRaw,master.shifts||[])||defaults.shift
  const mandorRaw=valueAfter(lines,['mandor','operator']),mandor=containsBest(mandorRaw,master.names||[],.6)||closest(mandorRaw,master.names||[],.52)||defaults.mandor
  const assistantRaw=valueAfter(lines,['asisten','assistant']),assistant=containsBest(assistantRaw,master.assistants||[],.6)||closest(assistantRaw,master.assistants||[],.52)||defaults.assistant
  const unitMarkers:number[]=[];lines.forEach((line,i)=>{if(/\b(?:no\.?\s*unit|nomor\s*unit|unit\s*(?:no|nomor))\b/i.test(line))unitMarkers.push(i)})
  let blocks=unitMarkers.length?unitMarkers.map((start,i)=>lines.slice(Math.max(0,start-2),unitMarkers[i+1]??lines.length).join('\n')):[raw]
  const seen=new Set<string>();blocks=blocks.filter(block=>{const k=norm(block.slice(0,250));if(seen.has(k))return false;seen.add(k);return true})
  const units:ScanUnit[]=blocks.map(block=>{
    const bLines=block.split(/\n+/).map(clean).filter(Boolean),joined=bLines.join(' ')
    let noUnit=containsBest(joined,unitNumbers,.68)||clean(valueAfter(bLines,['no. unit','no unit','nomor unit']));noUnit=noUnit.replace(/^[:=\-\s]+/,'').split(/\s{2,}|\||;/)[0].trim()
    let unit=containsBest(joined,unitTypes,.7)||clean(valueAfter(bLines,['jenis unit','unit type']))
    if(!unit&&noUnit)for(const [kind,numbers] of Object.entries(master.unitMap||{}))if(numbers.some(x=>norm(x)===norm(noUnit))){unit=kind;break}
    const paddock=containsBest(joined,paddocks,.68)||closest(valueAfter(bLines,['paddock','blok','block']),paddocks,.52)
    const activityOptions=paddock?uniq(plans.filter(p=>String(p.paddock)===paddock).map(p=>p.activity)):activities
    const activity=containsBest(joined,activityOptions,.68)||closest(valueAfter(bLines,['activity','kegiatan']),activityOptions,.52)
    const plan=plans.find(p=>String(p.paddock)===paddock&&String(p.activity)===activity)
    const type=clean(plan?.type)||containsBest(joined,types,.7)||clean(valueAfter(bLines,['type','tipe']))||'Fertilizer'
    let fillings=splitFillingBlocks(block).map((part,i)=>parseFillingBlock(part,materials,i+1))
    if(fillings.length===1&&!fillings[0].jenisPupuk&&!fillings[0].jumlah&&!fillings[0].hasilKerja){const table=fallbackTableFillings(block,materials);if(table.length)fillings=table}
    fillings=fillings.filter(f=>Boolean(f.jenisPupuk||f.dosis||f.jumlah||f.hasilKerja));if(!fillings.length)fillings=[blankFilling()]
    const issue=valueAfter(bLines,['issue','downtime','unit berhenti','kendala'])
    return{unit,noUnit,paddock,type,activity,catatan:issue?'[HASIL SCAN] '+issue:'',fillings}
  }).filter((u,i)=>i===0||Boolean(u.unit||u.noUnit||u.paddock||u.fillings.some(f=>f.jenisPupuk||f.jumlah||f.hasilKerja)))
  const finalUnits=units.length?units:[{unit:'',noUnit:'',paddock:'',type:'Fertilizer',activity:'',catatan:'',fillings:[blankFilling()]}],warnings:string[]=[]
  if(!date)warnings.push('Tanggal belum terbaca.');if(!mandor)warnings.push('Mandor belum terbaca.')
  finalUnits.forEach((u,i)=>{if(!u.unit)warnings.push('Unit '+(i+1)+': Jenis Unit belum terbaca.');if(!u.noUnit)warnings.push('Unit '+(i+1)+': No. Unit belum terbaca.');if(!u.paddock)warnings.push('Unit '+(i+1)+': Paddock belum cocok dengan master.');if(!u.activity)warnings.push('Unit '+(i+1)+': Activity belum cocok dengan Plan.');u.fillings.forEach((f,j)=>{if(!f.jenisPupuk)warnings.push('Unit '+(i+1)+' Pengisian '+(j+1)+': Jenis Pupuk belum terbaca.');if(!f.jumlah)warnings.push('Unit '+(i+1)+' Pengisian '+(j+1)+': Jumlah belum terbaca.');if(!f.hasilKerja)warnings.push('Unit '+(i+1)+' Pengisian '+(j+1)+': Hasil Kerja belum terbaca.')})})
  return{date,shift,mandor,assistant,units:finalUnits,rawText:raw,confidence:Math.max(0,Math.min(100,Math.round(confidence))),warnings}
}
async function preprocess(file:File){
  const url=URL.createObjectURL(file)
  try{
    const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error('Foto laporan tidak dapat dibaca.'));el.src=url})
    const scale=Math.min(1,2200/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale))
    const ctx=canvas.getContext('2d');if(!ctx)return file;ctx.drawImage(img,0,0,canvas.width,canvas.height);const image=ctx.getImageData(0,0,canvas.width,canvas.height),d=image.data
    for(let i=0;i<d.length;i+=4){const g=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=Math.max(0,Math.min(255,(g-128)*1.28+128));d[i]=d[i+1]=d[i+2]=v}ctx.putImageData(image,0,0)
    return await new Promise<Blob>(resolve=>canvas.toBlob(blob=>resolve(blob||file),'image/jpeg',.9))
  }finally{URL.revokeObjectURL(url)}
}

export default function FertilizerReportScanner({user,master,defaults,onApply,onClose}:Props){
  const[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[rawText,setRawText]=useState(''),[result,setResult]=useState<FertilizerScanResult|null>(null),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[stage,setStage]=useState('Pilih foto laporan'),[error,setError]=useState(''),[engine,setEngine]=useState<'gemini'|'tesseract'|''>('')
  const cameraRef=useRef<HTMLInputElement>(null),galleryRef=useRef<HTMLInputElement>(null),originalAiRef=useRef<FertilizerScanResult|null>(null)
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview])
  const unitTypes=useMemo(()=>Object.keys(master.unitMap||{}),[master.unitMap]),paddocks=useMemo(()=>uniq(((master.plans||master.plan||[])as PlanMaster[]).map(p=>p.paddock)),[master.plans,master.plan]),activities=useMemo(()=>uniq(((master.plans||master.plan||[])as PlanMaster[]).map(p=>p.activity)),[master.plans,master.plan]),materials=useMemo(()=>uniq(((master.materials||[])as MaterialMaster[]).map(x=>x.material)),[master.materials])
  function choose(next:File|null){if(!next)return;if(!next.type.startsWith('image/')){setError('Pilih file gambar laporan.');return}if(next.size>12_000_000){setError('Foto laporan maksimal 12 MB.');return}if(preview)URL.revokeObjectURL(preview);originalAiRef.current=null;setFile(next);setPreview(URL.createObjectURL(next));setRawText('');setResult(null);setError('');setStage('Foto siap diproses');setProgress(0);setEngine('')}
  async function runLocalOcr(sourceFile=file){if(!sourceFile)return;originalAiRef.current=null;let worker:Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>|null=null;setProgress(1);setStage('Fallback OCR lokal...');try{const source=await preprocess(sourceFile),mod=await import('tesseract.js');worker=await mod.createWorker(['eng','ind'],mod.OEM.LSTM_ONLY,{logger:m=>{if(typeof m.progress==='number')setProgress(Math.round(m.progress*100));if(m.status)setStage('OCR lokal: '+String(m.status).replaceAll('_',' '))}});await worker.setParameters({preserve_interword_spaces:'1'});const recognized=await worker.recognize(source),txt=String(recognized.data.text||'').trim(),parsed=parseFertilizerReportText(txt,master,defaults,Number(recognized.data.confidence||0));setRawText(txt);setResult(parsed);setEngine('tesseract');setStage('OCR lokal selesai - periksa hasil');setProgress(100)}finally{if(worker)await worker.terminate().catch(()=>{})}}
  async function run(){if(!file)return;setBusy(true);setError('');setProgress(8);setEngine('');setStage('Gemini AI membaca laporan...');try{const parsed=await scanFertilizerReportWithGemini(file,master,defaults,user,message=>setStage('Gemini AI: '+message));originalAiRef.current=cloneFertilizerScanResult(parsed);setRawText(parsed.rawText);setResult(parsed);setEngine('gemini');setProgress(100);setStage('Gemini AI selesai - periksa hasil sebelum diterapkan')}catch(aiError){const aiMessage=aiError instanceof Error?aiError.message:'Gemini AI gagal';console.warn('Gemini scan gagal; memakai OCR lokal.',aiError);const friendly=/high demand|\b500\b|\b503\b|\b429\b|temporar|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(aiMessage)?'Gemini sedang sibuk. Hasil sementara menggunakan OCR Lokal.':'Gemini belum dapat digunakan. Hasil sementara menggunakan OCR Lokal.';setError(friendly);try{await runLocalOcr(file)}catch(localError){setError(friendly+' OCR Lokal juga gagal: '+(localError instanceof Error?localError.message:'error tidak dikenal'));setStage('Scan gagal')}}finally{setBusy(false)}}
  function reparse(){setResult(parseFertilizerReportText(rawText,master,defaults,result?.confidence||0));setError('');setStage('Teks diparse ulang - periksa hasil')}
  function patchSession(key:'date'|'shift'|'mandor'|'assistant',value:string){if(result)setResult({...result,[key]:value})}
  function patchUnit(index:number,patch:Partial<ScanUnit>){if(result)setResult({...result,units:result.units.map((u,i)=>i===index?{...u,...patch}:u)})}
  function patchFill(ui:number,fi:number,patch:Partial<ScanFilling>){if(result)setResult({...result,units:result.units.map((u,i)=>i===ui?{...u,fillings:u.fillings.map((f,j)=>j===fi?{...f,...patch}:f)}:u)})}
  function addFill(ui:number){if(!result)return;const u=result.units[ui],last=u.fillings[u.fillings.length-1];patchUnit(ui,{fillings:[...u.fillings,{...blankFilling(u.fillings.length+1),dosis:last?.dosis||'',jenisPupuk:last?.jenisPupuk||'',statusHose:last?.statusHose||'Lancar'}]})}
  function addUnit(){if(result)setResult({...result,units:[...result.units,{unit:'',noUnit:'',paddock:'',type:'Fertilizer',activity:'',catatan:'',fillings:[blankFilling()]}]})}
  async function applyReviewed(mode:ScanApplyMode){
    if(!file||!result)return
    let learningFeedbackSaved=false,learningChangedFields=0
    if(engine==='gemini'&&originalAiRef.current){
      setBusy(true);setStage('Menyimpan Correction Learning...')
      try{
        const feedback=await saveFertilizerScanFeedback({user,original:originalAiRef.current,corrected:result,sourceFileName:file.name,applyMode:mode})
        learningFeedbackSaved=feedback.saved;learningChangedFields=feedback.changedFieldCount
      }finally{setBusy(false)}
    }
    onApply({...result,learningFeedbackSaved,learningChangedFields},mode,file)
  }
  const missing=result?.warnings.length||0
  return <div className="scan-backdrop" role="dialog" aria-modal="true"><div className="scan-dialog">
    <div className="scan-toolbar"><div><div className="eyebrow">FERTILIZER REPORT AI</div><h3>Scan Laporan ke Unit Card</h3><p>Gemini AI membaca foto sebagai metode utama. Koreksi Anda dipelajari saat hasil diterapkan dan dipakai sebagai contoh pada scan berikutnya. OCR lokal tersedia otomatis sebagai fallback.</p></div><button type="button" onClick={onClose} disabled={busy}>Tutup</button></div>
    <div className="scan-source-grid"><div className="scan-image-panel">{preview?<img src={preview} alt="Preview laporan"/>:<div className="scan-empty">Belum ada foto laporan.</div>}<input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={e=>choose(e.target.files?.[0]||null)}/><input ref={galleryRef} hidden type="file" accept="image/*" onChange={e=>choose(e.target.files?.[0]||null)}/><div className="row-actions"><button type="button" onClick={()=>cameraRef.current?.click()} disabled={busy}>Kamera</button><button type="button" onClick={()=>galleryRef.current?.click()} disabled={busy}>Galeri</button><button type="button" className="primary" onClick={()=>void run()} disabled={busy||!file}>{busy?'Memindai...':'Scan dengan AI'}</button><button type="button" onClick={()=>{if(!file)return;setBusy(true);setError('');void runLocalOcr(file).catch(e=>setError(e instanceof Error?e.message:'OCR lokal gagal')).finally(()=>setBusy(false))}} disabled={busy||!file}>OCR Lokal</button></div>{file&&<small>{file.name} - {(file.size/1024/1024).toFixed(1)} MB</small>}</div><div className="scan-progress-panel"><strong>{stage}</strong><div className="scan-progress"><span style={{width:String(progress)+'%'}}/></div><small>{progress}%</small>{error&&<div className="alert scan-error">{error}</div>}{result&&<div className="scan-confidence"><span>Mesin pembaca</span><strong>{engine==='gemini'?`Gemini AI${result?.sourceModel?' · '+result.sourceModel:''}${result?.sourceTemplateId?' · Template':''}`:engine==='tesseract'?'OCR Lokal':'-'}</strong><span>{engine==='gemini'?'Kelengkapan hasil':'Confidence OCR'}</span><strong>{result.confidence}%</strong><span>Field perlu review</span><strong>{missing}</strong>{engine==='gemini'&&<><span>Rute AI</span><strong>{result.routeAttempts?.length||1} percobaan · {result.routeTotalMs?`${(result.routeTotalMs/1000).toFixed(1)} dtk`:'-'}</strong></>}</div>}</div></div>
    {result&&<div className="scan-review"><section className="panel"><div className="eyebrow">REVIEW SESSION</div><h4>Data umum laporan</h4><div className="form-grid"><label>Tanggal<input type="date" value={result.date} onChange={e=>patchSession('date',e.target.value)}/></label><label>Shift<input value={result.shift} onChange={e=>patchSession('shift',e.target.value)}/></label><label>Mandor<input list="scan-mandor" value={result.mandor} onChange={e=>patchSession('mandor',e.target.value)}/><datalist id="scan-mandor">{(master.names||[]).map(x=><option key={x} value={x}/>)}</datalist></label><label>Asisten<input list="scan-assistant" value={result.assistant} onChange={e=>patchSession('assistant',e.target.value)}/><datalist id="scan-assistant">{(master.assistants||[]).map(x=><option key={x} value={x}/>)}</datalist></label></div></section>
    {result.warnings.length>0&&<section className="scan-warning-box"><strong>Perlu diperiksa sebelum diterapkan</strong><ul>{result.warnings.slice(0,18).map((w,i)=><li key={i}>{w}</li>)}</ul>{result.warnings.length>18&&<small>+{result.warnings.length-18} temuan lain.</small>}</section>}
    <div className="scan-unit-list">{result.units.map((u,ui)=><section className="unit-card scan-unit-card" key={ui}><div className="unit-card-head"><div><div className="eyebrow">HASIL SCAN UNIT {ui+1}</div><h4>{u.noUnit||'No. Unit belum terbaca'}</h4></div>{result.units.length>1&&<button type="button" className="danger" onClick={()=>setResult({...result,units:result.units.filter((_,i)=>i!==ui)})}>Hapus Unit</button>}</div><div className="form-grid"><label>Jenis Unit<input list="scan-unit-types" value={u.unit} onChange={e=>patchUnit(ui,{unit:e.target.value})}/></label><label>No. Unit<input value={u.noUnit} onChange={e=>patchUnit(ui,{noUnit:e.target.value})}/></label><label>Paddock<input list="scan-paddocks" value={u.paddock} onChange={e=>patchUnit(ui,{paddock:e.target.value})}/></label><label>Activity<input list="scan-activities" value={u.activity} onChange={e=>patchUnit(ui,{activity:e.target.value})}/></label><label>Type<input value={u.type} onChange={e=>patchUnit(ui,{type:e.target.value})}/></label><label>Catatan<input value={u.catatan} onChange={e=>patchUnit(ui,{catatan:e.target.value})}/></label></div><div className="scan-fill-head"><strong>Pengisian</strong><button type="button" onClick={()=>addFill(ui)}>+ Pengisian</button></div>{u.fillings.map((f,fi)=><div className="filling-row scan-filling-row" key={fi}><strong>#{fi+1}</strong><label>Pupuk<input list="scan-materials" value={f.jenisPupuk} onChange={e=>patchFill(ui,fi,{jenisPupuk:e.target.value})}/></label><label>Dosis Target<input inputMode="decimal" value={f.dosis} onChange={e=>patchFill(ui,fi,{dosis:e.target.value})}/></label><label>Hose<select value={f.statusHose} onChange={e=>patchFill(ui,fi,{statusHose:e.target.value})}><option>Lancar</option><option>Tidak Lancar</option></select></label><label>Jumlah Kg<input inputMode="decimal" value={f.jumlah} onChange={e=>patchFill(ui,fi,{jumlah:e.target.value})}/></label><label>Hasil Ha<input inputMode="decimal" value={f.hasilKerja} onChange={e=>patchFill(ui,fi,{hasilKerja:e.target.value})}/></label><label>Dosis Aktual<input readOnly value={actualDose(f)?actualDose(f).toFixed(2):''}/>{f.dosisAktualTertulis&&<small>Tertulis: {f.dosisAktualTertulis} Kg/Ha</small>}</label><label>Perataan<input value={f.pemerataanPupuk} onChange={e=>patchFill(ui,fi,{pemerataanPupuk:e.target.value})}/></label>{u.fillings.length>1&&<button type="button" className="danger" onClick={()=>patchUnit(ui,{fillings:u.fillings.filter((_,i)=>i!==fi).map((x,i)=>({...x,pengisianKe:i+1}))})}>x</button>}</div>)}<div className="scan-dose-summary"><span>Rata-rata Dosis Aktual<strong>{doseStats(u).avg?doseStats(u).avg.toFixed(2):'-'} Kg/Ha</strong></span><span>Rata-rata tertulis<strong>{u.rataRataDosisAktualTertulis?u.rataRataDosisAktualTertulis+' Kg/Ha':'-'}</strong></span><span>Dosis Total/Ha<strong>{doseStats(u).weighted?doseStats(u).weighted.toFixed(2):'-'} Kg/Ha</strong></span></div></section>)}</div>
    <datalist id="scan-unit-types">{unitTypes.map(x=><option key={x} value={x}/>)}</datalist><datalist id="scan-paddocks">{paddocks.map(x=><option key={x} value={x}/>)}</datalist><datalist id="scan-activities">{activities.map(x=><option key={x} value={x}/>)}</datalist><datalist id="scan-materials">{materials.map(x=><option key={x} value={x}/>)}</datalist>
    <button type="button" onClick={addUnit}>+ Tambah Unit Manual</button>
    {engine==='gemini'&&result.routeAttempts&&result.routeAttempts.length>0&&<details className="scan-raw"><summary>Riwayat rute Gemini</summary><div className="scan-route-log">{result.routeAttempts.map((attempt,i)=><div key={attempt.model+'-'+i}><strong>{attempt.model}{attempt.via==='template'?' · Template':''}</strong><span>{attempt.ok?'Berhasil':attempt.errorKind==='busy'?'Sibuk / quota':attempt.errorKind==='unavailable'?'Tidak tersedia':attempt.errorKind==='server'?'Server error':attempt.errorKind==='network'?'Jaringan':'Gagal'}</span><span>{(attempt.latencyMs/1000).toFixed(1)} dtk</span>{!attempt.ok&&attempt.errorDetail&&<small>{attempt.errorDetail}</small>}</div>)}</div></details>}
    <details className="scan-raw"><summary>Teks OCR mentah / koreksi parser</summary><textarea rows={12} value={rawText} onChange={e=>setRawText(e.target.value)}/><div className="row-actions"><button type="button" onClick={reparse}>Parse Ulang Teks</button></div></details>
    <div className="scan-actions"><div><strong>Belum disimpan.</strong><span>{engine==='gemini'?'Koreksi akan masuk Correction Learning saat hasil diterapkan.':'Hasil scan hanya mengisi form dan masih dapat dikoreksi.'}</span></div><div className="row-actions"><button type="button" disabled={busy} onClick={()=>void applyReviewed('append')}>Tambahkan ke Form</button><button type="button" className="primary" disabled={busy} onClick={()=>void applyReviewed('replace')}>{busy?'Menyimpan Learning...':'Ganti Form dengan Hasil Scan'}</button></div></div></div>}
  </div></div>
}
