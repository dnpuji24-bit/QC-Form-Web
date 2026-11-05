import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { qcApi } from './api'
import type { User } from './types'

const TOKEN_KEY='qc_token', USER_KEY='qc_user'

function readUser():User|null{try{return JSON.parse(sessionStorage.getItem(USER_KEY)||'null') as User|null}catch{return null}}

function AccountSettingsPanel(){
  const token=sessionStorage.getItem(TOKEN_KEY)||''
  const user=readUser()
  const[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(!token||!user)return setMessage('Sesi login tidak tersedia. Silakan login ulang.')
    const form=event.currentTarget,data=new FormData(form)
    const currentPassword=String(data.get('currentPassword')||'')
    const newFullName=String(data.get('newFullName')||'').trim()
    const newUsername=String(data.get('newUsername')||'').trim().toLowerCase()
    const newPassword=String(data.get('newPassword')||'')
    const confirmPassword=String(data.get('confirmPassword')||'')
    const fullNameChanged=Boolean(newFullName&&newFullName!==user.fullName)
    const usernameChanged=Boolean(newUsername&&newUsername!==user.username)
    if(!fullNameChanged&&!usernameChanged&&!newPassword)return setMessage('Tidak ada perubahan yang diajukan. Isi nama baru, username baru, atau password baru.')
    if(newFullName&&newFullName.length<3)return setMessage('Nama lengkap baru minimal 3 karakter.')
    if(newPassword&&newPassword!==confirmPassword)return setMessage('Konfirmasi password baru tidak sama.')
    setBusy(true);setMessage('')
    try{
      const result=await qcApi.requestAccountChange(token,{currentPassword,newFullName:fullNameChanged?newFullName:undefined,newUsername:usernameChanged?newUsername:undefined,newPassword:newPassword||undefined})
      setMessage(result.message||'Permintaan perubahan akun dikirim dan menunggu persetujuan Owner.')
      form.reset()
    }catch(error){setMessage(error instanceof Error?error.message:'Permintaan perubahan akun gagal.')}
    finally{setBusy(false)}
  }
  return <div className="panel account-change-panel">
    <div className="section-head"><div><div className="eyebrow">AKUN SAYA</div><h3>Profil & Keamanan Akun</h3></div><span className="badge">Persetujuan Owner</span></div>
    <p className="muted">Pilih bagian yang ingin diubah. Perubahan baru berlaku setelah Owner menyetujui dan user login ulang. Password baru tidak disimpan sebagai teks biasa.</p>
    <form className="account-change-form" onSubmit={e=>void submit(e)}>
      <div className="account-change-grid">
        <div className="account-change-card">
          <div className="account-card-icon" aria-hidden="true">Aa</div>
          <div><span className="account-card-kicker">IDENTITAS</span><h4>Ganti Nama</h4><p>Nama saat ini: <strong>{user?.fullName||'-'}</strong></p></div>
          <label>Nama lengkap baru<input name="newFullName" minLength={3} placeholder="Kosongkan jika tidak diubah" autoComplete="name"/></label>
        </div>
        <div className="account-change-card">
          <div className="account-card-icon" aria-hidden="true">@</div>
          <div><span className="account-card-kicker">LOGIN</span><h4>Ganti Username</h4><p>Username saat ini: <strong>@{user?.username||'-'}</strong></p></div>
          <label>Username baru<input name="newUsername" minLength={3} placeholder="Kosongkan jika tidak diubah" autoComplete="off"/></label>
        </div>
        <div className="account-change-card">
          <div className="account-card-icon" aria-hidden="true">••</div>
          <div><span className="account-card-kicker">KEAMANAN</span><h4>Ganti Password</h4><p>Gunakan minimal 8 karakter dan pastikan konfirmasi sama.</p></div>
          <label>Password baru<input name="newPassword" type="password" minLength={8} placeholder="Kosongkan jika tidak diubah" autoComplete="new-password"/></label>
          <label>Ulangi password baru<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password"/></label>
        </div>
      </div>
      <div className="account-verify-card">
        <div><span className="account-card-kicker">VERIFIKASI</span><h4>Konfirmasi dengan password saat ini</h4><p className="muted">Diperlukan untuk memastikan permintaan benar-benar berasal dari pemilik akun.</p></div>
        <label>Password saat ini<input name="currentPassword" type="password" minLength={4} required autoComplete="current-password"/></label>
      </div>
      {message&&<div className="alert">{message}</div>}
      <button className="primary account-submit" disabled={busy}>{busy?'Mengirim…':'Ajukan Perubahan ke Owner'}</button>
    </form>
  </div>
}

function enhancePasswordInputs(){
  document.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input=>{
    if(input.dataset.visibilityReady==='1')return
    input.dataset.visibilityReady='1'
    const button=document.createElement('button')
    button.type='button';button.className='password-visibility-toggle';button.textContent='Lihat';button.setAttribute('aria-label','Tampilkan password')
    button.addEventListener('click',()=>{
      const showing=input.type==='text';input.type=showing?'password':'text';button.textContent=showing?'Lihat':'Sembunyikan';button.setAttribute('aria-label',showing?'Tampilkan password':'Sembunyikan password')
    })
    input.insertAdjacentElement('afterend',button)
    input.parentElement?.classList.add('password-label')
  })
}

const META=/^(Tanggal|Shift|Status Simpan|Status|Mandor|Asisten|Paddock|Activity|Type|Unit|No\. Unit|Record ID)$/i
const WORK=/^(Jam Mulai|Jam Selesai|Variety|Luas Aktual|Dropper|Nozzle|Droplet Size|Height|Row Spacing|Speed|Deskripsi|Working|Total HOLD|Working Efektif)$/i
const MATERIAL=/(Pesticide|Adjuvant|Dosis|Estimasi|Aktual)/i
const ENV=/(Water|Wind|Temperature|Humidity|Delta T|Weather)/i

type SprayPlacement={group:string;order:number;title?:string;hidden?:boolean;span?:boolean}
const SPRAY_REPORT_LAYOUT:Record<string,SprayPlacement>={
  'Tanggal':{group:'summary',order:0,hidden:true},
  'Paddock':{group:'summary',order:1},
  'Variety':{group:'summary',order:2},
  'Luas Aktual':{group:'summary',order:3,span:true},

  'Mandor':{group:'meta',order:10,title:'Identitas & Operasional'},
  'Asisten':{group:'meta',order:11,title:'Identitas & Operasional'},
  'Type':{group:'meta',order:12,title:'Identitas & Operasional'},
  'Activity':{group:'meta',order:13,title:'Identitas & Operasional'},
  'Unit':{group:'meta',order:14,title:'Identitas & Operasional'},
  'No. Unit':{group:'meta',order:15,title:'Identitas & Operasional'},

  'Jam Mulai':{group:'work',order:20,title:'Parameter Pekerjaan'},
  'Jam Selesai':{group:'work',order:21,title:'Parameter Pekerjaan'},
  'Dropper':{group:'work',order:22,title:'Parameter Pekerjaan'},
  'Nozzle':{group:'work',order:23,title:'Parameter Pekerjaan'},
  'Droplet Size':{group:'work',order:24,title:'Parameter Pekerjaan'},
  'Height':{group:'work',order:25,title:'Parameter Pekerjaan'},
  'Row Spacing':{group:'work',order:26,title:'Parameter Pekerjaan'},
  'Speed':{group:'work',order:27,title:'Parameter Pekerjaan'},
  'Working':{group:'work',order:28,title:'Parameter Pekerjaan'},
  'Total HOLD':{group:'work',order:29,title:'Parameter Pekerjaan'},
  'Working Efektif':{group:'work',order:30,title:'Parameter Pekerjaan',span:true},

  'Adjuvant':{group:'material',order:40,title:'Bahan Kimia & Penggunaan'},
  'Dosis Adjuvant':{group:'material',order:41,title:'Bahan Kimia & Penggunaan'},
  'Estimasi Adjuvant':{group:'material',order:42,title:'Bahan Kimia & Penggunaan'},
  'Aktual Adjuvant':{group:'material',order:43,title:'Bahan Kimia & Penggunaan'},
  'Pesticide 1':{group:'material',order:44,title:'Bahan Kimia & Penggunaan'},
  'Dosis Pesticide 1':{group:'material',order:45,title:'Bahan Kimia & Penggunaan'},
  'Estimasi Pesticide 1':{group:'material',order:46,title:'Bahan Kimia & Penggunaan'},
  'Aktual Pesticide 1':{group:'material',order:47,title:'Bahan Kimia & Penggunaan'},
  'Pesticide 2':{group:'material',order:48,title:'Bahan Kimia & Penggunaan'},
  'Dosis Pesticide 2':{group:'material',order:49,title:'Bahan Kimia & Penggunaan'},
  'Estimasi Pesticide 2':{group:'material',order:50,title:'Bahan Kimia & Penggunaan'},
  'Aktual Pesticide 2':{group:'material',order:51,title:'Bahan Kimia & Penggunaan'},
  'Pesticide 3':{group:'material',order:52,title:'Bahan Kimia & Penggunaan'},
  'Dosis Pesticide 3':{group:'material',order:53,title:'Bahan Kimia & Penggunaan'},
  'Estimasi Pesticide 3':{group:'material',order:54,title:'Bahan Kimia & Penggunaan'},
  'Aktual Pesticide 3':{group:'material',order:55,title:'Bahan Kimia & Penggunaan'},
  'Pesticide 4':{group:'material',order:56,title:'Bahan Kimia & Penggunaan'},
  'Dosis Pesticide 4':{group:'material',order:57,title:'Bahan Kimia & Penggunaan'},
  'Estimasi Pesticide 4':{group:'material',order:58,title:'Bahan Kimia & Penggunaan'},
  'Aktual Pesticide 4':{group:'material',order:59,title:'Bahan Kimia & Penggunaan'},

  'Water Rate':{group:'environment',order:60,title:'Kondisi Lapangan & Air'},
  'Actual Usage Air':{group:'environment',order:61,title:'Kondisi Lapangan & Air'},
  'Wind Speed':{group:'environment',order:62,title:'Kondisi Lapangan & Air'},
  'Water Quality':{group:'environment',order:63,title:'Kondisi Lapangan & Air'},
  'Humidity':{group:'environment',order:64,title:'Kondisi Lapangan & Air'},
  'Temperature':{group:'environment',order:65,title:'Kondisi Lapangan & Air'},
  'Weather':{group:'environment',order:66,title:'Kondisi Lapangan & Air'},
  'Delta T':{group:'environment',order:67,title:'Kondisi Lapangan & Air'},

  'Catatan':{group:'other',order:70,span:true},
  'Shift':{group:'extra',order:80,title:'Informasi Tambahan'},
  'Status Simpan':{group:'extra',order:81,title:'Informasi Tambahan'},
  'Record ID':{group:'extra',order:82,title:'Informasi Tambahan'},
  'Deskripsi':{group:'extra',order:83,title:'Informasi Tambahan'}
}

function enhanceSprayReport(sheet:HTMLElement,cells:HTMLElement[],title:HTMLElement|null){
  const subtitle=title?.querySelector<HTMLElement>('p')
  if(subtitle){
    const dateOnly=(subtitle.textContent||'').split('•')[0].trim()
    if(dateOnly)subtitle.textContent=dateOnly
  }

  cells.forEach(cell=>{
    const label=cell.querySelector('span')?.textContent?.trim()||''
    const placement=SPRAY_REPORT_LAYOUT[label]||{group:'extra',order:90,title:'Informasi Tambahan'}
    cell.classList.remove('report-group-start')
    delete cell.dataset.groupTitle
    cell.dataset.reportGroup=placement.group
    cell.style.order=String(placement.order)
    cell.style.display=placement.hidden?'none':''
    cell.style.gridColumn=placement.span?'1 / -1':''
  })

  const visible=cells.filter(cell=>cell.style.display!=='none').sort((a,b)=>Number(a.style.order||0)-Number(b.style.order||0))
  const headed=new Set<string>()
  visible.forEach(cell=>{
    const label=cell.querySelector('span')?.textContent?.trim()||''
    const placement=SPRAY_REPORT_LAYOUT[label]||{group:'extra',order:90,title:'Informasi Tambahan'}
    if(placement.title&&!headed.has(placement.group)){
      headed.add(placement.group)
      cell.classList.add('report-group-start')
      cell.dataset.groupTitle=placement.title
    }
  })
}

function enhanceReport(){
  document.querySelectorAll<HTMLElement>('#record-report-sheet').forEach(sheet=>{
    // Penting: report enhancement harus idempotent. Tanpa guard ini, perubahan textContent
    // memicu MutationObserver berulang dan dapat membuat Chrome Page Unresponsive.
    if(sheet.dataset.reportEnhanced==='1')return
    sheet.dataset.reportEnhanced='1'
    const title=sheet.querySelector<HTMLElement>('.report-title')
    const badge=title?.querySelector<HTMLElement>(':scope > strong')?.textContent||''
    const isFert=/fert/i.test(badge)
    const small=title?.querySelector<HTMLElement>('small'),h2=title?.querySelector<HTMLElement>('h2')
    if(small&&small.textContent!=='Upkeep & Manuring')small.textContent='Upkeep & Manuring'
    const reportHeading=isFert?'Form QC Fertilizer':'Form QC Spray'
    if(h2&&h2.textContent!==reportHeading)h2.textContent=reportHeading
    const toolbar=sheet.closest('.report-dialog')?.querySelector<HTMLElement>('.report-toolbar > strong')
    const toolbarText=isFert?'Preview Form QC Fertilizer':'Preview Form QC Spray'
    if(toolbar&&toolbar.textContent!==toolbarText)toolbar.textContent=toolbarText
    const cells=Array.from(sheet.querySelectorAll<HTMLElement>('.report-grid > div'))

    if(!isFert){
      enhanceSprayReport(sheet,cells,title)
      return
    }

    const seen=new Set<string>()
    cells.forEach(cell=>{
      const label=cell.querySelector('span')?.textContent?.trim()||''
      let group='other',order=40,titleText='Informasi Tambahan'
      if(META.test(label)){group='meta';order=10;titleText='Identitas & Operasional'}
      else if(WORK.test(label)){group='work';order=20;titleText='Parameter Pekerjaan'}
      else if(MATERIAL.test(label)){group='material';order=30;titleText='Material & Dosis'}
      else if(ENV.test(label)){group='environment';order=35;titleText='Kondisi Lapangan & Air'}
      cell.dataset.reportGroup=group;cell.style.order=String(order)
      if(!seen.has(group)){seen.add(group);cell.classList.add('report-group-start');cell.dataset.groupTitle=titleText}
    })
  })
}

export default function UiEnhancers(){
  const[settingsHost,setSettingsHost]=useState<HTMLElement|null>(null)
  useEffect(()=>{
    let mountedHost:HTMLElement|null=null
    let frame=0
    const scan=()=>{
      frame=0
      enhancePasswordInputs();enhanceReport()
      const section=Array.from(document.querySelectorAll<HTMLElement>('main.content > section')).find(x=>/pengaturan/i.test(x.querySelector('h2')?.textContent||''))
      if(section){
        let host=section.querySelector<HTMLElement>('#account-settings-extension')
        if(!host){host=document.createElement('div');host.id='account-settings-extension';const firstPanel=section.querySelector('.panel');if(firstPanel)firstPanel.insertAdjacentElement('beforebegin',host);else section.appendChild(host)}
        mountedHost=host;setSettingsHost(prev=>prev===host?prev:host)
      }else setSettingsHost(prev=>prev?null:prev)
    }
    const scheduleScan=()=>{if(!frame)frame=requestAnimationFrame(scan)}
    scan();const observer=new MutationObserver(scheduleScan);observer.observe(document.body,{childList:true,subtree:true});return()=>{observer.disconnect();if(frame)cancelAnimationFrame(frame);if(mountedHost?.parentElement)mountedHost.remove()}
  },[])
  return settingsHost?createPortal(<AccountSettingsPanel/>,settingsHost):null
}
