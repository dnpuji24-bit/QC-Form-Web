import { useEffect, useState } from 'react'
import { firebaseAuth } from './firebase'
import type { QcRecord } from './types'
import { qcLocalUat, localUatPhotos, localUatPhotoKey } from './qcLocalUat'
type Slot={slot:string;photoId:string;contentType:string;size:number;sha256:string}
type State={key:string;status:'loading'|'ready'|'error';photos:Record<string,string>;message:string}
const enabled=import.meta.env.VITE_QC_PHOTO_SIGN_PREVIEW==='true'
const endpoint='https://mcfwnstdfhhtcbksgrlj.supabase.co/functions/v1/qc-photo-sign-operational'
const origin='https://mcfwnstdfhhtcbksgrlj.supabase.co'
export function useOperationalReportPhotos(record:QcRecord){
  const manifest=record.operationalPhotoManifest
  const operational=record.id.startsWith('qc-v2-')
  const key=record.id+':'+String(record.clientRevision||'')
  const [state,setState]=useState<State>({key:'',status:'loading',photos:{},message:''})
  useEffect(()=>{
    if(!operational)return
    const controller=new AbortController(),urls:string[]=[]
    let cancelled=false
    const initialUid=firebaseAuth?.currentUser?.uid
    setState({key,status:'loading',photos:{},message:''})
    async function load(){
      try{
        if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw Error('Manifest foto belum tersedia.')
        const slots=Object.entries(manifest).map(([slot,value])=>{
          const p=value as Partial<Slot>|null
          if(!p||! /^(main|scan|hold_[A-Za-z0-9_-]+)$/.test(slot)||typeof p.photoId!=='string'||! /^[a-f0-9]{24}_[a-f0-9]{64}$/.test(p.photoId)||!['image/jpeg','image/png','image/webp'].includes(String(p.contentType))||typeof p.size!=='number'||!Number.isInteger(p.size)||p.size<1||p.size>2097152||typeof p.sha256!=='string'||! /^[a-f0-9]{64}$/.test(p.sha256))throw Error('Referensi foto tidak valid.')
          return {...p,slot} as Slot
        })
        if(slots.length>100)throw Error('Jumlah foto melebihi batas laporan.')
        if(slots.length&&!enabled&&!qcLocalUat)throw Error('Pembacaan foto private belum diaktifkan.')
        const user=firebaseAuth?.currentUser
        if(!user)throw Error('Login diperlukan.')
        const photos:Record<string,string>={}
        for(const p of slots){
          if(cancelled||firebaseAuth?.currentUser?.uid!==user.uid)throw Error('Sesi berubah.')
          const downloaded=qcLocalUat
            ? await (await localUatPhotos()).match(localUatPhotoKey(user.uid,record.id,p.photoId))
            : await downloadPhoto(user,record.id,p.photoId,controller.signal)
          if(!downloaded?.ok)throw Error('Unduhan foto gagal.')
          const blob=await downloaded.blob()
          if(blob.size!==p.size||blob.type!==p.contentType)throw Error('Ukuran atau tipe foto tidak sesuai.')
          const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('')
          if(digest!==p.sha256)throw Error('Integritas foto tidak sesuai.')
          if(cancelled||firebaseAuth?.currentUser?.uid!==user.uid)throw Error('Sesi berubah.')
          const local=URL.createObjectURL(blob);urls.push(local);photos[p.slot]=local
        }
        if(!cancelled)setState({key,status:'ready',photos,message:''})
      }catch(e){
        urls.splice(0).forEach(url=>URL.revokeObjectURL(url))
        if(!cancelled)setState({key,status:'error',photos:{},message:e instanceof Error?e.message:'Foto gagal dimuat.'})
      }
    }
    async function downloadPhoto(user:{getIdToken():Promise<string>},recordId:string,photoId:string,signal:AbortSignal){
      const token=await user.getIdToken()
      const signed=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({recordId,photoId}),cache:'no-store',signal})
      if(!signed.ok)throw Error('Foto belum dapat dibuka (HTTP '+signed.status+').')
      const response=await signed.json()
      const url=new URL(response.signedUrl)
      if(url.origin!==origin||!url.pathname.startsWith('/storage/v1/object/sign/qc-photos/')||response.expiresIn!==60)throw Error('URL foto tidak valid.')
      return fetch(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal})
    }
    void load()
    const unsubscribe=firebaseAuth?.onAuthStateChanged(user=>{if(!user||user.uid!==initialUid){cancelled=true;controller.abort();urls.splice(0).forEach(url=>URL.revokeObjectURL(url));setState({key,status:'error',photos:{},message:'Sesi berakhir.'})}})
    return()=>{cancelled=true;controller.abort();unsubscribe?.();urls.splice(0).forEach(url=>URL.revokeObjectURL(url))}
  },[key,manifest,operational,record.id])
  return operational?(state.key===key?state:{key,status:'loading' as const,photos:{},message:''}):{key,status:'ready' as const,photos:{ } as Record<string,string>,message:''}
}
