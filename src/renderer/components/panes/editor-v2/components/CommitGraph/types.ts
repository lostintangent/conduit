/**
 * CommitGraph - Type Definitions
 *
 * This module defines the core types for the commit graph visualization.
 * The type system is designed around the swimlane graph model, where:
 *
 * - Each commit occupies a lane (vertical track)
 * - Swimlanes represent lines of development
 * - The graph shows how branches diverge and merge
 *
 * Key type categories:
 * - Commit types: Re-exported from GitV2API (canonical source)
 * - Graph types: Computed visualization data
 * - Render types: SVG rendering instructions
 * - State types: Component state management
 *
 * @see docs/architecture/commit-graph-design.md
 */

// ============================================================================
// Re-exported Types from Git API
// ============================================================================
// These are the canonical types from the Git layer. Re-exported here for
// convenience so consumers can import everything from CommitGraph/types.

import type {
  CommitFile as GitCommitFile,
  HistoryCommit as GitHistoryCommit,
} from "@/api/GitV2API";

// Re-export with original names for external consumers
export type { GitCommitFile as CommitFile, GitHistoryCommit as HistoryCommit };

// Alias for local use in this file
type HistoryCommit = GitHistoryCommit;
type CommitFile = GitCommitFile;

// ============================================================================
// Ref Types - Branch and tag information
// ============================================================================

/**
 * Type of git reference.
 *
 * - head: Local branch (refs/heads/*)
 * - remote: Remote tracking branch (refs/remotes/*)
 * - tag: Tag (refs/tags/*)
 */
export type RefType = "head" | "remote" | "tag";

/**
 * A parsed git reference (branch or tag).
 *
 * Git refs are parsed from the raw string format returned by git log --decorate.
 * Examples of raw refs:
 * - "HEAD -> main" → { type: "head", name: "main", isHead: true }
 * - "origin/main" → { type: "remote", name: "main", remote: "origin" }
 * - "tag: v1.0.0" → { type: "tag", name: "v1.0.0" }
 */
export interface GitRef {
  /** Type of reference */
  type: RefType;

  /** Display name (branch name, tag name without prefix) */
  name: string;

  /** Remote name for remote refs (e.g., "origin") */
  remote?: string;

  /** True if this ref is HEAD (current branch) */
  isHead?: boolean;
}

// ============================================================================
// Commit Types - Additional types for graph visualization
// ============================================================================

/**
 * Statistics for a commit's changes.
 */
export interface CommitStats {
  /** Number of files changed */
  filesChanged: number;

  /** Total lines inserted */
  insertions: number;

  /** Total lines deleted */
  deletions: number;
}

// ============================================================================
// Segment Types - Tracked branch segment coloring
// ============================================================================

/**
 * Segment color based on tracked branch relationships.
 *
 * Used for VS Code-style branch coloring where:
 * - 'current': Commits only in the current local branch (blue)
 * - 'upstream': Commits in upstream but not in base (purple)
 * - 'base': Commits in the base/origin branch (orange)
 * - null: Default coloring (commits not in the main tracking chain)
 */
export type SegmentColor = "current" | "upstream" | "base" | null;

// ============================================================================
// Graph Types - Computed visualization data
// ============================================================================

/**
 * Color identifiers for graph elements.
 *
 * Colors serve semantic purposes:
 * - 'current': The current branch (HEAD)
 * - 'remote': Remote tracking branches
 * - 'base': Base/upstream reference for comparisons
 * - 'branch-N': Rotating palette for other branches
 *
 * These map to CSS custom properties for theming support.
 */
export type GraphColor =
  | "current"
  | "remote"
  | "base"
  | "branch-1"
  | "branch-2"
  | "branch-3"
  | "branch-4"
  | "branch-5";

/**
 * A swimlane in the graph - represents a line of development.
 *
 * Swimlanes are the vertical tracks that commits travel along.
 * Each swimlane tracks toward a specific commit (its target).
 * When we encounter that commit, the swimlane continues to its parent
 * or terminates if it's a root commit.
 */
export interface Swimlane {
  /**
   * The commit ID this swimlane is tracking toward.
   * When we process this commit, the lane will update to track its parent.
   */
  targetId: string;

  /** Color for this swimlane's line and connecting curves */
  color: GraphColor;

  /**
   * Segment color for tracked branch visualization.
   * When set, overrides the default color for VS Code-style coloring.
   */
  segmentColor?: SegmentColor;
}

/**
 * A commit with computed graph positioning.
 *
 * This is the primary type used for rendering. It augments a HistoryCommit
 * with the swimlane data needed to render the graph:
 *
 * - laneIndex: Which column (x-position) this commit occupies
 * - inputSwimlanes: Active lanes entering this row from above
 * - outputSwimlanes: Active lanes exiting this row below
 *
 * The difference between input and output swimlanes determines
 * what curves and lines to draw (merges, branches, pass-throughs).
 */
export interface CommitGraphNode {
  /** The underlying commit data */
  commit: HistoryCommit;

  /** Lane index (0-based x-position) where this commit's circle appears */
  laneIndex: number;

  /**
   * Swimlanes entering this row from above.
   * These represent the state of active branches BEFORE processing this commit.
   */
  inputSwimlanes: Swimlane[];

  /**
   * Swimlanes exiting this row below.
   * These represent the state of active branches AFTER processing this commit.
   * May differ from input due to:
   * - Lane updating to track parent (normal commit)
   * - Lane terminating (root commit)
   * - New lanes added (merge commit with additional parents)
   * - Lanes collapsing (multiple lanes targeting same commit)
   */
  outputSwimlanes: Swimlane[];

  /** True if this commit has multiple parents (merge commit) */
  isMerge: boolean;

  /** True if this is the HEAD commit */
  isHead: boolean;

  /**
   * Segment type for VS Code-style tracked branch coloring.
   * Determines the color of the commit node based on its position
   * relative to tracked branches (current, upstream, base).
   */
  segmentType: SegmentColor;

  /** Files changed in this commit (lazy-loaded when expanded) */
  files?: CommitFile[];

  /** True while files are being fetched */
  isLoadingFiles?: boolean;
}

// ============================================================================
// Render Types - SVG rendering instructions
// ============================================================================

/**
 * Configuration for graph rendering.
 *
 * Controls the dimensions and styling of the SVG graph.
 * These values are typically constants but passed as config
 * to allow flexibility and testing.
 */
export interface GraphRenderConfig {
  /** Width of each swimlane column in pixels */
  laneWidth: number;

  /** Height of a standard (collapsed) row in pixels */
  rowHeight: number;

  /** Radius of the commit circle in pixels */
  circleRadius: number;

  /** Radius for curves when lanes merge/split */
  curveRadius: number;

  /** Stroke width for graph lines */
  strokeWidth: number;

  /** Gap between lines and commit circles */
  lineGap: number;
}

/**
 * SVG path data for a graph line segment.
 *
 * Represents a single line or curve in the graph, with its
 * SVG path definition and styling information.
 */
export interface GraphPath {
  /**
   * SVG path 'd' attribute value.
   * Uses standard SVG path commands:
   * - M x y: Move to
   * - L x y: Line to
   * - Q cx cy x y: Quadratic curve
   */
  d: string;

  /** Color identifier for stroke */
  color: GraphColor;

  /**
   * True if this line passes through without connecting to the commit.
   * Used for lanes that continue past a commit in another lane.
   */
  isPassThrough: boolean;
}

/**
 * Circle data for rendering a commit point.
 *
 * The style determines visual treatment:
 * - 'head': Double circle (outer ring + inner fill) for HEAD
 * - 'merge': Standard circle (merge commits aren't specially styled)
 * - 'normal': Standard filled circle
 */
export interface GraphCircle {
  /** Center X position in pixels */
  cx: number;

  /** Center Y position in pixels */
  cy: number;

  /** Circle radius in pixels */
  r: number;

  /** Fill/stroke color */
  color: GraphColor;

  /** Visual style variant */
  style: "head" | "merge" | "normal";
}

/**
 * Complete render data for a single graph cell (row).
 *
 * Contains everything needed to render the SVG for one commit's
 * graph column. This is computed by GraphRenderer and consumed
 * by GraphCell for rendering.
 */
export interface GraphCellRenderData {
  /** Total width of the SVG in pixels */
  width: number;

  /** Total height of the SVG in pixels */
  height: number;

  /** All path elements to render (lines, curves) */
  paths: GraphPath[];

  /** The commit circle to render */
  circle: GraphCircle;
}

// ============================================================================
// State Types - Component state management
// ============================================================================

/**
 * State for the commit graph panel.
 *
 * Managed by the useCommitGraph hook, this tracks:
 * - The computed graph nodes
 * - Loading and error states
 * - User interaction state (expansion, selection)
 */
export interface CommitGraphState {
  /** Computed graph nodes with swimlane data */
  nodes: CommitGraphNode[];

  /** True if more commits are available (pagination) */
  hasMore: boolean;

  /** True during initial load */
  isLoading: boolean;

  /** True while loading more commits (pagination) */
  isLoadingMore: boolean;

  /** Error message if loading failed */
  error: string | null;

  /** Set of commit IDs that are expanded to show files */
  expandedCommits: Set<string>;

  /** Currently focused commit ID (for keyboard navigation) */
  selectedCommitId: string | null;
}

// ============================================================================
// Callback Types - Component communication
// ============================================================================

/**
 * Data passed when a file within a commit is selected.
 *
 * Contains everything needed to display a historical diff:
 * - The file that was selected
 * - The commit containing the change
 * - The parent commit for comparison
 */
export interface CommitFileSelectEvent {
  /** The selected file */
  file: CommitFile;

  /** The commit containing this file change */
  commitId: string;

  /** Parent commit for diff comparison (first parent for merges) */
  parentCommitId: string;
}

/**
 * Data passed when "view all changes" is requested for a commit.
 *
 * Used to open the CommitReviewPane showing all files in a commit.
 */
export interface CommitViewEvent {
  /** The commit to view */
  commitId: string;

  /** Parent commit for diff comparison */
  parentCommitId: string;

  /** Commit metadata for display */
  commit: HistoryCommit;
}
