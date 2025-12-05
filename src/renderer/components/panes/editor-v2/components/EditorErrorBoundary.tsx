/**
 * EditorErrorBoundary - Error boundary for Monaco editor components.
 *
 * Catches React errors in Monaco editor components and displays a fallback UI
 * with a retry button. This prevents Monaco crashes from crashing the entire app.
 *
 * @example
 * ```tsx
 * <EditorErrorBoundary filePath={filePath}>
 *   <RegularEditorWrapper ... />
 * </EditorErrorBoundary>
 * ```
 */

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EditorErrorBoundaryProps {
  /** Children to render (the Monaco editor) */
  children: ReactNode;

  /** Optional file path being edited (for error message) */
  filePath?: string | null;

  /** Optional callback when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface EditorErrorBoundaryState {
  /** Whether an error has been caught */
  hasError: boolean;

  /** The caught error */
  error: Error | null;

  /** Attempt count for retry */
  retryAttempt: number;
}

/**
 * Error boundary specifically for Monaco editor components.
 *
 * Features:
 * - Catches rendering errors in Monaco editors
 * - Shows a fallback UI with error details
 * - Provides a retry button to attempt recovery
 * - Reports errors via optional callback
 */
export class EditorErrorBoundary extends Component<
  EditorErrorBoundaryProps,
  EditorErrorBoundaryState
> {
  constructor(props: EditorErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryAttempt: 0,
    };
  }

  /**
   * Update state when an error is caught.
   */
  static getDerivedStateFromError(
    error: Error,
  ): Partial<EditorErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  /**
   * Log error and call optional callback.
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(
      "[EditorErrorBoundary] Monaco editor crashed:",
      error,
      errorInfo,
    );

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  /**
   * Reset error state when filePath changes.
   * This allows recovery when switching to a different file.
   */
  componentDidUpdate(prevProps: EditorErrorBoundaryProps): void {
    if (prevProps.filePath !== this.props.filePath && this.state.hasError) {
      this.setState({
        hasError: false,
        error: null,
        retryAttempt: 0,
      });
    }
  }

  /**
   * Handle retry button click.
   */
  handleRetry = (): void => {
    this.setState(
      (state): EditorErrorBoundaryState => ({
        hasError: false,
        error: null,
        retryAttempt: state.retryAttempt + 1,
      }),
    );
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center h-full bg-background text-foreground p-4"
          data-testid="editor-error-boundary"
        >
          <AlertTriangle className="w-12 h-12 text-destructive mb-4" />

          <h3 className="text-lg font-semibold mb-2">Editor failed to load</h3>

          <p className="text-sm text-muted-foreground text-center mb-4 max-w-md">
            {this.props.filePath
              ? `There was an error loading "${this.props.filePath.split("/").pop()}".`
              : "There was an error loading the editor."}
          </p>

          {this.state.error && this.state.error.message && (
            <details className="mb-4 text-xs text-muted-foreground max-w-md">
              <summary className="cursor-pointer hover:text-foreground">
                Error details
              </summary>
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            </details>
          )}

          <Button
            onClick={this.handleRetry}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            Retry
          </Button>

          {this.state.retryAttempt > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Retry attempt {this.state.retryAttempt}
            </p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
