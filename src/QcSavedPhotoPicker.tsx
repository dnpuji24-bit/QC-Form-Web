import type { ComponentProps } from 'react'
import type { QcRecord } from './types'
import PhotoPicker from './PhotoPicker'
import { useOperationalReportPhotos } from './useOperationalReportPhotos'

type PickerProps = ComponentProps<typeof PhotoPicker>
type Props = PickerProps & { record?: QcRecord; slot: string }

function VerifiedPhotoPicker({ record, slot, ...picker }: PickerProps & { record: QcRecord; slot: string }) {
  const photos = useOperationalReportPhotos(record, slot)
  const manifest = record.operationalPhotoManifest
  const saved = !!(manifest && typeof manifest === 'object' && !Array.isArray(manifest) &&
    Object.prototype.hasOwnProperty.call(manifest, slot))
  return <>
    <PhotoPicker
      {...picker}
      existing={saved || picker.existing}
      previewSource={photos.photos[slot] || picker.previewSource}
    />
    {saved && !picker.removed && photos.status === 'loading' && <small>Memuat foto QC tersimpan…</small>}
    {saved && !picker.removed && photos.status === 'error' && <small className="danger-text">Foto tersimpan belum bisa ditampilkan. Jangan hapus foto jika hanya ingin mengubah data lain.</small>}
  </>
}

/** Existing Supabase photos are shown without copying their data into a new save. */
export default function QcSavedPhotoPicker({ record, slot, ...picker }: Props) {
  if (record?.id.startsWith('qc-v2-')) {
    return <VerifiedPhotoPicker record={record} slot={slot} {...picker} />
  }
  return <PhotoPicker {...picker} />
}
