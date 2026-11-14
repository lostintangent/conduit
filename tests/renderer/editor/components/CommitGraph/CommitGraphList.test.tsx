/**
 * Tests for the CommitGraphList component.
 *
 * These tests verify the list container that renders commit rows
 * with keyboard navigation and load more functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommitGraphList } from "@/components/panes/editor/components/CommitGraph/CommitGraphList";
import type {
  CommitGraphNode,
  HistoryCommit,
} from "@/components/panes/editor/components/CommitGraph/types";

// =============================================================================
// Test Helpers
// =============================================================================

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

function renderWithProvider(ui: React.ReactElement) {
  return render(ui, { wrapper: TestWrapper });
}

function createCommit(id: string, subject: string): HistoryCommit {
  return {
    id,
    shortId: id.slice(0, 7),
    subject,
    message: subject,
    author: "Test Author",
    authorEmail: "test@example.com",
    timestamp: Date.now() / 1000 - 3600,
    parentIds: [],
  };
}

function createNode(id: string, subject: string): CommitGraphNode {
  return {
    commit: createCommit(id, subject),
    laneIndex: 0,
    inputSwimlanes: [{ targetId: id, color: "current" as const }],
    outputSwimlanes: [],
    isMerge: false,
    isHead: id === "commit1",
    segmentType: null,
    files: undefined,
    isLoadingFiles: false,
  };
}

function createNodes(count: number): CommitGraphNode[] {
  const nodes: CommitGraphNode[] = [];
  for (let i = 1; i <= count; i++) {
    nodes.push(createNode(`commit${i}`, `Commit message ${i}`));
  }
  return nodes;
}

// =============================================================================
// Tests
// =============================================================================

describe("CommitGraphList", () => {
  const NOW = 1702400000000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rendering", () => {
    it("should render all commit rows", () => {
      const nodes = createNodes(3);
      renderWithProvider(
        <CommitGraphList nodes={nodes} expandedCommits={new Set()} />,
      );

      expect(screen.getAllByTestId("commit-graph-row")).toHaveLength(3);
    });

    it("should display commit subjects", () => {
      const nodes = createNodes(2);
      renderWithProvider(
        <CommitGraphList nodes={nodes} expandedCommits={new Set()} />,
      );

      expect(screen.getByText("Commit message 1")).toBeTruthy();
      expect(screen.getByText("Commit message 2")).toBeTruthy();
    });

    it("should expose the commits as a named list of items", () => {
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(3)}
          expandedCommits={new Set()}
          hasMore={true}
        />,
      );
      const list = screen.getByRole("list", { name: "Commit list" });
      expect(
        Array.from(list.children, (child) => child.getAttribute("role")),
      ).toEqual(["listitem", "listitem", "listitem", "listitem"]);
    });
  });

  describe("empty state", () => {
    it("should show empty message when no nodes", () => {
      renderWithProvider(
        <CommitGraphList nodes={[]} expandedCommits={new Set()} />,
      );
      expect(screen.getByTestId("empty-list")).toBeTruthy();
      expect(screen.getByText("No commits to display")).toBeTruthy();
    });

    it("should not show empty message when hasMore is true", () => {
      renderWithProvider(
        <CommitGraphList
          nodes={[]}
          expandedCommits={new Set()}
          hasMore={true}
        />,
      );
      expect(screen.queryByTestId("empty-list")).toBeNull();
    });
  });

  describe("expanded state", () => {
    it("should mark row as expanded when in expandedCommits", () => {
      const nodes = createNodes(2);
      renderWithProvider(
        <CommitGraphList
          nodes={nodes}
          expandedCommits={new Set(["commit1"])}
        />,
      );

      const summaryRows = screen.getAllByTestId("commit-summary-row");
      expect(summaryRows[0].getAttribute("aria-expanded")).toBe("true");
      expect(summaryRows[1].getAttribute("aria-expanded")).toBe("false");
    });
  });

  describe("selected state", () => {
    it("should mark row as selected when selectedCommitId matches", () => {
      const nodes = createNodes(3);
      renderWithProvider(
        <CommitGraphList
          nodes={nodes}
          expandedCommits={new Set()}
          selectedCommitId="commit2"
        />,
      );

      // The keyboard cursor has no ARIA state in a plain list (it would need
      // the listbox or tree focus pattern), so this checks the highlight.
      const summaryRows = screen.getAllByTestId("commit-summary-row");
      expect(summaryRows[1].classList.contains("bg-accent/20")).toBe(true);
    });
  });

  describe("load more button", () => {
    it("should not show load more button when hasMore is false", () => {
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(2)}
          expandedCommits={new Set()}
          hasMore={false}
        />,
      );
      expect(screen.queryByTestId("load-more-button")).toBeNull();
    });

    it("should show load more button when hasMore is true", () => {
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(2)}
          expandedCommits={new Set()}
          hasMore={true}
        />,
      );
      expect(screen.getByRole("button", { name: "Load More" })).toBeDefined();
    });

    it("should call onLoadMore when button is clicked", () => {
      const onLoadMore = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(2)}
          expandedCommits={new Set()}
          hasMore={true}
          onLoadMore={onLoadMore}
        />,
      );

      fireEvent.click(screen.getByTestId("load-more-button"));

      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    it("should not call onLoadMore when isLoadingMore is true", () => {
      const onLoadMore = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(2)}
          expandedCommits={new Set()}
          hasMore={true}
          isLoadingMore={true}
          onLoadMore={onLoadMore}
        />,
      );

      fireEvent.click(screen.getByTestId("load-more-button"));

      expect(onLoadMore).not.toHaveBeenCalled();
    });

    it("should show loading text when isLoadingMore is true", () => {
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(2)}
          expandedCommits={new Set()}
          hasMore={true}
          isLoadingMore={true}
        />,
      );

      expect(screen.getByText("Loading...")).toBeTruthy();
    });

    it("should disable button when isLoadingMore is true", () => {
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(2)}
          expandedCommits={new Set()}
          hasMore={true}
          isLoadingMore={true}
        />,
      );

      const button = screen.getByTestId("load-more-button");
      expect(button.hasAttribute("disabled")).toBe(true);
    });
  });

  describe("row interactions", () => {
    it("should call onToggleExpand when row is clicked", () => {
      const onToggleExpand = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(2)}
          expandedCommits={new Set()}
          onToggleExpand={onToggleExpand}
        />,
      );

      fireEvent.click(screen.getAllByTestId("commit-summary-row")[0]);

      expect(onToggleExpand).toHaveBeenCalledWith("commit1");
    });

    it("should call onViewAll when view all button is clicked", () => {
      const onViewAll = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(2)}
          expandedCommits={new Set()}
          onViewAll={onViewAll}
        />,
      );

      fireEvent.click(screen.getAllByTestId("view-all-button")[0]);

      expect(onViewAll).toHaveBeenCalledWith("commit1");
    });
  });

  describe("keyboard navigation", () => {
    it("should have tabIndex for keyboard focus", () => {
      renderWithProvider(
        <CommitGraphList nodes={createNodes(3)} expandedCommits={new Set()} />,
      );

      expect(
        screen.getByTestId("commit-graph-list").getAttribute("tabIndex"),
      ).toBe("0");
    });

    it("should select first row on ArrowDown when nothing selected", () => {
      const onSelectionChange = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(3)}
          expandedCommits={new Set()}
          onSelectionChange={onSelectionChange}
        />,
      );

      fireEvent.keyDown(screen.getByTestId("commit-graph-list"), {
        key: "ArrowDown",
      });

      expect(onSelectionChange).toHaveBeenCalledWith("commit1");
    });

    it("should select next row on ArrowDown", () => {
      const onSelectionChange = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(3)}
          expandedCommits={new Set()}
          selectedCommitId="commit1"
          onSelectionChange={onSelectionChange}
        />,
      );

      fireEvent.keyDown(screen.getByTestId("commit-graph-list"), {
        key: "ArrowDown",
      });

      expect(onSelectionChange).toHaveBeenCalledWith("commit2");
    });

    it("should select previous row on ArrowUp", () => {
      const onSelectionChange = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(3)}
          expandedCommits={new Set()}
          selectedCommitId="commit2"
          onSelectionChange={onSelectionChange}
        />,
      );

      fireEvent.keyDown(screen.getByTestId("commit-graph-list"), {
        key: "ArrowUp",
      });

      expect(onSelectionChange).toHaveBeenCalledWith("commit1");
    });

    it("should select first row on Home", () => {
      const onSelectionChange = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(3)}
          expandedCommits={new Set()}
          selectedCommitId="commit3"
          onSelectionChange={onSelectionChange}
        />,
      );

      fireEvent.keyDown(screen.getByTestId("commit-graph-list"), {
        key: "Home",
      });

      expect(onSelectionChange).toHaveBeenCalledWith("commit1");
    });

    it("should select last row on End", () => {
      const onSelectionChange = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(3)}
          expandedCommits={new Set()}
          selectedCommitId="commit1"
          onSelectionChange={onSelectionChange}
        />,
      );

      fireEvent.keyDown(screen.getByTestId("commit-graph-list"), {
        key: "End",
      });

      expect(onSelectionChange).toHaveBeenCalledWith("commit3");
    });

    it("should toggle expand on Enter", () => {
      const onToggleExpand = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(3)}
          expandedCommits={new Set()}
          selectedCommitId="commit2"
          onToggleExpand={onToggleExpand}
        />,
      );

      fireEvent.keyDown(screen.getByTestId("commit-graph-list"), {
        key: "Enter",
      });

      expect(onToggleExpand).toHaveBeenCalledWith("commit2");
    });

    it("should toggle expand on Space", () => {
      const onToggleExpand = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(3)}
          expandedCommits={new Set()}
          selectedCommitId="commit2"
          onToggleExpand={onToggleExpand}
        />,
      );

      fireEvent.keyDown(screen.getByTestId("commit-graph-list"), {
        key: " ",
      });

      expect(onToggleExpand).toHaveBeenCalledWith("commit2");
    });

    it("should call onViewAll on v key", () => {
      const onViewAll = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(3)}
          expandedCommits={new Set()}
          selectedCommitId="commit2"
          onViewAll={onViewAll}
        />,
      );

      fireEvent.keyDown(screen.getByTestId("commit-graph-list"), {
        key: "v",
      });

      expect(onViewAll).toHaveBeenCalledWith("commit2");
    });

    it("should not navigate past last row", () => {
      const onSelectionChange = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(3)}
          expandedCommits={new Set()}
          selectedCommitId="commit3"
          onSelectionChange={onSelectionChange}
        />,
      );

      fireEvent.keyDown(screen.getByTestId("commit-graph-list"), {
        key: "ArrowDown",
      });

      expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it("should not navigate before first row", () => {
      const onSelectionChange = vi.fn();
      renderWithProvider(
        <CommitGraphList
          nodes={createNodes(3)}
          expandedCommits={new Set()}
          selectedCommitId="commit1"
          onSelectionChange={onSelectionChange}
        />,
      );

      fireEvent.keyDown(screen.getByTestId("commit-graph-list"), {
        key: "ArrowUp",
      });

      expect(onSelectionChange).not.toHaveBeenCalled();
    });
  });
});
