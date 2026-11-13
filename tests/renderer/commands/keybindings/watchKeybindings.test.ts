/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { watchKeybindingsFile } from "@/commands/keybindings/watchKeybindings";

// Helper to create a minimal mock of window.conduit with fs
function createMockConduit(
  overrides: {
    fs?: {
      subscribe?: ReturnType<typeof vi.fn>;
      unsubscribe?: ReturnType<typeof vi.fn>;
      onFileContentChanged?: ReturnType<typeof vi.fn>;
    };
  } = {},
): typeof window.conduit {
  return {
    platform: "darwin",
    fs: {
      subscribe: overrides.fs?.subscribe ?? vi.fn().mockResolvedValue("sub-1"),
      unsubscribe: overrides.fs?.unsubscribe ?? vi.fn(),
      onFileContentChanged:
        overrides.fs?.onFileContentChanged ?? vi.fn(() => () => {}),
      readDirectory: vi.fn(),
      readFile: vi.fn(),
      readTextFile: vi.fn(),
      writeFile: vi.fn(),
      stat: vi.fn(),
      exists: vi.fn(),
      delete: vi.fn(),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      onDirectoryListingChanged: vi.fn(),
      onFileDeleted: vi.fn(),
      onFileRenamed: vi.fn(),
      warmFileCache: vi.fn(),
      getPreWarmedCache: vi.fn(),
    },
  } as unknown as typeof window.conduit;
}

describe("watchKeybindingsFile", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalConduit: typeof window.conduit;

  beforeEach(() => {
    consoleLogSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => {}) as any;
    consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {}) as any;
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {}) as any;
    originalConduit = window.conduit;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    window.conduit = originalConduit;
  });

  it("should set up file watcher using fs subscription", async () => {
    const mockSubscribe = vi.fn().mockResolvedValue("sub-1");
    const mockOnFileContentChanged = vi.fn(() => () => {});

    window.conduit = createMockConduit({
      fs: {
        subscribe: mockSubscribe,
        onFileContentChanged: mockOnFileContentChanged,
      },
    });

    const callback = vi.fn();
    watchKeybindingsFile("/path/to/keybindings.json", callback);

    // Wait for async subscription
    await vi.waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledWith(
        "/path/to",
        "file",
        "/path/to/keybindings.json",
      );
    });
  });

  it("should call callback when file changes", async () => {
    let fileChangedListener:
      | ((payload: { subscriptionId: string; path: string }) => void)
      | null = null;

    const mockSubscribe = vi.fn().mockResolvedValue("sub-1");
    const mockOnFileContentChanged = vi.fn(
      (
        callback: (payload: { subscriptionId: string; path: string }) => void,
      ) => {
        fileChangedListener = callback;
        return () => {};
      },
    );

    window.conduit = createMockConduit({
      fs: {
        subscribe: mockSubscribe,
        onFileContentChanged: mockOnFileContentChanged,
      },
    });

    const callback = vi.fn();
    watchKeybindingsFile("/path/to/keybindings.json", callback);

    // Wait for async subscription
    await vi.waitFor(() => {
      expect(fileChangedListener).not.toBeNull();
    });

    // Simulate file change
    fileChangedListener?.({
      subscriptionId: "sub-1",
      path: "/path/to/keybindings.json",
    });

    expect(callback).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Keybindings file changed, reloading...",
    );
  });

  it("should return cleanup function that unsubscribes", async () => {
    const mockUnsubscribe = vi.fn();
    const mockSubscribe = vi.fn().mockResolvedValue("sub-1");

    window.conduit = createMockConduit({
      fs: {
        subscribe: mockSubscribe,
        unsubscribe: mockUnsubscribe,
      },
    });

    const cleanup = watchKeybindingsFile("/path/to/keybindings.json", vi.fn());

    // Wait for subscription
    await vi.waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });

    // Cleanup should unsubscribe
    cleanup();

    expect(mockUnsubscribe).toHaveBeenCalledWith("sub-1");
  });

  it("should handle undefined window.conduit", () => {
    window.conduit = undefined;

    const cleanup = watchKeybindingsFile("/path/to/keybindings.json", vi.fn());

    // Should not throw
    expect(cleanup).toBeDefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "window.conduit.fs.subscribe is not available",
    );
    cleanup(); // Should not throw
  });

  it("should handle undefined fs.subscribe", () => {
    window.conduit = {
      fs: {},
    } as unknown as typeof window.conduit;

    const cleanup = watchKeybindingsFile("/path/to/keybindings.json", vi.fn());

    // Should not throw
    expect(cleanup).toBeDefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "window.conduit.fs.subscribe is not available",
    );
    cleanup(); // Should not throw
  });

  it("should handle subscription error", async () => {
    const mockSubscribe = vi.fn().mockRejectedValue(new Error("Network error"));

    window.conduit = createMockConduit({
      fs: {
        subscribe: mockSubscribe,
      },
    });

    const cleanup = watchKeybindingsFile("/path/to/keybindings.json", vi.fn());

    // Wait for error to be logged
    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to watch keybindings file:",
        expect.any(Error),
      );
    });

    // Should not throw
    expect(cleanup).toBeDefined();
    cleanup(); // Should not throw
  });

  it("should only trigger callback for matching subscriptionId", async () => {
    let fileChangedListener:
      | ((payload: { subscriptionId: string; path: string }) => void)
      | null = null;

    const mockSubscribe = vi.fn().mockResolvedValue("sub-1");
    const mockOnFileContentChanged = vi.fn(
      (
        callback: (payload: { subscriptionId: string; path: string }) => void,
      ) => {
        fileChangedListener = callback;
        return () => {};
      },
    );

    window.conduit = createMockConduit({
      fs: {
        subscribe: mockSubscribe,
        onFileContentChanged: mockOnFileContentChanged,
      },
    });

    const callback = vi.fn();
    watchKeybindingsFile("/path/to/keybindings.json", callback);

    // Wait for async subscription
    await vi.waitFor(() => {
      expect(fileChangedListener).not.toBeNull();
    });

    // Simulate file change with different subscription ID
    fileChangedListener?.({
      subscriptionId: "different-sub",
      path: "/path/to/keybindings.json",
    });

    // Should NOT trigger callback
    expect(callback).not.toHaveBeenCalled();

    // Now trigger with correct subscription ID
    fileChangedListener?.({
      subscriptionId: "sub-1",
      path: "/path/to/keybindings.json",
    });

    // Should trigger callback
    expect(callback).toHaveBeenCalled();
  });
});
