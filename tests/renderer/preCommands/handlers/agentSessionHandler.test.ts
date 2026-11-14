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
  const spawnAgentSession = vi.fn();

  beforeEach(() => {
    (window as any).conduit = { spawnAgentSession };
  });

  afterEach(() => {
    delete (window as any).conduit;
    vi.clearAllMocks();
  });

  it("should return the session spawned for the cwd", async () => {
    spawnAgentSession.mockResolvedValue(mockSession);

    const result = await createAgentSessionHandler("/path/with spaces/repo");

    expect(result).toEqual({ success: true, session: mockSession });
    expect(spawnAgentSession).toHaveBeenCalledTimes(1);
    expect(spawnAgentSession).toHaveBeenCalledWith({
      cwd: "/path/with spaces/repo",
    });
  });

  it.each([null, undefined])(
    "should fail when the API returns %s",
    async (session) => {
      spawnAgentSession.mockResolvedValue(session);

      const result = await createAgentSessionHandler("/path/to/repo");

      expect(result).toEqual({
        success: false,
        error: "Failed to spawn agent session: No session returned",
      });
    },
  );

  it.each([
    "Unable to find a Git repository",
    "Error: Unable to find a Git repository in /tmp",
  ])("should explain a missing repository (%s)", async (message) => {
    spawnAgentSession.mockRejectedValue(new Error(message));

    const result = await createAgentSessionHandler("/tmp");

    expect(result).toEqual({
      success: false,
      error:
        "No Git repository found. Agent sessions require a Git repository to create an isolated worktree.",
    });
  });

  it.each([
    [new Error("Git conflict detected"), "Git conflict detected"],
    ["String error", "String error"],
    [new Error(), ""],
  ])("should pass through other failures %#", async (thrown, message) => {
    spawnAgentSession.mockRejectedValue(thrown);

    const result = await createAgentSessionHandler("/path/to/repo");

    expect(result).toEqual({ success: false, error: message });
  });
});
