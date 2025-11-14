import { beforeEach, describe, expect, it, vi } from "vitest";
import { findRepoRoot, runGit } from "../../../src/ipc/agent/git";
import {
  getGitStatus,
  getGitStatusForFile,
  getGitStatusForHead,
  getGitStatusRelativeToBranch,
  listBranches,
} from "../../../src/ipc/git/gitStatus";

// Mock dependencies
vi.mock("../../../src/ipc/agent/git", () => ({
  runGit: vi.fn(),
  findRepoRoot: vi.fn(),
}));

describe("gitStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getGitStatusForHead", () => {
    it("should parse modified file from git status", async () => {
      (runGit as any).mockResolvedValue({
        stdout: "1 .M N... 100644 100644 100644 abc123 def456 file.txt",
      });

      const result = await getGitStatusForHead("/test/repo");

      expect(result.size).toBe(1);
      expect(result.get("file.txt")).toEqual({
        status: "modified",
        staged: false,
        relativePath: "file.txt",
      });
    });

    it("should parse staged file from git status", async () => {
      (runGit as any).mockResolvedValue({
        stdout: "1 M. N... 100644 100644 100644 abc123 def456 file.txt",
      });

      const result = await getGitStatusForHead("/test/repo");

      expect(result.get("file.txt")).toEqual({
        status: "modified",
        staged: true,
        relativePath: "file.txt",
      });
    });

    it("should parse added file from git status", async () => {
      (runGit as any).mockResolvedValue({
        stdout: "1 A. N... 000000 100644 100644 000000 def456 newfile.txt",
      });

      const result = await getGitStatusForHead("/test/repo");

      expect(result.get("newfile.txt")).toEqual({
        status: "added",
        staged: true,
        relativePath: "newfile.txt",
      });
    });

    it("should parse deleted file from git status", async () => {
      (runGit as any).mockResolvedValue({
        stdout: "1 .D N... 100644 000000 000000 abc123 000000 deleted.txt",
      });

      const result = await getGitStatusForHead("/test/repo");

      expect(result.get("deleted.txt")).toEqual({
        status: "deleted",
        staged: false,
        relativePath: "deleted.txt",
      });
    });

    it("should parse untracked file from git status", async () => {
      (runGit as any).mockResolvedValue({
        stdout: "? untracked.txt",
      });

      const result = await getGitStatusForHead("/test/repo");

      expect(result.get("untracked.txt")).toEqual({
        status: "untracked",
        staged: false,
        relativePath: "untracked.txt",
      });
    });

    it("should parse renamed file from git status", async () => {
      (runGit as any).mockResolvedValue({
        stdout:
          "2 R. N... 100644 100644 100644 abc123 abc123 C100 new.txt\told.txt",
      });

      const result = await getGitStatusForHead("/test/repo");

      expect(result.get("new.txt")).toEqual({
        status: "renamed",
        staged: true,
        relativePath: "new.txt",
      });
    });

    it("should parse multiple files from git status", async () => {
      (runGit as any).mockResolvedValue({
        stdout: `1 .M N... 100644 100644 100644 abc123 def456 file1.txt
1 A. N... 000000 100644 100644 000000 def456 file2.txt
? file3.txt`,
      });

      const result = await getGitStatusForHead("/test/repo");

      expect(result.size).toBe(3);
      expect(result.get("file1.txt")?.status).toBe("modified");
      expect(result.get("file2.txt")?.status).toBe("added");
      expect(result.get("file3.txt")?.status).toBe("untracked");
    });

    it("should ignore comment lines", async () => {
      (runGit as any).mockResolvedValue({
        stdout: `# branch.oid abc123
# branch.head main
1 .M N... 100644 100644 100644 abc123 def456 file.txt`,
      });

      const result = await getGitStatusForHead("/test/repo");

      expect(result.size).toBe(1);
      expect(result.get("file.txt")).toBeTruthy();
    });

    it("should ignore ignored files", async () => {
      (runGit as any).mockResolvedValue({
        stdout: "! ignored.txt",
      });

      const result = await getGitStatusForHead("/test/repo");

      expect(result.size).toBe(0);
    });

    it("should handle empty output", async () => {
      (runGit as any).mockResolvedValue({
        stdout: "",
      });

      const result = await getGitStatusForHead("/test/repo");

      expect(result.size).toBe(0);
    });

    it("should return empty map on error", async () => {
      (runGit as any).mockRejectedValue(new Error("Git error"));

      const result = await getGitStatusForHead("/test/repo");

      expect(result.size).toBe(0);
    });

    it("should call git with correct arguments", async () => {
      (runGit as any).mockResolvedValue({ stdout: "" });

      await getGitStatusForHead("/test/repo");

      expect(runGit).toHaveBeenCalledWith("/test/repo", [
        "status",
        "--porcelain=v2",
        "--untracked-files=all",
      ]);
    });
  });

  describe("getGitStatusForFile", () => {
    it("should return status for a single file", async () => {
      (runGit as any).mockResolvedValue({
        stdout: "1 .M N... 100644 100644 100644 abc123 def456 file.txt",
      });

      const result = await getGitStatusForFile(
        "/test/repo",
        "/test/repo/file.txt",
      );

      expect(result).toEqual({
        status: "modified",
        staged: false,
        relativePath: "file.txt",
      });
    });

    it("should return null for unmodified file", async () => {
      (runGit as any).mockResolvedValue({
        stdout: "",
      });

      const result = await getGitStatusForFile(
        "/test/repo",
        "/test/repo/file.txt",
      );

      expect(result).toBeNull();
    });

    it("should return null for file outside repo", async () => {
      const result = await getGitStatusForFile(
        "/test/repo",
        "/outside/file.txt",
      );

      expect(result).toBeNull();
    });

    it("should handle subdirectory files", async () => {
      (runGit as any).mockResolvedValue({
        stdout: "1 .M N... 100644 100644 100644 abc123 def456 src/file.txt",
      });

      const result = await getGitStatusForFile(
        "/test/repo",
        "/test/repo/src/file.txt",
      );

      expect(result).toEqual({
        status: "modified",
        staged: false,
        relativePath: "src/file.txt",
      });
    });

    it("should call git with correct file path", async () => {
      (runGit as any).mockResolvedValue({ stdout: "" });

      await getGitStatusForFile("/test/repo", "/test/repo/src/file.txt");

      expect(runGit).toHaveBeenCalledWith("/test/repo", [
        "status",
        "--porcelain=v2",
        "--",
        "src/file.txt",
      ]);
    });

    it("should return null on error", async () => {
      (runGit as any).mockRejectedValue(new Error("Git error"));

      const result = await getGitStatusForFile(
        "/test/repo",
        "/test/repo/file.txt",
      );

      expect(result).toBeNull();
    });
  });

  describe("getGitStatusRelativeToBranch", () => {
    it("should return files changed between branches", async () => {
      // Mock diff output
      (runGit as any).mockResolvedValueOnce({
        stdout: `M\tmodified.txt
A\tadded.txt
D\tdeleted.txt`,
      });

      // Mock working tree status (empty)
      (runGit as any).mockResolvedValueOnce({
        stdout: "",
      });

      const result = await getGitStatusRelativeToBranch("/test/repo", "main");

      expect(result.size).toBe(3);
      expect(result.get("modified.txt")).toEqual({
        status: "modified",
        staged: true,
        relativePath: "modified.txt",
      });
      expect(result.get("added.txt")).toEqual({
        status: "added",
        staged: true,
        relativePath: "added.txt",
      });
      expect(result.get("deleted.txt")).toEqual({
        status: "deleted",
        staged: true,
        relativePath: "deleted.txt",
      });
    });

    it("should overlay working tree changes on branch diff", async () => {
      // Mock diff output
      (runGit as any).mockResolvedValueOnce({
        stdout: "M\tfile1.txt",
      });

      // Mock working tree status
      (runGit as any).mockResolvedValueOnce({
        stdout: "1 .M N... 100644 100644 100644 abc123 def456 file2.txt",
      });

      const result = await getGitStatusRelativeToBranch("/test/repo", "main");

      expect(result.size).toBe(2);
      expect(result.get("file1.txt")?.status).toBe("modified");
      expect(result.get("file2.txt")?.status).toBe("modified");
    });

    it("should prioritize working tree status over branch diff", async () => {
      // Mock diff output - file is staged as modified
      (runGit as any).mockResolvedValueOnce({
        stdout: "M\tfile.txt",
      });

      // Mock working tree status - file is now untracked
      (runGit as any).mockResolvedValueOnce({
        stdout: "? file.txt",
      });

      const result = await getGitStatusRelativeToBranch("/test/repo", "main");

      // Working tree status should override
      expect(result.get("file.txt")).toEqual({
        status: "untracked",
        staged: false,
        relativePath: "file.txt",
      });
    });

    it("should handle renamed files", async () => {
      (runGit as any).mockResolvedValueOnce({
        stdout: "R100\tnew.txt\told.txt",
      });

      (runGit as any).mockResolvedValueOnce({
        stdout: "",
      });

      const result = await getGitStatusRelativeToBranch("/test/repo", "main");

      expect(result.get("new.txt")).toEqual({
        status: "renamed",
        staged: true,
        relativePath: "new.txt",
      });
    });

    it("should call git with correct branch comparison", async () => {
      (runGit as any).mockResolvedValue({ stdout: "" });

      await getGitStatusRelativeToBranch("/test/repo", "main");

      expect(runGit).toHaveBeenCalledWith("/test/repo", [
        "diff",
        "--name-status",
        "main...HEAD",
      ]);
    });

    it("should return empty map on error", async () => {
      (runGit as any).mockRejectedValue(new Error("Git error"));

      const result = await getGitStatusRelativeToBranch("/test/repo", "main");

      expect(result.size).toBe(0);
    });
  });

  describe("listBranches", () => {
    it("should parse branch list", async () => {
      (runGit as any).mockResolvedValue({
        stdout: `main|2024-01-01 10:00:00 +0000|abc123|Initial commit|*
feature|2024-01-02 10:00:00 +0000|def456|Add feature|
origin/main|2024-01-01 10:00:00 +0000|abc123|Initial commit|`,
      });

      const result = await listBranches("/test/repo");

      // Should deduplicate main and origin/main, keeping local current branch
      expect(result).toHaveLength(2);

      expect(result[0]).toMatchObject({
        name: "main",
        isRemote: false,
        isCurrent: true,
        lastCommitHash: "abc123",
        lastCommitMessage: "Initial commit",
      });

      expect(result[1]).toMatchObject({
        name: "feature",
        isRemote: false,
        isCurrent: false,
      });
    });

    it("should call git with correct arguments", async () => {
      (runGit as any).mockResolvedValue({ stdout: "" });

      await listBranches("/test/repo");

      expect(runGit).toHaveBeenCalledWith("/test/repo", [
        "for-each-ref",
        "--sort=-committerdate",
        "--format=%(refname:short)|%(committerdate:iso8601)|%(objectname:short)|%(subject)|%(HEAD)",
        "refs/heads/",
        "refs/remotes/",
      ]);
    });

    it("should handle empty branch list", async () => {
      (runGit as any).mockResolvedValue({ stdout: "" });

      const result = await listBranches("/test/repo");

      expect(result).toEqual([]);
    });

    it("should return empty array on error", async () => {
      (runGit as any).mockRejectedValue(new Error("Git error"));

      const result = await listBranches("/test/repo");

      expect(result).toEqual([]);
    });

    it("should skip malformed lines", async () => {
      (runGit as any).mockResolvedValue({
        stdout: `main|2024-01-01 10:00:00 +0000|abc123|Initial commit|*
invalid-line
feature|2024-01-02 10:00:00 +0000|def456|Add feature|`,
      });

      const result = await listBranches("/test/repo");

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("main");
      expect(result[1].name).toBe("feature");
    });
  });

  describe("getGitStatus", () => {
    it("should return null if not in git repo", async () => {
      (findRepoRoot as any).mockResolvedValue(null);

      const result = await getGitStatus("/test/path");

      expect(result).toBeNull();
    });

    it("should get status for HEAD when no base branch specified", async () => {
      (findRepoRoot as any).mockResolvedValue("/test/repo");
      (runGit as any).mockResolvedValue({
        stdout: "1 .M N... 100644 100644 100644 abc123 def456 file.txt",
      });

      const result = await getGitStatus("/test/repo");

      expect(result).toBeTruthy();
      expect(result?.size).toBe(1);
      expect(runGit).toHaveBeenCalledWith("/test/repo", [
        "status",
        "--porcelain=v2",
        "--untracked-files=all",
      ]);
    });

    it("should get status relative to base branch when specified", async () => {
      (findRepoRoot as any).mockResolvedValue("/test/repo");
      (runGit as any).mockResolvedValue({ stdout: "M\tfile.txt" });

      const result = await getGitStatus("/test/repo", "main");

      expect(result).toBeTruthy();
      expect(runGit).toHaveBeenCalledWith("/test/repo", [
        "diff",
        "--name-status",
        "main...HEAD",
      ]);
    });

    it("should find git root for subdirectories", async () => {
      (findRepoRoot as any).mockResolvedValue("/test/repo");
      (runGit as any).mockResolvedValue({ stdout: "" });

      await getGitStatus("/test/repo/subdir");

      expect(findRepoRoot).toHaveBeenCalledWith("/test/repo/subdir");
      expect(runGit).toHaveBeenCalledWith("/test/repo", expect.any(Array));
    });
  });
});
