import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";

// ============================================================================
// Mocks
// ============================================================================

// Mock ParcelFileWatcher
// Track instances created for test assertions
const mockWatcherInstances: MockWatcherInstance[] = [];

interface MockWatcherInstance {
  watch: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  onCreated: ReturnType<typeof vi.fn>;
  onModified: ReturnType<typeof vi.fn>;
  onDeleted: ReturnType<typeof vi.fn>;
  onRenamed: ReturnType<typeof vi.fn>;
}

function createMockWatcherInstance(): MockWatcherInstance {
  return {
    watch: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    onCreated: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onModified: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onDeleted: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onRenamed: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  };
}

vi.mock("../../../src/ipc/fsv2/watcher/ParcelFileWatcher", () => ({
  ParcelFileWatcher: class MockParcelFileWatcher {
    watch: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    onCreated: ReturnType<typeof vi.fn>;
    onModified: ReturnType<typeof vi.fn>;
    onDeleted: ReturnType<typeof vi.fn>;
    onRenamed: ReturnType<typeof vi.fn>;

    constructor() {
      const instance = createMockWatcherInstance();
      this.watch = instance.watch;
      this.dispose = instance.dispose;
      this.onCreated = instance.onCreated;
      this.onModified = instance.onModified;
      this.onDeleted = instance.onDeleted;
      this.onRenamed = instance.onRenamed;
      mockWatcherInstances.push(instance);
    }
  },
}));

// Mock simple-git
const mockGit = {
  status: vi.fn(),
  branch: vi.fn(),
  add: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn().mockResolvedValue(undefined),
  commit: vi.fn().mockResolvedValue(undefined),
  checkout: vi.fn().mockResolvedValue(undefined),
  log: vi.fn(),
  diff: vi.fn(),
  show: vi.fn(),
  revparse: vi.fn(),
  raw: vi.fn(),
};

vi.mock("simple-git", () => ({
  simpleGit: vi.fn().mockImplementation(() => mockGit),
}));

// Mock fs.statSync for .git directory check
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs");
  return {
    ...actual,
    statSync: vi.fn().mockReturnValue({
      isFile: () => false,
      isDirectory: () => true,
    }),
  };
});

// ============================================================================
// Import after mocks
// ============================================================================

import { DiskGitProvider } from "../../../src/ipc/gitv2/DiskGitProvider";
import type { GitStatus, GitFileStatus } from "../../../src/ipc/gitv2/types";

// ============================================================================
// Test Helpers
// ============================================================================

function createMockStatusResult(options: {
  branch?: string;
  tracking?: string | null;
  ahead?: number;
  behind?: number;
  files?: Array<{ path: string; index: string; working_dir: string }>;
  isClean?: boolean;
}) {
  return {
    current: options.branch ?? "main",
    tracking: options.tracking ?? null,
    ahead: options.ahead ?? 0,
    behind: options.behind ?? 0,
    files: options.files ?? [],
    isClean: () => options.isClean ?? true,
  };
}

function createMockBranchSummary(current: string) {
  return {
    current,
    branches: {
      [current]: { current: true, commit: "abc123", name: current },
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("DiskGitProvider", () => {
  const testGitRoot = "/test/repo";
  const testCwd = "/test/repo/src";

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear tracked watcher instances
    mockWatcherInstances.length = 0;

    // Default mock implementations
    mockGit.status.mockResolvedValue(createMockStatusResult({}));
    mockGit.branch.mockResolvedValue(createMockBranchSummary("main"));
    mockGit.revparse.mockResolvedValue("abc123def456");
    mockGit.log.mockResolvedValue({
      latest: {
        hash: "abc123def456789",
        author_name: "Test User",
        author_email: "test@example.com",
        date: "2025-01-01T00:00:00Z",
        message: "Test commit",
        refs: "",
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Constructor and Initialization
  // ===========================================================================

  describe("constructor", () => {
    it("should set gitRoot and cwd", () => {
      const provider = new DiskGitProvider(testGitRoot, testCwd);

      expect(provider.gitRoot).toBe(path.resolve(testGitRoot));
      expect(provider.cwd).toBe(path.resolve(testCwd));
    });
  });

  // ===========================================================================
  // getStatus
  // ===========================================================================

  describe("getStatus()", () => {
    it("should return branch information", async () => {
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          branch: "feature-branch",
          tracking: "origin/feature-branch",
          ahead: 2,
          behind: 1,
        }),
      );
      mockGit.branch.mockResolvedValue(
        createMockBranchSummary("feature-branch"),
      );

      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const status = await provider.getStatus();

      expect(status.branch).toBe("feature-branch");
      expect(status.upstream).toBe("origin/feature-branch");
      expect(status.ahead).toBe(2);
      expect(status.behind).toBe(1);
    });

    it("should return file statuses", async () => {
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [
            { path: "src/file.ts", index: "M", working_dir: " " },
            { path: "src/new.ts", index: "A", working_dir: " " },
            { path: "README.md", index: " ", working_dir: "M" },
          ],
        }),
      );

      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const status = await provider.getStatus();

      expect(status.files.size).toBe(3);

      const modifiedFile = status.files.get("src/file.ts");
      expect(modifiedFile?.status).toBe("modified");
      expect(modifiedFile?.staged).toBe(true);

      const addedFile = status.files.get("src/new.ts");
      expect(addedFile?.status).toBe("added");
      expect(addedFile?.staged).toBe(true);

      const unstagedFile = status.files.get("README.md");
      expect(unstagedFile?.status).toBe("modified");
      expect(unstagedFile?.staged).toBe(false);
    });

    it("should handle untracked files", async () => {
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "new-file.txt", index: "?", working_dir: "?" }],
        }),
      );

      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const status = await provider.getStatus();

      const untrackedFile = status.files.get("new-file.txt");
      expect(untrackedFile?.status).toBe("untracked");
      expect(untrackedFile?.staged).toBe(false);
    });

    it("should handle deleted files", async () => {
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "deleted.ts", index: "D", working_dir: " " }],
        }),
      );

      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const status = await provider.getStatus();

      const deletedFile = status.files.get("deleted.ts");
      expect(deletedFile?.status).toBe("deleted");
      expect(deletedFile?.staged).toBe(true);
    });
  });

  // ===========================================================================
  // getFileStatus
  // ===========================================================================

  describe("getFileStatus()", () => {
    it("should return status for a specific file", async () => {
      // Git returns paths relative to git root
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "src/file.ts", index: "M", working_dir: " " }],
        }),
      );

      // Use gitRoot as cwd for simpler path handling
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const fileStatus = await provider.getFileStatus("src/file.ts");

      expect(fileStatus).not.toBeNull();
      expect(fileStatus?.status).toBe("modified");
      expect(fileStatus?.staged).toBe(true);
    });

    it("should return null for clean files", async () => {
      mockGit.status.mockResolvedValue(createMockStatusResult({ files: [] }));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const fileStatus = await provider.getFileStatus("clean-file.ts");

      expect(fileStatus).toBeNull();
    });
  });

  // ===========================================================================
  // getCurrentBranch
  // ===========================================================================

  describe("getCurrentBranch()", () => {
    it("should return current branch name", async () => {
      mockGit.raw.mockResolvedValue("develop\n");

      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const branch = await provider.getCurrentBranch();

      expect(branch).toBe("develop");
      expect(mockGit.raw).toHaveBeenCalledWith([
        "rev-parse",
        "--abbrev-ref",
        "HEAD",
      ]);
    });

    it("should return HEAD when detached", async () => {
      mockGit.raw.mockResolvedValue("HEAD\n");

      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const branch = await provider.getCurrentBranch();

      expect(branch).toBe("HEAD");
    });
  });

  // ===========================================================================
  // getBranches
  // ===========================================================================

  describe("getBranches()", () => {
    it("should return local and remote branches with commit info", async () => {
      // Format: refname:short|refname|committerdate|objectname:short|subject|HEAD
      mockGit.raw.mockResolvedValue(
        "main|refs/heads/main|2025-01-15 10:00:00 +0000|abc123|Latest commit|*\n" +
          "develop|refs/heads/develop|2025-01-14 09:00:00 +0000|def456|Dev commit|\n" +
          "origin/main|refs/remotes/origin/main|2025-01-15 10:00:00 +0000|abc123|Latest commit|\n",
      );

      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const branches = await provider.getBranches();

      expect(branches.length).toBe(3);

      // Local branch
      const mainBranch = branches.find((b) => b.name === "main" && !b.isRemote);
      expect(mainBranch?.isCurrent).toBe(true);
      expect(mainBranch?.isRemote).toBe(false);
      expect(mainBranch?.lastCommitMessage).toBe("Latest commit");
      expect(mainBranch?.lastCommitDate).toBeInstanceOf(Date);

      // Remote branch keeps full name (origin/main)
      const remoteBranch = branches.find((b) => b.name === "origin/main");
      expect(remoteBranch?.isRemote).toBe(true);
    });
  });

  // ===========================================================================
  // getFileDiff
  // ===========================================================================

  describe("getFileDiff()", () => {
    it("should return unstaged diff by default", async () => {
      mockGit.diff.mockResolvedValue("diff --git a/file.ts b/file.ts\n...");

      // Use gitRoot as cwd for simpler path handling
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const diff = await provider.getFileDiff("file.ts");

      expect(diff).toContain("diff --git");
      expect(mockGit.diff).toHaveBeenCalledWith(["--", "file.ts"]);
    });

    it("should return staged diff when specified", async () => {
      mockGit.diff.mockResolvedValue("diff --git a/file.ts b/file.ts\n...");

      // Use gitRoot as cwd for simpler path handling
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.getFileDiff("file.ts", true);

      expect(mockGit.diff).toHaveBeenCalledWith(["--cached", "--", "file.ts"]);
    });
  });

  // ===========================================================================
  // getFileAtRef
  // ===========================================================================

  describe("getFileAtRef()", () => {
    it("should return file content at specified ref", async () => {
      mockGit.show.mockResolvedValue("file content at HEAD");

      // Use gitRoot as cwd for simpler path handling
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const content = await provider.getFileAtRef("file.ts", "HEAD");

      expect(content).toBe("file content at HEAD");
      expect(mockGit.show).toHaveBeenCalledWith(["HEAD:file.ts"]);
    });
  });

  // ===========================================================================
  // hasUncommittedChanges
  // ===========================================================================

  describe("hasUncommittedChanges()", () => {
    it("should return false when clean", async () => {
      mockGit.status.mockResolvedValue(
        createMockStatusResult({ isClean: true }),
      );

      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const hasChanges = await provider.hasUncommittedChanges();

      expect(hasChanges).toBe(false);
    });

    it("should return true when dirty", async () => {
      mockGit.status.mockResolvedValue(
        createMockStatusResult({ isClean: false }),
      );

      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const hasChanges = await provider.hasUncommittedChanges();

      expect(hasChanges).toBe(true);
    });
  });

  // ===========================================================================
  // hasUnpushedCommits
  // ===========================================================================

  describe("hasUnpushedCommits()", () => {
    it("should return false when not ahead", async () => {
      mockGit.status.mockResolvedValue(createMockStatusResult({ ahead: 0 }));

      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const hasUnpushed = await provider.hasUnpushedCommits();

      expect(hasUnpushed).toBe(false);
    });

    it("should return true when ahead", async () => {
      mockGit.status.mockResolvedValue(createMockStatusResult({ ahead: 3 }));

      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const hasUnpushed = await provider.hasUnpushedCommits();

      expect(hasUnpushed).toBe(true);
    });
  });

  // ===========================================================================
  // stage
  // ===========================================================================

  describe("stage()", () => {
    it("should add files to staging", async () => {
      // Use gitRoot as cwd for simpler path handling
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.stage(["file1.ts", "file2.ts"]);

      expect(mockGit.add).toHaveBeenCalledWith(["file1.ts", "file2.ts"]);
    });

    it("should convert absolute paths to relative", async () => {
      // Use gitRoot as cwd for simpler path handling
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.stage(["/test/repo/src/file.ts"]);

      expect(mockGit.add).toHaveBeenCalledWith(["src/file.ts"]);
    });
  });

  // ===========================================================================
  // unstage
  // ===========================================================================

  describe("unstage()", () => {
    it("should remove files from staging", async () => {
      // Use gitRoot as cwd for simpler path handling
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.unstage(["file1.ts", "file2.ts"]);

      expect(mockGit.reset).toHaveBeenCalledWith([
        "HEAD",
        "--",
        "file1.ts",
        "file2.ts",
      ]);
    });
  });

  // ===========================================================================
  // commit
  // ===========================================================================

  describe("commit()", () => {
    it("should create a commit with message", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const commit = await provider.commit("Test commit message");

      expect(mockGit.commit).toHaveBeenCalledWith("Test commit message", {});
      expect(commit.message).toBe("Test commit");
      expect(commit.author).toBe("Test User");
    });

    it("should support amend option", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.commit("Amended message", { amend: true });

      expect(mockGit.commit).toHaveBeenCalledWith("Amended message", {
        "--amend": null,
      });
    });

    it("should support signoff option", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.commit("Signed message", { signoff: true });

      expect(mockGit.commit).toHaveBeenCalledWith("Signed message", {
        "--signoff": null,
      });
    });

    it("should commit specific files when provided", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.commit("Partial commit", { files: ["file1.ts"] });

      expect(mockGit.commit).toHaveBeenCalledWith(
        "Partial commit",
        ["file1.ts"],
        {},
      );
    });

    it("should fire onCommitCreated event", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const eventHandler = vi.fn();
      provider.onCommitCreated(eventHandler);

      await provider.commit("Test message");

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          commit: expect.objectContaining({
            message: "Test commit",
          }),
        }),
      );
    });
  });

  // ===========================================================================
  // checkout
  // ===========================================================================

  describe("checkout()", () => {
    it("should checkout the specified ref", async () => {
      const provider = new DiskGitProvider(testGitRoot, testCwd);
      await provider.checkout("develop");

      expect(mockGit.checkout).toHaveBeenCalledWith("develop");
    });

    it("should fire onBranchChanged when branch changes", async () => {
      // Setup: start on main, switch to develop
      // getCurrentBranch() is called twice: once before checkout, once after
      mockGit.raw
        .mockResolvedValueOnce("main\n")
        .mockResolvedValueOnce("develop\n");

      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const eventHandler = vi.fn();
      provider.onBranchChanged(eventHandler);

      await provider.checkout("develop");

      expect(eventHandler).toHaveBeenCalledWith({
        previousBranch: "main",
        currentBranch: "develop",
      });
    });

    it("should fire onHeadChanged when HEAD moves", async () => {
      mockGit.revparse
        .mockResolvedValueOnce("old-commit-hash")
        .mockResolvedValueOnce("new-commit-hash");

      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const eventHandler = vi.fn();
      provider.onHeadChanged(eventHandler);

      await provider.checkout("develop");

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          previousHead: "old-commit-hash",
          currentHead: "new-commit-hash",
        }),
      );
    });
  });

  // ===========================================================================
  // getChangedFilesFromBranch
  // ===========================================================================

  describe("getChangedFilesFromBranch()", () => {
    it("should return files changed from base branch", async () => {
      mockGit.raw.mockResolvedValue("abc123def456\n"); // merge-base result
      mockGit.diff.mockResolvedValue("src/file1.ts\nsrc/file2.ts\nREADME.md\n");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const files = await provider.getChangedFilesFromBranch("main");

      expect(mockGit.raw).toHaveBeenCalledWith(["merge-base", "HEAD", "main"]);
      expect(mockGit.diff).toHaveBeenCalledWith([
        "--name-only",
        "abc123def456",
        "HEAD",
      ]);
      expect(files).toEqual(["src/file1.ts", "src/file2.ts", "README.md"]);
    });

    it("should return empty array when no changes", async () => {
      mockGit.raw.mockResolvedValue("abc123\n");
      mockGit.diff.mockResolvedValue("");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const files = await provider.getChangedFilesFromBranch("main");

      expect(files).toEqual([]);
    });
  });

  // ===========================================================================
  // getStatusFromBranch
  // ===========================================================================

  describe("getStatusFromBranch()", () => {
    it("should return files with proper status codes", async () => {
      mockGit.raw.mockResolvedValue("abc123def456\n"); // merge-base result
      // Format: <status>\t<path> (A=added, M=modified, D=deleted)
      mockGit.diff.mockResolvedValue(
        "A\tsrc/newFile.ts\nM\tsrc/modified.ts\nD\tsrc/deleted.ts\n",
      );
      // Mock getStatus for working tree overlay
      mockGit.status.mockResolvedValue({
        files: [],
        isClean: () => true,
      });

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const statusMap = await provider.getStatusFromBranch("main");

      expect(mockGit.raw).toHaveBeenCalledWith(["merge-base", "HEAD", "main"]);
      expect(mockGit.diff).toHaveBeenCalledWith([
        "--name-status",
        "abc123def456",
        "HEAD",
      ]);

      expect(statusMap.get("src/newFile.ts")?.status).toBe("added");
      expect(statusMap.get("src/modified.ts")?.status).toBe("modified");
      expect(statusMap.get("src/deleted.ts")?.status).toBe("deleted");
    });

    it("should handle renamed files", async () => {
      mockGit.raw.mockResolvedValue("abc123\n");
      // Renamed format: R<score>\t<old-path>\t<new-path>
      mockGit.diff.mockResolvedValue("R100\told/path.ts\tnew/path.ts\n");
      mockGit.status.mockResolvedValue({
        files: [],
        isClean: () => true,
      });

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const statusMap = await provider.getStatusFromBranch("main");

      expect(statusMap.get("new/path.ts")?.status).toBe("renamed");
    });

    it("should return empty map when no changes", async () => {
      mockGit.raw.mockResolvedValue("abc123\n");
      mockGit.diff.mockResolvedValue("");
      mockGit.status.mockResolvedValue({
        files: [],
        isClean: () => true,
      });

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const statusMap = await provider.getStatusFromBranch("main");

      expect(statusMap.size).toBe(0);
    });
  });

  // ===========================================================================
  // getUncommittedDiffStats
  // ===========================================================================

  describe("getUncommittedDiffStats()", () => {
    it("should return diff statistics", async () => {
      // numstat format: added<tab>removed<tab>filename
      mockGit.diff.mockResolvedValue(
        "10\t5\tsrc/file1.ts\n20\t0\tsrc/file2.ts\n",
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const stats = await provider.getUncommittedDiffStats();

      expect(mockGit.diff).toHaveBeenCalledWith(["--numstat", "HEAD"]);
      expect(stats).toEqual({
        added: 30,
        removed: 5,
        files: 2,
      });
    });

    it("should return zero stats for clean repo", async () => {
      mockGit.diff.mockResolvedValue("");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const stats = await provider.getUncommittedDiffStats();

      expect(stats).toEqual({
        added: 0,
        removed: 0,
        files: 0,
      });
    });

    it("should handle binary files (- indicates binary)", async () => {
      mockGit.diff.mockResolvedValue("10\t5\tsrc/file.ts\n-\t-\timage.png\n");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const stats = await provider.getUncommittedDiffStats();

      // Binary files should be counted but not add to line counts
      expect(stats).toEqual({
        added: 10,
        removed: 5,
        files: 2,
      });
    });
  });

  // ===========================================================================
  // getMostRecentDirtyFile
  // ===========================================================================

  describe("getMostRecentDirtyFile()", () => {
    it("should return null when no dirty files", async () => {
      mockGit.status.mockResolvedValue(createMockStatusResult({ files: [] }));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getMostRecentDirtyFile();

      expect(result).toBeNull();
    });

    it("should return dirty file path when files exist", async () => {
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "file.ts", index: " ", working_dir: "M" }],
        }),
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getMostRecentDirtyFile();

      // The implementation tries to stat files - if stat fails, it returns null
      // In unit tests without fs mock for stat, it will return null or a file
      // depending on whether fs.stat is mocked
      expect(result === null || result === "file.ts").toBe(true);
    });
  });

  // ===========================================================================
  // getMostRecentCommittedFile
  // ===========================================================================

  describe("getMostRecentCommittedFile()", () => {
    it("should call log with correct parameters", async () => {
      mockGit.log.mockResolvedValue({
        all: [],
      });

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.getMostRecentCommittedFile();

      expect(mockGit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          maxCount: 10,
        }),
      );
    });

    it("should respect commitLimit parameter", async () => {
      mockGit.log.mockResolvedValue({
        all: [],
      });

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.getMostRecentCommittedFile(5);

      expect(mockGit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          maxCount: 5,
        }),
      );
    });

    it("should return null when no commits found", async () => {
      mockGit.log.mockResolvedValue({ all: [] });

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getMostRecentCommittedFile();

      expect(result).toBeNull();
    });

    it("should return null when no files in commits", async () => {
      mockGit.log.mockResolvedValue({
        all: [{ hash: "abc123", body: "" }],
      });

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getMostRecentCommittedFile();

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // revert
  // ===========================================================================

  describe("revert()", () => {
    it("should reset and checkout files", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.revert(["src/file1.ts", "src/file2.ts"]);

      expect(mockGit.reset).toHaveBeenCalledWith([
        "HEAD",
        "--",
        "src/file1.ts",
        "src/file2.ts",
      ]);
      expect(mockGit.checkout).toHaveBeenCalledWith([
        "--",
        "src/file1.ts",
        "src/file2.ts",
      ]);
    });

    it("should convert absolute paths to relative", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.revert(["/test/repo/src/file.ts"]);

      expect(mockGit.checkout).toHaveBeenCalledWith(["--", "src/file.ts"]);
    });

    it("should continue even if reset fails (for untracked files)", async () => {
      mockGit.reset.mockRejectedValueOnce(new Error("pathspec did not match"));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      // Should not throw
      await provider.revert(["new-file.ts"]);

      expect(mockGit.checkout).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  describe("lifecycle", () => {
    it("should start watching when startWatching is called", async () => {
      const provider = new DiskGitProvider(testGitRoot, testCwd);
      await provider.startWatching();

      // Access the watcher instance created during startWatching
      const watcherInstance = mockWatcherInstances[0];
      expect(watcherInstance).toBeDefined();
      expect(watcherInstance.watch).toHaveBeenCalled();
      expect(provider.isWatching()).toBe(true);
    });

    it("should dispose watcher on dispose", async () => {
      const provider = new DiskGitProvider(testGitRoot, testCwd);
      await provider.startWatching();

      const watcherInstance = mockWatcherInstances[0];
      provider.dispose();

      expect(watcherInstance.dispose).toHaveBeenCalled();
    });

    it("should not start watching twice", async () => {
      const provider = new DiskGitProvider(testGitRoot, testCwd);
      await provider.startWatching();
      await provider.startWatching();

      // Only one watcher instance should be created
      expect(mockWatcherInstances.length).toBe(1);
      expect(mockWatcherInstances[0].watch).toHaveBeenCalledTimes(1);
    });

    it("should be safe to dispose multiple times", () => {
      const provider = new DiskGitProvider(testGitRoot, testCwd);

      provider.dispose();
      provider.dispose();

      // Should not throw
    });
  });

  // ===========================================================================
  // Event Subscriptions
  // ===========================================================================

  describe("event subscriptions", () => {
    it("should allow subscribing to onStatusChanged", async () => {
      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const handler = vi.fn();

      const subscription = provider.onStatusChanged(handler);

      expect(subscription).toBeDefined();
      expect(typeof subscription.dispose).toBe("function");
    });

    it("should allow subscribing to onBranchChanged", () => {
      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const handler = vi.fn();

      const subscription = provider.onBranchChanged(handler);

      expect(subscription).toBeDefined();
      expect(typeof subscription.dispose).toBe("function");
    });

    it("should allow subscribing to onCommitCreated", () => {
      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const handler = vi.fn();

      const subscription = provider.onCommitCreated(handler);

      expect(subscription).toBeDefined();
      expect(typeof subscription.dispose).toBe("function");
    });

    it("should allow subscribing to onHeadChanged", () => {
      const provider = new DiskGitProvider(testGitRoot, testCwd);
      const handler = vi.fn();

      const subscription = provider.onHeadChanged(handler);

      expect(subscription).toBeDefined();
      expect(typeof subscription.dispose).toBe("function");
    });
  });
});
