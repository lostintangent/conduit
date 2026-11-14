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
 * @example
 * ```tsx
 * <GraphCell
 *   node={graphNode}
 *   height={44}
 *   config={GRAPH_CONFIG}
 * />
 * ```
 */

import type {
  CommitGraphNode,
  GraphRenderConfig,
  GraphPath,
  GraphCircle,
} from "../types";
import { calculateGraphCell, calculateExpandedSection } from "./renderer";
import { getColorCss } from "./colors";

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

  /**
   * If true, only render the lines (no circle).
   * Used for the expanded section to continue the graph lines.
   */
  hideCircle?: boolean;
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
    // HEAD commit: hollow circle (stroke only, no fill) like VS Code
    const headRadius = circle.r * 1.25;
    return (
      <circle
        cx={circle.cx}
        cy={circle.cy}
        r={headRadius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
      />
    );
  }

  if (circle.style === "merge") {
    // Merge commit: small center dot with outer ring, 25% bigger than normal
    const scale = 1.25;
    const outerRadius = circle.r * scale;
    const innerRadius = (circle.r / 2) * 1.5;
    return (
      <>
        {/* Outer ring */}
        <circle
          cx={circle.cx}
          cy={circle.cy}
          r={outerRadius}
          fill="none"
          stroke={color}
          strokeWidth={1}
        />
        {/* Small center dot */}
        <circle
          cx={circle.cx}
          cy={circle.cy}
          r={innerRadius}
          fill={color}
          stroke="none"
        />
      </>
    );
  }

  // Normal commit: simple filled circle
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
 * The React Compiler caches the calculateGraphCell result and the SVG,
 * recomputing them only when one of these changes:
 * - The node (commit data, swimlanes)
 * - The height (expanded/collapsed)
 * - The config (layout constants)
 * - The className or hideCircle props
 *
 * ## Accessibility
 *
 * The SVG is marked as presentational (role="img") since the graph
 * is visual decoration accompanying the text content. Screen readers
 * should focus on the commit message and metadata instead.
 */
export function GraphCell({
  node,
  height,
  config,
  className,
  hideCircle = false,
}: GraphCellProps) {
  // Calculate all render data
  // Use different renderer for expanded section (just continuation lines)
  const renderData = hideCircle
    ? calculateExpandedSection(node, height, config)
    : calculateGraphCell(node, height, config);

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

      {/* Render the commit circle (unless hidden for expanded section) */}
      {!hideCircle && (
        <GraphCircleElement
          circle={renderData.circle}
          strokeWidth={config.strokeWidth}
        />
      )}
    </svg>
  );
}
