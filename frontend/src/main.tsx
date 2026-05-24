import { createRoot } from 'react-dom/client'
import './index.css'
import { initSentry } from './lib/sentry'
import App from './App.tsx'

// Init Sentry before mounting so it catches errors during the first render.
// No-op when VITE_SENTRY_DSN is empty (local dev).
initSentry()

createRoot(document.getElementById('root')!).render(<App />)
