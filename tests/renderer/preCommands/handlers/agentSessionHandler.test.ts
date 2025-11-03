/**
 * Unit tests for agentSessionHandler
 */

import { createAgentSessionHandler } from "@/commands/preCommands/handlers/agentSessionHandler";
import type { AgentSessionInfo } from "@shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("agentSessionHandler", () => {
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
        spawnAgentSession: vi.fn(),
      },
    };
  });

  afterEach(() => {
    // Clean up global mock
    delete (global as any).window;
    vi.clearAllMocks();
  });

  describe("success cases", () => {
    it("should successfully create an agent session with valid cwd", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      const result = await createAgentSessionHandler("/path/to/repo");

      expect(result.success).toBe(true);
      expect(result.session).toEqual(mockSession);
      expect(result.error).toBeUndefined();
      expect(mockApi.spawnAgentSession).toHaveBeenCalledWith({
        cwd: "/path/to/repo",
      });
      expect(mockApi.spawnAgentSession).toHaveBeenCalledTimes(1);
    });

    it("should return session with all expected properties", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      const result = await createAgentSessionHandler("/path/to/repo");

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.id).toBe("test-session-123");
      expect(result.session?.branchName).toBe("agent-test-123");
      expect(result.session?.worktreePath).toBe(
        "/path/to/repo/.worktrees/agent-123",
      );
      expect(result.session?.repoRoot).toBe("/path/to/repo");
      expect(result.session?.baseBranch).toBe("main");
    });
  });

  describe("failure cases", () => {
    it("should handle null session returned from API", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(null);

      const result = await createAgentSessionHandler("/path/to/repo");

      expect(result.success).toBe(false);
      expect(result.session).toBeUndefined();
      expect(result.error).toBe(
        "Failed to spawn agent session: No session returned",
      );
    });

    it("should handle undefined session returned from API", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(undefined);

      const result = await createAgentSessionHandler("/path/to/repo");

      expect(result.success).toBe(false);
      expect(result.session).toBeUndefined();
      expect(result.error).toBe(
        "Failed to spawn agent session: No session returned",
      );
    });

    it('should handle "Unable to find a Git repository" error with specific message', async () => {
      const mockApi = (global as any).window.conduit;
      const gitError = new Error("Unable to find a Git repository in /tmp");
      mockApi.spawnAgentSession.mockRejectedValue(gitError);

      const result = await createAgentSessionHandler("/tmp");

      expect(result.success).toBe(false);
      expect(result.session).toBeUndefined();
      expect(result.error).toBe(
        "No Git repository found. Agent sessions require a Git repository to create an isolated worktree.",
      );
    });

    it("should handle generic error with error message", async () => {
      const mockApi = (global as any).window.conduit;
      const genericError = new Error("Network timeout");
      mockApi.spawnAgentSession.mockRejectedValue(genericError);

      const result = await createAgentSessionHandler("/path/to/repo");

      expect(result.success).toBe(false);
      expect(result.session).toBeUndefined();
      expect(result.error).toBe("Network timeout");
    });

    it("should handle non-Error thrown values", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockRejectedValue("String error");

      const result = await createAgentSessionHandler("/path/to/repo");

      expect(result.success).toBe(false);
      expect(result.session).toBeUndefined();
      expect(result.error).toBe("String error");
    });

    it("should handle errors with no message", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockRejectedValue(new Error());

      const result = await createAgentSessionHandler("/path/to/repo");

      expect(result.success).toBe(false);
      expect(result.session).toBeUndefined();
      expect(result.error).toBe("");
    });
  });

  describe("edge cases", () => {
    it("should handle empty string cwd", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      const result = await createAgentSessionHandler("");

      expect(mockApi.spawnAgentSession).toHaveBeenCalledWith({ cwd: "" });
      // Assuming API will handle invalid cwd and potentially fail
    });

    it("should handle relative paths", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      const result = await createAgentSessionHandler("./relative/path");

      expect(mockApi.spawnAgentSession).toHaveBeenCalledWith({
        cwd: "./relative/path",
      });
    });

    it("should handle paths with spaces", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      const result = await createAgentSessionHandler("/path/with spaces/repo");

      expect(mockApi.spawnAgentSession).toHaveBeenCalledWith({
        cwd: "/path/with spaces/repo",
      });
      expect(result.success).toBe(true);
    });

    it("should handle paths with special characters", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      const result = await createAgentSessionHandler(
        "/path/with-special_chars.repo",
      );

      expect(mockApi.spawnAgentSession).toHaveBeenCalledWith({
        cwd: "/path/with-special_chars.repo",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("API interaction", () => {
    it("should call spawnAgentSession with correct payload", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      await createAgentSessionHandler("/custom/path");

      expect(mockApi.spawnAgentSession).toHaveBeenCalledWith({
        cwd: "/custom/path",
      });
    });

    it("should not call API multiple times on single invocation", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      await createAgentSessionHandler("/path/to/repo");

      expect(mockApi.spawnAgentSession).toHaveBeenCalledTimes(1);
    });

    it("should handle slow API responses", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockSession), 100);
          }),
      );

      const startTime = Date.now();
      const result = await createAgentSessionHandler("/path/to/repo");
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });
  });

  describe("error message specificity", () => {
    it('should detect "Unable to find a Git repository" in various formats', async () => {
      const mockApi = (global as any).window.conduit;

      const errorMessages = [
        "Unable to find a Git repository",
        "Unable to find a Git repository in /tmp",
        "Error: Unable to find a Git repository at path",
      ];

      for (const errorMessage of errorMessages) {
        mockApi.spawnAgentSession.mockRejectedValue(new Error(errorMessage));

        const result = await createAgentSessionHandler("/some/path");

        expect(result.success).toBe(false);
        expect(result.error).toContain("No Git repository found");
        expect(result.error).toContain("Agent sessions require");
      }
    });

    it('should not treat other git-related errors as "no repository"', async () => {
      const mockApi = (global as any).window.conduit;
      const gitError = new Error("Git conflict detected");
      mockApi.spawnAgentSession.mockRejectedValue(gitError);

      const result = await createAgentSessionHandler("/path/to/repo");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Git conflict detected");
      expect(result.error).not.toContain("No Git repository found");
    });
  });

  describe("return type consistency", () => {
    it("should always return an object with success property", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);

      const result = await createAgentSessionHandler("/path/to/repo");

      expect(result).toHaveProperty("success");
      expect(typeof result.success).toBe("boolean");
    });

    it("should return session only on success", async () => {
      const mockApi = (global as any).window.conduit;

      // Success case
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);
      const successResult = await createAgentSessionHandler("/path/to/repo");
      expect(successResult.session).toBeDefined();

      // Failure case
      mockApi.spawnAgentSession.mockRejectedValue(new Error("Failed"));
      const failureResult = await createAgentSessionHandler("/path/to/repo");
      expect(failureResult.session).toBeUndefined();
    });

    it("should return error only on failure", async () => {
      const mockApi = (global as any).window.conduit;

      // Success case
      mockApi.spawnAgentSession.mockResolvedValue(mockSession);
      const successResult = await createAgentSessionHandler("/path/to/repo");
      expect(successResult.error).toBeUndefined();

      // Failure case
      mockApi.spawnAgentSession.mockRejectedValue(new Error("Failed"));
      const failureResult = await createAgentSessionHandler("/path/to/repo");
      expect(failureResult.error).toBeDefined();
      expect(typeof failureResult.error).toBe("string");
    });
  });
});
