/**
 * Refs Module
 *
 * Provides utilities and components for displaying git references
 * (branches and tags) in the commit graph.
 *
 * @example
 * ```tsx
 * import { parseRefs, RefBadgeList } from "./refs";
 *
 * const refs = parseRefs(commit.refs);
 * return <RefBadgeList refs={refs} />;
 * ```
 */

// Parsing utilities
export {
  parseRef,
  parseRefs,
  sortRefs,
  filterRefsByType,
  filterRefsForDisplay,
  getHeadRef,
  hasRefs,
} from "./parseRefs";

// Components
export { RefBadge, RefBadgeList } from "./RefBadge";
export type {
  RefBadgeProps,
  RefBadgeListProps,
  RefBadgeColorHint,
  RefWithColorHint,
} from "./RefBadge";
