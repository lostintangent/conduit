/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use hoisted pattern to ensure all mocks are set up before modules load
const {
  mockCompleteAgentSession,
  mockDeleteAgentSession,
  mockEnqueueNotification,
} = vi.hoisted(() => ({
  mockCompleteAgentSession: vi.fn(),
  mockDeleteAgentSession: vi.fn(),
  mockEnqueueNotification: vi.fn(),
}));

// Mock pane actions
vi.mock("@/store/actions/pane", () => ({
  completeAgentSession: mockCompleteAgentSession,
  deleteAgentSession: mockDeleteAgentSession,
}));

// Mock notification actions
vi.mock("@/store/actions/notifications", () => ({
  enqueueNotification: mockEnqueueNotification,
}));

// Import after setting up mocks
import {
  handleCompleteAgentSessionAction,
  handleDeleteAgentSessionAction,
  useSandboxHandlers,
} from "@/hooks/useSandboxHandlers";

describe("useSandboxHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default return values
    mockEnqueueNotification.mockReturnValue("notification-id-123");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("handleCompleteAgentSessionAction", () => {
    it("should successfully complete agent session and show success notification", async () => {
      mockCompleteAgentSession.mockResolvedValue({
        status: "merged",
        message: "Successfully merged changes",
      });

      await handleCompleteAgentSessionAction("tab-1", "agent-session-1");

      expect(mockCompleteAgentSession).toHaveBeenCalledWith(
        "tab-1",
        "agent-session-1",
      );
      expect(mockEnqueueNotification).toHaveBeenCalledWith({
        kind: "success",
        message: "Agent session completed",
        details: "Successfully merged changes",
        autoCloseMs: 3000,
      });
    });

    it("should handle merge conflict and show error notification", async () => {
      mockCompleteAgentSession.mockResolvedValue({
        status: "conflict",
        message: "Merge conflict detected",
      });

      await handleCompleteAgentSessionAction("tab-1", "agent-session-1");

      expect(mockEnqueueNotification).toHaveBeenCalledWith({
        kind: "error",
        message: "Merge conflict",
        details: "Merge conflict detected",
        persistent: true,
      });
    });

    it("should show noop message when no changes to merge", async () => {
      mockCompleteAgentSession.mockResolvedValue({
        status: "noop",
        message: "No changes to merge",
      });

      await handleCompleteAgentSessionAction("tab-1", "agent-session-1");

      expect(mockEnqueueNotification).toHaveBeenCalledWith({
        kind: "success",
        message: "No changes to merge",
        details: "No changes to merge",
        autoCloseMs: 3000,
      });
    });

    it("should handle null result and show error notification", async () => {
      mockCompleteAgentSession.mockResolvedValue(null);

      await handleCompleteAgentSessionAction("tab-1", "agent-session-1");

      expect(mockEnqueueNotification).toHaveBeenCalledWith({
        kind: "error",
        message: "Failed to complete agent session",
        details: "Failed to complete agent session",
        autoCloseMs: 5000,
      });
    });

    it("should handle thrown errors and show error notification", async () => {
      const error = new Error("Network error");
      mockCompleteAgentSession.mockRejectedValue(error);

      await handleCompleteAgentSessionAction("tab-1", "agent-session-1");

      expect(mockEnqueueNotification).toHaveBeenCalledWith({
        kind: "error",
        message: "Failed to complete agent session",
        details: "Network error",
        autoCloseMs: 5000,
      });
    });

    it("should handle non-Error throws", async () => {
      mockCompleteAgentSession.mockRejectedValue("string error");

      await handleCompleteAgentSessionAction("tab-1", "agent-session-1");

      expect(mockEnqueueNotification).toHaveBeenCalledWith({
        kind: "error",
        message: "Failed to complete agent session",
        details: "string error",
        autoCloseMs: 5000,
      });
    });
  });

  describe("handleDeleteAgentSessionAction", () => {
    it("should successfully delete agent session and show success notification", async () => {
      mockDeleteAgentSession.mockResolvedValue({
        status: "removed",
        message: "Agent session deleted successfully",
      });

      await handleDeleteAgentSessionAction("tab-1", "agent-session-1");

      expect(mockDeleteAgentSession).toHaveBeenCalledWith(
        "tab-1",
        "agent-session-1",
      );
      expect(mockEnqueueNotification).toHaveBeenCalledWith({
        kind: "success",
        message: "Agent session deleted",
        details: "Agent session deleted successfully",
        autoCloseMs: 3000,
      });
    });

    it("should handle null result and show error notification", async () => {
      mockDeleteAgentSession.mockResolvedValue(null);

      await handleDeleteAgentSessionAction("tab-1", "agent-session-1");

      expect(mockEnqueueNotification).toHaveBeenCalledWith({
        kind: "error",
        message: "Failed to delete agent session",
        details: "Failed to delete agent session",
        autoCloseMs: 5000,
      });
    });

    it("should handle thrown errors and show error notification", async () => {
      const error = new Error("Deletion failed");
      mockDeleteAgentSession.mockRejectedValue(error);

      await handleDeleteAgentSessionAction("tab-1", "agent-session-1");

      expect(mockEnqueueNotification).toHaveBeenCalledWith({
        kind: "error",
        message: "Failed to delete agent session",
        details: "Deletion failed",
        autoCloseMs: 5000,
      });
    });
  });

  describe("useSandboxHandlers hook", () => {
    it("should return memoized handler functions", () => {
      const { result } = renderHook(() =>
        useSandboxHandlers({ tabId: "tab-1" }),
      );

      expect(result.current).toHaveProperty("handleCompleteAgentSession");
      expect(result.current).toHaveProperty("handleDeleteAgentSession");
      expect(typeof result.current.handleCompleteAgentSession).toBe("function");
      expect(typeof result.current.handleDeleteAgentSession).toBe("function");
    });

    it("should call handleCompleteAgentSession with correct parameters", async () => {
      mockCompleteAgentSession.mockResolvedValue({
        status: "merged",
        message: "Success",
      });

      const { result } = renderHook(() =>
        useSandboxHandlers({ tabId: "tab-1" }),
      );

      await result.current.handleCompleteAgentSession("agent-session-1");

      expect(mockCompleteAgentSession).toHaveBeenCalledWith(
        "tab-1",
        "agent-session-1",
      );
    });

    it("should call handleDeleteAgentSession with correct parameters", async () => {
      mockDeleteAgentSession.mockResolvedValue({
        status: "removed",
        message: "Success",
      });

      const { result } = renderHook(() =>
        useSandboxHandlers({ tabId: "tab-1" }),
      );

      await result.current.handleDeleteAgentSession("agent-session-1");

      expect(mockDeleteAgentSession).toHaveBeenCalledWith(
        "tab-1",
        "agent-session-1",
      );
    });

    it("should maintain referential stability when deps don't change", () => {
      const { result, rerender } = renderHook(() =>
        useSandboxHandlers({ tabId: "tab-1" }),
      );

      const firstHandlers = result.current;
      rerender();
      const secondHandlers = result.current;

      expect(firstHandlers.handleCompleteAgentSession).toBe(
        secondHandlers.handleCompleteAgentSession,
      );
      expect(firstHandlers.handleDeleteAgentSession).toBe(
        secondHandlers.handleDeleteAgentSession,
      );
    });

    it("should update handlers when tabId changes", () => {
      const { result, rerender } = renderHook(
        ({ tabId }) => useSandboxHandlers({ tabId }),
        {
          initialProps: { tabId: "tab-1" },
        },
      );

      const firstHandlers = result.current;

      rerender({ tabId: "tab-2" });
      const secondHandlers = result.current;

      expect(firstHandlers.handleCompleteAgentSession).not.toBe(
        secondHandlers.handleCompleteAgentSession,
      );
    });
  });
});
