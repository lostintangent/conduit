/**
 * ErrorState Component
 *
 * Displayed when loading the commit graph fails.
 * Shows the error message with a retry button.
 *
 * Follows the same pattern as EditorErrorBoundary for consistency.
 *
 * @example
 * ```tsx
 * if (error) {
 *   return <ErrorState error={error} onRetry={refresh} />;
 * }
 * ```
 */

import { memo, useCallback } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

// =============================================================================
// Types
// =============================================================================

export interface ErrorStateProps {
  /** The error message to display */
  error: string;

  /** Callback when retry button is clicked */
  onRetry?: () => void;

  /** Optional additional class names */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Error state for the commit graph panel.
 *
 * Displays the error with an icon and optional retry button.
 * Uses compact styling suitable for a panel component.
 */
function ErrorStateComponent({ error, onRetry, className }: ErrorStateProps) {
  const handleRetry = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onRetry?.();
    },
    [onRetry],
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center",
        "py-8 px-4 text-center",
        className,
      )}
      data-testid="commit-graph-error"
      role="alert"
    >
      <AlertTriangle
        className="h-8 w-8 text-destructive mb-3"
        aria-hidden="true"
      />

      <h3 className="text-sm font-medium text-foreground mb-1">
        Failed to load commits
      </h3>

      <p
        className="text-xs text-muted-foreground mb-4 max-w-[200px]"
        data-testid="error-message"
      >
        {error}
      </p>

      {onRetry && (
        <Button
          onClick={handleRetry}
          variant="outline"
          size="sm"
          className="gap-1.5"
          data-testid="retry-button"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Try Again
        </Button>
      )}
    </div>
  );
}

export const ErrorState = memo(ErrorStateComponent);

export default ErrorState;
