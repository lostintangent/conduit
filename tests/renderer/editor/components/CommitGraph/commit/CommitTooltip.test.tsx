/**
 * Tests for the CommitTooltip component.
 *
 * These tests verify the tooltip that displays commit details
 * when hovering over a commit row, similar to VS Code's behavior.
 *
 * Radix opens the tooltip immediately when its trigger receives focus,
 * so tests focus the trigger to read the tooltip's content.
 */

import { describe, it, expect } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
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

function openTooltip() {
  act(() => screen.getByRole("button").focus());
  return screen.getByRole("tooltip");
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
    it("should show tracked branch badges", () => {
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

      expect(within(openTooltip()).getByText("main")).toBeDefined();
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

      const tooltip = within(openTooltip());
      expect(tooltip.getByText("John Doe,")).toBeDefined();
      expect(
        tooltip.getByText("Fix authentication bug in login flow"),
      ).toBeDefined();
      expect(tooltip.getByText("abc123d")).toBeDefined();
    });
  });

  describe("Commit Data Handling", () => {
    it("should handle commit with multiline body", () => {
      const commit = createCommit({
        message: "Subject line\n\nBody line 1\nBody line 2\nBody line 3",
      });

      renderWithProvider(
        <CommitTooltip commit={commit}>
          <button>Trigger</button>
        </CommitTooltip>,
      );

      expect(openTooltip().querySelector("p")!.textContent).toBe(
        "Subject line\n\nBody line 1\nBody line 2\nBody line 3",
      );
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

      expect(openTooltip().querySelector("p")!.textContent).toBe(
        "Subject\n\nBody without blank line separator",
      );
    });
  });
});
