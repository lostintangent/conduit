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
    it("should display default title", () => {
      render(<EmptyState />);
      expect(
        screen.getByRole("heading", { level: 3, name: "No commits yet" }),
      ).toBeDefined();
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
});
