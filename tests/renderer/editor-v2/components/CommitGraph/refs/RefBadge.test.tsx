/**
 * Tests for the RefBadge component.
 *
 * These tests verify the badge display for git references,
 * including the iconOnly mode for VS Code-style badge display.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  RefBadge,
  RefBadgeList,
  type RefWithColorHint,
} from "@/components/panes/editor-v2/components/CommitGraph/refs/RefBadge";
import type { GitRef } from "@/components/panes/editor-v2/components/CommitGraph/types";

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
// RefBadge Tests
// =============================================================================

describe("RefBadge", () => {
  describe("Basic Rendering", () => {
    it("should render local branch badge", () => {
      const gitRef: GitRef = {
        type: "head",
        name: "main",
        isHead: true,
      };

      renderWithProvider(<RefBadge gitRef={gitRef} />);

      const badge = screen.getByTestId("ref-badge-head");
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain("main");
    });

    it("should render remote branch badge with remote/name format", () => {
      const gitRef: GitRef = {
        type: "remote",
        name: "main",
        remote: "origin",
      };

      renderWithProvider(<RefBadge gitRef={gitRef} />);

      const badge = screen.getByTestId("ref-badge-remote");
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain("origin/main");
    });

    it("should render tag badge", () => {
      const gitRef: GitRef = {
        type: "tag",
        name: "v1.0.0",
      };

      renderWithProvider(<RefBadge gitRef={gitRef} />);

      const badge = screen.getByTestId("ref-badge-tag");
      expect(badge).toBeTruthy();
      expect(badge.textContent).toContain("v1.0.0");
    });
  });

  describe("Color Hints", () => {
    it("should apply current color hint styling", () => {
      const gitRef: GitRef = {
        type: "head",
        name: "feature-branch",
        isHead: true,
      };

      renderWithProvider(<RefBadge gitRef={gitRef} colorHint="current" />);

      const badge = screen.getByTestId("ref-badge-head");
      expect(badge.dataset.colorHint).toBe("current");
    });

    it("should apply upstream color hint styling", () => {
      const gitRef: GitRef = {
        type: "remote",
        name: "feature-branch",
        remote: "origin",
      };

      renderWithProvider(<RefBadge gitRef={gitRef} colorHint="upstream" />);

      const badge = screen.getByTestId("ref-badge-remote");
      expect(badge.dataset.colorHint).toBe("upstream");
    });

    it("should apply base color hint styling", () => {
      const gitRef: GitRef = {
        type: "remote",
        name: "main",
        remote: "origin",
      };

      renderWithProvider(<RefBadge gitRef={gitRef} colorHint="base" />);

      const badge = screen.getByTestId("ref-badge-remote");
      expect(badge.dataset.colorHint).toBe("base");
    });
  });

  describe("Icon Only Mode", () => {
    it("should show text by default", () => {
      const gitRef: GitRef = {
        type: "head",
        name: "main",
        isHead: true,
      };

      renderWithProvider(<RefBadge gitRef={gitRef} />);

      const badge = screen.getByTestId("ref-badge-head");
      expect(badge.textContent).toContain("main");
      expect(badge.dataset.iconOnly).toBeUndefined();
    });

    it("should hide text when iconOnly is true", () => {
      const gitRef: GitRef = {
        type: "remote",
        name: "main",
        remote: "origin",
      };

      renderWithProvider(<RefBadge gitRef={gitRef} iconOnly />);

      const badge = screen.getByTestId("ref-badge-remote");
      // Should not contain the branch name text
      expect(badge.textContent).not.toContain("origin/main");
      expect(badge.dataset.iconOnly).toBe("true");
    });

    it("should still show tooltip with full name when iconOnly", () => {
      const gitRef: GitRef = {
        type: "remote",
        name: "main",
        remote: "origin",
      };

      renderWithProvider(<RefBadge gitRef={gitRef} iconOnly />);

      const badge = screen.getByTestId("ref-badge-remote");
      expect(badge.getAttribute("title")).toBe("origin/main");
    });

    it("should have different padding when iconOnly", () => {
      const gitRef: GitRef = {
        type: "head",
        name: "main",
        isHead: true,
      };

      const { rerender } = renderWithProvider(<RefBadge gitRef={gitRef} />);
      const normalBadge = screen.getByTestId("ref-badge-head");
      const normalHasGap = normalBadge.classList.contains("gap-1");

      rerender(
        <TestWrapper>
          <RefBadge gitRef={gitRef} iconOnly />
        </TestWrapper>,
      );
      const iconOnlyBadge = screen.getByTestId("ref-badge-head");
      const iconOnlyHasGap = iconOnlyBadge.classList.contains("gap-1");

      // Normal mode should have gap, iconOnly should not
      expect(normalHasGap).toBe(true);
      expect(iconOnlyHasGap).toBe(false);
    });
  });
});

// =============================================================================
// RefBadgeList Tests
// =============================================================================

describe("RefBadgeList", () => {
  describe("Basic Rendering", () => {
    it("should render nothing when refs is empty", () => {
      renderWithProvider(<RefBadgeList refs={[]} />);

      expect(screen.queryByTestId("ref-badge-list")).toBeNull();
    });

    it("should render multiple badges", () => {
      const refs: GitRef[] = [
        { type: "head", name: "main", isHead: true },
        { type: "remote", name: "main", remote: "origin" },
      ];

      renderWithProvider(<RefBadgeList refs={refs} />);

      expect(screen.getByTestId("ref-badge-list")).toBeTruthy();
      expect(screen.getByTestId("ref-badge-head")).toBeTruthy();
      expect(screen.getByTestId("ref-badge-remote")).toBeTruthy();
    });
  });

  describe("With Color Hints and IconOnly", () => {
    it("should pass iconOnly to badges", () => {
      const refs: RefWithColorHint[] = [
        {
          ref: { type: "head", name: "feature", isHead: true },
          colorHint: "current",
          iconOnly: false,
        },
        {
          ref: { type: "remote", name: "feature", remote: "origin" },
          colorHint: "upstream",
          iconOnly: true,
        },
      ];

      renderWithProvider(<RefBadgeList refs={refs} />);

      const headBadge = screen.getByTestId("ref-badge-head");
      const remoteBadge = screen.getByTestId("ref-badge-remote");

      // First badge should show text
      expect(headBadge.textContent).toContain("feature");
      expect(headBadge.dataset.iconOnly).toBeUndefined();

      // Second badge should be icon only
      expect(remoteBadge.textContent).not.toContain("origin/feature");
      expect(remoteBadge.dataset.iconOnly).toBe("true");
    });

    it("should render VS Code-style badges (first full, rest icon-only)", () => {
      const refs: RefWithColorHint[] = [
        {
          ref: { type: "head", name: "main", isHead: true },
          colorHint: "current",
        },
        {
          ref: { type: "remote", name: "main", remote: "origin" },
          colorHint: "upstream",
          iconOnly: true,
        },
        {
          ref: { type: "remote", name: "main", remote: "origin" },
          colorHint: "base",
          iconOnly: true,
        },
      ];

      renderWithProvider(<RefBadgeList refs={refs} />);

      const badges = screen.getAllByTestId(/ref-badge/);
      // Should have 3 badges (list + head + 2 remotes)
      expect(badges.length).toBe(4); // includes the list container
    });
  });

  describe("Overflow Handling", () => {
    it("should show overflow count when more than maxVisible refs", () => {
      const refs: GitRef[] = [
        { type: "head", name: "branch1" },
        { type: "head", name: "branch2" },
        { type: "head", name: "branch3" },
        { type: "head", name: "branch4" },
      ];

      renderWithProvider(<RefBadgeList refs={refs} maxVisible={2} />);

      expect(screen.getByText("+2")).toBeTruthy();
    });
  });
});
