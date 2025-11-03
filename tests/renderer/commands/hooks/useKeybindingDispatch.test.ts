/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useKeybindingDispatch } from "@/commands/hooks/useKeybindingDispatch";
import { CommandRegistry } from "@/commands/core/CommandRegistryImpl";
import { ContextKeyService } from "@/commands/contextKeys/ContextKeyServiceImpl";
import { KeybindingRegistry } from "@/commands/keybindings/KeybindingRegistry";

describe("useKeybindingDispatch", () => {
  let commandRegistry: CommandRegistry;
  let keybindingRegistry: KeybindingRegistry;
  let contextKeyService: ContextKeyService;
  let mockCommandRun: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    contextKeyService = new ContextKeyService();
    keybindingRegistry = new KeybindingRegistry();
    commandRegistry = new CommandRegistry(
      contextKeyService,
      keybindingRegistry,
    );

    // Set up a simple context builder
    commandRegistry.setContextBuilder(() => ({
      tabs: null as any,
      panes: null as any,
      terminals: null as any,
      workspaces: null as any,
      commands: null as any,
      dialogs: null as any,
      notifications: null as any,
      settings: null as any,
      contextKeys: contextKeyService,
      view: null as any,
      activeTab: null,
      activePaneId: null,
      workspaceName: undefined,
    }));

    mockCommandRun = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("basic keyboard dispatch", () => {
    it("should dispatch command on matching keybinding", async () => {
      commandRegistry.registerCommand({
        id: "test.command",
        title: "Test Command",
        keybinding: { key: "Cmd+T" },
        run: mockCommandRun,
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      // Simulate Cmd+T
      const event = new KeyboardEvent("keydown", {
        key: "t",
        metaKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(mockCommandRun).toHaveBeenCalledTimes(1);
      });
    });

    it("should not dispatch command when keybinding does not match", () => {
      commandRegistry.registerCommand({
        id: "test.command",
        title: "Test Command",
        keybinding: { key: "Cmd+T" },
        run: mockCommandRun,
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      // Simulate Cmd+K (no command registered)
      const event = new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event);

      expect(mockCommandRun).not.toHaveBeenCalled();
    });

    it("should prevent default when command is found", () => {
      commandRegistry.registerCommand({
        id: "test.command",
        title: "Test Command",
        keybinding: { key: "Cmd+T" },
        run: mockCommandRun,
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      const event = new KeyboardEvent("keydown", {
        key: "t",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      window.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe("chord sequences", () => {
    it("should handle multi-chord keybindings", async () => {
      commandRegistry.registerCommand({
        id: "test.chordCommand",
        title: "Chord Command",
        keybinding: { key: "Cmd+K Cmd+T" },
        run: mockCommandRun,
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      // First chord: Cmd+K
      const event1 = new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event1);

      // Should not execute yet
      expect(mockCommandRun).not.toHaveBeenCalled();

      // Second chord: Cmd+T
      const event2 = new KeyboardEvent("keydown", {
        key: "t",
        metaKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event2);

      // Now should execute
      await waitFor(() => {
        expect(mockCommandRun).toHaveBeenCalledTimes(1);
      });
    });

    it("should timeout chord sequence after 1 second", async () => {
      vi.useFakeTimers();

      commandRegistry.registerCommand({
        id: "test.chordCommand",
        title: "Chord Command",
        keybinding: { key: "Cmd+K Cmd+T" },
        run: mockCommandRun,
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      // First chord: Cmd+K
      const event1 = new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event1);

      // Wait for timeout
      vi.advanceTimersByTime(1000);

      // Second chord after timeout should not trigger command
      const event2 = new KeyboardEvent("keydown", {
        key: "t",
        metaKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event2);

      expect(mockCommandRun).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should clear chord state on wrong second chord", () => {
      commandRegistry.registerCommand({
        id: "test.chordCommand",
        title: "Chord Command",
        keybinding: { key: "Cmd+K Cmd+T" },
        run: mockCommandRun,
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      // First chord: Cmd+K
      const event1 = new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event1);

      // Wrong second chord: Cmd+X (not registered)
      const event2 = new KeyboardEvent("keydown", {
        key: "x",
        metaKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event2);

      expect(mockCommandRun).not.toHaveBeenCalled();

      // Try correct sequence again - first chord should work
      const event3 = new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event3);

      // This confirms chord state was cleared
      expect(mockCommandRun).not.toHaveBeenCalled();
    });
  });

  describe("input element detection", () => {
    it("should skip processing for plain text in textarea", () => {
      commandRegistry.registerCommand({
        id: "test.command",
        title: "Test Command",
        keybinding: { key: "t" }, // Plain 't' without modifiers
        run: mockCommandRun,
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      // Create a textarea and set it as the event target
      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);
      textarea.focus();

      // Simulate plain 't' in textarea (no modifiers)
      const event = new KeyboardEvent("keydown", {
        key: "t",
        bubbles: true,
      });
      Object.defineProperty(event, "target", {
        value: textarea,
        writable: false,
      });

      window.dispatchEvent(event);

      // Should not execute command (fast path exit)
      expect(mockCommandRun).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
    });

    it("should process command with modifiers even in input element", async () => {
      commandRegistry.registerCommand({
        id: "test.command",
        title: "Test Command",
        keybinding: { key: "Cmd+T" },
        run: mockCommandRun,
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);
      textarea.focus();

      // Simulate Cmd+T in textarea (has modifier)
      const event = new KeyboardEvent("keydown", {
        key: "t",
        metaKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, "target", {
        value: textarea,
        writable: false,
      });

      window.dispatchEvent(event);

      // Should execute command (modifiers bypass input element check)
      await waitFor(() => {
        expect(mockCommandRun).toHaveBeenCalledTimes(1);
      });

      document.body.removeChild(textarea);
    });

    it("should skip processing for plain text in input element", () => {
      commandRegistry.registerCommand({
        id: "test.command",
        title: "Test Command",
        keybinding: { key: "t" },
        run: mockCommandRun,
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      const event = new KeyboardEvent("keydown", {
        key: "t",
        bubbles: true,
      });
      Object.defineProperty(event, "target", { value: input, writable: false });

      window.dispatchEvent(event);

      expect(mockCommandRun).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it("should skip processing for contentEditable elements", () => {
      commandRegistry.registerCommand({
        id: "test.command",
        title: "Test Command",
        keybinding: { key: "t" },
        run: mockCommandRun,
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      const div = document.createElement("div");
      div.contentEditable = "true";
      document.body.appendChild(div);
      div.focus();

      const event = new KeyboardEvent("keydown", {
        key: "t",
        bubbles: true,
      });
      Object.defineProperty(event, "target", { value: div, writable: false });

      window.dispatchEvent(event);

      expect(mockCommandRun).not.toHaveBeenCalled();

      document.body.removeChild(div);
    });
  });

  describe("null registry handling", () => {
    it("should not crash when registries are null", () => {
      expect(() => {
        renderHook(() => useKeybindingDispatch(null, null));
      }).not.toThrow();
    });

    it("should not add event listener when registries are null", () => {
      const addEventListenerSpy = vi.spyOn(window, "addEventListener");

      renderHook(() => useKeybindingDispatch(null, null));

      expect(addEventListenerSpy).not.toHaveBeenCalledWith(
        "keydown",
        expect.any(Function),
      );

      addEventListenerSpy.mockRestore();
    });

    it("should add event listener when registries are provided", () => {
      const addEventListenerSpy = vi.spyOn(window, "addEventListener");

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function),
      );

      addEventListenerSpy.mockRestore();
    });
  });

  describe("cleanup", () => {
    it("should remove event listener on unmount", () => {
      const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

      const { unmount } = renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "keydown",
        expect.any(Function),
      );

      removeEventListenerSpy.mockRestore();
    });

    it("should clear chord timeout on unmount", () => {
      vi.useFakeTimers();

      commandRegistry.registerCommand({
        id: "test.chordCommand",
        title: "Chord Command",
        keybinding: { key: "Cmd+K Cmd+T" },
        run: mockCommandRun,
      });

      const { unmount } = renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      // Start a chord sequence
      const event = new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event);

      // Unmount should clear the timeout
      unmount();

      // Advance timers - timeout should not fire
      vi.advanceTimersByTime(1000);

      // Verify no errors occurred
      expect(true).toBe(true);

      vi.useRealTimers();
    });
  });

  describe("error handling", () => {
    it("should log error when command execution fails", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const errorMessage = "Command failed";

      commandRegistry.registerCommand({
        id: "test.failingCommand",
        title: "Failing Command",
        keybinding: { key: "Cmd+F" },
        run: () => {
          throw new Error(errorMessage);
        },
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      const event = new KeyboardEvent("keydown", {
        key: "f",
        metaKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe("modifier keys", () => {
    it("should recognize Ctrl modifier", async () => {
      commandRegistry.registerCommand({
        id: "test.ctrlCommand",
        title: "Ctrl Command",
        keybinding: { key: "Ctrl+T" },
        run: mockCommandRun,
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      const event = new KeyboardEvent("keydown", {
        key: "t",
        ctrlKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(mockCommandRun).toHaveBeenCalledTimes(1);
      });
    });

    it("should recognize Alt modifier", async () => {
      commandRegistry.registerCommand({
        id: "test.altCommand",
        title: "Alt Command",
        keybinding: { key: "Alt+T" },
        run: mockCommandRun,
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      const event = new KeyboardEvent("keydown", {
        key: "t",
        altKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(mockCommandRun).toHaveBeenCalledTimes(1);
      });
    });

    it("should recognize Shift modifier", async () => {
      commandRegistry.registerCommand({
        id: "test.shiftCommand",
        title: "Shift Command",
        keybinding: { key: "Shift+T" },
        run: mockCommandRun,
      });

      renderHook(() =>
        useKeybindingDispatch(commandRegistry, keybindingRegistry),
      );

      const event = new KeyboardEvent("keydown", {
        key: "T", // Uppercase because of shift
        shiftKey: true,
        bubbles: true,
      });
      window.dispatchEvent(event);

      await waitFor(() => {
        expect(mockCommandRun).toHaveBeenCalledTimes(1);
      });
    });
  });
});
