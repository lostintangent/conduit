/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { watchKeybindingsFile } from "@/commands/keybindings/watchKeybindings";

// Helper to create a minimal mock of window.conduit
function createMockConduit(
  overrides: Partial<typeof window.conduit> = {},
): typeof window.conduit {
  return {
    platform: "darwin",
    createTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    sendKeypress: vi.fn(),
    resize: vi.fn(),
    markTerminalReady: vi.fn(),
    onData: vi.fn(),
    onTitle: vi.fn(),
    onCwd: vi.fn(),
    onExit: vi.fn(),
    onNewTabRequest: vi.fn(),
    onOpenWorkspaceRequest: vi.fn(),
    onContextMenuAction: vi.fn(),
    onBeforeClose: vi.fn(),
    onTabPositionChange: vi.fn(),
    onAlwaysShowTabsChange: vi.fn(),
    onShowTerminalRulerChange: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    showContextMenu: vi.fn(),
    addCommandHistoryEntry: vi.fn(),
    removeCommandHistoryEntry: vi.fn(),
    addUrlToHistory: vi.fn(),
    addStarredPage: vi.fn(),
    removeStarredPage: vi.fn(),
    updateStarredPage: vi.fn(),
    runBackgroundCommand: vi.fn(),
    openExternal: vi.fn(),
    hasSessions: vi.fn(),
    loadSessions: vi.fn(),
    saveSession: vi.fn(),
    deleteSession: vi.fn(),
    renameWorkspace: vi.fn(),
    hasLastWorkspace: vi.fn(),
    loadLastWorkspace: vi.fn(),
    saveLastWorkspace: vi.fn(),
    spawnAgentSession: vi.fn(),
    listAgentSessions: vi.fn(),
    hasGitRepository: vi.fn(),
    finalizeAgentSession: vi.fn(),
    cleanupAgentSession: vi.fn(),
    listDirectory: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    watchFile: vi.fn(),
    ...overrides,
  } as typeof window.conduit;
}

describe("watchKeybindingsFile", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let originalConduit: typeof window.conduit;

  beforeEach(() => {
    consoleLogSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => {}) as any;
    originalConduit = window.conduit;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    window.conduit = originalConduit;
  });

  it("should set up file watcher", () => {
    const mockDispose = vi.fn();
    const mockWatchFile = vi.fn().mockReturnValue({ dispose: mockDispose });

    window.conduit = createMockConduit({ watchFile: mockWatchFile });

    const callback = vi.fn();
    watchKeybindingsFile("/path/to/keybindings.json", callback);

    expect(mockWatchFile).toHaveBeenCalledWith(
      "/path/to/keybindings.json",
      expect.any(Function),
    );
  });

  it("should call callback when file changes", () => {
    let watchCallback: (() => void) | undefined;
    const mockWatchFile = vi.fn().mockImplementation((path, cb) => {
      watchCallback = cb;
      return { dispose: vi.fn() };
    });

    window.conduit = createMockConduit({ watchFile: mockWatchFile });

    const callback = vi.fn();
    watchKeybindingsFile("/path/to/keybindings.json", callback);

    // Simulate file change
    watchCallback?.();

    expect(callback).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Keybindings file changed, reloading...",
    );
  });

  it("should return cleanup function", () => {
    const mockDispose = vi.fn();
    const mockWatchFile = vi.fn().mockReturnValue({ dispose: mockDispose });

    window.conduit = createMockConduit({ watchFile: mockWatchFile });

    const cleanup = watchKeybindingsFile("/path/to/keybindings.json", vi.fn());

    cleanup();

    expect(mockDispose).toHaveBeenCalled();
  });

  it("should handle undefined window.conduit", () => {
    window.conduit = undefined;

    const cleanup = watchKeybindingsFile("/path/to/keybindings.json", vi.fn());

    // Should not throw
    expect(cleanup).toBeDefined();
    cleanup(); // Should not throw
  });

  it("should handle undefined watchFile", () => {
    window.conduit = createMockConduit({ watchFile: undefined as any });

    const cleanup = watchKeybindingsFile("/path/to/keybindings.json", vi.fn());

    // Should not throw
    expect(cleanup).toBeDefined();
    cleanup(); // Should not throw
  });

  it("should handle watchFile returning undefined", () => {
    const mockWatchFile = vi.fn().mockReturnValue(undefined);

    window.conduit = createMockConduit({ watchFile: mockWatchFile });

    const cleanup = watchKeybindingsFile("/path/to/keybindings.json", vi.fn());

    // Should not throw
    expect(cleanup).toBeDefined();
    cleanup(); // Should not throw
  });

  it("should log on file change", () => {
    let watchCallback: (() => void) | undefined;
    const mockWatchFile = vi.fn().mockImplementation((path, cb) => {
      watchCallback = cb;
      return { dispose: vi.fn() };
    });

    window.conduit = createMockConduit({ watchFile: mockWatchFile });

    watchKeybindingsFile("/path/to/keybindings.json", vi.fn());

    watchCallback?.();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Keybindings file changed, reloading...",
    );
  });
});
