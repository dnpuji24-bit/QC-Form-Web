import { useEffect, useState } from 'react'
import { qcApi } from './api'
import MasterPaddockImportPanel from './MasterPaddockImportPanel'
import type { User } from './types'

type Props={token:string}

export default function MasterPaddockOwnerPanel({token}:Props){
  const[user,setUser]=useState<User|null>(null)
  const[message,setMessage]=useState('')
  useEffect(()=>{
    let active=true
    void qcApi.me(token).then(result=>{
      if(!active)return
      if(result.user)setUser(result.user)
      else setMessage('Profil user tidak tersedia untuk Import Master Paddock.')
    }).catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Profil user gagal dimuat.')})
    return()=>{active=false}
  },[token])
  if(message)return <section className="panel"><div className="alert">{message}</div></section>
  if(!user)return <section className="panel"><p className="muted">Memuat izin Import Master Paddock…</p></section>
  return <MasterPaddockImportPanel user={user}/>
}
