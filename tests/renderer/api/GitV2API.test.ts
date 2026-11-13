import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

// Use vi.hoisted to define mocks before imports
const { mockGit } = vi.hoisted(() => {
  const git = {
    getStatus: vi.fn(),
    getFileStatus: vi.fn(),
    hasUncommittedChanges: vi.fn(),
    hasUnpushedCommits: vi.fn(),
    getFileDiff: vi.fn(),
    getFileAtRef: vi.fn(),
    stage: vi.fn(),
    unstage: vi.fn(),
    commit: vi.fn(),
    getCurrentBranch: vi.fn(),
    getBranches: vi.fn(),
    checkout: vi.fn(),
    stash: vi.fn(),
    stashPop: vi.fn(),
    // Remote operations
    push: vi.fn(),
    pull: vi.fn(),
    hasUpstream: vi.fn(),
    findRoot: vi.fn(),
    // New comparison operations
    getChangedFilesFromBranch: vi.fn(),
    getStatusFromBranch: vi.fn(),
    getUncommittedDiffStats: vi.fn(),
    getMostRecentDirtyFile: vi.fn(),
    getMostRecentCommittedFile: vi.fn(),
    revert: vi.fn(),
    // Subscriptions
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    onStatusChanged: vi.fn(() => vi.fn()),
    onBranchChanged: vi.fn(() => vi.fn()),
    onCommitCreated: vi.fn(() => vi.fn()),
    onHeadChanged: vi.fn(() => vi.fn()),
  };

  // Set up window.conduit before any modules load
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.conduit = {
    git,
  };

  return { mockGit: git };
});

// Import after mocks are set up
import { GitV2API } from "../../../src/renderer/api/GitV2API";

// ============================================================================
// Tests
// ============================================================================

describe("GitV2API", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure window.conduit is available
    (globalThis as any).window.conduit = { git: mockGit };

    // Reset mock implementations
    mockGit.subscribe.mockResolvedValue("test-sub-id");
    mockGit.findRoot.mockResolvedValue("/test/repo");
    mockGit.unsubscribe.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Construction and Properties
  // ===========================================================================

  describe("construction", () => {
    it("should create instance with cwd", () => {
      const api = new GitV2API("/test/project");
      expect(api.cwd).toBe("/test/project");
      api.release();
    });

    it("should not be released initially", () => {
      const api = new GitV2API("/test/project");
      expect(api.isReleased).toBe(false);
      api.release();
    });
  });

  // ===========================================================================
  // Status Operations
  // ===========================================================================

  describe("getStatus", () => {
    it("should return deserialized status with Map", async () => {
      const serializedStatus = {
        branch: "main",
        upstream: "origin/main",
        ahead: 1,
        behind: 0,
        files: {
          "src/file.ts": {
            path: "src/file.ts",
            status: "modified",
            staged: false,
          },
        },
      };
      mockGit.getStatus.mockResolvedValue(serializedStatus);

      const api = new GitV2API("/test/project");
      const result = await api.getStatus();

      expect(result).not.toBeNull();
      expect(result!.branch).toBe("main");
      expect(result!.upstream).toBe("origin/main");
      expect(result!.ahead).toBe(1);
      expect(result!.behind).toBe(0);

      // Files should be a Map
      expect(result!.files).toBeInstanceOf(Map);
      expect(result!.files.size).toBe(1);
      expect(result!.files.get("src/file.ts")).toEqual({
        path: "src/file.ts",
        status: "modified",
        staged: false,
      });

      api.release();
    });

    it("should return null for non-git directory", async () => {
      mockGit.getStatus.mockResolvedValue(null);

      const api = new GitV2API("/not/a/repo");
      const result = await api.getStatus();

      expect(result).toBeNull();

      api.release();
    });

    it("should throw if released", async () => {
      const api = new GitV2API("/test/project");
      api.release();

      await expect(api.getStatus()).rejects.toThrow(
        "GitV2API has been released",
      );
    });
  });

  describe("getFileStatus", () => {
    it("should return file status", async () => {
      const fileStatus = {
        path: "src/file.ts",
        status: "modified",
        staged: true,
      };
      mockGit.getFileStatus.mockResolvedValue(fileStatus);

      const api = new GitV2API("/test/project");
      const result = await api.getFileStatus("src/file.ts");

      expect(mockGit.getFileStatus).toHaveBeenCalledWith(
        "/test/project",
        "src/file.ts",
      );
      expect(result).toEqual(fileStatus);

      api.release();
    });

    it("should return null for clean file", async () => {
      mockGit.getFileStatus.mockResolvedValue(null);

      const api = new GitV2API("/test/project");
      const result = await api.getFileStatus("clean-file.ts");

      expect(result).toBeNull();

      api.release();
    });
  });

  describe("hasUncommittedChanges", () => {
    it("should return true when dirty", async () => {
      mockGit.hasUncommittedChanges.mockResolvedValue(true);

      const api = new GitV2API("/test/project");
      const result = await api.hasUncommittedChanges();

      expect(mockGit.hasUncommittedChanges).toHaveBeenCalledWith(
        "/test/project",
      );
      expect(result).toBe(true);

      api.release();
    });

    it("should return false when clean", async () => {
      mockGit.hasUncommittedChanges.mockResolvedValue(false);

      const api = new GitV2API("/test/project");
      const result = await api.hasUncommittedChanges();

      expect(result).toBe(false);

      api.release();
    });
  });

  describe("hasUnpushedCommits", () => {
    it("should return correct value", async () => {
      mockGit.hasUnpushedCommits.mockResolvedValue(true);

      const api = new GitV2API("/test/project");
      const result = await api.hasUnpushedCommits();

      expect(mockGit.hasUnpushedCommits).toHaveBeenCalledWith("/test/project");
      expect(result).toBe(true);

      api.release();
    });
  });

  // ===========================================================================
  // Diff Operations
  // ===========================================================================

  describe("getFileDiff", () => {
    it("should return diff string", async () => {
      const diff = "@@ -1,3 +1,4 @@\n+new line\n content";
      mockGit.getFileDiff.mockResolvedValue(diff);

      const api = new GitV2API("/test/project");
      const result = await api.getFileDiff("src/file.ts");

      expect(mockGit.getFileDiff).toHaveBeenCalledWith(
        "/test/project",
        "src/file.ts",
        undefined,
      );
      expect(result).toBe(diff);

      api.release();
    });

    it("should pass staged flag", async () => {
      mockGit.getFileDiff.mockResolvedValue("diff");

      const api = new GitV2API("/test/project");
      await api.getFileDiff("src/file.ts", true);

      expect(mockGit.getFileDiff).toHaveBeenCalledWith(
        "/test/project",
        "src/file.ts",
        true,
      );

      api.release();
    });
  });

  describe("getFileAtRef", () => {
    it("should return file content at ref", async () => {
      const content = "original content";
      mockGit.getFileAtRef.mockResolvedValue(content);

      const api = new GitV2API("/test/project");
      const result = await api.getFileAtRef("src/file.ts", "HEAD");

      expect(mockGit.getFileAtRef).toHaveBeenCalledWith(
        "/test/project",
        "src/file.ts",
        "HEAD",
      );
      expect(result).toBe(content);

      api.release();
    });
  });

  // ===========================================================================
  // Staging Operations
  // ===========================================================================

  describe("stage", () => {
    it("should stage files", async () => {
      mockGit.stage.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.stage(["src/file1.ts", "src/file2.ts"]);

      expect(mockGit.stage).toHaveBeenCalledWith("/test/project", [
        "src/file1.ts",
        "src/file2.ts",
      ]);

      api.release();
    });
  });

  describe("unstage", () => {
    it("should unstage files", async () => {
      mockGit.unstage.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.unstage(["src/file.ts"]);

      expect(mockGit.unstage).toHaveBeenCalledWith("/test/project", [
        "src/file.ts",
      ]);

      api.release();
    });
  });

  // ===========================================================================
  // Commit Operations
  // ===========================================================================

  describe("commit", () => {
    it("should create commit and deserialize result", async () => {
      const serializedCommit = {
        hash: "abc123def456",
        shortHash: "abc123d",
        author: "Test Author",
        email: "test@example.com",
        date: 1700000000000,
        message: "Test commit",
        parents: ["parent123"],
      };
      mockGit.commit.mockResolvedValue(serializedCommit);

      const api = new GitV2API("/test/project");
      const result = await api.commit("Test commit");

      expect(mockGit.commit).toHaveBeenCalledWith(
        "/test/project",
        "Test commit",
        undefined,
      );

      expect(result).not.toBeNull();
      expect(result!.hash).toBe("abc123def456");
      expect(result!.date).toBeInstanceOf(Date);
      expect(result!.date.getTime()).toBe(1700000000000);

      api.release();
    });

    it("should pass commit options", async () => {
      mockGit.commit.mockResolvedValue({
        hash: "abc123",
        shortHash: "abc",
        author: "Test",
        email: "test@test.com",
        date: Date.now(),
        message: "Test",
        parents: [],
      });

      const api = new GitV2API("/test/project");
      await api.commit("Test", { amend: true, signoff: true });

      expect(mockGit.commit).toHaveBeenCalledWith("/test/project", "Test", {
        amend: true,
        signoff: true,
      });

      api.release();
    });
  });

  // ===========================================================================
  // Branch Operations
  // ===========================================================================

  describe("getCurrentBranch", () => {
    it("should return branch name", async () => {
      mockGit.getCurrentBranch.mockResolvedValue("feature/test");

      const api = new GitV2API("/test/project");
      const result = await api.getCurrentBranch();

      expect(result).toBe("feature/test");

      api.release();
    });
  });

  describe("getBranches", () => {
    it("should return deserialized branches", async () => {
      const serializedBranches = [
        {
          name: "main",
          isCurrent: true,
          isRemote: false,
          commit: "abc123",
          upstream: "origin/main",
          ahead: 0,
          behind: 0,
        },
        {
          name: "origin/main",
          isCurrent: false,
          isRemote: true,
          commit: "abc123",
        },
      ];
      mockGit.getBranches.mockResolvedValue(serializedBranches);

      const api = new GitV2API("/test/project");
      const result = await api.getBranches();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("main");
      expect(result[0].isCurrent).toBe(true);
      expect(result[1].isRemote).toBe(true);

      api.release();
    });

    it("should deserialize lastCommitDate from timestamp", async () => {
      const serializedBranches = [
        {
          name: "main",
          isCurrent: true,
          isRemote: false,
          commit: "abc123",
          lastCommitDate: 1700000000000,
          lastCommitMessage: "Latest commit",
        },
      ];
      mockGit.getBranches.mockResolvedValue(serializedBranches);

      const api = new GitV2API("/test/project");
      const result = await api.getBranches();

      expect(result[0].lastCommitDate).toBeInstanceOf(Date);
      expect(result[0].lastCommitDate!.getTime()).toBe(1700000000000);
      expect(result[0].lastCommitMessage).toBe("Latest commit");

      api.release();
    });

    it("should handle missing lastCommitDate", async () => {
      const serializedBranches = [
        {
          name: "main",
          isCurrent: true,
          isRemote: false,
          commit: "abc123",
        },
      ];
      mockGit.getBranches.mockResolvedValue(serializedBranches);

      const api = new GitV2API("/test/project");
      const result = await api.getBranches();

      expect(result[0].lastCommitDate).toBeUndefined();
      expect(result[0].lastCommitMessage).toBeUndefined();

      api.release();
    });
  });

  describe("checkout", () => {
    it("should checkout ref with default force=false", async () => {
      mockGit.checkout.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.checkout("feature/new");

      expect(mockGit.checkout).toHaveBeenCalledWith(
        "/test/project",
        "feature/new",
        false,
      );

      api.release();
    });

    it("should checkout ref with force=true", async () => {
      mockGit.checkout.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.checkout("feature/new", true);

      expect(mockGit.checkout).toHaveBeenCalledWith(
        "/test/project",
        "feature/new",
        true,
      );

      api.release();
    });
  });

  // ===========================================================================
  // Stash Operations
  // ===========================================================================

  describe("stash", () => {
    it("should stash without message", async () => {
      mockGit.stash.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.stash();

      expect(mockGit.stash).toHaveBeenCalledWith("/test/project", undefined);

      api.release();
    });

    it("should stash with message", async () => {
      mockGit.stash.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.stash("WIP: feature work");

      expect(mockGit.stash).toHaveBeenCalledWith(
        "/test/project",
        "WIP: feature work",
      );

      api.release();
    });
  });

  describe("stashPop", () => {
    it("should pop stash", async () => {
      mockGit.stashPop.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.stashPop();

      expect(mockGit.stashPop).toHaveBeenCalledWith("/test/project");

      api.release();
    });
  });

  // ===========================================================================
  // Remote Operations
  // ===========================================================================

  describe("push", () => {
    it("should push with default options", async () => {
      mockGit.push.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.push();

      expect(mockGit.push).toHaveBeenCalledWith("/test/project", false, false);

      api.release();
    });

    it("should push with force option", async () => {
      mockGit.push.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.push(true);

      expect(mockGit.push).toHaveBeenCalledWith("/test/project", true, false);

      api.release();
    });

    it("should push with setUpstream option for new branches", async () => {
      mockGit.push.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.push(false, true);

      expect(mockGit.push).toHaveBeenCalledWith("/test/project", false, true);

      api.release();
    });
  });

  describe("pull", () => {
    it("should pull with default options", async () => {
      mockGit.pull.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.pull();

      expect(mockGit.pull).toHaveBeenCalledWith("/test/project", false);

      api.release();
    });

    it("should pull with rebase option", async () => {
      mockGit.pull.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.pull(true);

      expect(mockGit.pull).toHaveBeenCalledWith("/test/project", true);

      api.release();
    });
  });

  describe("hasUpstream", () => {
    it("should return true when upstream is configured", async () => {
      mockGit.hasUpstream.mockResolvedValue(true);

      const api = new GitV2API("/test/project");
      const result = await api.hasUpstream();

      expect(mockGit.hasUpstream).toHaveBeenCalledWith("/test/project");
      expect(result).toBe(true);

      api.release();
    });

    it("should return false when no upstream", async () => {
      mockGit.hasUpstream.mockResolvedValue(false);

      const api = new GitV2API("/test/project");
      const result = await api.hasUpstream();

      expect(result).toBe(false);

      api.release();
    });
  });

  // ===========================================================================
  // Utility
  // ===========================================================================

  describe("findRoot", () => {
    it("should return git root", async () => {
      const api = new GitV2API("/test/project/src");
      const result = await api.findRoot();

      expect(mockGit.findRoot).toHaveBeenCalledWith("/test/project/src");
      expect(result).toBe("/test/repo");

      api.release();
    });

    it("should cache git root", async () => {
      const api = new GitV2API("/test/project");

      // Wait a tick for the eager subscription to complete
      // (constructor calls ensureSubscribed which also calls findRoot)
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Clear the call count from constructor's ensureSubscribed
      mockGit.findRoot.mockClear();

      // Now test caching - first call uses cache from constructor
      await api.findRoot();
      await api.findRoot();

      // Should not call again since it was already cached during construction
      expect(mockGit.findRoot).toHaveBeenCalledTimes(0);

      api.release();
    });
  });

  // ===========================================================================
  // Comparison Operations
  // ===========================================================================

  describe("getChangedFilesFromBranch", () => {
    it("should return array of changed files", async () => {
      const changedFiles = ["src/file1.ts", "src/file2.ts", "README.md"];
      mockGit.getChangedFilesFromBranch.mockResolvedValue(changedFiles);

      const api = new GitV2API("/test/project");
      const result = await api.getChangedFilesFromBranch("main");

      expect(mockGit.getChangedFilesFromBranch).toHaveBeenCalledWith(
        "/test/project",
        "main",
      );
      expect(result).toEqual(changedFiles);

      api.release();
    });

    it("should return empty array when no changes", async () => {
      mockGit.getChangedFilesFromBranch.mockResolvedValue([]);

      const api = new GitV2API("/test/project");
      const result = await api.getChangedFilesFromBranch("main");

      expect(result).toEqual([]);

      api.release();
    });

    it("should throw if released", async () => {
      const api = new GitV2API("/test/project");
      api.release();

      await expect(api.getChangedFilesFromBranch("main")).rejects.toThrow(
        "GitV2API has been released",
      );
    });
  });

  describe("getStatusFromBranch", () => {
    it("should return Map of file statuses", async () => {
      const statusObject = {
        "src/newFile.ts": { status: "added", staged: false },
        "src/modified.ts": { status: "modified", staged: false },
      };
      mockGit.getStatusFromBranch.mockResolvedValue(statusObject);

      const api = new GitV2API("/test/project");
      const result = await api.getStatusFromBranch("main");

      expect(mockGit.getStatusFromBranch).toHaveBeenCalledWith(
        "/test/project",
        "main",
      );
      expect(result).toBeInstanceOf(Map);
      expect(result.get("src/newFile.ts")?.status).toBe("added");
      expect(result.get("src/modified.ts")?.status).toBe("modified");

      api.release();
    });

    it("should return empty Map when no changes", async () => {
      mockGit.getStatusFromBranch.mockResolvedValue({});

      const api = new GitV2API("/test/project");
      const result = await api.getStatusFromBranch("main");

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);

      api.release();
    });

    it("should throw if released", async () => {
      const api = new GitV2API("/test/project");
      api.release();

      await expect(api.getStatusFromBranch("main")).rejects.toThrow(
        "GitV2API has been released",
      );
    });
  });

  describe("getUncommittedDiffStats", () => {
    it("should return diff statistics", async () => {
      const stats = { added: 100, removed: 50, files: 5 };
      mockGit.getUncommittedDiffStats.mockResolvedValue(stats);

      const api = new GitV2API("/test/project");
      const result = await api.getUncommittedDiffStats();

      expect(mockGit.getUncommittedDiffStats).toHaveBeenCalledWith(
        "/test/project",
      );
      expect(result).toEqual(stats);

      api.release();
    });

    it("should return zero stats for clean repo", async () => {
      const stats = { added: 0, removed: 0, files: 0 };
      mockGit.getUncommittedDiffStats.mockResolvedValue(stats);

      const api = new GitV2API("/test/project");
      const result = await api.getUncommittedDiffStats();

      expect(result.added).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.files).toBe(0);

      api.release();
    });
  });

  describe("getMostRecentDirtyFile", () => {
    it("should return most recent dirty file path", async () => {
      mockGit.getMostRecentDirtyFile.mockResolvedValue("src/recent.ts");

      const api = new GitV2API("/test/project");
      const result = await api.getMostRecentDirtyFile();

      expect(mockGit.getMostRecentDirtyFile).toHaveBeenCalledWith(
        "/test/project",
      );
      expect(result).toBe("src/recent.ts");

      api.release();
    });

    it("should return null when no dirty files", async () => {
      mockGit.getMostRecentDirtyFile.mockResolvedValue(null);

      const api = new GitV2API("/test/project");
      const result = await api.getMostRecentDirtyFile();

      expect(result).toBeNull();

      api.release();
    });
  });

  describe("getMostRecentCommittedFile", () => {
    it("should return most recent committed file", async () => {
      mockGit.getMostRecentCommittedFile.mockResolvedValue("src/index.ts");

      const api = new GitV2API("/test/project");
      const result = await api.getMostRecentCommittedFile();

      expect(mockGit.getMostRecentCommittedFile).toHaveBeenCalledWith(
        "/test/project",
        undefined,
      );
      expect(result).toBe("src/index.ts");

      api.release();
    });

    it("should pass commitLimit parameter", async () => {
      mockGit.getMostRecentCommittedFile.mockResolvedValue("src/file.ts");

      const api = new GitV2API("/test/project");
      await api.getMostRecentCommittedFile(5);

      expect(mockGit.getMostRecentCommittedFile).toHaveBeenCalledWith(
        "/test/project",
        5,
      );

      api.release();
    });

    it("should return null when no committed files found", async () => {
      mockGit.getMostRecentCommittedFile.mockResolvedValue(null);

      const api = new GitV2API("/test/project");
      const result = await api.getMostRecentCommittedFile();

      expect(result).toBeNull();

      api.release();
    });
  });

  describe("revert", () => {
    it("should revert specified files", async () => {
      mockGit.revert.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.revert(["src/file1.ts", "src/file2.ts"]);

      expect(mockGit.revert).toHaveBeenCalledWith("/test/project", [
        "src/file1.ts",
        "src/file2.ts",
      ]);

      api.release();
    });

    it("should handle empty files array", async () => {
      mockGit.revert.mockResolvedValue(undefined);

      const api = new GitV2API("/test/project");
      await api.revert([]);

      expect(mockGit.revert).toHaveBeenCalledWith("/test/project", []);

      api.release();
    });

    it("should throw if released", async () => {
      const api = new GitV2API("/test/project");
      api.release();

      await expect(api.revert(["file.ts"])).rejects.toThrow(
        "GitV2API has been released",
      );
    });
  });

  // ===========================================================================
  // Event Subscriptions
  // ===========================================================================

  describe("onStatusChanged", () => {
    it("should subscribe to events", async () => {
      const api = new GitV2API("/test/project");
      const callback = vi.fn();

      const cleanup = api.onStatusChanged(callback);

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockGit.subscribe).toHaveBeenCalledWith("/test/project");

      expect(typeof cleanup).toBe("function");
      cleanup();

      api.release();
    });

    it("should deserialize status in events", async () => {
      let statusListener: ((payload: unknown) => void) | null = null;
      mockGit.onStatusChanged.mockImplementation(
        (listener: (payload: unknown) => void) => {
          statusListener = listener;
          return vi.fn();
        },
      );

      const api = new GitV2API("/test/project");
      const callback = vi.fn();
      api.onStatusChanged(callback);

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (statusListener) {
        statusListener({
          subscriptionId: "test-sub-id",
          gitRoot: "/test/repo",
          status: {
            branch: "main",
            ahead: 0,
            behind: 0,
            files: {
              "file.ts": { path: "file.ts", status: "modified", staged: false },
            },
          },
          added: ["file.ts"],
          modified: [],
          removed: [],
        });
      }

      expect(callback).toHaveBeenCalled();
      const event = callback.mock.calls[0][0];
      expect(event.status.files).toBeInstanceOf(Map);
      expect(event.added).toEqual(["file.ts"]);

      api.release();
    });
  });

  describe("onBranchChanged", () => {
    it("should forward branch change events", async () => {
      let branchListener: ((payload: unknown) => void) | null = null;
      mockGit.onBranchChanged.mockImplementation(
        (listener: (payload: unknown) => void) => {
          branchListener = listener;
          return vi.fn();
        },
      );

      const api = new GitV2API("/test/project");
      const callback = vi.fn();
      api.onBranchChanged(callback);

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (branchListener) {
        branchListener({
          subscriptionId: "test-sub-id",
          gitRoot: "/test/repo",
          previousBranch: "main",
          currentBranch: "feature/test",
        });
      }

      expect(callback).toHaveBeenCalledWith({
        previousBranch: "main",
        currentBranch: "feature/test",
      });

      api.release();
    });
  });

  describe("onCommitCreated", () => {
    it("should deserialize commit in events", async () => {
      let commitListener: ((payload: unknown) => void) | null = null;
      mockGit.onCommitCreated.mockImplementation(
        (listener: (payload: unknown) => void) => {
          commitListener = listener;
          return vi.fn();
        },
      );

      const api = new GitV2API("/test/project");
      const callback = vi.fn();
      api.onCommitCreated(callback);

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (commitListener) {
        commitListener({
          subscriptionId: "test-sub-id",
          gitRoot: "/test/repo",
          commit: {
            hash: "abc123",
            shortHash: "abc",
            author: "Test",
            email: "test@test.com",
            date: 1700000000000,
            message: "Test commit",
            parents: [],
          },
        });
      }

      expect(callback).toHaveBeenCalled();
      const event = callback.mock.calls[0][0];
      expect(event.commit.date).toBeInstanceOf(Date);

      api.release();
    });
  });

  describe("onHeadChanged", () => {
    it("should forward HEAD change events", async () => {
      let headListener: ((payload: unknown) => void) | null = null;
      mockGit.onHeadChanged.mockImplementation(
        (listener: (payload: unknown) => void) => {
          headListener = listener;
          return vi.fn();
        },
      );

      const api = new GitV2API("/test/project");
      const callback = vi.fn();
      api.onHeadChanged(callback);

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (headListener) {
        headListener({
          subscriptionId: "test-sub-id",
          gitRoot: "/test/repo",
          previousHead: "abc123",
          currentHead: "def456",
          isBranchSwitch: true,
        });
      }

      expect(callback).toHaveBeenCalledWith({
        previousHead: "abc123",
        currentHead: "def456",
        isBranchSwitch: true,
      });

      api.release();
    });
  });

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  describe("release", () => {
    it("should mark instance as released", () => {
      const api = new GitV2API("/test/project");
      expect(api.isReleased).toBe(false);

      api.release();

      expect(api.isReleased).toBe(true);
    });

    it("should unsubscribe from main process", async () => {
      const api = new GitV2API("/test/project");

      // Trigger subscription
      api.onStatusChanged(vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 10));

      api.release();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockGit.unsubscribe).toHaveBeenCalledWith("test-sub-id");
    });

    it("should be idempotent", () => {
      const api = new GitV2API("/test/project");

      api.release();
      api.release();
      api.release();

      // Just verifying it doesn't throw
      expect(api.isReleased).toBe(true);
    });

    it("should prevent further operations", async () => {
      const api = new GitV2API("/test/project");
      api.release();

      await expect(api.getStatus()).rejects.toThrow();
      await expect(api.getFileStatus("file.ts")).rejects.toThrow();
      await expect(api.hasUncommittedChanges()).rejects.toThrow();
      await expect(api.stage([])).rejects.toThrow();
      await expect(api.commit("msg")).rejects.toThrow();
      await expect(api.checkout("ref")).rejects.toThrow();
    });

    it("should unsubscribe if released while subscription is pending (race condition)", async () => {
      // Set up a delayed subscription that we can control
      let resolveSubscription: ((value: string) => void) | null = null;
      mockGit.subscribe.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSubscription = resolve;
          }),
      );

      const api = new GitV2API("/test/project");

      // Release BEFORE the subscription completes - this is the race condition
      api.release();

      expect(api.isReleased).toBe(true);
      // At this point, subscriptionId is still null because promise hasn't resolved
      expect(mockGit.unsubscribe).not.toHaveBeenCalled();

      // Now complete the subscription (simulates IPC finally returning)
      resolveSubscription!("late-subscription-id");

      // Wait for the promise chain to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // The fix should have detected that we're already released
      // and immediately unsubscribed
      expect(mockGit.unsubscribe).toHaveBeenCalledWith("late-subscription-id");
    });
  });

  // ===========================================================================
  // whenReady
  // ===========================================================================

  describe("whenReady", () => {
    it("should resolve immediately when already subscribed", async () => {
      const api = new GitV2API("/test/project");

      // Wait for initial subscription to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // whenReady should resolve immediately
      await api.whenReady();

      api.release();
    });

    it("should wait for pending subscription to complete", async () => {
      // Set up a delayed subscription
      let resolveSubscription: ((value: string) => void) | null = null;
      mockGit.subscribe.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSubscription = resolve;
          }),
      );

      const api = new GitV2API("/test/project");

      // whenReady should be waiting
      let ready = false;
      const readyPromise = api.whenReady().then(() => {
        ready = true;
      });

      // Should not be ready yet
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(ready).toBe(false);

      // Complete the subscription
      resolveSubscription!("test-sub-id");

      // Now it should complete
      await readyPromise;
      expect(ready).toBe(true);

      api.release();
    });

    it("should resolve when subscription returns null (non-git repo)", async () => {
      mockGit.subscribe.mockResolvedValue(null);

      const api = new GitV2API("/not/a/repo");

      // Should resolve even though there's no subscription
      await api.whenReady();

      api.release();
    });
  });

  // ===========================================================================
  // Non-Git Repository Handling
  // ===========================================================================

  describe("non-git repository handling", () => {
    it("should handle null subscription for non-git directories", async () => {
      mockGit.subscribe.mockResolvedValue(null);

      const api = new GitV2API("/not/a/repo");
      const callback = vi.fn();

      // Should not throw
      api.onStatusChanged(callback);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have attempted subscription
      expect(mockGit.subscribe).toHaveBeenCalled();

      api.release();
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("error handling", () => {
    it("should propagate IPC errors", async () => {
      mockGit.getStatus.mockRejectedValue(new Error("Git error"));

      const api = new GitV2API("/test/project");

      await expect(api.getStatus()).rejects.toThrow("Git error");

      api.release();
    });

    it("should isolate listener errors", async () => {
      let statusListener: ((payload: unknown) => void) | null = null;
      mockGit.onStatusChanged.mockImplementation(
        (listener: (payload: unknown) => void) => {
          statusListener = listener;
          return vi.fn();
        },
      );

      const api = new GitV2API("/test/project");

      const badCallback = vi.fn(() => {
        throw new Error("Listener error");
      });
      const goodCallback = vi.fn();

      api.onStatusChanged(badCallback);
      api.onStatusChanged(goodCallback);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not throw when listener errors
      if (statusListener) {
        expect(() => {
          statusListener!({
            subscriptionId: "test-sub-id",
            gitRoot: "/test/repo",
            status: {
              branch: "main",
              ahead: 0,
              behind: 0,
              files: {},
            },
            added: [],
            modified: [],
            removed: [],
          });
        }).not.toThrow();
      }

      // Good callback should still be called
      expect(goodCallback).toHaveBeenCalled();

      api.release();
    });
  });
});
