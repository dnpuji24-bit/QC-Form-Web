import NativePortalSession from './NativePortalSession'
import {nativePortalEnabled} from './qcNativePortalConfig'
import React from 'react'
import { App as AntApp, ConfigProvider } from 'antd'
import { portalTheme } from './portalTheme'

const NativeRegistrationPilot = React.lazy(() => import('./NativeRegistrationPilot'))
const showNativeRegistrationPilot = !nativePortalEnabled && import.meta.env.VITE_QC_HOSTED_UAT !== 'true' && import.meta.env.VITE_QC_NATIVE_REGISTRATION === 'true' && new URLSearchParams(window.location.search).get('qc-native-registration-pilot') === '1'
const FirebaseAuthPilot = React.lazy(() => import('./FirebaseAuthPilot'))
const showFirebaseAuthPilot = !nativePortalEnabled && import.meta.env.VITE_QC_FIREBASE_AUTH_PILOT === 'true' && new URLSearchParams(window.location.search).get('qc-firebase-auth-pilot') === '1'
const OperationalQcPilot = React.lazy(() => import('./OperationalQcPilot'))
const showOperationalPilot = !nativePortalEnabled && import.meta.env.VITE_QC_OPERATIONAL_PILOT === 'true' && new URLSearchParams(window.location.search).get('qc-operational-pilot') === '1'
const PhotoUploadTest = React.lazy(() => import('./SupabasePhotoTest'))
const showPhotoUploadTest = !nativePortalEnabled && import.meta.env.VITE_ENABLE_SUPABASE_PHOTO_TEST === 'true' && new URLSearchParams(window.location.search).get('supabase-photo-test') === '1'
import ReactDOM from 'react-dom/client'
const App = React.lazy(() => import('./App'))
const NetworkStatus = React.lazy(() => import('./NetworkStatus'))
import SaveStatusPopup from './SaveStatusPopup'
const UiEnhancers = React.lazy(() => import('./UiEnhancers'))
const PortalRouter = React.lazy(() => import('./PortalRouter'))
const NativeSidebarPortal = React.lazy(() => import('./NativeSidebarPortal'))
import ScrollToTopButton from './ScrollToTopButton'
import './styles.css'
import './theme.css'
import './network.css'
import './field-ui.css'
import './save-status.css'
import './ui-enhancers.css'
import './antd-portal.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/react/sw.js', { scope: '/react/' }).then((registration) => registration.update()).catch(() => {})
  })
}

function PortalWorkspaces() {
  // Keep QC drafts and the existing subscription alive when returning to the menu.
  const [qcOpened, openQc] = React.useReducer(() => true, !nativePortalEnabled)
  if(nativePortalEnabled)return <NativeSidebarPortal/>
  return <>
    {qcOpened && <App />}
    <PortalRouter onOpenQc={openQc} />
  </>
}

const portalContent = <React.Suspense fallback={<p role="status">Memuat portal…</p>}>
  <PortalWorkspaces />
  <NetworkStatus />
  <SaveStatusPopup />
  <UiEnhancers />
  <ScrollToTopButton />
</React.Suspense>

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {showNativeRegistrationPilot ? (
      <React.Suspense fallback={<p>Memuat pilot registrasi…</p>}><NativeRegistrationPilot /></React.Suspense>
    ) : showFirebaseAuthPilot ? (
      <React.Suspense fallback={<p>Memuat pilot autentikasi…</p>}><FirebaseAuthPilot /></React.Suspense>
    ) : showOperationalPilot ? (
      <React.Suspense fallback={<p>Memuat pilot QC…</p>}><OperationalQcPilot /></React.Suspense>
    ) : showPhotoUploadTest ? (
      <React.Suspense fallback={<p>Memuat halaman uji foto…</p>}><PhotoUploadTest /></React.Suspense>
    ) : (
      <ConfigProvider theme={portalTheme}>
        <AntApp component={false}>
          {nativePortalEnabled ? <NativePortalSession>{portalContent}</NativePortalSession> : portalContent}
        </AntApp>
      </ConfigProvider>
    )}
  </React.StrictMode>,
)
