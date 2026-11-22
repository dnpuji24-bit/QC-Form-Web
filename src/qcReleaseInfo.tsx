/** Read-only build identity. The SHA is baked into the exact JS bundle being viewed. */
const version = String(import.meta.env.VITE_QC_APP_VERSION || 'dev').trim()
const rawCommit = String(import.meta.env.VITE_QC_BUILD_SHA || '').trim()
const sourceBranch = String(import.meta.env.VITE_QC_SOURCE_BRANCH || 'unknown').trim()

export const qcRelease = {
  version,
  commit: /^[0-9a-f]{40}$/i.test(rawCommit) ? rawCommit : 'unknown',
  shortCommit: /^[0-9a-f]{40}$/i.test(rawCommit) ? rawCommit.slice(0, 8) : 'unknown',
  sourceBranch,
}

export function getQcHostingChannel(hostname: string): { label: string; productionData: boolean } {
  const host = String(hostname || '').trim().toLowerCase()
  if (/^form-qc-unm--react-test(?:-|\.)/.test(host)) {
    return { label: 'PREVIEW react-test', productionData: true }
  }
  if (host === 'form-qc-unm.web.app' || host === 'form-qc-unm.firebaseapp.com') {
    return { label: 'LIVE produksi', productionData: true }
  }
  if (host === 'localhost' || host === '127.0.0.1') {
    return { label: 'LOCAL', productionData: false }
  }
  return { label: 'HOSTING LAIN', productionData: false }
}

export function QcReleaseInfo() {
  const channel = getQcHostingChannel(typeof window === 'undefined' ? '' : window.location.hostname)
  return <section className="panel form-stack" data-testid="qc-release-info" data-qc-build-commit={qcRelease.commit}>
    <h3>Versi Aplikasi QC</h3>
    <p><strong>QC Web v{qcRelease.version}</strong> · commit <code>{qcRelease.shortCommit}</code></p>
    <p>Kanal: <strong>{channel.label}</strong> · Branch sumber: <code>{qcRelease.sourceBranch}</code></p>
    {channel.label.startsWith('PREVIEW') && <p className="alert">Kanal preview menggunakan Firebase dan Supabase produksi yang sama. Hindari membuat atau menghapus data saat memeriksa tampilan.</p>}
    <p className="muted">Bandingkan commit di halaman ini dengan halaman LIVE sebelum menguji perubahan UI atau PDF.</p>
    <p><a href="/react/release.json" target="_blank" rel="noopener noreferrer">Periksa identitas versi Hosting</a></p>
  </section>
}
