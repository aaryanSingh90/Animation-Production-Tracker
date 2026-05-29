import { createRoot } from 'react-dom/client'
import './index.css'
import { initSentry } from './lib/sentry'
import { ErrorBoundary } from './components/ErrorBoundary'
import App from './App.tsx'

// Init Sentry before mounting so it catches errors during the first render.
// No-op when VITE_SENTRY_DSN is empty (local dev).
initSentry()

// BUG-01: wrap the app in an error boundary so an uncaught render error shows a
// recoverable fallback instead of a blank white screen.
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
