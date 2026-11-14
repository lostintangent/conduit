import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { watchKeybindingsFile } from "@/commands/keybindings/watchKeybindings";

// Helper to create a minimal mock of window.conduit with files
function createMockConduit(
  overrides: {
    files?: {
      subscribe?: ReturnType<typeof vi.fn>;
      unsubscribe?: ReturnType<typeof vi.fn>;
      on?: ReturnType<typeof vi.fn>;
    };
  } = {},
): typeof window.conduit {
  return {
    files: {
      subscribe:
        overrides.files?.subscribe ?? vi.fn().mockResolvedValue("sub-1"),
      unsubscribe: overrides.files?.unsubscribe ?? vi.fn(),
      on: overrides.files?.on ?? vi.fn(() => () => {}),
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

  it("should set up file watcher using a files subscription", async () => {
    const mockSubscribe = vi.fn().mockResolvedValue("sub-1");
    const mockOn = vi.fn(() => () => {});

    window.conduit = createMockConduit({
      files: {
        subscribe: mockSubscribe,
        on: mockOn,
      },
    });

    const callback = vi.fn();
    watchKeybindingsFile("/path/to/keybindings.json", callback);

    // Wait for async subscription
    await vi.waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledWith(
        "/path/to",
        "/path/to/keybindings.json",
      );
    });
  });

  it("should call callback when file changes", async () => {
    let fileChangedListener = null as
      ((payload: { subscriptionId: string; path: string }) => void) | null;

    const mockSubscribe = vi.fn().mockResolvedValue("sub-1");
    const mockOn = vi.fn(
      (
        event: string,
        callback: (payload: { subscriptionId: string; path: string }) => void,
      ) => {
        if (event === "fileContentChanged") fileChangedListener = callback;
        return () => {};
      },
    );

    window.conduit = createMockConduit({
      files: {
        subscribe: mockSubscribe,
        on: mockOn,
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
      files: {
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
    Reflect.deleteProperty(window, "conduit");

    const cleanup = watchKeybindingsFile("/path/to/keybindings.json", vi.fn());

    // Should not throw
    expect(cleanup).toBeDefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "window.conduit.files.subscribe is not available",
    );
    cleanup(); // Should not throw
  });

  it("should handle undefined files.subscribe", () => {
    window.conduit = {
      files: {},
    } as unknown as typeof window.conduit;

    const cleanup = watchKeybindingsFile("/path/to/keybindings.json", vi.fn());

    // Should not throw
    expect(cleanup).toBeDefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "window.conduit.files.subscribe is not available",
    );
    cleanup(); // Should not throw
  });

  it("should handle subscription error", async () => {
    const mockSubscribe = vi.fn().mockRejectedValue(new Error("Network error"));

    window.conduit = createMockConduit({
      files: {
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
    let fileChangedListener = null as
      ((payload: { subscriptionId: string; path: string }) => void) | null;

    const mockSubscribe = vi.fn().mockResolvedValue("sub-1");
    const mockOn = vi.fn(
      (
        event: string,
        callback: (payload: { subscriptionId: string; path: string }) => void,
      ) => {
        if (event === "fileContentChanged") fileChangedListener = callback;
        return () => {};
      },
    );

    window.conduit = createMockConduit({
      files: {
        subscribe: mockSubscribe,
        on: mockOn,
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
