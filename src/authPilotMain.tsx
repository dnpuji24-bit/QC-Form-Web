// Standalone pilot: no operational App, PortalRouter, legacy transport or service worker.
import React from 'react'
import ReactDOM from 'react-dom/client'
import FirebaseAuthPilot from './FirebaseAuthPilot'
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><FirebaseAuthPilot/></React.StrictMode>)
