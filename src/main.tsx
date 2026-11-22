import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
