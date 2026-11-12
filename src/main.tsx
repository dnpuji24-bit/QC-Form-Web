import React from 'react'

const OperationalQcPilot = React.lazy(() => import('./OperationalQcPilot'))
const showOperationalPilot = import.meta.env.VITE_QC_OPERATIONAL_PILOT === 'true' && new URLSearchParams(window.location.search).get('qc-operational-pilot') === '1'
const PhotoUploadTest = React.lazy(() => import('./SupabasePhotoTest'))
const showPhotoUploadTest = import.meta.env.VITE_ENABLE_SUPABASE_PHOTO_TEST === 'true' && new URLSearchParams(window.location.search).get('supabase-photo-test') === '1'
import ReactDOM from 'react-dom/client'
import App from './App'
import NetworkStatus from './NetworkStatus'
import SaveStatusPopup from './SaveStatusPopup'
import UiEnhancers from './UiEnhancers'
import PortalRouter from './PortalRouter'
import ScrollToTopButton from './ScrollToTopButton'
import './styles.css'
import './theme.css'
import './network.css'
import './field-ui.css'
import './save-status.css'
import './ui-enhancers.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/react/sw.js', { scope: '/react/' }).then((registration) => registration.update()).catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {showOperationalPilot ? (
      <React.Suspense fallback={<p>Memuat pilot QC…</p>}><OperationalQcPilot /></React.Suspense>
    ) : showPhotoUploadTest ? (
      <React.Suspense fallback={<p>Memuat halaman uji foto…</p>}><PhotoUploadTest /></React.Suspense>
    ) : (
      <>
        <App />
        <PortalRouter />
        <NetworkStatus />
        <SaveStatusPopup />
        <UiEnhancers />
        <ScrollToTopButton />
      </>
    )}
  </React.StrictMode>,
)
