/**
 * Unit tests for registered pre-commands
 */

import {
  createAgentSession,
  runPreCommand,
  verifyGitRepo,
} from "@/commands/preCommands/registeredPreCommands";
import type { TerminalConfig } from "@/commands/preCommands/types";
import { queryClient } from "@/query";
import type { AgentSessionInfo } from "@shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedSettings } from "../queryRender";

describe("registeredPreCommands", () => {
  const mockSession: AgentSessionInfo = {
    id: "test-session-123",
    repoRoot: "/path/to/repo",
    worktreePath: "/path/to/repo/.worktrees/agent-123",
    branchName: "agent-test-123",
    baseRef: "abc123",
    baseBranch: "main",
    createdAt: Date.now(),
  };

  beforeEach(() => {
    // Mock window.conduit
    (global as any).window = {
      conduit: {
        hasGitRepository: vi.fn(),
        spawnAgentSession: vi.fn(),
      },
    };
    seedSettings(queryClient, { homeDirectory: "/home/user" });
  });

  afterEach(() => {
    // Clean up global mock
    delete (global as any).window;
    vi.clearAllMocks();
  });

  describe("verifyGitRepo", () => {
    it("should have correct metadata", () => {
      expect(verifyGitRepo.id).toBe("verify-git-repo");
      expect(verifyGitRepo.label).toBe("Verify Git Repository");
      expect(verifyGitRepo.description).toBeDefined();
    });

    it("should succeed when cwd is in a git repository", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const config: TerminalConfig = {
        command: "git status",
        cwd: "/path/to/repo",
      };

      const result = await verifyGitRepo.run(config);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.paneOptions).toBeUndefined();
      expect(mockApi.hasGitRepository).toHaveBeenCalledWith("/path/to/repo");
    });

    it("should fail when cwd is not in a git repository", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(false);

      const config: TerminalConfig = {
        command: "git status",
        cwd: "/tmp",
      };

      const result = await verifyGitRepo.run(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not a git repository");
      expect(result.error).toContain("/tmp");
    });

    it("should use home directory when cwd is not specified", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const config: TerminalConfig = {
        command: "git status",
      };

      const result = await verifyGitRepo.run(config);

      expect(result.success).toBe(true);
      expect(mockApi.hasGitRepository).toHaveBeenCalledWith("/home/user");
    });

    it("should handle API errors", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockRejectedValue(
        new Error("Permission denied"),
      );

      const config: TerminalConfig = {
        command: "git status",
        cwd: "/path/to/repo",
      };

      const result = await verifyGitRepo.run(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to check git repository");
    });

    it("should not return paneOptions on success", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const config: TerminalConfig = {
        command: "git status",
        cwd: "/path/to/repo",
      };

      const result = await verifyGitRepo.run(config);

      expect(result.success).toBe(true);
      expect(result.paneOptions).toBeUndefined();
    });
  });

  describe("createAgentSession", () => {
    it("should have correct metadata", () => {
      expect(createAgentSession.id).toBe("create-agent-session");
      expect(createAgentSession.label).toBe("Create Agent Session");
      expect(createAgentSession.description).toBeDefined();
    });

    it("should succeed and return paneOptions with agent session", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      const config: TerminalConfig = {
        command: "claude-code",
        cwd: "/path/to/repo",
      };

      const result = await createAgentSession.run(config);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.paneOptions).toBeDefined();
      expect(result.paneOptions?.agentSession).toEqual(mockSession);
      expect(result.paneOptions?.terminalOptions?.cwd).toBe(
        mockSession.worktreePath,
      );
      expect(mockApi.spawnAgentSession).toHaveBeenCalledWith({
        cwd: "/path/to/repo",
      });
    });

    it("should use home directory when cwd is not specified", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      const config: TerminalConfig = {
        command: "claude-code",
      };

      const result = await createAgentSession.run(config);

      expect(result.success).toBe(true);
      expect(mockApi.spawnAgentSession).toHaveBeenCalledWith({
        cwd: "/home/user",
      });
    });

    it("should fail when not in a git repository", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockRejectedValue(
        new Error("Unable to find a Git repository"),
      );

      const config: TerminalConfig = {
        command: "claude-code",
        cwd: "/tmp",
      };

      const result = await createAgentSession.run(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No Git repository found");
    });

    it("should handle generic errors", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockRejectedValue(new Error("Network error"));

      const config: TerminalConfig = {
        command: "claude-code",
        cwd: "/path/to/repo",
      };

      const result = await createAgentSession.run(config);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });

    it("should return agentSession in paneOptions", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      const config: TerminalConfig = {
        command: "claude-code",
        cwd: "/path/to/repo",
      };

      const result = await createAgentSession.run(config);

      expect(result.success).toBe(true);
      expect(result.paneOptions).toBeDefined();
      expect(result.paneOptions?.agentSession).toBe(mockSession);
      expect(result.paneOptions?.agentSession?.id).toBe("test-session-123");
      expect(result.paneOptions?.agentSession?.branchName).toBe(
        "agent-test-123",
      );
    });

    it("should override cwd with worktree path", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      const config: TerminalConfig = {
        command: "claude-code",
        cwd: "/path/to/repo",
      };

      const result = await createAgentSession.run(config);

      expect(result.success).toBe(true);
      expect(result.paneOptions?.terminalOptions?.cwd).toBe(
        "/path/to/repo/.worktrees/agent-123",
      );
      // Original cwd was /path/to/repo, but should be overridden
      expect(result.paneOptions?.terminalOptions?.cwd).not.toBe(
        "/path/to/repo",
      );
    });
  });

  describe("runPreCommand", () => {
    it("should run a pre-command by ID", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      const config: TerminalConfig = {
        command: "claude-code",
        cwd: "/path/to/repo",
      };

      const result = await runPreCommand("create-agent-session", config);

      expect(result.success).toBe(true);
      expect(result.paneOptions?.agentSession).toBeDefined();
      expect(result.paneOptions?.terminalOptions?.cwd).toBe(
        mockSession.worktreePath,
      );
    });

    it("should return the pre-command's failure result", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(false);

      const result = await runPreCommand("verify-git-repo", {
        command: "git status",
        cwd: "/tmp",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not a git repository");
    });

    it("should fail for an unknown pre-command ID", async () => {
      const result = await runPreCommand("non-existent", { command: "test" });

      expect(result).toEqual({
        success: false,
        error: "Pre-command not found: non-existent",
      });
    });

    it("should convert thrown errors into a failure result", async () => {
      queryClient.clear();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await runPreCommand("verify-git-repo", {
        command: "test",
      });

      expect(result).toEqual({
        success: false,
        error: "Settings were read before they loaded",
      });
      errorSpy.mockRestore();
    });
  });
});
