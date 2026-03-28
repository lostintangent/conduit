/**
 * Tests for the LoadingState component.
 *
 * These tests verify the loading state display for the commit graph.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingState } from "@/components/panes/editor/components/CommitGraph/states/LoadingState";

// =============================================================================
// Tests
// =============================================================================

describe("LoadingState", () => {
  describe("rendering", () => {
    it("should render with data-testid", () => {
      render(<LoadingState />);
      expect(screen.getByTestId("commit-graph-loading")).toBeTruthy();
    });

    it("should display default loading message", () => {
      render(<LoadingState />);
      expect(screen.getByText("Loading commits...")).toBeTruthy();
    });

    it("should display custom message when provided", () => {
      render(<LoadingState message="Fetching history..." />);
      expect(screen.getByText("Fetching history...")).toBeTruthy();
    });
  });

  describe("accessibility", () => {
    it("should have role status", () => {
      render(<LoadingState />);
      const container = screen.getByTestId("commit-graph-loading");
      expect(container.getAttribute("role")).toBe("status");
    });

    it("should have aria-live polite", () => {
      render(<LoadingState />);
      const container = screen.getByTestId("commit-graph-loading");
      expect(container.getAttribute("aria-live")).toBe("polite");
    });
  });

  describe("styling", () => {
    it("should apply custom className", () => {
      render(<LoadingState className="custom-class" />);
      const container = screen.getByTestId("commit-graph-loading");
      expect(container.classList.contains("custom-class")).toBe(true);
    });

    it("should contain centering classes", () => {
      render(<LoadingState />);
      const container = screen.getByTestId("commit-graph-loading");
      expect(container.classList.contains("flex")).toBe(true);
      expect(container.classList.contains("items-center")).toBe(true);
      expect(container.classList.contains("justify-center")).toBe(true);
    });
  });
});
