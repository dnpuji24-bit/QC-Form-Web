import { useState } from 'react'

type Props = {
  label?: string
  onFile: (file?: File) => void
  onRemove?: () => void
  onError?: (message: string) => void
  selectedName?: string
  existing?: boolean
  compact?: boolean
}

const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

async function canDecodeImage(file: File): Promise<boolean> {
  if (!file || file.size <= 0) return false
  if (file.type && !SUPPORTED_TYPES.has(file.type)) return false
  try {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(file)
      bitmap.close?.()
      return true
    }
    const url = URL.createObjectURL(file)
    try {
      await new Promise<void>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('decode failed'))
        image.src = url
      })
      return true
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return false
  }
}

export default function PhotoPicker({ label = 'Foto QC', onFile, onRemove, onError, selectedName, existing, compact }: Props) {
  const [checking, setChecking] = useState(false)
  const hasPhoto = Boolean(selectedName || existing)

  async function select(file?: File, input?: HTMLInputElement) {
    if (!file) return
    if (file.size > 6_000_000) {
      if (input) input.value = ''
      onError?.('Foto asli maksimal 6 MB.')
      return
    }
    setChecking(true)
    const valid = await canDecodeImage(file)
    setChecking(false)
    if (!valid) {
      if (input) input.value = ''
      onFile(undefined)
      onError?.('Gambar tidak dapat dibaca oleh browser. Pilih foto JPG, PNG, atau WebP lain.')
      return
    }
    onFile(file)
  }

  function remove() {
    onFile(undefined)
    onRemove?.()
  }

  return <div className={`photo-picker ${compact ? 'compact' : ''}`}>
    {!compact && <strong>{label}</strong>}
    <div className="photo-choice-row">
      <label className="photo-choice camera-choice">📷 Kamera<input hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => void select(e.target.files?.[0], e.currentTarget)} /></label>
      <label className="photo-choice">🖼️ Galeri<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void select(e.target.files?.[0], e.currentTarget)} /></label>
      {hasPhoto && <button type="button" className="danger photo-remove" onClick={remove}>Hapus foto</button>}
    </div>
    {checking ? <small>Memeriksa gambar…</small> : selectedName ? <small>Dipilih: {selectedName}</small> : existing ? <small>Foto lama tersedia. Tekan Hapus foto untuk menghapusnya dari record saat disimpan.</small> : null}
  </div>
}
