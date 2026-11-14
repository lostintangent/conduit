import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  title?: string;
  description?: string;
  /** Shows the children again, if they failed, once this changes */
  resetKey?: unknown;
  /** Adds a Close button, for a host whose own controls the error took out */
  onClose?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: unknown;
  retryAttempt: number;
  resetKey: unknown;
}

/**
 * Shows an error, with Retry, in place of children that threw while rendering
 * or in an effect, so they don't take the whole window down with them. The
 * root's onCaughtError, in main.tsx, logs the error.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    retryAttempt: 0,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) {
      return null;
    }
    return state.hasError
      ? {
          hasError: false,
          error: null,
          retryAttempt: 0,
          resetKey: props.resetKey,
        }
      : { resetKey: props.resetKey };
  }

  handleRetry = (): void => {
    this.setState((state) => ({
      hasError: false,
      error: null,
      retryAttempt: state.retryAttempt + 1,
    }));
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const {
      title = "This pane crashed",
      description = "There was an error showing it. Everything else still works.",
      onClose,
    } = this.props;
    const { error, retryAttempt } = this.state;
    const message = error instanceof Error ? error.message : undefined;
    const retry = (
      <Button
        onClick={this.handleRetry}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <RefreshCcw className="w-4 h-4" />
        Retry
      </Button>
    );

    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-background text-foreground p-4">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />

        <h3 className="text-lg font-semibold mb-2">{title}</h3>

        <p className="text-sm text-muted-foreground text-center mb-4 max-w-md">
          {description}
        </p>

        {message && (
          <details className="mb-4 text-xs text-muted-foreground max-w-md">
            <summary className="cursor-pointer hover:text-foreground">
              Error details
            </summary>
            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
              {message}
            </pre>
          </details>
        )}

        {onClose ? (
          <div className="flex gap-2">
            {retry}
            <Button
              onClick={onClose}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <X className="w-4 h-4" />
              Close
            </Button>
          </div>
        ) : (
          retry
        )}

        {retryAttempt > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Retry attempt {retryAttempt}
          </p>
        )}
      </div>
    );
  }
}
