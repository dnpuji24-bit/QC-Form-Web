import { useState } from 'react'

type Props = {
  label?: string
  onFile: (file?: File) => void
  onRemove?: () => void
  selectedName?: string
  existing?: boolean
  removed?: boolean
  compact?: boolean
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

export default function PhotoPicker({ label = 'Foto QC', onFile, onRemove, selectedName, existing, removed, compact }: Props) {
  const[error,setError]=useState('')
  async function choose(file?:File,input?:HTMLInputElement){
    if(input)input.value=''
    if(!file)return
    setError('')
    if(file.size>6_000_000){setError('Foto maksimal 6 MB. Pilih foto yang lebih kecil.');return}
    if(!(await imageCanDecode(file))){setError('Foto tidak dapat dibaca. Hapus/pilih ulang foto dari Kamera atau Galeri.');return}
    onFile(file)
  }
  function remove(){setError('');onFile(undefined);onRemove?.()}
  const canRemove=Boolean(selectedName||existing)
  return <div className={`photo-picker ${compact ? 'compact' : ''}`}>
    {!compact && <strong>{label}</strong>}
    <div className="photo-choice-row">
      <label className="photo-choice camera-choice">📷 Kamera<input hidden type="file" accept="image/*" capture="environment" onChange={e=>void choose(e.target.files?.[0],e.currentTarget)} /></label>
      <label className="photo-choice">🖼️ Galeri<input hidden type="file" accept="image/*" onChange={e=>void choose(e.target.files?.[0],e.currentTarget)} /></label>
      {canRemove&&<button type="button" className="photo-choice danger" onClick={remove}>🗑 Hapus foto</button>}
    </div>
    {error?<small className="danger-text">{error}</small>:removed?<small>Foto lama akan dihapus saat data disimpan.</small>:selectedName?<small>Dipilih: {selectedName}</small>:existing?<small>Foto lama tetap digunakan jika tidak diganti.</small>:null}
  </div>
}
