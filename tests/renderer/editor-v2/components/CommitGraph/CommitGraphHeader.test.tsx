/**
 * Tests for the CommitGraphHeader component.
 *
 * These tests verify the header bar for the commit graph panel.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CommitGraphHeader } from "@/components/panes/editor-v2/components/CommitGraph/CommitGraphHeader";

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
    it("should render with data-testid", () => {
      renderWithProvider(<CommitGraphHeader />);
      expect(screen.getByTestId("commit-graph-header")).toBeTruthy();
    });

    it("should display default title", () => {
      renderWithProvider(<CommitGraphHeader />);
      expect(screen.getByTestId("header-title").textContent).toBe("Commits");
    });

    it("should display custom title when provided", () => {
      renderWithProvider(<CommitGraphHeader title="History" />);
      expect(screen.getByTestId("header-title").textContent).toBe("History");
    });

    it("should apply custom className", () => {
      renderWithProvider(<CommitGraphHeader className="custom-class" />);
      expect(
        screen
          .getByTestId("commit-graph-header")
          .classList.contains("custom-class"),
      ).toBe(true);
    });
  });

  describe("refresh button", () => {
    it("should not show refresh button when onRefresh is not provided", () => {
      renderWithProvider(<CommitGraphHeader />);
      expect(screen.queryByTestId("refresh-button")).toBeNull();
    });

    it("should show refresh button when onRefresh is provided", () => {
      renderWithProvider(<CommitGraphHeader onRefresh={() => {}} />);
      expect(screen.getByTestId("refresh-button")).toBeTruthy();
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

  describe("loading state", () => {
    it("should animate icon when refreshing", () => {
      renderWithProvider(
        <CommitGraphHeader onRefresh={() => {}} isRefreshing={true} />,
      );

      const button = screen.getByTestId("refresh-button");
      const svg = button.querySelector("svg");
      expect(svg?.classList.contains("animate-spin")).toBe(true);
    });

    it("should not animate icon when not refreshing", () => {
      renderWithProvider(
        <CommitGraphHeader onRefresh={() => {}} isRefreshing={false} />,
      );

      const button = screen.getByTestId("refresh-button");
      const svg = button.querySelector("svg");
      expect(svg?.classList.contains("animate-spin")).toBe(false);
    });
  });

  describe("styling", () => {
    it("should have border-bottom styling", () => {
      renderWithProvider(<CommitGraphHeader />);

      const header = screen.getByTestId("commit-graph-header");
      expect(header.classList.contains("border-b")).toBe(true);
    });

    it("should have flex layout", () => {
      renderWithProvider(<CommitGraphHeader />);

      const header = screen.getByTestId("commit-graph-header");
      expect(header.classList.contains("flex")).toBe(true);
      expect(header.classList.contains("items-center")).toBe(true);
      expect(header.classList.contains("justify-between")).toBe(true);
    });

    it("should have appropriate padding", () => {
      renderWithProvider(<CommitGraphHeader />);

      const header = screen.getByTestId("commit-graph-header");
      expect(header.classList.contains("px-3")).toBe(true);
      expect(header.classList.contains("py-2")).toBe(true);
    });
  });

  describe("title element", () => {
    it("should be an h3 element", () => {
      renderWithProvider(<CommitGraphHeader />);

      const title = screen.getByTestId("header-title");
      expect(title.tagName.toLowerCase()).toBe("h3");
    });

    it("should have appropriate text styling", () => {
      renderWithProvider(<CommitGraphHeader />);

      const title = screen.getByTestId("header-title");
      expect(title.classList.contains("text-xs")).toBe(true);
      expect(title.classList.contains("font-medium")).toBe(true);
    });
  });
});
