import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { TemaProvider } from './context/TemaContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TemaProvider>
      <App />
    </TemaProvider>
  </StrictMode>,
)

// PWA: registra o service worker (só no build de produção)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  })
}
