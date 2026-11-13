/**
 * Unit tests for gitRepoHandler
 */

import { verifyGitRepoHandler } from "@/commands/preCommands/handlers/gitRepoHandler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("gitRepoHandler", () => {
  const hasGitRepository = vi.fn();

  beforeEach(() => {
    (window as any).conduit = { hasGitRepository };
  });

  afterEach(() => {
    delete (window as any).conduit;
    vi.clearAllMocks();
  });

  it("should return success when directory is a git repository", async () => {
    hasGitRepository.mockResolvedValue(true);

    const result = await verifyGitRepoHandler("/path/with spaces/repo");

    expect(result).toEqual({ success: true });
    expect(hasGitRepository).toHaveBeenCalledTimes(1);
    expect(hasGitRepository).toHaveBeenCalledWith("/path/with spaces/repo");
  });

  it("should return error including the path when not a git repository", async () => {
    hasGitRepository.mockResolvedValue(false);

    const result = await verifyGitRepoHandler("/tmp");

    expect(result).toEqual({
      success: false,
      error: "Not a git repository: /tmp",
    });
  });

  it.each([
    [new Error("Permission denied"), "Permission denied"],
    ["String error", "String error"],
    [new Error(), ""],
  ])("should report API failure %#", async (thrown, message) => {
    hasGitRepository.mockRejectedValue(thrown);

    const result = await verifyGitRepoHandler("/path/to/repo");

    expect(result).toEqual({
      success: false,
      error: `Failed to check git repository: ${message}`,
    });
  });
});
