/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Use hoisted pattern to ensure all mocks are set up before modules load
const {
  mockCloseTerminal,
  mockDisposeSession,
  mockOpenTabFromExistingSession,
} = vi.hoisted(() => {
  const mockCloseTerminal = vi.fn();
  const mockDisposeSession = vi.fn();
  const mockOpenTabFromExistingSession = vi.fn();

  // Set up window.conduit in hoisted scope
  (global as any).window = {
    conduit: {
      closeTerminal: mockCloseTerminal,
    },
  };

  return {
    mockCloseTerminal,
    mockDisposeSession,
    mockOpenTabFromExistingSession,
  };
});

// Mock xterm cache
vi.mock("@/components/panes/terminal/xtermCache", () => ({
  disposeSession: mockDisposeSession,
}));

// Mock tab actions
vi.mock("@/store/actions/tab", () => ({
  openTabFromExistingSession: mockOpenTabFromExistingSession,
}));

// Import after setting up mocks
import { useHyperTerminals } from "@/hooks/useHyperTerminals";
import { hyperTerminalsAtom } from "@/store/atoms";
import { getDefaultStore } from "jotai";

describe("useHyperTerminals", () => {
  const store = getDefaultStore();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the atom state before each test
    store.set(hyperTerminalsAtom, []);
  });

  afterEach(() => {
    // Clean up after each test
    store.set(hyperTerminalsAtom, []);
  });

  it("should initialize with empty hyperTerminals array", () => {
    const { result } = renderHook(() => useHyperTerminals());

    expect(result.current.hyperTerminals).toEqual([]);
  });

  describe("openHyperTerminal", () => {
    it("should add a new hyper terminal", () => {
      const { result } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.openHyperTerminal("terminal-1", "pane-1", "/home/user");
      });

      expect(result.current.hyperTerminals).toEqual([
        {
          terminalId: "terminal-1",
          paneId: "pane-1",
          cwd: "/home/user",
        },
      ]);
    });

    it("should add multiple hyper terminals", () => {
      const { result } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.openHyperTerminal("terminal-1", "pane-1", "/home/user");
        result.current.openHyperTerminal("terminal-2", "pane-2", "/home/user2");
      });

      expect(result.current.hyperTerminals).toEqual([
        {
          terminalId: "terminal-1",
          paneId: "pane-1",
          cwd: "/home/user",
        },
        {
          terminalId: "terminal-2",
          paneId: "pane-2",
          cwd: "/home/user2",
        },
      ]);
    });

    it("should prevent duplicate terminals", () => {
      const { result } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.openHyperTerminal("terminal-1", "pane-1", "/home/user");
        result.current.openHyperTerminal("terminal-1", "pane-1", "/home/user");
      });

      expect(result.current.hyperTerminals).toEqual([
        {
          terminalId: "terminal-1",
          paneId: "pane-1",
          cwd: "/home/user",
        },
      ]);
    });

    it("should handle null cwd", () => {
      const { result } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.openHyperTerminal("terminal-1", "pane-1", null);
      });

      expect(result.current.hyperTerminals).toEqual([
        {
          terminalId: "terminal-1",
          paneId: "pane-1",
          cwd: null,
        },
      ]);
    });
  });

  describe("closeHyperTerminal", () => {
    it("should close a hyper terminal and clean up resources", () => {
      const { result } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.openHyperTerminal("terminal-1", "pane-1", "/home/user");
      });

      act(() => {
        result.current.closeHyperTerminal("terminal-1");
      });

      expect(result.current.hyperTerminals).toEqual([]);
      expect(mockCloseTerminal).toHaveBeenCalledWith("terminal-1");
      expect(mockDisposeSession).toHaveBeenCalledWith("terminal-1");
    });

    it("should handle closing non-existent terminal", () => {
      const { result } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.closeHyperTerminal("non-existent");
      });

      expect(result.current.hyperTerminals).toEqual([]);
      expect(mockCloseTerminal).not.toHaveBeenCalled();
      expect(mockDisposeSession).not.toHaveBeenCalled();
    });

    it("should close only the specified terminal", () => {
      const { result } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.openHyperTerminal("terminal-1", "pane-1", "/home/user");
        result.current.openHyperTerminal("terminal-2", "pane-2", "/home/user2");
      });

      act(() => {
        result.current.closeHyperTerminal("terminal-1");
      });

      expect(result.current.hyperTerminals).toEqual([
        {
          terminalId: "terminal-2",
          paneId: "pane-2",
          cwd: "/home/user2",
        },
      ]);
      expect(mockCloseTerminal).toHaveBeenCalledWith("terminal-1");
      expect(mockDisposeSession).toHaveBeenCalledWith("terminal-1");
    });
  });

  describe("handleHyperTerminalExit", () => {
    it("should handle external terminal exit without calling closeTerminal", () => {
      const { result } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.openHyperTerminal("terminal-1", "pane-1", "/home/user");
      });

      act(() => {
        result.current.handleHyperTerminalExit("terminal-1");
      });

      expect(result.current.hyperTerminals).toEqual([]);
      expect(mockCloseTerminal).not.toHaveBeenCalled();
      expect(mockDisposeSession).toHaveBeenCalledWith("terminal-1");
    });

    it("should handle non-existent terminal exit", () => {
      const { result } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.handleHyperTerminalExit("non-existent");
      });

      expect(result.current.hyperTerminals).toEqual([]);
      expect(mockDisposeSession).not.toHaveBeenCalled();
    });
  });

  describe("maximizeHyperTerminal", () => {
    it("should remove terminal from array and return quick pane descriptor", () => {
      const { result } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.openHyperTerminal("terminal-1", "pane-1", "/home/user");
      });

      let quickPaneDescriptor;
      act(() => {
        quickPaneDescriptor = result.current.maximizeHyperTerminal(
          "terminal-1",
          "/home/user",
        );
      });

      expect(result.current.hyperTerminals).toEqual([]);
      expect(quickPaneDescriptor).toEqual({
        type: "terminal",
        sessionId: "terminal-1",
        cwd: "/home/user",
      });
    });

    it("should handle maximizing non-existent terminal", () => {
      const { result } = renderHook(() => useHyperTerminals());

      let quickPaneDescriptor;
      act(() => {
        quickPaneDescriptor = result.current.maximizeHyperTerminal(
          "non-existent",
          null,
        );
      });

      expect(result.current.hyperTerminals).toEqual([]);
      expect(quickPaneDescriptor).toEqual({
        type: "terminal",
        sessionId: "non-existent",
        cwd: null,
      });
    });

    it("should only remove the specified terminal", () => {
      const { result } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.openHyperTerminal("terminal-1", "pane-1", "/home/user");
        result.current.openHyperTerminal("terminal-2", "pane-2", "/home/user2");
      });

      act(() => {
        result.current.maximizeHyperTerminal("terminal-1", "/home/user");
      });

      expect(result.current.hyperTerminals).toEqual([
        {
          terminalId: "terminal-2",
          paneId: "pane-2",
          cwd: "/home/user2",
        },
      ]);
    });
  });

  describe("moveHyperTerminalToTab", () => {
    it("should remove terminal from array and open new tab", async () => {
      const { result } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.openHyperTerminal("terminal-1", "pane-1", "/home/user");
      });

      await act(async () => {
        await result.current.moveHyperTerminalToTab("terminal-1", "/home/user");
      });

      expect(result.current.hyperTerminals).toEqual([]);
      expect(mockOpenTabFromExistingSession).toHaveBeenCalledWith({
        sessionId: "terminal-1",
        cwd: "/home/user",
      });
    });

    it("should handle moving non-existent terminal", async () => {
      const { result } = renderHook(() => useHyperTerminals());

      await act(async () => {
        await result.current.moveHyperTerminalToTab("non-existent", null);
      });

      expect(result.current.hyperTerminals).toEqual([]);
      expect(mockOpenTabFromExistingSession).toHaveBeenCalledWith({
        sessionId: "non-existent",
        cwd: null,
      });
    });

    it("should only remove the specified terminal", async () => {
      const { result } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.openHyperTerminal("terminal-1", "pane-1", "/home/user");
        result.current.openHyperTerminal("terminal-2", "pane-2", "/home/user2");
      });

      await act(async () => {
        await result.current.moveHyperTerminalToTab("terminal-1", "/home/user");
      });

      expect(result.current.hyperTerminals).toEqual([
        {
          terminalId: "terminal-2",
          paneId: "pane-2",
          cwd: "/home/user2",
        },
      ]);
    });
  });

  describe("state persistence", () => {
    it("should maintain state across re-renders", () => {
      const { result, rerender } = renderHook(() => useHyperTerminals());

      act(() => {
        result.current.openHyperTerminal("terminal-1", "pane-1", "/home/user");
      });

      rerender();

      expect(result.current.hyperTerminals).toEqual([
        {
          terminalId: "terminal-1",
          paneId: "pane-1",
          cwd: "/home/user",
        },
      ]);
    });
  });
});
