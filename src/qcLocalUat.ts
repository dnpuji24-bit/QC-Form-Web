export const qcLocalUat = import.meta.env.VITE_QC_LOCAL_UAT === 'true'

if (qcLocalUat && (!import.meta.env.DEV ||
  !['localhost', '127.0.0.1'].includes(window.location.hostname) ||
  import.meta.env.VITE_QC_NATIVE_PORTAL !== 'true')) {
  throw Error('QC_LOCAL_UAT_REQUIRES_LOOPBACK_NATIVE_DEV')
}

export async function localUatPhotos() {
  if (!qcLocalUat) throw Error('QC_LOCAL_UAT_DISABLED')
  return caches.open('qc-local-uat-photos-v1')
}

export function localUatPhotoKey(uid: string, recordId: string, photoId: string) {
  return new URL('/__qc-uat/photo/' + [uid, recordId, photoId].map(encodeURIComponent).join('/'), window.location.origin).href
}
