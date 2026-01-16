/**
 * @vitest-environment jsdom
 */
import {
  getCommandRegistry,
  getKeybindingRegistry,
  initializeCommandSystem,
  _resetCommandSystem,
} from "@/commands";
import {
  getCommandDisplayTitle,
  useCommand,
} from "@/commands/hooks/useCommand";
import { keybindingsAtom } from "@/store/atoms";
import { renderHook, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("useCommand", () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    // Reset and initialize command system before each test
    _resetCommandSystem();
    initializeCommandSystem();

    const registry = getCommandRegistry();
    const keybindingRegistry = getKeybindingRegistry();

    // Register a test command
    registry.registerCommand({
      id: "test.command",
      title: "Test Command",
      category: "Test",
      keybinding: { key: "Cmd+T" },
      run: () => {},
    });

    // Register another command with multiple keybindings
    registry.registerCommand({
      id: "test.multiBinding",
      title: "Multi Binding Command",
      category: "Test",
      keybinding: [{ key: "Cmd+K" }, { key: "Cmd+M" }],
      run: () => {},
    });

    // Create a fresh Jotai store for each test
    store = createStore();

    // Populate the store with keybindings from registry
    const allKeybindings = keybindingRegistry.getAllKeybindings();
    store.set(keybindingsAtom, allKeybindings);
  });

  describe("basic functionality", () => {
    it("should return command title", () => {
      const { result } = renderHook(() => useCommand("test.command"), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      expect(result.current.title).toBe("Test Command");
    });

    it("should return keybindings for command", () => {
      const { result } = renderHook(() => useCommand("test.command"), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      expect(result.current.keybindings).toHaveLength(1);
      expect(result.current.keybindings[0]).toMatchObject({
        weight: 0, // Default weight
      });
      expect(result.current.keybindings[0].display).toBeTruthy();
    });

    it("should return multiple keybindings for command with multiple bindings", () => {
      const { result } = renderHook(() => useCommand("test.multiBinding"), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      expect(result.current.keybindings.length).toBeGreaterThanOrEqual(2);
    });

    it("should return primary keybinding", () => {
      const { result } = renderHook(() => useCommand("test.command"), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      expect(result.current.primaryKeybinding).toBeTruthy();
      expect(typeof result.current.primaryKeybinding).toBe("string");
    });

    it("should return null primary keybinding for command without keybindings", () => {
      const registry = getCommandRegistry();
      registry.registerCommand({
        id: "test.noKeybinding",
        title: "No Keybinding Command",
        run: () => {},
      });

      const { result } = renderHook(() => useCommand("test.noKeybinding"), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      expect(result.current.primaryKeybinding).toBeNull();
    });

    it("should not be disabled when command exists", () => {
      const { result } = renderHook(() => useCommand("test.command"), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      expect(result.current.disabled).toBe(false);
    });
  });

  describe("keybinding priority sorting", () => {
    it("should sort keybindings by weight (highest first)", () => {
      const keybindingRegistry = getKeybindingRegistry();

      // Add a user override with higher weight (1000 for user keybindings)
      keybindingRegistry.register(
        "test.command",
        {
          key: "Cmd+Shift+T",
        },
        1000,
      );

      // Update the store with new keybindings
      const allKeybindings = keybindingRegistry.getAllKeybindings();
      store.set(keybindingsAtom, allKeybindings);

      const { result } = renderHook(() => useCommand("test.command"), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      // Should have 2 bindings: user override + default
      expect(result.current.keybindings.length).toBeGreaterThanOrEqual(2);

      // User override should come first (weight 1000 > 0)
      expect(result.current.keybindings[0].weight).toBeGreaterThan(
        result.current.keybindings[1].weight,
      );
    });

    it("should use highest weight keybinding as primary", () => {
      const keybindingRegistry = getKeybindingRegistry();

      // Add a user override with higher weight
      keybindingRegistry.register(
        "test.command",
        {
          key: "Cmd+Shift+T",
        },
        1000,
      );

      // Update the store
      const allKeybindings = keybindingRegistry.getAllKeybindings();
      store.set(keybindingsAtom, allKeybindings);

      const { result } = renderHook(() => useCommand("test.command"), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      // Primary keybinding should be the user override
      expect(result.current.primaryKeybinding).toBeTruthy();
      expect(result.current.keybindings[0].display).toBe(
        result.current.primaryKeybinding,
      );
    });
  });

  describe("execute function", () => {
    it("should provide an execute function", () => {
      const { result } = renderHook(() => useCommand("test.command"), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      expect(typeof result.current.execute).toBe("function");
    });

    it("should execute the command when called", async () => {
      const mockRun = vi.fn();
      const registry = getCommandRegistry();

      registry.registerCommand({
        id: "test.executable",
        title: "Executable Command",
        run: mockRun,
      });

      // Set a simple context builder
      registry.setContextBuilder(() => ({
        tabs: null as any,
        panes: null as any,
        terminals: null as any,
        workspaces: null as any,
        commands: null as any,
        dialogs: null as any,
        notifications: null as any,
        settings: null as any,
        contextKeys: null as any,
        view: null as any,
        activeTab: null,
        activePaneId: null,
        workspaceName: undefined,
      }));

      const { result } = renderHook(() => useCommand("test.executable"), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      await result.current.execute();

      expect(mockRun).toHaveBeenCalledTimes(1);
    });

    it("should maintain stable execute function reference", () => {
      const { result, rerender } = renderHook(
        () => useCommand("test.command"),
        {
          wrapper: ({ children }) => (
            <Provider store={store}>{children}</Provider>
          ),
        },
      );

      const firstExecute = result.current.execute;

      rerender();

      expect(result.current.execute).toBe(firstExecute);
    });
  });

  describe("missing commands", () => {
    it("should handle missing command gracefully", () => {
      const { result } = renderHook(() => useCommand("nonexistent.command"), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      expect(result.current.title).toBe("");
      expect(result.current.keybindings).toEqual([]);
      expect(result.current.primaryKeybinding).toBeNull();
      expect(result.current.disabled).toBe(true);
    });

    it("should return empty keybindings for missing command", () => {
      const { result } = renderHook(() => useCommand("nonexistent.command"), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      expect(result.current.keybindings).toHaveLength(0);
    });
  });

  describe("reactivity", () => {
    it("should update when keybindings change", async () => {
      const { result } = renderHook(() => useCommand("test.command"), {
        wrapper: ({ children }) => (
          <Provider store={store}>{children}</Provider>
        ),
      });

      const initialBindingsCount = result.current.keybindings.length;

      // Add a new keybinding via store update
      const keybindingRegistry = getKeybindingRegistry();
      keybindingRegistry.register(
        "test.command",
        {
          key: "Alt+T",
        },
        1000,
      );

      const updatedKeybindings = keybindingRegistry.getAllKeybindings();
      store.set(keybindingsAtom, updatedKeybindings);

      // Wait for the hook to update
      await waitFor(() => {
        expect(result.current.keybindings.length).toBeGreaterThan(
          initialBindingsCount,
        );
      });
    });
  });
});

describe("getCommandDisplayTitle", () => {
  it("should return title with keybinding when showKeybinding is true", () => {
    const cmd = {
      title: "Test Command",
      primaryKeybinding: "Cmd+T",
    };

    expect(getCommandDisplayTitle(cmd)).toBe("Test Command (Cmd+T)");
  });

  it("should return title without keybinding when showKeybinding is false", () => {
    const cmd = {
      title: "Test Command",
      primaryKeybinding: "Cmd+T",
    };

    expect(getCommandDisplayTitle(cmd, false)).toBe("Test Command");
  });

  it("should return title only when no keybinding exists", () => {
    const cmd = {
      title: "Test Command",
      primaryKeybinding: null as string | null,
    };

    expect(getCommandDisplayTitle(cmd)).toBe("Test Command");
  });

  it("should return title only when keybinding is empty string", () => {
    const cmd = {
      title: "Test Command",
      primaryKeybinding: "",
    };

    expect(getCommandDisplayTitle(cmd)).toBe("Test Command");
  });

  it("should handle showKeybinding default parameter", () => {
    const cmd = {
      title: "Test Command",
      primaryKeybinding: "Cmd+T",
    };

    // Should default to true
    expect(getCommandDisplayTitle(cmd)).toBe("Test Command (Cmd+T)");
  });
});
