import { describe, it, expect, beforeEach } from "vitest";
import { KeybindingRegistry } from "@/commands/keybindings/KeybindingRegistry";
import type { KeybindingDescriptor } from "@/commands/keybindings/types";

describe("KeybindingRegistry", () => {
  let registry: KeybindingRegistry;

  beforeEach(() => {
    registry = new KeybindingRegistry();
  });

  describe("register()", () => {
    it("should register a keybinding", () => {
      const descriptor: KeybindingDescriptor = {
        key: "Ctrl+T",
      };

      registry.register("test.command", descriptor);

      const keybindings = registry.getKeybindingsForCommand("test.command");
      expect(keybindings).toHaveLength(1);
      expect(keybindings[0].commandId).toBe("test.command");
    });

    it("should register multiple keybindings for same command", () => {
      registry.register("test.command", { key: "Ctrl+T" });
      registry.register("test.command", { key: "Cmd+T" });

      const keybindings = registry.getKeybindingsForCommand("test.command");
      expect(keybindings).toHaveLength(2);
    });

    it("should register keybinding with weight", () => {
      registry.register("test.command", { key: "Ctrl+T" }, 10);

      const keybindings = registry.getKeybindingsForCommand("test.command");
      expect(keybindings[0].weight).toBe(10);
    });

    it("should default weight to 0", () => {
      registry.register("test.command", { key: "Ctrl+T" });

      const keybindings = registry.getKeybindingsForCommand("test.command");
      expect(keybindings[0].weight).toBe(0);
    });

    it("should parse multi-chord keybindings", () => {
      registry.register("test.command", { key: "Cmd+K Cmd+W" });

      const keybindings = registry.getKeybindingsForCommand("test.command");
      expect(keybindings[0].chords).toHaveLength(2);
    });
  });

  describe("findCommand()", () => {
    it("should find command for matching event", () => {
      registry.register("test.command", { key: "Ctrl+T" });

      const event = new KeyboardEvent("keydown", {
        key: "t",
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      });

      const commandId = registry.findCommand(event);
      expect(commandId).toBe("test.command");
    });

    it("should return undefined for non-matching event", () => {
      registry.register("test.command", { key: "Ctrl+T" });

      const event = new KeyboardEvent("keydown", {
        key: "a",
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      });

      const commandId = registry.findCommand(event);
      expect(commandId).toBeUndefined();
    });

    it("should find command for first chord of multi-chord binding", () => {
      registry.register("test.command", { key: "Cmd+K Cmd+W" });

      const event = new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
      });

      const commandId = registry.findCommand(event);
      expect(commandId).toBe("test.command");
    });

    it("should find command for second chord of multi-chord binding", () => {
      registry.register("test.command", { key: "Cmd+K Cmd+W" });

      const start = new KeyboardEvent("keydown", { key: "k", metaKey: true });
      const event = new KeyboardEvent("keydown", {
        key: "w",
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
      });

      const commandId = registry.findCommand(event, start);
      expect(commandId).toBe("test.command");
    });
  });

  it("runs a chord's second key only for chords that start with its first key", () => {
    registry.register("workspace.save", { key: "Cmd+K Cmd+S" });
    registry.register("user.command", { key: "Cmd+J Cmd+S" }, 1000);

    const cmd = (key: string) =>
      new KeyboardEvent("keydown", { key, metaKey: true });

    expect(registry.findCommand(cmd("s"), cmd("k"))).toBe("workspace.save");
    expect(registry.findCommand(cmd("s"), cmd("j"))).toBe("user.command");
  });

  describe("hasChordContinuation()", () => {
    it("should return true when multi-chord binding exists", () => {
      registry.register("test.command", { key: "Cmd+K Cmd+W" });

      const event = new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
      });

      expect(registry.hasChordContinuation(event, 0)).toBe(true);
    });

    it("should return false when no continuation exists", () => {
      registry.register("test.command", { key: "Cmd+K" });

      const event = new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
      });

      expect(registry.hasChordContinuation(event, 0)).toBe(false);
    });

    it("should return false for second chord", () => {
      registry.register("test.command", { key: "Cmd+K Cmd+W" });

      const event = new KeyboardEvent("keydown", {
        key: "w",
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: true,
      });

      expect(registry.hasChordContinuation(event, 1)).toBe(false);
    });
  });

  describe("weight-based priority", () => {
    it("should prioritize higher weight keybindings", () => {
      registry.register("command1", { key: "Ctrl+T" }, 0);
      registry.register("command2", { key: "Ctrl+T" }, 10);

      const event = new KeyboardEvent("keydown", {
        key: "t",
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      });

      const commandId = registry.findCommand(event);
      expect(commandId).toBe("command2");
    });

    it("should return first match when weights are equal", () => {
      registry.register("command1", { key: "Ctrl+T" }, 0);
      registry.register("command2", { key: "Ctrl+T" }, 0);

      const event = new KeyboardEvent("keydown", {
        key: "t",
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      });

      const commandId = registry.findCommand(event);
      expect(commandId).toBe("command1");
    });
  });

  describe("getFirstChords()", () => {
    const firstChords = () =>
      registry
        .getFirstChords()
        .map(({ chord, binding, startsChord }) => [
          chord.key,
          binding.commandId,
          startsChord,
        ]);

    it("lists each first key once, with the keybinding findCommand runs for it", () => {
      registry.register("tab.new", { key: "Cmd+T" });
      registry.register("terminal.new", { key: "Cmd+T" }, 10);
      registry.register("user.command", { key: "Cmd+T" }, 10);
      registry.register("pane.split", { key: "Cmd+Shift+B+Left" });
      registry.register("pane.left", { key: "Cmd+Left" });

      expect(firstChords()).toEqual([
        ["t", "terminal.new", false],
        ["left", "pane.split", false],
        ["left", "pane.left", false],
      ]);
    });

    it("says which first keys start a chord", () => {
      registry.register("workspace.save", { key: "Cmd+K Cmd+S" });
      registry.register("terminal.clear", { key: "Cmd+K" }, 10);
      registry.register("workspace.open", { key: "Cmd+K Cmd+O" });
      registry.register("tab.new", { key: "Cmd+T" });

      expect(firstChords()).toEqual([
        ["k", "terminal.clear", true],
        ["t", "tab.new", false],
      ]);
    });
  });

  describe("getKeybindingsForCommand()", () => {
    it("should return all keybindings for a command", () => {
      registry.register("test.command", { key: "Ctrl+T" });
      registry.register("test.command", { key: "Cmd+T" });
      registry.register("other.command", { key: "Ctrl+P" });

      const keybindings = registry.getKeybindingsForCommand("test.command");
      expect(keybindings).toHaveLength(2);
      expect(keybindings.every((kb) => kb.commandId === "test.command")).toBe(
        true,
      );
    });

    it("should return empty array for non-existent command", () => {
      const keybindings = registry.getKeybindingsForCommand("non.existent");
      expect(keybindings).toHaveLength(0);
    });
  });

  describe("unregister()", () => {
    it("should remove all keybindings for a command", () => {
      registry.register("command1", { key: "Ctrl+T" });
      registry.register("command1", { key: "Cmd+T" });
      registry.register("command2", { key: "Ctrl+P" });

      expect(registry.getKeybindingsForCommand("command1")).toHaveLength(2);

      registry.unregister("command1");

      expect(registry.getKeybindingsForCommand("command1")).toHaveLength(0);
      expect(registry.getKeybindingsForCommand("command2")).toHaveLength(1);
    });

    it("should not affect other commands", () => {
      registry.register("command1", { key: "Ctrl+T" });
      registry.register("command2", { key: "Ctrl+P" });
      registry.register("command3", { key: "Ctrl+O" });

      registry.unregister("command2");

      expect(registry.getKeybindingsForCommand("command1")).toHaveLength(1);
      expect(registry.getKeybindingsForCommand("command2")).toHaveLength(0);
      expect(registry.getKeybindingsForCommand("command3")).toHaveLength(1);
    });

    it("should handle unregistering non-existent command", () => {
      registry.register("command1", { key: "Ctrl+T" });

      registry.unregister("nonexistent.command");

      expect(registry.getKeybindingsForCommand("command1")).toHaveLength(1);
    });

    it("should remove keybinding from findCommand results", () => {
      registry.register("command1", { key: "Ctrl+T" });

      const event = new KeyboardEvent("keydown", {
        key: "t",
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      });

      expect(registry.findCommand(event)).toBe("command1");

      registry.unregister("command1");

      expect(registry.findCommand(event)).toBeUndefined();
    });
  });

  describe("clear()", () => {
    it("should clear all keybindings", () => {
      registry.register("command1", { key: "Ctrl+T" });
      registry.register("command2", { key: "Ctrl+P" });

      registry.clear();

      const event = new KeyboardEvent("keydown", {
        key: "t",
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      });

      expect(registry.findCommand(event)).toBeUndefined();
      expect(registry.getKeybindingsForCommand("command1")).toHaveLength(0);
    });
  });

  describe("integration tests", () => {
    it("should handle multiple commands with different keybindings", () => {
      registry.register("terminal.clear", { key: "Cmd+K" });
      registry.register("editor.save", { key: "Cmd+S" });
      registry.register("tab.close", { key: "Cmd+W" });

      const event1 = new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      });

      const event2 = new KeyboardEvent("keydown", {
        key: "s",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      });

      expect(registry.findCommand(event1)).toBe("terminal.clear");
      expect(registry.findCommand(event2)).toBe("editor.save");
    });

    it("should handle chord sequence correctly", () => {
      registry.register("close.pane", { key: "Cmd+K Cmd+W" });

      // First chord
      const event1 = new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      });

      expect(registry.hasChordContinuation(event1, 0)).toBe(true);
      expect(registry.findCommand(event1)).toBe("close.pane");

      // Second chord
      const event2 = new KeyboardEvent("keydown", {
        key: "w",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      });

      expect(registry.hasChordContinuation(event2, 1)).toBe(false);
      expect(registry.findCommand(event2, event1)).toBe("close.pane");
    });
  });
});
