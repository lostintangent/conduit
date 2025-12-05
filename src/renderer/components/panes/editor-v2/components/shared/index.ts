/**
 * Shared components for Editor v2.
 *
 * Components in this directory are used across multiple editor components
 * to avoid duplication.
 */

export { GitBadge, getStatusConfig } from "./GitBadge";
export type { GitBadgeProps, StatusConfig } from "./GitBadge";
export { aggregateFolderStatus } from "./gitFolderAggregation";
