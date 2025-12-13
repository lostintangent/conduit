/**
 * Tests for the CommitFilesHeader component.
 *
 * These tests verify the display of file count and
 * total line statistics in the commit files header.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommitFilesHeader } from "@/components/panes/editor-v2/components/CommitGraph/files/CommitFilesHeader";

// =============================================================================
// Tests
// =============================================================================

describe("CommitFilesHeader", () => {
  describe("rendering", () => {
    it("should render with data-testid", () => {
      render(
        <CommitFilesHeader
          fileCount={3}
          totalAdditions={10}
          totalDeletions={5}
        />,
      );
      expect(screen.getByTestId("commit-files-header")).toBeTruthy();
    });
  });

  describe("file count", () => {
    it("should display singular 'file' for 1 file", () => {
      render(
        <CommitFilesHeader
          fileCount={1}
          totalAdditions={5}
          totalDeletions={2}
        />,
      );
      expect(screen.getByTestId("file-count").textContent).toBe(
        "1 file changed",
      );
    });

    it("should display plural 'files' for multiple files", () => {
      render(
        <CommitFilesHeader
          fileCount={5}
          totalAdditions={10}
          totalDeletions={3}
        />,
      );
      expect(screen.getByTestId("file-count").textContent).toBe(
        "5 files changed",
      );
    });

    it("should display 0 files", () => {
      render(
        <CommitFilesHeader
          fileCount={0}
          totalAdditions={0}
          totalDeletions={0}
        />,
      );
      expect(screen.getByTestId("file-count").textContent).toBe(
        "0 files changed",
      );
    });
  });

  describe("line totals", () => {
    it("should display both additions and deletions", () => {
      render(
        <CommitFilesHeader
          fileCount={3}
          totalAdditions={25}
          totalDeletions={10}
        />,
      );
      const totals = screen.getByTestId("line-totals");
      expect(totals.textContent).toContain("+25");
      expect(totals.textContent).toContain("-10");
    });

    it("should display only additions when no deletions", () => {
      render(
        <CommitFilesHeader
          fileCount={2}
          totalAdditions={15}
          totalDeletions={0}
        />,
      );
      const totals = screen.getByTestId("line-totals");
      expect(totals.textContent).toContain("+15");
      expect(totals.textContent).not.toContain("-");
    });

    it("should display only deletions when no additions", () => {
      render(
        <CommitFilesHeader
          fileCount={1}
          totalAdditions={0}
          totalDeletions={8}
        />,
      );
      const totals = screen.getByTestId("line-totals");
      expect(totals.textContent).toContain("-8");
      expect(totals.textContent).not.toContain("+");
    });

    it("should display 'no line changes' when both are 0", () => {
      render(
        <CommitFilesHeader
          fileCount={1}
          totalAdditions={0}
          totalDeletions={0}
        />,
      );
      expect(screen.getByTestId("line-totals").textContent).toBe(
        "no line changes",
      );
    });
  });

  describe("custom className", () => {
    it("should apply custom className", () => {
      render(
        <CommitFilesHeader
          fileCount={1}
          totalAdditions={1}
          totalDeletions={1}
          className="custom-class"
        />,
      );
      expect(
        screen
          .getByTestId("commit-files-header")
          .classList.contains("custom-class"),
      ).toBe(true);
    });
  });
});
