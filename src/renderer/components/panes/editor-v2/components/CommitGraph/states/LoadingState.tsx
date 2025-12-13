/**
 * LoadingState Component
 *
 * Displayed while the commit graph is loading initial data.
 * Shows a spinner animation with a loading message.
 *
 * Uses consistent styling with other loading states in editor-v2.
 *
 * @example
 * ```tsx
 * if (isLoading) {
 *   return <LoadingState />;
 * }
 * ```
 */

import { memo } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/utils";

// =============================================================================
// Types
// =============================================================================

export interface LoadingStateProps {
  /** Custom message to display (default: "Loading commits...") */
  message?: string;

  /** Optional additional class names */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Loading state for the commit graph panel.
 *
 * Centered display with spinner and message.
 */
function LoadingStateComponent({
  message = "Loading commits...",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center",
        "py-8 px-4 text-muted-foreground",
        className,
      )}
      data-testid="commit-graph-loading"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-6 w-6 animate-spin mb-3" aria-hidden="true" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export const LoadingState = memo(LoadingStateComponent);

export default LoadingState;
