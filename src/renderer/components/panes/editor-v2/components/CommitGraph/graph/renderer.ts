/**
 * Graph Renderer
 *
 * Pure functions for computing SVG render data from CommitGraphNode data.
 * This module transforms graph structure into concrete SVG paths and circles.
 *
 * ## Design Philosophy
 *
 * All functions are pure - they take input and return output without side effects.
 * This makes them easy to test and reason about. The React component (GraphCell)
 * simply calls these functions and renders the resulting SVG elements.
 *
 * ## Coordinate System
 *
 * - X: Horizontal, with lane 0 on the left
 * - Y: Vertical, with 0 at the top of the cell
 * - The commit circle is always vertically centered in the row
 *
 * ## Path Types
 *
 * 1. **Vertical lines**: Straight lines connecting lanes above/below
 * 2. **Curves**: Quadratic bezier curves for lane transitions (merges/branches)
 * 3. **Pass-through lines**: Continue through the row without connecting to commit
 *
 * @see types.ts for type definitions
 * @see constants.ts for default configuration values
 */

import type {
  CommitGraphNode,
  GraphRenderConfig,
  GraphCellRenderData,
  GraphPath,
  GraphCircle,
  Swimlane,
  GraphColor,
  SegmentColor,
} from "../types";
import { HEAD_CIRCLE_EXTRA_PADDING, ROW_HEIGHT } from "./constants";

// =============================================================================
// Position Calculations
// =============================================================================

/**
 * Calculate the X position for a given lane index.
 *
 * Lanes are evenly spaced, with the first lane at half a laneWidth
 * from the left edge (providing padding).
 *
 * @param laneIndex - Zero-based lane index
 * @param config - Render configuration
 * @returns X coordinate in pixels
 *
 * @example
 * ```ts
 * laneX(0, { laneWidth: 16, ... }) // => 8 (half laneWidth padding)
 * laneX(1, { laneWidth: 16, ... }) // => 24
 * laneX(2, { laneWidth: 16, ... }) // => 40
 * ```
 */
export function laneX(laneIndex: number, config: GraphRenderConfig): number {
  return config.laneWidth / 2 + laneIndex * config.laneWidth;
}

/**
 * Calculate the Y position for the center of a row.
 *
 * The commit circle is vertically centered in the row.
 * For rows with custom heights (expanded commits), pass the actual height.
 *
 * @param height - Row height in pixels
 * @returns Y coordinate in pixels (center of row)
 */
export function rowCenterY(height: number): number {
  return height / 2;
}

/**
 * Get the effective gap between lines and circles.
 */
function getGap(config: GraphRenderConfig): number {
  return config.lineGap ?? 0;
}

/**
 * Calculate the X position of a circle's right edge (3 o'clock position).
 * Used for curves that appear to originate from a node.
 */
function circleRightEdge(laneIndex: number, config: GraphRenderConfig): number {
  return laneX(laneIndex, config) + config.circleRadius + getGap(config);
}

// =============================================================================
// SVG Path Generation
// =============================================================================

/**
 * Generate SVG path for a vertical line segment.
 *
 * Used for lanes that continue straight through without turning.
 *
 * @param x - X coordinate (constant for vertical line)
 * @param startY - Starting Y coordinate
 * @param endY - Ending Y coordinate
 * @returns SVG path 'd' attribute value
 */
export function verticalLinePath(
  x: number,
  startY: number,
  endY: number,
): string {
  return `M ${x} ${startY} L ${x} ${endY}`;
}

/**
 * Generate SVG path for a curve from one lane to another.
 *
 * Uses a quadratic bezier curve with the control point positioned
 * to create a smooth S-curve transition between lanes.
 *
 * The curve goes from (fromX, fromY) to (toX, toY) with the control
 * point at (fromX, toY) to create a 90-degree turn effect.
 *
 * @param fromLane - Starting lane index
 * @param toLane - Ending lane index
 * @param fromY - Starting Y coordinate
 * @param toY - Ending Y coordinate
 * @param config - Render configuration
 * @returns SVG path 'd' attribute value
 */
export function curvePathBetweenLanes(
  fromLane: number,
  toLane: number,
  fromY: number,
  toY: number,
  config: GraphRenderConfig,
): string {
  const fromX = laneX(fromLane, config);
  const toX = laneX(toLane, config);

  // For smooth curves, use quadratic bezier with control point
  // at the corner of the bounding box
  const controlX = fromX;
  const controlY = toY;

  return `M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}`;
}

/**
 * Generate SVG path for a line from above to the commit circle.
 *
 * Handles three cases:
 * 1. Same lane: Straight vertical line from top to circle
 * 2. From left (merge-back): Curve from left lane to commit on right
 * 3. From right (branch-start): Curve that appears to originate FROM the commit
 *
 * @param fromLane - Lane index the line comes from (above)
 * @param commitLane - Lane index where the commit sits
 * @param centerY - Y coordinate of commit center
 * @param config - Render configuration
 * @returns SVG path 'd' attribute value
 */
export function pathFromAbove(
  fromLane: number,
  commitLane: number,
  centerY: number,
  config: GraphRenderConfig,
): string {
  const gap = getGap(config);
  const aboveCircle = centerY - config.circleRadius - gap;

  // Case 1: Same lane - straight vertical line
  if (fromLane === commitLane) {
    return verticalLinePath(laneX(fromLane, config), 0, aboveCircle);
  }

  const fromX = laneX(fromLane, config);
  const toX = laneX(commitLane, config);

  // Case 2: From LEFT - merge-back curve (branch rejoining main)
  // Curve starts at right edge of source lane, curves right then down to commit
  if (fromLane < commitLane) {
    const startX = circleRightEdge(fromLane, config);
    return `M ${startX} 0 Q ${toX} 0 ${toX} ${aboveCircle}`;
  }

  // Case 3: From RIGHT - branch-start curve
  // Draw FROM commit's 3 o'clock position outward to branch lane
  // This makes the branch visually "originate" from the parent node
  const nodeRightEdge = circleRightEdge(commitLane, config);
  return `M ${nodeRightEdge} ${centerY} Q ${fromX} ${centerY} ${fromX} 0`;
}

/**
 * Generate SVG path for a line from the commit circle to below.
 *
 * Handles three cases:
 * 1. Same lane: Straight vertical line from circle to bottom
 * 2. To right (merge-out): Curve from commit's 3 o'clock to target lane below
 * 3. To left (branch-end): Curve that appears to originate FROM the parent node
 *
 * @param commitLane - Lane index where the commit sits
 * @param toLane - Lane index the line goes to (below)
 * @param centerY - Y coordinate of commit center
 * @param height - Total row height
 * @param config - Render configuration
 * @returns SVG path 'd' attribute value
 */
export function pathToBelow(
  commitLane: number,
  toLane: number,
  centerY: number,
  height: number,
  config: GraphRenderConfig,
): string {
  const gap = getGap(config);
  const belowCircle = centerY + config.circleRadius + gap;

  // Case 1: Same lane - straight vertical line
  if (commitLane === toLane) {
    return verticalLinePath(laneX(commitLane, config), belowCircle, height);
  }

  const fromX = laneX(commitLane, config);
  const toX = laneX(toLane, config);

  // Case 2: To RIGHT - merge-out curve (connecting to feature branch parent)
  // Curve starts at commit's 3 o'clock, curves right then down to target lane
  if (toLane > commitLane) {
    const nodeRightEdge = circleRightEdge(commitLane, config);
    return `M ${nodeRightEdge} ${centerY} Q ${toX} ${centerY} ${toX} ${height}`;
  }

  // Case 3: To LEFT - branch-end curve (feature branch connecting to main parent)
  // Draw FROM where parent node will be (at bottom) UP to commit's lane
  // This makes the curve visually "originate" from the parent node
  const parentRightEdge = circleRightEdge(toLane, config);
  return `M ${parentRightEdge} ${height} Q ${fromX} ${height} ${fromX} ${belowCircle}`;
}

/**
 * Generate SVG path for a pass-through line.
 *
 * Pass-through lines are lanes that continue through the row
 * without connecting to the commit (they're tracking a different commit).
 *
 * @param lane - Lane index for the pass-through
 * @param height - Row height
 * @param config - Render configuration
 * @returns SVG path 'd' attribute value
 */
export function passThroughPath(
  lane: number,
  height: number,
  config: GraphRenderConfig,
): string {
  const x = laneX(lane, config);
  return verticalLinePath(x, 0, height);
}

// =============================================================================
// Lane Analysis
// =============================================================================

/**
 * Find lanes that pass through without connecting to the commit.
 *
 * A lane is a pass-through if it exists in both input and output,
 * but is NOT the commit's own lane. These lanes continue straight down.
 *
 * @param inputSwimlanes - Swimlanes entering the row
 * @param outputSwimlanes - Swimlanes exiting the row
 * @param commitLane - The lane index of the commit
 * @returns Array of lane indices that pass through
 */
export function getPassThroughLanes(
  inputSwimlanes: Swimlane[],
  outputSwimlanes: Swimlane[],
  commitLane: number,
): number[] {
  const passThroughLanes: number[] = [];

  // Check each input lane
  for (let i = 0; i < inputSwimlanes.length; i++) {
    // Skip the commit's own lane
    if (i === commitLane) continue;

    // Check if this lane continues in the output
    // A lane continues if the same target ID exists in output at any position
    const inputTarget = inputSwimlanes[i].targetId;
    const continuesInOutput = outputSwimlanes.some(
      (s) => s.targetId === inputTarget,
    );

    if (continuesInOutput) {
      passThroughLanes.push(i);
    }
  }

  return passThroughLanes;
}

/**
 * Find the input lane that targets this commit.
 *
 * @param inputSwimlanes - Swimlanes entering the row
 * @param commitId - The commit ID to find
 * @returns Lane index, or -1 if not found
 */
export function findCommitInputLane(
  inputSwimlanes: Swimlane[],
  commitId: string,
): number {
  return inputSwimlanes.findIndex((s) => s.targetId === commitId);
}

/**
 * Find the last index of an element matching a predicate.
 * Similar to Array.findIndex but searches from the end.
 *
 * @param arr - Array to search
 * @param predicate - Function to test each element
 * @returns Last matching index, or -1 if not found
 */
function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) {
      return i;
    }
  }
  return -1;
}

// =============================================================================
// Segment Color Mapping
// =============================================================================

/**
 * Map a SegmentColor to a GraphColor.
 *
 * Segment colors represent commit positions relative to tracked branches,
 * and are mapped to the corresponding graph colors:
 * - "current" → "current" (blue)
 * - "upstream" → "remote" (purple) - Note: different naming conventions
 * - "base" → "base" (orange)
 *
 * @param segmentColor - The segment color to map
 * @returns The corresponding GraphColor, or null if no segment
 */
function segmentToGraphColor(segmentColor: SegmentColor): GraphColor | null {
  switch (segmentColor) {
    case "current":
      return "current";
    case "upstream":
      return "remote"; // SegmentColor uses "upstream", GraphColor uses "remote"
    case "base":
      return "base";
    default:
      return null;
  }
}

/**
 * Get the effective color for a path, considering segment coloring.
 *
 * For commits on the main path (with segmentType), uses the segment color.
 * For other commits, falls back to the swimlane color.
 *
 * @param segmentType - The node's segment type (may be null)
 * @param fallbackColor - The swimlane color to use if no segment
 * @returns The effective GraphColor for the path
 */
function getEffectivePathColor(
  segmentType: SegmentColor,
  fallbackColor: GraphColor,
): GraphColor {
  const segmentGraphColor = segmentToGraphColor(segmentType);
  return segmentGraphColor ?? fallbackColor;
}

// =============================================================================
// Circle Calculation
// =============================================================================

/**
 * Calculate circle render data for a commit.
 *
 * @param node - The commit graph node
 * @param height - Row height
 * @param config - Render configuration
 * @returns Circle render data
 */
export function calculateCircle(
  node: CommitGraphNode,
  height: number,
  config: GraphRenderConfig,
): GraphCircle {
  const cx = laneX(node.laneIndex, config);
  // Circle is always at the commit row level, not centered in expanded container
  const cy = rowCenterY(ROW_HEIGHT);

  // Determine style based on commit type
  let style: GraphCircle["style"] = "normal";
  if (node.isHead) {
    style = "head";
  } else if (node.isMerge) {
    style = "merge";
  }

  // Determine color: prefer segment color if available, otherwise use swimlane color
  let color: GraphColor;
  const segmentGraphColor = segmentToGraphColor(node.segmentType);

  if (segmentGraphColor) {
    // Use segment color for tracked branch visualization
    color = segmentGraphColor;
  } else {
    // Fall back to swimlane color
    const inputLane = findCommitInputLane(node.inputSwimlanes, node.commit.id);
    color =
      inputLane >= 0 && node.inputSwimlanes[inputLane]
        ? node.inputSwimlanes[inputLane].color
        : "branch-1";
  }

  return {
    cx,
    cy,
    r: config.circleRadius,
    color,
    style,
  };
}

// =============================================================================
// Path Calculation Helpers
// =============================================================================

/**
 * Calculate incoming paths from input lanes that target this commit.
 *
 * Handles branches converging on the same commit (e.g., branch start points).
 * HEAD commits have no incoming paths (no children above in the graph).
 *
 * @param node - The commit graph node
 * @param centerY - Y coordinate of commit center
 * @param config - Render configuration
 * @returns Array of incoming paths
 */
function calculateIncomingPaths(
  node: CommitGraphNode,
  centerY: number,
  config: GraphRenderConfig,
): GraphPath[] {
  // HEAD commits have no children above them in the graph
  if (node.isHead) {
    return [];
  }

  const paths: GraphPath[] = [];

  for (let i = 0; i < node.inputSwimlanes.length; i++) {
    if (node.inputSwimlanes[i].targetId === node.commit.id) {
      // Use segment color for the main lane (lane matching this commit)
      const isMainLane = i === node.laneIndex;
      const pathColor = isMainLane
        ? getEffectivePathColor(node.segmentType, node.inputSwimlanes[i].color)
        : node.inputSwimlanes[i].color;

      paths.push({
        d: pathFromAbove(i, node.laneIndex, centerY, config),
        color: pathColor,
        isPassThrough: false,
      });
    }
  }

  return paths;
}

/**
 * Calculate outgoing paths from this commit to its parents.
 *
 * Iterates through parents (not outputSwimlanes) to avoid duplicate curves
 * when multiple lanes target the same parent. First parent uses segment color
 * for the main path; additional parents (merges) use swimlane colors.
 *
 * @param node - The commit graph node
 * @param centerY - Y coordinate of commit center
 * @param height - Row height
 * @param config - Render configuration
 * @returns Array of outgoing paths
 */
function calculateOutgoingPaths(
  node: CommitGraphNode,
  centerY: number,
  height: number,
  config: GraphRenderConfig,
): GraphPath[] {
  const paths: GraphPath[] = [];
  const gap = getGap(config);

  // HEAD commits render with a larger circle (1.25x scale), so we add extra
  // padding to prevent the line from overlapping the larger ring
  const effectiveRadius = node.isHead
    ? config.circleRadius + HEAD_CIRCLE_EXTRA_PADDING + gap
    : config.circleRadius + gap;

  // Find the output lane for each parent and draw paths
  for (
    let parentIdx = 0;
    parentIdx < node.commit.parentIds.length;
    parentIdx++
  ) {
    const parentId = node.commit.parentIds[parentIdx];

    // For the first parent, check if the commit's own lane targets it first.
    // This is important when a parent appears in multiple lanes (convergence):
    // we want to connect to the lane at our position, not a different lane.
    // For additional parents (merge), use findLastIndex to find their lane.
    let parentLaneIndex: number;
    if (
      parentIdx === 0 &&
      node.outputSwimlanes[node.laneIndex]?.targetId === parentId
    ) {
      // First parent is at commit's lane (typical case)
      parentLaneIndex = node.laneIndex;
    } else {
      // Find where this parent is in outputSwimlanes
      parentLaneIndex = findLastIndex(
        node.outputSwimlanes,
        (s) => s.targetId === parentId,
      );
    }

    if (parentLaneIndex === -1) continue; // Parent not in output (shouldn't happen)

    const outputSwimlane = node.outputSwimlanes[parentLaneIndex];

    if (parentIdx === 0) {
      // First parent - draw from commit's lane
      // Use segment color for the main path (first parent chain)
      const firstParentColor = getEffectivePathColor(
        node.segmentType,
        outputSwimlane.color,
      );

      // If commit is at the same lane as first parent, straight line
      // Otherwise curve to the parent's lane
      if (parentLaneIndex === node.laneIndex) {
        paths.push({
          d: verticalLinePath(
            laneX(node.laneIndex, config),
            centerY + effectiveRadius,
            height,
          ),
          color: firstParentColor,
          isPassThrough: false,
        });
      } else {
        // Curve from commit lane to first parent's lane (going left usually)
        paths.push({
          d: pathToBelow(
            node.laneIndex,
            parentLaneIndex,
            centerY,
            height,
            config,
          ),
          color: firstParentColor,
          isPassThrough: false,
        });
      }
    } else {
      // Additional parents (merge commits) - draw curve from commit to parent lane
      // These use the swimlane color (not segment color) since they're side branches
      paths.push({
        d: pathToBelow(
          node.laneIndex,
          parentLaneIndex,
          centerY,
          height,
          config,
        ),
        color: outputSwimlane.color,
        isPassThrough: false,
      });
    }
  }

  return paths;
}

/**
 * Calculate pass-through paths for lanes that continue without connecting.
 *
 * Pass-through lanes exist in both input and output but don't connect to
 * the current commit. They represent branches that continue past this commit.
 *
 * @param node - The commit graph node
 * @param height - Row height
 * @param config - Render configuration
 * @returns Array of pass-through paths
 */
function calculatePassThroughPathsForCell(
  node: CommitGraphNode,
  height: number,
  config: GraphRenderConfig,
): GraphPath[] {
  const paths: GraphPath[] = [];
  const passThroughLanes = getPassThroughLanes(
    node.inputSwimlanes,
    node.outputSwimlanes,
    node.laneIndex,
  );

  for (const lane of passThroughLanes) {
    const swimlane = node.inputSwimlanes[lane];
    // Use segment color if available (for tracked branch visualization)
    const color = swimlane?.segmentColor
      ? (segmentToGraphColor(swimlane.segmentColor) ?? swimlane.color)
      : (swimlane?.color ?? "branch-1");
    paths.push({
      d: passThroughPath(lane, height, config),
      color,
      isPassThrough: true,
    });
  }

  return paths;
}

// =============================================================================
// Complete Cell Calculation
// =============================================================================

/**
 * Calculate all render data for a single graph cell.
 *
 * This is the main function that computes everything needed to render
 * the SVG graph for one commit row. It analyzes the swimlane transitions
 * and generates appropriate paths and circle data.
 *
 * ## Path Generation Logic
 *
 * 1. **Incoming paths**: From input lanes to the commit circle
 * 2. **Outgoing paths**: From the commit circle to parent lanes
 * 3. **Pass-through paths**: For lanes that continue without connecting
 *
 * @param node - The commit graph node to render
 * @param height - Row height (may be larger for expanded commits)
 * @param config - Render configuration
 * @returns Complete render data for the cell
 */
export function calculateGraphCell(
  node: CommitGraphNode,
  height: number,
  config: GraphRenderConfig,
): GraphCellRenderData {
  // Circle is always at the commit row level, not centered in expanded container
  const centerY = rowCenterY(ROW_HEIGHT);

  // Calculate total width based on maximum lanes
  const maxLanes = Math.max(
    node.inputSwimlanes.length,
    node.outputSwimlanes.length,
    node.laneIndex + 1,
  );
  const width = maxLanes * config.laneWidth;

  // Calculate all path types
  const incomingPaths = calculateIncomingPaths(node, centerY, config);
  const outgoingPaths = calculateOutgoingPaths(node, centerY, height, config);
  const passThroughPaths = calculatePassThroughPathsForCell(
    node,
    height,
    config,
  );

  // Calculate circle
  const circle = calculateCircle(node, height, config);

  return {
    width,
    height,
    paths: [...incomingPaths, ...outgoingPaths, ...passThroughPaths],
    circle,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate the required width for a set of nodes.
 *
 * Useful for sizing the graph column based on the maximum lane count.
 *
 * @param nodes - Array of graph nodes
 * @param config - Render configuration
 * @returns Required width in pixels
 */
export function calculateGraphWidth(
  nodes: CommitGraphNode[],
  config: GraphRenderConfig,
): number {
  if (nodes.length === 0) return config.laneWidth;

  let maxLanes = 0;
  for (const node of nodes) {
    maxLanes = Math.max(
      maxLanes,
      node.inputSwimlanes.length,
      node.outputSwimlanes.length,
    );
  }

  return Math.max(maxLanes * config.laneWidth, config.laneWidth);
}

/**
 * Calculate render data for an expanded section (just continuation lines).
 *
 * This is used when a commit row is expanded - we render the continuation
 * of the graph lines below the commit circle without the circle itself.
 *
 * @param node - The commit graph node
 * @param height - Height of the expanded section
 * @param config - Render configuration
 * @returns Render data with just vertical lines
 */
export function calculateExpandedSection(
  node: CommitGraphNode,
  height: number,
  config: GraphRenderConfig,
): GraphCellRenderData {
  const paths: GraphPath[] = [];

  // Calculate width based on output lanes
  const maxLanes = Math.max(node.outputSwimlanes.length, node.laneIndex + 1);
  const width = maxLanes * config.laneWidth;

  // Add vertical lines for each output lane
  for (let i = 0; i < node.outputSwimlanes.length; i++) {
    const outputSwimlane = node.outputSwimlanes[i];

    // Check if this lane continues (either to parent or pass-through)
    const isParentLane = node.commit.parentIds.includes(
      outputSwimlane.targetId,
    );
    const isPassThrough = !isParentLane;

    if (isParentLane || isPassThrough) {
      // Use segment color for the main lane (first parent at node's position)
      const isMainLane =
        i === node.laneIndex &&
        outputSwimlane.targetId === node.commit.parentIds[0];

      // Determine line color: prefer segment colors for tracked branch visualization
      let lineColor: GraphColor;
      if (isMainLane) {
        // Main lane uses node's segment type
        lineColor = getEffectivePathColor(
          node.segmentType,
          outputSwimlane.color,
        );
      } else if (outputSwimlane.segmentColor) {
        // Pass-through lanes use swimlane's segment color if available
        lineColor =
          segmentToGraphColor(outputSwimlane.segmentColor) ??
          outputSwimlane.color;
      } else {
        lineColor = outputSwimlane.color;
      }

      paths.push({
        d: verticalLinePath(laneX(i, config), 0, height),
        color: lineColor,
        isPassThrough,
      });
    }
  }

  // Return dummy circle data (won't be rendered when hideCircle is true)
  const circle: GraphCircle = {
    cx: laneX(node.laneIndex, config),
    cy: 0,
    r: config.circleRadius,
    color: "branch-1",
    style: "normal",
  };

  return {
    width,
    height,
    paths,
    circle,
  };
}
