import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import NetworkStatus from './NetworkStatus'
import SaveStatusPopup from './SaveStatusPopup'
import './styles.css'
import './theme.css'
import './network.css'
import './field-ui.css'
import './save-status.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/react/sw.js', { scope: '/react/' }).catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <NetworkStatus />
    <SaveStatusPopup />
  </React.StrictMode>,
)
