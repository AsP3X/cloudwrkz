// Human: Class error boundary that logs failures, swaps in a friendly fallback UI, and offers a reload path to recover client-only bad state.
// Agent: IMPLEMENTS getDerivedStateFromError, componentDidCatch with log.error; RENDERS props.fallback or default red alert UI; CLEARS state on reload click.
import { Component, type ReactNode } from "react";
import { log } from "@/lib/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    log.error("Error caught by boundary", { error: error.message, componentStack: errorInfo.componentStack });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
          <div className="bg-red-50 dark:bg-red-900/20 border-b-2 border-red-200 dark:border-red-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800 dark:text-red-200 mb-1">An error occurred</p>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Something went wrong. Please try refreshing the page.
                  </p>
                  <button
                    onClick={() => {
                      this.setState({ hasError: false, error: null });
                      window.location.reload();
                    }}
                    className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                  >
                    Reload Page
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
