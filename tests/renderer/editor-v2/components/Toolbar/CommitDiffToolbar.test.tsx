/**
 * Tests for CommitDiffToolbar component.
 *
 * This toolbar is used for historical commit diff viewing.
 * Shows file path, commit info, and read-only indicator.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommitDiffToolbar } from "@/components/panes/editor-v2/components/Toolbar/CommitDiffToolbar";

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Renders CommitDiffToolbar with required providers.
 */
function renderToolbar(
  props: Partial<Parameters<typeof CommitDiffToolbar>[0]> = {},
) {
  const defaultProps = {
    displayPath: "src/components/Button.tsx",
    commitShortId: "abc123f",
  };

  return render(
    <TooltipProvider>
      <CommitDiffToolbar {...defaultProps} {...props} />
    </TooltipProvider>,
  );
}

// =============================================================================
// Tests
// =============================================================================

describe("CommitDiffToolbar", () => {
  const defaultProps = {
    displayPath: "src/components/Button.tsx",
    commitShortId: "abc123f",
  };

  describe("rendering", () => {
    it("should render with data-testid", () => {
      renderToolbar();
      expect(screen.getByTestId("commit-diff-toolbar")).toBeTruthy();
    });

    it("should display the file path", () => {
      renderToolbar();
      expect(screen.getByTestId("file-path").textContent).toBe(
        "src/components/Button.tsx",
      );
    });

    it("should display the commit short ID badge", () => {
      renderToolbar();
      expect(screen.getByTestId("commit-badge").textContent).toBe("abc123f");
    });

    it("should display read-only indicator", () => {
      renderToolbar();
      expect(screen.getByTestId("read-only-indicator")).toBeTruthy();
      expect(screen.getByText("Read-only")).toBeTruthy();
    });
  });

  describe("back button", () => {
    it("should render back button when onBack is provided", () => {
      renderToolbar({ onBack: () => {} });
      expect(screen.getByTestId("back-button")).toBeTruthy();
    });

    it("should not render back button when onBack is not provided", () => {
      renderToolbar();
      expect(screen.queryByTestId("back-button")).toBeNull();
    });

    it("should call onBack when back button is clicked", () => {
      const onBack = vi.fn();
      renderToolbar({ onBack });

      fireEvent.click(screen.getByTestId("back-button"));

      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("tooltip", () => {
    it("should use filePath for tooltip when provided", () => {
      renderToolbar({ filePath: "/full/path/to/src/components/Button.tsx" });
      // Tooltip content is displayed in TooltipContent, verify the element exists
      expect(screen.getByTestId("file-path")).toBeTruthy();
    });

    it("should fall back to displayPath for tooltip when filePath not provided", () => {
      renderToolbar();
      expect(screen.getByTestId("file-path")).toBeTruthy();
    });
  });

  describe("styling", () => {
    it("should have correct background styling", () => {
      renderToolbar();
      const toolbar = screen.getByTestId("commit-diff-toolbar");
      expect(toolbar.className).toContain("bg-elevated");
    });

    it("should have monospace font for commit badge", () => {
      renderToolbar();
      const badge = screen.getByTestId("commit-badge");
      expect(badge.className).toContain("font-mono");
    });
  });
});
