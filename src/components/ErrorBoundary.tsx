import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected application error occurred.',
    };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-[100dvh] bg-[#070a10] text-stone-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#0c111b] border border-amber-400/35 p-6 text-center shadow-2xl space-y-4">
            <h1 className="font-display text-xl font-bold text-amber-300">
              Vault Session Interrupted
            </h1>
            <p className="text-xs text-stone-300 leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm transition-colors cursor-pointer"
            >
              Reload Table
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
