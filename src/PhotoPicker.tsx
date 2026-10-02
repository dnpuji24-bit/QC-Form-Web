import { useEffect, useRef, useState } from 'react'

type Props = {
  label?: string
  onFile: (file?: File) => void
  onRemove?: () => void
  selectedName?: string
  existing?: boolean
  removed?: boolean
  compact?: boolean
  previewSource?: string
}

async function imageCanDecode(file:File):Promise<boolean>{
  if(!file.type.startsWith('image/')||file.size<=0)return false
  try{
    if(typeof createImageBitmap==='function'){
      const bitmap=await createImageBitmap(file)
      const valid=bitmap.width>0&&bitmap.height>0
      bitmap.close?.()
      return valid
    }
    const url=URL.createObjectURL(file)
    try{return await new Promise<boolean>(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth>0&&image.naturalHeight>0);image.onerror=()=>resolve(false);image.src=url})}
    finally{URL.revokeObjectURL(url)}
  }catch{return false}
}

function normalizedPreviewSource(source=''){
  if(!source)return''
  if(source.startsWith('data:image/')||source.startsWith('blob:'))return source
  const match=source.match(/\/d\/([a-zA-Z0-9_-]+)/)||source.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return match?`https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`:source
}

export default function PhotoPicker({ label = 'Foto QC', onFile, onRemove, selectedName, existing, removed, compact, previewSource }: Props) {
  const[error,setError]=useState(''),[localPreview,setLocalPreview]=useState('')
  const objectUrlRef=useRef('')
  function clearLocalPreview(){if(objectUrlRef.current){URL.revokeObjectURL(objectUrlRef.current);objectUrlRef.current=''}setLocalPreview('')}
  useEffect(()=>()=>{if(objectUrlRef.current)URL.revokeObjectURL(objectUrlRef.current)},[])
  useEffect(()=>{if(!selectedName&&localPreview)clearLocalPreview()},[selectedName])
  async function choose(file?:File,input?:HTMLInputElement){
    if(input)input.value=''
    if(!file)return
    setError('')
    if(file.size>6_000_000){setError('Foto maksimal 6 MB. Pilih foto yang lebih kecil.');return}
    if(!(await imageCanDecode(file))){setError('Foto tidak dapat dibaca. Hapus/pilih ulang foto dari Kamera atau Galeri.');return}
    clearLocalPreview()
    const url=URL.createObjectURL(file);objectUrlRef.current=url;setLocalPreview(url)
    onFile(file)
  }
  function remove(){setError('');clearLocalPreview();onFile(undefined);onRemove?.()}
  const canRemove=Boolean(selectedName||existing)
  const preview=removed?'':localPreview||normalizedPreviewSource(previewSource)
  return <div className={`photo-picker ${compact ? 'compact' : ''}`}>
    {!compact && <strong>{label}</strong>}
    <div className="photo-choice-row">
      <label className="photo-choice camera-choice">📷 Kamera<input hidden type="file" accept="image/*" capture="environment" onChange={e=>void choose(e.target.files?.[0],e.currentTarget)} /></label>
      <label className="photo-choice">🖼️ Galeri<input hidden type="file" accept="image/*" onChange={e=>void choose(e.target.files?.[0],e.currentTarget)} /></label>
      {canRemove&&<button type="button" className="photo-choice danger" onClick={remove}>🗑 Hapus foto</button>}
    </div>
    {preview&&<div style={{marginTop:10,padding:8,border:'1px solid #dbe3ef',borderRadius:12,background:'#f8fafc'}}><img src={preview} alt={label} style={{display:'block',width:'100%',maxWidth:compact?240:520,maxHeight:compact?180:360,objectFit:'contain',borderRadius:9,margin:'0 auto'}}/><small style={{display:'block',marginTop:6,textAlign:'center'}}>Preview foto yang dipilih</small></div>}
    {error?<small className="danger-text">{error}</small>:removed?<small>Foto lama akan dihapus saat data disimpan.</small>:selectedName?<small>Dipilih: {selectedName}</small>:existing?<small>Foto lama tetap digunakan jika tidak diganti.</small>:null}
  </div>
}
