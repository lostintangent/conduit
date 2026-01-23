/**
 * Swimlane Algorithm
 *
 * Transforms a flat list of commits into graph nodes with swimlane positioning.
 * This is the core algorithm that determines where each commit appears in the
 * graph and how branches connect visually.
 *
 * ## Swimlane Model
 *
 * A swimlane is a vertical track representing a line of development.
 * Each lane "tracks toward" a specific commit - when we encounter that commit,
 * the lane continues to its parent (or terminates for root commits).
 *
 * ```
 * Lane 0   Lane 1
 *   │
 *   ●        ← Commit A: Lane 0 targets A, then updates to target A's parent
 *   │
 *   ●        ← Commit B: Lane 0 now targets B
 *   │\
 *   │ ●      ← Commit C: New lane 1 created (from merge)
 *   │ │
 *   ●─┘      ← Commit D: Lane 1 merges into lane 0
 *   │
 * ```
 *
 * ## Algorithm Overview
 *
 * Process commits top-to-bottom (newest first):
 *
 * 1. Find the lane targeting this commit (or create new lane)
 * 2. Record input swimlanes (state before this commit)
 * 3. Update lane to target first parent
 * 4. Add new lanes for additional parents (merge commits)
 * 5. Remove/collapse lanes targeting the same commit
 * 6. Record output swimlanes (state after this commit)
 *
 * The difference between input and output swimlanes determines
 * what lines and curves to draw.
 */

import type {
  HistoryCommit,
  CommitGraphNode,
  Swimlane,
  GraphColor,
  SegmentColor,
} from "../types";
import type { TrackedBranchInfo } from "@/api/GitV2API";
import { getNextColor } from "./colors";

// =============================================================================
// Types
// =============================================================================

/**
 * Internal mutable swimlane used during algorithm execution.
 * Converted to immutable Swimlane for output.
 */
interface MutableSwimlane {
  targetId: string;
  color: GraphColor;
  segmentColor?: SegmentColor;
}

/**
 * Options for the swimlane computation.
 */
export interface ComputeSwimlanesOptions {
  /**
   * The commit ID that is currently HEAD.
   * This commit will have isHead=true in the result.
   */
  headCommitId?: string;

  /**
   * Initial color index for color rotation.
   * Useful for consistent coloring across refreshes.
   * @default 0
   */
  initialColorIndex?: number;

  /**
   * Tracked branch information for VS Code-style coloring.
   * When provided, commits will have segmentType assigned based on
   * their position relative to the current, upstream, and base branches.
   */
  trackedBranches?: TrackedBranchInfo;
}

// =============================================================================
// Main Algorithm
// =============================================================================

/**
 * Compute swimlane positions for a list of commits.
 *
 * Transforms raw commits into graph nodes with:
 * - Lane index (x-position for the commit circle)
 * - Input swimlanes (lanes entering from above)
 * - Output swimlanes (lanes exiting below)
 * - Merge/HEAD indicators
 *
 * @param commits - Commits in topological order (newest first)
 * @param options - Optional configuration
 * @returns Array of CommitGraphNode with swimlane data
 *
 * @example
 * ```ts
 * const commits = await git.getCommitHistory();
 * const nodes = computeSwimlanes(commits, { headCommitId: 'abc123' });
 *
 * nodes.forEach(node => {
 *   console.log(`${node.commit.shortId} at lane ${node.laneIndex}`);
 * });
 * ```
 */
export function computeSwimlanes(
  commits: HistoryCommit[],
  options: ComputeSwimlanesOptions = {},
): CommitGraphNode[] {
  const { headCommitId, initialColorIndex = 0, trackedBranches } = options;

  // Handle empty input
  if (commits.length === 0) {
    return [];
  }

  const result: CommitGraphNode[] = [];

  // Active swimlanes - mutable during processing
  let activeLanes: MutableSwimlane[] = [];

  // Color index for assigning colors to new lanes
  let colorIndex = initialColorIndex;

  for (const commit of commits) {
    // Step 1: Find which lane this commit belongs to
    let laneIndex = findLaneForCommit(activeLanes, commit.id);

    // Step 2: If no lane targets this commit, create a new lane
    if (laneIndex === -1) {
      laneIndex = activeLanes.length;
      activeLanes.push({
        targetId: commit.id,
        color: getNextColor(colorIndex++),
      });
    }

    // Step 3: Capture input swimlanes (immutable snapshot)
    const inputSwimlanes = snapshotSwimlanes(activeLanes);

    // Step 4: Update lanes based on this commit's parents
    activeLanes = updateLanesForCommit(activeLanes, laneIndex, commit, () =>
      getNextColor(colorIndex++),
    );

    // Step 5: Capture output swimlanes
    // NOTE: We do NOT collapse duplicate lanes here. When multiple lanes target
    // the same commit (branch convergence), we keep them all so that when we
    // process that commit, we can draw incoming curves for each converging branch.
    // The lanes are naturally "consumed" when their target commit is processed.
    const outputSwimlanes = snapshotSwimlanes(activeLanes);

    // Build the graph node (segmentType will be assigned in post-processing)
    result.push({
      commit,
      laneIndex,
      inputSwimlanes,
      outputSwimlanes,
      isMerge: commit.parentIds.length > 1,
      isHead: commit.id === headCommitId,
      segmentType: null, // Will be assigned by assignSegmentTypes
    });
  }

  // Post-process to assign segment types based on tracked branches
  // Returns a new array with segment types applied (pure function)
  return assignSegmentTypes(result, trackedBranches);
}

// =============================================================================
// Segment Type Assignment
// =============================================================================

/**
 * Assign segment types to nodes based on tracked branch information.
 *
 * Segments are assigned by walking the first-parent chain from HEAD:
 * - Commits from HEAD to upstream: "current" (blue)
 * - Commits from upstream to base: "upstream" (purple)
 * - Commits from base onwards: "base" (orange)
 * - Commits not on the main path: null (default colors)
 *
 * This is a pure function - returns a new array with segment types applied.
 *
 * @param nodes - Graph nodes (not mutated)
 * @param trackedBranches - Tracked branch information
 * @returns New array of nodes with segment types assigned
 */
function assignSegmentTypes(
  nodes: CommitGraphNode[],
  trackedBranches?: TrackedBranchInfo,
): CommitGraphNode[] {
  // If no tracked branches, return nodes as-is (segment types already null)
  if (!trackedBranches || nodes.length === 0) {
    return nodes;
  }

  const { upstream, base } = trackedBranches;
  const upstreamId = upstream?.commitId;
  const baseId = base?.commitId;

  // Build a map for quick commit lookup (using original nodes for traversal)
  const nodeMap = new Map<string, CommitGraphNode>();
  for (const node of nodes) {
    nodeMap.set(node.commit.id, node);
  }

  // Find commits on the main path (first-parent chain from HEAD)
  // The first commit in the list is HEAD (newest)
  const mainPathIds = new Set<string>();
  let currentId: string | undefined = nodes[0]?.commit.id;

  while (currentId) {
    const node = nodeMap.get(currentId);
    if (!node) break;

    mainPathIds.add(currentId);
    // Follow first parent
    currentId = node.commit.parentIds[0];
  }

  // First pass: Determine segment type for each node
  const segmentTypes = new Map<string, SegmentColor | null>();
  let currentSegment: SegmentColor = "current";
  let sawUpstream = false;
  let sawBase = false;

  for (const node of nodes) {
    // Only main path commits get segment colors
    if (!mainPathIds.has(node.commit.id)) {
      segmentTypes.set(node.commit.id, null);
      continue;
    }

    // Check for segment transitions BEFORE assigning
    // This ensures the tracked branch commit gets the NEW segment color
    if (!sawUpstream && upstreamId && node.commit.id === upstreamId) {
      sawUpstream = true;
      currentSegment = "upstream";
    } else if (!sawBase && baseId && node.commit.id === baseId) {
      // This handles both cases:
      // 1. Normal case: transitioning from upstream to base
      // 2. No upstream case: transitioning directly from current to base
      sawBase = true;
      currentSegment = "base";
    }

    segmentTypes.set(node.commit.id, currentSegment);
  }

  // Second pass: Create new nodes with segment types and propagate to swimlanes
  // Track the "active segment" as we process nodes top-to-bottom.
  // Pass-through lanes for the main branch should use the active segment,
  // not the segment of their target (which might be further down in a different segment).

  // Segment colors should ONLY apply to the main branch line.
  // Side branches keep their swimlane colors throughout.
  //
  // Strategy: Track which lane index the main branch is at. Only swimlanes
  // at that lane index get segment colors. All other lanes keep swimlane colors.

  let activeSegment: SegmentColor | null = null;
  let mainLaneIndex = 0; // Main branch is typically at lane 0

  return nodes.map((node) => {
    const nodeSegmentType = segmentTypes.get(node.commit.id) ?? null;

    // Clone swimlanes for modification
    const newInputSwimlanes = node.inputSwimlanes.map((s) => ({ ...s }));
    const newOutputSwimlanes = node.outputSwimlanes.map((s) => ({ ...s }));

    if (nodeSegmentType) {
      // This is a main path node - update tracking
      const prevSegment = activeSegment ?? nodeSegmentType;
      activeSegment = nodeSegmentType;
      mainLaneIndex = node.laneIndex;

      // Only assign segment color to swimlanes at the main lane index
      if (newInputSwimlanes[mainLaneIndex]) {
        newInputSwimlanes[mainLaneIndex].segmentColor = prevSegment;
      }
      if (newOutputSwimlanes[mainLaneIndex]) {
        newOutputSwimlanes[mainLaneIndex].segmentColor = activeSegment;
      }
    } else if (activeSegment !== null) {
      // Side branch node - only the pass-through at mainLaneIndex gets segment color
      if (newInputSwimlanes[mainLaneIndex]) {
        newInputSwimlanes[mainLaneIndex].segmentColor = activeSegment;
      }
      if (newOutputSwimlanes[mainLaneIndex]) {
        newOutputSwimlanes[mainLaneIndex].segmentColor = activeSegment;
      }
    }

    return {
      ...node,
      segmentType: nodeSegmentType,
      inputSwimlanes: newInputSwimlanes,
      outputSwimlanes: newOutputSwimlanes,
    };
  });
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find the lane index that targets a specific commit.
 *
 * @param lanes - Current active lanes
 * @param commitId - Commit ID to find
 * @returns Lane index, or -1 if not found
 */
function findLaneForCommit(lanes: MutableSwimlane[], commitId: string): number {
  return lanes.findIndex((lane) => lane.targetId === commitId);
}

/**
 * Create an immutable snapshot of the current lanes.
 *
 * @param lanes - Mutable lanes to snapshot
 * @returns Immutable Swimlane array
 */
function snapshotSwimlanes(lanes: MutableSwimlane[]): Swimlane[] {
  return lanes.map((lane) => ({
    targetId: lane.targetId,
    color: lane.color,
    segmentColor: lane.segmentColor,
  }));
}

/**
 * Update lanes after processing a commit.
 *
 * This follows VS Code's approach:
 * - ALL lanes targeting the current commit are "consumed" (removed from output)
 * - The first parent replaces one of those lanes (keeping its color)
 * - Additional parents are added as new lanes
 * - Other lanes (not targeting current commit) pass through unchanged
 *
 * This is crucial for proper branch visualization:
 * - When multiple branches converge on a commit, all their lanes are in input
 * - They all get consumed, so the renderer can draw curves for each
 * - Only parent lane(s) continue in the output
 *
 * @param lanes - Current lanes (will be cloned, not mutated)
 * @param commitLaneIndex - Index of the lane containing this commit
 * @param commit - The commit being processed
 * @param getNewColor - Function to get next color for new lanes
 * @returns Updated lanes array
 */
function updateLanesForCommit(
  lanes: MutableSwimlane[],
  commitLaneIndex: number,
  commit: HistoryCommit,
  getNewColor: () => GraphColor,
): MutableSwimlane[] {
  const outputLanes: MutableSwimlane[] = [];
  let firstParentAdded = false;

  // Process each input lane
  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i];

    if (lane.targetId === commit.id) {
      // This lane targets the current commit - consume it
      // Add first parent in its place (once)
      if (!firstParentAdded && commit.parentIds.length > 0) {
        outputLanes.push({
          targetId: commit.parentIds[0],
          color: lane.color, // Keep the lane's color for the parent
        });
        firstParentAdded = true;
      }
      // Skip this lane (it's consumed)
      continue;
    }

    // Lane doesn't target current commit - pass it through
    outputLanes.push({ ...lane });
  }

  // Add remaining parents as new lanes (for merge commits)
  for (let i = firstParentAdded ? 1 : 0; i < commit.parentIds.length; i++) {
    outputLanes.push({
      targetId: commit.parentIds[i],
      color: getNewColor(),
    });
  }

  return outputLanes;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the maximum number of lanes at any point in the graph.
 *
 * Useful for determining the width of the graph column.
 *
 * @param nodes - Computed graph nodes
 * @returns Maximum lane count
 */
export function getMaxLaneCount(nodes: CommitGraphNode[]): number {
  if (nodes.length === 0) return 0;

  let maxLanes = 0;
  for (const node of nodes) {
    maxLanes = Math.max(
      maxLanes,
      node.inputSwimlanes.length,
      node.outputSwimlanes.length,
    );
  }
  return maxLanes;
}

/**
 * Find a commit node by its ID.
 *
 * @param nodes - Computed graph nodes
 * @param commitId - Commit ID to find
 * @returns The node, or undefined if not found
 */
export function findNodeByCommitId(
  nodes: CommitGraphNode[],
  commitId: string,
): CommitGraphNode | undefined {
  return nodes.find((node) => node.commit.id === commitId);
}

/**
 * Get the lane index for a commit.
 *
 * @param nodes - Computed graph nodes
 * @param commitId - Commit ID to find
 * @returns Lane index, or -1 if not found
 */
export function getLaneIndexForCommit(
  nodes: CommitGraphNode[],
  commitId: string,
): number {
  const node = findNodeByCommitId(nodes, commitId);
  return node?.laneIndex ?? -1;
}
