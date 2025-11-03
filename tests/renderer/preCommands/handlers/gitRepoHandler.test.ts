/**
 * Unit tests for gitRepoHandler
 */

import { verifyGitRepoHandler } from "@/commands/preCommands/handlers/gitRepoHandler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("gitRepoHandler", () => {
  beforeEach(() => {
    // Mock window.conduit
    (global as any).window = {
      conduit: {
        hasGitRepository: vi.fn(),
      },
    };
  });

  afterEach(() => {
    // Clean up global mock
    delete (global as any).window;
    vi.clearAllMocks();
  });

  describe("success cases", () => {
    it("should return success when directory is a git repository", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const result = await verifyGitRepoHandler("/path/to/repo");

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockApi.hasGitRepository).toHaveBeenCalledWith("/path/to/repo");
      expect(mockApi.hasGitRepository).toHaveBeenCalledTimes(1);
    });

    it("should handle various valid git repository paths", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const validPaths = [
        "/home/user/project",
        "/Users/username/Documents/repo",
        "C:\\Users\\username\\repo",
        "/path/with spaces/repo",
        "/path-with-dashes/repo",
        "/path_with_underscores/repo",
      ];

      for (const path of validPaths) {
        const result = await verifyGitRepoHandler(path);

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
        expect(mockApi.hasGitRepository).toHaveBeenCalledWith(path);
      }
    });
  });

  describe("failure cases", () => {
    it("should return error when directory is not a git repository", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(false);

      const result = await verifyGitRepoHandler("/tmp");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Not a git repository: /tmp");
    });

    it("should include path in error message", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(false);

      const testPath = "/custom/path/to/check";
      const result = await verifyGitRepoHandler(testPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain(testPath);
      expect(result.error).toBe(`Not a git repository: ${testPath}`);
    });

    it("should handle API errors gracefully", async () => {
      const mockApi = (global as any).window.conduit;
      const apiError = new Error("Permission denied");
      mockApi.hasGitRepository.mockRejectedValue(apiError);

      const result = await verifyGitRepoHandler("/path/to/repo");

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "Failed to check git repository: Permission denied",
      );
    });

    it("should handle non-Error thrown values", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockRejectedValue("String error");

      const result = await verifyGitRepoHandler("/path/to/repo");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to check git repository: String error");
    });

    it("should handle errors with no message", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockRejectedValue(new Error());

      const result = await verifyGitRepoHandler("/path/to/repo");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to check git repository: ");
    });

    it("should handle network timeout errors", async () => {
      const mockApi = (global as any).window.conduit;
      const timeoutError = new Error("Request timeout");
      mockApi.hasGitRepository.mockRejectedValue(timeoutError);

      const result = await verifyGitRepoHandler("/path/to/repo");

      expect(result.success).toBe(false);
      expect(result.error).toContain("timeout");
    });
  });

  describe("edge cases", () => {
    it("should handle empty string path", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(false);

      const result = await verifyGitRepoHandler("");

      expect(mockApi.hasGitRepository).toHaveBeenCalledWith("");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Not a git repository: ");
    });

    it("should handle relative paths", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const result = await verifyGitRepoHandler("./relative/path");

      expect(mockApi.hasGitRepository).toHaveBeenCalledWith("./relative/path");
      expect(result.success).toBe(true);
    });

    it("should handle paths with trailing slashes", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const result = await verifyGitRepoHandler("/path/to/repo/");

      expect(mockApi.hasGitRepository).toHaveBeenCalledWith("/path/to/repo/");
      expect(result.success).toBe(true);
    });

    it("should handle paths with multiple slashes", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const result = await verifyGitRepoHandler("/path//to///repo");

      expect(mockApi.hasGitRepository).toHaveBeenCalledWith("/path//to///repo");
      expect(result.success).toBe(true);
    });

    it("should handle home directory expansion (~)", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const result = await verifyGitRepoHandler("~/projects/repo");

      expect(mockApi.hasGitRepository).toHaveBeenCalledWith("~/projects/repo");
      expect(result.success).toBe(true);
    });

    it("should handle Windows-style paths", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const result = await verifyGitRepoHandler("C:\\Users\\username\\repo");

      expect(mockApi.hasGitRepository).toHaveBeenCalledWith(
        "C:\\Users\\username\\repo",
      );
      expect(result.success).toBe(true);
    });

    it("should handle paths with special characters", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const specialPaths = [
        "/path/with spaces/repo",
        "/path/with-dashes/repo",
        "/path/with_underscores/repo",
        "/path/with.dots/repo",
        "/path/with(parens)/repo",
        "/path/with[brackets]/repo",
      ];

      for (const path of specialPaths) {
        mockApi.hasGitRepository.mockResolvedValue(true);
        const result = await verifyGitRepoHandler(path);

        expect(result.success).toBe(true);
        expect(mockApi.hasGitRepository).toHaveBeenCalledWith(path);
      }
    });
  });

  describe("API interaction", () => {
    it("should call hasGitRepository with exact path provided", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const testPath = "/exact/path/to/test";
      await verifyGitRepoHandler(testPath);

      expect(mockApi.hasGitRepository).toHaveBeenCalledWith(testPath);
    });

    it("should not call API multiple times on single invocation", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      await verifyGitRepoHandler("/path/to/repo");

      expect(mockApi.hasGitRepository).toHaveBeenCalledTimes(1);
    });

    it("should handle slow API responses", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(true), 100);
          }),
      );

      const startTime = Date.now();
      const result = await verifyGitRepoHandler("/path/to/repo");
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });

    it("should handle rapid consecutive calls", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const promises = [
        verifyGitRepoHandler("/path1"),
        verifyGitRepoHandler("/path2"),
        verifyGitRepoHandler("/path3"),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(mockApi.hasGitRepository).toHaveBeenCalledTimes(3);
    });
  });

  describe("return type consistency", () => {
    it("should always return an object with success property", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const result = await verifyGitRepoHandler("/path/to/repo");

      expect(result).toHaveProperty("success");
      expect(typeof result.success).toBe("boolean");
    });

    it("should return error only on failure", async () => {
      const mockApi = (global as any).window.conduit;

      // Success case
      mockApi.hasGitRepository.mockResolvedValue(true);
      const successResult = await verifyGitRepoHandler("/path/to/repo");
      expect(successResult.error).toBeUndefined();

      // Failure case - not a repo
      mockApi.hasGitRepository.mockResolvedValue(false);
      const failureResult = await verifyGitRepoHandler("/path/to/repo");
      expect(failureResult.error).toBeDefined();
      expect(typeof failureResult.error).toBe("string");

      // Failure case - API error
      mockApi.hasGitRepository.mockRejectedValue(new Error("API error"));
      const errorResult = await verifyGitRepoHandler("/path/to/repo");
      expect(errorResult.error).toBeDefined();
      expect(typeof errorResult.error).toBe("string");
    });

    it("should not return extra properties on success", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const result = await verifyGitRepoHandler("/path/to/repo");

      const keys = Object.keys(result);
      expect(keys).toHaveLength(1);
      expect(keys).toContain("success");
    });

    it("should return exactly two properties on failure", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(false);

      const result = await verifyGitRepoHandler("/path/to/repo");

      const keys = Object.keys(result);
      expect(keys).toHaveLength(2);
      expect(keys).toContain("success");
      expect(keys).toContain("error");
    });
  });

  describe("error message formatting", () => {
    it('should format "not a repo" error consistently', async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(false);

      const paths = ["/path1", "/path2", "/path3"];

      for (const path of paths) {
        const result = await verifyGitRepoHandler(path);

        expect(result.error).toMatch(/^Not a git repository: /);
        expect(result.error).toContain(path);
      }
    });

    it("should format API error consistently", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockRejectedValue(new Error("Test error"));

      const result = await verifyGitRepoHandler("/path/to/repo");

      expect(result.error).toMatch(/^Failed to check git repository: /);
      expect(result.error).toContain("Test error");
    });

    it("should distinguish between different error types in message", async () => {
      const mockApi = (global as any).window.conduit;

      // Not a repo error
      mockApi.hasGitRepository.mockResolvedValue(false);
      const notRepoResult = await verifyGitRepoHandler("/path");
      expect(notRepoResult.error).toContain("Not a git repository");

      // API error
      mockApi.hasGitRepository.mockRejectedValue(new Error("API failed"));
      const apiErrorResult = await verifyGitRepoHandler("/path");
      expect(apiErrorResult.error).toContain("Failed to check git repository");

      // Different error messages
      expect(notRepoResult.error).not.toBe(apiErrorResult.error);
    });
  });

  describe("boolean return value handling", () => {
    it("should treat true as git repository exists", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(true);

      const result = await verifyGitRepoHandler("/path/to/repo");

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should treat false as git repository does not exist", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(false);

      const result = await verifyGitRepoHandler("/path/to/repo");

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle truthy non-boolean values as true", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(1 as any); // Truthy

      const result = await verifyGitRepoHandler("/path/to/repo");

      // Should still work due to JavaScript truthy/falsy
      expect(result.success).toBe(true);
    });

    it("should handle falsy non-boolean values as false", async () => {
      const mockApi = (global as any).window.conduit;
      mockApi.hasGitRepository.mockResolvedValue(0 as any); // Falsy

      const result = await verifyGitRepoHandler("/path/to/repo");

      // Should still work due to JavaScript truthy/falsy
      expect(result.success).toBe(false);
    });
  });
});
