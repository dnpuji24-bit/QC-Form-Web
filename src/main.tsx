import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import NetworkStatus from './NetworkStatus'
import './styles.css'
import './theme.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/react/sw.js', { scope: '/react/' }).catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <NetworkStatus />
  </React.StrictMode>,
)
