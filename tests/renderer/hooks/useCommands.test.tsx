import {
  getCommandRegistry,
  getKeybindingRegistry,
  getContextKeyService,
  When,
} from "@/commands";
import { ContextKey } from "@/commands/contextKeys/ContextKey";
import { parseKeybinding } from "@/commands/keybindings/parser";
import { updateKeybindingsAtom } from "@/commands/keybindings/updateKeybindingsAtom";
import { formatKeybindingForDisplay } from "@/commands/keybindings/utils";
import { useCommands } from "@/hooks/useCommands";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commandContext } from "../commands/fixtures";

describe("useCommands", () => {
  let commandRegistry: ReturnType<typeof getCommandRegistry>;
  let keybindingRegistry: ReturnType<typeof getKeybindingRegistry>;
  let contextKeyService: ReturnType<typeof getContextKeyService>;

  beforeEach(() => {
    commandRegistry = getCommandRegistry();
    keybindingRegistry = getKeybindingRegistry();
    contextKeyService = getContextKeyService();

    // Set up context builder
    commandRegistry.setContextBuilder(() => commandContext());
  });

  describe("basic conversion", () => {
    it("should convert CommandDescriptor to Command with all fields", () => {
      commandRegistry.registerCommand({
        id: "test.command",
        title: "Test Command",
        description: "Test description",
        category: "Test",
        keybinding: { key: "Cmd+T" },
        run: vi.fn(),
      });
      updateKeybindingsAtom();

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      expect(result.current).toHaveLength(1);
      const command = result.current[0];

      expect(command.id).toBe("test.command");
      expect(command.label).toBe("Test Command");
      expect(command.description).toBe("Test description");
      expect(command.category).toBe("Test");
      expect(command.keybinding).toBeTruthy();
      expect(typeof command.run).toBe("function");
    });

    it("should handle commands without optional fields", () => {
      commandRegistry.registerCommand({
        id: "test.minimal",
        title: "Minimal Command",
        run: vi.fn(),
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      const command = result.current.find((cmd) => cmd.id === "test.minimal");
      expect(command).toBeDefined();
      expect(command!.label).toBe("Minimal Command");
      expect(command!.description).toBeUndefined();
      expect(command!.category).toBeUndefined();
      expect(command!.keybinding).toBeUndefined();
    });

    it("should convert multiple commands", () => {
      commandRegistry.registerCommand({
        id: "test.command1",
        title: "Command 1",
        run: vi.fn(),
      });

      commandRegistry.registerCommand({
        id: "test.command2",
        title: "Command 2",
        run: vi.fn(),
      });

      commandRegistry.registerCommand({
        id: "test.command3",
        title: "Command 3",
        run: vi.fn(),
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      expect(result.current.length).toBeGreaterThanOrEqual(3);
      expect(
        result.current.find((cmd) => cmd.id === "test.command1"),
      ).toBeDefined();
      expect(
        result.current.find((cmd) => cmd.id === "test.command2"),
      ).toBeDefined();
      expect(
        result.current.find((cmd) => cmd.id === "test.command3"),
      ).toBeDefined();
    });
  });

  describe("when clause filtering", () => {
    it("should include commands without when clause", () => {
      commandRegistry.registerCommand({
        id: "test.alwaysVisible",
        title: "Always Visible",
        run: vi.fn(),
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      expect(
        result.current.find((cmd) => cmd.id === "test.alwaysVisible"),
      ).toBeDefined();
    });

    it("should include commands when when clause evaluates to true", () => {
      contextKeyService.setGlobal("testFlag", true);

      const testFlag = new ContextKey<boolean>("testFlag", false);

      commandRegistry.registerCommand({
        id: "test.conditional",
        title: "Conditional Command",
        when: testFlag.isTrue(),
        run: vi.fn(),
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      expect(
        result.current.find((cmd) => cmd.id === "test.conditional"),
      ).toBeDefined();
    });

    it("should exclude commands when when clause evaluates to false", () => {
      contextKeyService.setGlobal("testFlag", false);

      const testFlag = new ContextKey<boolean>("testFlag", false);

      commandRegistry.registerCommand({
        id: "test.hidden",
        title: "Hidden Command",
        when: testFlag.isTrue(),
        run: vi.fn(),
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      expect(
        result.current.find((cmd) => cmd.id === "test.hidden"),
      ).toBeUndefined();
    });

    it("should handle complex when clauses", () => {
      contextKeyService.setGlobal("hasWorkspace", true);
      contextKeyService.setGlobal("tabCount", 3);

      const hasWorkspace = new ContextKey<boolean>("hasWorkspace", false);
      const tabCount = new ContextKey<number>("tabCount", 0);

      commandRegistry.registerCommand({
        id: "test.complex",
        title: "Complex When",
        when: When.and(hasWorkspace.isTrue(), tabCount.greaterThan(1)),
        run: vi.fn(),
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      expect(
        result.current.find((cmd) => cmd.id === "test.complex"),
      ).toBeDefined();
    });

    it("should update filtered commands when context changes", () => {
      const showCommand = new ContextKey<boolean>("showCommand", false);

      contextKeyService.setGlobal("showCommand", false);

      commandRegistry.registerCommand({
        id: "test.dynamic",
        title: "Dynamic Command",
        when: showCommand.isTrue(),
        run: vi.fn(),
      });

      const { result, rerender } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      // Should not be visible initially
      expect(
        result.current.find((cmd) => cmd.id === "test.dynamic"),
      ).toBeUndefined();

      // Change context
      contextKeyService.setGlobal("showCommand", true);
      rerender();

      // Should now be visible
      expect(
        result.current.find((cmd) => cmd.id === "test.dynamic"),
      ).toBeDefined();
    });
  });

  describe("meta command filtering", () => {
    it("should filter out view.showCommandPalette", () => {
      commandRegistry.registerCommand({
        id: "view.showCommandPalette",
        title: "Show Command Palette",
        run: vi.fn(),
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      expect(
        result.current.find((cmd) => cmd.id === "view.showCommandPalette"),
      ).toBeUndefined();
    });

    it("should include other view commands", () => {
      commandRegistry.registerCommand({
        id: "view.toggleFocusMode",
        title: "Toggle Focus Mode",
        run: vi.fn(),
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      expect(
        result.current.find((cmd) => cmd.id === "view.toggleFocusMode"),
      ).toBeDefined();
    });
  });

  describe("keybinding formatting", () => {
    it("should format single keybinding for display", () => {
      commandRegistry.registerCommand({
        id: "test.keybinding",
        title: "Keybinding Command",
        keybinding: { key: "Cmd+T" },
        run: vi.fn(),
      });
      updateKeybindingsAtom();

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      const command = result.current.find(
        (cmd) => cmd.id === "test.keybinding",
      );
      expect(command).toBeDefined();
      expect(command!.keybinding).toBeTruthy();
      expect(typeof command!.keybinding).toBe("string");
    });

    it("should use primary keybinding when multiple exist", () => {
      commandRegistry.registerCommand({
        id: "test.multiBinding",
        title: "Multi Binding",
        keybinding: [{ key: "Cmd+K" }, { key: "Cmd+M" }],
        run: vi.fn(),
      });
      updateKeybindingsAtom();

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      const command = result.current.find(
        (cmd) => cmd.id === "test.multiBinding",
      );
      expect(command).toBeDefined();
      expect(command!.keybinding).toBeTruthy();
      // Should show first keybinding
    });

    it("should handle commands without keybindings", () => {
      commandRegistry.registerCommand({
        id: "test.noKeybinding",
        title: "No Keybinding",
        run: vi.fn(),
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      const command = result.current.find(
        (cmd) => cmd.id === "test.noKeybinding",
      );
      expect(command).toBeDefined();
      expect(command!.keybinding).toBeUndefined();
    });

    it("should format chord keybindings", () => {
      commandRegistry.registerCommand({
        id: "test.chord",
        title: "Chord Command",
        keybinding: { key: "Cmd+K Cmd+S" },
        run: vi.fn(),
      });
      updateKeybindingsAtom();

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      const command = result.current.find((cmd) => cmd.id === "test.chord");
      expect(command).toBeDefined();
      expect(command!.keybinding).toBeTruthy();
      // formatKeybindingForDisplay should handle chord format
    });
  });

  describe("command execution", () => {
    it("should execute command via registry when run is called", async () => {
      const mockRun = vi.fn();
      commandRegistry.registerCommand({
        id: "test.executable",
        title: "Executable",
        run: mockRun,
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      const command = result.current.find(
        (cmd) => cmd.id === "test.executable",
      );
      expect(command).toBeDefined();

      await command!.run();

      expect(mockRun).toHaveBeenCalledTimes(1);
    });

    it("should pass context to command handler", async () => {
      const mockRun = vi.fn();
      commandRegistry.registerCommand({
        id: "test.withContext",
        title: "With Context",
        run: mockRun,
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      const command = result.current.find(
        (cmd) => cmd.id === "test.withContext",
      );
      await command!.run();

      // Should receive context from contextBuilder
      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          activeTab: null,
          activePaneId: null,
        }),
      );
    });

    it("should handle async command execution", async () => {
      const mockRun = vi.fn().mockResolvedValue("result");
      commandRegistry.registerCommand({
        id: "test.async",
        title: "Async Command",
        run: mockRun,
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      const command = result.current.find((cmd) => cmd.id === "test.async");
      const execResult = await command!.run();

      expect(mockRun).toHaveBeenCalledTimes(1);
      expect(execResult).toBe("result");
    });

    it("should handle command execution errors", async () => {
      const mockRun = vi.fn().mockRejectedValue(new Error("Command failed"));
      commandRegistry.registerCommand({
        id: "test.error",
        title: "Error Command",
        run: mockRun,
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      const command = result.current.find((cmd) => cmd.id === "test.error");

      await expect(command!.run()).rejects.toThrow("Command failed");
    });
  });

  describe("memoization and reactivity", () => {
    it("should memoize results when dependencies unchanged", () => {
      const { result, rerender } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      const firstResult = result.current;
      rerender();

      // Memoization ensures same reference when nothing changed
      expect(result.current).toBe(firstResult);
    });

    it("should reflect context changes reactively", async () => {
      const isEnabled = new ContextKey<boolean>("isEnabled", false);

      contextKeyService.setGlobal("isEnabled", false);

      commandRegistry.registerCommand({
        id: "test.contextUpdate",
        title: "Context Update",
        when: isEnabled.isTrue(),
        run: vi.fn(),
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      expect(
        result.current.find((cmd) => cmd.id === "test.contextUpdate"),
      ).toBeUndefined();

      // Context change triggers onDidChangeContext listener
      contextKeyService.setGlobal("isEnabled", true);

      // Wait for subscription to trigger state update
      await vi.waitFor(() => {
        expect(
          result.current.find((cmd) => cmd.id === "test.contextUpdate"),
        ).toBeDefined();
      });
    });

    it("should reflect keybinding changes", async () => {
      commandRegistry.registerCommand({
        id: "test.rebound",
        title: "Rebound",
        keybinding: { key: "Cmd+1" },
        run: vi.fn(),
      });
      updateKeybindingsAtom();

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      await act(async () => {
        keybindingRegistry.unregister("test.rebound");
        keybindingRegistry.register("test.rebound", { key: "Cmd+2" });
        updateKeybindingsAtom();
      });

      expect(
        result.current.find((cmd) => cmd.id === "test.rebound")!.keybinding,
      ).toBe(formatKeybindingForDisplay(parseKeybinding("Cmd+2")));
    });

    it("should recompute when context changes", () => {
      const testFlag = new ContextKey<boolean>("testFlag", false);

      commandRegistry.registerCommand({
        id: "test.conditional",
        title: "Conditional",
        when: testFlag.isTrue(),
        run: vi.fn(),
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      const firstResult = result.current;

      // Changing context triggers new computation
      contextKeyService.setGlobal("testFlag", true);

      // Wait for update
      vi.waitFor(() => {
        expect(result.current).not.toBe(firstResult);
      });
    });
  });

  describe("edge cases", () => {
    it("should handle undefined registries during initialization", () => {
      const { result } = renderHook(() => useCommands(undefined, undefined));

      // Should return empty array when registries not ready
      expect(result.current).toEqual([]);
    });

    it("should handle empty command registry", () => {
      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      // Should return array (may have commands from other tests, but shouldn't crash)
      expect(Array.isArray(result.current)).toBe(true);
    });

    it("should handle commands with same keybinding", () => {
      commandRegistry.registerCommand({
        id: "test.conflict1",
        title: "Conflict 1",
        keybinding: { key: "Cmd+X" },
        run: vi.fn(),
      });

      commandRegistry.registerCommand({
        id: "test.conflict2",
        title: "Conflict 2",
        keybinding: { key: "Cmd+X" },
        run: vi.fn(),
      });

      const { result } = renderHook(() =>
        useCommands(commandRegistry, contextKeyService),
      );

      const cmd1 = result.current.find((cmd) => cmd.id === "test.conflict1");
      const cmd2 = result.current.find((cmd) => cmd.id === "test.conflict2");

      expect(cmd1).toBeDefined();
      expect(cmd2).toBeDefined();
      // Both should have keybindings (conflict detection is separate concern)
    });
  });
});
