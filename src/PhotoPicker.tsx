type Props = {
  label?: string
  onFile: (file?: File) => void
  selectedName?: string
  existing?: boolean
  compact?: boolean
}

export default function PhotoPicker({ label = 'Foto QC', onFile, selectedName, existing, compact }: Props) {
  return <div className={`photo-picker ${compact ? 'compact' : ''}`}>
    {!compact && <strong>{label}</strong>}
    <div className="photo-choice-row">
      <label className="photo-choice camera-choice">📷 Kamera<input hidden type="file" accept="image/*" capture="environment" onChange={(e) => onFile(e.target.files?.[0])} /></label>
      <label className="photo-choice">🖼️ Galeri<input hidden type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} /></label>
    </div>
    {selectedName ? <small>Dipilih: {selectedName}</small> : existing ? <small>Foto lama tetap digunakan jika tidak diganti.</small> : null}
  </div>
}
