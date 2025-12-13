/**
 * Graph Visualization Module
 *
 * This module contains the core graph computation and rendering logic:
 *
 * - swimlanes.ts: Algorithm to compute swimlane positions from commits
 * - GraphRenderer.ts: Pure functions for SVG path calculations
 * - GraphCell.tsx: React component that renders the SVG graph
 * - colors.ts: Color palette and mapping utilities
 * - constants.ts: Rendering configuration constants
 *
 * The graph visualization is the central feature of the commit history view.
 * It shows branching and merging topology using a swimlane model where:
 * - Each vertical lane represents a line of development
 * - Commits are circles positioned in their lane
 * - Lines and curves show how branches connect
 *
 * @example
 * ```tsx
 * import { computeSwimlanes, GraphCell, GRAPH_CONFIG } from './graph';
 *
 * const nodes = computeSwimlanes(commits, headCommitId);
 * return <GraphCell node={nodes[0]} config={GRAPH_CONFIG} />;
 * ```
 */

// Phase 2: Swimlane algorithm
// export { computeSwimlanes } from './swimlanes';

// Phase 2: Configuration constants
// export { GRAPH_CONFIG } from './constants';

// Phase 2: Color utilities
// export { GRAPH_COLORS, getNextColor, getColorCssVar } from './colors';

// Phase 4: SVG rendering
// export { calculateGraphCell, verticalLinePath, curvePath } from './GraphRenderer';

// Phase 4: React component
// export { GraphCell } from './GraphCell';
// export type { GraphCellProps } from './GraphCell';
