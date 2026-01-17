/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loadUserKeybindings,
  saveUserKeybinding,
  removeUserKeybinding,
  restoreDefaultKeybindings,
  getUserKeybindingsPath,
} from "@/commands/keybindings/userKeybindings";
import { KeybindingRegistry } from "@/commands/keybindings/KeybindingRegistry";
import { CommandRegistry } from "@/commands/core/CommandRegistryImpl";
import { ContextKeyService } from "@/commands/contextKeys/ContextKeyServiceImpl";
import type { ICommandRegistry } from "@/commands/core/CommandRegistry";
import * as updateKeybindingsAtomModule from "@/commands/keybindings/updateKeybindingsAtom";

// Helper to create a minimal mock of window.conduit
function createMockConduit(
  overrides: {
    fsv2?: {
      readTextFile?: ReturnType<typeof vi.fn>;
      writeFile?: ReturnType<typeof vi.fn>;
    };
  } = {},
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
    fsv2: {
      readTextFile: overrides.fsv2?.readTextFile ?? vi.fn(),
      writeFile: overrides.fsv2?.writeFile ?? vi.fn(),
      readDirectory: vi.fn(),
      readFile: vi.fn(),
      stat: vi.fn(),
      exists: vi.fn(),
      delete: vi.fn(),
      rename: vi.fn(),
      createDirectory: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      onDirectoryListingChanged: vi.fn(),
      onFileContentChanged: vi.fn(),
      onFileDeleted: vi.fn(),
      onFileRenamed: vi.fn(),
      warmFileCache: vi.fn(),
      getPreWarmedCache: vi.fn(),
      clearFileCache: vi.fn(),
    },
  } as unknown as typeof window.conduit;
}

describe("loadUserKeybindings", () => {
  let registry: KeybindingRegistry;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalConduit: typeof window.conduit;

  beforeEach(() => {
    registry = new KeybindingRegistry();
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {}) as any;
    originalConduit = window.conduit;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    window.conduit = originalConduit;
  });

  it("should read file and register keybindings", async () => {
    const mockReadTextFile = vi.fn().mockResolvedValue(
      JSON.stringify([
        { key: "Ctrl+T", command: "test.command" },
        { key: "Cmd+P", command: "palette.open" },
      ]),
    );

    window.conduit = createMockConduit({
      fsv2: { readTextFile: mockReadTextFile },
    });

    await loadUserKeybindings(registry, "/path/to/keybindings.json");

    expect(mockReadTextFile).toHaveBeenCalledWith(
      "/path/to",
      "/path/to/keybindings.json",
    );
    expect(registry.getKeybindingsForCommand("test.command")).toHaveLength(1);
    expect(registry.getKeybindingsForCommand("palette.open")).toHaveLength(1);
  });

  it("should apply high weight to user keybindings", async () => {
    const mockReadTextFile = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify([{ key: "Ctrl+T", command: "test.command" }]),
      );

    window.conduit = createMockConduit({
      fsv2: { readTextFile: mockReadTextFile },
    });

    await loadUserKeybindings(registry, "/path/to/keybindings.json");

    const keybindings = registry.getKeybindingsForCommand("test.command");
    expect(keybindings[0].weight).toBe(1000);
  });

  it("should handle removal bindings", async () => {
    // Register a default keybinding
    registry.register("test.command", { key: "Ctrl+T" }, 0);
    expect(registry.getKeybindingsForCommand("test.command")).toHaveLength(1);

    const mockReadTextFile = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify([{ key: "", command: "-test.command" }]),
      );

    window.conduit = createMockConduit({
      fsv2: { readTextFile: mockReadTextFile },
    });

    await loadUserKeybindings(registry, "/path/to/keybindings.json");

    // Keybinding should be removed
    expect(registry.getKeybindingsForCommand("test.command")).toHaveLength(0);
  });

  it("should handle file read error", async () => {
    const mockReadTextFile = vi
      .fn()
      .mockRejectedValue(new Error("File not found"));

    window.conduit = createMockConduit({
      fsv2: { readTextFile: mockReadTextFile },
    });

    await loadUserKeybindings(registry, "/path/to/keybindings.json");

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("should return early when readTextFile returns null", async () => {
    const mockReadTextFile = vi.fn().mockResolvedValue(null);

    window.conduit = createMockConduit({
      fsv2: { readTextFile: mockReadTextFile },
    });

    await loadUserKeybindings(registry, "/path/to/keybindings.json");

    expect(mockReadTextFile).toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("should return early when window.conduit is undefined", async () => {
    window.conduit = undefined;

    await loadUserKeybindings(registry, "/path/to/keybindings.json");

    // Should not throw or log errors
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("should return early when fsv2.readTextFile is undefined", async () => {
    window.conduit = { fsv2: {} } as unknown as typeof window.conduit;

    await loadUserKeybindings(registry, "/path/to/keybindings.json");

    // Should not throw or log errors
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("should handle invalid JSON gracefully", async () => {
    const mockReadTextFile = vi.fn().mockResolvedValue("invalid json {]");

    window.conduit = createMockConduit({
      fsv2: { readTextFile: mockReadTextFile },
    });

    await loadUserKeybindings(registry, "/path/to/keybindings.json");

    // parseKeybindingsFile will log error and return empty array
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("should handle multiple keybindings including removals", async () => {
    // Register some default keybindings
    registry.register("cmd1", { key: "Ctrl+1" }, 0);
    registry.register("cmd2", { key: "Ctrl+2" }, 0);
    registry.register("cmd3", { key: "Ctrl+3" }, 0);

    const mockReadTextFile = vi.fn().mockResolvedValue(
      JSON.stringify([
        { key: "Alt+1", command: "cmd1" }, // Override cmd1
        { key: "", command: "-cmd2" }, // Remove cmd2
        { key: "Shift+4", command: "cmd4" }, // Add new cmd4
      ]),
    );

    window.conduit = createMockConduit({
      fsv2: { readTextFile: mockReadTextFile },
    });

    await loadUserKeybindings(registry, "/path/to/keybindings.json");

    // cmd1 should have 2 keybindings (default + user)
    expect(registry.getKeybindingsForCommand("cmd1").length).toBeGreaterThan(0);
    // cmd2 should be removed
    expect(registry.getKeybindingsForCommand("cmd2")).toHaveLength(0);
    // cmd3 should still exist
    expect(registry.getKeybindingsForCommand("cmd3")).toHaveLength(1);
    // cmd4 should be added
    expect(registry.getKeybindingsForCommand("cmd4")).toHaveLength(1);
  });
});

describe("getUserKeybindingsPath", () => {
  it("should construct correct path", () => {
    const path = getUserKeybindingsPath("/home/user");
    expect(path).toBe("/home/user/.conduit/keybindings.json");
  });

  it("should handle different home directories", () => {
    expect(getUserKeybindingsPath("/Users/alice")).toBe(
      "/Users/alice/.conduit/keybindings.json",
    );
    expect(getUserKeybindingsPath("/home/bob")).toBe(
      "/home/bob/.conduit/keybindings.json",
    );
    expect(getUserKeybindingsPath("C:\\Users\\charlie")).toBe(
      "C:\\Users\\charlie/.conduit/keybindings.json",
    );
  });
});

describe("saveUserKeybinding", () => {
  let registry: KeybindingRegistry;
  let originalConduit: typeof window.conduit;
  let updateAtomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    registry = new KeybindingRegistry();
    originalConduit = window.conduit;
    updateAtomSpy = vi
      .spyOn(updateKeybindingsAtomModule, "updateKeybindingsAtom")
      .mockImplementation(() => {}) as any;
  });

  afterEach(() => {
    window.conduit = originalConduit;
    updateAtomSpy.mockRestore();
  });

  it("should save new keybinding to file", async () => {
    const mockReadTextFile = vi.fn().mockResolvedValue("[]");
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);

    window.conduit = createMockConduit({
      fsv2: {
        readTextFile: mockReadTextFile,
        writeFile: mockWriteFile,
      },
    });

    await saveUserKeybinding(
      "test.command",
      "Ctrl+T",
      "/test/keybindings.json",
      registry,
    );

    expect(mockReadTextFile).toHaveBeenCalledWith(
      "/test",
      "/test/keybindings.json",
    );
    expect(mockWriteFile).toHaveBeenCalled();
    // v2 API passes Uint8Array, decode to check content
    const writtenData = mockWriteFile.mock.calls[0][2];
    const writtenContent = new TextDecoder().decode(writtenData);
    expect(writtenContent).toContain('"key": "Ctrl+T"');
    expect(writtenContent).toContain('"command": "test.command"');
  });

  it("should override existing binding for same command", async () => {
    const existingBindings = [
      { key: "Ctrl+T", command: "test.command" },
      { key: "Alt+K", command: "other.command" },
    ];

    const mockReadTextFile = vi
      .fn()
      .mockResolvedValue(JSON.stringify(existingBindings));
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);

    window.conduit = createMockConduit({
      fsv2: {
        readTextFile: mockReadTextFile,
        writeFile: mockWriteFile,
      },
    });

    await saveUserKeybinding(
      "test.command",
      "Shift+T",
      "/test/keybindings.json",
      registry,
    );

    // v2 API passes Uint8Array, decode to check content
    const writtenData = mockWriteFile.mock.calls[0][2];
    const writtenContent = new TextDecoder().decode(writtenData);
    const parsed = JSON.parse(writtenContent);

    // Should have 2 bindings: other.command and updated test.command
    expect(parsed).toHaveLength(2);
    expect(parsed.find((b: any) => b.command === "test.command").key).toBe(
      "Shift+T",
    );
    expect(parsed.find((b: any) => b.command === "other.command").key).toBe(
      "Alt+K",
    );
  });

  it("should update registry with USER_KEYBINDING_WEIGHT", async () => {
    const mockReadTextFile = vi.fn().mockResolvedValue("[]");
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);

    window.conduit = createMockConduit({
      fsv2: {
        readTextFile: mockReadTextFile,
        writeFile: mockWriteFile,
      },
    });

    await saveUserKeybinding(
      "test.command",
      "Ctrl+T",
      "/test/keybindings.json",
      registry,
    );

    const bindings = registry.getKeybindingsForCommand("test.command");
    expect(bindings).toHaveLength(1);
    expect(bindings[0].weight).toBe(1000);
  });

  it("should update global atom", async () => {
    const mockReadTextFile = vi.fn().mockResolvedValue("[]");
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);

    window.conduit = createMockConduit({
      fsv2: {
        readTextFile: mockReadTextFile,
        writeFile: mockWriteFile,
      },
    });

    await saveUserKeybinding(
      "test.command",
      "Ctrl+T",
      "/test/keybindings.json",
      registry,
    );

    expect(updateAtomSpy).toHaveBeenCalled();
  });

  it("should handle file that does not exist (ENOENT)", async () => {
    const mockReadTextFile = vi.fn().mockRejectedValue(
      Object.assign(new Error("ENOENT"), {
        message: "ENOENT: file not found",
      }),
    );
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);

    window.conduit = createMockConduit({
      fsv2: {
        readTextFile: mockReadTextFile,
        writeFile: mockWriteFile,
      },
    });

    await saveUserKeybinding(
      "test.command",
      "Ctrl+T",
      "/test/keybindings.json",
      registry,
    );

    // Should still write the file
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it("should handle missing window.conduit.fsv2.writeFile", async () => {
    const mockReadTextFile = vi.fn().mockResolvedValue("[]");

    // Create a mock without writeFile to test error handling
    window.conduit = {
      ...createMockConduit({ fsv2: { readTextFile: mockReadTextFile } }),
      fsv2: {
        readTextFile: mockReadTextFile,
        // writeFile is intentionally missing
      },
    } as unknown as typeof window.conduit;

    await expect(
      saveUserKeybinding(
        "test.command",
        "Ctrl+T",
        "/test/keybindings.json",
        registry,
      ),
    ).rejects.toThrow("window.conduit.fsv2.writeFile is not available");
  });
});

describe("removeUserKeybinding", () => {
  let registry: KeybindingRegistry;
  let commandRegistry: ICommandRegistry;
  let originalConduit: typeof window.conduit;
  let updateAtomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const contextKeyService = new ContextKeyService();
    registry = new KeybindingRegistry();
    commandRegistry = new CommandRegistry(contextKeyService);
    originalConduit = window.conduit;
    updateAtomSpy = vi
      .spyOn(updateKeybindingsAtomModule, "updateKeybindingsAtom")
      .mockImplementation(() => {}) as any;
  });

  afterEach(() => {
    window.conduit = originalConduit;
    updateAtomSpy.mockRestore();
  });

  it("should remove binding from file", async () => {
    const existingBindings = [
      { key: "Ctrl+T", command: "test.command" },
      { key: "Alt+K", command: "other.command" },
    ];

    const mockReadTextFile = vi
      .fn()
      .mockResolvedValue(JSON.stringify(existingBindings));
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);

    window.conduit = createMockConduit({
      fsv2: {
        readTextFile: mockReadTextFile,
        writeFile: mockWriteFile,
      },
    });

    await removeUserKeybinding(
      "test.command",
      "/test/keybindings.json",
      commandRegistry,
      registry,
    );

    // v2 API passes Uint8Array, decode to check content
    const writtenData = mockWriteFile.mock.calls[0][2];
    const writtenContent = new TextDecoder().decode(writtenData);
    const parsed = JSON.parse(writtenContent);

    // Should only have other.command
    expect(parsed).toHaveLength(1);
    expect(parsed[0].command).toBe("other.command");
  });

  it("should restore default keybindings", async () => {
    const mockReadTextFile = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify([{ key: "Ctrl+T", command: "test.command" }]),
      );
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);

    window.conduit = createMockConduit({
      fsv2: {
        readTextFile: mockReadTextFile,
        writeFile: mockWriteFile,
      },
    });

    // Register command with default keybinding
    commandRegistry.registerCommand({
      id: "test.command",
      title: "Test Command",
      keybinding: { key: "Alt+T" },
      run: () => {},
    });

    await removeUserKeybinding(
      "test.command",
      "/test/keybindings.json",
      commandRegistry,
      registry,
    );

    // Should have restored default
    const bindings = registry.getKeybindingsForCommand("test.command");
    expect(bindings).toHaveLength(1);
    expect(bindings[0].weight).toBe(0); // Default weight
  });

  it("should update global atom", async () => {
    const mockReadTextFile = vi.fn().mockResolvedValue("[]");
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);

    window.conduit = createMockConduit({
      fsv2: {
        readTextFile: mockReadTextFile,
        writeFile: mockWriteFile,
      },
    });

    await removeUserKeybinding(
      "test.command",
      "/test/keybindings.json",
      commandRegistry,
      registry,
    );

    expect(updateAtomSpy).toHaveBeenCalled();
  });

  it("should handle file that does not exist", async () => {
    const mockReadTextFile = vi.fn().mockRejectedValue(
      Object.assign(new Error("ENOENT"), {
        message: "ENOENT: file not found",
      }),
    );
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);

    window.conduit = createMockConduit({
      fsv2: {
        readTextFile: mockReadTextFile,
        writeFile: mockWriteFile,
      },
    });

    await removeUserKeybinding(
      "test.command",
      "/test/keybindings.json",
      commandRegistry,
      registry,
    );

    // Should still write (empty array)
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it("should handle command with no defaults", async () => {
    const mockReadTextFile = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify([{ key: "Ctrl+T", command: "test.command" }]),
      );
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);

    window.conduit = createMockConduit({
      fsv2: {
        readTextFile: mockReadTextFile,
        writeFile: mockWriteFile,
      },
    });

    // Register command WITHOUT default keybinding
    commandRegistry.registerCommand({
      id: "test.command",
      title: "Test Command",
      run: () => {},
    });

    await removeUserKeybinding(
      "test.command",
      "/test/keybindings.json",
      commandRegistry,
      registry,
    );

    // Should have no bindings after removal
    const bindings = registry.getKeybindingsForCommand("test.command");
    expect(bindings).toHaveLength(0);
  });
});

describe("restoreDefaultKeybindings", () => {
  let registry: KeybindingRegistry;
  let commandRegistry: ICommandRegistry;

  beforeEach(() => {
    const contextKeyService = new ContextKeyService();
    registry = new KeybindingRegistry();
    commandRegistry = new CommandRegistry(contextKeyService);
  });

  it("should restore single default keybinding", () => {
    // Register command with default
    commandRegistry.registerCommand({
      id: "test.command",
      title: "Test Command",
      keybinding: { key: "Ctrl+T" },
      run: () => {},
    });

    // Add user override
    registry.register("test.command", { key: "Alt+T" }, 1000);

    restoreDefaultKeybindings("test.command", commandRegistry, registry);

    const bindings = registry.getKeybindingsForCommand("test.command");
    expect(bindings).toHaveLength(1);
    expect(bindings[0].weight).toBe(0);
  });

  it("should restore multiple default keybindings", () => {
    // Register command with multiple defaults
    commandRegistry.registerCommand({
      id: "test.command",
      title: "Test Command",
      keybinding: [{ key: "Ctrl+T" }, { key: "Cmd+T", mac: "Cmd+T" }],
      run: () => {},
    });

    restoreDefaultKeybindings("test.command", commandRegistry, registry);

    const bindings = registry.getKeybindingsForCommand("test.command");
    expect(bindings.length).toBeGreaterThanOrEqual(2);
    bindings.forEach((binding) => {
      expect(binding.weight).toBe(0);
    });
  });

  it("should handle command with no defaults", () => {
    // Register command WITHOUT keybinding
    commandRegistry.registerCommand({
      id: "test.command",
      title: "Test Command",
      run: () => {},
    });

    restoreDefaultKeybindings("test.command", commandRegistry, registry);

    const bindings = registry.getKeybindingsForCommand("test.command");
    expect(bindings).toHaveLength(0);
  });

  it("should unregister existing bindings first", () => {
    // Register command with default
    commandRegistry.registerCommand({
      id: "test.command",
      title: "Test Command",
      keybinding: { key: "Ctrl+T" },
      run: () => {},
    });

    // Add multiple user overrides
    registry.register("test.command", { key: "Alt+T" }, 1000);
    registry.register("test.command", { key: "Shift+T" }, 1000);

    expect(
      registry.getKeybindingsForCommand("test.command").length,
    ).toBeGreaterThan(1);

    restoreDefaultKeybindings("test.command", commandRegistry, registry);

    // Should only have the default now
    const bindings = registry.getKeybindingsForCommand("test.command");
    expect(bindings).toHaveLength(1);
    expect(bindings[0].weight).toBe(0);
  });

  it("should handle command that does not exist", () => {
    // Should not throw
    expect(() => {
      restoreDefaultKeybindings(
        "nonexistent.command",
        commandRegistry,
        registry,
      );
    }).not.toThrow();

    const bindings = registry.getKeybindingsForCommand("nonexistent.command");
    expect(bindings).toHaveLength(0);
  });
});
