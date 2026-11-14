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
});
