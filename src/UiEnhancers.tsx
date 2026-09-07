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
    const form=event.currentTarget,data=new FormData(form),currentPassword=String(data.get('currentPassword')||''),newUsername=String(data.get('newUsername')||'').trim().toLowerCase(),newPassword=String(data.get('newPassword')||''),confirmPassword=String(data.get('confirmPassword')||'')
    if(!newUsername&&!newPassword)return setMessage('Isi username baru, password baru, atau keduanya.')
    if(newPassword&&newPassword!==confirmPassword)return setMessage('Konfirmasi password baru tidak sama.')
    setBusy(true);setMessage('')
    try{
      const result=await qcApi.requestAccountChange(token,{currentPassword,newUsername:newUsername||undefined,newPassword:newPassword||undefined})
      setMessage(result.message||'Permintaan perubahan akun dikirim dan menunggu persetujuan Owner.')
      form.reset()
    }catch(error){setMessage(error instanceof Error?error.message:'Permintaan perubahan akun gagal.')}
    finally{setBusy(false)}
  }
  return <div className="panel account-change-panel">
    <div className="section-head"><div><div className="eyebrow">AKUN SAYA</div><h3>Perubahan Username / Password</h3></div><span className="badge">Persetujuan Owner</span></div>
    <p className="muted">Perubahan tidak langsung berlaku. Setelah Owner menyetujui, logout lalu login kembali. Password baru tidak disimpan sebagai teks biasa.</p>
    <form className="form-grid" onSubmit={e=>void submit(e)}>
      <label>Username saat ini<input value={user?.username||''} readOnly/></label>
      <label>Username baru (opsional)<input name="newUsername" minLength={3} placeholder="Kosongkan jika tidak diubah" autoComplete="off"/></label>
      <label>Password baru (opsional)<input name="newPassword" type="password" minLength={8} placeholder="Minimal 8 karakter" autoComplete="new-password"/></label>
      <label>Ulangi password baru<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password"/></label>
      <label className="span-2">Password saat ini — untuk verifikasi<input name="currentPassword" type="password" minLength={4} required autoComplete="current-password"/></label>
      <div className="span-2">{message&&<div className="alert">{message}</div>}<button className="primary" disabled={busy}>{busy?'Mengirim…':'Ajukan Perubahan ke Owner'}</button></div>
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
    const title=sheet.querySelector<HTMLElement>('.report-title')
    const badge=title?.querySelector<HTMLElement>(':scope > strong')?.textContent||''
    const isFert=/fert/i.test(badge)
    const small=title?.querySelector<HTMLElement>('small'),h2=title?.querySelector<HTMLElement>('h2')
    if(small)small.textContent='Upkeep & Manuring'
    if(h2)h2.textContent=isFert?'Form QC Fertilizer':'Form QC Spray'
    const toolbar=sheet.closest('.report-dialog')?.querySelector<HTMLElement>('.report-toolbar > strong')
    if(toolbar)toolbar.textContent=isFert?'Preview Form QC Fertilizer':'Preview Form QC Spray'
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
    const scan=()=>{
      enhancePasswordInputs();enhanceReport()
      const section=Array.from(document.querySelectorAll<HTMLElement>('main.content > section')).find(x=>/pengaturan/i.test(x.querySelector('h2')?.textContent||''))
      if(section){
        let host=section.querySelector<HTMLElement>('#account-settings-extension')
        if(!host){host=document.createElement('div');host.id='account-settings-extension';const firstPanel=section.querySelector('.panel');firstPanel?.insertAdjacentElement('beforebegin',host)||section.appendChild(host)}
        mountedHost=host;if(settingsHost!==host)setSettingsHost(host)
      }else if(settingsHost)setSettingsHost(null)
    }
    scan();const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});return()=>{observer.disconnect();if(mountedHost?.parentElement)mountedHost.remove()}
  },[settingsHost])
  return settingsHost?createPortal(<AccountSettingsPanel/>,settingsHost):null
}
