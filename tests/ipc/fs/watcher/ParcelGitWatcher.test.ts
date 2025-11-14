import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { AsyncSubscription } from "@parcel/watcher";

// Mock @parcel/watcher
vi.mock("@parcel/watcher", () => ({
  default: {
    subscribe: vi.fn(),
  },
}));

// Mock git status functions
vi.mock("../../../../src/ipc/git/gitStatus", () => ({
  getGitStatus: vi.fn(),
  getGitStatusForFile: vi.fn(),
}));

import watcher from "@parcel/watcher";
import { ParcelGitWatcher } from "../../../../src/ipc/fs/watcher/ParcelGitWatcher";
import {
  getGitStatus,
  getGitStatusForFile,
} from "../../../../src/ipc/git/gitStatus";
import type { GitStatusMap, GitFileStatus } from "@shared/types";

describe("ParcelGitWatcher", () => {
  let gitWatcher: ParcelGitWatcher;
  let mockSubscription: AsyncSubscription;
  let capturedCallback: ((err: Error | null, events: any[]) => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallback = null;

    mockSubscription = {
      unsubscribe: vi.fn(),
    };

    (watcher.subscribe as any).mockImplementation(
      (path: string, callback: any) => {
        capturedCallback = callback;
        return Promise.resolve(mockSubscription);
      },
    );

    const mockGitStatus: GitStatusMap = new Map([
      [
        "file1.txt",
        { status: "modified", staged: false, relativePath: "file1.txt" },
      ],
      [
        "file2.txt",
        { status: "added", staged: true, relativePath: "file2.txt" },
      ],
    ]);

    (getGitStatus as any).mockResolvedValue(mockGitStatus);
    (getGitStatusForFile as any).mockResolvedValue({
      status: "modified",
      staged: false,
      relativePath: "test.txt",
    } as GitFileStatus);

    gitWatcher = new ParcelGitWatcher("/test/cwd", "/test/git/root");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("watch()", () => {
    it("should setup watcher on .git directory", async () => {
      await gitWatcher.watch();

      expect(watcher.subscribe).toHaveBeenCalledWith(
        "/test/git/root/.git",
        expect.any(Function),
        expect.objectContaining({
          backend: expect.any(String),
          ignore: expect.arrayContaining([
            "**/logs/**",
            "**/hooks/**",
            "**/objects/**",
          ]),
        }),
      );
    });

    it("should use correct backend for macOS", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "darwin",
      });

      await gitWatcher.watch();

      expect(watcher.subscribe).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({
          backend: "fs-events",
        }),
      );

      Object.defineProperty(process, "platform", {
        value: originalPlatform,
      });
    });

    it("should use correct backend for Linux", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "linux",
      });

      await gitWatcher.watch();

      expect(watcher.subscribe).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({
          backend: "inotify",
        }),
      );

      Object.defineProperty(process, "platform", {
        value: originalPlatform,
      });
    });

    it("should use windows backend for Windows", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "win32",
      });

      await gitWatcher.watch();

      expect(watcher.subscribe).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({
          backend: "windows",
        }),
      );

      Object.defineProperty(process, "platform", {
        value: originalPlatform,
      });
    });

    it("should not setup watcher if already watching", async () => {
      await gitWatcher.watch();
      await gitWatcher.watch();

      expect(watcher.subscribe).toHaveBeenCalledTimes(1);
    });

    it("should handle watch errors", async () => {
      const error = new Error("Watch error");
      (watcher.subscribe as any).mockRejectedValueOnce(error);

      await expect(gitWatcher.watch()).rejects.toThrow("Watch error");
    });
  });

  describe("unwatch()", () => {
    it("should unsubscribe from watcher", async () => {
      await gitWatcher.watch();
      await gitWatcher.unwatch();

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    });

    it("should not error if not watching", async () => {
      await expect(gitWatcher.unwatch()).resolves.not.toThrow();
    });

    it("should handle unwatch when subscription is null", async () => {
      // Don't call watch() first
      await expect(gitWatcher.unwatch()).resolves.not.toThrow();
    });
  });

  describe("onGitChanged()", () => {
    it("should register callback for git changes", async () => {
      const callback = vi.fn();

      gitWatcher.onGitChanged(callback);
      await gitWatcher.watch();

      // Trigger a git change by simulating relevant file change
      expect(capturedCallback).toBeTruthy();
      capturedCallback!(null, [
        { type: "update", path: "/test/git/root/.git/index" },
      ]);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should support multiple callbacks", async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      gitWatcher.onGitChanged(callback1);
      gitWatcher.onGitChanged(callback2);
      await gitWatcher.watch();

      capturedCallback!(null, [
        { type: "update", path: "/test/git/root/.git/HEAD" },
      ]);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it("should not trigger callback on non-relevant file changes", async () => {
      const callback = vi.fn();

      gitWatcher.onGitChanged(callback);
      await gitWatcher.watch();

      // Trigger change to non-relevant files (should be filtered out)
      capturedCallback!(null, [
        { type: "update", path: "/test/git/root/.git/config" },
      ]);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should trigger callback for index changes", async () => {
      const callback = vi.fn();

      gitWatcher.onGitChanged(callback);
      await gitWatcher.watch();

      capturedCallback!(null, [
        { type: "update", path: "/test/git/root/.git/index" },
      ]);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should trigger callback for HEAD changes", async () => {
      const callback = vi.fn();

      gitWatcher.onGitChanged(callback);
      await gitWatcher.watch();

      capturedCallback!(null, [
        { type: "update", path: "/test/git/root/.git/HEAD" },
      ]);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should trigger callback for refs changes", async () => {
      const callback = vi.fn();

      gitWatcher.onGitChanged(callback);
      await gitWatcher.watch();

      capturedCallback!(null, [
        { type: "update", path: "/test/git/root/.git/refs/heads/main" },
      ]);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should handle errors in watcher callback", async () => {
      const callback = vi.fn();

      gitWatcher.onGitChanged(callback);
      await gitWatcher.watch();

      // Simulate error from watcher
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const error = new Error("Watcher error");
      capturedCallback!(error, []);

      expect(callback).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe("getGitRoot()", () => {
    it("should return git root path", () => {
      expect(gitWatcher.getGitRoot()).toBe("/test/git/root");
    });
  });

  describe("computeGitStatusFull()", () => {
    it("should compute full git status", async () => {
      const result = await gitWatcher.computeGitStatusFull(null);

      expect(getGitStatus).toHaveBeenCalledWith("/test/cwd", null);
      expect(result).toBeTruthy();
      expect(result?.size).toBe(2);
    });

    it("should compute git status with base branch", async () => {
      await gitWatcher.computeGitStatusFull("main");

      expect(getGitStatus).toHaveBeenCalledWith("/test/cwd", "main");
    });

    it("should handle git status errors", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      (getGitStatus as any).mockRejectedValueOnce(new Error("Git error"));

      const result = await gitWatcher.computeGitStatusFull(null);

      expect(result).toBeNull();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe("computeGitStatusForFile()", () => {
    it("should compute git status for single file", async () => {
      const result = await gitWatcher.computeGitStatusForFile("/test/file.txt");

      expect(getGitStatusForFile).toHaveBeenCalledWith(
        "/test/git/root",
        "/test/file.txt",
      );
      expect(result).toEqual({
        status: "modified",
        staged: false,
        relativePath: "test.txt",
      });
    });

    it("should handle file status errors", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      (getGitStatusForFile as any).mockRejectedValueOnce(
        new Error("File status error"),
      );

      const result = await gitWatcher.computeGitStatusForFile("/test/file.txt");

      expect(result).toBeNull();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe("event filtering", () => {
    it("should filter out irrelevant events", async () => {
      const callback = vi.fn();

      gitWatcher.onGitChanged(callback);
      await gitWatcher.watch();

      // Mixed relevant and irrelevant events
      capturedCallback!(null, [
        { type: "update", path: "/test/git/root/.git/config" }, // Filtered
        { type: "update", path: "/test/git/root/.git/description" }, // Filtered
        { type: "update", path: "/test/git/root/.git/packed-refs" }, // Filtered
        { type: "update", path: "/test/git/root/.git/index" }, // Relevant!
      ]);

      // Should trigger only once for the relevant event
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should not trigger callback when all events are filtered", async () => {
      const callback = vi.fn();

      gitWatcher.onGitChanged(callback);
      await gitWatcher.watch();

      capturedCallback!(null, [
        { type: "update", path: "/test/git/root/.git/config" },
        { type: "update", path: "/test/git/root/.git/description" },
      ]);

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
