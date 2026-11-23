import { useMemo, useState } from 'react'
import {
  calculationsForNozzle,DROPLET_LABELS,manualPressureCalculation,findNozzleSpec,
  type NozzleSpec,type DropletClass,
} from './nozzlePerformance'

type ResourceNozzle={id:string;name:string;active:boolean}
type Props={resources:ResourceNozzle[];specs:NozzleSpec[]}
type PressureMode='AUTO'|'MANUAL'
const CLASSES:(DropletClass|'ANY')[]=['ANY','UC','XC','VC','C','M','F','VF']
const format=(n:number,digits=2)=>Number.isFinite(n)?new Intl.NumberFormat('id-ID',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(n):'—'
const nameFor=(code:DropletClass|null)=>code?DROPLET_LABELS[code]:'Belum terverifikasi'

export default function NozzleCalculatorPanel({resources,specs}:Props){
  const[nozzle,setNozzle]=useState('')
  const[waterRate,setWaterRate]=useState('400')
  const[spacingCm,setSpacingCm]=useState('50.8')
  const[nozzleCount,setNozzleCount]=useState('54')
  const[pressureMode,setPressureMode]=useState<PressureMode>('AUTO')
  const[manualBar,setManualBar]=useState('')
  const[targetDrop,setTargetDrop]=useState<DropletClass|'ANY'>('XC')
  const[minSpeed,setMinSpeed]=useState('4')
  const[maxSpeed,setMaxSpeed]=useState('12')
  const[preferredSpeed,setPreferredSpeed]=useState('7')

  const activeResources=useMemo(()=>resources.filter(row=>row.active&&row.name.trim().toLowerCase()!=='none'),[resources])
  const availableMaster=activeResources.filter(row=>Boolean(findNozzleSpec(row.name,specs)))
  const chosenName=nozzle||availableMaster[0]?.name||specs[0]?.code||''
  const spec=findNozzleSpec(chosenName,specs)
  const minBar=spec?.points[0]?.bar??NaN,maxBar=spec?.points[spec.points.length-1]?.bar??NaN
  const rate=Number(waterRate),spacing=Number(spacingCm)/100,count=Number(nozzleCount),
    min=Number(minSpeed),max=Number(maxSpeed),preferred=Number(preferredSpeed),
    bar=manualBar.trim()===''?NaN:Number(manualBar)
  const valid=Number.isFinite(rate)&&rate>0&&Number.isFinite(spacing)&&spacing>0&&Number.isFinite(count)&&count>=1&&Number.isInteger(count)&&Number.isFinite(min)&&min>0&&Number.isFinite(max)&&max>=min&&Number.isFinite(preferred)&&preferred>0
  const rows=useMemo(()=>spec&&valid?calculationsForNozzle(spec,rate,spacing,min,max):[],[spec,valid,rate,spacing,min,max])
  const selectedRows=rows.filter(row=>targetDrop==='ANY'||row.droplet===targetDrop)
  const viable=selectedRows.filter(row=>row.inSpeedRange)
  const bestCandidate=(viable.length?viable:selectedRows).slice().sort((a,b)=>Math.abs(a.speedKmh-preferred)-Math.abs(b.speedKmh-preferred)||a.bar-b.bar)[0]
  const pressureWarning=pressureMode==='MANUAL'&&(!Number.isFinite(bar)||bar<minBar||bar>maxBar)
  const manualRow=useMemo(()=>pressureMode==='MANUAL'&&spec&&valid?manualPressureCalculation(spec,bar,rate,spacing,min,max):null,[pressureMode,spec,valid,bar,rate,spacing,min,max])
  const selected=pressureMode==='MANUAL'?manualRow:bestCandidate
  const dropletMismatch=pressureMode==='MANUAL'&&targetDrop!=='ANY'&&selected?.droplet&&selected.droplet!==targetDrop
  const totalFlow=selected?selected.flow*count:NaN
  const boomWidth=spacing*count
  const areaPerHour=selected?selected.speedKmh*boomWidth/10:NaN
  const validSource=spec!==undefined
  function selectMaster(name:string){setNozzle(name)}

  return <div className="panel nozzle-calc-panel">
    <div className="section-head"><div><div className="eyebrow">KALKULATOR TRAKTOR SPRAY · MASTER DATA NOZZLE</div><h3>Debit, Droplet & Kecepatan Traktor</h3><p className="muted">Pilih nozzle, target water rate dan kelas droplet. Sistem mencari tekanan yang sesuai dan menghitung kecepatan untuk memenuhi L/ha.</p></div><span className="badge">{specs.reduce((total,item)=>total+item.points.length,0)} titik spesifikasi terunggah</span></div>
    <div className="nozzle-calc-grid">
      <label>Nozzle digunakan
        <select value={chosenName} onChange={event=>selectMaster(event.target.value)}>
          {availableMaster.length>0&&<optgroup label="Master Nozzle aktif yang memiliki spesifikasi">{availableMaster.map(row=><option key={row.id} value={row.name}>{row.name}</option>)}</optgroup>}
          <optgroup label="Spesifikasi hasil upload">{specs.map(item=><option key={item.code} value={item.code}>{item.code} · {item.color}</option>)}</optgroup>
        </select>
        <small>Hanya nozzle yang punya data upload tervalidasi yang dapat dihitung. Tambahkan data melalui Master Activity → Master Resource → Nozzle.</small>
      </label>
      <label>Water rate (L/ha)
        <input type="number" min="1" step="any" value={waterRate} onChange={e=>setWaterRate(e.target.value)}/>
      </label>
      <label>Target kategori droplet
        <select value={targetDrop} onChange={e=>setTargetDrop(e.target.value as DropletClass|'ANY')}>
          {CLASSES.map(item=><option key={item} value={item}>{item==='ANY'?'Semua — cek droplet yang dihasilkan':item+' — '+DROPLET_LABELS[item]}</option>)}
        </select>
        <small>Hasil berupa kategori pabrikan, bukan ukuran VMD numerik (µm).</small>
      </label>
      <label>Jarak nozzle (cm)
        <input type="number" min="1" step="0.1" value={spacingCm} onChange={e=>setSpacingCm(e.target.value)}/>
      </label>
      <label>Jumlah nozzle aktif
        <input type="number" min="1" step="1" value={nozzleCount} onChange={e=>setNozzleCount(e.target.value)}/>
      </label>
      <label>Kecepatan operasional min (km/jam)
        <input type="number" min=".1" step=".1" value={minSpeed} onChange={e=>setMinSpeed(e.target.value)}/>
      </label>
      <label>Kecepatan operasional maks (km/jam)
        <input type="number" min=".1" step=".1" value={maxSpeed} onChange={e=>setMaxSpeed(e.target.value)}/>
      </label>
      <label>Kecepatan preferensi (km/jam)
        <input type="number" min=".1" step=".1" value={preferredSpeed} onChange={e=>setPreferredSpeed(e.target.value)}/>
      </label>
    </div>
    <div className="nozzle-pressure-control">
      <div className="nozzle-pressure-head"><strong>Pengaturan tekanan</strong><div className="row-actions"><button type="button" className={pressureMode==='AUTO'?'active':''} aria-pressed={pressureMode==='AUTO'} onClick={()=>setPressureMode('AUTO')}>Otomatis</button><button type="button" className={pressureMode==='MANUAL'?'active':''} aria-pressed={pressureMode==='MANUAL'} onClick={()=>setPressureMode('MANUAL')}>Manual (bar)</button></div></div>
      {pressureMode==='MANUAL'?<label>Tekanan aktual yang digunakan (bar) — wajib diisi
        <input type="number" min={minBar} max={maxBar} step="any" placeholder="Contoh: 4" value={manualBar} onChange={e=>setManualBar(e.target.value)}/>
        <small>Rentang tabel terunggah: {Number.isFinite(minBar)?format(minBar,2):'—'}–{Number.isFinite(maxBar)?format(maxBar,2):'—'} bar. Tekanan selain titik tabel hanya menghasilkan estimasi debit, bukan kategori droplet.</small>
      </label>:<p className="muted">Otomatis mencari tekanan dari tabel upload yang sesuai kategori droplet dan rentang kecepatan. Prioritas mendekati kecepatan preferensi.</p>}
    </div>

    {!valid&&<div className="alert danger">Isi water rate, jarak nozzle, jumlah nozzle, dan rentang kecepatan dengan angka valid. Maksimum harus lebih besar atau sama dengan minimum.</div>}
    {!validSource&&<div className="alert danger">Belum ada data spesifikasi untuk nozzle <strong>{chosenName||'yang dipilih'}</strong>. Upload ketentuan nozzle di Master Resource → Nozzle terlebih dahulu. Kalkulator tidak menggunakan tabel bawaan.</div>}
    {validSource&&pressureWarning&&<div className="alert danger">Masukkan tekanan manual di dalam rentang data yang diunggah ({format(minBar,2)}–{format(maxBar,2)} bar).</div>}
    {validSource&&valid&&pressureMode==='AUTO'&&!selectedRows.length&&<div className="alert danger">Kategori {targetDrop} tidak tersedia pada titik tekanan yang diunggah untuk nozzle {spec?.code}. Coba kategori lain atau nozzle lain.</div>}
    {validSource&&valid&&pressureMode==='AUTO'&&selectedRows.length&&!viable.length&&<div className="alert">Tidak ada kombinasi tekanan + droplet yang masuk dalam rentang kecepatan {format(min,1)}–{format(max,1)} km/jam. Kombinasi terdekat tetap ditampilkan sebagai referensi, bukan rekomendasi operasional.</div>}
    {dropletMismatch&&<div className="alert">Di tekanan {format(selected?.bar||0,1)} bar, tabel menunjukkan droplet <strong>{selected?.droplet}</strong>, bukan target <strong>{targetDrop}</strong>. Ubah tekanan atau pilih otomatis.</div>}
    {manualRow&&manualRow.source==='estimasi debit'&&<div className="alert">Debit/kecepatan berikut merupakan <strong>estimasi berdasarkan Q ∝ √P</strong>. Kategori droplet pada tekanan {format(bar,2)} bar tidak tersedia di tabel, sehingga tidak dapat dipastikan dari data ini.</div>}

    {selected&&valid&&<div className="nozzle-result">
      <div className="nozzle-result-label">{pressureMode==='AUTO'?'KOMBINASI TABEL PALING SESUAI':'HASIL TEKANAN MANUAL'}</div>
      <div className="nozzle-result-stats">
        <div><span>Tekanan</span><strong>{format(selected.bar,2)} <small>bar</small></strong></div>
        <div><span>Droplet</span><strong>{selected.droplet||'—'} <small>{nameFor(selected.droplet)}</small></strong></div>
        <div><span>Debit/nozzle</span><strong>{format(selected.flow,3)} <small>L/menit</small></strong></div>
        <div><span>Kecepatan dibutuhkan</span><strong>{format(selected.speedKmh,2)} <small>km/jam</small></strong></div>
        <div><span>Lebar efektif boom</span><strong>{format(boomWidth,2)} <small>m</small></strong></div>
        <div><span>Total debit ({count} nozzle)</span><strong>{format(totalFlow,2)} <small>L/menit</small></strong></div>
        <div><span>Kapasitas teoritis</span><strong>{format(areaPerHour,2)} <small>ha/jam</small></strong></div>
        <div><span>Kesesuaian kecepatan</span><strong className={selected.inSpeedRange?'nozzle-okay':'nozzle-warning'}>{selected.inSpeedRange?'Dalam rentang':'Di luar rentang'}</strong></div>
      </div>
      <small className="nozzle-result-formula">Kecepatan = (600 × debit per nozzle L/menit) ÷ (water rate L/ha × jarak nozzle meter). Hasil teoritis tanpa overlap, slip, refill atau efisiensi lapangan.</small>
    </div>}

    {validSource&&valid&&rows.length>0&&<div className="nozzle-candidate-table">
      <div className="section-head"><div><h4>Alternatif tekanan pada nozzle {spec?.code}</h4><p className="muted">Seluruh titik tekanan sesuai file upload; kecepatan dihitung dari water rate dan spacing yang Anda masukkan.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Tekanan</th><th>Debit/nozzle</th><th>Droplet</th><th>Kecepatan</th><th>Rentang</th><th>Pilih tekanan</th></tr></thead><tbody>
        {rows.map(row=><tr key={row.bar} className={selected?.source==='tabel'&&selected.bar===row.bar?'nozzle-row-chosen':''}><td>{format(row.bar,1)} bar</td><td>{format(row.flow,2)} L/min</td><td><strong>{row.droplet}</strong><small>{nameFor(row.droplet)}</small></td><td>{format(row.speedKmh,2)} km/jam</td><td>{row.inSpeedRange?'Sesuai':'Di luar'}</td><td><button type="button" onClick={()=>{setPressureMode('MANUAL');setManualBar(String(row.bar))}}>Gunakan</button></td></tr>)}
      </tbody></table></div>
    </div>}

    <div className="nozzle-source-caption">Sumber: file spesifikasi nozzle yang diunggah ke Firestore{spec?.sourceFileName?' ('+spec.sourceFileName+')':''}{spec?.sourceSheet?' · sheet '+spec.sourceSheet:''}. Klasifikasi droplet tidak sama dengan diameter VMD numerik. Kecepatan traktor menentukan water rate, bukan droplet. Validasi debit, tekanan boom dan label bahan sebelum aplikasi.</div>
  </div>
}
