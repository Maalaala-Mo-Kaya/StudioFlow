import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { isStaleBuildError, reloadForNewVersion } from './utils/staleBuild'

// A tab left open across an update runs the old app; when it can't load one of its lazy files,
// reload once to get the new version (see utils/staleBuild.ts).
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  reloadForNewVersion()
})
window.addEventListener('unhandledrejection', (event) => {
  if (isStaleBuildError(event.reason)) reloadForNewVersion()
})

// The kiosk build (client port) and the staff build (staff port) share this entry. VITE_SURFACE is
// a build-time constant, so each build drops the other branch and the kiosk bundle carries no
// staff station code.
const loadApp = import.meta.env.VITE_SURFACE === 'kiosk' ? import('./KioskApp.tsx') : import('./App.tsx')

void loadApp.then(({ default: App }) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
