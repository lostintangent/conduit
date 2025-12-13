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
} from "../types";

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
 * This is the incoming line from a parent swimlane to the commit.
 * If the lane curves in from a different position, this generates a curve.
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
  const fromX = laneX(fromLane, config);
  const toX = laneX(commitLane, config);

  if (fromLane === commitLane) {
    // Straight vertical line from top to circle
    return verticalLinePath(fromX, 0, centerY - config.circleRadius);
  }

  // Curve from different lane to commit lane
  // First go down vertically, then curve toward commit
  const curveStartY = centerY - config.curveRadius * 2;

  if (fromLane < commitLane) {
    // Coming from the left
    return `M ${fromX} 0 L ${fromX} ${curveStartY} Q ${fromX} ${centerY} ${toX} ${centerY}`;
  } else {
    // Coming from the right
    return `M ${fromX} 0 L ${fromX} ${curveStartY} Q ${fromX} ${centerY} ${toX} ${centerY}`;
  }
}

/**
 * Generate SVG path for a line from the commit circle to below.
 *
 * This is the outgoing line from the commit to its parent swimlane.
 * If the lane curves out to a different position, this generates a curve.
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
  const fromX = laneX(commitLane, config);
  const toX = laneX(toLane, config);

  if (commitLane === toLane) {
    // Straight vertical line from circle to bottom
    return verticalLinePath(fromX, centerY + config.circleRadius, height);
  }

  // Curve from commit lane to different lane
  const curveEndY = centerY + config.curveRadius * 2;

  return `M ${fromX} ${centerY} Q ${fromX} ${curveEndY} ${toX} ${curveEndY} L ${toX} ${height}`;
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
  const cy = rowCenterY(height);

  // Determine style based on commit type
  let style: GraphCircle["style"] = "normal";
  if (node.isHead) {
    style = "head";
  } else if (node.isMerge) {
    style = "merge";
  }

  // Get color from the input swimlane targeting this commit
  const inputLane = findCommitInputLane(node.inputSwimlanes, node.commit.id);
  const color: GraphColor =
    inputLane >= 0 && node.inputSwimlanes[inputLane]
      ? node.inputSwimlanes[inputLane].color
      : "branch-1";

  return {
    cx,
    cy,
    r: config.circleRadius,
    color,
    style,
  };
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
 * 1. **Incoming line**: From the input lane to the commit circle
 * 2. **Outgoing lines**: From the commit circle to each parent lane
 * 3. **Pass-through lines**: For lanes that continue without connecting
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
  const paths: GraphPath[] = [];
  const centerY = rowCenterY(height);

  // Calculate total width based on maximum lanes
  const maxLanes = Math.max(
    node.inputSwimlanes.length,
    node.outputSwimlanes.length,
    node.laneIndex + 1,
  );
  const width = maxLanes * config.laneWidth;

  // 1. Add incoming path from the input lane to the commit
  const inputLaneIndex = findCommitInputLane(
    node.inputSwimlanes,
    node.commit.id,
  );

  if (inputLaneIndex >= 0) {
    const inputColor = node.inputSwimlanes[inputLaneIndex].color;

    if (inputLaneIndex === node.laneIndex) {
      // Straight line from top to commit
      paths.push({
        d: verticalLinePath(
          laneX(node.laneIndex, config),
          0,
          centerY - config.circleRadius,
        ),
        color: inputColor,
        isPassThrough: false,
      });
    } else {
      // Curve from input lane to commit lane
      paths.push({
        d: pathFromAbove(inputLaneIndex, node.laneIndex, centerY, config),
        color: inputColor,
        isPassThrough: false,
      });
    }
  }

  // 2. Add outgoing paths to parent lanes
  for (let i = 0; i < node.outputSwimlanes.length; i++) {
    const outputSwimlane = node.outputSwimlanes[i];

    // Check if this output lane targets one of the commit's parents
    const isParentLane = node.commit.parentIds.includes(
      outputSwimlane.targetId,
    );

    if (isParentLane) {
      // This lane goes from the commit to a parent
      if (i === node.laneIndex) {
        // Straight line from commit to bottom
        paths.push({
          d: verticalLinePath(
            laneX(node.laneIndex, config),
            centerY + config.circleRadius,
            height,
          ),
          color: outputSwimlane.color,
          isPassThrough: false,
        });
      } else {
        // Curve from commit to parent lane
        paths.push({
          d: pathToBelow(node.laneIndex, i, centerY, height, config),
          color: outputSwimlane.color,
          isPassThrough: false,
        });
      }
    }
  }

  // 3. Add pass-through lanes
  const passThroughLanes = getPassThroughLanes(
    node.inputSwimlanes,
    node.outputSwimlanes,
    node.laneIndex,
  );

  for (const lane of passThroughLanes) {
    const color = node.inputSwimlanes[lane]?.color ?? "branch-1";
    paths.push({
      d: passThroughPath(lane, height, config),
      color,
      isPassThrough: true,
    });
  }

  // 4. Calculate circle
  const circle = calculateCircle(node, height, config);

  return {
    width,
    height,
    paths,
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
