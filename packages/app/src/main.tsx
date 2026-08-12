import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './app.css'

const raiz = document.getElementById('raiz')
if (!raiz) throw new Error('Falta el elemento #raiz en index.html')

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Solo en producción: en desarrollo un service worker sirve archivos viejos y
// hace perder tardes enteras.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  })
}
