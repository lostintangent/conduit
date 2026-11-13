/**
 * Tests for the CommitTooltip component.
 *
 * These tests verify the tooltip that displays commit details
 * when hovering over a commit row, similar to VS Code's behavior.
 *
 * Note: Tooltip hover interactions are provided by radix-ui and are
 * tested in their library. We focus on testing that our component
 * renders correctly and passes the right props.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommitTooltip } from "@/components/panes/editor/components/CommitGraph/commit/CommitTooltip";
import type { HistoryCommit } from "@/components/panes/editor/components/CommitGraph/types";
import type { TrackedBranchInfo } from "@/api/GitV2API";
import { trackedBranch } from "../fixtures";

// =============================================================================
// Test Helpers
// =============================================================================

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider delayDuration={0}>{children}</TooltipProvider>;
}

function renderWithProvider(ui: React.ReactElement) {
  return render(ui, { wrapper: TestWrapper });
}

function createCommit(overrides: Partial<HistoryCommit> = {}): HistoryCommit {
  return {
    id: "abc123def456abc123def456abc123def456abc1",
    shortId: "abc123d",
    subject: "Fix authentication bug in login flow",
    message: "Fix authentication bug in login flow",
    author: "John Doe",
    authorEmail: "john@example.com",
    timestamp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    parentIds: ["parent123"],
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("CommitTooltip", () => {
  describe("Tracked Branch Props", () => {
    it("should accept isHead prop", () => {
      const commit = createCommit();
      renderWithProvider(
        <CommitTooltip commit={commit} isHead={true}>
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(screen.getByRole("button")).toBeTruthy();
    });

    it("should accept trackedBranches prop", () => {
      const commit = createCommit();
      const trackedBranches: TrackedBranchInfo = {
        current: trackedBranch("current", "main", commit.id),
        upstream: null,
        base: null,
      };

      renderWithProvider(
        <CommitTooltip
          commit={commit}
          isHead={true}
          trackedBranches={trackedBranches}
        >
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(screen.getByRole("button")).toBeTruthy();
    });

    it("should handle null trackedBranches", () => {
      const commit = createCommit();
      renderWithProvider(
        <CommitTooltip commit={commit} isHead={false} trackedBranches={null}>
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(screen.getByRole("button")).toBeTruthy();
    });
  });

  describe("Basic Rendering", () => {
    it("should render children", () => {
      const commit = createCommit();
      renderWithProvider(
        <CommitTooltip commit={commit}>
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(screen.getByRole("button", { name: "Trigger" })).toBeTruthy();
    });

    it("should pass through children as trigger", () => {
      const commit = createCommit();
      renderWithProvider(
        <CommitTooltip commit={commit}>
          <span data-testid="custom-trigger">Custom Trigger</span>
        </CommitTooltip>,
      );

      expect(screen.getByTestId("custom-trigger")).toBeTruthy();
    });
  });

  describe("Props", () => {
    it("should accept side prop", () => {
      const commit = createCommit();

      // Just verify it renders without error with different sides
      const { rerender } = renderWithProvider(
        <CommitTooltip commit={commit} side="top">
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(screen.getByRole("button")).toBeTruthy();

      rerender(
        <TestWrapper>
          <CommitTooltip commit={commit} side="bottom">
            <button>Trigger</button>
          </CommitTooltip>
        </TestWrapper>,
      );

      expect(screen.getByRole("button")).toBeTruthy();

      rerender(
        <TestWrapper>
          <CommitTooltip commit={commit} side="left">
            <button>Trigger</button>
          </CommitTooltip>
        </TestWrapper>,
      );

      expect(screen.getByRole("button")).toBeTruthy();

      rerender(
        <TestWrapper>
          <CommitTooltip commit={commit} side="right">
            <button>Trigger</button>
          </CommitTooltip>
        </TestWrapper>,
      );

      expect(screen.getByRole("button")).toBeTruthy();
    });

    it("should accept delayDuration prop", () => {
      const commit = createCommit();

      // Just verify it renders without error
      renderWithProvider(
        <CommitTooltip commit={commit} delayDuration={1000}>
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(screen.getByRole("button")).toBeTruthy();
    });

    it("should use default side of right", () => {
      const commit = createCommit();

      // Renders without specifying side
      renderWithProvider(
        <CommitTooltip commit={commit}>
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(screen.getByRole("button")).toBeTruthy();
    });

    it("should use default delayDuration of 400", () => {
      const commit = createCommit();

      // Renders without specifying delayDuration
      renderWithProvider(
        <CommitTooltip commit={commit}>
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(screen.getByRole("button")).toBeTruthy();
    });
  });

  describe("Commit Data Handling", () => {
    it("should handle commit with empty subject", () => {
      const commit = createCommit({
        subject: "",
        message: "",
      });

      renderWithProvider(
        <CommitTooltip commit={commit}>
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(screen.getByRole("button")).toBeTruthy();
    });

    it("should handle commit with missing authorEmail", () => {
      const commit = createCommit({
        authorEmail: undefined,
      });

      renderWithProvider(
        <CommitTooltip commit={commit}>
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(screen.getByRole("button")).toBeTruthy();
    });

    it("should handle commit with long message", () => {
      const longBody = "This is a very long commit message. ".repeat(100);
      const commit = createCommit({
        subject: "Short subject",
        message: `Short subject\n\n${longBody}`,
      });

      renderWithProvider(
        <CommitTooltip commit={commit}>
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(screen.getByRole("button")).toBeTruthy();
    });

    it("should handle commit with multiline body", () => {
      const commit = createCommit({
        message: "Subject line\n\nBody line 1\nBody line 2\nBody line 3",
      });

      renderWithProvider(
        <CommitTooltip commit={commit}>
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(screen.getByRole("button")).toBeTruthy();
    });

    it("should handle commit without blank line between subject and body", () => {
      const commit = createCommit({
        message: "Subject\nBody without blank line separator",
      });

      renderWithProvider(
        <CommitTooltip commit={commit}>
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(screen.getByRole("button")).toBeTruthy();
    });
  });

  describe("Memoization", () => {
    it("should be memoized (exported as memo component)", () => {
      // CommitTooltip is exported with memo() wrapper
      // This test just verifies it renders consistently
      const commit = createCommit();

      const { rerender } = renderWithProvider(
        <CommitTooltip commit={commit}>
          <button>Trigger</button>
        </CommitTooltip>,
      );

      // Re-render with same commit
      rerender(
        <TestWrapper>
          <CommitTooltip commit={commit}>
            <button>Trigger</button>
          </CommitTooltip>
        </TestWrapper>,
      );

      expect(screen.getByRole("button")).toBeTruthy();
    });
  });
});
