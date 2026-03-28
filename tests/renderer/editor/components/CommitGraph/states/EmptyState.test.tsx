/**
 * Tests for the EmptyState component.
 *
 * These tests verify the empty state display for the commit graph.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/panes/editor/components/CommitGraph/states/EmptyState";

// =============================================================================
// Tests
// =============================================================================

describe("EmptyState", () => {
  describe("rendering", () => {
    it("should render with data-testid", () => {
      render(<EmptyState />);
      expect(screen.getByTestId("commit-graph-empty")).toBeTruthy();
    });

    it("should display default title", () => {
      render(<EmptyState />);
      expect(screen.getByText("No commits yet")).toBeTruthy();
    });

    it("should display default description", () => {
      render(<EmptyState />);
      expect(
        screen.getByText(/This repository doesn't have any commits/),
      ).toBeTruthy();
    });

    it("should display custom title when provided", () => {
      render(<EmptyState title="Empty History" />);
      expect(screen.getByText("Empty History")).toBeTruthy();
    });

    it("should display custom description when provided", () => {
      render(<EmptyState description="Start by creating a commit." />);
      expect(screen.getByText("Start by creating a commit.")).toBeTruthy();
    });
  });

  describe("structure", () => {
    it("should render title as h3", () => {
      render(<EmptyState />);
      const title = screen.getByText("No commits yet");
      expect(title.tagName).toBe("H3");
    });

    it("should render description as paragraph", () => {
      render(<EmptyState />);
      const desc = screen.getByText(/This repository doesn't have any commits/);
      expect(desc.tagName).toBe("P");
    });
  });

  describe("styling", () => {
    it("should apply custom className", () => {
      render(<EmptyState className="custom-class" />);
      const container = screen.getByTestId("commit-graph-empty");
      expect(container.classList.contains("custom-class")).toBe(true);
    });

    it("should contain centering classes", () => {
      render(<EmptyState />);
      const container = screen.getByTestId("commit-graph-empty");
      expect(container.classList.contains("flex")).toBe(true);
      expect(container.classList.contains("items-center")).toBe(true);
      expect(container.classList.contains("justify-center")).toBe(true);
    });

    it("should have text-center for centered text", () => {
      render(<EmptyState />);
      const container = screen.getByTestId("commit-graph-empty");
      expect(container.classList.contains("text-center")).toBe(true);
    });
  });
});
