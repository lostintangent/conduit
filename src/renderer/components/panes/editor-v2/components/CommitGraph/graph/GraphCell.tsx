/**
 * GraphCell Component
 *
 * Renders the SVG graph visualization for a single commit row.
 * This component takes a CommitGraphNode and renders:
 * - The commit circle (with special styling for HEAD commits)
 * - Incoming lines from parent lanes
 * - Outgoing lines to child lanes
 * - Pass-through lines for branches that continue past this commit
 *
 * The component is memoized to prevent unnecessary re-renders when
 * the commit data hasn't changed.
 *
 * @example
 * ```tsx
 * <GraphCell
 *   node={graphNode}
 *   height={44}
 *   config={GRAPH_CONFIG}
 * />
 * ```
 */

import { memo, useMemo } from "react";
import type {
  CommitGraphNode,
  GraphRenderConfig,
  GraphPath,
  GraphCircle,
} from "../types";
import { calculateGraphCell } from "./renderer";
import { getColorCss } from "./colors";
import { HEAD_OUTER_RADIUS } from "./constants";

// =============================================================================
// Props
// =============================================================================

export interface GraphCellProps {
  /** The commit graph node to render */
  node: CommitGraphNode;

  /**
   * Height of the row in pixels.
   * May be larger than standard row height for expanded commits.
   */
  height: number;

  /** Render configuration (dimensions, styling) */
  config: GraphRenderConfig;

  /** Optional className for the SVG element */
  className?: string;
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Renders a single path element with appropriate styling.
 */
interface GraphPathElementProps {
  path: GraphPath;
  strokeWidth: number;
}

function GraphPathElement({ path, strokeWidth }: GraphPathElementProps) {
  return (
    <path
      d={path.d}
      stroke={getColorCss(path.color)}
      strokeWidth={strokeWidth}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/**
 * Renders the commit circle with appropriate styling.
 * HEAD commits get a double-circle effect (outer ring).
 */
interface GraphCircleElementProps {
  circle: GraphCircle;
  strokeWidth: number;
}

function GraphCircleElement({ circle, strokeWidth }: GraphCircleElementProps) {
  const color = getColorCss(circle.color);

  if (circle.style === "head") {
    // HEAD commit: outer ring + filled inner circle
    return (
      <g>
        {/* Outer ring */}
        <circle
          cx={circle.cx}
          cy={circle.cy}
          r={HEAD_OUTER_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
        />
        {/* Inner filled circle */}
        <circle
          cx={circle.cx}
          cy={circle.cy}
          r={circle.r}
          fill={color}
          stroke="none"
        />
      </g>
    );
  }

  // Normal and merge commits: simple filled circle
  return (
    <circle
      cx={circle.cx}
      cy={circle.cy}
      r={circle.r}
      fill={color}
      stroke="none"
    />
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * GraphCell renders the SVG graph visualization for a single commit.
 *
 * ## Performance
 *
 * The component is memoized and uses useMemo for the expensive
 * calculateGraphCell computation. It only re-renders when:
 * - The node changes (commit data, swimlanes)
 * - The height changes (expanded/collapsed)
 * - The config changes (layout constants)
 *
 * ## Accessibility
 *
 * The SVG is marked as presentational (role="img") since the graph
 * is visual decoration accompanying the text content. Screen readers
 * should focus on the commit message and metadata instead.
 */
function GraphCellComponent({
  node,
  height,
  config,
  className,
}: GraphCellProps) {
  // Calculate all render data
  const renderData = useMemo(
    () => calculateGraphCell(node, height, config),
    [node, height, config],
  );

  return (
    <svg
      width={renderData.width}
      height={renderData.height}
      className={className}
      role="img"
      aria-hidden="true"
    >
      {/* Render all paths (lines and curves) */}
      {renderData.paths.map((path, index) => (
        <GraphPathElement
          key={`path-${index}`}
          path={path}
          strokeWidth={config.strokeWidth}
        />
      ))}

      {/* Render the commit circle */}
      <GraphCircleElement
        circle={renderData.circle}
        strokeWidth={config.strokeWidth}
      />
    </svg>
  );
}

/**
 * Memoized GraphCell component.
 *
 * The memoization compares props shallowly, which works well because:
 * - node is replaced (not mutated) when data changes
 * - height is a primitive
 * - config is typically a constant
 */
export const GraphCell = memo(GraphCellComponent);

// Also export as default for convenient importing
export default GraphCell;
