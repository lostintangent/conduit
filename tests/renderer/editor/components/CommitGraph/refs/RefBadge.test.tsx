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
} from "@/components/panes/editor/components/CommitGraph/refs/RefBadge";
import type { GitRef } from "@/components/panes/editor/components/CommitGraph/types";

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
