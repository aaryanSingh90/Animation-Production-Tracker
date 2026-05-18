import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      message: ""
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "Unexpected application error"
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[UI ErrorBoundary]", {
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">{this.state.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
