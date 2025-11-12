/**
 * Unit tests for registered pre-commands
 */

import {
    createAgentSession,
    detectGitHubRepoForCloud,
    registerDefaultPreCommands,
    verifyGitRepo,
} from "@/commands/preCommands/registeredPreCommands";
import { PreCommandRegistry } from "@/commands/preCommands/registry";
import type { TerminalConfig } from "@/commands/preCommands/types";
import type { AgentSessionInfo } from "@shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
        getGitHubRepoInfo: vi.fn(),
        hasUncommittedChanges: vi.fn(),
        hasUnpushedCommits: vi.fn(),
        createDiffPatch: vi.fn(),
        getSettings: vi.fn().mockResolvedValue({
          homeDirectory: "/home/user",
        }),
      },
    };
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
      expect(mockApi.getSettings).toHaveBeenCalled();
      expect(mockApi.hasGitRepository).toHaveBeenCalledWith("/home/user");
    });

    it("should fail when no cwd and no home directory", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.getSettings.mockResolvedValue({ homeDirectory: null });

      const config: TerminalConfig = {
        command: "git status",
      };

      const result = await verifyGitRepo.run(config);

      expect(result.success).toBe(false);
      expect(result.error).toBe("No working directory specified");
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
      expect(mockApi.getSettings).toHaveBeenCalled();
      expect(mockApi.spawnAgentSession).toHaveBeenCalledWith({
        cwd: "/home/user",
      });
    });

    it("should fail when no cwd and no home directory", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.getSettings.mockResolvedValue({ homeDirectory: null });

      const config: TerminalConfig = {
        command: "claude-code",
      };

      const result = await createAgentSession.run(config);

      expect(result.success).toBe(false);
      expect(result.error).toBe("No working directory specified");
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

  describe("detectGitHubRepoForCloud", () => {
    it("should have correct metadata", () => {
      expect(detectGitHubRepoForCloud.id).toBe("detect-github-repo-for-cloud");
      expect(detectGitHubRepoForCloud.label).toBe(
        "Detect GitHub Repo (Cloud Terminal)",
      );
      expect(detectGitHubRepoForCloud.description).toBeDefined();
    });

    it("should succeed with GitHub repo info when in a GitHub repository", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);
      mockApi.getGitHubRepoInfo.mockResolvedValue({
        owner: "test-owner",
        name: "test-repo",
        branch: "main",
      });
      mockApi.hasUncommittedChanges.mockResolvedValue(false);
      mockApi.hasUnpushedCommits.mockResolvedValue(false);

      const config: TerminalConfig = {
        command: "",
        cwd: "/path/to/repo",
      };

      const result = await detectGitHubRepoForCloud.run(config);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.paneOptions?.terminalOptions?.isRemoteVM).toBe(true);
      expect(result.paneOptions?.terminalOptions?.githubRepo).toEqual({
        owner: "test-owner",
        name: "test-repo",
        branch: "main",
      });
      expect(mockApi.hasGitRepository).toHaveBeenCalledWith("/path/to/repo");
      expect(mockApi.getGitHubRepoInfo).toHaveBeenCalledWith("/path/to/repo");
    });

    it("should succeed without repo info when not in a git repository", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(false);

      const config: TerminalConfig = {
        command: "",
        cwd: "/tmp",
      };

      const result = await detectGitHubRepoForCloud.run(config);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.paneOptions?.terminalOptions?.isRemoteVM).toBe(true);
      expect(result.paneOptions?.terminalOptions?.githubRepo).toBeUndefined();
      expect(mockApi.hasGitRepository).toHaveBeenCalledWith("/tmp");
      expect(mockApi.getGitHubRepoInfo).not.toHaveBeenCalled();
    });

    it("should succeed without repo info when in non-GitHub git repository", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);
      mockApi.getGitHubRepoInfo.mockResolvedValue(null);

      const config: TerminalConfig = {
        command: "",
        cwd: "/path/to/gitlab/repo",
      };

      const result = await detectGitHubRepoForCloud.run(config);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.paneOptions?.terminalOptions?.isRemoteVM).toBe(true);
      expect(result.paneOptions?.terminalOptions?.githubRepo).toBeUndefined();
    });

    it("should use home directory when cwd is not specified", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(false);

      const config: TerminalConfig = {
        command: "",
      };

      const result = await detectGitHubRepoForCloud.run(config);

      expect(result.success).toBe(true);
      expect(mockApi.getSettings).toHaveBeenCalled();
      expect(mockApi.hasGitRepository).toHaveBeenCalledWith("/home/user");
    });

    it("should succeed with cloud terminal flag even when no cwd available", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.getSettings.mockResolvedValue({ homeDirectory: null });

      const config: TerminalConfig = {
        command: "",
      };

      const result = await detectGitHubRepoForCloud.run(config);

      expect(result.success).toBe(true);
      expect(result.paneOptions?.terminalOptions?.isRemoteVM).toBe(true);
      expect(result.paneOptions?.terminalOptions?.githubRepo).toBeUndefined();
    });

    it("should handle errors gracefully and still succeed", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockRejectedValue(new Error("API error"));

      const config: TerminalConfig = {
        command: "",
        cwd: "/path/to/repo",
      };

      const result = await detectGitHubRepoForCloud.run(config);

      // Should still succeed (fails silently to allow cloud terminal creation)
      expect(result.success).toBe(true);
      expect(result.paneOptions?.terminalOptions?.isRemoteVM).toBe(true);
    });

    it("should return paneOptions with cloud terminal configuration", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);
      mockApi.getGitHubRepoInfo.mockResolvedValue({
        owner: "lostintangent",
        name: "conduit",
        branch: "feature-branch",
      });
      mockApi.hasUncommittedChanges.mockResolvedValue(false);
      mockApi.hasUnpushedCommits.mockResolvedValue(false);

      const config: TerminalConfig = {
        command: "",
        cwd: "/workspace/conduit",
      };

      const result = await detectGitHubRepoForCloud.run(config);

      expect(result.success).toBe(true);
      expect(result.paneOptions).toBeDefined();
      expect(result.paneOptions?.terminalOptions).toBeDefined();
      expect(result.paneOptions?.terminalOptions?.isRemoteVM).toBe(true);
      expect(result.paneOptions?.terminalOptions?.githubRepo?.owner).toBe(
        "lostintangent",
      );
      expect(result.paneOptions?.terminalOptions?.githubRepo?.name).toBe(
        "conduit",
      );
      expect(result.paneOptions?.terminalOptions?.githubRepo?.branch).toBe(
        "feature-branch",
      );
    });
  });

  describe("registerDefaultPreCommands", () => {
    it("should register all pre-commands", () => {
      const registry = PreCommandRegistry.getInstance();
      registry.clear(); // Start fresh

      registerDefaultPreCommands();

      const commands = registry.getAll();
      expect(commands).toHaveLength(3);

      const ids = commands.map((cmd) => cmd.id);
      expect(ids).toContain("verify-git-repo");
      expect(ids).toContain("create-agent-session");
      expect(ids).toContain("detect-github-repo-for-cloud");
    });

    it("should make pre-commands retrievable by ID", () => {
      const registry = PreCommandRegistry.getInstance();
      registry.clear();

      registerDefaultPreCommands();

      const verifyCmd = registry.get("verify-git-repo");
      const agentCmd = registry.get("create-agent-session");
      const cloudCmd = registry.get("detect-github-repo-for-cloud");

      expect(verifyCmd).toBeDefined();
      expect(verifyCmd?.id).toBe("verify-git-repo");

      expect(agentCmd).toBeDefined();
      expect(agentCmd?.id).toBe("create-agent-session");

      expect(cloudCmd).toBeDefined();
      expect(cloudCmd?.id).toBe("detect-github-repo-for-cloud");
    });

    it("should not duplicate pre-commands when called multiple times", () => {
      const registry = PreCommandRegistry.getInstance();
      registry.clear();

      registerDefaultPreCommands();
      registerDefaultPreCommands(); // Call again

      const commands = registry.getAll();
      // Should still be 3, not 6 (registry overwrites duplicates)
      expect(commands).toHaveLength(3);
    });

    it("should register pre-commands with correct labels", () => {
      const registry = PreCommandRegistry.getInstance();
      registry.clear();

      registerDefaultPreCommands();

      const verifyCmd = registry.get("verify-git-repo");
      const agentCmd = registry.get("create-agent-session");
      const cloudCmd = registry.get("detect-github-repo-for-cloud");

      expect(verifyCmd?.label).toBe("Verify Git Repository");
      expect(agentCmd?.label).toBe("Create Agent Session");
      expect(cloudCmd?.label).toBe("Detect GitHub Repo (Cloud Terminal)");
    });

    it("should register pre-commands with descriptions", () => {
      const registry = PreCommandRegistry.getInstance();
      registry.clear();

      registerDefaultPreCommands();

      const verifyCmd = registry.get("verify-git-repo");
      const agentCmd = registry.get("create-agent-session");
      const cloudCmd = registry.get("detect-github-repo-for-cloud");

      expect(verifyCmd?.description).toBeDefined();
      expect(verifyCmd?.description).toBeTruthy();

      expect(agentCmd?.description).toBeDefined();
      expect(agentCmd?.description).toBeTruthy();

      expect(cloudCmd?.description).toBeDefined();
      expect(cloudCmd?.description).toBeTruthy();
    });

    it("should register pre-commands that can be executed", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const registry = PreCommandRegistry.getInstance();
      registry.clear();

      registerDefaultPreCommands();

      const config: TerminalConfig = {
        command: "test",
        cwd: "/path/to/repo",
      };

      const result = await registry.execute("verify-git-repo", config);

      expect(result.success).toBe(true);
    });
  });

  describe("integration", () => {
    it("should work end-to-end with registry execute", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      const registry = PreCommandRegistry.getInstance();
      registry.clear();

      registerDefaultPreCommands();

      const config: TerminalConfig = {
        command: "claude-code",
        cwd: "/path/to/repo",
      };

      const result = await registry.execute("create-agent-session", config);

      expect(result.success).toBe(true);
      expect(result.paneOptions?.agentSession).toBeDefined();
      expect(result.paneOptions?.terminalOptions?.cwd).toBe(
        mockSession.worktreePath,
      );
    });

    it("should handle execution failures through registry", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(false);

      const registry = PreCommandRegistry.getInstance();
      registry.clear();

      registerDefaultPreCommands();

      const config: TerminalConfig = {
        command: "git status",
        cwd: "/tmp",
      };

      const result = await registry.execute("verify-git-repo", config);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Not a git repository");
    });
  });
});
