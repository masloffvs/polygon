import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Fallback UI to show when an error occurs. If not provided, default error UI is shown */
  fallback?: ReactNode;
  /** Optional callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Optional title for the error card */
  title?: string;
  /** Optional className for styling */
  className?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary component that catches JavaScript errors anywhere in its child
 * component tree and displays a fallback UI instead of crashing the whole app.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary title="My Widget">
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error to console for debugging
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div
          className={`flex flex-col items-center justify-center p-6 rounded-xl ${this.props.className || ""}`}
        >
          <div className="flex items-center gap-2 text-red-400 mb-3">
            <AlertTriangle size={20} />
            <span className="font-medium">
              {this.props.title
                ? `Error in ${this.props.title}`
                : "Component Error"}
            </span>
          </div>

          <p className="text-sm text-gray-400 text-center mb-4 max-w-md">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>

          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-dark-300 hover:bg-dark-200 text-gray-300 rounded-lg transition-colors"
          >
            <RefreshCw size={14} />
            Try Again
          </button>

          {/* Show stack trace in development */}
          {process.env.NODE_ENV === "development" &&
            this.state.errorInfo?.componentStack && (
              <details className="mt-4 w-full">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                  Stack trace
                </summary>
                <pre className="mt-2 p-3 text-xs text-red-300/70 bg-dark-500/50 rounded-lg overflow-auto max-h-40">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details> 
            )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * A lightweight wrapper that provides error boundary functionality
 * with a minimal inline error indicator
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: { title?: string; fallback?: ReactNode },
) {
  const displayName =
    WrappedComponent.displayName || WrappedComponent.name || "Component";

  const WithErrorBoundary = (props: P) => (
    <ErrorBoundary
      title={options?.title || displayName}
      fallback={options?.fallback}
    >
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return WithErrorBoundary;
}
