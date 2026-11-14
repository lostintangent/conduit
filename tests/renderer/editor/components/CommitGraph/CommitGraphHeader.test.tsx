/**
 * Tests for the CommitGraphHeader component.
 *
 * These tests verify the header bar for the commit graph panel.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommitGraphHeader } from "@/components/panes/editor/components/CommitGraph/CommitGraphHeader";

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
// Tests
// =============================================================================

describe("CommitGraphHeader", () => {
  describe("rendering", () => {
    it("should display default title", () => {
      renderWithProvider(<CommitGraphHeader />);
      expect(
        screen.getByRole("heading", { level: 3, name: "Commits" }),
      ).toBeDefined();
    });

    it("should display custom title when provided", () => {
      renderWithProvider(<CommitGraphHeader title="History" />);
      expect(screen.getByTestId("header-title").textContent).toBe("History");
    });
  });

  describe("refresh button", () => {
    it("should not show refresh button when onRefresh is not provided", () => {
      renderWithProvider(<CommitGraphHeader />);
      expect(screen.queryByTestId("refresh-button")).toBeNull();
    });

    it("should call onRefresh when button is clicked", () => {
      const onRefresh = vi.fn();
      renderWithProvider(<CommitGraphHeader onRefresh={onRefresh} />);

      fireEvent.click(screen.getByTestId("refresh-button"));

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("should not call onRefresh when isRefreshing is true", () => {
      const onRefresh = vi.fn();
      renderWithProvider(
        <CommitGraphHeader onRefresh={onRefresh} isRefreshing={true} />,
      );

      fireEvent.click(screen.getByTestId("refresh-button"));

      expect(onRefresh).not.toHaveBeenCalled();
    });

    it("should disable button when isRefreshing is true", () => {
      renderWithProvider(
        <CommitGraphHeader onRefresh={() => {}} isRefreshing={true} />,
      );

      const button = screen.getByTestId("refresh-button");
      expect(button.hasAttribute("disabled")).toBe(true);
    });

    it("should have aria-label for accessibility", () => {
      renderWithProvider(<CommitGraphHeader onRefresh={() => {}} />);

      const button = screen.getByTestId("refresh-button");
      expect(button.getAttribute("aria-label")).toBe("Refresh commits");
    });
  });
});
