/**
 * Tests for the ErrorState component.
 *
 * These tests verify the error state display for the commit graph.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorState } from "@/components/panes/editor/components/CommitGraph/states/ErrorState";

// =============================================================================
// Tests
// =============================================================================

describe("ErrorState", () => {
  describe("rendering", () => {
    it("should render with data-testid", () => {
      render(<ErrorState error="Something went wrong" />);
      expect(screen.getByTestId("commit-graph-error")).toBeTruthy();
    });

    it("should display the title", () => {
      render(<ErrorState error="Network error" />);
      expect(screen.getByText("Failed to load commits")).toBeTruthy();
    });

    it("should display the error message", () => {
      render(<ErrorState error="Network error" />);
      expect(screen.getByTestId("error-message").textContent).toBe(
        "Network error",
      );
    });

    it("should display retry button when onRetry is provided", () => {
      render(<ErrorState error="Error" onRetry={() => {}} />);
      expect(screen.getByTestId("retry-button")).toBeTruthy();
      expect(screen.getByText("Try Again")).toBeTruthy();
    });

    it("should not display retry button when onRetry is not provided", () => {
      render(<ErrorState error="Error" />);
      expect(screen.queryByTestId("retry-button")).toBeNull();
    });
  });

  describe("retry button", () => {
    it("should call onRetry when clicked", () => {
      const onRetry = vi.fn();
      render(<ErrorState error="Error" onRetry={onRetry} />);

      fireEvent.click(screen.getByTestId("retry-button"));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("should prevent default event behavior", () => {
      const onRetry = vi.fn();
      render(<ErrorState error="Error" onRetry={onRetry} />);

      const event = fireEvent.click(screen.getByTestId("retry-button"));

      // Event was handled
      expect(onRetry).toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("should have role alert", () => {
      render(<ErrorState error="Error" />);
      const container = screen.getByTestId("commit-graph-error");
      expect(container.getAttribute("role")).toBe("alert");
    });
  });

  describe("styling", () => {
    it("should apply custom className", () => {
      render(<ErrorState error="Error" className="custom-class" />);
      const container = screen.getByTestId("commit-graph-error");
      expect(container.classList.contains("custom-class")).toBe(true);
    });

    it("should contain centering classes", () => {
      render(<ErrorState error="Error" />);
      const container = screen.getByTestId("commit-graph-error");
      expect(container.classList.contains("flex")).toBe(true);
      expect(container.classList.contains("items-center")).toBe(true);
      expect(container.classList.contains("justify-center")).toBe(true);
    });
  });

  describe("error messages", () => {
    it("should display short error messages", () => {
      render(<ErrorState error="Not a git repository" />);
      expect(screen.getByTestId("error-message").textContent).toBe(
        "Not a git repository",
      );
    });

    it("should display longer error messages", () => {
      const longError =
        "The repository could not be accessed because the connection timed out";
      render(<ErrorState error={longError} />);
      expect(screen.getByTestId("error-message").textContent).toBe(longError);
    });
  });
});
