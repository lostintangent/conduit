/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScrollToSelectedFile } from "../../../../../../src/renderer/components/panes/editor-v2/components/ChangesReviewPane/hooks/useScrollToSelectedFile";
import type { GitFileStatus } from "../../../../../../src/ipc/gitv2/types";

// ============================================================================
// Test Helpers
// ============================================================================

function createMockFileStatus(staged: boolean): GitFileStatus {
  return {
    path: "test.ts",
    status: "modified",
    staged,
  };
}

function createFileList(
  files: string[],
  staged: boolean,
): Array<[string, GitFileStatus]> {
  return files.map((path) => [path, { ...createMockFileStatus(staged), path }]);
}

// ============================================================================
// Tests
// ============================================================================

describe("useScrollToSelectedFile", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // No Selection
  // ===========================================================================

  describe("no selection", () => {
    it("should not do anything when selectedFilePath is undefined", () => {
      const expandFile = vi.fn();
      const setStagedSectionExpanded = vi.fn();
      const setUnstagedSectionExpanded = vi.fn();
      const scrollContainerRef = { current: document.createElement("div") };

      renderHook(() =>
        useScrollToSelectedFile({
          selectedFilePath: undefined,
          scrollContainerRef,
          stagedFiles: [],
          unstagedFiles: [],
          expandFile,
          setStagedSectionExpanded,
          setUnstagedSectionExpanded,
        }),
      );

      expect(expandFile).not.toHaveBeenCalled();
      expect(setStagedSectionExpanded).not.toHaveBeenCalled();
      expect(setUnstagedSectionExpanded).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Initial Selection (No Scroll on Mount)
  // ===========================================================================

  describe("initial selection", () => {
    it("should not scroll when mounted with an existing selection", () => {
      const expandFile = vi.fn();
      const setStagedSectionExpanded = vi.fn();
      const setUnstagedSectionExpanded = vi.fn();
      const scrollContainerRef = { current: document.createElement("div") };

      const unstagedFiles = createFileList(["src/app.ts"], false);

      renderHook(() =>
        useScrollToSelectedFile({
          selectedFilePath: "src/app.ts",
          scrollContainerRef,
          stagedFiles: [],
          unstagedFiles,
          expandFile,
          setStagedSectionExpanded,
          setUnstagedSectionExpanded,
        }),
      );

      // Should NOT expand or scroll on mount
      expect(expandFile).not.toHaveBeenCalled();
      expect(setStagedSectionExpanded).not.toHaveBeenCalled();
      expect(setUnstagedSectionExpanded).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // File Selection Changes
  // ===========================================================================

  describe("file selection changes", () => {
    it("should expand and scroll to file when selection changes", () => {
      const expandFile = vi.fn();
      const setStagedSectionExpanded = vi.fn();
      const setUnstagedSectionExpanded = vi.fn();

      const container = document.createElement("div");
      const fileElement = document.createElement("div");
      fileElement.setAttribute("data-filepath", "src/new-file.ts");
      fileElement.setAttribute("data-staged", "false");
      fileElement.scrollIntoView = vi.fn();
      container.appendChild(fileElement);

      const scrollContainerRef = { current: container };
      const unstagedFiles = createFileList(
        ["src/app.ts", "src/new-file.ts"],
        false,
      );

      const { rerender } = renderHook(
        ({ selectedFilePath }) =>
          useScrollToSelectedFile({
            selectedFilePath,
            scrollContainerRef,
            stagedFiles: [],
            unstagedFiles,
            expandFile,
            setStagedSectionExpanded,
            setUnstagedSectionExpanded,
          }),
        { initialProps: { selectedFilePath: "src/app.ts" } },
      );

      // Change selection
      rerender({ selectedFilePath: "src/new-file.ts" });

      expect(expandFile).toHaveBeenCalledWith("src/new-file.ts");
      expect(setUnstagedSectionExpanded).toHaveBeenCalledWith(true);

      // Fast-forward to trigger scroll
      vi.advanceTimersByTime(100);

      expect(fileElement.scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      });
    });

    it("should expand staged section for staged files", () => {
      const expandFile = vi.fn();
      const setStagedSectionExpanded = vi.fn();
      const setUnstagedSectionExpanded = vi.fn();

      const container = document.createElement("div");
      const fileElement = document.createElement("div");
      fileElement.setAttribute("data-filepath", "src/staged-file.ts");
      fileElement.setAttribute("data-staged", "true");
      fileElement.scrollIntoView = vi.fn();
      container.appendChild(fileElement);

      const scrollContainerRef = { current: container };
      const stagedFiles = createFileList(["src/staged-file.ts"], true);
      const unstagedFiles = createFileList(["src/unstaged-file.ts"], false);

      const { rerender } = renderHook(
        ({ selectedFilePath }) =>
          useScrollToSelectedFile({
            selectedFilePath,
            scrollContainerRef,
            stagedFiles,
            unstagedFiles,
            expandFile,
            setStagedSectionExpanded,
            setUnstagedSectionExpanded,
          }),
        { initialProps: { selectedFilePath: "src/unstaged-file.ts" } },
      );

      // Change selection to staged file
      rerender({ selectedFilePath: "src/staged-file.ts" });

      expect(setStagedSectionExpanded).toHaveBeenCalledWith(true);
      expect(setUnstagedSectionExpanded).not.toHaveBeenCalled();
    });

    it("should not scroll if file is not in any list", () => {
      const expandFile = vi.fn();
      const setStagedSectionExpanded = vi.fn();
      const setUnstagedSectionExpanded = vi.fn();
      const scrollContainerRef = { current: document.createElement("div") };

      const { rerender } = renderHook(
        ({ selectedFilePath }) =>
          useScrollToSelectedFile({
            selectedFilePath,
            scrollContainerRef,
            stagedFiles: [],
            unstagedFiles: [],
            expandFile,
            setStagedSectionExpanded,
            setUnstagedSectionExpanded,
          }),
        { initialProps: { selectedFilePath: undefined as string | undefined } },
      );

      // Select a file that doesn't exist in the lists
      rerender({ selectedFilePath: "src/nonexistent.ts" });

      expect(expandFile).not.toHaveBeenCalled();
    });

    it("should not re-scroll when selection is the same", () => {
      const expandFile = vi.fn();
      const setStagedSectionExpanded = vi.fn();
      const setUnstagedSectionExpanded = vi.fn();

      const container = document.createElement("div");
      const fileElement = document.createElement("div");
      fileElement.setAttribute("data-filepath", "src/file.ts");
      fileElement.setAttribute("data-staged", "false");
      fileElement.scrollIntoView = vi.fn();
      container.appendChild(fileElement);

      const scrollContainerRef = { current: container };
      const unstagedFiles = createFileList(["src/file.ts"], false);

      const { rerender } = renderHook(
        ({ selectedFilePath }) =>
          useScrollToSelectedFile({
            selectedFilePath,
            scrollContainerRef,
            stagedFiles: [],
            unstagedFiles,
            expandFile,
            setStagedSectionExpanded,
            setUnstagedSectionExpanded,
          }),
        { initialProps: { selectedFilePath: undefined as string | undefined } },
      );

      // First selection
      rerender({ selectedFilePath: "src/file.ts" });
      vi.advanceTimersByTime(100);

      expect(expandFile).toHaveBeenCalledTimes(1);
      expect(fileElement.scrollIntoView).toHaveBeenCalledTimes(1);

      // Re-render with same selection
      rerender({ selectedFilePath: "src/file.ts" });
      vi.advanceTimersByTime(100);

      // Should not be called again
      expect(expandFile).toHaveBeenCalledTimes(1);
      expect(fileElement.scrollIntoView).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  describe("cleanup", () => {
    it("should clear timeout on unmount", () => {
      const expandFile = vi.fn();
      const container = document.createElement("div");
      const scrollContainerRef = { current: container };
      const unstagedFiles = createFileList(["src/file.ts"], false);

      const { rerender, unmount } = renderHook(
        ({ selectedFilePath }) =>
          useScrollToSelectedFile({
            selectedFilePath,
            scrollContainerRef,
            stagedFiles: [],
            unstagedFiles,
            expandFile,
            setStagedSectionExpanded: vi.fn(),
            setUnstagedSectionExpanded: vi.fn(),
          }),
        { initialProps: { selectedFilePath: undefined as string | undefined } },
      );

      // Trigger scroll
      rerender({ selectedFilePath: "src/file.ts" });

      // Unmount before timeout
      unmount();

      // Should not throw when timer fires
      expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    });
  });
});
