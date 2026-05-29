import { Component, type ErrorInfo, type ReactNode } from 'react'
import { captureError } from '../lib/sentry'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * BUG-01: Top-level React error boundary.
 *
 * Without this, any uncaught render error unmounts the whole tree and leaves the
 * user staring at a blank white page with no way to recover except a manual
 * reload they may not think to do. This catches the error, reports it to Sentry
 * (no-op when no DSN is configured), and shows a recoverable fallback.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Report to Sentry (no-op locally) and the console so the stack isn't lost.
    captureError(error, { componentStack: info.componentStack })
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] uncaught render error', error, info.componentStack)
  }

  private handleReload = () => {
    // A full reload re-runs session restore + data init from a clean slate,
    // which clears whatever transient state triggered the crash.
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0b0f19] text-slate-100 px-6">
          <div className="max-w-md w-full text-center space-y-5">
            <div className="text-5xl">⚠️</div>
            <h1 className="text-xl font-black uppercase tracking-wide">Something went wrong</h1>
            <p className="text-sm text-slate-400">
              The app hit an unexpected error and couldn't continue. Reloading usually fixes it.
              If it keeps happening, let your studio admin know.
            </p>
            <button
              onClick={this.handleReload}
              className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
