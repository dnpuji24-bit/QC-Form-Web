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
    const seen=new Set<string>()
    cells.forEach(cell=>{
      const label=cell.querySelector('span')?.textContent?.trim()||''
      let group='other',order=40,titleText='Informasi Tambahan'
      if(META.test(label)){group='meta';order=10;titleText='Identitas & Operasional'}
      else if(WORK.test(label)){group='work';order=20;titleText='Parameter Pekerjaan'}
      else if(MATERIAL.test(label)){group='material';order=30;titleText=isFert?'Material & Dosis':'Bahan Kimia & Penggunaan'}
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
