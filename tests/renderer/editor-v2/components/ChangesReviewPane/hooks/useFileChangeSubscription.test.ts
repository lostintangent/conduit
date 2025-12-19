/**
 * Tests for useFileChangeSubscription hook.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useFileChangeSubscription } from "@/components/panes/editor-v2/components/ChangesReviewPane/hooks/useFileChangeSubscription";

// Mock FileSystemV2APIService
vi.mock("@/services/FileSystemV2APIService", () => ({
  FileSystemV2APIService: {
    getInstance: vi.fn(() => ({
      acquire: vi.fn(() => ({
        onAnyFileContentChanged: vi.fn(() => vi.fn()),
      })),
      release: vi.fn(),
    })),
  },
}));

describe("useFileChangeSubscription", () => {
  const createMockGit = () => ({
    getDirtyFilesWithTimes: vi.fn().mockResolvedValue([]),
    onStatusChanged: vi.fn(() => vi.fn()),
    whenReady: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({ files: new Map() }),
  });

  const createDefaultOptions = (overrides = {}) => ({
    git: createMockGit(),
    cwd: "/test/project",
    sandboxId: undefined,
    allFilePaths: [],
    isLoading: true,
    processStatusChange: vi.fn(),
    initializeFiles: vi.fn(),
    expandFile: vi.fn(),
    onStatusChanged: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should not initialize files while loading", () => {
      const options = createDefaultOptions({
        isLoading: true,
        allFilePaths: ["file1.ts"],
      });

      renderHook(() => useFileChangeSubscription(options));

      expect(options.initializeFiles).not.toHaveBeenCalled();
    });

    it("should not initialize files when allFilePaths is empty", () => {
      const options = createDefaultOptions({
        isLoading: false,
        allFilePaths: [],
      });

      renderHook(() => useFileChangeSubscription(options));

      expect(options.initializeFiles).not.toHaveBeenCalled();
    });

    it("should initialize files with timestamps after loading", async () => {
      const mockGit = createMockGit();
      mockGit.getDirtyFilesWithTimes.mockResolvedValue([
        { path: "file1.ts", mtime: 1000 },
        { path: "file2.ts", mtime: 2000 },
      ]);

      const options = createDefaultOptions({
        git: mockGit,
        isLoading: false,
        allFilePaths: ["file1.ts", "file2.ts"],
      });

      renderHook(() => useFileChangeSubscription(options));

      // Wait for async initialization
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mockGit.getDirtyFilesWithTimes).toHaveBeenCalled();
      expect(options.initializeFiles).toHaveBeenCalledWith(
        ["file1.ts", "file2.ts"],
        expect.any(Map),
      );
    });

    it("should fall back to initialization without timestamps on error", async () => {
      const mockGit = createMockGit();
      mockGit.getDirtyFilesWithTimes.mockRejectedValue(new Error("API error"));

      const options = createDefaultOptions({
        git: mockGit,
        isLoading: false,
        allFilePaths: ["file1.ts"],
      });

      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      renderHook(() => useFileChangeSubscription(options));

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(options.initializeFiles).toHaveBeenCalledWith(["file1.ts"]);
      consoleSpy.mockRestore();
    });
  });

  describe("git status subscription", () => {
    it("should subscribe to git status changes", () => {
      const mockGit = createMockGit();
      const options = createDefaultOptions({ git: mockGit });

      renderHook(() => useFileChangeSubscription(options));

      expect(mockGit.onStatusChanged).toHaveBeenCalled();
    });

    it("should unsubscribe on unmount", () => {
      const unsubscribe = vi.fn();
      const mockGit = createMockGit();
      mockGit.onStatusChanged.mockReturnValue(unsubscribe);

      const options = createDefaultOptions({ git: mockGit });

      const { unmount } = renderHook(() => useFileChangeSubscription(options));
      unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });

    it("should call onStatusChanged when git status changes", () => {
      const mockGit = createMockGit();
      let statusCallback: (event: { status: unknown; added: string[] }) => void;
      mockGit.onStatusChanged.mockImplementation((cb) => {
        statusCallback = cb;
        return vi.fn();
      });

      const options = createDefaultOptions({ git: mockGit });

      renderHook(() => useFileChangeSubscription(options));

      const mockStatus = { files: new Map() };
      act(() => {
        statusCallback({ status: mockStatus, added: [] });
      });

      expect(options.onStatusChanged).toHaveBeenCalledWith(mockStatus);
    });

    it("should process newly added files", () => {
      const mockGit = createMockGit();
      let statusCallback: (event: { status: unknown; added: string[] }) => void;
      mockGit.onStatusChanged.mockImplementation((cb) => {
        statusCallback = cb;
        return vi.fn();
      });

      const options = createDefaultOptions({ git: mockGit });

      renderHook(() => useFileChangeSubscription(options));

      act(() => {
        statusCallback({ status: { files: new Map() }, added: ["newfile.ts"] });
      });

      expect(options.processStatusChange).toHaveBeenCalledWith(
        ["newfile.ts"],
        options.expandFile,
      );
    });

    it("should not process when no files are added", () => {
      const mockGit = createMockGit();
      let statusCallback: (event: { status: unknown; added: string[] }) => void;
      mockGit.onStatusChanged.mockImplementation((cb) => {
        statusCallback = cb;
        return vi.fn();
      });

      const options = createDefaultOptions({ git: mockGit });

      renderHook(() => useFileChangeSubscription(options));

      act(() => {
        statusCallback({ status: { files: new Map() }, added: [] });
      });

      expect(options.processStatusChange).not.toHaveBeenCalled();
    });
  });
});
