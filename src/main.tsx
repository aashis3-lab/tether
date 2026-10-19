import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { installRipple } from './lib/ripple'
import { unlockAudio } from './lib/sound'
import { initTheme } from './lib/theme'
import './index.css'

registerSW({ immediate: true })
initTheme()
installRipple()

// Browsers only allow sound after a user gesture. Unlock the shared
// AudioContext on the first tap so incoming alerts can play later.
window.addEventListener('pointerdown', unlockAudio, { once: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
