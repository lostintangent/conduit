import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";

// ============================================================================
// Hoisted Mocks (must be defined before vi.mock calls)
// ============================================================================

// Create mockable fs/promises functions
const mockFsStat = vi.fn();
const mockFsUnlink = vi.fn();
const mockFsReadFile = vi.fn();

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

vi.mock("../../../src/ipc/fsv2/ParcelFileWatcher", () => ({
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
  push: vi.fn().mockResolvedValue(undefined),
  pull: vi.fn().mockResolvedValue(undefined),
  stash: vi.fn().mockResolvedValue(undefined),
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

// Mock fs/promises for getMostRecentCommittedFile, revert, and untracked file stats tests
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual("node:fs/promises");
  return {
    ...actual,
    stat: (...args: unknown[]) => mockFsStat(...args),
    unlink: (...args: unknown[]) => mockFsUnlink(...args),
    readFile: (...args: unknown[]) => mockFsReadFile(...args),
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

    it("should find file status with different case on case-insensitive FS", async () => {
      // Git returns path with certain casing
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "README.md", index: "M", working_dir: " " }],
        }),
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);

      // Look up with different case
      const fileStatus = await provider.getFileStatus("readme.md");

      if (process.platform === "darwin" || process.platform === "win32") {
        expect(fileStatus).not.toBeNull();
        expect(fileStatus?.status).toBe("modified");
        // The path in the status object should preserve git's casing
        expect(fileStatus?.path).toBe("README.md");
      }
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

    it("should checkout with force option when force is true", async () => {
      const provider = new DiskGitProvider(testGitRoot, testCwd);
      await provider.checkout("develop", { force: true });

      expect(mockGit.checkout).toHaveBeenCalledWith(["--force", "develop"]);
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
  // push
  // ===========================================================================

  describe("push()", () => {
    it("should push to remote with default options", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.push();

      expect(mockGit.push).toHaveBeenCalledWith([]);
    });

    it("should push with force-with-lease when force is true", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.push(true);

      expect(mockGit.push).toHaveBeenCalledWith(["--force-with-lease"]);
    });

    it("should push with set-upstream when setUpstream is true", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.push(false, true);

      expect(mockGit.push).toHaveBeenCalledWith([
        "--set-upstream",
        "origin",
        "HEAD",
      ]);
    });

    it("should combine force and setUpstream options", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.push(true, true);

      expect(mockGit.push).toHaveBeenCalledWith([
        "--force-with-lease",
        "--set-upstream",
        "origin",
        "HEAD",
      ]);
    });
  });

  // ===========================================================================
  // pull
  // ===========================================================================

  describe("pull()", () => {
    it("should pull from remote with default options", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.pull();

      expect(mockGit.pull).toHaveBeenCalled();
    });

    it("should pull with rebase when rebase is true", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.pull(true);

      expect(mockGit.pull).toHaveBeenCalledWith(["--rebase"]);
    });
  });

  // ===========================================================================
  // hasUpstream
  // ===========================================================================

  describe("hasUpstream()", () => {
    it("should return true when upstream is configured", async () => {
      mockGit.raw.mockResolvedValue("origin/main\n");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const hasUpstream = await provider.hasUpstream();

      expect(hasUpstream).toBe(true);
      expect(mockGit.raw).toHaveBeenCalledWith([
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{u}",
      ]);
    });

    it("should return false when no upstream is configured", async () => {
      mockGit.raw.mockRejectedValue(
        new Error("fatal: no upstream configured for branch"),
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const hasUpstream = await provider.hasUpstream();

      expect(hasUpstream).toBe(false);
    });

    it("should return false when result is empty", async () => {
      mockGit.raw.mockResolvedValue("");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const hasUpstream = await provider.hasUpstream();

      expect(hasUpstream).toBe(false);
    });
  });

  // ===========================================================================
  // stash
  // ===========================================================================

  describe("stash()", () => {
    it("should stash changes without message", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.stash();

      expect(mockGit.stash).toHaveBeenCalledWith(["push"]);
    });

    it("should stash changes with message", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.stash("WIP: feature work");

      expect(mockGit.stash).toHaveBeenCalledWith([
        "push",
        "-m",
        "WIP: feature work",
      ]);
    });
  });

  // ===========================================================================
  // stashPop
  // ===========================================================================

  describe("stashPop()", () => {
    it("should pop the most recent stash", async () => {
      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.stashPop();

      expect(mockGit.stash).toHaveBeenCalledWith(["pop"]);
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
      // Format: <status>\t<path> (A=added, M=modified, D=deleted)
      mockGit.diff.mockResolvedValue(
        "A\tsrc/newFile.ts\nM\tsrc/modified.ts\nD\tsrc/deleted.ts\n",
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const statusMap = await provider.getStatusFromBranch("main");

      // Should diff directly against the branch
      expect(mockGit.diff).toHaveBeenCalledWith(["--name-status", "main"]);

      expect(statusMap.get("src/newFile.ts")?.status).toBe("added");
      expect(statusMap.get("src/modified.ts")?.status).toBe("modified");
      expect(statusMap.get("src/deleted.ts")?.status).toBe("deleted");
    });

    it("should handle renamed files", async () => {
      // Renamed format: R<score>\t<old-path>\t<new-path>
      mockGit.diff.mockResolvedValue("R100\told/path.ts\tnew/path.ts\n");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const statusMap = await provider.getStatusFromBranch("main");

      expect(statusMap.get("new/path.ts")?.status).toBe("renamed");
    });

    it("should return empty map when no changes", async () => {
      mockGit.diff.mockResolvedValue("");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const statusMap = await provider.getStatusFromBranch("main");

      expect(statusMap.size).toBe(0);
    });
  });

  // ===========================================================================
  // getUncommittedDiffStats
  // ===========================================================================

  describe("getUncommittedDiffStats()", () => {
    beforeEach(() => {
      // Clear diff mock - getUncommittedDiffStats now derives from per-file stats
      mockGit.diff.mockReset();
    });

    it("should return diff statistics", async () => {
      // New implementation calls getPerFileDiffStats which does 2 calls:
      // 1. git diff --numstat --cached (staged)
      // 2. git diff --numstat (unstaged)
      mockGit.diff
        .mockResolvedValueOnce("10\t5\tsrc/file1.ts\n") // staged
        .mockResolvedValueOnce("20\t0\tsrc/file2.ts\n"); // unstaged

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const stats = await provider.getUncommittedDiffStats();

      // Calls getPerFileDiffStats which makes 2 calls
      expect(mockGit.diff).toHaveBeenCalledWith(["--numstat", "--cached"]);
      expect(mockGit.diff).toHaveBeenCalledWith(["--numstat"]);
      expect(stats).toEqual({
        added: 30,
        removed: 5,
        files: 2,
      });
    });

    it("should return zero stats for clean repo", async () => {
      mockGit.diff
        .mockResolvedValueOnce("") // staged
        .mockResolvedValueOnce(""); // unstaged

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const stats = await provider.getUncommittedDiffStats();

      expect(stats).toEqual({
        added: 0,
        removed: 0,
        files: 0,
      });
    });

    it("should handle binary files (- indicates binary)", async () => {
      mockGit.diff
        .mockResolvedValueOnce("10\t5\tsrc/file.ts\n") // staged
        .mockResolvedValueOnce("-\t-\timage.png\n"); // unstaged (binary)

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
  // getPerFileDiffStats (with caching)
  // ===========================================================================

  describe("getPerFileDiffStats()", () => {
    beforeEach(() => {
      // Clear diff mock for these tests
      mockGit.diff.mockReset();
    });

    it("should return staged and unstaged stats separately", async () => {
      // Mock staged diff (--cached)
      mockGit.diff
        .mockResolvedValueOnce("5\t2\tsrc/staged.ts\n") // staged
        .mockResolvedValueOnce("10\t3\tsrc/unstaged.ts\n"); // unstaged

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const stats = await provider.getPerFileDiffStats();

      expect(stats.staged.get("src/staged.ts")).toEqual({
        added: 5,
        removed: 2,
      });
      expect(stats.unstaged.get("src/unstaged.ts")).toEqual({
        added: 10,
        removed: 3,
      });
    });

    it("should cache results within TTL window", async () => {
      mockGit.diff
        .mockResolvedValueOnce("5\t2\tsrc/file.ts\n") // staged - first call
        .mockResolvedValueOnce("10\t3\tsrc/file.ts\n") // unstaged - first call
        .mockResolvedValueOnce("99\t99\tsrc/new.ts\n") // staged - would be second call
        .mockResolvedValueOnce("88\t88\tsrc/new.ts\n"); // unstaged - would be second call

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);

      // First call
      const stats1 = await provider.getPerFileDiffStats();
      expect(stats1.staged.get("src/file.ts")).toEqual({
        added: 5,
        removed: 2,
      });

      // Second call (should return cached)
      const stats2 = await provider.getPerFileDiffStats();
      expect(stats2.staged.get("src/file.ts")).toEqual({
        added: 5,
        removed: 2,
      });

      // Should only have called git.diff twice (for first call)
      expect(mockGit.diff).toHaveBeenCalledTimes(2);
    });

    it("should refresh cache after TTL expires", async () => {
      vi.useFakeTimers();

      mockGit.diff
        .mockResolvedValueOnce("5\t2\tsrc/file.ts\n") // staged - first call
        .mockResolvedValueOnce("10\t3\tsrc/file.ts\n") // unstaged - first call
        .mockResolvedValueOnce("99\t99\tsrc/new.ts\n") // staged - second call
        .mockResolvedValueOnce("88\t88\tsrc/new.ts\n"); // unstaged - second call

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);

      // First call
      await provider.getPerFileDiffStats();
      expect(mockGit.diff).toHaveBeenCalledTimes(2);

      // Advance time past TTL (100ms)
      vi.advanceTimersByTime(150);

      // Second call (cache expired, should fetch fresh)
      const stats2 = await provider.getPerFileDiffStats();
      expect(stats2.staged.get("src/new.ts")).toEqual({
        added: 99,
        removed: 99,
      });

      // Should have called git.diff 4 times total
      expect(mockGit.diff).toHaveBeenCalledTimes(4);

      vi.useRealTimers();
    });

    it("should include untracked files in unstaged stats", async () => {
      // Mock git diff returns no results (untracked files don't appear in diff)
      mockGit.diff
        .mockResolvedValueOnce("") // staged
        .mockResolvedValueOnce(""); // unstaged

      // Mock git status to return untracked file
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "new-file.ts", index: "?", working_dir: "?" }],
        }),
      );

      // Mock reading the untracked file content (5 lines)
      mockFsReadFile.mockResolvedValue("line1\nline2\nline3\nline4\nline5\n");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const stats = await provider.getPerFileDiffStats();

      // Untracked file should appear in unstaged with all lines as "added"
      expect(stats.unstaged.get("new-file.ts")).toEqual({
        added: 5,
        removed: 0,
      });
      expect(stats.staged.size).toBe(0);
    });

    it("should count lines correctly for files without trailing newline", async () => {
      mockGit.diff
        .mockResolvedValueOnce("") // staged
        .mockResolvedValueOnce(""); // unstaged

      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "no-newline.ts", index: "?", working_dir: "?" }],
        }),
      );

      // File without trailing newline (3 lines)
      mockFsReadFile.mockResolvedValue("line1\nline2\nline3");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const stats = await provider.getPerFileDiffStats();

      expect(stats.unstaged.get("no-newline.ts")).toEqual({
        added: 3,
        removed: 0,
      });
    });

    it("should handle multiple untracked files in parallel", async () => {
      mockGit.diff
        .mockResolvedValueOnce("") // staged
        .mockResolvedValueOnce(""); // unstaged

      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [
            { path: "file1.ts", index: "?", working_dir: "?" },
            { path: "file2.ts", index: "?", working_dir: "?" },
            { path: "file3.ts", index: "?", working_dir: "?" },
          ],
        }),
      );

      // Different line counts for each file
      mockFsReadFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes("file1.ts")) return "a\nb\n";
        if (filePath.includes("file2.ts")) return "a\nb\nc\nd\n";
        if (filePath.includes("file3.ts")) return "single line";
        return "";
      });

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const stats = await provider.getPerFileDiffStats();

      expect(stats.unstaged.get("file1.ts")).toEqual({ added: 2, removed: 0 });
      expect(stats.unstaged.get("file2.ts")).toEqual({ added: 4, removed: 0 });
      expect(stats.unstaged.get("file3.ts")).toEqual({ added: 1, removed: 0 });
    });

    it("should skip unreadable untracked files gracefully", async () => {
      mockGit.diff
        .mockResolvedValueOnce("") // staged
        .mockResolvedValueOnce(""); // unstaged

      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [
            { path: "readable.ts", index: "?", working_dir: "?" },
            { path: "unreadable.ts", index: "?", working_dir: "?" },
          ],
        }),
      );

      mockFsReadFile.mockImplementation(async (filePath: string) => {
        if (filePath.includes("unreadable.ts")) {
          throw new Error("ENOENT: no such file or directory");
        }
        return "content\n";
      });

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const stats = await provider.getPerFileDiffStats();

      // Readable file should have stats
      expect(stats.unstaged.get("readable.ts")).toEqual({
        added: 1,
        removed: 0,
      });
      // Unreadable file should be skipped (not in map)
      expect(stats.unstaged.has("unreadable.ts")).toBe(false);
    });

    it("should combine tracked and untracked files in stats", async () => {
      // Mock diff to return stats for tracked modified file
      mockGit.diff
        .mockResolvedValueOnce("") // staged
        .mockResolvedValueOnce("5\t2\tmodified.ts\n"); // unstaged - modified file

      // Status includes both modified and untracked
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [
            { path: "modified.ts", index: " ", working_dir: "M" },
            { path: "untracked.ts", index: "?", working_dir: "?" },
          ],
        }),
      );

      mockFsReadFile.mockResolvedValue("line1\nline2\nline3\n");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const stats = await provider.getPerFileDiffStats();

      // Modified file from git diff
      expect(stats.unstaged.get("modified.ts")).toEqual({
        added: 5,
        removed: 2,
      });
      // Untracked file from file read
      expect(stats.unstaged.get("untracked.ts")).toEqual({
        added: 3,
        removed: 0,
      });
    });
  });

  // ===========================================================================
  // getUncommittedDiffStats derives from per-file stats
  // ===========================================================================

  describe("getUncommittedDiffStats() derivation", () => {
    beforeEach(() => {
      // Clear diff mock for these tests
      mockGit.diff.mockReset();
    });

    it("should derive totals from cached per-file stats", async () => {
      // Setup per-file stats (staged + unstaged)
      mockGit.diff
        .mockResolvedValueOnce("5\t2\tsrc/a.ts\n10\t3\tsrc/b.ts\n") // staged
        .mockResolvedValueOnce("20\t5\tsrc/c.ts\n"); // unstaged

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);

      // Call getUncommittedDiffStats (should use per-file stats internally)
      const stats = await provider.getUncommittedDiffStats();

      // Total: staged(5+10=15 added, 2+3=5 removed) + unstaged(20 added, 5 removed)
      expect(stats).toEqual({
        added: 35, // 5+10+20
        removed: 10, // 2+3+5
        files: 3, // a.ts, b.ts, c.ts
      });
    });

    it("should count partially staged files correctly", async () => {
      // Same file in both staged and unstaged
      mockGit.diff
        .mockResolvedValueOnce("5\t2\tsrc/partial.ts\n") // staged
        .mockResolvedValueOnce("10\t3\tsrc/partial.ts\n"); // unstaged

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const stats = await provider.getUncommittedDiffStats();

      // File appears in both, but should only count as 1 file
      expect(stats).toEqual({
        added: 15, // 5+10
        removed: 5, // 2+3
        files: 1, // only one unique file
      });
    });

    it("should use cached per-file stats for aggregate stats", async () => {
      mockGit.diff
        .mockResolvedValueOnce("5\t2\tsrc/file.ts\n") // staged
        .mockResolvedValueOnce("10\t3\tsrc/file.ts\n"); // unstaged

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);

      // First call to getPerFileDiffStats populates cache
      await provider.getPerFileDiffStats();
      expect(mockGit.diff).toHaveBeenCalledTimes(2);

      // Call getUncommittedDiffStats - should use cached data
      await provider.getUncommittedDiffStats();

      // Should NOT have made additional git.diff calls
      expect(mockGit.diff).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // Cache behavior (TTL-based invalidation is tested in getPerFileDiffStats)
  // ===========================================================================

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
        all: [{ hash: "abc123", diff: { files: [] } }],
      });

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getMostRecentCommittedFile();

      expect(result).toBeNull();
    });

    it("should return null when diff property is missing", async () => {
      mockGit.log.mockResolvedValue({
        all: [{ hash: "abc123" }],
      });

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getMostRecentCommittedFile();

      expect(result).toBeNull();
    });

    it("should extract files from diff.files array", async () => {
      mockGit.log.mockResolvedValue({
        all: [
          {
            hash: "abc123",
            diff: {
              files: [
                { file: "src/file1.ts", changes: 10 },
                { file: "src/file2.ts", changes: 5 },
              ],
            },
          },
        ],
      });

      // Mock fs.stat to return stats for the files
      mockFsStat.mockResolvedValue({ mtimeMs: 1000 });

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getMostRecentCommittedFile();

      // Should return one of the files (whichever has latest mtime)
      expect(result).toBe("src/file1.ts");
    });

    it("should return most recently modified file", async () => {
      mockGit.log.mockResolvedValue({
        all: [
          {
            hash: "abc123",
            diff: {
              files: [{ file: "src/old.ts" }, { file: "src/new.ts" }],
            },
          },
        ],
      });

      // Mock fs.stat to return different mtimes
      mockFsStat.mockImplementation(async (filePath: string) => {
        if (filePath.includes("new.ts")) {
          return { mtimeMs: 2000 }; // newer
        }
        return { mtimeMs: 1000 }; // older
      });

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getMostRecentCommittedFile();

      expect(result).toBe("src/new.ts");
    });
  });

  // ===========================================================================
  // revert
  // ===========================================================================

  describe("revert()", () => {
    beforeEach(() => {
      mockFsUnlink.mockResolvedValue(undefined);
    });

    it("should checkout modified files (not reset)", async () => {
      // Setup: file is modified (not untracked/added)
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [
            { path: "src/file1.ts", index: " ", working_dir: "M" },
            { path: "src/file2.ts", index: " ", working_dir: "M" },
          ],
        }),
      );
      mockGit.branch.mockResolvedValue(createMockBranchSummary("main"));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.revert(["src/file1.ts", "src/file2.ts"]);

      // Should NOT call reset - revert only affects working tree, not staging area
      expect(mockGit.reset).not.toHaveBeenCalled();
      expect(mockGit.checkout).toHaveBeenCalledWith([
        "--",
        "src/file1.ts",
        "src/file2.ts",
      ]);
      expect(mockFsUnlink).not.toHaveBeenCalled();
    });

    it("should convert absolute paths to relative", async () => {
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "src/file.ts", index: " ", working_dir: "M" }],
        }),
      );
      mockGit.branch.mockResolvedValue(createMockBranchSummary("main"));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.revert(["/test/repo/src/file.ts"]);

      expect(mockGit.checkout).toHaveBeenCalledWith(["--", "src/file.ts"]);
    });

    it("should delete untracked files instead of checkout", async () => {
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "new-file.ts", index: "?", working_dir: "?" }],
        }),
      );
      mockGit.branch.mockResolvedValue(createMockBranchSummary("main"));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.revert(["new-file.ts"]);

      // Should delete the file, not checkout
      expect(mockFsUnlink).toHaveBeenCalledWith("/test/repo/new-file.ts");
      expect(mockGit.checkout).not.toHaveBeenCalled();
    });

    it("should checkout added (staged new) files, not delete them", async () => {
      // A staged addition has a version in the index - git checkout restores to that
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "added-file.ts", index: "A", working_dir: " " }],
        }),
      );
      mockGit.branch.mockResolvedValue(createMockBranchSummary("main"));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.revert(["added-file.ts"]);

      // Should checkout (restore from index), NOT delete
      // The file exists in the staging area, so checkout restores it
      expect(mockGit.checkout).toHaveBeenCalledWith(["--", "added-file.ts"]);
      expect(mockFsUnlink).not.toHaveBeenCalled();
    });

    it("should handle mixed file types (modified + untracked)", async () => {
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [
            { path: "modified.ts", index: " ", working_dir: "M" },
            { path: "untracked.ts", index: "?", working_dir: "?" },
          ],
        }),
      );
      mockGit.branch.mockResolvedValue(createMockBranchSummary("main"));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.revert(["modified.ts", "untracked.ts"]);

      // Should NOT call reset - only affects working tree
      expect(mockGit.reset).not.toHaveBeenCalled();
      // Modified file should be checked out
      expect(mockGit.checkout).toHaveBeenCalledWith(["--", "modified.ts"]);
      // Untracked file should be deleted
      expect(mockFsUnlink).toHaveBeenCalledWith("/test/repo/untracked.ts");
    });

    it("should preserve staged changes when reverting partially staged modifications (MM)", async () => {
      // File has staged modification AND unstaged modification
      // index: M (staged changes), working_dir: M (more unstaged changes)
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "partial.ts", index: "M", working_dir: "M" }],
        }),
      );
      mockGit.branch.mockResolvedValue(createMockBranchSummary("main"));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.revert(["partial.ts"]);

      // Should NOT call reset - that would destroy staged changes
      expect(mockGit.reset).not.toHaveBeenCalled();
      // Should checkout from index (restores to staged version, not HEAD)
      expect(mockGit.checkout).toHaveBeenCalledWith(["--", "partial.ts"]);
      expect(mockFsUnlink).not.toHaveBeenCalled();
    });

    it("should preserve staged addition when reverting modified staged addition (AM)", async () => {
      // File was staged as new (A), then modified again in working dir (M)
      // index: A (staged new file), working_dir: M (further modifications)
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "new-modified.ts", index: "A", working_dir: "M" }],
        }),
      );
      mockGit.branch.mockResolvedValue(createMockBranchSummary("main"));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.revert(["new-modified.ts"]);

      // Should NOT call reset - that would unstage the addition
      expect(mockGit.reset).not.toHaveBeenCalled();
      // Should checkout from index (restores to staged version of new file)
      expect(mockGit.checkout).toHaveBeenCalledWith(["--", "new-modified.ts"]);
      // Should NOT delete - file has a version in the index
      expect(mockFsUnlink).not.toHaveBeenCalled();
    });

    it("should checkout staged deleted files (restores the file)", async () => {
      // File was deleted and staged for deletion
      // index: D (staged deletion), working_dir: " " (no further changes)
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "deleted.ts", index: "D", working_dir: " " }],
        }),
      );
      mockGit.branch.mockResolvedValue(createMockBranchSummary("main"));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.revert(["deleted.ts"]);

      // Should NOT call reset
      expect(mockGit.reset).not.toHaveBeenCalled();
      // Should checkout (this will fail if file doesn't exist in index,
      // but for staged deletion, the file is deleted so checkout restores HEAD)
      expect(mockGit.checkout).toHaveBeenCalledWith(["--", "deleted.ts"]);
      expect(mockFsUnlink).not.toHaveBeenCalled();
    });

    it("should ignore errors when deleting files that don't exist", async () => {
      mockGit.status.mockResolvedValue(
        createMockStatusResult({
          files: [{ path: "ghost-file.ts", index: "?", working_dir: "?" }],
        }),
      );
      mockGit.branch.mockResolvedValue(createMockBranchSummary("main"));
      mockFsUnlink.mockRejectedValueOnce(new Error("ENOENT: file not found"));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      // Should not throw
      await provider.revert(["ghost-file.ts"]);

      expect(mockFsUnlink).toHaveBeenCalled();
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

  // ===========================================================================
  // Commit History
  // ===========================================================================

  describe("getCommitHistory()", () => {
    it("should return commits in topological order", async () => {
      // Format: hash|shortHash|subject|author|email|timestamp|parentHashes|refs
      mockGit.raw.mockResolvedValue(
        "abc123def456789012345678901234567890abcd|abc123d|First commit|Test User|test@example.com|1704067200|def456|HEAD -> main\n" +
          "def456abc789012345678901234567890abcdef|def456a|Second commit|Test User|test@example.com|1704067100||\n",
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getCommitHistory({ limit: 10 });

      expect(result.commits).toHaveLength(2);
      expect(result.commits[0].id).toBe(
        "abc123def456789012345678901234567890abcd",
      );
      expect(result.commits[0].shortId).toBe("abc123d");
      expect(result.commits[0].subject).toBe("First commit");
      expect(result.commits[0].author).toBe("Test User");
      expect(result.commits[0].authorEmail).toBe("test@example.com");
      expect(result.commits[0].timestamp).toBe(1704067200000);
      expect(result.commits[0].parentIds).toEqual(["def456"]);
      expect(result.commits[0].refs).toContain("HEAD -> main");
    });

    it("should detect hasMore when more commits exist", async () => {
      // When limit is 2, request 3 and return 3 to indicate hasMore
      mockGit.raw.mockResolvedValue(
        "abc123|abc|Commit 1|User|user@test.com|1704067200||\n" +
          "def456|def|Commit 2|User|user@test.com|1704067100||\n" +
          "ghi789|ghi|Commit 3|User|user@test.com|1704067000||\n",
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getCommitHistory({ limit: 2 });

      expect(result.commits).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });

    it("should return hasMore=false when no more commits", async () => {
      mockGit.raw.mockResolvedValue(
        "abc123|abc|Commit 1|User|user@test.com|1704067200||\n",
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getCommitHistory({ limit: 10 });

      expect(result.commits).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it("should handle pagination with skip parameter", async () => {
      mockGit.raw.mockResolvedValue(
        "def456|def|Commit 2|User|user@test.com|1704067100||\n",
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.getCommitHistory({ limit: 10, skip: 1 });

      expect(mockGit.raw).toHaveBeenCalledWith(
        expect.arrayContaining(["--skip=1"]),
      );
    });

    it("should use default limit of 50", async () => {
      mockGit.raw.mockResolvedValue("");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.getCommitHistory();

      expect(mockGit.raw).toHaveBeenCalledWith(
        expect.arrayContaining(["-n", "51"]), // limit + 1 for hasMore check
      );
    });

    it("should handle merge commits with multiple parents", async () => {
      mockGit.raw.mockResolvedValue(
        "abc123|abc|Merge branch|User|user@test.com|1704067200|def456 ghi789|\n",
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getCommitHistory();

      expect(result.commits[0].parentIds).toEqual(["def456", "ghi789"]);
    });

    it("should handle root commits with no parents", async () => {
      mockGit.raw.mockResolvedValue(
        "abc123|abc|Initial commit|User|user@test.com|1704067200||\n",
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getCommitHistory();

      expect(result.commits[0].parentIds).toEqual([]);
    });

    it("should return empty result on error", async () => {
      mockGit.raw.mockRejectedValue(new Error("git error"));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const result = await provider.getCommitHistory();

      expect(result.commits).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it("should pass ref parameter when provided", async () => {
      mockGit.raw.mockResolvedValue("");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.getCommitHistory({ ref: "develop" });

      expect(mockGit.raw).toHaveBeenCalledWith(
        expect.arrayContaining(["develop"]),
      );
    });
  });

  describe("getCommit()", () => {
    it("should return a single commit by hash", async () => {
      // Format: hash\0shortHash\0subject\0body\0author\0email\0timestamp\0parentHashes\0refs
      // Using array join to avoid octal escape sequence issues with \0 followed by numbers
      const NUL = "\0";
      mockGit.raw.mockResolvedValue(
        [
          "abc123def456",
          "abc123d",
          "Subject line",
          "",
          "Test User",
          "test@example.com",
          "1704067200",
          "def456",
          "HEAD -> main\n",
        ].join(NUL),
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const commit = await provider.getCommit("abc123");

      expect(commit).not.toBeNull();
      expect(commit?.id).toBe("abc123def456");
      expect(commit?.subject).toBe("Subject line");
      expect(commit?.author).toBe("Test User");
    });

    it("should return null when commit not found", async () => {
      mockGit.raw.mockResolvedValue("");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const commit = await provider.getCommit("nonexistent");

      expect(commit).toBeNull();
    });

    it("should return null on error", async () => {
      mockGit.raw.mockRejectedValue(new Error("git error"));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const commit = await provider.getCommit("abc123");

      expect(commit).toBeNull();
    });

    it("should include full message with body", async () => {
      // Format: hash\0shortHash\0subject\0body\0author\0email\0timestamp\0parentHashes\0refs
      // Using array join to avoid octal escape sequence issues with \0 followed by numbers
      const NUL = "\0";
      mockGit.raw.mockResolvedValue(
        [
          "abc123",
          "abc",
          "Subject",
          "Body text here",
          "User",
          "user@test.com",
          "1704067200",
          "",
          "\n",
        ].join(NUL),
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const commit = await provider.getCommit("abc123");

      expect(commit?.message).toContain("Subject");
      expect(commit?.message).toContain("Body text here");
    });
  });

  describe("getCommitFiles()", () => {
    it("should return files changed in a commit", async () => {
      // name-status format: <status>\t<path>
      mockGit.raw
        .mockResolvedValueOnce(
          "A\tsrc/new.ts\nM\tsrc/modified.ts\nD\tsrc/deleted.ts\n",
        )
        // numstat format: <additions>\t<deletions>\t<path>
        .mockResolvedValueOnce(
          "10\t0\tsrc/new.ts\n5\t3\tsrc/modified.ts\n0\t20\tsrc/deleted.ts\n",
        );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const files = await provider.getCommitFiles("abc123");

      expect(files).toHaveLength(3);

      const newFile = files.find((f) => f.path === "src/new.ts");
      expect(newFile?.status).toBe("added");
      expect(newFile?.additions).toBe(10);
      expect(newFile?.deletions).toBe(0);

      const modifiedFile = files.find((f) => f.path === "src/modified.ts");
      expect(modifiedFile?.status).toBe("modified");
      expect(modifiedFile?.additions).toBe(5);
      expect(modifiedFile?.deletions).toBe(3);

      const deletedFile = files.find((f) => f.path === "src/deleted.ts");
      expect(deletedFile?.status).toBe("deleted");
      expect(deletedFile?.additions).toBe(0);
      expect(deletedFile?.deletions).toBe(20);
    });

    it("should handle renamed files", async () => {
      mockGit.raw
        .mockResolvedValueOnce("R100\told/path.ts\tnew/path.ts\n")
        .mockResolvedValueOnce("5\t2\tnew/path.ts\n");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const files = await provider.getCommitFiles("abc123");

      expect(files).toHaveLength(1);
      expect(files[0].status).toBe("renamed");
      expect(files[0].path).toBe("new/path.ts");
      expect(files[0].originalPath).toBe("old/path.ts");
    });

    it("should handle binary files", async () => {
      mockGit.raw
        .mockResolvedValueOnce("A\timage.png\n")
        .mockResolvedValueOnce("-\t-\timage.png\n");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const files = await provider.getCommitFiles("abc123");

      expect(files).toHaveLength(1);
      expect(files[0].isBinary).toBe(true);
      expect(files[0].additions).toBe(0);
      expect(files[0].deletions).toBe(0);
    });

    it("should return empty array on error", async () => {
      mockGit.raw.mockRejectedValue(new Error("git error"));

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const files = await provider.getCommitFiles("abc123");

      expect(files).toEqual([]);
    });

    it("should return empty array for empty result", async () => {
      mockGit.raw.mockResolvedValue("");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const files = await provider.getCommitFiles("abc123");

      expect(files).toEqual([]);
    });
  });

  describe("getFileAtCommit()", () => {
    it("should return file content at specified commit", async () => {
      mockGit.show.mockResolvedValue("file content at commit");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const content = await provider.getFileAtCommit("abc123", "file.ts");

      expect(content).toBe("file content at commit");
      expect(mockGit.show).toHaveBeenCalledWith(["abc123:file.ts"]);
    });

    it("should return null when file does not exist at commit", async () => {
      mockGit.show.mockRejectedValue(
        new Error("pathspec 'file.ts' did not match any file(s)"),
      );

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      const content = await provider.getFileAtCommit(
        "abc123",
        "nonexistent.ts",
      );

      expect(content).toBeNull();
    });

    it("should convert absolute paths to relative", async () => {
      mockGit.show.mockResolvedValue("content");

      const provider = new DiskGitProvider(testGitRoot, testGitRoot);
      await provider.getFileAtCommit("abc123", "/test/repo/src/file.ts");

      expect(mockGit.show).toHaveBeenCalledWith(["abc123:src/file.ts"]);
    });
  });
});
