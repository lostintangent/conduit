/**
 * State Display Module
 *
 * This module contains components for displaying various states
 * of the commit graph panel:
 *
 * - LoadingState.tsx: Shown during initial commit loading
 * - EmptyState.tsx: Shown when repository has no commits
 * - ErrorState.tsx: Shown when loading fails, with retry option
 *
 * These provide consistent user feedback across different scenarios
 * and match the styling of other editor-v2 state components.
 *
 * @example
 * ```tsx
 * import { LoadingState, EmptyState, ErrorState } from './states';
 *
 * if (isLoading) return <LoadingState />;
 * if (error) return <ErrorState error={error} onRetry={refresh} />;
 * if (nodes.length === 0) return <EmptyState />;
 * ```
 */

// Phase 8: State display components
export { LoadingState } from "./LoadingState";
export type { LoadingStateProps } from "./LoadingState";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { ErrorState } from "./ErrorState";
export type { ErrorStateProps } from "./ErrorState";
