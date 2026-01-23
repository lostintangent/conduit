/**
 * Tests for the CommitGraphRow component.
 *
 * These tests verify the row component that combines
 * the graph visualization with commit summary and files panel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommitGraphRow } from "@/components/panes/editor/components/CommitGraph/CommitGraphRow";
import type {
  CommitGraphNode,
  GraphRenderConfig,
  CommitFile,
} from "@/components/panes/editor/components/CommitGraph/types";
import { GRAPH_CONFIG } from "@/components/panes/editor/components/CommitGraph/graph/constants";

// =============================================================================
// Test Helpers
// =============================================================================

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

function renderWithProvider(ui: React.ReactElement) {
  return render(ui, { wrapper: TestWrapper });
}

// =============================================================================
// Test Fixtures
// =============================================================================

const createCommit = (overrides = {}) => ({
  id: "abc123def456",
  shortId: "abc123d",
  subject: "Fix authentication bug in login flow",
  message: "Fix authentication bug in login flow\n\nMore details here.",
  author: "John Doe",
  authorEmail: "john@example.com",
  timestamp: Date.now() / 1000 - 7200, // 2 hours ago
  parentIds: ["parent123"],
  ...overrides,
});

const createNode = (overrides = {}): CommitGraphNode => ({
  commit: createCommit(),
  laneIndex: 0,
  inputSwimlanes: [{ targetId: "abc123def456", color: "current" as const }],
  outputSwimlanes: [{ targetId: "parent123", color: "current" as const }],
  isMerge: false,
  isHead: false,
  segmentType: null,
  files: undefined,
  isLoadingFiles: false,
  ...overrides,
});

const createFiles = (): CommitFile[] => [
  { path: "src/index.ts", status: "modified", additions: 10, deletions: 5 },
  { path: "src/utils.ts", status: "added", additions: 25, deletions: 0 },
  { path: "old-file.ts", status: "deleted", additions: 0, deletions: 15 },
];

// =============================================================================
// Tests
// =============================================================================

describe("CommitGraphRow", () => {
  const NOW = 1702400000000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rendering", () => {
    it("should render with data-testid", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
        />,
      );
      expect(screen.getByTestId("commit-graph-row")).toBeTruthy();
    });

    it("should include commit id as data attribute", () => {
      const node = createNode();
      renderWithProvider(
        <CommitGraphRow node={node} isExpanded={false} config={GRAPH_CONFIG} />,
      );
      expect(
        screen.getByTestId("commit-graph-row").getAttribute("data-commit-id"),
      ).toBe(node.commit.id);
    });

    it("should render graph column", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
        />,
      );
      expect(screen.getByTestId("graph-column")).toBeTruthy();
    });

    it("should render commit summary", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
        />,
      );
      expect(screen.getByTestId("commit-summary")).toBeTruthy();
    });

    it("should display commit subject", () => {
      const node = createNode();
      renderWithProvider(
        <CommitGraphRow node={node} isExpanded={false} config={GRAPH_CONFIG} />,
      );
      expect(screen.getByText(node.commit.subject)).toBeTruthy();
    });

    it("should display author name", () => {
      const node = createNode();
      renderWithProvider(
        <CommitGraphRow node={node} isExpanded={false} config={GRAPH_CONFIG} />,
      );
      expect(screen.getByText(node.commit.author)).toBeTruthy();
    });
  });

  describe("collapsed state", () => {
    it("should not show expanded content when collapsed", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
        />,
      );
      expect(screen.queryByTestId("expanded-content")).toBeNull();
    });

    it("should not show files panel when collapsed", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
        />,
      );
      expect(screen.queryByTestId("commit-files-panel")).toBeNull();
    });

    it("should have aria-expanded false when collapsed", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
        />,
      );
      expect(
        screen.getByTestId("commit-summary-row").getAttribute("aria-expanded"),
      ).toBe("false");
    });
  });

  describe("expanded state", () => {
    it("should show expanded content when expanded", () => {
      const node = createNode({ files: createFiles() });
      renderWithProvider(
        <CommitGraphRow node={node} isExpanded={true} config={GRAPH_CONFIG} />,
      );
      expect(screen.getByTestId("expanded-content")).toBeTruthy();
    });

    it("should show files panel when expanded with files", () => {
      const node = createNode({ files: createFiles() });
      renderWithProvider(
        <CommitGraphRow node={node} isExpanded={true} config={GRAPH_CONFIG} />,
      );
      expect(screen.getByTestId("commit-files-panel")).toBeTruthy();
    });

    it("should show loading state when files are loading", () => {
      const node = createNode({ isLoadingFiles: true });
      renderWithProvider(
        <CommitGraphRow node={node} isExpanded={true} config={GRAPH_CONFIG} />,
      );
      expect(screen.getByTestId("files-loading")).toBeTruthy();
    });

    it("should have aria-expanded true when expanded", () => {
      const node = createNode({ files: createFiles() });
      renderWithProvider(
        <CommitGraphRow node={node} isExpanded={true} config={GRAPH_CONFIG} />,
      );
      expect(
        screen.getByTestId("commit-summary-row").getAttribute("aria-expanded"),
      ).toBe("true");
    });

    it("should display file count in header", () => {
      const node = createNode({ files: createFiles() });
      renderWithProvider(
        <CommitGraphRow node={node} isExpanded={true} config={GRAPH_CONFIG} />,
      );
      expect(screen.getByText("3 files changed")).toBeTruthy();
    });
  });

  describe("click handling", () => {
    it("should call onToggle when row is clicked", () => {
      const onToggle = vi.fn();
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
          onToggle={onToggle}
        />,
      );

      fireEvent.click(screen.getByTestId("commit-summary-row"));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("should not call onToggle when view all button is clicked", () => {
      const onToggle = vi.fn();
      const onViewAll = vi.fn();
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
          onToggle={onToggle}
          onViewAll={onViewAll}
        />,
      );

      // Click the view all button (inside commit summary)
      fireEvent.click(screen.getByTestId("view-all-button"));
      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  describe("view all button", () => {
    it("should call onViewAll when view all button is clicked", () => {
      const onViewAll = vi.fn();
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
          onViewAll={onViewAll}
        />,
      );

      fireEvent.click(screen.getByTestId("view-all-button"));
      expect(onViewAll).toHaveBeenCalledTimes(1);
    });

    it("should not show view all button when onViewAll is not provided", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
        />,
      );
      expect(screen.queryByTestId("view-all-button")).toBeNull();
    });
  });

  describe("file selection", () => {
    it("should call onFileSelect when a file is clicked", () => {
      const files = createFiles();
      const node = createNode({ files });
      const onFileSelect = vi.fn();

      renderWithProvider(
        <CommitGraphRow
          node={node}
          isExpanded={true}
          config={GRAPH_CONFIG}
          onFileSelect={onFileSelect}
        />,
      );

      // Click on a file item (test id uses just filename, not full path)
      const fileItem = screen.getByTestId("commit-file-item-index.ts");
      fireEvent.click(fileItem);

      expect(onFileSelect).toHaveBeenCalledTimes(1);
      expect(onFileSelect).toHaveBeenCalledWith(files[0]);
    });

    it("should highlight selected file", () => {
      const files = createFiles();
      const node = createNode({ files });

      renderWithProvider(
        <CommitGraphRow
          node={node}
          isExpanded={true}
          config={GRAPH_CONFIG}
          selectedFilePath="src/index.ts"
        />,
      );

      // Test id uses just filename, and selected uses bg-accent/30 class
      const fileItem = screen.getByTestId("commit-file-item-index.ts");
      expect(fileItem.getAttribute("data-selected")).toBe("true");
    });
  });

  describe("keyboard interaction", () => {
    it("should have tabIndex 0 for keyboard focus", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
        />,
      );
      expect(
        screen.getByTestId("commit-summary-row").getAttribute("tabIndex"),
      ).toBe("0");
    });

    it("should call onToggle on Enter key", () => {
      const onToggle = vi.fn();
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
          onToggle={onToggle}
        />,
      );

      fireEvent.keyDown(screen.getByTestId("commit-summary-row"), {
        key: "Enter",
      });
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("should call onToggle on Space key", () => {
      const onToggle = vi.fn();
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
          onToggle={onToggle}
        />,
      );

      fireEvent.keyDown(screen.getByTestId("commit-summary-row"), { key: " " });
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("should have role button", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
        />,
      );
      expect(
        screen.getByTestId("commit-summary-row").getAttribute("role"),
      ).toBe("button");
    });

    it("should have aria-label with commit subject", () => {
      const node = createNode();
      renderWithProvider(
        <CommitGraphRow node={node} isExpanded={false} config={GRAPH_CONFIG} />,
      );
      expect(
        screen.getByTestId("commit-summary-row").getAttribute("aria-label"),
      ).toBe(`Commit: ${node.commit.subject}`);
    });
  });

  describe("selected state", () => {
    it("should apply selected styling when isSelected is true", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
          isSelected={true}
        />,
      );

      const summaryRow = screen.getByTestId("commit-summary-row");
      // Uses same selected color as FileTreeItem
      expect(summaryRow.classList.contains("bg-accent/20")).toBe(true);
    });

    it("should not apply selected styling when isSelected is false", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
          isSelected={false}
        />,
      );

      const summaryRow = screen.getByTestId("commit-summary-row");
      expect(summaryRow.classList.contains("bg-accent/20")).toBe(false);
    });
  });

  describe("HEAD commit", () => {
    it("should style HEAD commit subject with font-medium", () => {
      const node = createNode({ isHead: true });
      renderWithProvider(
        <CommitGraphRow node={node} isExpanded={false} config={GRAPH_CONFIG} />,
      );
      expect(
        screen.getByTestId("commit-subject").classList.contains("font-medium"),
      ).toBe(true);
    });

    it("should not style non-HEAD commit subject with font-medium", () => {
      const node = createNode({ isHead: false });
      renderWithProvider(
        <CommitGraphRow node={node} isExpanded={false} config={GRAPH_CONFIG} />,
      );
      expect(
        screen.getByTestId("commit-subject").classList.contains("font-medium"),
      ).toBe(false);
    });
  });

  describe("styling", () => {
    it("should apply custom className", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
          className="custom-class"
        />,
      );

      const row = screen.getByTestId("commit-graph-row");
      expect(row.classList.contains("custom-class")).toBe(true);
    });

    it("should have hover styling classes on summary row", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
        />,
      );

      const summaryRow = screen.getByTestId("commit-summary-row");
      // Uses same hover color as FileTreeItem
      expect(summaryRow.classList.contains("hover:bg-foreground/10")).toBe(
        true,
      );
    });

    it("should have cursor-pointer class on summary row", () => {
      renderWithProvider(
        <CommitGraphRow
          node={createNode()}
          isExpanded={false}
          config={GRAPH_CONFIG}
        />,
      );

      const summaryRow = screen.getByTestId("commit-summary-row");
      expect(summaryRow.classList.contains("cursor-pointer")).toBe(true);
    });
  });

  describe("merge commits", () => {
    it("should render merge commit correctly", () => {
      const node = createNode({
        isMerge: true,
        commit: createCommit({ parentIds: ["parent1", "parent2"] }),
      });

      renderWithProvider(
        <CommitGraphRow node={node} isExpanded={false} config={GRAPH_CONFIG} />,
      );

      expect(screen.getByTestId("commit-graph-row")).toBeTruthy();
    });
  });

  describe("empty files", () => {
    it("should show empty state when expanded with no files", () => {
      const node = createNode({ files: [] });
      renderWithProvider(
        <CommitGraphRow node={node} isExpanded={true} config={GRAPH_CONFIG} />,
      );

      expect(screen.getByTestId("files-empty")).toBeTruthy();
    });
  });
});
